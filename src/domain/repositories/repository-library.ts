import type Database from "better-sqlite3";

import {
  repositorySourceKinds,
  type RepositoryListItem,
  type RepositoryMetaPatch,
  type RepositorySearchFilters,
  type RepositorySourceKind,
  type RepositoryStatus,
} from "./repository";

export * from "./repository";

interface RepositoryRow {
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
  isArchived: number;
  remoteUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: RepositoryStatus;
  tags: string;
  note: string | null;
  priority: number;
  nextAction: string | null;
  sources: string | null;
}

const repositorySelect = `
  select
    r.id,
    r.github_id as githubId,
    r.full_name as fullName,
    r.owner,
    r.name,
    r.url,
    r.description,
    r.default_branch as defaultBranch,
    r.language,
    r.stars,
    r.forks,
    r.license,
    r.is_archived as isArchived,
    r.remote_updated_at as remoteUpdatedAt,
    r.created_at as createdAt,
    r.updated_at as updatedAt,
    coalesce(meta.status, 'candidate') as status,
    coalesce(meta.tags, '[]') as tags,
    meta.note,
    coalesce(meta.priority, 0) as priority,
    meta.next_action as nextAction,
    (
      select group_concat(distinct source.kind)
      from repo_mentions mention
      join source_items source on source.id = mention.source_item_id
      where mention.repository_id = r.id
    ) as sources
  from repositories r
  left join user_repository_meta meta on meta.repository_id = r.id
`;

export function searchRepositories(
  sqlite: Database.Database,
  filters: RepositorySearchFilters = {},
): RepositoryListItem[] {
  const ftsQuery = toFtsQuery(filters.query ?? "");
  const clauses: string[] = [];
  const parameters: Array<string | number> = [];
  let from = repositorySelect;

  if (ftsQuery) {
    from += " join repositories_fts on repositories_fts.rowid = r.id\n";
    clauses.push("repositories_fts match ?");
    parameters.push(ftsQuery);
  }

  if (filters.status) {
    clauses.push("coalesce(meta.status, 'candidate') = ?");
    parameters.push(filters.status);
  }

  if (filters.source) {
    clauses.push(`exists (
      select 1
      from repo_mentions source_mention
      join source_items source_filter
        on source_filter.id = source_mention.source_item_id
      where source_mention.repository_id = r.id
        and source_filter.kind = ?
    )`);
    parameters.push(filters.source);
  }

  const where = clauses.length > 0 ? ` where ${clauses.join(" and ")}` : "";
  const order = ftsQuery
    ? " order by bm25(repositories_fts), r.stars desc"
    : " order by coalesce(r.remote_updated_at, r.updated_at) desc, r.stars desc";
  const limit = clampInteger(filters.limit ?? 30, 1, 100);
  const offset = clampInteger(filters.offset ?? 0, 0, 10_000);

  const rows = sqlite
    .prepare<Array<string | number>, RepositoryRow>(
      `${from}${where}${order} limit ? offset ?`,
    )
    .all(...parameters, limit, offset);

  return rows.map(mapRepositoryRow);
}

export function getRepository(
  sqlite: Database.Database,
  repositoryId: number,
): RepositoryListItem | null {
  const row = sqlite
    .prepare<[number], RepositoryRow>(`${repositorySelect} where r.id = ?`)
    .get(repositoryId);

  return row ? mapRepositoryRow(row) : null;
}

export function updateRepositoryMeta(
  sqlite: Database.Database,
  repositoryId: number,
  patch: RepositoryMetaPatch,
): RepositoryListItem | null {
  if (!getRepository(sqlite, repositoryId)) {
    return null;
  }

  const current = sqlite
    .prepare<
      [number],
      {
        status: RepositoryStatus;
        tags: string;
        note: string | null;
        priority: number;
        nextAction: string | null;
      }
    >(
      `select status, tags, note, priority, next_action as nextAction
       from user_repository_meta where repository_id = ?`,
    )
    .get(repositoryId);

  const next = {
    status: patch.status ?? current?.status ?? "candidate",
    tags: patch.tags ? normalizeTags(patch.tags) : parseTags(current?.tags),
    note: patch.note === undefined ? (current?.note ?? null) : patch.note,
    priority: patch.priority ?? current?.priority ?? 0,
    nextAction:
      patch.nextAction === undefined
        ? (current?.nextAction ?? null)
        : patch.nextAction,
  } satisfies Required<RepositoryMetaPatch>;

  sqlite
    .prepare(
      `insert into user_repository_meta (
        repository_id, status, tags, note, priority, next_action
      ) values (?, ?, ?, ?, ?, ?)
      on conflict(repository_id) do update set
        status = excluded.status,
        tags = excluded.tags,
        note = excluded.note,
        priority = excluded.priority,
        next_action = excluded.next_action,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .run(
      repositoryId,
      next.status,
      JSON.stringify(next.tags),
      next.note,
      next.priority,
      next.nextAction,
    );

  return getRepository(sqlite, repositoryId);
}

function toFtsQuery(input: string): string | null {
  const terms = input.normalize("NFKC").match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 8);

  if (!terms || terms.length === 0) {
    return null;
  }

  return terms.map((term) => `"${term}"*`).join(" AND ");
}

function mapRepositoryRow(row: RepositoryRow): RepositoryListItem {
  return {
    ...row,
    isArchived: row.isArchived === 1,
    tags: parseTags(row.tags),
    sources: parseSources(row.sources),
  };
}

function parseTags(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function parseSources(value: string | null): RepositorySourceKind[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .filter((source): source is RepositorySourceKind =>
      repositorySourceKinds.includes(source as RepositorySourceKind),
    );
}

function normalizeTags(tags: string[]): string[] {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 40)),
    ),
  ].slice(0, 20);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}
