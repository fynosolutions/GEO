import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import type { DbConnection } from "../db/db-connection";
import { getCredential } from "../secrets";
import { getKeyring } from "../secrets/crypto";
import {
	assertProjectBudget,
	priceReviewIsCurrent,
	readProjectBudget,
	reconcileProjectBudget,
	reserveCallBudget,
	rows,
	usdMicros,
	worstCallMicros,
} from "./budget";
import { defaultAuditConfig, validateAuditConfig } from "./config";
import {
	type AuditAnswer,
	type AuditConfig,
	type AuditReportSnapshot,
	type AuditSampleResult,
	auditWebsiteSchema,
	type FrozenAuditPlan,
	type RestaurantSubject,
	type RestaurantWebsiteResult,
	restaurantSubjectSchema,
} from "./contracts";
import { unknownJudgment, validateJudgment } from "./judgment";
import { auditHash, buildAuditPlan } from "./plan";
import { checkAuditQualityEvidence } from "./release";
import { buildAuditReport, renderAuditReportHtml } from "./report";
import type { AuditRuntimeResult, AuditRuntimeTask } from "./runtime";
import {
	eraseAuditArtifacts,
	newToken,
	publicAuditValue,
	readAuditArtifact,
	sealAuditPayload,
	tokenHash,
	unsealAuditPayload,
	writeAuditArtifact,
} from "./storage";

type AuditRow = {
	id: string;
	email: string;
	website: string;
	status: string;
	identity_key: string | null;
	subject: RestaurantSubject | null;
	website_result: RestaurantWebsiteResult | null;
	plan: FrozenAuditPlan | null;
	current_report_version: number;
	verified_at: Date | null;
	started_at: Date | null;
	deadline_at: Date | null;
	expires_at: Date;
	revoked_at: Date | null;
	created_at: Date;
};
type TaskRow = {
	id: string;
	audit_id: string;
	task_key: string;
	kind: string;
	status: string;
	payload: unknown;
	result: unknown;
	error: string | null;
	attempts: number;
	lease_until: Date | null;
	dispatched_at: Date | null;
};
export type AuditAdmin = { id: string; role: string };
export class AuditError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
	) {
		super(message);
		this.name = "AuditError";
	}
}
const id = (value: string) => z.uuid().parse(value);
const json = (value: unknown) => JSON.stringify(value);
const testMode = () => process.env.NODE_ENV === "test" && process.env.AUDIT_TEST_MODE === "1";
const closedStatuses = new Set(["completed", "partial", "failed", "cancelled"]);
const emptyWebsite = (): RestaurantWebsiteResult => ({
	pageFetch: { status: "unknown" },
	businessExtraction: { status: "unknown" },
	websiteAudit: { status: "unknown" },
	actionChecks: [],
	evidenceRefs: [],
});
const terminalTasks = ["succeeded", "failed", "uncertain", "skipped"];

function appOrigin() {
	const value = new URL(process.env.APP_URL ?? "http://localhost:3010");
	if (!["https:", "http:"].includes(value.protocol) || value.username || value.password)
		throw new AuditError(503, "configuration_required", "The public service is not configured");
	return value.origin;
}
export function hashAuditIp(value: string) {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret || secret.length < 32)
		throw new AuditError(503, "configuration_required", "The public service is not configured");
	return createHmac("sha256", secret).update(`audit-ip:${value}`).digest("hex");
}
function normalizeWebsite(value: string) {
	const url = new URL(value.includes("://") ? value : `https://${value}`);
	if (
		(url.port && !["80", "443"].includes(url.port)) ||
		/(^localhost$|\.localhost$|\.local$|\.internal$)/i.test(url.hostname)
	)
		throw new AuditError(400, "invalid_website", "Provide a public restaurant website");
	url.hash = "";
	return auditWebsiteSchema.parse(url.toString());
}
function ensureAdmin(actor: AuditAdmin) {
	if (actor.role !== "admin" || !actor.id)
		throw new AuditError(403, "forbidden", "Internal administrator access is required");
}
async function auditRow(connection: DbConnection, auditId: string, lock = false, administrative = false) {
	const [audit] = await rows<AuditRow>(
		connection,
		sql`select * from audits where id=${id(auditId)}::uuid ${lock ? sql`for update` : sql``}`,
	);
	if (!audit || (!administrative && (audit.revoked_at || new Date(audit.expires_at).getTime() <= Date.now())))
		throw new AuditError(404, "not_found", "This audit is unavailable");
	return audit;
}
async function config(connection: DbConnection): Promise<AuditConfig> {
	const [current] = await rows<{ payload: unknown }>(
		connection,
		sql`select payload from audit_configs where payload ? 'targets' order by created_at desc,id desc limit 1`,
	);
	if (current) return validateAuditConfig(current.payload);
	if (process.env.AUDIT_TARGETS) {
		const targets: unknown = JSON.parse(process.env.AUDIT_TARGETS);
		return validateAuditConfig({
			...defaultAuditConfig,
			version: `environment:${auditHash(targets).slice(0, 20)}`,
			targets,
		});
	}
	return structuredClone(defaultAuditConfig);
}
const admissionLimitsSchema = z.object({
	perIpDaily: z.number().int().min(1).max(3),
	totalDaily: z.number().int().min(1).max(100),
});
async function admissionLimits(connection: DbConnection) {
	const [current] = await rows<{ payload: unknown }>(
		connection,
		sql`select payload from audit_configs where payload->>'kind'='admission-limits' order by created_at desc,id desc limit 1`,
	);
	return current ? admissionLimitsSchema.parse(current.payload) : { perIpDaily: 3, totalDaily: 25 };
}
async function logAdmin(
	connection: DbConnection,
	actor: AuditAdmin,
	action: string,
	auditId: string | undefined,
	reason: string,
	payload: unknown,
) {
	await connection.execute(
		sql`insert into audit_admin_events(audit_id,actor,action,reason,payload) values(${auditId ?? null}::uuid,${actor.id},${action},${reason},${json(payload)}::jsonb)`,
	);
}
async function enqueue(connection: DbConnection, auditId: string, taskKey: string, task: AuditRuntimeTask) {
	const payload = task.type === "email" ? await sealAuditPayload(auditId, task) : task;
	await connection.execute(
		sql`insert into audit_tasks(audit_id,task_key,kind,payload) values(${auditId}::uuid,${taskKey},${task.type},${json(payload)}::jsonb) on conflict(audit_id,task_key) do nothing`,
	);
}
async function queueMail(
	connection: DbConnection,
	audit: Pick<AuditRow, "id" | "email" | "subject">,
	kind: "verification" | "recovery" | "report_ready",
	suffix: string,
) {
	const key = `${kind}:${suffix}`;
	const [existing] = await rows<{ id: string }>(
		connection,
		sql`select id from audit_notifications where audit_id=${audit.id}::uuid and key=${key}`,
	);
	if (existing) return;
	const token = newToken();
	await connection.execute(
		sql`insert into audit_access_grants(audit_id,token_hash,purpose,expires_at) values(${audit.id}::uuid,${tokenHash(token)},${kind === "verification" ? "verification" : "recovery"},now()+interval '30 minutes')`,
	);
	const link = `${appOrigin()}/audit/verify#auditId=${audit.id}&token=${token}`;
	await enqueue(connection, audit.id, `mail:${key}`, {
		type: "email",
		to: audit.email,
		kind,
		link,
		restaurantName: audit.subject?.name,
		idempotencyKey: `audit:${audit.id}:${key}`,
	});
	await connection.execute(
		sql`insert into audit_notifications(audit_id,key,kind) values(${audit.id}::uuid,${key},${kind})`,
	);
}

