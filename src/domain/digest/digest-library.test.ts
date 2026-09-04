import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildDigestPreview,
  listDigestSnapshots,
  saveDigestSnapshot,
  updateDigestItemDecision,
} from "./digest-library";

describe("digest library", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
    insertRepository(sqlite, 101, "acme/fresh", "Fresh local TypeScript tool", "2026-09-03T00:00:00Z");
    insertRepository(sqlite, 102, "acme/old", "Old archived tool", "2024-01-01T00:00:00Z", true);
    sqlite
      .prepare(
        `insert into interests (name, positive_rules, negative_rules, is_active)
         values ('本地工具', '["local", "TypeScript"]', '[]', 1)`,
      )
      .run();
  });

  afterEach(() => sqlite.close());

  it("sorts a preview by the local recommendation score", () => {
    const preview = buildDigestPreview(sqlite, {
      now: new Date("2026-09-04T00:00:00Z"),
    });

    expect(preview.items).toHaveLength(2);
    expect(preview.items[0]?.repository.fullName).toBe("acme/fresh");
    expect(preview.items[0]?.selected).toBe(true);
    expect(preview.periodStart).toBe("2026-08-29");
    expect(preview.periodEnd).toBe("2026-09-04");
  });

  it("saves only selected items and keeps each confirmation as history", () => {
    const preview = buildDigestPreview(sqlite, { now: new Date("2026-09-04T00:00:00Z") });
    const selectedId = preview.items[0]?.repositoryId;
    expect(selectedId).toBeDefined();

    const first = saveDigestSnapshot(sqlite, {
      repositoryIds: [selectedId!],
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const second = saveDigestSnapshot(sqlite, {
      repositoryIds: [preview.items[1]!.repositoryId],
      now: new Date("2026-09-04T00:00:00Z"),
    });

    if (first.status !== "saved" || second.status !== "saved") {
      throw new Error("Expected digest snapshots to be saved.");
    }
    expect(first.status).toBe("saved");
    expect(first.digest.items).toHaveLength(1);
    expect(first.digest.items[0]?.score).toBe(preview.items[0]?.score);
    expect(first.digest.items[0]?.reasons).toEqual(preview.items[0]?.reasons);
    expect(second.status).toBe("saved");
    expect(sqlite.prepare("select count(*) as count from digests").get()).toEqual({ count: 2 });
  });

  it("rejects an empty selection without creating a digest", () => {
    const result = saveDigestSnapshot(sqlite, {
      repositoryIds: [],
      now: new Date("2026-09-04T00:00:00Z"),
    });

    expect(result).toEqual({ status: "empty", digest: null });
    expect(sqlite.prepare("select count(*) as count from digests").get()).toEqual({ count: 0 });
  });

  it("lists saved snapshots newest first without recomputing their scores", () => {
    const preview = buildDigestPreview(sqlite, { now: new Date("2026-09-04T00:00:00Z") });
    const first = saveDigestSnapshot(sqlite, {
      repositoryIds: [preview.items[0]!.repositoryId],
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const second = saveDigestSnapshot(sqlite, {
      repositoryIds: [preview.items[1]!.repositoryId],
      now: new Date("2026-09-04T00:00:00Z"),
    });

    if (first.status !== "saved" || second.status !== "saved") {
      throw new Error("Expected digest snapshots to be saved.");
    }
    const history = listDigestSnapshots(sqlite, { limit: 1 });
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe(second.digest.id);
    expect(history[0]?.items[0]?.repository.fullName).toBe("acme/old");
    expect(history[0]?.items[0]?.score).toBe(second.digest.items[0]?.score);
    expect(history[0]?.items[0]?.reasons).toEqual(second.digest.items[0]?.reasons);
  });

  it("updates a snapshot item decision without changing its evidence", () => {
    const preview = buildDigestPreview(sqlite, { now: new Date("2026-09-04T00:00:00Z") });
    const saved = saveDigestSnapshot(sqlite, {
      repositoryIds: [preview.items[0]!.repositoryId],
      now: new Date("2026-09-04T00:00:00Z"),
    });
    if (saved.status !== "saved") throw new Error("Expected a digest snapshot.");
    const item = saved.digest.items[0]!;

    const dismissed = updateDigestItemDecision(
      sqlite,
      saved.digest.id,
      item.id,
      "dismissed",
    );
    expect(dismissed?.items[0]).toMatchObject({
      id: item.id,
      decision: "dismissed",
      score: item.score,
      reasons: item.reasons,
      position: item.position,
    });

    expect(
      updateDigestItemDecision(sqlite, saved.digest.id + 1, item.id, "kept"),
    ).toBeNull();
  });

  it("filters snapshots by any matching decision and intersecting period", () => {
    const preview = buildDigestPreview(sqlite, { now: new Date("2026-09-04T00:00:00Z") });
    const first = saveDigestSnapshot(sqlite, {
      repositoryIds: preview.items.map((item) => item.repositoryId),
      now: new Date("2026-09-04T00:00:00Z"),
    });
    if (first.status !== "saved") throw new Error("Expected a digest snapshot.");
    sqlite.prepare("update digests set period_start = '2026-08-29', period_end = '2026-09-04' where id = ?").run(first.digest.id);
    updateDigestItemDecision(sqlite, first.digest.id, first.digest.items[0]!.id, "kept");
    updateDigestItemDecision(sqlite, first.digest.id, first.digest.items[1]!.id, "dismissed");

    const second = saveDigestSnapshot(sqlite, {
      repositoryIds: [preview.items[0]!.repositoryId],
      now: new Date("2026-09-04T00:00:00Z"),
    });
    if (second.status !== "saved") throw new Error("Expected a second digest snapshot.");
    sqlite.prepare("update digests set period_start = '2026-09-10', period_end = '2026-09-16' where id = ?").run(second.digest.id);

    expect(listDigestSnapshots(sqlite, { decision: "kept" }).map((digest) => digest.id)).toEqual([first.digest.id]);
    expect(listDigestSnapshots(sqlite, { decision: "dismissed" }).map((digest) => digest.id)).toEqual([first.digest.id]);
    expect(listDigestSnapshots(sqlite, { decision: "pending" }).map((digest) => digest.id)).toEqual([second.digest.id]);
    expect(listDigestSnapshots(sqlite, { periodFrom: "2026-09-01", periodTo: "2026-09-05" }).map((digest) => digest.id)).toEqual([first.digest.id]);
    expect(listDigestSnapshots(sqlite, { periodFrom: "2026-09-05", periodTo: "2026-09-09" })).toEqual([]);
  });
});

function insertRepository(
  sqlite: Database.Database,
  githubId: number,
  fullName: string,
  description: string,
  updatedAt: string,
  archived = false,
): void {
  const [owner, name] = fullName.split("/");
  sqlite
    .prepare(
      `insert into repositories (
        github_id, full_name, owner, name, url, description, default_branch,
        language, stars, forks, license, is_archived, remote_updated_at
      ) values (?, ?, ?, ?, ?, ?, 'main', 'TypeScript', ?, ?, 'MIT', ?, ?)`,
    )
    .run(
      githubId,
      fullName,
      owner,
      name,
      `https://github.com/${fullName}`,
      description,
      archived ? 10 : 180,
      archived ? 1 : 20,
      archived ? 1 : 0,
      updatedAt,
    );
}
