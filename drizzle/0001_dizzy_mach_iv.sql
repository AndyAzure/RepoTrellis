PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_digest_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digest_id` integer NOT NULL,
	`repository_id` integer NOT NULL,
	`score` real,
	`reasons` text DEFAULT '[]' NOT NULL,
	`position` integer NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`digest_id`) REFERENCES `digests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_digest_items`("id", "digest_id", "repository_id", "score", "reasons", "position", "decision", "created_at", "updated_at") SELECT "id", "digest_id", "repository_id", "score", "reasons", "position", "decision", "created_at", "updated_at" FROM `digest_items`;--> statement-breakpoint
DROP TABLE `digest_items`;--> statement-breakpoint
ALTER TABLE `__new_digest_items` RENAME TO `digest_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `digest_items_digest_repo_idx` ON `digest_items` (`digest_id`,`repository_id`);--> statement-breakpoint
CREATE INDEX `digest_items_position_idx` ON `digest_items` (`digest_id`,`position`);--> statement-breakpoint
CREATE TABLE `__new_digests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`config_snapshot` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_digests`("id", "period_start", "period_end", "status", "config_snapshot", "created_at", "updated_at") SELECT "id", "period_start", "period_end", "status", "config_snapshot", "created_at", "updated_at" FROM `digests`;--> statement-breakpoint
DROP TABLE `digests`;--> statement-breakpoint
ALTER TABLE `__new_digests` RENAME TO `digests`;--> statement-breakpoint
CREATE TABLE `__new_feedback_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer,
	`action` text NOT NULL,
	`reason` text,
	`source` text DEFAULT 'library' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_feedback_events`("id", "repository_id", "action", "reason", "source", "created_at", "updated_at") SELECT "id", "repository_id", "action", "reason", "source", "created_at", "updated_at" FROM `feedback_events`;--> statement-breakpoint
DROP TABLE `feedback_events`;--> statement-breakpoint
ALTER TABLE `__new_feedback_events` RENAME TO `feedback_events`;--> statement-breakpoint
CREATE INDEX `feedback_events_repository_idx` ON `feedback_events` (`repository_id`);--> statement-breakpoint
CREATE TABLE `__new_interests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`positive_rules` text DEFAULT '[]' NOT NULL,
	`negative_rules` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_interests`("id", "name", "description", "positive_rules", "negative_rules", "is_active", "created_at", "updated_at") SELECT "id", "name", "description", "positive_rules", "negative_rules", "is_active", "created_at", "updated_at" FROM `interests`;--> statement-breakpoint
DROP TABLE `interests`;--> statement-breakpoint
ALTER TABLE `__new_interests` RENAME TO `interests`;--> statement-breakpoint
CREATE TABLE `__new_repo_mentions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_item_id` integer NOT NULL,
	`repository_id` integer NOT NULL,
	`mention_text` text,
	`evidence` text,
	`confidence` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_repo_mentions`("id", "source_item_id", "repository_id", "mention_text", "evidence", "confidence", "created_at", "updated_at") SELECT "id", "source_item_id", "repository_id", "mention_text", "evidence", "confidence", "created_at", "updated_at" FROM `repo_mentions`;--> statement-breakpoint
DROP TABLE `repo_mentions`;--> statement-breakpoint
ALTER TABLE `__new_repo_mentions` RENAME TO `repo_mentions`;--> statement-breakpoint
CREATE UNIQUE INDEX `repo_mentions_source_repo_idx` ON `repo_mentions` (`source_item_id`,`repository_id`);--> statement-breakpoint
CREATE INDEX `repo_mentions_repository_idx` ON `repo_mentions` (`repository_id`);--> statement-breakpoint
CREATE TABLE `__new_repositories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`github_id` integer NOT NULL,
	`full_name` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`default_branch` text,
	`language` text,
	`stars` integer DEFAULT 0 NOT NULL,
	`forks` integer DEFAULT 0 NOT NULL,
	`license` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`remote_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_repositories`("id", "github_id", "full_name", "owner", "name", "url", "description", "default_branch", "language", "stars", "forks", "license", "is_archived", "remote_updated_at", "created_at", "updated_at") SELECT "id", "github_id", "full_name", "owner", "name", "url", "description", "default_branch", "language", "stars", "forks", "license", "is_archived", "remote_updated_at", "created_at", "updated_at" FROM `repositories`;--> statement-breakpoint
DROP TABLE `repositories`;--> statement-breakpoint
ALTER TABLE `__new_repositories` RENAME TO `repositories`;--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_github_id_idx` ON `repositories` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_full_name_idx` ON `repositories` (`full_name`);--> statement-breakpoint
CREATE INDEX `repositories_language_idx` ON `repositories` (`language`);--> statement-breakpoint
CREATE TABLE `__new_source_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text DEFAULT 'manual' NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`excerpt` text,
	`published_at` text,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_source_items`("id", "kind", "url", "title", "excerpt", "published_at", "discovered_at", "created_at", "updated_at") SELECT "id", "kind", "url", "title", "excerpt", "published_at", "discovered_at", "created_at", "updated_at" FROM `source_items`;--> statement-breakpoint
DROP TABLE `source_items`;--> statement-breakpoint
ALTER TABLE `__new_source_items` RENAME TO `source_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `source_items_url_idx` ON `source_items` (`url`);--> statement-breakpoint
CREATE TABLE `__new_user_repository_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`note` text,
	`status` text DEFAULT 'candidate' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`next_action` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_repository_meta`("id", "repository_id", "tags", "note", "status", "priority", "next_action", "created_at", "updated_at") SELECT "id", "repository_id", "tags", "note", "status", "priority", "next_action", "created_at", "updated_at" FROM `user_repository_meta`;--> statement-breakpoint
DROP TABLE `user_repository_meta`;--> statement-breakpoint
ALTER TABLE `__new_user_repository_meta` RENAME TO `user_repository_meta`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_repository_meta_repository_idx` ON `user_repository_meta` (`repository_id`);--> statement-breakpoint
CREATE INDEX `user_repository_meta_status_idx` ON `user_repository_meta` (`status`);