export async function getAuditAvailability() {
	try {
		if (process.env.PUBLIC_AUDIT_ENABLED !== "1")
			return { enabled: false, reason: "Free reports are currently paused." };
		if (!testMode() && process.env.AUDIT_SHARED_BUDGET_ENABLED !== "1")
			return { enabled: false, reason: "The shared project budget is awaiting setup." };
		if (!getKeyring()) return { enabled: false, reason: "Private delivery is not configured." };
		const budget = await readProjectBudget(db);
		if (!budget.reconciled || !budget.accepting || budget.remainingMicros <= 0)
			return { enabled: false, reason: "Free reports are currently paused." };
		const currentConfig = await config(db);
		const completePlanMicros = currentConfig.targets.reduce(
			(total, target) => total + 10 * worstCallMicros(target),
			20 * worstCallMicros(currentConfig.targets[0], true),
		);
		if (budget.remainingMicros < completePlanMicros)
			return { enabled: false, reason: "The remaining trial budget cannot cover another complete report." };
		if (
			!testMode() &&
			(!priceReviewIsCurrent() ||
				process.env.PUBLIC_AUDIT_LIVE_CALLS_ENABLED !== "1" ||
				!getCredential("OPENAI_API_KEY") ||
				!getCredential("OPENROUTER_API_KEY") ||
				!process.env.RESEND_API_KEY ||
				!process.env.RESEND_FROM_EMAIL)
		)
			return { enabled: false, reason: "The report service is awaiting its provider checks." };
		if (!testMode() && !(await checkAuditQualityEvidence(currentConfig)).passed)
			return { enabled: false, reason: "The report service is awaiting its classification quality review." };
		return { enabled: true };
	} catch {
		return { enabled: false, reason: "The report service is awaiting setup." };
	}
}

export async function createAudit(input: { website: string; email: string; ipHash: string }) {
	const availability = await getAuditAvailability();
	if (!availability.enabled) throw new AuditError(503, "paused", availability.reason ?? "Free reports are paused");
	const email = z.email().max(320).parse(input.email.trim().toLowerCase());
	const website = normalizeWebsite(input.website);
	const ipHash = z.string().min(1).max(128).parse(input.ipHash);
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('audit-global-admission',0))`);
		const limits = await admissionLimits(tx);
		const [daily] = await rows<{ total: string }>(
			tx,
			sql`select count(*)::text total from audits where created_at>now()-interval '1 day'`,
		);
		if (Number(daily.total) >= limits.totalDaily)
			throw new AuditError(429, "rate_limited", "The daily request limit has been reached");
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit-submit:${ipHash}`},0))`);
		const [count] = await rows<{ total: string }>(
			tx,
			sql`select count(*)::text total from audits where ip_hash=${ipHash} and created_at>now()-interval '1 day'`,
		);
		if (Number(count.total) >= limits.perIpDaily)
			throw new AuditError(429, "rate_limited", "The daily request limit has been reached");
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit-email:${email}`},0))`);
		const [recent] = await rows<AuditRow>(
			tx,
			sql`select * from audits where email=${email} and website=${website} and plan is null and status in ('awaiting_verification','preparing_subject','awaiting_confirmation') and revoked_at is null and expires_at>now() and created_at>now()-interval '7 days' order by created_at desc limit 1`,
		);
		if (recent) {
			const [sent] = await rows<{ count: string }>(
				tx,
				sql`select count(*)::text count from audit_notifications where audit_id=${recent.id}::uuid and created_at>now()-interval '1 hour'`,
			);
			if (Number(sent.count) < 3)
				await queueMail(
					tx,
					recent,
					recent.verified_at ? "recovery" : "verification",
					`request:${Math.floor(Date.now() / 60000)}`,
				);
			return { auditId: recent.id, status: "awaiting_verification" };
		}
		const [audit] = await rows<AuditRow>(
			tx,
			sql`insert into audits(email,website,ip_hash,expires_at) values(${email},${website},${ipHash},now()+interval '30 days') returning *`,
		);
		await queueMail(tx, audit, "verification", "initial");
		return { auditId: audit.id, status: audit.status };
	});
}

export async function verifyAuditToken(input: { auditId: string; token: string }) {
	const auditId = id(input.auditId);
	if (!/^[a-zA-Z\d_-]{43}$/.test(input.token))
		throw new AuditError(403, "invalid_link", "This verification link is invalid or expired");
	return db.transaction(async (tx) => {
		const audit = await auditRow(tx, auditId, true);
		const [grant] = await rows<{ id: string }>(
			tx,
			sql`update audit_access_grants set used_at=now() where audit_id=${auditId}::uuid and token_hash=${tokenHash(input.token)} and purpose in ('verification','recovery') and used_at is null and revoked_at is null and expires_at>now() returning id`,
		);
		if (!grant) throw new AuditError(403, "invalid_link", "This verification link is invalid or expired");
		const sessionToken = newToken();
		const expiresAt = new Date(Math.min(Date.now() + 7 * 86400000, new Date(audit.expires_at).getTime()));
		await tx.execute(
			sql`insert into audit_access_grants(audit_id,token_hash,purpose,expires_at) values(${auditId}::uuid,${tokenHash(sessionToken)},'session',${expiresAt})`,
		);
		if (!audit.verified_at) {
			await tx.execute(
				sql`update audits set verified_at=now(),status='preparing_subject',updated_at=now() where id=${auditId}::uuid`,
			);
			await enqueue(tx, auditId, "website:initial", { type: "website", website: audit.website });
		}
		return { auditId, sessionToken, expiresAt: expiresAt.toISOString() };
	});
}

export async function requireAuditAccess(auditId: string, sessionToken: string) {
	if (!sessionToken || !/^[a-zA-Z\d_-]{43}$/.test(sessionToken))
		throw new AuditError(403, "access_required", "Verify your email to access this report");
	const audit = await auditRow(db, auditId);
	const [grant] = await rows<{ id: string }>(
		db,
		sql`select id from audit_access_grants where audit_id=${audit.id}::uuid and purpose='session' and token_hash=${tokenHash(sessionToken)} and revoked_at is null and expires_at>now()`,
	);
	if (!grant) throw new AuditError(403, "access_required", "Verify your email to access this report");
	return audit;
}

export async function getAuditSubject(auditId: string, sessionToken: string) {
	const audit = await requireAuditAccess(auditId, sessionToken);
	return publicAuditValue({
		auditId: audit.id,
		status: audit.status,
		website: audit.website,
		subject: audit.subject,
		candidates: audit.website_result?.candidates ?? [],
		websiteResult: audit.website_result,
	});
}

export async function confirmAudit(auditId: string, sessionToken: string, rawSubject: unknown) {
	await requireAuditAccess(auditId, sessionToken);
	return db.transaction(async (tx) => {
		const audit = await auditRow(tx, auditId, true);
		if (audit.plan) return { auditId: audit.id, status: audit.status };
		if (audit.status !== "awaiting_confirmation")
			throw new AuditError(409, "not_ready", "Wait for website preparation before confirming the restaurant");
		if (!rawSubject || typeof rawSubject !== "object")
			throw new AuditError(400, "invalid_subject", "Confirm the restaurant location");
		const subject = restaurantSubjectSchema.parse({
			...rawSubject,
			website: audit.website,
			country: "US",
			provenance: "requester_asserted",
		});
		const identityKey = auditHash(
			[subject.name, subject.address, subject.city, subject.state].map((v) => v.toLowerCase().replace(/[^a-z\d]/g, "")),
		);
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`audit-confirm:${audit.email}:${identityKey}`},0))`,
		);
		const [previous] = await rows<AuditRow>(
			tx,
			sql`select * from audits where email=${audit.email} and identity_key=${identityKey} and id<>${audit.id}::uuid and revoked_at is null and expires_at>now() and created_at>now()-interval '7 days' and plan is not null order by created_at desc limit 1`,
		);
		if (previous) {
			const token = newToken();
			const expiresAt = new Date(Date.now() + 7 * 86400000);
			await tx.execute(
				sql`insert into audit_access_grants(audit_id,token_hash,purpose,expires_at) values(${previous.id}::uuid,${tokenHash(token)},'session',${expiresAt})`,
			);
			await tx.execute(sql`update audits set status='cancelled',revoked_at=now() where id=${audit.id}::uuid`);
			return {
				auditId: previous.id,
				status: previous.status,
				reused: true,
				sessionToken: token,
				expiresAt: expiresAt.toISOString(),
			};
		}
		const currentConfig = await config(tx);
		const plan = buildAuditPlan(subject, currentConfig);
		const upperBound = plan.samples.reduce(
			(total, slot) =>
				total +
				worstCallMicros(plan.targets.find((t) => t.id === slot.targetId)!) +
				worstCallMicros(plan.targets[0], true),
			0,
		);
		if (
			!testMode() &&
			(!priceReviewIsCurrent() ||
				process.env.PUBLIC_AUDIT_LIVE_CALLS_ENABLED !== "1" ||
				process.env.AUDIT_SHARED_BUDGET_ENABLED !== "1")
		)
			throw new AuditError(
				503,
				"provider_review_required",
				"Provider, shared budget and price review is required before starting",
			);
		await assertProjectBudget(tx, upperBound);
		await tx.execute(
			sql`update audits set subject=${json(subject)}::jsonb,identity_key=${identityKey},plan=${json(plan)}::jsonb,plan_hash=${plan.hash},config_version=${plan.configVersion},status='queued',started_at=now(),deadline_at=now()+interval '15 minutes',updated_at=now() where id=${audit.id}::uuid`,
		);
		for (const slot of plan.samples) {
			await enqueue(tx, audit.id, `sample:${slot.sampleId}`, {
				type: "sample",
				subject,
				question: plan.questions.find((q) => q.id === slot.questionId)!,
				target: plan.targets.find((t) => t.id === slot.targetId)!,
				requestKey: `${audit.id}:${slot.sampleId}:1`,
			});
		}
		return { auditId: audit.id, status: "queued" };
	});
}

