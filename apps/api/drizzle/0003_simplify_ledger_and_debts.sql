ALTER TABLE "balance_reconciliations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category_budgets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quick_presets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sinking_funds" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transaction_splits" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "balance_reconciliations" CASCADE;--> statement-breakpoint
DROP TABLE "category_budgets" CASCADE;--> statement-breakpoint
DROP TABLE "quick_presets" CASCADE;--> statement-breakpoint
DROP TABLE "sinking_funds" CASCADE;--> statement-breakpoint
DROP TABLE "transaction_splits" CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_commitments" ALTER COLUMN "kind" SET DEFAULT 'BILL';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "statement_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_day" integer;--> statement-breakpoint
ALTER TABLE "income_sources" ADD COLUMN "pay_days" jsonb;--> statement-breakpoint
ALTER TABLE "income_sources" ADD COLUMN "weekday" integer;--> statement-breakpoint
ALTER TABLE "income_sources" ADD COLUMN "weekday_ordinals" jsonb;--> statement-breakpoint
ALTER TABLE "income_sources" ADD COLUMN "monthly_pay_day" integer;--> statement-breakpoint
ALTER TABLE "income_sources" ADD COLUMN "anchor_date" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "commitment_id" text;--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "tags";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "receipt_uri";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "known_tags";