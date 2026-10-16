import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true });

export const audits = pgTable(
	"audits",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		email: text("email").notNull(),
		website: text("website").notNull(),
		ipHash: text("ip_hash").notNull(),
		identityKey: text("identity_key"),
		status: text("status").notNull().default("awaiting_verification"),
		subject: jsonb("subject"),
		websiteResult: jsonb("website_result"),
		plan: jsonb("plan"),
		planHash: text("plan_hash"),
		configVersion: text("config_version"),
		currentReportVersion: integer("current_report_version").notNull().default(0),
		parentAuditId: uuid("parent_audit_id"),
		verifiedAt: time("verified_at"),
		startedAt: time("started_at"),
		deadlineAt: time("deadline_at"),
		expiresAt: time("expires_at").notNull(),
		revokedAt: time("revoked_at"),
		createdAt: time("created_at").defaultNow().notNull(),
		updatedAt: time("updated_at").defaultNow().notNull(),
	},
	(t) => [
		index("audits_email_created_idx").on(t.email, t.createdAt),
		index("audits_state_idx").on(t.status),
		index("audits_ip_created_idx").on(t.ipHash, t.createdAt),
	],
).enableRLS();

export const auditTasks = pgTable(
	"audit_tasks",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		auditId: uuid("audit_id")
			.notNull()
			.references(() => audits.id, { onDelete: "cascade" }),
		taskKey: text("task_key").notNull(),
		kind: text("kind").notNull(),
		status: text("status").notNull().default("pending"),
		payload: jsonb("payload").notNull(),
		result: jsonb("result"),
		error: text("error"),
		attempts: integer("attempts").notNull().default(0),
		leaseUntil: time("lease_until"),
		dispatchedAt: time("dispatched_at"),
		completedAt: time("completed_at"),
		createdAt: time("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("audit_tasks_key_idx").on(t.auditId, t.taskKey),
		index("audit_tasks_pending_idx").on(t.status, t.kind),
	],
).enableRLS();

export const auditReports = pgTable(
	"audit_reports",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		auditId: uuid("audit_id")
			.notNull()
			.references(() => audits.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		snapshot: jsonb("snapshot").notNull(),
		sha256: text("sha256").notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: time("created_at").defaultNow().notNull(),
	},
	(t) => [uniqueIndex("audit_reports_version_idx").on(t.auditId, t.version)],
).enableRLS();

export const auditAccessGrants = pgTable(
	"audit_access_grants",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		auditId: uuid("audit_id")
			.notNull()
			.references(() => audits.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull(),
		purpose: text("purpose").notNull(),
		expiresAt: time("expires_at").notNull(),
		usedAt: time("used_at"),
		revokedAt: time("revoked_at"),
		createdAt: time("created_at").defaultNow().notNull(),
	},
	(t) => [uniqueIndex("audit_access_token_idx").on(t.tokenHash), index("audit_access_audit_idx").on(t.auditId)],
).enableRLS();

export const auditBudgetAccounts = pgTable("audit_budget_accounts", {
	id: text("id").primaryKey(),
	capMicros: integer("cap_micros").notNull().default(20000000),
	historicalMicros: integer("historical_micros").notNull().default(0),
	reconciled: boolean("reconciled").notNull().default(false),
	accepting: boolean("accepting").notNull().default(false),
	updatedBy: text("updated_by"),
	notes: text("notes"),
	updatedAt: time("updated_at").defaultNow().notNull(),
}).enableRLS();

export const auditCostReservations = pgTable(
	"audit_cost_reservations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		callKey: text("call_key").notNull(),
		auditId: uuid("audit_id"),
		provider: text("provider").notNull(),
		reservedMicros: integer("reserved_micros").notNull(),
		actualMicros: integer("actual_micros"),
		status: text("status").notNull().default("reserved"),
		usage: jsonb("usage"),
		createdAt: time("created_at").defaultNow().notNull(),
		settledAt: time("settled_at"),
	},
	(t) => [uniqueIndex("audit_cost_call_idx").on(t.callKey)],
).enableRLS();

export const auditNotifications = pgTable(
	"audit_notifications",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		auditId: uuid("audit_id")
			.notNull()
			.references(() => audits.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		kind: text("kind").notNull(),
		status: text("status").notNull().default("pending"),
		providerMessageId: text("provider_message_id"),
		attempts: integer("attempts").notNull().default(0),
		error: text("error"),
		createdAt: time("created_at").defaultNow().notNull(),
	},
	(t) => [uniqueIndex("audit_notifications_key_idx").on(t.auditId, t.key)],
).enableRLS();

export const auditConfigs = pgTable(
	"audit_configs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		version: text("version").notNull(),
		payload: jsonb("payload").notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: time("created_at").defaultNow().notNull(),
	},
	(t) => [uniqueIndex("audit_configs_version_idx").on(t.version)],
).enableRLS();

export const auditAdminEvents = pgTable(
	"audit_admin_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		auditId: uuid("audit_id"),
		actor: text("actor").notNull(),
		action: text("action").notNull(),
		reason: text("reason").notNull(),
		payload: jsonb("payload").notNull(),
		createdAt: time("created_at").defaultNow().notNull(),
	},
	(t) => [index("audit_admin_events_audit_idx").on(t.auditId, t.createdAt)],
).enableRLS();