export async function getAuditStatus(auditId: string, sessionToken: string) {
	const audit = await requireAuditAccess(auditId, sessionToken);
	const tasks = await rows<TaskRow>(db, sql`select * from audit_tasks where audit_id=${audit.id}::uuid`);
	const samples = tasks.filter((task) => task.kind === "sample");
	const counts = {
		planned: audit.plan?.samples.length ?? 0,
		collected: samples.filter((t) => t.status === "succeeded").length,
		judged: tasks.filter((t) => t.kind === "judgment" && t.status === "succeeded").length,
		failed: samples.filter((t) => ["failed", "uncertain", "skipped"].includes(t.status)).length,
	};
	const pdf = tasks.find((t) => t.task_key === `pdf:${audit.current_report_version}`);
	return {
		auditId: audit.id,
		status: audit.status,
		subject: audit.subject,
		samples: counts,
		progress: counts.planned ? Math.round(((counts.collected + counts.failed) / counts.planned) * 100) : 0,
		reportVersion: audit.current_report_version,
		pdfStatus: pdf?.status ?? "pending",
		expiresAt: audit.expires_at,
	};
}

export async function getAuditReport(auditId: string, sessionToken: string, version?: number) {
	const audit = await requireAuditAccess(auditId, sessionToken);
	const [report] = await rows<{ snapshot: AuditReportSnapshot }>(
		db,
		sql`select snapshot from audit_reports where audit_id=${audit.id}::uuid and version=${version ?? audit.current_report_version}`,
	);
	if (!report) throw new AuditError(409, "not_ready", "The report is not ready yet");
	return publicAuditValue(report.snapshot) as AuditReportSnapshot;
}
export async function getAuditPdf(auditId: string, sessionToken: string, version?: number) {
	const audit = await requireAuditAccess(auditId, sessionToken);
	const reportVersion = version ?? audit.current_report_version;
	const [task] = await rows<TaskRow>(
		db,
		sql`select * from audit_tasks where audit_id=${audit.id}::uuid and task_key=${`pdf:${reportVersion}`} and status='succeeded'`,
	);
	if (!task) throw new AuditError(409, "pdf_pending", "The PDF is not ready yet; your online report is available");
	return {
		bytes: await readAuditArtifact(audit.id, `report-v${reportVersion}.pdf`),
		filename: `restaurant-ai-visibility-v${reportVersion}.pdf`,
	};
}

export async function requestAuditAccessLink(input: { email: string; auditId?: string; ipHash: string }) {
	const email = z.email().max(320).parse(input.email.trim().toLowerCase());
	await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit-recover:${input.ipHash}`},0))`);
		const [count] = await rows<{ total: string }>(
			tx,
			sql`select count(*)::text total from audit_admin_events where actor=${`public:${input.ipHash}`} and action='access-link' and created_at>now()-interval '1 hour'`,
		);
		if (Number(count.total) >= 3) return;
		await tx.execute(
			sql`insert into audit_admin_events(actor,action,reason,payload) values(${`public:${input.ipHash}`},'access-link','Public recovery request','{}'::jsonb)`,
		);
		const matches = await rows<AuditRow>(
			tx,
			sql`select * from audits where email=${email} and revoked_at is null and expires_at>now() ${input.auditId ? sql`and id=${id(input.auditId)}::uuid` : sql``} order by created_at desc limit 3`,
		);
		for (const audit of matches) {
			const [sent] = await rows<{ total: string }>(
				tx,
				sql`select count(*)::text total from audit_notifications where audit_id=${audit.id}::uuid and created_at>now()-interval '1 hour'`,
			);
			if (Number(sent.total) < 3)
				await queueMail(
					tx,
					audit,
					audit.verified_at ? "recovery" : "verification",
					`recovery:${Math.floor(Date.now() / 60000)}`,
				);
		}
	});
}

