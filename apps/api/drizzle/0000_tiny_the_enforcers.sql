CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"balance_minor" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "accounts_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "balance_reconciliations" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"app_balance_minor" bigint NOT NULL,
	"actual_balance_minor" bigint NOT NULL,
	"discrepancy_minor" bigint NOT NULL,
	"reconciled_at" timestamp with time zone NOT NULL,
	"adjustment_transaction_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "balance_reconciliations_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"default_order" integer DEFAULT 0 NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categories_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "category_budgets" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"category_id" text NOT NULL,
	"period_month" varchar(7) NOT NULL,
	"assigned_minor" bigint NOT NULL,
	"rollover_enabled" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "category_budgets_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "quick_presets" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"label" text NOT NULL,
	"icon" text NOT NULL,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"category_id" text,
	"merchant" text,
	"tags" jsonb NOT NULL,
	"default_order" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quick_presets_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "recurring_commitments" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'RECURRING' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"account_id" text NOT NULL,
	"category_id" text NOT NULL,
	"frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"due_day" integer NOT NULL,
	"due_label" text,
	"next_due_date" text,
	"previous_next_due_date" text,
	"is_auto_paid" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"total_installments" integer,
	"paid_installments" integer DEFAULT 0 NOT NULL,
	"last_paid_period" varchar(7),
	"last_paid_transaction_id" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recurring_commitments_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sinking_funds" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"target_amount_minor" bigint NOT NULL,
	"current_saved_minor" bigint NOT NULL,
	"target_date" text NOT NULL,
	"account_id" text NOT NULL,
	"monthly_contribution_minor" bigint NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sinking_funds_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"user_id" text NOT NULL,
	"op_id" text NOT NULL,
	"mutation_type" text NOT NULL,
	"applied_revision" bigint NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_operations_user_id_op_id_pk" PRIMARY KEY("user_id","op_id")
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"user_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"id" text NOT NULL,
	"category_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "transaction_splits_user_id_transaction_id_id_pk" PRIMARY KEY("user_id","transaction_id","id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"category_id" text,
	"merchant" text,
	"tags" jsonb NOT NULL,
	"note" text,
	"receipt_uri" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "transactions_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_account_id" text NOT NULL,
	"last_transfer_to_account_id" text,
	"recent_merchants" jsonb NOT NULL,
	"known_tags" jsonb NOT NULL,
	"monthly_budget_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"state_revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_reconciliations" ADD CONSTRAINT "balance_reconciliations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_budgets" ADD CONSTRAINT "category_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_presets" ADD CONSTRAINT "quick_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_commitments" ADD CONSTRAINT "recurring_commitments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sinking_funds" ADD CONSTRAINT "sinking_funds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_user_id_transaction_id_transactions_user_id_id_fk" FOREIGN KEY ("user_id","transaction_id") REFERENCES "public"."transactions"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_occurred_idx" ON "transactions" USING btree ("user_id","occurred_at");