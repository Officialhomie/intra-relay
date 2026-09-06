CREATE TYPE "public"."attention_level" AS ENUM('INFORMATIONAL', 'ACTION_REQUIRED', 'TIME_SENSITIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."notification_audience" AS ENUM('BUYER', 'BUSINESS');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"recipient_key" text NOT NULL,
	"event" text NOT NULL,
	"level" "attention_level" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"deeplink" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"recipient_key" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("audience","recipient_key","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("audience","recipient_key");--> statement-breakpoint
CREATE INDEX "push_subscriptions_recipient_idx" ON "push_subscriptions" USING btree ("audience","recipient_key");