export async function adminAuditList(actor: AuditAdmin, filter: { search?: string; status?: string } = {}) {
	ensureAdmin(actor);
	const search = `%${(filter.search ?? "").slice(0, 200).replace(/[%_\\]/g, "\\$&")}%`;
	const audits = await rows<AuditRow>(
		db,
		sql`select * from audits where (email ilike ${search} or coalesce(subject->>'name','') ilike ${search}) ${filter.status ? sql`and status=${filter.status}` : sql``} order by created_at desc limit 200`,
	);
	const budget = await readProjectBudget(db);
	return {
		audits: audits.map((audit) => ({
			...audit,
			currentReportVersion: audit.current_report_version,
			createdAt: audit.created_at,
		})),
		budget,
		config: await config(db),
		limits: await admissionLimits(db),
		enabled: budget.accepting && process.env.PUBLIC_AUDIT_ENABLED === "1",
	};
}
export async function adminAuditDetail(actor: AuditAdmin, auditId: string) {
	ensureAdmin(actor);
	const audit = await auditRow(db, auditId, false, true);
	const tasks = await rows<TaskRow>(
		db,
		sql`select * from audit_tasks where audit_id=${audit.id}::uuid order by created_at`,
	);
	const reports = await rows(
		db,
		sql`select version,snapshot,sha256,created_at,created_by from audit_reports where audit_id=${audit.id}::uuid order by version desc`,
	);
	const notifications = await rows(
		db,
		sql`select * from audit_notifications where audit_id=${audit.id}::uuid order by created_at desc`,
	);
	const logs = await rows(
		db,
		sql`select * from audit_admin_events where audit_id=${audit.id}::uuid order by created_at desc`,
	);
	return publicAuditValue({ audit, tasks, reports, notifications, logs, website: audit.website_result });
}

type AdminActionContext = {
	tx: DbConnection;
	actor: AuditAdmin;
	action: string;
	reason: string;
	payload: Record<string, unknown>;
	auditId?: string;
};
type ScopedAdminActionContext = AdminActionContext & { auditId: string; audit: AuditRow };

async function adminReconcileBudget(context: AdminActionContext) {
	const { tx, actor, action, payload, reason } = context;
	const budget = await reconcileProjectBudget(tx, actor.id, usdMicros(payload.historicalUsd), reason);
	await logAdmin(tx, actor, action, undefined, reason, { historicalMicros: budget.historicalMicros });
	return { budget };
}

async function adminSetEnabled(context: AdminActionContext) {
	const { tx, actor, action, payload, reason } = context;
	const enabled = z.boolean().parse(payload.enabled);
	const budget = await readProjectBudget(tx);
	if (enabled && (!budget.reconciled || budget.remainingMicros <= 0))
		throw new AuditError(409, "budget_required", "Reconcile the project budget before enabling reports");
	await tx.execute(
		sql`update audit_budget_accounts set accepting=${enabled},updated_by=${actor.id},updated_at=now() where id='restaurant-geo-project'`,
	);
	await logAdmin(tx, actor, action, undefined, reason, { enabled });
	return { enabled };
}

async function adminPublishConfig(context: AdminActionContext) {
	const { tx, actor, action, payload, reason } = context;
	const next = validateAuditConfig(payload.config);
	for (const target of next.targets) worstCallMicros(target);
	await tx.execute(
		sql`insert into audit_configs(version,payload,created_by) values(${next.version},${json(next)}::jsonb,${actor.id})`,
	);
	await logAdmin(tx, actor, action, undefined, reason, { version: next.version });
	return { config: next };
}

async function adminSetLimits(context: AdminActionContext) {
	const { tx, actor, action, payload, reason } = context;
	const limits = admissionLimitsSchema.parse(payload);
	const before = await admissionLimits(tx);
	await tx.execute(
		sql`insert into audit_configs(version,payload,created_by) values(${`limits:${randomUUID()}`},${json({ kind: "admission-limits", ...limits })}::jsonb,${actor.id})`,
	);
	await logAdmin(tx, actor, action, undefined, reason, { before, after: limits });
	return { limits };
}

async function adminPreviewConfig(context: AdminActionContext) {
	const { payload } = context;
	const preview = validateAuditConfig(payload.config);
	const subject = restaurantSubjectSchema.parse(payload.subject);
	return { plan: buildAuditPlan(subject, preview) };
}

async function adminResend(context: ScopedAdminActionContext) {
	const { tx, actor, action, reason, auditId, audit } = context;
	await queueMail(tx, audit, audit.current_report_version ? "report_ready" : "recovery", `admin:${randomUUID()}`);
	await logAdmin(tx, actor, action, auditId, reason, { reportVersion: audit.current_report_version });
	return { queued: true };
}

async function adminReview(context: ScopedAdminActionContext) {
	const { tx, actor, action, payload, reason, auditId, audit } = context;
	if (!audit.plan) throw new AuditError(409, "no_plan", "This audit has no frozen plan");
	const sampleId = z.string().parse(payload.sampleId);
	const slot = audit.plan.samples.find((s) => s.sampleId === sampleId);
	const [sample] = await rows<TaskRow>(
		tx,
		sql`select * from audit_tasks where audit_id=${auditId}::uuid and task_key=${`sample:${sampleId}`} and status='succeeded'`,
	);
	if (!slot || !sample?.result) throw new AuditError(409, "no_evidence", "Only a collected answer can be reviewed");
	const answer = (sample.result as { answer: AuditAnswer }).answer;
	const judgment = validateJudgment(
		audit.plan.subject,
		audit.plan.questions.find((q) => q.id === slot.questionId)!,
		answer,
		payload.judgment,
	);
	const [old] = await rows<TaskRow>(
		tx,
		sql`select * from audit_tasks where audit_id=${auditId}::uuid and task_key=${`judgment:${sampleId}`} for update`,
	);
	if (old?.status === "running")
		throw new AuditError(409, "judgment_running", "Wait for the in-flight judgment before reviewing this answer");
	await logAdmin(tx, actor, action, auditId, reason, {
		sampleId,
		before: old?.result ?? null,
		after: judgment,
	});
	await tx.execute(
		sql`insert into audit_tasks(audit_id,task_key,kind,status,payload,result,completed_at) values(${auditId}::uuid,${`judgment:${sampleId}`},'judgment','succeeded','{}'::jsonb,${json({ type: "judgment", judgment })}::jsonb,now()) on conflict(audit_id,task_key) do update set status='succeeded',result=excluded.result,error=null,completed_at=now()`,
	);
	return { reviewed: true };
}

