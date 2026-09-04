import type Database from "better-sqlite3";

import type { GithubRepository } from "@/connectors/github";

import { persistGithubRepositories } from "./repository-persistence";

export interface GithubStarsIngestResult {
  received: number;
  created: number;
  updated: number;
  sourceItemId: number;
}

export function ingestGithubStars(
  sqlite: Database.Database,
  username: string,
  repositories: GithubRepository[],
): GithubStarsIngestResult {
  const ingest = sqlite.transaction(() => {
    const sourceUrl = `https://github.com/${username}?tab=stars`;
    sqlite
      .prepare(
        `insert into source_items (
          kind, url, title, excerpt, processing_status, review_status
        ) values ('github', ?, ?, ?, 'ready', 'accepted')
         on conflict(url) do update set
           kind = excluded.kind,
           title = excluded.title,
           excerpt = excluded.excerpt,
           processing_status = 'ready',
           review_status = 'accepted',
           last_error = null,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run(
        sourceUrl,
        `GitHub Stars · ${username}`,
        `Repositories starred by @${username}.`,
      );

    const sourceItem = sqlite
      .prepare<[string], { id: number }>(
        "select id from source_items where url = ?",
      )
      .get(sourceUrl);

    if (!sourceItem) {
      throw new Error("Failed to persist the GitHub Stars source item.");
    }

    const persisted = persistGithubRepositories(
      sqlite,
      sourceItem.id,
      repositories,
      () => `Imported from the GitHub Stars list for @${username}.`,
    );

    return {
      received: repositories.length,
      created: persisted.created,
      updated: persisted.updated,
      sourceItemId: sourceItem.id,
    };
  });

  return ingest.immediate();
}
