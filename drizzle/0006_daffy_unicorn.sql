CREATE TYPE "public"."pricing_model" AS ENUM('FIXED', 'STARTING_FROM', 'QUOTE_REQUIRED');--> statement-breakpoint
ALTER TYPE "public"."quote_status" ADD VALUE 'PROPOSED' BEFORE 'EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."quote_status" ADD VALUE 'SUPERSEDED' BEFORE 'EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."quote_status" ADD VALUE 'WITHDRAWN' BEFORE 'EXPIRED';--> statement-breakpoint
ALTER TABLE "quote_routes" ADD COLUMN "pricing_model" "pricing_model" DEFAULT 'QUOTE_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_routes" ADD COLUMN "price_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "quote_routes" ADD COLUMN "price_unit" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "supersedes_quote_id" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "change_reason" text;