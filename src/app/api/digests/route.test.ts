import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted<{ sqlite?: Database.Database }>(() => ({}));
vi.mock("@/db", () => ({
  get sqlite() {
    if (!database.sqlite) throw new Error("Test database is unavailable.");
    return database.sqlite;
  },
}));

import { GET } from "./route";

describe("digest history route", () => {
  beforeEach(() => {
    const sqlite = new Database(":memory:");
    database.sqlite = sqlite;
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
    sqlite.exec(`
      insert into repositories (id, github_id, full_name, owner, name, url)
      values (1, 101, 'acme/tool', 'acme', 'tool', 'https://github.com/acme/tool');
      insert into digests (id, period_start, period_end, config_snapshot, created_at)
      values (1, '2026-08-29', '2026-09-04', '{}', '2026-09-04 10:00:00');
      insert into digests (id, period_start, period_end, config_snapshot, created_at)
      values (2, '2026-09-10', '2026-09-16', '{}', '2026-09-16 10:00:00');
      insert into digest_items (id, digest_id, repository_id, score, reasons, position, decision)
      values (1, 1, 1, 80, '["kept reason"]', 1, 'kept');
      insert into digest_items (id, digest_id, repository_id, score, reasons, position, decision)
      values (2, 2, 1, 50, '["pending reason"]', 1, 'pending');
    `);
  });

  afterEach(() => {
    database.sqlite?.close();
    database.sqlite = undefined;
  });

  it("filters by decision and intersecting period while preserving newest-first order", async () => {
    const response = await GET(new Request("http://localhost/api/digests?limit=10&decision=kept&from=2026-09-01&to=2026-09-05"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((digest: { id: number }) => digest.id)).toEqual([1]);
  });

  it("keeps the default history query unchanged", async () => {
    const response = await GET(new Request("http://localhost/api/digests"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.map((digest: { id: number }) => digest.id)).toEqual([2, 1]);
  });

  it.each([
    "?decision=unknown",
    "?from=2026-1-01",
    "?to=not-a-date",
    "?from=2026-09-10&to=2026-09-01",
    "?limit=0",
    "?limit=21",
  ])("rejects invalid history filters: %s", async (query) => {
    expect((await GET(new Request(`http://localhost/api/digests${query}`))).status).toBe(400);
  });
});
