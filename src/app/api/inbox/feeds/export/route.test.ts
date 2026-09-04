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

function request(query = "") {
  return GET(new Request(`http://localhost/api/inbox/feeds/export${query}`));
}

describe("RSS OPML export route", () => {
  beforeEach(() => {
    const sqlite = new Database(":memory:");
    database.sqlite = sqlite;
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => {
    database.sqlite?.close();
    database.sqlite = undefined;
  });

  it("downloads all subscriptions as a private XML attachment without changing data", async () => {
    const sqlite = database.sqlite!;
    for (let index = 0; index < 55; index += 1) {
      sqlite
        .prepare("insert into rss_feeds (url, title, status) values (?, ?, ?)")
        .run(`https://example.com/feed-${index}.xml`, `Feed ${index}`, index % 2 ? "error" : "active");
    }
    const before = sqlite.prepare("select * from rss_feeds").all();

    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="repotrellis-rss-feeds.opml"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const xml = await response.text();
    expect((xml.match(/type="rss"/g) ?? []).length).toBe(55);
    expect(sqlite.prepare("select * from rss_feeds").all()).toEqual(before);
  });

  it("returns a valid empty OPML document", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<opml version="2.0">');
  });

  it("rejects query parameters", async () => {
    const response = await request("?limit=10");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_export" } });
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
      expect(body).toContain("rss_export_failed");
      expect(body).not.toContain("PRIVATE_DATABASE_PATH");
    } finally {
      failingRead.mockRestore();
    }
  });
});
