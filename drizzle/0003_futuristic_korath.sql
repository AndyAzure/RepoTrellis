CREATE TABLE `rss_feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`etag` text,
	`last_modified` text,
	`last_fetched_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rss_feeds_url_idx` ON `rss_feeds` (`url`);--> statement-breakpoint
ALTER TABLE `source_items` ADD `processing_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_items` ADD `review_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_items` ADD `parse_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `source_items` ADD `next_retry_at` text;--> statement-breakpoint
ALTER TABLE `source_items` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `source_items` ADD `extracted_github_refs` text DEFAULT '[]' NOT NULL;