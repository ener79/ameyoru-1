CREATE TABLE `site_settings` (
	`id` varchar(64) NOT NULL,
	`site_name` varchar(100) NOT NULL DEFAULT '起点乱斗',
	`logo_path` varchar(500),
	`contact_info` varchar(500),
	`footer_text` varchar(500),
	`theme_color` varchar(30) NOT NULL DEFAULT 'indigo',
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `site_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `announcement` ADD `content_json` text;--> statement-breakpoint
ALTER TABLE `announcement` ADD `image_path` varchar(500);
