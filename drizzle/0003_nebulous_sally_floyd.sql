CREATE TABLE `learning_ai_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`status` text NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL
);
