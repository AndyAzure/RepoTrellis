import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GithubRepository } from "../connectors/github";
import { searchRepositories } from "../domain";

import { ingestGithubStars } from "./github-stars";

const repository: GithubRepository = {
  githubId: 101,
  fullName: "acme/repotrellis",
  owner: "acme",
  name: "repotrellis",
  url: "https://github.com/acme/repotrellis",
  description: "Repository intelligence",
  defaultBranch: "main",
  language: "TypeScript",
  stars: 120,
  forks: 8,
  license: "MIT",
  isArchived: false,
  remoteUpdatedAt: "2026-09-03T12:00:00Z",
};

describe("GitHub Stars ingestion", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("persists repositories, editable metadata, provenance, and FTS content", () => {
    const result = ingestGithubStars(sqlite, "fangyueyu", [repository]);

    expect(result).toMatchObject({ received: 1, created: 1, updated: 0 });
    expect(
      sqlite.prepare("select count(*) as count from source_items").get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare(
          "select processing_status as processingStatus, review_status as reviewStatus from source_items",
        )
        .get(),
    ).toEqual({ processingStatus: "ready", reviewStatus: "accepted" });
    expect(
      sqlite.prepare("select count(*) as count from repo_mentions").get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite.prepare("select count(*) as count from user_repository_meta").get(),
    ).toEqual({ count: 1 });

    const matches = searchRepositories(sqlite, {
      query: "intelligence",
      source: "github",
    });
    expect(matches[0]).toMatchObject({
      fullName: "acme/repotrellis",
      sources: ["github"],
      status: "candidate",
    });
  });

  it("updates a previously imported repository without duplicating evidence", () => {
    ingestGithubStars(sqlite, "fangyueyu", [repository]);
    const result = ingestGithubStars(sqlite, "fangyueyu", [
      {
        ...repository,
        description: "A searchable personal repository library",
        stars: 140,
      },
    ]);

    expect(result).toMatchObject({ received: 1, created: 0, updated: 1 });
    expect(
      sqlite.prepare("select count(*) as count from repositories").get(),
    ).toEqual({ count: 1 });
    expect(
      sqlite.prepare("select count(*) as count from repo_mentions").get(),
    ).toEqual({ count: 1 });
    expect(searchRepositories(sqlite, { query: "searchable" })[0]).toMatchObject(
      {
        stars: 140,
        description: "A searchable personal repository library",
      },
    );
    expect(searchRepositories(sqlite, { query: "intelligence" })).toEqual([]);
  });
});
