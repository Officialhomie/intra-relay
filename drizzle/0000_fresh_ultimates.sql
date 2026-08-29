CREATE TYPE "public"."business_category" AS ENUM('printing', 'design', 'catering', 'delivery', 'other');--> statement-breakpoint
CREATE TYPE "public"."business_status" AS ENUM('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."contact_channel_type" AS ENUM('whatsapp', 'email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('NOT_REQUIRED', 'REQUESTED_402', 'AUTHORISED', 'SETTLED', 'FAILED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."quote_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."quote_currency" AS ENUM('NGN', 'USD', 'USDm', 'cUSD', 'cNGN', 'USDC', 'USDT');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('PENDING', 'RECEIVED', 'EXPIRED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."route_status" AS ENUM('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('DRAFT', 'SUBMITTED', 'AWAITING_QUOTE', 'RECOMMENDED', 'HANDOFF_READY', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"task_id" text,
	"business_id" text,
	"route_id" text,
	"quote_id" text,
	"payment_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_channel_type" "contact_channel_type" NOT NULL,
	"contact_channel_value" text NOT NULL,
	"category" "business_category" NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"payout_address" text NOT NULL,
	"quote_currency" "quote_currency" NOT NULL,
	"manage_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"consent_at" timestamp with time zone,
	"verified_by_operator_at" timestamp with time zone,
	"verified_by_operator_label" text,
	"status" "business_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"useful" boolean NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb NOT NULL,
	"query_fee_usd" numeric(10, 4) NOT NULL,
	"response_sla_minutes" integer NOT NULL,
	"quote_currency" "quote_currency" NOT NULL,
	"payout_address" text NOT NULL,
	"endpoint" text NOT NULL,
	"status" "route_status" DEFAULT 'DRAFT' NOT NULL,
	"price_updated_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"activation_checklist" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"route_id" text NOT NULL,
	"amount_min" numeric(14, 2) NOT NULL,
	"amount_max" numeric(14, 2),
	"currency" "quote_currency" NOT NULL,
	"turnaround" text NOT NULL,
	"availability_note" text,
	"delivery_charge" numeric(14, 2),
	"assumptions" text,
	"confidence" "quote_confidence",
	"fixed" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "quote_status" DEFAULT 'RECEIVED' NOT NULL,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"quote_id" text NOT NULL,
	"rationale" text NOT NULL,
	"confidence" "quote_confidence",
	"order_message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendations_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "service_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"service" text NOT NULL,
	"resource" text NOT NULL,
	"max_fee_usd" numeric(10, 4) NOT NULL,
	"asset" text,
	"payer" text,
	"payee" text,
	"status" "payment_status" DEFAULT 'NOT_REQUIRED' NOT NULL,
	"tx_hash" text,
	"verification" jsonb,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_payments_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"buyer_wallet_opt_in" boolean DEFAULT false NOT NULL,
	"route_id" text,
	"free_text" text,
	"structured_input" jsonb,
	"status" "task_status" DEFAULT 'DRAFT' NOT NULL,
	"failure_reason" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_routes" ADD CONSTRAINT "quote_routes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_route_id_quote_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."quote_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_route_id_quote_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."quote_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key_uq" ON "idempotency_keys" USING btree ("scope","key");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_routes_business_slug_uq" ON "quote_routes" USING btree ("business_id","slug");