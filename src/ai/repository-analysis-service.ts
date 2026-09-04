import type Database from "better-sqlite3";

import {
  repositoryAnalysisOutputSchema,
  type RepositoryAnalysis,
  type RepositoryAnalysisSnapshot,
} from "../domain/analysis/repository-analysis";
import { getRepositoryAnalysis } from "../domain/analysis/analysis-library";
import {
  localRepositoryAnalyzer,
  type RepositoryAnalysisInput,
  type RepositoryAnalyzer,
} from "./index";

export type GenerateRepositoryAnalysisStatus =
  | "ready"
  | "busy"
  | "failed"
  | "not_found";

export interface GenerateRepositoryAnalysisResult {
  status: GenerateRepositoryAnalysisStatus;
  repositoryId: number;
  analysis: RepositoryAnalysis | null;
  error: string | null;
}

interface RepositoryAnalysisRepositoryRow {
  id: number;
  fullName: string;
  description: string | null;
  language: string | null;
  license: string | null;
  stars: number;
  forks: number;
  isArchived: number;
}

interface MetadataRow {
  status: string;
  tags: string;
  note: string | null;
  nextAction: string | null;
}

interface EvidenceRow {
  sourceUrl: string;
  title: string | null;
  excerpt: string | null;
  mentionText: string | null;
  evidence: string | null;
}

export function generateRepositoryAnalysis(
  sqlite: Database.Database,
  repositoryId: number,
  options: { analyzer?: RepositoryAnalyzer } = {},
): GenerateRepositoryAnalysisResult {
  const repository = sqlite
    .prepare<[number], RepositoryAnalysisRepositoryRow>(
      `select id, full_name as fullName, description, language, license,
              stars, forks, is_archived as isArchived
       from repositories where id = ?`,
    )
    .get(repositoryId);

  if (!repository) {
    return { status: "not_found", repositoryId, analysis: null, error: null };
  }

  const current = getRepositoryAnalysis(sqlite, repositoryId);
  if (current?.status === "processing") {
    return { status: "busy", repositoryId, analysis: current, error: null };
  }

  const analyzer = options.analyzer ?? localRepositoryAnalyzer;
  sqlite
    .prepare(
      `insert into repository_analyses (repository_id, status, provider, summary,
         topics, tech_stack, use_cases, risks, confidence, source_snapshot,
         last_error, generated_at)
       values (?, 'processing', ?, null, '[]', '[]', '[]', '[]', null, '{}', null, null)
       on conflict(repository_id) do update set
         status = 'processing',
         provider = excluded.provider,
         summary = null,
         topics = '[]',
         tech_stack = '[]',
         use_cases = '[]',
         risks = '[]',
         confidence = null,
         source_snapshot = '{}',
         last_error = null,
         generated_at = null,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(repositoryId, analyzer.provider);

  const input = readAnalysisInput(sqlite, repository);
  const snapshot: RepositoryAnalysisSnapshot = {
    repository: {
      ...input.repository,
      isArchived: input.repository.isArchived,
    },
    metadata: input.metadata,
    evidence: input.evidence,
  };

  try {
    const parsed = repositoryAnalysisOutputSchema.safeParse(analyzer.analyze(input));
    if (!parsed.success) {
      throw new Error("Structured analysis provider returned invalid output.");
    }

    sqlite
      .prepare(
        `update repository_analyses
         set status = 'ready',
             provider = ?,
             summary = ?,
             topics = ?,
             tech_stack = ?,
             use_cases = ?,
             risks = ?,
             confidence = ?,
             source_snapshot = ?,
             last_error = null,
             generated_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         where repository_id = ?`,
      )
      .run(
        analyzer.provider,
        parsed.data.summary,
        JSON.stringify(parsed.data.topics),
        JSON.stringify(parsed.data.techStack),
        JSON.stringify(parsed.data.useCases),
        JSON.stringify(parsed.data.risks),
        parsed.data.confidence,
        JSON.stringify(snapshot),
        repositoryId,
      );

    return {
      status: "ready",
      repositoryId,
      analysis: getRepositoryAnalysis(sqlite, repositoryId),
      error: null,
    };
  } catch (error) {
    const message = describeAnalysisError(error);
    sqlite
      .prepare(
        `update repository_analyses
         set status = 'failed',
             last_error = ?,
             updated_at = CURRENT_TIMESTAMP
         where repository_id = ?`,
      )
      .run(message, repositoryId);

    return {
      status: "failed",
      repositoryId,
      analysis: getRepositoryAnalysis(sqlite, repositoryId),
      error: message,
    };
  }
}

function readAnalysisInput(
  sqlite: Database.Database,
  repository: RepositoryAnalysisRepositoryRow,
): RepositoryAnalysisInput {
  const metadata = sqlite
    .prepare<[number], MetadataRow>(
      `select status, tags, note, next_action as nextAction
       from user_repository_meta where repository_id = ?`,
    )
    .get(repository.id);
  const evidence = sqlite
    .prepare<[number], EvidenceRow>(
      `select source.url as sourceUrl, source.title, source.excerpt,
              mention.mention_text as mentionText, mention.evidence
       from repo_mentions mention
       join source_items source on source.id = mention.source_item_id
       where mention.repository_id = ?
       order by source.discovered_at desc, mention.id desc
       limit 30`,
    )
    .all(repository.id);

  return {
    repository: {
      ...repository,
      isArchived: repository.isArchived === 1,
    },
    metadata: {
      status: metadata?.status ?? "candidate",
      tags: parseTags(metadata?.tags),
      note: metadata?.note ?? null,
      nextAction: metadata?.nextAction ?? null,
    },
    evidence,
  };
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function describeAnalysisError(error: unknown): string {
  if (error instanceof Error && error.message === "Structured analysis provider returned invalid output.") {
    return error.message;
  }
  return "结构化分析暂时失败，请稍后重试。";
}
