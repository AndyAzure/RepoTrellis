import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const repositories = sqliteTable(
  "repositories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    githubId: integer("github_id").notNull(),
    fullName: text("full_name").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    defaultBranch: text("default_branch"),
    language: text("language"),
    stars: integer("stars").notNull().default(0),
    forks: integer("forks").notNull().default(0),
    license: text("license"),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    remoteUpdatedAt: text("remote_updated_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("repositories_github_id_idx").on(table.githubId),
    uniqueIndex("repositories_full_name_idx").on(table.fullName),
    index("repositories_language_idx").on(table.language),
  ],
);

export const repositoryAnalyses = sqliteTable(
  "repository_analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repositoryId: integer("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "processing", "ready", "failed"],
    })
      .notNull()
      .default("pending"),
    provider: text("provider").notNull().default("local-rules-v1"),
    summary: text("summary"),
    topics: text("topics", { mode: "json" }).$type<string[]>().notNull().default([]),
    techStack: text("tech_stack", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    useCases: text("use_cases", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    risks: text("risks", { mode: "json" }).$type<string[]>().notNull().default([]),
    confidence: real("confidence"),
    sourceSnapshot: text("source_snapshot", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastError: text("last_error"),
    generatedAt: text("generated_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("repository_analyses_repository_idx").on(table.repositoryId),
    index("repository_analyses_status_idx").on(table.status),
  ],
);

export const sourceItems = sqliteTable(
  "source_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", {
      enum: ["github", "rss", "article", "manual"],
    })
      .notNull()
      .default("manual"),
    url: text("url").notNull(),
    title: text("title"),
    excerpt: text("excerpt"),
    publishedAt: text("published_at"),
    processingStatus: text("processing_status", {
      enum: ["pending", "processing", "ready", "failed"],
    })
      .notNull()
      .default("pending"),
    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    })
      .notNull()
      .default("pending"),
    parseAttempts: integer("parse_attempts").notNull().default(0),
    nextRetryAt: text("next_retry_at"),
    lastError: text("last_error"),
    resolvedAt: text("resolved_at"),
    resolutionToken: text("resolution_token"),
    resolutionStartedAt: text("resolution_started_at"),
    extractedGithubRefs: text("extracted_github_refs", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    discoveredAt: text("discovered_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ...timestamps,
  },
  (table) => [uniqueIndex("source_items_url_idx").on(table.url)],
);

export const rssFeeds = sqliteTable(
  "rss_feeds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    title: text("title"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastFetchedAt: text("last_fetched_at"),
    status: text("status", { enum: ["active", "error", "paused"] })
      .notNull()
      .default("active"),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [uniqueIndex("rss_feeds_url_idx").on(table.url)],
);

export const repoMentions = sqliteTable(
  "repo_mentions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceItemId: integer("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "cascade" }),
    repositoryId: integer("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    mentionText: text("mention_text"),
    evidence: text("evidence"),
    confidence: real("confidence"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("repo_mentions_source_repo_idx").on(
      table.sourceItemId,
      table.repositoryId,
    ),
    index("repo_mentions_repository_idx").on(table.repositoryId),
  ],
);

export const userRepositoryMeta = sqliteTable(
  "user_repository_meta",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repositoryId: integer("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    note: text("note"),
    status: text("status", {
      enum: ["candidate", "trying", "adopted", "dropped", "reference"],
    })
      .notNull()
      .default("candidate"),
    priority: integer("priority").notNull().default(0),
    nextAction: text("next_action"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_repository_meta_repository_idx").on(table.repositoryId),
    index("user_repository_meta_status_idx").on(table.status),
  ],
);

export const interests = sqliteTable("interests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  positiveRules: text("positive_rules", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  negativeRules: text("negative_rules", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const feedbackEvents = sqliteTable(
  "feedback_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repositoryId: integer("repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    action: text("action", {
      enum: ["keep", "try", "adopt", "dismiss", "block"],
    }).notNull(),
    reason: text("reason"),
    source: text("source").notNull().default("library"),
    ...timestamps,
  },
  (table) => [index("feedback_events_repository_idx").on(table.repositoryId)],
);

export const digests = sqliteTable("digests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status", { enum: ["draft", "published", "failed"] })
    .notNull()
    .default("draft"),
  configSnapshot: text("config_snapshot", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  ...timestamps,
});

export const digestItems = sqliteTable(
  "digest_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    digestId: integer("digest_id")
      .notNull()
      .references(() => digests.id, { onDelete: "cascade" }),
    repositoryId: integer("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    score: real("score"),
    reasons: text("reasons", { mode: "json" }).$type<string[]>().notNull().default([]),
    position: integer("position").notNull(),
    decision: text("decision", { enum: ["pending", "kept", "dismissed"] })
      .notNull()
      .default("pending"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("digest_items_digest_repo_idx").on(
      table.digestId,
      table.repositoryId,
    ),
    index("digest_items_position_idx").on(table.digestId, table.position),
  ],
);

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type RepositoryAnalysis = typeof repositoryAnalyses.$inferSelect;
export type NewRepositoryAnalysis = typeof repositoryAnalyses.$inferInsert;
export type SourceItem = typeof sourceItems.$inferSelect;
export type RssFeed = typeof rssFeeds.$inferSelect;
export type RepoMention = typeof repoMentions.$inferSelect;
export type UserRepositoryMeta = typeof userRepositoryMeta.$inferSelect;