async function adminPublish(context: ScopedAdminActionContext) {
	const { tx, actor, action, payload, reason, auditId, audit } = context;
	const [unfinished] = await rows<{ total: string }>(
		tx,
		sql`select count(*)::text total from audit_tasks where audit_id=${auditId}::uuid and kind in ('sample','judgment') and status in ('pending','running')`,
	);
	if (Number(unfinished.total))
		throw new AuditError(
			409,
			"detection_running",
			"Wait for detection and judgment tasks to finish before publishing a revised report",
		);
	await logAdmin(tx, actor, action, auditId, reason, { previousVersion: audit.current_report_version });
	return {
		publishAuditId: auditId,
		suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : undefined,
	};
}

function rejectedSamplePayload(audit: AuditRow, task: TaskRow): Extract<AuditRuntimeTask, { type: "sample" }> {
	if (
		task.status !== "failed" ||
		!/^Provider rejected the request \(HTTP (401|403|429)\); no automatic retry was made$/.test(task.error ?? "")
	)
		throw new AuditError(
			409,
			"uncertain_call",
			"Only a definite provider rejection can be explicitly retried; uncertain calls require a new retest",
		);
	const plan = audit.plan;
	if (!plan) throw new AuditError(409, "no_plan", "This audit has no frozen plan");
	const slot = plan.samples.find((item) => `sample:${item.sampleId}` === task.task_key);
	const question = plan.questions.find((item) => item.id === slot?.questionId);
	const target = plan.targets.find((item) => item.id === slot?.targetId);
	if (!slot || !question || !target)
		throw new AuditError(409, "invalid_sample", "The sample does not belong to this frozen plan");
	return {
		type: "sample",
		subject: plan.subject,
		question,
		target,
		requestKey: `${audit.id}:${slot.sampleId}:${task.attempts + 1}`,
	};
}

async function resetRejectedSamples(context: ScopedAdminActionContext, tasks: TaskRow[]) {
	const { tx, audit, auditId } = context;
	if (!paidCallsAllowed())
		throw new AuditError(
			503,
			"provider_review_required",
			"Review providers and the shared budget before a paid sample supplement",
		);
	const payloads = tasks.map((task) => ({ task, payload: rejectedSamplePayload(audit, task) }));
	const upperBound = payloads.reduce(
		(total, item) => total + worstCallMicros(item.payload.target) + worstCallMicros(item.payload.target, true),
		0,
	);
	if (payloads.length) await assertProjectBudget(tx, upperBound);
	for (const { task, payload } of payloads) {
		const sampleId = task.task_key.slice("sample:".length);
		const [judgment] = await rows<TaskRow>(
			tx,
			sql`select * from audit_tasks where audit_id=${auditId}::uuid and task_key=${`judgment:${sampleId}`} for update`,
		);
		if (judgment?.status === "running")
			throw new AuditError(409, "judgment_running", "Wait for the in-flight judgment before recollecting this answer");
		await tx.execute(
			sql`delete from audit_tasks where audit_id=${auditId}::uuid and task_key=${`judgment:${sampleId}`}`,
		);
		await tx.execute(
			sql`update audit_tasks set status='pending',result=null,error=null,lease_until=null,dispatched_at=null,completed_at=null,payload=${json(payload)}::jsonb where id=${task.id}::uuid`,
		);
	}
	if (payloads.length)
		await tx.execute(
			sql`update audits set status='queued',started_at=now(),deadline_at=now()+interval '15 minutes',updated_at=now() where id=${auditId}::uuid`,
		);
}

async function retryFailedMail(context: ScopedAdminActionContext, tasks: TaskRow[]) {
	const { tx, actor, action, reason, auditId, audit } = context;
	if (!tasks.length) return { retried: 0 };
	const kind = audit.current_report_version ? "report_ready" : audit.verified_at ? "recovery" : "verification";
	const suffix = `retry:${randomUUID()}`;
	await queueMail(tx, audit, kind, suffix);
	await logAdmin(tx, actor, action, auditId, reason, {
		kind: "mail",
		before: tasks.map((task) => ({ id: task.id, status: task.status, error: task.error, attempts: task.attempts })),
		after: { notificationKey: `${kind}:${suffix}`, freshAccessGrant: true },
	});
	return { retried: 1, replacedFailures: tasks.length };
}

async function adminRetry(context: ScopedAdminActionContext) {
	const { tx, actor, action, payload, reason, auditId } = context;
	const kind = z.enum(["sample", "pdf", "mail"]).parse(payload.kind);
	const keyKind = kind === "mail" ? "email" : kind;
	const tasks = await rows<TaskRow>(
		tx,
		sql`select * from audit_tasks where audit_id=${auditId}::uuid and kind=${keyKind} and status='failed' ${payload.taskId ? sql`and id=${id(String(payload.taskId))}::uuid` : sql``} for update`,
	);
	if (kind === "mail") return retryFailedMail(context, tasks);
	if (kind === "sample") await resetRejectedSamples(context, tasks);
	else
		for (const task of tasks)
			await tx.execute(
				sql`update audit_tasks set status='pending',error=null,lease_until=null where id=${task.id}::uuid`,
			);
	await logAdmin(tx, actor, action, auditId, reason, {
		kind,
		count: tasks.length,
		before: tasks.map((task) => ({
			id: task.id,
			status: task.status,
			error: task.error,
			attempts: task.attempts,
			result: task.result,
		})),
		after: tasks.map((task) => ({ id: task.id, status: "pending", nextAttempt: task.attempts + 1 })),
	});
	return { retried: tasks.length };
}

async function adminRetest(context: ScopedAdminActionContext) {
	const { tx, actor, action, reason, auditId, audit } = context;
	if (!audit.plan) throw new AuditError(409, "no_plan", "This audit has no frozen plan");
	if (
		!testMode() &&
		(!priceReviewIsCurrent() ||
			process.env.PUBLIC_AUDIT_LIVE_CALLS_ENABLED !== "1" ||
			process.env.AUDIT_SHARED_BUDGET_ENABLED !== "1")
	)
		throw new AuditError(
			503,
			"provider_review_required",
			"Review providers and the shared budget before a paid retest",
		);
	await assertProjectBudget(
		tx,
		audit.plan.samples.reduce(
			(total, slot) =>
				total +
				worstCallMicros(audit.plan!.targets.find((t) => t.id === slot.targetId)!) +
				worstCallMicros(audit.plan!.targets[0], true),
			0,
		),
	);
	const newId = randomUUID();
	await tx.execute(
		sql`insert into audits(id,email,website,ip_hash,identity_key,status,subject,website_result,plan,plan_hash,config_version,parent_audit_id,verified_at,started_at,deadline_at,expires_at) values(${newId}::uuid,${audit.email},${audit.website},'internal-retest',${audit.identity_key},'queued',${json(audit.subject)}::jsonb,${json(audit.website_result)}::jsonb,${json(audit.plan)}::jsonb,${audit.plan.hash},${audit.plan.configVersion},${audit.id}::uuid,now(),now(),now()+interval '15 minutes',now()+interval '30 days')`,
	);
	for (const slot of audit.plan.samples)
		await enqueue(tx, newId, `sample:${slot.sampleId}`, {
			type: "sample",
			subject: audit.plan.subject,
			question: audit.plan.questions.find((q) => q.id === slot.questionId)!,
			target: audit.plan.targets.find((t) => t.id === slot.targetId)!,
			requestKey: `${newId}:${slot.sampleId}:1`,
		});
	await logAdmin(tx, actor, action, auditId, reason, { retestAuditId: newId });
	return { auditId: newId };
}

