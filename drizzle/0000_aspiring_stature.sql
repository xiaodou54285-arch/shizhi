CREATE TABLE `learning_files` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_id` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_workspaces` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`snapshot` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
