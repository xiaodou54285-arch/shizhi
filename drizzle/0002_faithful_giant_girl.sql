CREATE TABLE `learning_quark_auth` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_quark_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`fid` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_quark_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`fid` text NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `learning_files` ADD `quark_fid` text;--> statement-breakpoint
ALTER TABLE `learning_files` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `learning_files` ADD `archive_locked_until` integer DEFAULT 0 NOT NULL;