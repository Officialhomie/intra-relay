CREATE TYPE "public"."proofline_actor_role" AS ENUM('merchant', 'buyer');--> statement-breakpoint
CREATE TYPE "public"."proofline_confirmation_method" AS ENUM('merchant_manage_token', 'buyer_session', 'one_time_code');--> statement-breakpoint
CREATE TYPE "public"."proofline_event_type" AS ENUM('READY_FOR_PICKUP', 'PICKUP_CONFIRMED');--> statement-breakpoint
CREATE TYPE "public"."proofline_evidence_status" AS ENUM('NOT_STARTED', 'MERCHANT_MARKED_READY', 'BUYER_CONFIRMED_PICKUP');--> statement-breakpoint
CREATE TABLE "proofline_events" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"event_type" "proofline_event_type" NOT NULL,
	"actor_role" "proofline_actor_role" NOT NULL,
	"confirmation_method" "proofline_confirmation_method" NOT NULL,
	"evidence_status" "proofline_evidence_status" NOT NULL,
	"pickup_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proofline_events" ADD CONSTRAINT "proofline_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;