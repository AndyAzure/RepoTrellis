import type Database from "better-sqlite3";

import type { GithubRepository } from "../connectors/github";

export interface RepositoryPersistenceResult {
  created: number;
  updated: number;
  linked: number;
}

/**
 * Persist normalized GitHub repositories in the caller's transaction.
 * User-owned metadata is only created when missing; existing notes/statuses
 * are deliberately left untouched.
 */
export function persistGithubRepositories(
  sqlite: Database.Database,
  sourceItemId: number,
  repositories: GithubRepository[],
  evidence: (repository: GithubRepository) => string,
): RepositoryPersistenceResult {
  const findByGithubId = sqlite.prepare<[number], { id: number } | undefined>(
    "select id from repositories where github_id = ?",
  );
  const findByFullName = sqlite.prepare<[string], { id: number } | undefined>(
    "select id from repositories where lower(full_name) = lower(?)",
  );
  const insertRepository = sqlite.prepare(
    `insert into repositories (
      github_id, full_name, owner, name, url, description, default_branch,
      language, stars, forks, license, is_archived, remote_updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateRepository = sqlite.prepare(
    `update repositories set
      github_id = ?, full_name = ?, owner = ?, name = ?, url = ?,
      description = ?, default_branch = ?, language = ?, stars = ?, forks = ?,
      license = ?, is_archived = ?, remote_updated_at = ?,
      updated_at = CURRENT_TIMESTAMP
     where id = ?`,
  );
  const ensureMeta = sqlite.prepare(
    `insert into user_repository_meta (repository_id)
     values (?) on conflict(repository_id) do nothing`,
  );
  const upsertMention = sqlite.prepare(
    `insert into repo_mentions (
      source_item_id, repository_id, mention_text, evidence, confidence
    ) values (?, ?, ?, ?, 1)
    on conflict(source_item_id, repository_id) do update set
      mention_text = excluded.mention_text,
      evidence = excluded.evidence,
      confidence = excluded.confidence,
      updated_at = CURRENT_TIMESTAMP`,
  );

  let created = 0;
  let updated = 0;
  let linked = 0;

  for (const repository of repositories) {
    // github_id is authoritative, while the case-insensitive full name
    // fallback prevents duplicates when an older source used different case.
    const existing =
      findByGithubId.get(repository.githubId) ??
      findByFullName.get(repository.fullName);
    if (existing) {
      updateRepository.run(
        repository.githubId,
        repository.fullName,
        repository.owner,
        repository.name,
        repository.url,
        repository.description,
        repository.defaultBranch,
        repository.language,
        repository.stars,
        repository.forks,
        repository.license,
        repository.isArchived ? 1 : 0,
        repository.remoteUpdatedAt,
        existing.id,
      );
      updated += 1;
    } else {
      insertRepository.run(
        repository.githubId,
        repository.fullName,
        repository.owner,
        repository.name,
        repository.url,
        repository.description,
        repository.defaultBranch,
        repository.language,
        repository.stars,
        repository.forks,
        repository.license,
        repository.isArchived ? 1 : 0,
        repository.remoteUpdatedAt,
      );
      created += 1;
    }

    const persisted =
      findByGithubId.get(repository.githubId) ??
      findByFullName.get(repository.fullName);
    if (!persisted) {
      throw new Error(`Failed to persist ${repository.fullName}.`);
    }
    ensureMeta.run(persisted.id);
    upsertMention.run(
      sourceItemId,
      persisted.id,
      repository.fullName,
      evidence(repository),
    );
    linked += 1;
  }
  return { created, updated, linked };
}
