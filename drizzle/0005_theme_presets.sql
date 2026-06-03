ALTER TABLE `site_settings` DROP COLUMN `theme_color`;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `theme_preset` varchar(30) NOT NULL DEFAULT 'default';--> statement-breakpoint
ALTER TABLE `site_settings` ADD `custom_theme_css` text;
