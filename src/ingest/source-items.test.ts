import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getRssFeedMetadata,
  ingestManualSource,
  ingestRssFeed,
  markRssFeedNotModified,
  markRssFeedFailure,
} from "./source-items";
import { updateSourceReview } from "../domain/inbox/source-library";

describe("source ingestion", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("normalizes manual URLs and stores extracted repository references", () => {
    const first = ingestManualSource(sqlite, {
      url: "https://notes.example.com/post#share",
      title: "A useful note about acme/repotrellis",
      excerpt: "Try https://github.com/acme/sqlite-notes.",
    });
    const second = ingestManualSource(sqlite, {
      url: "https://notes.example.com/post",
      title: "Updated note",
    });

    expect(first).toMatchObject({
      created: true,
      extractedGithubRefs: [
        "https://github.com/acme/repotrellis",
        "https://github.com/acme/sqlite-notes",
      ],
    });
    expect(second).toMatchObject({ created: false, sourceItemId: first.sourceItemId });
    expect(
      sqlite.prepare("select count(*) as count from source_items").get(),
    ).toEqual({ count: 1 });
  });

  it("upserts RSS entries and keeps feed metadata", () => {
    const feed = {
      url: "https://notes.example.com/feed.xml",
      title: "Engineering Notes",
      description: null,
      notModified: false as const,
      etag: '"feed-v1"',
      lastModified: "Wed, 03 Sep 2026 12:00:00 GMT",
      items: [
        {
          url: "https://notes.example.com/one",
          title: "One",
          excerpt: "acme/repotrellis",
          publishedAt: "2026-09-03T12:00:00.000Z",
          githubRefs: ["https://github.com/acme/repotrellis"],
        },
      ],
    };
    const first = ingestRssFeed(sqlite, feed);
    const second = ingestRssFeed(sqlite, feed);

    expect(first).toMatchObject({ received: 1, created: 1, updated: 0 });
    expect(second).toMatchObject({ received: 1, created: 0, updated: 1 });
    expect(
      sqlite.prepare("select count(*) as count from rss_feeds").get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite.prepare("select count(*) as count from source_items").get(),
    ).toEqual({ count: 1 });
    expect(getRssFeedMetadata(sqlite, feed.url)).toMatchObject({
      etag: '"feed-v1"',
      lastModified: "Wed, 03 Sep 2026 12:00:00 GMT",
    });
  });

  it("marks an unchanged RSS feed without touching its source items", () => {
    const feed = {
      url: "https://notes.example.com/unchanged.xml",
      title: "Engineering Notes",
      description: null,
      notModified: false as const,
      etag: '"feed-v1"',
      lastModified: "Wed, 03 Sep 2026 12:00:00 GMT",
      items: [],
    };
    ingestRssFeed(sqlite, feed);
    const before = sqlite
      .prepare("select count(*) as count from source_items")
      .get();

    const result = markRssFeedNotModified(sqlite, {
      url: feed.url,
      etag: '"feed-v2"',
      lastModified: "Thu, 04 Sep 2026 12:00:00 GMT",
    });

    expect(result).toMatchObject({
      notModified: true,
      received: 0,
      created: 0,
      updated: 0,
    });
    expect(
      sqlite.prepare("select count(*) as count from source_items").get(),
    ).toEqual(before);
    expect(getRssFeedMetadata(sqlite, feed.url)).toMatchObject({
      etag: '"feed-v2"',
      lastModified: "Thu, 04 Sep 2026 12:00:00 GMT",
    });
  });

  it("records RSS failures without losing the last successful sync", () => {
    const feed = {
      url: "https://notes.example.com/failure.xml",
      title: "Engineering Notes",
      description: null,
      notModified: false as const,
      etag: '"feed-v1"',
      lastModified: "Wed, 03 Sep 2026 12:00:00 GMT",
      items: [],
    };
    ingestRssFeed(sqlite, feed);

    markRssFeedFailure(sqlite, {
      url: feed.url,
      error: "RSS feed returned an error response.",
    });

    expect(
      sqlite
        .prepare(
          "select status, last_error as lastError, last_fetched_at as lastFetchedAt, etag from rss_feeds where url = ?",
        )
        .get(feed.url),
    ).toMatchObject({
      status: "error",
      lastError: "RSS feed returned an error response.",
      etag: '"feed-v1"',
    });
    expect(
      sqlite.prepare("select last_fetched_at as lastFetchedAt from rss_feeds where url = ?").get(feed.url),
    ).toMatchObject({ lastFetchedAt: expect.any(String) });
  });

  it("revokes accepted resolution when source content changes", () => {
    const source = ingestManualSource(sqlite, {
      url: "https://notes.example.com/review",
      title: "https://github.com/acme/repotrellis",
    });
    updateSourceReview(sqlite, source.sourceItemId, "accepted");
    sqlite
      .prepare(
        "update source_items set resolved_at = '2026-09-04T10:00:00.000Z', resolution_token = 'old' where id = ?",
      )
      .run(source.sourceItemId);

    ingestManualSource(sqlite, {
      url: "https://notes.example.com/review",
      title: "Updated source without the old reference",
    });

    expect(
      sqlite
        .prepare(
          "select review_status as reviewStatus, resolved_at as resolvedAt, resolution_token as resolutionToken from source_items where id = ?",
        )
        .get(source.sourceItemId),
    ).toEqual({ reviewStatus: "pending", resolvedAt: null, resolutionToken: null });
  });
});
