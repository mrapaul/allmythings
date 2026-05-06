CREATE TABLE `homes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`primary_photo_uri` text NOT NULL,
	`additional_photo_uris` text DEFAULT '[]' NOT NULL,
	`box_x` real NOT NULL,
	`box_y` real NOT NULL,
	`box_width` real NOT NULL,
	`box_height` real NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_items_home_idx` ON `inventory_items` (`home_id`);--> statement-breakpoint
CREATE INDEX `inventory_items_created_at_idx` ON `inventory_items` (`created_at`);--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`item_id`, `tag`),
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_tags_item_idx` ON `item_tags` (`item_id`);--> statement-breakpoint
CREATE INDEX `item_tags_tag_idx` ON `item_tags` (`tag`);