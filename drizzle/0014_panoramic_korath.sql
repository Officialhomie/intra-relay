ALTER TABLE "quote_routes" ADD COLUMN "service_area" text;--> statement-breakpoint
ALTER TABLE "quote_routes" ADD COLUMN "pickup_available" boolean;--> statement-breakpoint
ALTER TABLE "quote_routes" ADD COLUMN "delivery_available" boolean;--> statement-breakpoint
ALTER TABLE "quote_routes" ADD COLUMN "typical_turnaround" text;