CREATE TABLE `gift_record` (
	`id` varchar(64) NOT NULL,
	`player_id` varchar(64) NOT NULL,
	`gift_tier_cents` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`total_cents` int NOT NULL,
	`fee_rate_bp` int NOT NULL,
	`platform_fee_cents` int NOT NULL,
	`player_earn_cents` int NOT NULL,
	`sender_nickname` varchar(100) NOT NULL,
	`note` varchar(500),
	`operator_id` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `gift_record_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user` ADD `last_gift_seen_at` datetime(3);
--> statement-breakpoint
ALTER TABLE `gift_record` ADD CONSTRAINT `gift_record_player_id_user_id_fk` FOREIGN KEY (`player_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `gift_record_player_idx` ON `gift_record` (`player_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `gift_record_created_idx` ON `gift_record` (`created_at`);
