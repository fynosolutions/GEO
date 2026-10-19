CREATE TABLE `merchant_menu_category` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_menu_category_merchant_idx` ON `merchant_menu_category` (`merchant_id`);