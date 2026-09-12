CREATE TYPE "public"."onboarding_status" AS ENUM('RECEIVED', 'NEEDS_REVIEW', 'PROCESSED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "onboarding_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"tally_form_id" text NOT NULL,
	"tally_submission_id" text NOT NULL,
	"tally_event_id" text NOT NULL,
	"tally_submission_preview_url" text,
	"status" "onboarding_status" DEFAULT 'RECEIVED' NOT NULL,
	"normalized_data" jsonb NOT NULL,
	"issues" jsonb,
	"business_id" text,
	"route_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_submissions_tally_submission_id_unique" UNIQUE("tally_submission_id")
);
--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_route_id_quote_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."quote_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_submissions_status_idx" ON "onboarding_submissions" USING btree ("status");