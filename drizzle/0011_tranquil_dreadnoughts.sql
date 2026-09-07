CREATE TYPE "public"."order_payment_status" AS ENUM('CREATED', 'AWAITING_WALLET', 'SUBMITTED', 'CONFIRMING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"quote_id" text NOT NULL,
	"commitment_id" text NOT NULL,
	"buyer_session" text NOT NULL,
	"business_id" text NOT NULL,
	"recipient_address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"asset" text NOT NULL,
	"asset_address" text NOT NULL,
	"amount_atomic" text NOT NULL,
	"amount_ngn_minor" text NOT NULL,
	"ngn_usd_rate" text NOT NULL,
	"rate_source" text NOT NULL,
	"rate_locked_at" timestamp with time zone NOT NULL,
	"status" "order_payment_status" DEFAULT 'CREATED' NOT NULL,
	"tx_hash" text,
	"payer_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"error" text,
	"verify_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_payments_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_payments_task_idx" ON "order_payments" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_live_commitment_uq" ON "order_payments" USING btree ("commitment_id") WHERE status in ('CREATED','AWAITING_WALLET','SUBMITTED','CONFIRMING');