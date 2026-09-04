CREATE VIRTUAL TABLE `repositories_fts` USING fts5(
	`full_name`,
	`description`,
	`language`,
	content=`repositories`,
	content_rowid=`id`,
	tokenize='unicode61 remove_diacritics 2'
);--> statement-breakpoint
INSERT INTO `repositories_fts`(`repositories_fts`) VALUES ('rebuild');--> statement-breakpoint
CREATE TRIGGER `repositories_fts_ai` AFTER INSERT ON `repositories` BEGIN
	INSERT INTO `repositories_fts`(`rowid`, `full_name`, `description`, `language`)
	VALUES (new.`id`, new.`full_name`, coalesce(new.`description`, ''), coalesce(new.`language`, ''));
END;--> statement-breakpoint
CREATE TRIGGER `repositories_fts_ad` AFTER DELETE ON `repositories` BEGIN
	INSERT INTO `repositories_fts`(`repositories_fts`, `rowid`, `full_name`, `description`, `language`)
	VALUES ('delete', old.`id`, old.`full_name`, coalesce(old.`description`, ''), coalesce(old.`language`, ''));
END;--> statement-breakpoint
CREATE TRIGGER `repositories_fts_au` AFTER UPDATE ON `repositories` BEGIN
	INSERT INTO `repositories_fts`(`repositories_fts`, `rowid`, `full_name`, `description`, `language`)
	VALUES ('delete', old.`id`, old.`full_name`, coalesce(old.`description`, ''), coalesce(old.`language`, ''));
	INSERT INTO `repositories_fts`(`rowid`, `full_name`, `description`, `language`)
	VALUES (new.`id`, new.`full_name`, coalesce(new.`description`, ''), coalesce(new.`language`, ''));
END;
