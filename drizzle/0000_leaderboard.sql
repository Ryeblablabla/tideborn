CREATE TABLE `leaderboard_scores` (
	`run_id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`length_tenths` integer NOT NULL,
	`submitted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leaderboard_fast` ON `leaderboard_scores` (`duration_ms`,"length_tenths" desc,`submitted_at`,`run_id`);--> statement-breakpoint
CREATE INDEX `leaderboard_long` ON `leaderboard_scores` ("length_tenths" desc,`duration_ms`,`submitted_at`,`run_id`);