CREATE TABLE `merchant_agreement` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_agreement_merchant_idx` ON `merchant_agreement` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_alias` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_alias_merchant_idx` ON `merchant_alias` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_asset_merchant_idx` ON `merchant_asset` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_award` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_award_merchant_idx` ON `merchant_award` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `brand_versions` (
	`key` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `merchant_channel` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_channel_merchant_idx` ON `merchant_channel` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_channels` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profile_commercial` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_communication` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_communication_merchant_idx` ON `merchant_communication` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_contact` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_contact_merchant_idx` ON `merchant_contact` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_content` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_copy` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_copy_merchant_idx` ON `merchant_copy` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_credential` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_credential_merchant_idx` ON `merchant_credential` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_credentials` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_date_exception` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_date_exception_merchant_idx` ON `merchant_date_exception` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_deposit` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_deposit_merchant_idx` ON `merchant_deposit` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_dish` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_dish_merchant_idx` ON `merchant_dish` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_dish_spec` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_dish_spec_merchant_idx` ON `merchant_dish_spec` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_evidence_merchant_idx` ON `merchant_evidence` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_fee` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_fee_merchant_idx` ON `merchant_fee` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_former_name` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_former_name_merchant_idx` ON `merchant_former_name` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_identity` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profile_location` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_media` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_media_merchant_idx` ON `merchant_media` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_menu` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_menu_merchant_idx` ON `merchant_menu` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`brand_id` text,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived` integer NOT NULL,
	`archived_at` text,
	`brand_snapshot` text,
	`collections` text NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchants_brand_idx` ON `merchants` (`brand_id`);--> statement-breakpoint
CREATE INDEX `merchants_updated_idx` ON `merchants` (`updated_at`);--> statement-breakpoint
CREATE TABLE `merchant_minimum` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_minimum_merchant_idx` ON `merchant_minimum` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_offering` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profile_operations` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_package` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_package_merchant_idx` ON `merchant_package` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_person` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_person_merchant_idx` ON `merchant_person` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_price` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_price_merchant_idx` ON `merchant_price` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_versions` (
	`key` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`version` integer NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`body` text NOT NULL,
	`change` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `profile_versions_merchant_idx` ON `profile_versions` (`merchant_id`,`version`);--> statement-breakpoint
CREATE TABLE `merchant_promotion` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_promotion_merchant_idx` ON `merchant_promotion` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_relationship` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_room` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_room_merchant_idx` ON `merchant_room` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_scene` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_scene_merchant_idx` ON `merchant_scene` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_service` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_service_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_service_rule_merchant_idx` ON `merchant_service_rule` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchant_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_snapshot_merchant_idx` ON `merchant_snapshot` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `profile_space` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchant_table` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_table_merchant_idx` ON `merchant_table` (`merchant_id`);