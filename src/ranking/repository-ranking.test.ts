import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RepositoryAnalysis } from "../domain/analysis/repository-analysis";
import type { Interest } from "../domain/interests/interest";
import type { RepositoryListItem } from "../domain/repositories/repository";
import { getRepositoryRecommendation, scoreRepository } from "./repository-ranking";

const repository: RepositoryListItem = {
  id: 1,
  githubId: 101,
  fullName: "acme/local-dashboard",
  owner: "acme",
  name: "local-dashboard",
  url: "https://github.com/acme/local-dashboard",
  description: "A local TypeScript dashboard for AI workflows.",
  defaultBranch: "main",
  language: "TypeScript",
  stars: 150,
  forks: 20,
  license: "MIT",
  isArchived: false,
  remoteUpdatedAt: "2026-09-01T00:00:00Z",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  status: "candidate" as const,
  tags: ["本地优先"],
  note: null,
  priority: 0,
  nextAction: null,
  sources: ["github"],
};

const interest: Interest = {
  id: 1,
  name: "AI 工具",
  description: "",
  positiveRules: ["local", "TypeScript"],
  negativeRules: ["deprecated"],
  isActive: true,
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
};

const analysis: RepositoryAnalysis = {
  id: 1,
  repositoryId: 1,
  status: "ready",
  provider: "local-rules-v1",
  summary: "Local dashboard",
  topics: ["人工智能"],
  techStack: ["TypeScript"],
  useCases: ["构建内部工具"],
  risks: [],
  confidence: 0.8,
  sourceSnapshot: {},
  lastError: null,
  generatedAt: "2026-09-01",
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
};

describe("repository ranking", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => sqlite.close());

  it("returns explainable positive and negative rule matches", () => {
    const result = scoreRepository({
      repository,
      analysis,
      interest,
      feedback: { latestAction: null, totalCount: 0 },
      evidenceCount: 1,
      now: new Date("2026-09-04T00:00:00Z"),
    });

    expect(result.score).toBeGreaterThan(60);
    expect(result.matchedPositiveRules).toEqual(["local", "TypeScript"]);
    expect(result.matchedNegativeRules).toEqual([]);
    expect(result.reasons).toEqual(expect.arrayContaining(["兴趣规则命中：local"]));
    expect(result.coverage).toEqual({ interest: true, analysis: true, evidence: true });
  });

  it("penalizes a matched negative rule and block feedback", () => {
    const base = scoreRepository({
      repository,
      analysis,
      interest,
      feedback: { latestAction: null, totalCount: 0 },
      evidenceCount: 0,
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const blocked = scoreRepository({
      repository: { ...repository, description: "A deprecated local dashboard." },
      analysis: null,
      interest,
      feedback: { latestAction: "block", totalCount: 1 },
      evidenceCount: 0,
      now: new Date("2026-09-04T00:00:00Z"),
    });

    expect(blocked.score).toBeLessThan(base.score);
    expect(blocked.reasons).toEqual(expect.arrayContaining(["负向规则降权：deprecated"]));
  });

  it("reads local repository, interest and feedback data", () => {
    insertRepository(sqlite);
    sqlite
      .prepare(
        `insert into interests (name, positive_rules, negative_rules, is_active)
         values ('AI 工具', '["local"]', '["deprecated"]', 1)`,
      )
      .run();
    sqlite
      .prepare("insert into feedback_events (repository_id, action, source) values (1, 'keep', 'library')")
      .run();

    const result = getRepositoryRecommendation(sqlite, 1);

    expect(result).toMatchObject({ repositoryId: 1, coverage: { interest: true } });
    expect(result?.reasons).toEqual(expect.arrayContaining(["最近反馈：保留"]));
  });
});

function insertRepository(sqlite: Database.Database): void {
  sqlite
    .prepare(
      `insert into repositories (
        github_id, full_name, owner, name, url, description, default_branch,
        language, stars, forks, license, is_archived, remote_updated_at
      ) values (101, 'acme/local-dashboard', 'acme', 'local-dashboard',
        'https://github.com/acme/local-dashboard',
        'A local TypeScript dashboard for AI workflows.', 'main',
        'TypeScript', 150, 20, 'MIT', 0, '2026-09-01T00:00:00Z')`,
    )
    .run();
}
