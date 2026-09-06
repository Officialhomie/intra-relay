CREATE TYPE "public"."attestation_outcome" AS ENUM('COMPLETED', 'PARTIAL', 'DISPUTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."handover_attestation_status" AS ENUM('PENDING_CODE', 'PENDING_SIGNATURE', 'ATTESTED', 'ATTESTATION_FAILED');--> statement-breakpoint
CREATE TABLE "handover_attestations" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"commitment_id" text NOT NULL,
	"provider_address" text NOT NULL,
	"buyer_address" text NOT NULL,
	"outcome" "attestation_outcome",
	"fulfilled_at" timestamp with time zone,
	"revealed_code" text,
	"revealed_salt" text,
	"sign_nonce" text,
	"sign_deadline" timestamp with time zone,
	"status" "handover_attestation_status" DEFAULT 'PENDING_CODE' NOT NULL,
	"ref_uid" text,
	"attestation_uid" text,
	"attestation_tx_hash" text,
	"attestation_mode" text,
	"attestation_error" text,
	"attested_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_attestations_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
ALTER TABLE "handover_attestations" ADD CONSTRAINT "handover_attestations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_attestations" ADD CONSTRAINT "handover_attestations_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE cascade ON UPDATE no action;