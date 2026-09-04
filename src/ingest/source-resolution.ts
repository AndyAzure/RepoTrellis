import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import {
  fetchGithubRepository,
  GithubConnectorError,
  type GithubRepository,
} from "../connectors/github";
import { persistGithubRepositories } from "./repository-persistence";

const RESOLUTION_LEASE_MINUTES = 2;
const MAX_REFS_PER_SOURCE = 20;

export interface GithubReference {
  owner: string;
  name: string;
  fullName: string;
}

export type SourceResolutionStatus =
  | "resolved"
  | "busy"
  | "retry_wait"
  | "failed"
  | "not_found"
  | "not_accepted"
  | "stale";

export interface SourceResolutionResult {
  status: SourceResolutionStatus;
  sourceItemId: number;
  created: number;
  updated: number;
  linked: number;
  resolvedAt: string | null;
  nextRetryAt: string | null;
  error: string | null;
}

export interface ResolveSourceOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

interface SourceState {
  id: number;
  reviewStatus: "pending" | "accepted" | "rejected";
  processingStatus: "pending" | "processing" | "ready" | "failed";
  parseAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  resolvedAt: string | null;
  resolutionToken: string | null;
  resolutionStartedAt: string | null;
  extractedGithubRefs: string;
}

interface ExistingRepositoryRow {
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
  isArchived: number;
  remoteUpdatedAt: string | null;
}

export function normalizeGithubReferences(
  values: string[],
  limit = MAX_REFS_PER_SOURCE,
): GithubReference[] {
  const seen = new Set<string>();
  const references: GithubReference[] = [];
  for (const value of values) {
    const reference = normalizeGithubReference(value);
    if (!reference || seen.has(reference.fullName.toLowerCase())) continue;
    seen.add(reference.fullName.toLowerCase());
    references.push(reference);
    if (references.length >= limit) break;
  }
  return references;
}

export async function resolveSourceItem(
  sqlite: Database.Database,
  sourceItemId: number,
  options: ResolveSourceOptions = {},
): Promise<SourceResolutionResult> {
  const source = getSourceState(sqlite, sourceItemId);
  if (!source) return result("not_found", sourceItemId);
  if (source.reviewStatus !== "accepted") {
    return result("not_accepted", sourceItemId, {
      error: "Only accepted sources can be resolved.",
    });
  }
  if (source.resolvedAt) {
    return result("resolved", sourceItemId, {
      resolvedAt: source.resolvedAt,
      linked: countMentions(sqlite, sourceItemId),
    });
  }
  if (source.processingStatus === "processing" && isLeaseActive(source.resolutionStartedAt)) {
    return result("busy", sourceItemId);
  }
  if (source.processingStatus === "failed" && isRetryBlocked(source.nextRetryAt)) {
    return result("retry_wait", sourceItemId, {
      nextRetryAt: source.nextRetryAt,
      error: source.lastError,
    });
  }

  const token = randomUUID();
  const claimed = sqlite
    .prepare(
      `update source_items
       set processing_status = 'processing',
           parse_attempts = parse_attempts + 1,
           resolution_token = ?,
           resolution_started_at = CURRENT_TIMESTAMP,
           next_retry_at = null,
           last_error = null,
           updated_at = CURRENT_TIMESTAMP
       where id = ? and review_status = 'accepted'
         and (processing_status <> 'processing'
           or resolution_started_at is null
           or datetime(resolution_started_at) <= datetime('now', ?))`,
    )
    .run(token, sourceItemId, `-${RESOLUTION_LEASE_MINUTES} minutes`);
  if (claimed.changes === 0) {
    const latest = getSourceState(sqlite, sourceItemId);
    return latest?.reviewStatus === "accepted"
      ? result("busy", sourceItemId)
      : result("not_accepted", sourceItemId, {
          error: "Only accepted sources can be resolved.",
        });
  }

  const references = normalizeGithubReferences(parseRefs(source.extractedGithubRefs));
  const repositories: GithubRepository[] = [];
  try {
    for (const reference of references) {
      const existing = findExistingRepository(sqlite, reference.fullName);
      repositories.push(
        existing ? mapExistingRepository(existing) : await fetchGithubRepository({
          owner: reference.owner,
          name: reference.name,
          token: options.token,
          signal: options.signal,
          fetchImpl: options.fetchImpl,
        }),
      );
    }

    const persisted = sqlite.transaction(() => {
      const current = getSourceState(sqlite, sourceItemId);
      if (
        !current ||
        current.reviewStatus !== "accepted" ||
        current.resolutionToken !== token
      ) {
        throw new StaleResolutionError();
      }
      const counts = persistGithubRepositories(
        sqlite,
        sourceItemId,
        repositories,
        (repository) => `Discovered in source ${sourceItemId}: ${repository.fullName}.`,
      );
      sqlite
        .prepare(
          `update source_items
           set processing_status = 'ready',
               resolved_at = CURRENT_TIMESTAMP,
               resolution_token = null,
               resolution_started_at = null,
               next_retry_at = null,
               last_error = null,
               updated_at = CURRENT_TIMESTAMP
           where id = ? and resolution_token = ?`,
        )
        .run(sourceItemId, token);
      const updated = getSourceState(sqlite, sourceItemId);
      return {
        ...counts,
        resolvedAt: updated?.resolvedAt ?? new Date().toISOString(),
      };
    })();
    return result("resolved", sourceItemId, persisted);
  } catch (error) {
    if (error instanceof StaleResolutionError) return result("stale", sourceItemId);
    const failure = describeResolutionError(error);
    const nextRetryAt = getRetryAt(error);
    const failedUpdate = sqlite
      .prepare(
        `update source_items
         set processing_status = 'failed',
             resolution_token = null,
             resolution_started_at = null,
             next_retry_at = ?,
             last_error = ?,
             updated_at = CURRENT_TIMESTAMP
         where id = ? and resolution_token = ?`,
      )
      .run(nextRetryAt, failure, sourceItemId, token);
    if (failedUpdate.changes === 0) return result("stale", sourceItemId);
    return result("failed", sourceItemId, { error: failure, nextRetryAt });
  }
}

