import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getRepository,
  searchRepositories,
  updateRepositoryMeta,
} from "./repository-library";

describe("repository library", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });

    const insert = sqlite.prepare(
      `insert into repositories (
        github_id, full_name, owner, name, url, description, language,
        stars, remote_updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    insert.run(
      101,
      "acme/repotrellis",
      "acme",
      "repotrellis",
      "https://github.com/acme/repotrellis",
      "A local-first repository intelligence workbench",
      "TypeScript",
      120,
      "2026-09-03T12:00:00Z",
    );
    insert.run(
      102,
      "acme/sqlite-notes",
      "acme",
      "sqlite-notes",
      "https://github.com/acme/sqlite-notes",
      "Tiny database field notes",
      "Rust",
      42,
      "2026-09-02T12:00:00Z",
    );
  });

  afterEach(() => {
    sqlite.close();
  });

  it("searches FTS content and neutralizes query syntax", () => {
    const matches = searchRepositories(sqlite, {
      query: '"repository"*',
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.fullName).toBe("acme/repotrellis");
  });

  it("filters by status and source", () => {
    const repository = searchRepositories(sqlite)[0];
    expect(repository).toBeDefined();

    const source = sqlite
      .prepare(
        `insert into source_items (kind, url, title)
         values ('github', ?, ?) returning id`,
      )
      .get("https://github.com/acme/repotrellis", "acme/repotrellis") as {
      id: number;
    };
    sqlite
      .prepare(
        `insert into repo_mentions (source_item_id, repository_id)
         values (?, ?)`,
      )
      .run(source.id, repository!.id);
    updateRepositoryMeta(sqlite, repository!.id, { status: "adopted" });

    expect(
      searchRepositories(sqlite, { status: "adopted", source: "github" }),
    ).toHaveLength(1);
    expect(
      searchRepositories(sqlite, { status: "trying", source: "github" }),
    ).toHaveLength(0);
  });

  it("upserts normalized editable metadata", () => {
    const repository = searchRepositories(sqlite)[0];

    const updated = updateRepositoryMeta(sqlite, repository!.id, {
      status: "trying",
      tags: [" local-first ", "sqlite", "sqlite", ""],
      note: "Evaluate the sync model.",
      priority: 3,
      nextAction: "Build a small spike",
    });

    expect(updated).toMatchObject({
      status: "trying",
      tags: ["local-first", "sqlite"],
      note: "Evaluate the sync model.",
      priority: 3,
      nextAction: "Build a small spike",
    });
    expect(getRepository(sqlite, 999)).toBeNull();
  });
});
