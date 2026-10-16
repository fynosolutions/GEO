CREATE TABLE "audit_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_access_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_admin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_admin_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_budget_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"cap_micros" integer DEFAULT 20000000 NOT NULL,
	"historical_micros" integer DEFAULT 0 NOT NULL,
	"reconciled" boolean DEFAULT false NOT NULL,
	"accepting" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_budget_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_cost_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_key" text NOT NULL,
	"audit_id" uuid,
	"provider" text NOT NULL,
	"reserved_micros" integer NOT NULL,
	"actual_micros" integer,
	"status" text DEFAULT 'reserved' NOT NULL,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_cost_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"website" text NOT NULL,
	"ip_hash" text NOT NULL,
	"identity_key" text,
	"status" text DEFAULT 'awaiting_verification' NOT NULL,
	"subject" jsonb,
	"website_result" jsonb,
	"plan" jsonb,
	"plan_hash" text,
	"config_version" text,
	"current_report_version" integer DEFAULT 0 NOT NULL,
	"parent_audit_id" uuid,
	"verified_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_access_grants" ADD CONSTRAINT "audit_access_grants_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_notifications" ADD CONSTRAINT "audit_notifications_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_reports" ADD CONSTRAINT "audit_reports_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_tasks" ADD CONSTRAINT "audit_tasks_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_access_token_idx" ON "audit_access_grants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "audit_access_audit_idx" ON "audit_access_grants" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audit_admin_events_audit_idx" ON "audit_admin_events" USING btree ("audit_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_configs_version_idx" ON "audit_configs" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_cost_call_idx" ON "audit_cost_reservations" USING btree ("call_key");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_notifications_key_idx" ON "audit_notifications" USING btree ("audit_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_reports_version_idx" ON "audit_reports" USING btree ("audit_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_tasks_key_idx" ON "audit_tasks" USING btree ("audit_id","task_key");--> statement-breakpoint
CREATE INDEX "audit_tasks_pending_idx" ON "audit_tasks" USING btree ("status","kind");--> statement-breakpoint
CREATE INDEX "audits_email_created_idx" ON "audits" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "audits_state_idx" ON "audits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audits_ip_created_idx" ON "audits" USING btree ("ip_hash","created_at");
--> statement-breakpoint
-- Hand-reviewed guards: reports/configs are published as new versions. Deletion
-- remains available for retention; financial rows intentionally have no audit FK.
CREATE FUNCTION audit_reject_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published audit versions are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_reports_immutable BEFORE UPDATE ON audit_reports
FOR EACH ROW EXECUTE FUNCTION audit_reject_version_update();
--> statement-breakpoint
CREATE TRIGGER audit_configs_immutable BEFORE UPDATE ON audit_configs
FOR EACH ROW EXECUTE FUNCTION audit_reject_version_update();
--> statement-breakpoint
CREATE FUNCTION audit_protect_frozen_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.plan IS NOT NULL AND
    (NEW.plan IS DISTINCT FROM OLD.plan OR NEW.plan_hash IS DISTINCT FROM OLD.plan_hash
     OR NEW.subject IS DISTINCT FROM OLD.subject OR NEW.identity_key IS DISTINCT FROM OLD.identity_key
     OR NEW.config_version IS DISTINCT FROM OLD.config_version OR NEW.website IS DISTINCT FROM OLD.website) THEN
    RAISE EXCEPTION 'A frozen audit subject and plan require a new audit';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audits_frozen_plan BEFORE UPDATE ON audits
FOR EACH ROW EXECUTE FUNCTION audit_protect_frozen_plan();
--> statement-breakpoint
ALTER TABLE audit_budget_accounts ADD CONSTRAINT audit_cap_check
CHECK (cap_micros=20000000 AND historical_micros>=0 AND historical_micros<=20000000);
--> statement-breakpoint
ALTER TABLE audit_cost_reservations ADD CONSTRAINT audit_cost_check
CHECK (reserved_micros>0 AND reserved_micros<=20000000 AND (actual_micros IS NULL OR actual_micros>=0)
 AND status IN ('reserved','settled','released') AND (status<>'settled' OR actual_micros IS NOT NULL));
--> statement-breakpoint
ALTER TABLE audit_reports ADD CONSTRAINT audit_report_version_check CHECK (version>0);
--> statement-breakpoint
ALTER TABLE audit_access_grants ADD CONSTRAINT audit_grant_purpose_check
CHECK (purpose IN ('verification','recovery','session') AND token_hash ~ '^[a-f0-9]{64}$');
