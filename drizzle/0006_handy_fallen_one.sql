CREATE TABLE `repository_analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text DEFAULT 'local-rules-v1' NOT NULL,
	`summary` text,
	`topics` text DEFAULT '[]' NOT NULL,
	`tech_stack` text DEFAULT '[]' NOT NULL,
	`use_cases` text DEFAULT '[]' NOT NULL,
	`risks` text DEFAULT '[]' NOT NULL,
	`confidence` real,
	`source_snapshot` text DEFAULT '{}' NOT NULL,
	`last_error` text,
	`generated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_analyses_repository_idx` ON `repository_analyses` (`repository_id`);--> statement-breakpoint
CREATE INDEX `repository_analyses_status_idx` ON `repository_analyses` (`status`);