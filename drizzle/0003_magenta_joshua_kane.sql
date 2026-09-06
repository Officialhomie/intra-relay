CREATE TYPE "public"."buyer_decision" AS ENUM('ACCEPTED', 'DECLINED');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "quoted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "buyer_decision" "buyer_decision";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "buyer_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "buyer_decline_reason" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "handoff_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "closed_at" timestamp with time zone;