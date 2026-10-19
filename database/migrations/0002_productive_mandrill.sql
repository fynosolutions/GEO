CREATE TABLE `merchant_options` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_options_kind_label_idx` ON `merchant_options` (`kind`,`label`);