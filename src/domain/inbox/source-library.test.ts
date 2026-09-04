import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ingestManualSource, ingestRssFeed, markRssFeedFailure } from "../../ingest";

import {
  getSourceItem,
  listRssFeeds,
  listSourceItems,
  updateSourceReview,
} from "./source-library";

describe("source inbox", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("lists extracted references and allows human review", () => {
    const result = ingestManualSource(sqlite, {
      url: "https://notes.example.com/one",
      title: "A note about acme/repotrellis",
    });

    expect(listSourceItems(sqlite)).toMatchObject([
      {
        id: result.sourceItemId,
        kind: "manual",
        processingStatus: "ready",
        reviewStatus: "pending",
        extractedGithubRefs: ["https://github.com/acme/repotrellis"],
      },
    ]);

    const reviewed = updateSourceReview(
      sqlite,
      result.sourceItemId,
      "accepted",
    );
    expect(reviewed?.reviewStatus).toBe("accepted");
    expect(getSourceItem(sqlite, result.sourceItemId)?.reviewStatus).toBe(
      "accepted",
    );
    expect(updateSourceReview(sqlite, 999, "rejected")).toBeNull();
  });

  it("lists RSS feed health separately from source item review", () => {
    ingestRssFeed(sqlite, {
      url: "https://notes.example.com/feed.xml",
      title: "Engineering Notes",
      description: null,
      notModified: false,
      etag: null,
      lastModified: null,
      items: [],
    });
    markRssFeedFailure(sqlite, {
      url: "https://notes.example.com/feed.xml",
      error: "RSS feed returned an error response.",
    });

    expect(listRssFeeds(sqlite)).toMatchObject([
      {
        url: "https://notes.example.com/feed.xml",
        title: "Engineering Notes",
        status: "error",
        lastError: "RSS feed returned an error response.",
      },
    ]);
  });
});
