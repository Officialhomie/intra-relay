CREATE TYPE "public"."commitment_expiry_source" AS ENUM('QUOTE_EXPIRY', 'DEFAULT_WINDOW');--> statement-breakpoint
CREATE TYPE "public"."commitment_status" AS ENUM('PENDING_ATTESTATION', 'ATTESTED', 'ATTESTATION_FAILED');--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"quote_id" text NOT NULL,
	"business_id" text NOT NULL,
	"job_ref" text NOT NULL,
	"provider_address" text NOT NULL,
	"provider_agent_id" text DEFAULT '0' NOT NULL,
	"buyer_address" text NOT NULL,
	"amount_minor" text NOT NULL,
	"currency" "quote_currency" NOT NULL,
	"asset_address" text NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"expiry_source" "commitment_expiry_source" NOT NULL,
	"handover_commit" text NOT NULL,
	"handover_salt" text NOT NULL,
	"handover_code" text NOT NULL,
	"status" "commitment_status" DEFAULT 'PENDING_ATTESTATION' NOT NULL,
	"attestation_uid" text,
	"attestation_tx_hash" text,
	"attestation_mode" text,
	"attestation_error" text,
	"attested_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commitments_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;