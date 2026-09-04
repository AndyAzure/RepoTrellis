CREATE TABLE `digest_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digest_id` integer NOT NULL,
	`repository_id` integer NOT NULL,
	`score` real,
	`reasons` text DEFAULT '[]' NOT NULL,
	`position` integer NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`digest_id`) REFERENCES `digests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_items_digest_repo_idx` ON `digest_items` (`digest_id`,`repository_id`);--> statement-breakpoint
CREATE INDEX `digest_items_position_idx` ON `digest_items` (`digest_id`,`position`);--> statement-breakpoint
CREATE TABLE `digests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`config_snapshot` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer,
	`action` text NOT NULL,
	`reason` text,
	`source` text DEFAULT 'library' NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_events_repository_idx` ON `feedback_events` (`repository_id`);--> statement-breakpoint
CREATE TABLE `interests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`positive_rules` text DEFAULT '[]' NOT NULL,
	`negative_rules` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repo_mentions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_item_id` integer NOT NULL,
	`repository_id` integer NOT NULL,
	`mention_text` text,
	`evidence` text,
	`confidence` real,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_mentions_source_repo_idx` ON `repo_mentions` (`source_item_id`,`repository_id`);--> statement-breakpoint
CREATE INDEX `repo_mentions_repository_idx` ON `repo_mentions` (`repository_id`);--> statement-breakpoint
CREATE TABLE `repositories` (
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
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_github_id_idx` ON `repositories` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_full_name_idx` ON `repositories` (`full_name`);--> statement-breakpoint
CREATE INDEX `repositories_language_idx` ON `repositories` (`language`);--> statement-breakpoint
CREATE TABLE `source_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text DEFAULT 'manual' NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`excerpt` text,
	`published_at` text,
	`discovered_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_items_url_idx` ON `source_items` (`url`);--> statement-breakpoint
CREATE TABLE `user_repository_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`note` text,
	`status` text DEFAULT 'candidate' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`next_action` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_repository_meta_repository_idx` ON `user_repository_meta` (`repository_id`);--> statement-breakpoint
CREATE INDEX `user_repository_meta_status_idx` ON `user_repository_meta` (`status`);