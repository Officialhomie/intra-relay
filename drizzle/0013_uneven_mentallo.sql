CREATE TABLE "conversation_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"intent" jsonb NOT NULL,
	"last_intent_kind" text,
	"turns" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
