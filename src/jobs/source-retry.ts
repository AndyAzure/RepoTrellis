import type Database from "better-sqlite3";

import {
  resolveSourceItem,
  type ResolveSourceOptions,
  type SourceResolutionResult,
} from "../ingest";

const DEFAULT_RETRY_LIMIT = 10;

export interface SourceRetryJobOptions extends ResolveSourceOptions {
  limit?: number;
  now?: Date;
}

export interface SourceRetryJobResult {
  scanned: number;
  processed: number;
  results: SourceResolutionResult[];
}

/**
 * Process accepted source items whose retry backoff has elapsed.
 * The caller (cron, CLI or an explicit local action) owns scheduling cadence.
 */
export async function retryDueSourceItems(
  sqlite: Database.Database,
  options: SourceRetryJobOptions = {},
): Promise<SourceRetryJobResult> {
  const limit = clampLimit(options.limit ?? DEFAULT_RETRY_LIMIT);
  const now = options.now ?? new Date();
  const due = sqlite
    .prepare<[string, number], { id: number }>(
      `select id
       from source_items
       where review_status = 'accepted'
         and processing_status = 'failed'
         and next_retry_at is not null
         and datetime(next_retry_at) <= datetime(?)
       order by datetime(next_retry_at) asc, id asc
       limit ?`,
    )
    .all(now.toISOString(), limit);

  const results: SourceResolutionResult[] = [];
  for (const source of due) {
    results.push(await resolveSourceItem(sqlite, source.id, options));
  }

  return {
    scanned: due.length,
    processed: results.length,
    results,
  };
}

function clampLimit(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), 10);
}
