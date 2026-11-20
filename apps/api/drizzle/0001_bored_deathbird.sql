ALTER TABLE "wallets" ADD COLUMN "opening_balance_minor" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "wallets" AS "w"
SET "opening_balance_minor" = "w"."balance_minor" - COALESCE((
  SELECT SUM(
    CASE
      WHEN "t"."type" = 'INCOME' AND "t"."wallet_id" = "w"."id" THEN "t"."amount_minor"
      WHEN "t"."type" = 'EXPENSE' AND "t"."wallet_id" = "w"."id" THEN -"t"."amount_minor"
      WHEN "t"."type" = 'TRANSFER' AND "t"."wallet_id" = "w"."id" THEN -"t"."amount_minor"
      WHEN "t"."type" = 'TRANSFER' AND "t"."to_wallet_id" = "w"."id" THEN "t"."amount_minor"
      ELSE 0
    END
  )::bigint
  FROM "transactions" AS "t"
  WHERE "t"."user_id" = "w"."user_id"
    AND ("t"."wallet_id" = "w"."id" OR "t"."to_wallet_id" = "w"."id")
), 0);
