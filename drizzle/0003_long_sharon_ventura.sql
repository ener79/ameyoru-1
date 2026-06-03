CREATE TABLE `announcement` (
	`id` varchar(64) NOT NULL,
	`type` enum('NOTICE','ACTIVITY') NOT NULL DEFAULT 'NOTICE',
	`title` varchar(100) NOT NULL,
	`content` text,
	`is_permanent` boolean NOT NULL DEFAULT false,
	`start_at` datetime(3),
	`end_at` datetime(3),
	`sort_order` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_by_id` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `announcement_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` varchar(64) NOT NULL,
	`actor_id` varchar(64) NOT NULL,
	`actor_name` varchar(64) NOT NULL,
	`action` varchar(50) NOT NULL,
	`target_type` varchar(30) NOT NULL,
	`target_id` varchar(64),
	`detail` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `gift_record` ADD `submitter_id` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `gift_record` ADD `settle_status` enum('UNSETTLED','SETTLED') DEFAULT 'UNSETTLED' NOT NULL;--> statement-breakpoint
ALTER TABLE `gift_record` ADD `settled_at` datetime(3);--> statement-breakpoint
ALTER TABLE `gift_record` ADD `paid_method` enum('WECHAT','ALIPAY');--> statement-breakpoint
ALTER TABLE `user` ADD `deposit_paid` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_announcement_enabled` ON `announcement` (`enabled`,`sort_order`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_target_idx` ON `audit_log` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `gift_record_settle_idx` ON `gift_record` (`settle_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `gift_record_sender_idx` ON `gift_record` (`sender_nickname`);