async function adminRevoke(context: ScopedAdminActionContext) {
	const { tx, actor, action, reason, auditId } = context;
	await tx.execute(sql`update audit_access_grants set revoked_at=now() where audit_id=${auditId}::uuid`);
	await tx.execute(
		sql`update audit_tasks set status='skipped',error='access_revoked' where audit_id=${auditId}::uuid and status='pending'`,
	);
	await logAdmin(tx, actor, action, auditId, reason, { revoked: true });
	if (action === "delete") {
		const [running] = await rows<{ total: string }>(
			tx,
			sql`select count(*)::text total from audit_tasks where audit_id=${auditId}::uuid and status='running'`,
		);
		if (Number(running.total))
			throw new AuditError(409, "running", "Wait for the in-flight task before erasing this audit");
		await tx.execute(
			sql`update audits set revoked_at=now(),status='erasing',updated_at=now() where id=${auditId}::uuid`,
		);
		await tx.execute(
			sql`update audit_admin_events set reason='Customer content erased; operation metadata retained',payload='{"customerContentErased":true}'::jsonb where audit_id=${auditId}::uuid`,
		);
	} else
		await tx.execute(
			sql`update audits set revoked_at=now(),status='cancelled',updated_at=now() where id=${auditId}::uuid`,
		);
	return { revoked: true, erased: action === "delete" };
}

const globalAdminActions = {
	"reconcile-budget": adminReconcileBudget,
	"set-enabled": adminSetEnabled,
	"publish-config": adminPublishConfig,
	"set-limits": adminSetLimits,
	"preview-config": adminPreviewConfig,
};
const scopedAdminActions = {
	resend: adminResend,
	review: adminReview,
	publish: adminPublish,
	retry: adminRetry,
	retest: adminRetest,
	revoke: adminRevoke,
	delete: adminRevoke,
};

export async function adminAuditAction(
	actor: AuditAdmin,
	input: { auditId?: string; action: string; payload?: unknown; reason: string },
) {
	ensureAdmin(actor);
	const reason = z.string().trim().min(3).max(2000).parse(input.reason);
	const payload = z.record(z.string(), z.unknown()).parse(input.payload ?? {});
	const auditId = input.auditId ? id(input.auditId) : undefined;
	const result = await db.transaction(async (tx) => {
		const context = { tx, actor, payload, reason, auditId, action: input.action };
		const global = Object.hasOwn(globalAdminActions, input.action)
			? globalAdminActions[input.action as keyof typeof globalAdminActions]
			: undefined;
		if (global) return global(context);
		if (!auditId) throw new AuditError(400, "audit_required", "Select an audit");
		const audit = await auditRow(tx, auditId, true, true);
		if (
			(audit.revoked_at || new Date(audit.expires_at).getTime() <= Date.now()) &&
			!["revoke", "delete"].includes(input.action)
		)
			throw new AuditError(409, "revoked", "This audit no longer accepts operational changes");
		const handler = Object.hasOwn(scopedAdminActions, input.action)
			? scopedAdminActions[input.action as keyof typeof scopedAdminActions]
			: undefined;
		if (!handler) throw new AuditError(400, "invalid_action", "Unsupported administrator action");
		return handler({ ...context, auditId, audit });
	});
	if ("publishAuditId" in result && result.publishAuditId)
		return finalizeAudit(String(result.publishAuditId), actor.id, result.suggestions);
	if (input.action === "delete" && auditId) {
		await eraseAuditArtifacts(auditId);
		await db.execute(sql`delete from audits where id=${auditId}::uuid and status='erasing'`);
	}
	return result;
}
function existingWorkerPublication(audit: AuditRow, tasks: TaskRow[], actor: string) {
	if (actor !== "worker") return undefined;
	if (audit.current_report_version > 0 && closedStatuses.has(audit.status))
		return { auditId: audit.id, version: audit.current_report_version, status: audit.status };
	if (tasks.some((task) => ["sample", "judgment"].includes(task.kind) && !terminalTasks.includes(task.status)))
		return { auditId: audit.id, version: 0, status: audit.status };
	return undefined;
}
export async function finalizeAudit(auditId: string, actor = "worker", suggestions?: unknown[]) {
	return db.transaction(async (tx) => {
		const audit = await auditRow(tx, auditId, true);
		if (!audit.plan) throw new AuditError(409, "no_plan", "This audit has no plan");
		const tasks = await rows<TaskRow>(tx, sql`select * from audit_tasks where audit_id=${auditId}::uuid`);
		const samples: AuditSampleResult[] = audit.plan.samples.map((slot) => {
			const sample = tasks.find((t) => t.task_key === `sample:${slot.sampleId}`);
			const review = tasks.find((t) => t.task_key === `judgment:${slot.sampleId}`);
			return {
				sampleId: slot.sampleId,
				status: (sample?.status ?? "pending") as AuditSampleResult["status"],
				answer: (sample?.result as { answer?: AuditAnswer } | null)?.answer,
				judgment: (review?.result as { judgment?: AuditSampleResult["judgment"] } | null)?.judgment,
				error: sample?.error ?? undefined,
				evidenceRefs: (sample?.result as { evidenceRefs?: AuditSampleResult["evidenceRefs"] } | null)?.evidenceRefs,
			};
		});
		const version = audit.current_report_version + 1;
		const existing = existingWorkerPublication(audit, tasks, actor);
		if (existing) return existing;
		const snapshot = structuredClone(
			buildAuditReport({
				auditId,
				version,
				createdAt: new Date().toISOString(),
				plan: audit.plan,
				samples,
				website: audit.website_result ?? emptyWebsite(),
			}),
		);
		if (suggestions) {
			const parsed = z
				.array(
					z.object({
						id: z.string().max(100),
						priority: z.enum(["high", "medium", "low"]),
						title: z.string().min(1).max(300),
						detail: z.string().min(1).max(3000),
						evidenceIds: z.array(z.string()).min(1),
					}),
				)
				.max(30)
				.parse(suggestions);
			const validIds = new Set([
				...snapshot.samples.map((s) => s.sampleId),
				...snapshot.website.evidenceRefs.map((e) => e.id),
				...snapshot.website.actionChecks.map((c) => c.id),
			]);
			if (parsed.some((a) => a.evidenceIds.some((ref) => !validIds.has(ref))))
				throw new AuditError(400, "invalid_evidence", "Each revised action must reference this audit's evidence");
			snapshot.actions = parsed;
			snapshot.hash = auditHash({ ...snapshot, hash: undefined });
		}
		await writeAuditArtifact(auditId, `report-v${version}.html`, renderAuditReportHtml(snapshot));
		await tx.execute(
			sql`insert into audit_reports(audit_id,version,snapshot,sha256,created_by) values(${auditId}::uuid,${version},${json(snapshot)}::jsonb,${snapshot.hash},${actor})`,
		);
		await tx.execute(
			sql`update audits set current_report_version=${version},status=${snapshot.status},updated_at=now() where id=${auditId}::uuid`,
		);
		await enqueue(tx, auditId, `pdf:${version}`, { type: "pdf", report: snapshot });
		await queueMail(tx, audit, "report_ready", `version:${version}`);
		return { auditId, version, status: snapshot.status };
	});
}

