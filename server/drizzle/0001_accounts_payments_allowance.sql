CREATE TABLE `account_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`transfer_group` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `money_account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_entry_user_account_idx` ON `account_entry` (`user_id`,`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `allowance` (
	`user_id` text PRIMARY KEY NOT NULL,
	`weekly_cents` integer DEFAULT 0 NOT NULL,
	`category_ids` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `card_payment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`card_id` integer NOT NULL,
	`from_account_id` integer,
	`amount_cents` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_account_id`) REFERENCES `money_account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_payment_user_date_idx` ON `card_payment` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `card_payment_user_card_idx` ON `card_payment` (`user_id`,`card_id`,`date`);--> statement-breakpoint
CREATE TABLE `money_account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `money_account_name_unique` ON `money_account` (`name`);--> statement-breakpoint
ALTER TABLE `card` ADD `account_id` integer REFERENCES money_account(id);--> statement-breakpoint
ALTER TABLE `income` ADD `account_id` integer REFERENCES money_account(id);--> statement-breakpoint
ALTER TABLE `transaction` ADD `funding_account_id` integer REFERENCES money_account(id);