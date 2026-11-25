CREATE TABLE "income_sources" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"expected_monthly_minor" bigint NOT NULL,
	"typical_payout_minor" bigint,
	"currency" varchar(3) NOT NULL,
	"account_id" text NOT NULL,
	"category_id" text NOT NULL,
	"pay_schedule" text DEFAULT 'SEMI_MONTHLY' NOT NULL,
	"pay_days_label" text,
	"color" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "income_sources_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "income_source_id" text;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;