import type { RecommendationResult } from "../../ranking/repository-ranking";
import type { RepositoryListItem } from "../repositories/repository";

export const digestStatuses = ["draft", "published", "failed"] as const;
export type DigestStatus = (typeof digestStatuses)[number];

export const digestItemDecisions = ["pending", "kept", "dismissed"] as const;
export type DigestItemDecision = (typeof digestItemDecisions)[number];

export interface DigestPreviewItem extends RecommendationResult {
  repository: RepositoryListItem;
  selected: boolean;
}

export interface DigestPreview {
  periodStart: string;
  periodEnd: string;
  items: DigestPreviewItem[];
}

export interface DigestSnapshotItem {
  id: number;
  repositoryId: number;
  score: number | null;
  reasons: string[];
  position: number;
  decision: DigestItemDecision;
  repository: RepositoryListItem;
}

export interface DigestSnapshot {
  id: number;
  periodStart: string;
  periodEnd: string;
  status: DigestStatus;
  configSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  items: DigestSnapshotItem[];
}
