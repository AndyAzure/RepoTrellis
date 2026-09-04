import { z } from "zod";

export const repositoryAnalysisStatuses = [
  "pending",
  "processing",
  "ready",
  "failed",
] as const;

export type RepositoryAnalysisStatus = (typeof repositoryAnalysisStatuses)[number];

export const repositoryAnalysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(1_000),
  topics: z.array(z.string().trim().min(1).max(80)).max(8),
  techStack: z.array(z.string().trim().min(1).max(80)).max(12),
  useCases: z.array(z.string().trim().min(1).max(120)).max(8),
  risks: z.array(z.string().trim().min(1).max(160)).max(8),
  confidence: z.number().min(0).max(1),
});

export type RepositoryAnalysisOutput = z.infer<
  typeof repositoryAnalysisOutputSchema
>;

export interface RepositoryAnalysisSnapshot {
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

export interface RepositoryAnalysis {
  id: number;
  repositoryId: number;
  status: RepositoryAnalysisStatus;
  provider: string;
  summary: string | null;
  topics: string[];
  techStack: string[];
  useCases: string[];
  risks: string[];
  confidence: number | null;
  sourceSnapshot: RepositoryAnalysisSnapshot | Record<string, unknown>;
  lastError: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
