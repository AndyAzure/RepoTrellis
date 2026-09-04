import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordRepositoryFeedback, listRepositoryFeedback } from "./feedback-library";

describe("feedback library", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
    sqlite
      .prepare(
        `insert into repositories (
          github_id, full_name, owner, name, url, stars, forks, is_archived
        ) values (101, 'acme/tool', 'acme', 'tool', 'https://github.com/acme/tool', 1, 0, 0)`,
      )
      .run();
  });

  afterEach(() => sqlite.close());

  it("records feedback with a trimmed optional reason", () => {
    const event = recordRepositoryFeedback(sqlite, 1, {
      action: "try",
      reason: "  run the example first  ",
    });

    expect(event).toMatchObject({
      repositoryId: 1,
      action: "try",
      reason: "run the example first",
      source: "library",
    });
    expect(listRepositoryFeedback(sqlite, 1)).toHaveLength(1);
  });

  it("returns null for an unknown repository", () => {
    expect(
      recordRepositoryFeedback(sqlite, 999, { action: "block", reason: null }),
    ).toBeNull();
  });

  it("keeps multiple events in reverse chronological order", () => {
    recordRepositoryFeedback(sqlite, 1, { action: "keep", reason: null });
    recordRepositoryFeedback(sqlite, 1, { action: "dismiss", reason: null });

    expect(listRepositoryFeedback(sqlite, 1).map((event) => event.action)).toEqual([
      "dismiss",
      "keep",
    ]);
  });
});
