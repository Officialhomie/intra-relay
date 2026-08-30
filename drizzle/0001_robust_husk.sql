ALTER TABLE "service_payments" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "route_id" text;--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "network" text;--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "asset_symbol" text;--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "amount_atomic" text;--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "authorization_key" text;--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "attribution_tag" text;--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_route_id_quote_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."quote_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_authorization_key_unique" UNIQUE("authorization_key");