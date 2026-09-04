import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

describe("SQLite schema", () => {
  it("applies migrations and creates the core tables", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);

    migrate(db, { migrationsFolder: "./drizzle" });

    const tables = sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
      )
      .all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "__drizzle_migrations",
        "digest_items",
        "digests",
        "feedback_events",
        "interests",
        "repo_mentions",
        "repositories",
        "repositories_fts",
        "rss_feeds",
        "source_items",
        "user_repository_meta",
      ]),
    );

    const ftsTable = sqlite
      .prepare(
        "select sql from sqlite_master where type = 'table' and name = 'repositories_fts'",
      )
      .get() as { sql: string };

    expect(ftsTable.sql).toContain("VIRTUAL TABLE");

    sqlite.close();
  });

  it("keeps the repository search index in sync", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);

    migrate(db, { migrationsFolder: "./drizzle" });

    sqlite
      .prepare(
        `insert into repositories (
          github_id, full_name, owner, name, url, description, language
        ) values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        1,
        "acme/trellis",
        "acme",
        "trellis",
        "https://github.com/acme/trellis",
        "Local-first repository intelligence",
        "TypeScript",
      );

    const inserted = sqlite
      .prepare(
        "select rowid from repositories_fts where repositories_fts match ?",
      )
      .all('"intelligence"*');
    expect(inserted).toHaveLength(1);

    sqlite
      .prepare("update repositories set description = ? where github_id = ?")
      .run("Personal knowledge graph", 1);

    const oldMatch = sqlite
      .prepare(
        "select rowid from repositories_fts where repositories_fts match ?",
      )
      .all('"intelligence"*');
    const newMatch = sqlite
      .prepare(
        "select rowid from repositories_fts where repositories_fts match ?",
      )
      .all('"knowledge"*');
    expect(oldMatch).toHaveLength(0);
    expect(newMatch).toHaveLength(1);

    sqlite.prepare("delete from repositories where github_id = ?").run(1);

    const deleted = sqlite
      .prepare(
        "select rowid from repositories_fts where repositories_fts match ?",
      )
      .all('"knowledge"*');
    expect(deleted).toHaveLength(0);

    sqlite.close();
  });
});
