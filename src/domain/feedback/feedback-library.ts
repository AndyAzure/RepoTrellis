import type Database from "better-sqlite3";

import type { FeedbackEvent, FeedbackInput } from "./feedback";

interface FeedbackRow {
  id: number;
  repositoryId: number | null;
  action: FeedbackEvent["action"];
  reason: string | null;
  source: string;
  createdAt: string;
}

export function recordRepositoryFeedback(
  sqlite: Database.Database,
  repositoryId: number,
  input: FeedbackInput,
): FeedbackEvent | null {
  const repository = sqlite
    .prepare<[number], { id: number }>("select id from repositories where id = ?")
    .get(repositoryId);
  if (!repository) return null;

  const reason = input.reason?.trim() || null;
  const result = sqlite
    .prepare(
      `insert into feedback_events (repository_id, action, reason, source)
       values (?, ?, ?, 'library')`,
    )
    .run(repositoryId, input.action, reason);
  const row = sqlite
    .prepare<[number], FeedbackRow>(
      `select id, repository_id as repositoryId, action, reason, source,
              created_at as createdAt
       from feedback_events where id = ?`,
    )
    .get(Number(result.lastInsertRowid));
  return row ?? null;
}

export function listRepositoryFeedback(
  sqlite: Database.Database,
  repositoryId: number,
  limit = 10,
): FeedbackEvent[] {
  const rows = sqlite
    .prepare<[number, number], FeedbackRow>(
      `select id, repository_id as repositoryId, action, reason, source,
              created_at as createdAt
       from feedback_events where repository_id = ?
       order by created_at desc, id desc limit ?`,
    )
    .all(repositoryId, Math.min(Math.max(Math.trunc(limit), 1), 50));
  return rows;
}
