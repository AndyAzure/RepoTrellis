import type Database from "better-sqlite3";

import { getRepository } from "../repositories/repository-library";
import type { RepositoryListItem } from "../repositories/repository";
import { getRepositoryRecommendation } from "../../ranking/repository-ranking";
import type {
  DigestPreview,
  DigestPreviewItem,
  DigestSnapshot,
  DigestSnapshotItem,
  DigestItemDecision,
  DigestStatus,
} from "./digest";

interface DigestRow {
  id: number;
  periodStart: string;
  periodEnd: string;
  status: DigestStatus;
  configSnapshot: string;
  createdAt: string;
  updatedAt: string;
}

interface DigestItemRow {
  id: number;
  repositoryId: number;
  score: number | null;
  reasons: string;
  position: number;
  decision: DigestItemDecision;
}

export function buildDigestPreview(
  sqlite: Database.Database,
  options: { limit?: number; now?: Date } = {},
): DigestPreview {
  const limit = clampLimit(options.limit ?? 8);
  const items = sqliteRepositories(sqlite)
    .map((repository): DigestPreviewItem | null => {
      const recommendation = getRepositoryRecommendation(sqlite, repository.id);
      if (!recommendation) return null;
      return { ...recommendation, repository, selected: true } satisfies DigestPreviewItem;
    })
    .filter((item): item is DigestPreviewItem => Boolean(item))
    .sort((a, b) => b.score - a.score || a.repository.id - b.repository.id)
    .slice(0, limit);

  const periodEndDate = options.now ?? new Date();
  const periodStartDate = new Date(periodEndDate);
  periodStartDate.setUTCDate(periodStartDate.getUTCDate() - 6);
  return {
    periodStart: periodStartDate.toISOString().slice(0, 10),
    periodEnd: periodEndDate.toISOString().slice(0, 10),
    items,
  };
}

export type SaveDigestResult =
  | { status: "saved"; digest: DigestSnapshot }
  | { status: "empty"; digest: null };

export function saveDigestSnapshot(
  sqlite: Database.Database,
  options: { repositoryIds?: number[]; limit?: number; now?: Date } = {},
): SaveDigestResult {
  const preview = buildDigestPreview(sqlite, options);
  const selectedIds = options.repositoryIds
    ? new Set(options.repositoryIds)
    : null;
  const selected = selectedIds
    ? preview.items.filter((item) => selectedIds.has(item.repositoryId))
    : preview.items;
  if (selected.length === 0) return { status: "empty", digest: null };

  const save = sqlite.transaction(() => {
    const result = sqlite
      .prepare(
        `insert into digests (period_start, period_end, status, config_snapshot)
         values (?, ?, 'draft', ?)`,
      )
      .run(
        preview.periodStart,
        preview.periodEnd,
        JSON.stringify({
          version: "manual-preview-v1",
          candidateLimit: clampLimit(options.limit ?? 8),
          selectedCount: selected.length,
          confirmedAt: new Date().toISOString(),
        }),
      );
    const digestId = Number(result.lastInsertRowid);
    const insertItem = sqlite.prepare(
      `insert into digest_items (digest_id, repository_id, score, reasons, position, decision)
       values (?, ?, ?, ?, ?, 'pending')`,
    );
    for (const [index, item] of selected.entries()) {
      insertItem.run(
        digestId,
        item.repositoryId,
        item.score,
        JSON.stringify(item.reasons),
        index + 1,
      );
    }
    return digestId;
  });

  const digest = getDigestSnapshot(sqlite, save.immediate());
  if (!digest) throw new Error("Failed to read the saved digest snapshot.");
  return { status: "saved", digest };
}

export function getLatestDigest(sqlite: Database.Database): DigestSnapshot | null {
  return listDigestSnapshots(sqlite, { limit: 1 })[0] ?? null;
}

export function listDigestSnapshots(
  sqlite: Database.Database,
  options: {
    limit?: number;
    decision?: DigestItemDecision;
    periodFrom?: string;
    periodTo?: string;
  } = {},
): DigestSnapshot[] {
  const limit = clampHistoryLimit(options.limit ?? 10);
  const clauses: string[] = [];
  const parameters: Array<string | number> = [];
  if (options.decision) {
    clauses.push(
      "exists (select 1 from digest_items filter_items where filter_items.digest_id = digests.id and filter_items.decision = ?)",
    );
    parameters.push(options.decision);
  }
  if (options.periodFrom) {
    clauses.push("period_end >= ?");
    parameters.push(options.periodFrom);
  }
  if (options.periodTo) {
    clauses.push("period_start <= ?");
    parameters.push(options.periodTo);
  }
  const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
  const rows = sqlite
    .prepare<Array<string | number>, DigestRow>(
      `select id, period_start as periodStart, period_end as periodEnd,
              status, config_snapshot as configSnapshot,
              created_at as createdAt, updated_at as updatedAt
       from digests${where} order by created_at desc, id desc limit ?`,
    )
    .all(...parameters, limit);
  return rows.map((row) => mapDigestRow(sqlite, row));
}

export function updateDigestItemDecision(
  sqlite: Database.Database,
  digestId: number,
  digestItemId: number,
  decision: DigestItemDecision,
): DigestSnapshot | null {
  const result = sqlite
    .prepare<[DigestItemDecision, number, number]>(
      `update digest_items
       set decision = ?, updated_at = CURRENT_TIMESTAMP
       where id = ? and digest_id = ?`,
    )
    .run(decision, digestItemId, digestId);
  if (result.changes === 0) return null;
  return getDigestSnapshot(sqlite, digestId);
}

export function getDigestSnapshot(
  sqlite: Database.Database,
  digestId: number,
): DigestSnapshot | null {
  const row = sqlite
    .prepare<[number], DigestRow>(
      `select id, period_start as periodStart, period_end as periodEnd,
              status, config_snapshot as configSnapshot,
              created_at as createdAt, updated_at as updatedAt
       from digests where id = ?`,
    )
    .get(digestId);
  return row ? mapDigestRow(sqlite, row) : null;
}

function mapDigestRow(sqlite: Database.Database, row: DigestRow): DigestSnapshot {
  const itemRows = sqlite
    .prepare<[number], DigestItemRow>(
      `select id, repository_id as repositoryId, score, reasons,
              position, decision
       from digest_items where digest_id = ? order by position asc, id asc`,
    )
    .all(row.id);
  const items = itemRows
    .map((item) => {
      const repository = getRepository(sqlite, item.repositoryId);
      return repository
        ? ({ ...item, reasons: parseReasons(item.reasons), repository } satisfies DigestSnapshotItem)
        : null;
    })
    .filter((item): item is DigestSnapshotItem => Boolean(item));
  return {
    ...row,
    configSnapshot: parseObject(row.configSnapshot),
    items,
  };
}

function sqliteRepositories(sqlite: Database.Database): RepositoryListItem[] {
  const rows = sqlite
    .prepare<[], { id: number }>("select id from repositories order by id asc")
    .all();
  return rows
    .map(({ id }) => getRepository(sqlite, id))
    .filter((repository): repository is RepositoryListItem => Boolean(repository));
}

function parseReasons(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((reason): reason is string => typeof reason === "string")
      : [];
  } catch {
    return [];
  }
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function clampLimit(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), 8);
}

function clampHistoryLimit(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), 20);
}