export function normalizeGithubReference(value: string): GithubReference | null {
  const raw = value.trim();
  if (!raw) return null;
  let owner: string;
  let name: string;
  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (
      url.protocol !== "https:" ||
      !["github.com", "www.github.com"].includes(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    [owner, name] = parts;
  } else {
    const parts = raw.split("/");
    if (parts.length !== 2) return null;
    [owner, name] = parts;
  }
  if (name.toLowerCase().endsWith(".git")) name = name.slice(0, -4);
  if (!isGithubOwner(owner) || !isGithubRepositoryName(name)) return null;
  return { owner, name, fullName: `${owner}/${name}` };
}

function getSourceState(sqlite: Database.Database, id: number): SourceState | null {
  return sqlite
    .prepare<[number], SourceState>(
      `select id, review_status as reviewStatus, processing_status as processingStatus,
              parse_attempts as parseAttempts, next_retry_at as nextRetryAt,
              last_error as lastError, resolved_at as resolvedAt,
              resolution_token as resolutionToken,
              resolution_started_at as resolutionStartedAt,
              extracted_github_refs as extractedGithubRefs
       from source_items where id = ?`,
    )
    .get(id) ?? null;
}

function findExistingRepository(
  sqlite: Database.Database,
  fullName: string,
): ExistingRepositoryRow | null {
  return sqlite
    .prepare<[string], ExistingRepositoryRow>(
      `select github_id as githubId, full_name as fullName, owner, name, url,
              description, default_branch as defaultBranch, language, stars,
              forks, license, is_archived as isArchived,
              remote_updated_at as remoteUpdatedAt
       from repositories where lower(full_name) = lower(?)`,
    )
    .get(fullName) ?? null;
}

function mapExistingRepository(row: ExistingRepositoryRow): GithubRepository {
  return {
    githubId: row.githubId,
    fullName: row.fullName,
    owner: row.owner,
    name: row.name,
    url: row.url,
    description: row.description,
    defaultBranch: row.defaultBranch,
    language: row.language,
    stars: row.stars,
    forks: row.forks,
    license: row.license,
    isArchived: Boolean(row.isArchived),
    remoteUpdatedAt: row.remoteUpdatedAt ?? new Date().toISOString(),
  };
}

function countMentions(sqlite: Database.Database, sourceItemId: number): number {
  return (sqlite
    .prepare<[number], { count: number }>(
      "select count(*) as count from repo_mentions where source_item_id = ?",
    )
    .get(sourceItemId)?.count ?? 0);
}

function result(
  status: SourceResolutionStatus,
  sourceItemId: number,
  values: Partial<SourceResolutionResult> = {},
): SourceResolutionResult {
  return {
    status,
    sourceItemId,
    created: 0,
    updated: 0,
    linked: 0,
    resolvedAt: null,
    nextRetryAt: null,
    error: null,
    ...values,
  };
}

function parseRefs(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((ref): ref is string => typeof ref === "string")
      : [];
  } catch {
    return [];
  }
}

function isGithubOwner(value: string): boolean {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value);
}

function isGithubRepositoryName(value: string): boolean {
  return /^[a-z\d](?:[a-z\d._-]{0,98}[a-z\d])?$/i.test(value);
}

function isLeaseActive(value: string | null): boolean {
  if (!value) return false;
  const parsed = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(parsed) && Date.now() - parsed < RESOLUTION_LEASE_MINUTES * 60_000;
}

function isRetryBlocked(value: string | null): boolean {
  return Boolean(value && Date.parse(value) > Date.now());
}

function describeResolutionError(error: unknown): string {
  if (error instanceof GithubConnectorError) {
    if (error.code === "not_found") return "GitHub repository was not found.";
    if (error.code === "unauthorized") return "GitHub rejected the configured credentials.";
    if (error.code === "rate_limited") return "GitHub API rate limit was reached.";
    if (error.code === "invalid_response") return "GitHub returned an unexpected repository payload.";
    if (error.code === "invalid_repository") return "GitHub repository reference is invalid.";
    return "GitHub API request failed.";
  }
  if (error instanceof Error && error.name === "AbortError") return "GitHub request timed out.";
  return "Repository resolution failed.";
}

function getRetryAt(error: unknown): string | null {
  if (error instanceof GithubConnectorError && error.retryAt) {
    const numeric = Number(error.retryAt);
    if (Number.isFinite(numeric)) return new Date(numeric * 1_000).toISOString();
    const parsed = Date.parse(error.retryAt);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (error instanceof GithubConnectorError && ["rate_limited", "upstream"].includes(error.code)) {
    return new Date(Date.now() + 60_000).toISOString();
  }
  return null;
}

class StaleResolutionError extends Error {}
