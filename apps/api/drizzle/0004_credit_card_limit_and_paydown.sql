ALTER TABLE "accounts" ADD COLUMN "credit_limit_minor" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "monthly_payment_target_minor" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_weekday" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_weekday_ordinal" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_start_date" text;