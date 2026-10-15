CREATE TABLE "restaurant_geo_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_geo_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "restaurant_geo_records" ADD CONSTRAINT "restaurant_geo_records_store_id_restaurant_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."restaurant_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_geo_record_key_idx" ON "restaurant_geo_records" USING btree ("store_id","kind","key");--> statement-breakpoint
CREATE INDEX "restaurant_geo_record_store_idx" ON "restaurant_geo_records" USING btree ("store_id","created_at");
--> statement-breakpoint
CREATE TRIGGER restaurant_geo_records_immutable BEFORE UPDATE OR DELETE ON restaurant_geo_records
FOR EACH ROW EXECUTE FUNCTION restaurant_reject_mutation();
