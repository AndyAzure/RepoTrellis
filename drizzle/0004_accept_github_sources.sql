UPDATE `source_items`
SET
	`processing_status` = 'ready',
	`review_status` = 'accepted',
	`last_error` = NULL,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `kind` = 'github';
