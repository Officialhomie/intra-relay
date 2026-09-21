ALTER TABLE "conversation_sessions" ADD COLUMN "actor_role" text DEFAULT 'buyer' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "actor_external_user_id" text;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "business_id" text;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "channel" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "external_conversation_id" text;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "workflow_state" jsonb;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "pending_question" text;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "last_action" text;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