function paidCallsAllowed() {
	return (
		testMode() ||
		(priceReviewIsCurrent() &&
			process.env.PUBLIC_AUDIT_LIVE_CALLS_ENABLED === "1" &&
			process.env.AUDIT_SHARED_BUDGET_ENABLED === "1")
	);
}
function paidTask(task: TaskRow) {
	return ["sample", "judgment"].includes(task.kind);
}
async function reserveTask(tx: DbConnection, task: TaskRow, audit: AuditRow) {
	if (!paidTask(task)) return true;
	if (audit.deadline_at && new Date(audit.deadline_at).getTime() <= Date.now()) {
		await tx.execute(
			sql`update audit_tasks set status='skipped',error='The audit dispatch window ended' where id=${task.id}::uuid`,
		);
		return false;
	}
	const payload = task.payload as Extract<AuditRuntimeTask, { type: "sample" | "judgment" }>;
	const target = payload.type === "sample" ? payload.target : audit.plan?.targets[0];
	if (!target) throw new Error("Missing frozen model target");
	try {
		await reserveCallBudget(tx, {
			auditId: audit.id,
			callKey: `${task.id}:${task.attempts + 1}`,
			provider: task.kind === "judgment" ? "openai" : target.provider,
			reservedMicros: worstCallMicros(target, task.kind === "judgment"),
		});
		return true;
	} catch {
		await tx.execute(
			sql`update audit_tasks set status='skipped',error='The reviewed project budget cannot cover this call' where id=${task.id}::uuid`,
		);
		return false;
	}
}
async function claimTask() {
	return db.transaction(async (tx) => {
		// This short lock makes provider capacity checks atomic across all workers.
		await tx.execute(sql`select pg_advisory_xact_lock(716304883)`);
		const allowPaid = paidCallsAllowed();
		const [candidate] = await rows<TaskRow>(
			tx,
			sql`select t.* from audit_tasks t join audits a on a.id=t.audit_id where t.status='pending' and a.revoked_at is null and a.expires_at>now()
			and (t.kind not in ('sample','judgment') or (${allowPaid} and
				(select count(*) from audit_tasks active where active.status='running' and active.kind in ('sample','judgment')
				 and (case when active.kind='judgment' then 'openai' else active.payload->'target'->>'provider' end)=
				 (case when t.kind='judgment' then 'openai' else t.payload->'target'->>'provider' end))
				 < least(2,coalesce((t.payload->'target'->>'concurrency')::integer,2))))
			order by case t.kind when 'email' then 0 when 'website' then 1 when 'judgment' then 2 when 'sample' then 3 else 4 end,t.created_at,t.id limit 1`,
		);
		if (!candidate) return undefined;
		// Every mutation locks the parent before its tasks, including admin review.
		const audit = await auditRow(tx, candidate.audit_id, true, true);
		if (audit.revoked_at || new Date(audit.expires_at).getTime() <= Date.now()) return undefined;
		const [task] = await rows<TaskRow>(
			tx,
			sql`select * from audit_tasks where id=${candidate.id}::uuid and status='pending' for update`,
		);
		if (!task) return undefined;
		const paid = paidTask(task);
		if (!(await reserveTask(tx, task, audit))) return { skipped: true as const, auditId: audit.id };
		await tx.execute(
			sql`update audit_tasks set status='running',attempts=attempts+1,lease_until=now()+interval '6 minutes',dispatched_at=case when ${paid} then now() else dispatched_at end where id=${task.id}::uuid`,
		);
		if (paid) await tx.execute(sql`update audits set status='running',updated_at=now() where id=${audit.id}::uuid`);
		return { task, audit, skipped: false as const };
	});
}

async function enqueueJudgment(
	tx: DbConnection,
	task: TaskRow,
	audit: AuditRow,
	current: AuditRow,
	answer: AuditAnswer,
) {
	if (!audit.plan || current.revoked_at || new Date(current.expires_at).getTime() <= Date.now()) return;
	const slot = audit.plan.samples.find((s) => `sample:${s.sampleId}` === task.task_key)!;
	await enqueue(tx, audit.id, `judgment:${slot.sampleId}`, {
		type: "judgment",
		subject: audit.plan.subject,
		question: audit.plan.questions.find((q) => q.id === slot.questionId)!,
		answer,
		requestKey: `${audit.id}:judgment:${slot.sampleId}`,
	});
	if (testMode() && answer.provider === "stub") await settleSyntheticTask(tx, task);
}
async function settleSyntheticTask(tx: DbConnection, task: TaskRow) {
	await tx.execute(
		sql`update audit_cost_reservations set status='settled',actual_micros=0,usage='{"synthetic":true}'::jsonb,settled_at=now() where call_key=${`${task.id}:${task.attempts + 1}`}`,
	);
}
async function storeTaskResult(task: TaskRow, audit: AuditRow, result: AuditRuntimeResult) {
	let stored: unknown = result;
	if (result.type === "website" || result.type === "sample") {
		const artifact = await writeAuditArtifact(audit.id, `${task.id}.json`, json(result.rawOutput));
		stored =
			result.type === "website"
				? { type: result.type, website: result.website, evidenceRefs: [artifact] }
				: { type: result.type, answer: result.answer, evidenceRefs: [artifact] };
	}
	if (result.type === "pdf") {
		const version = (task.payload as Extract<AuditRuntimeTask, { type: "pdf" }>).report.version;
		stored = { type: "pdf", artifact: await writeAuditArtifact(audit.id, `report-v${version}.pdf`, result.bytes) };
	}
	return stored;
}
async function completeTask(task: TaskRow, audit: AuditRow, result: AuditRuntimeResult) {
	await db.transaction(async (tx) => {
		const current = await auditRow(tx, audit.id, true, true);
		const [lease] = await rows<{ id: string }>(
			tx,
			sql`select id from audit_tasks where id=${task.id}::uuid and status='running' and attempts=${task.attempts + 1} for update`,
		);
		if (!lease) throw new Error("The task no longer holds its execution lease");
		const stored = await storeTaskResult(task, audit, result);
		const [updated] = await rows<{ id: string }>(
			tx,
			sql`update audit_tasks set status='succeeded',result=${json(stored)}::jsonb,error=null,lease_until=null,completed_at=now(),payload=case when kind='email' then '{}'::jsonb else payload end where id=${task.id}::uuid and status='running' and attempts=${task.attempts + 1} returning id`,
		);
		if (!updated) throw new Error("The task no longer holds its execution lease");
		if (result.type === "website" && !current.revoked_at)
			await tx.execute(
				sql`update audits set website_result=${json(result.website)}::jsonb,status='awaiting_confirmation',updated_at=now() where id=${audit.id}::uuid and status='preparing_subject'`,
			);
		if (result.type === "sample") await enqueueJudgment(tx, task, audit, current, result.answer);
		if (result.type === "judgment" && testMode()) await settleSyntheticTask(tx, task);
		if (result.type === "email")
			await tx.execute(
				sql`update audit_notifications set status='sent',provider_message_id=${result.providerMessageId ?? null},attempts=attempts+1,error=null where audit_id=${audit.id}::uuid and key=${task.task_key.slice(5)}`,
			);
	});
}

