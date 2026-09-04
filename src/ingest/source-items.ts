import type Database from "better-sqlite3";

import type { RssFeedResult } from "../connectors/rss";
import { extractGithubRefs } from "../connectors/rss";

export interface ManualSourceInput {
  url: string;
  title?: string | null;
  excerpt?: string | null;
}

export interface SourceIngestResult {
  sourceItemId: number;
  created: boolean;
  extractedGithubRefs: string[];
}

export interface RssIngestResult {
  feedId: number;
  received: number;
  created: number;
  updated: number;
  extractedGithubRefs: number;
  notModified: false;
}

export interface RssFeedMetadata {
  id: number;
  url: string;
  etag: string | null;
  lastModified: string | null;
}

export function markRssFeedFailure(
  sqlite: Database.Database,
  input: { url: string; error: string },
): void {
  sqlite
    .prepare(
      `insert into rss_feeds (url, status, last_error)
       values (?, 'error', ?)
       on conflict(url) do update set
         status = 'error',
         last_error = excluded.last_error,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(input.url, input.error);
}

export interface RssNotModifiedResult {
  feedId: number;
  received: 0;
  created: 0;
  updated: 0;
  extractedGithubRefs: 0;
  notModified: true;
}

export function getRssFeedMetadata(
  sqlite: Database.Database,
  url: string,
): RssFeedMetadata | null {
  const row = sqlite
    .prepare<[string], RssFeedMetadata | undefined>(
      `select id, url, etag, last_modified as lastModified
       from rss_feeds where url = ?`,
    )
    .get(url);
  return row ?? null;
}

export function markRssFeedNotModified(
  sqlite: Database.Database,
  input: { url: string; etag?: string | null; lastModified?: string | null },
): RssNotModifiedResult {
  const update = sqlite.transaction(() => {
    sqlite
      .prepare(
        `insert into rss_feeds (url, last_fetched_at, status, last_error, etag, last_modified)
         values (?, CURRENT_TIMESTAMP, 'active', null, ?, ?)
         on conflict(url) do update set
           last_fetched_at = CURRENT_TIMESTAMP,
           status = 'active',
           last_error = null,
           etag = coalesce(excluded.etag, rss_feeds.etag),
           last_modified = coalesce(excluded.last_modified, rss_feeds.last_modified),
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run(input.url, input.etag ?? null, input.lastModified ?? null);
    const feed = getRssFeedMetadata(sqlite, input.url);
    if (!feed) throw new Error("Failed to persist the RSS feed status.");
    return feed.id;
  });

  return {
    feedId: update.immediate(),
    received: 0,
    created: 0,
    updated: 0,
    extractedGithubRefs: 0,
    notModified: true,
  };
}

export function ingestManualSource(
  sqlite: Database.Database,
  input: ManualSourceInput,
): SourceIngestResult {
  const url = normalizeSourceUrl(input.url);
  if (!url) {
    throw new Error("Source URL must use http or https.");
  }

  const title = cleanValue(input.title, 300) ?? url;
  const excerpt = cleanValue(input.excerpt, 2_000);
  const extractedGithubRefs = extractGithubRefs(
    [url, title, excerpt].filter(Boolean).join("\n"),
  );
  const existing = sqlite
    .prepare<[string], ExistingSourceRow | undefined>(
      "select id from source_items where url = ?",
    )
    .get(url);

  upsertSource(sqlite, {
    kind: "manual",
    url,
    title,
    excerpt,
    publishedAt: null,
    extractedGithubRefs,
  });

  const sourceItem = sqlite
    .prepare<[string], { id: number }>(
      "select id from source_items where url = ?",
    )
    .get(url);

  if (!sourceItem) {
    throw new Error("Failed to persist the source item.");
  }

  return {
    sourceItemId: sourceItem.id,
    created: !existing,
    extractedGithubRefs,
  };
}

