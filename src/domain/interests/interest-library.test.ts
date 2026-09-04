import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getActiveInterest,
  normalizeInterestInput,
  saveActiveInterest,
} from "./interest-library";

describe("interest library", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => sqlite.close());

  it("returns no profile before the first save", () => {
    expect(getActiveInterest(sqlite)).toBeNull();
  });

  it("creates and normalizes the active profile", () => {
    const profile = saveActiveInterest(sqlite, {
      name: "  AI 雷达  ",
      description: "  关注本地工具  ",
      positiveRules: [" TypeScript ", "typescript", "可自部署"],
      negativeRules: ["营销站", "营销站"],
    });

    expect(profile).toMatchObject({
      name: "AI 雷达",
      description: "关注本地工具",
      positiveRules: ["TypeScript", "可自部署"],
      negativeRules: ["营销站"],
      isActive: true,
    });
    expect(getActiveInterest(sqlite)).toEqual(profile);
  });

  it("updates the same profile and keeps only one active record", () => {
    const first = saveActiveInterest(sqlite, {
      name: "第一版",
      description: null,
      positiveRules: [],
      negativeRules: [],
    });
    const second = saveActiveInterest(sqlite, {
      name: "第二版",
      description: null,
      positiveRules: ["本地"],
      negativeRules: [],
    });

    expect(second.id).toBe(first.id);
    expect(sqlite.prepare("select count(*) as count from interests where is_active = 1").get()).toEqual({ count: 1 });
    expect(getActiveInterest(sqlite)?.name).toBe("第二版");
  });

  it("truncates rules to the supported limit", () => {
    const normalized = normalizeInterestInput({
      name: "兴趣",
      description: null,
      positiveRules: Array.from({ length: 25 }, (_, index) => `rule-${index}`),
      negativeRules: [],
    });
    expect(normalized.positiveRules).toHaveLength(20);
  });
});
