CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"recipient_key" text NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"push_informational" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_recipient_uq" ON "notification_preferences" USING btree ("audience","recipient_key");