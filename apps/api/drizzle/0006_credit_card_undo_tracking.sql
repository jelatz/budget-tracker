ALTER TABLE "accounts" ADD COLUMN "previous_paid_through_period" varchar(7);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "last_payment_transaction_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "last_payment_installment_tx_prefix" text;