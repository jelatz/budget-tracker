ALTER TABLE "accounts" ADD COLUMN "paid_through_period" varchar(7);--> statement-breakpoint
ALTER TABLE "recurring_commitments" ADD COLUMN "previous_last_paid_period" varchar(7);--> statement-breakpoint
ALTER TABLE "recurring_commitments" ADD COLUMN "last_paid_cycles" integer;