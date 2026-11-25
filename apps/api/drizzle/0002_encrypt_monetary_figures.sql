ALTER TABLE "accounts" ALTER COLUMN "balance_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "balance_reconciliations" ALTER COLUMN "app_balance_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "balance_reconciliations" ALTER COLUMN "actual_balance_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "balance_reconciliations" ALTER COLUMN "discrepancy_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "category_budgets" ALTER COLUMN "assigned_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "income_sources" ALTER COLUMN "expected_monthly_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "income_sources" ALTER COLUMN "typical_payout_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "quick_presets" ALTER COLUMN "amount_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "recurring_commitments" ALTER COLUMN "amount_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sinking_funds" ALTER COLUMN "target_amount_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sinking_funds" ALTER COLUMN "current_saved_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sinking_funds" ALTER COLUMN "monthly_contribution_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transaction_splits" ALTER COLUMN "amount_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount_minor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "monthly_budget_minor" SET DATA TYPE text;