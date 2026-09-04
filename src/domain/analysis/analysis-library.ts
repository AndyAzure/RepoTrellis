import type Database from "better-sqlite3";

import type {
  RepositoryAnalysis,
  RepositoryAnalysisStatus,
  RepositoryAnalysisSnapshot,
} from "./repository-analysis";

interface AnalysisRow {
  id: number;
  repositoryId: number;
  status: RepositoryAnalysisStatus;
  provider: string;
  summary: string | null;
  topics: string;
  techStack: string;
  useCases: string;
  risks: string;
  confidence: number | null;
  sourceSnapshot: string;
  lastError: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getRepositoryAnalysis(
  sqlite: Database.Database,
  repositoryId: number,
): RepositoryAnalysis | null {
  const row = sqlite
    .prepare<[number], AnalysisRow>(
      `select
        id,
        repository_id as repositoryId,
        status,
        provider,
        summary,
        topics,
        tech_stack as techStack,
        use_cases as useCases,
        risks,
        confidence,
        source_snapshot as sourceSnapshot,
        last_error as lastError,
        generated_at as generatedAt,
        created_at as createdAt,
        updated_at as updatedAt
       from repository_analyses
       where repository_id = ?`,
    )
    .get(repositoryId);

  return row ? mapAnalysisRow(row) : null;
}

function mapAnalysisRow(row: AnalysisRow): RepositoryAnalysis {
  return {
    ...row,
    topics: parseStringArray(row.topics),
    techStack: parseStringArray(row.techStack),
    useCases: parseStringArray(row.useCases),
    risks: parseStringArray(row.risks),
    sourceSnapshot: parseSnapshot(row.sourceSnapshot),
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseSnapshot(
  value: string,
): RepositoryAnalysisSnapshot | Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