async function advanceAudit(auditId: string) {
	const [audit] = await rows<AuditRow>(db, sql`select * from audits where id=${id(auditId)}::uuid`);
	if (!audit) return;
	if (audit.revoked_at || new Date(audit.expires_at).getTime() <= Date.now()) return;
	if (!audit.plan || closedStatuses.has(audit.status)) return;
	const [unfinished] = await rows<{ total: string }>(
		db,
		sql`select count(*)::text total from audit_tasks where audit_id=${auditId}::uuid and kind in ('sample','judgment') and status not in ('succeeded','failed','uncertain','skipped')`,
	);
	if (!Number(unfinished.total)) await finalizeAudit(auditId);
}

function providerErrorStatus(error: unknown) {
	if (!error || typeof error !== "object") return undefined;
	const supplied = error as { status?: unknown; statusCode?: unknown };
	return Number(supplied.status ?? supplied.statusCode);
}
function failureMessage(paid: boolean, status?: number) {
	if (paid && [401, 403, 429].includes(status ?? 0))
		return `Provider rejected the request (HTTP ${status}); no automatic retry was made`;
	if (paid) return "The call did not return a durable result; it was not automatically resubmitted";
	return "The task failed; an administrator may retry delivery or website preparation";
}
async function stopRejectedTarget(task: TaskRow, audit: AuditRow) {
	const targetId =
		task.kind === "sample" ? (task.payload as Extract<AuditRuntimeTask, { type: "sample" }>).target.id : undefined;
	await db.execute(
		sql`update audit_tasks set status='skipped',error='This target stopped after an authentication or authorization rejection' where audit_id=${audit.id}::uuid and status='pending' and ((kind='sample' and ${targetId ? sql`payload->'target'->>'id'=${targetId}` : sql`payload->'target'->>'provider'='openai'`}) ${targetId ? sql`` : sql`or kind='judgment'`})`,
	);
}
async function recordTaskFailure(task: TaskRow, audit: AuditRow, error: unknown) {
	const paid = paidTask(task);
	const status = providerErrorStatus(error);
	const rejected = paid && [401, 403, 429].includes(status ?? 0);
	const failureState = paid && !rejected ? "uncertain" : "failed";
	const [updated] = await rows<{ id: string }>(
		db,
		sql`update audit_tasks set status=${failureState},error=${failureMessage(paid, status)},lease_until=null where id=${task.id}::uuid and status='running' and attempts=${task.attempts + 1} returning id`,
	);
	if (!updated) return;
	if (paid && [401, 403].includes(status ?? 0)) await stopRejectedTarget(task, audit);
	if (task.kind === "website")
		await db.execute(
			sql`update audits set status='awaiting_confirmation',website_result=${json(emptyWebsite())}::jsonb,updated_at=now() where id=${audit.id}::uuid and status='preparing_subject'`,
		);
	if (task.kind === "email")
		await db.execute(
			sql`update audit_notifications set status='failed',attempts=attempts+1,error='Delivery failed; no model calls will be repeated' where audit_id=${audit.id}::uuid and key=${task.task_key.slice(5)}`,
		);
	if (task.kind === "judgment")
		await db.execute(
			sql`update audit_tasks set result=${json({ type: "judgment", judgment: unknownJudgment("The classification call was interrupted or failed. Review the original answer.") })}::jsonb where id=${task.id}::uuid and status in ('failed','uncertain') and attempts=${task.attempts + 1}`,
		);
}
async function executeClaimedTask(
	task: TaskRow,
	audit: AuditRow,
	execute: (task: AuditRuntimeTask) => Promise<AuditRuntimeResult>,
) {
	try {
		const payload =
			task.kind === "email"
				? await unsealAuditPayload<AuditRuntimeTask>(audit.id, task.payload)
				: (task.payload as AuditRuntimeTask);
		const result = await execute(payload);
		if (result.type !== task.kind) throw new Error("Task result type does not match its request");
		await completeTask(task, audit, result);
	} catch (error) {
		await recordTaskFailure(task, audit, error);
	}
	await advanceAudit(audit.id);
}
export async function runPendingAuditTasks(
	execute: (task: AuditRuntimeTask) => Promise<AuditRuntimeResult>,
	limit = 100,
) {
	// Release recovery row locks before acquiring any audit locks for new work.
	await db.execute(
		sql`update audit_tasks set status=case when kind in ('sample','judgment') and dispatched_at is not null then 'uncertain' else 'pending' end,error=case when kind in ('sample','judgment') and dispatched_at is not null then 'Interrupted after dispatch; not automatically resubmitted' else error end,lease_until=null where status='running' and lease_until<now()`,
	);
	let processed = 0;
	let allocated = 0;
	const work = async () => {
		while (allocated++ < limit) {
			const claimed = await claimTask();
			if (!claimed) break;
			processed++;
			if (claimed.skipped) {
				await advanceAudit(claimed.auditId);
				continue;
			}
			const { task, audit } = claimed;
			await executeClaimedTask(task, audit, execute);
		}
	};
	await Promise.all([work(), work(), work(), work()]);
	const pending = await rows<{ id: string }>(
		db,
		sql`select id from audits where plan is not null and status in ('queued','running') and revoked_at is null and expires_at>now() limit 100`,
	);
	for (const audit of pending) await advanceAudit(audit.id);
	await eraseExpiredAudits();
	return { processed };
}

export async function eraseExpiredAudits() {
	const expired = await rows<{ id: string }>(
		db,
		sql`select a.id from audits a where (a.expires_at<now() or a.status='erasing') and not exists(select 1 from audit_tasks t where t.audit_id=a.id and t.status='running') limit 25`,
	);
	for (const audit of expired) {
		await adminAuditAction(
			{ id: "retention-worker", role: "admin" },
			{
				auditId: audit.id,
				action: "delete",
				reason: "The configured thirty-day retention period ended or a previous erasure is pending",
			},
		);
	}
	return { erased: expired.length };
}

export const auditServiceInternals = { terminalTasks, testMode };
