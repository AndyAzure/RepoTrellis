import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingestManualSource } from "@/ingest";

const database = vi.hoisted<{ sqlite?: Database.Database }>(() => ({}));
vi.mock("@/db", () => ({
  get sqlite() {
    if (!database.sqlite) throw new Error("Test database is unavailable.");
    return database.sqlite;
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return POST(
    new Request("http://localhost/api/inbox/batch-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("batch inbox review route", () => {
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

  it("updates multiple sources in one transaction", async () => {
    const first = ingestManualSource(database.sqlite!, { url: "https://example.com/one" });
    const second = ingestManualSource(database.sqlite!, { url: "https://example.com/two" });
    const response = await request({
      sourceItemIds: [first.sourceItemId, second.sourceItemId, first.sourceItemId],
      reviewStatus: "accepted",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { updated: 2 } });
    expect(database.sqlite!.prepare("select review_status from source_items order by id").all()).toEqual([
      { review_status: "accepted" },
      { review_status: "accepted" },
    ]);
  });

  it("does not partially update when a source is missing", async () => {
    const first = ingestManualSource(database.sqlite!, { url: "https://example.com/one" });
    const response = await request({ sourceItemIds: [first.sourceItemId, 999], reviewStatus: "rejected" });
    expect(response.status).toBe(404);
    expect(database.sqlite!.prepare("select review_status from source_items where id = ?").get(first.sourceItemId)).toEqual({ review_status: "pending" });
  });
});
