import type {
  RepositoryAnalysisOutput,
} from "@/domain/analysis/repository-analysis";

export interface RepositoryAnalysisInput {
  repository: {
    fullName: string;
    description: string | null;
    language: string | null;
    license: string | null;
    stars: number;
    forks: number;
    isArchived: boolean;
  };
  metadata: {
    status: string;
    tags: string[];
    note: string | null;
    nextAction: string | null;
  };
  evidence: Array<{
    sourceUrl: string;
    title: string | null;
    excerpt: string | null;
    mentionText: string | null;
    evidence: string | null;
  }>;
}

export interface RepositoryAnalyzer {
  readonly provider: string;
  analyze(input: RepositoryAnalysisInput): RepositoryAnalysisOutput;
}

export { analyzeRepositoryLocally, localRepositoryAnalyzer } from "./local-repository-analyzer";
export { triageLocally } from "./local-triage";
export * from "./triage";