export function ingestRssFeed(
  sqlite: Database.Database,
  feed: RssFeedResult,
): RssIngestResult {
  const ingest = sqlite.transaction(() => {
    sqlite
      .prepare(
        `insert into rss_feeds (
           url, title, etag, last_modified, last_fetched_at, status, last_error
         ) values (?, ?, ?, ?, CURRENT_TIMESTAMP, 'active', null)
         on conflict(url) do update set
           title = excluded.title,
           last_fetched_at = CURRENT_TIMESTAMP,
           status = 'active',
           last_error = null,
           etag = coalesce(excluded.etag, rss_feeds.etag),
           last_modified = coalesce(excluded.last_modified, rss_feeds.last_modified),
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run(feed.url, feed.title, feed.etag, feed.lastModified);

    const feedRow = sqlite
      .prepare<[string], { id: number }>("select id from rss_feeds where url = ?")
      .get(feed.url);
    if (!feedRow) {
      throw new Error("Failed to persist the RSS feed.");
    }

    let created = 0;
    let updated = 0;
    let extractedGithubRefs = 0;

    for (const item of feed.items) {
      const existing = sqlite
        .prepare<[string], ExistingSourceRow | undefined>(
          "select id, title, excerpt, published_at as publishedAt, extracted_github_refs as extractedGithubRefs from source_items where url = ?",
        )
        .get(item.url);
      upsertSource(sqlite, {
        kind: "rss",
        url: item.url,
        title: item.title,
        excerpt: item.excerpt,
        publishedAt: item.publishedAt,
        extractedGithubRefs: item.githubRefs,
      });
      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
      extractedGithubRefs += item.githubRefs.length;
    }

    return {
      feedId: feedRow.id,
      received: feed.items.length,
      created,
      updated,
      extractedGithubRefs,
      notModified: false as const,
    };
  });

  return ingest.immediate();
}

export function normalizeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function cleanValue(value: string | null | undefined, maximumLength: number) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

interface ExistingSourceRow {
  id: number;
  title?: string | null;
  excerpt?: string | null;
  publishedAt?: string | null;
  extractedGithubRefs?: string;
}

interface SourceContentInput {
  kind: "manual" | "rss";
  url: string;
  title: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  extractedGithubRefs: string[];
}

function upsertSource(sqlite: Database.Database, input: SourceContentInput): void {
  const existing = sqlite
    .prepare<[string], ExistingSourceRow | undefined>(
      "select id, title, excerpt, published_at as publishedAt, extracted_github_refs as extractedGithubRefs from source_items where url = ?",
    )
    .get(input.url);
  const refsJson = JSON.stringify(input.extractedGithubRefs);
  if (!existing) {
    sqlite
      .prepare(
        `insert into source_items (
          kind, url, title, excerpt, published_at, processing_status,
          review_status, extracted_github_refs
        ) values (?, ?, ?, ?, ?, 'ready', 'pending', ?)`,
      )
      .run(input.kind, input.url, input.title, input.excerpt, input.publishedAt, refsJson);
    return;
  }

  const changed =
    existing.title !== input.title ||
    existing.excerpt !== input.excerpt ||
    existing.publishedAt !== input.publishedAt ||
    existing.extractedGithubRefs !== refsJson;
  sqlite
    .prepare(
      `update source_items set
        kind = ?, title = ?, excerpt = ?, published_at = ?,
        processing_status = 'ready',
        review_status = case when ? then 'pending' else review_status end,
        resolved_at = case when ? then null else resolved_at end,
        resolution_token = case when ? then null else resolution_token end,
        resolution_started_at = case when ? then null else resolution_started_at end,
        next_retry_at = case when ? then null else next_retry_at end,
        last_error = null,
        extracted_github_refs = ?,
        updated_at = CURRENT_TIMESTAMP
       where id = ?`,
    )
    .run(
      input.kind,
      input.title,
      input.excerpt,
      input.publishedAt,
      changed ? 1 : 0,
      changed ? 1 : 0,
      changed ? 1 : 0,
      changed ? 1 : 0,
      changed ? 1 : 0,
      refsJson,
      existing.id,
    );
}
