import type Database from "better-sqlite3";

import {
  repositorySourceKinds,
  type RepositorySourceKind,
} from "../repositories/repository";

export const sourceProcessingStatuses = [
  "pending",
  "processing",
  "ready",
  "failed",
] as const;

export const sourceReviewStatuses = ["pending", "accepted", "rejected"] as const;

export const rssFeedStatuses = ["active", "error", "paused"] as const;

export type SourceProcessingStatus = (typeof sourceProcessingStatuses)[number];
export type SourceReviewStatus = (typeof sourceReviewStatuses)[number];
export type RssFeedStatus = (typeof rssFeedStatuses)[number];

export interface SourceSearchFilters {
  kind?: RepositorySourceKind;
  reviewStatus?: SourceReviewStatus;
  processingStatus?: SourceProcessingStatus;
  limit?: number;
}

export interface SourceInboxItem {
  id: number;
  kind: RepositorySourceKind;
  url: string;
  title: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  processingStatus: SourceProcessingStatus;
  reviewStatus: SourceReviewStatus;
  parseAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  resolvedAt: string | null;
  resolutionStartedAt: string | null;
  linkedRepositoryCount: number;
  extractedGithubRefs: string[];
  discoveredAt: string;
  updatedAt: string;
}

export interface RssFeedSummary {
  id: number;
  url: string;
  title: string | null;
  lastFetchedAt: string | null;
  status: RssFeedStatus;
  lastError: string | null;
  updatedAt: string;
}

interface SourceItemRow extends Omit<SourceInboxItem, "extractedGithubRefs"> {
  extractedGithubRefs: string;
}

export function listSourceItems(
  sqlite: Database.Database,
  filters: SourceSearchFilters = {},
): SourceInboxItem[] {
  const clauses: string[] = [];
  const parameters: Array<string | number> = [];

  if (filters.kind) {
    clauses.push("kind = ?");
    parameters.push(filters.kind);
  }
  if (filters.reviewStatus) {
    clauses.push("review_status = ?");
    parameters.push(filters.reviewStatus);
  }
  if (filters.processingStatus) {
    clauses.push("processing_status = ?");
    parameters.push(filters.processingStatus);
  }

  const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
  const limit = clampInteger(filters.limit ?? 50, 1, 100);
  const rows = sqlite
    .prepare<Array<string | number>, SourceItemRow>(
      `select
        id,
        kind,
        url,
        title,
        excerpt,
        published_at as publishedAt,
        processing_status as processingStatus,
        review_status as reviewStatus,
        parse_attempts as parseAttempts,
        next_retry_at as nextRetryAt,
        last_error as lastError,
        resolved_at as resolvedAt,
        resolution_started_at as resolutionStartedAt,
        (select count(*) from repo_mentions where repo_mentions.source_item_id = source_items.id) as linkedRepositoryCount,
        extracted_github_refs as extractedGithubRefs,
        discovered_at as discoveredAt,
        updated_at as updatedAt
       from source_items${where}
       order by discovered_at desc, id desc
       limit ?`,
    )
    .all(...parameters, limit);

  return rows.map(mapSourceRow);
}

export function getSourceItem(
  sqlite: Database.Database,
  sourceItemId: number,
): SourceInboxItem | null {
  const row = sqlite
    .prepare<[number], SourceItemRow>(
      `select
        id,
        kind,
        url,
        title,
        excerpt,
        published_at as publishedAt,
        processing_status as processingStatus,
        review_status as reviewStatus,
        parse_attempts as parseAttempts,
        next_retry_at as nextRetryAt,
        last_error as lastError,
        resolved_at as resolvedAt,
        resolution_started_at as resolutionStartedAt,
        (select count(*) from repo_mentions where repo_mentions.source_item_id = source_items.id) as linkedRepositoryCount,
        extracted_github_refs as extractedGithubRefs,
        discovered_at as discoveredAt,
        updated_at as updatedAt
       from source_items where id = ?`,
    )
    .get(sourceItemId);

  return row ? mapSourceRow(row) : null;
}

export function listRssFeeds(
  sqlite: Database.Database,
  limit = 20,
): RssFeedSummary[] {
  const rows = sqlite
    .prepare<[number], RssFeedSummary>(
      `select
        id,
        url,
        title,
        last_fetched_at as lastFetchedAt,
        status,
        last_error as lastError,
        updated_at as updatedAt
       from rss_feeds
       order by updated_at desc, id desc
       limit ?`,
    )
    .all(clampInteger(limit, 1, 50));

  return rows;
}

export function listAllRssFeeds(sqlite: Database.Database): RssFeedSummary[] {
  return sqlite
    .prepare<[], RssFeedSummary>(
      `select
        id,
        url,
        title,
        last_fetched_at as lastFetchedAt,
        status,
        last_error as lastError,
        updated_at as updatedAt
       from rss_feeds
       order by updated_at desc, id desc`,
    )
    .all();
}

export function updateSourceReview(
  sqlite: Database.Database,
  sourceItemId: number,
  reviewStatus: SourceReviewStatus,
): SourceInboxItem | null {
  const existing = sqlite
    .prepare<[number], { reviewStatus: SourceReviewStatus } | undefined>(
      "select review_status as reviewStatus from source_items where id = ?",
    )
    .get(sourceItemId);
  if (!existing) return null;
  if (existing.reviewStatus === reviewStatus) return getSourceItem(sqlite, sourceItemId);

  const result = sqlite
    .prepare(
      `update source_items
       set review_status = ?,
           processing_status = 'ready',
           next_retry_at = null,
           last_error = null,
           resolved_at = null,
           resolution_token = null,
           resolution_started_at = null,
           updated_at = CURRENT_TIMESTAMP
       where id = ?`,
    )
    .run(reviewStatus, sourceItemId);

  return result.changes > 0 ? getSourceItem(sqlite, sourceItemId) : null;
}

export function updateSourceReviews(
  sqlite: Database.Database,
  sourceItemIds: number[],
  reviewStatus: SourceReviewStatus,
): SourceInboxItem[] {
  const ids = [...new Set(sourceItemIds)];
  if (ids.length === 0) return [];

  const update = sqlite.prepare(
    `update source_items
     set review_status = ?,
         processing_status = 'ready',
         next_retry_at = null,
         last_error = null,
         resolved_at = null,
         resolution_token = null,
         resolution_started_at = null,
         updated_at = CURRENT_TIMESTAMP
     where id = ?`,
  );
  const transaction = sqlite.transaction((values: number[]) => {
    values.forEach((id) => update.run(reviewStatus, id));
  });
  transaction(ids);

  return ids
    .map((id) => getSourceItem(sqlite, id))
    .filter((item): item is SourceInboxItem => item !== null);
}

function parseRefs(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((ref): ref is string => typeof ref === "string")
      : [];
  } catch {
    return [];
  }
}

function mapSourceRow(row: SourceItemRow): SourceInboxItem {
  return { ...row, extractedGithubRefs: parseRefs(row.extractedGithubRefs) };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}

export { repositorySourceKinds };
