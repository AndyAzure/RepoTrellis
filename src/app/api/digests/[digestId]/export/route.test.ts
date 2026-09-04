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

function request(id = "1", query = "") {
  return GET(new Request(`http://localhost/api/digests/${id}/export${query}`), {
    params: Promise.resolve({ digestId: id }),
  });
}

describe("digest export route", () => {
  beforeEach(() => {
    const sqlite = new Database(":memory:");
    database.sqlite = sqlite;
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
    sqlite.exec(`
      insert into repositories (id, github_id, full_name, owner, name, url)
      values (1, 101, 'acme/tool', 'acme', 'tool', 'https://github.com/acme/tool');
      insert into user_repository_meta (repository_id, note, next_action)
      values (1, 'PRIVATE_NOTE', 'current next action');
      insert into digests (id, period_start, period_end, config_snapshot)
      values (1, '2026-08-29', '2026-09-04', '{"private":"PRIVATE_CONFIG"}');
      insert into digest_items (digest_id, repository_id, score, reasons, position, decision)
      values (1, 1, 42, '["frozen recommendation"]', 3, 'pending');
    `);
  });

  afterEach(() => {
    database.sqlite?.close();
    database.sqlite = undefined;
  });

  it("downloads the saved score as a private UTF-8 attachment without changing database state", async () => {
    const sqlite = database.sqlite!;
    sqlite.exec("insert into interests (name, positive_rules, negative_rules) values ('changed interests', '[]', '[\"tool\"]')");
    const tables = ["digests", "digest_items", "repositories", "user_repository_meta", "interests"];
    const before = tables.map((table) => sqlite.prepare(`select * from ${table}`).all());
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="repotrellis-digest-1-active.md"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const markdown = await response.text();
    expect(markdown).toContain("快照分数：42 / 100");
    expect(markdown).toContain("frozen recommendation");
    expect(markdown).toContain("## 3. acme/tool");
    expect(markdown).toContain("current next action");
    expect(markdown).not.toContain("PRIVATE_NOTE");
    expect(markdown).not.toContain("PRIVATE_CONFIG");
    expect(tables.map((table) => sqlite.prepare(`select * from ${table}`).all())).toEqual(before);
  });

  it("uses current saved decisions to distinguish default and full exports", async () => {
    database.sqlite!.exec("update digest_items set decision = 'dismissed'");
    expect(await (await request()).text()).toContain("此范围内没有项目。");
    expect(await (await request("1", "?scope=all")).text()).toContain("复盘决定：已移除");
  });

  it("downloads a machine-readable JSON export with the same scope semantics", async () => {
    const response = await request("1", "?format=json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="repotrellis-digest-1-active.json"');
    const payload = await response.json();
    expect(payload).toMatchObject({
      exportVersion: "repotrellis-digest-export-v1",
      scope: "active",
      digest: { id: 1 },
      items: [{ score: 42, decision: "pending" }],
    });
    expect(JSON.stringify(payload)).not.toContain("PRIVATE_NOTE");
    expect(JSON.stringify(payload)).not.toContain("PRIVATE_CONFIG");
  });

  it.each(["0", "-1", "1.5", "bad", "9007199254740992"])("rejects an invalid ID: %s", async (id) => {
    const response = await request(id);
    expect(response.status).toBe(400);
  });

  it.each(["?scope=unknown", "?scope=", "?format=html"])("rejects unsupported export options: %s", async (query) => {
    expect((await request("1", query)).status).toBe(400);
  });

  it("returns a not-found error for a missing snapshot", async () => {
    const response = await request("999");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "digest_not_found" } });
  });

  it("does not expose database details on failure", async () => {
    const sqlite = database.sqlite!;
    const failingRead = vi.spyOn(sqlite, "prepare").mockImplementation(() => {
      throw new Error("PRIVATE_DATABASE_PATH");
    });
    try {
      const response = await request();
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).toContain("digest_export_failed");
      expect(body).not.toContain("PRIVATE_DATABASE_PATH");
    } finally {
      failingRead.mockRestore();
    }
  });
});
