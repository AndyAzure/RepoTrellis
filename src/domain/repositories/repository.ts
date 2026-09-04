export const repositoryStatuses = [
  "candidate",
  "trying",
  "adopted",
  "dropped",
  "reference",
] as const;

export const repositorySourceKinds = [
  "github",
  "rss",
  "article",
  "manual",
] as const;

export type RepositoryStatus = (typeof repositoryStatuses)[number];
export type RepositorySourceKind = (typeof repositorySourceKinds)[number];

export interface RepositorySearchFilters {
  query?: string;
  status?: RepositoryStatus;
  source?: RepositorySourceKind;
  limit?: number;
  offset?: number;
}

export interface RepositoryListItem {
  id: number;
  githubId: number;
  fullName: string;
  owner: string;
  name: string;
  url: string;
  description: string | null;
  defaultBranch: string | null;
  language: string | null;
  stars: number;
  forks: number;
  license: string | null;
  isArchived: boolean;
  remoteUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: RepositoryStatus;
  tags: string[];
  note: string | null;
  priority: number;
  nextAction: string | null;
  sources: RepositorySourceKind[];
}

export interface RepositoryMetaPatch {
  status?: RepositoryStatus;
  tags?: string[];
  note?: string | null;
  priority?: number;
  nextAction?: string | null;
}
