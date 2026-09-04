import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  analyzeRepositoryLocally,
  type RepositoryAnalysisInput,
  type RepositoryAnalyzer,
} from "./index";
import { generateRepositoryAnalysis } from "./repository-analysis-service";
import { getRepositoryAnalysis } from "../domain/analysis";

const input: RepositoryAnalysisInput = {
  repository: {
    fullName: "acme/ai-dashboard",
    description: "A local React and SQLite dashboard for LLM workflows.",
    language: "TypeScript",
    license: "MIT",
    stars: 120,
    forks: 8,
    isArchived: false,
  },
  metadata: {
    status: "candidate",
    tags: ["AI", "本地优先"],
    note: null,
    nextAction: "运行示例",
  },
  evidence: [],
};

describe("repository analysis", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  });

  afterEach(() => sqlite.close());

  it("produces deterministic local output without network access", () => {
    const first = analyzeRepositoryLocally(input);
    const second = analyzeRepositoryLocally(input);

    expect(second).toEqual(first);
    expect(first.topics).toEqual(expect.arrayContaining(["人工智能", "前端开发", "数据工程"]));
    expect(first.techStack).toEqual(expect.arrayContaining(["TypeScript", "React", "SQLite", "LLM"]));
    expect(first.confidence).toBeGreaterThan(0);
  });

  it("persists a ready analysis and a local evidence snapshot", () => {
    const repositoryId = insertRepository(sqlite);
    const sourceId = insertSource(sqlite, repositoryId);

    const result = generateRepositoryAnalysis(sqlite, repositoryId);

    expect(result.status).toBe("ready");
    expect(result.analysis).toMatchObject({
      repositoryId,
      status: "ready",
      provider: "local-rules-v1",
    });
    expect(result.analysis?.sourceSnapshot).toMatchObject({
      repository: { fullName: "acme/ai-dashboard" },
      evidence: [{ sourceUrl: "https://notes.example.com/analysis" }],
    });
    expect(sourceId).toBeGreaterThan(0);
  });

  it("marks provider failures without losing the repository", () => {
    const repositoryId = insertRepository(sqlite);
    const failingAnalyzer: RepositoryAnalyzer = {
      provider: "test-invalid",
      analyze: () => ({
        summary: "",
        topics: [],
        techStack: [],
        useCases: [],
        risks: [],
        confidence: 2,
      }),
    };

    const result = generateRepositoryAnalysis(sqlite, repositoryId, {
      analyzer: failingAnalyzer,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Structured analysis provider returned invalid output.");
    expect(getRepositoryAnalysis(sqlite, repositoryId)).toMatchObject({
      status: "failed",
      provider: "test-invalid",
    });
    expect(sqlite.prepare("select count(*) as count from repositories").get()).toEqual({ count: 1 });
  });
});

function insertRepository(sqlite: Database.Database): number {
  sqlite
    .prepare(
      `insert into repositories (
        github_id, full_name, owner, name, url, description, default_branch,
        language, stars, forks, license, is_archived, remote_updated_at
      ) values (101, 'acme/ai-dashboard', 'acme', 'ai-dashboard',
        'https://github.com/acme/ai-dashboard',
        'A local React and SQLite dashboard for LLM workflows.', 'main',
        'TypeScript', 120, 8, 'MIT', 0, '2026-09-03T12:00:00Z')`,
    )
    .run();
  const row = sqlite.prepare("select id from repositories limit 1").get() as { id: number };
  return row.id;
}

function insertSource(sqlite: Database.Database, repositoryId: number): number {
  sqlite
    .prepare(
      `insert into source_items (
        kind, url, title, excerpt, processing_status, review_status,
        extracted_github_refs
      ) values ('manual', 'https://notes.example.com/analysis',
        'Local AI dashboard', 'A note about local LLM workflows.', 'ready', 'accepted', '[]')`,
    )
    .run();
  const source = sqlite
    .prepare("select id from source_items limit 1")
    .get() as { id: number };
  sqlite
    .prepare(
      `insert into repo_mentions (source_item_id, repository_id, mention_text, evidence, confidence)
       values (?, ?, 'acme/ai-dashboard', 'Mentioned as a local LLM dashboard.', 0.9)`,
    )
    .run(source.id, repositoryId);
  return source.id;
}
