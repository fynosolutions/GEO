import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "../packages/lib/node_modules/drizzle-orm/index.js";
import { db } from "../packages/lib/src/db/db.ts";
import { readProjectBudget, reserveCallBudget, rows } from "../packages/lib/src/audits/budget.ts";
import type { AuditReportSnapshot, Judgment, RestaurantSubject, RestaurantWebsiteResult } from "../packages/lib/src/audits/contracts.ts";
import { auditHash } from "../packages/lib/src/audits/plan.ts";
import type { AuditRuntimeResult, AuditRuntimeTask } from "../packages/lib/src/audits/runtime.ts";
import { adminAuditAction, adminAuditDetail, confirmAudit, createAudit, getAuditPdf, getAuditReport, getAuditStatus, requireAuditAccess, requestAuditAccessLink, runPendingAuditTasks, verifyAuditToken } from "../packages/lib/src/audits/service.ts";

const database = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!/^auditv1test_\d+$/.test(database) || process.env.NODE_ENV !== "test" || process.env.AUDIT_TEST_MODE !== "1") throw new Error("Run only against a dedicated auditv1test_<timestamp> database in explicit test mode");
if (process.env.PUBLIC_AUDIT_LIVE_CALLS_ENABLED === "1") throw new Error("Real model calls must stay disabled for this synthetic integration test");

const run = randomUUID();
const admin = { id: `synthetic-operator:${run}`, role: "admin" };
const subject: RestaurantSubject = { name: "Synthetic Test Cafe", address: "1 Example Street", city: "Boston", state: "MA", country: "US", website: "https://restaurant.example.com", aliases: [], provenance: "requester_asserted" };
const website: RestaurantWebsiteResult = { pageFetch: { status: "succeeded", data: { synthetic: true } }, businessExtraction: { status: "succeeded", data: { synthetic: true } }, websiteAudit: { status: "succeeded", score: 72, findings: [] }, actionChecks: [], evidenceRefs: [], candidates: [{ ...subject, provenance: "website_observed" }] };
const calls = new Map<string, number>();
const messages: Extract<AuditRuntimeTask, { type: "email" }>[] = [];
const checkpoints: string[] = [];
let sampleCallCount = 0;
let injectDurabilityFailure = true;
let activeOpenai = 0;
let peakOpenai = 0;
let activeGemini = 0;
let peakGemini = 0;
const rejectionByAudit = new Map<string, number>();

const record = (name: string) => { checkpoints.push(name); console.log(`PASS ${name}`); };
async function executor(task: AuditRuntimeTask): Promise<AuditRuntimeResult> {
	if (task.type === "email") { messages.push(task); return { type: "email", providerMessageId: `synthetic:${randomUUID()}` }; }
	if (task.type === "website") return { type: "website", website, rawOutput: { synthetic: true, evidence: [] } };
	if (task.type === "pdf") return { type: "pdf", bytes: Buffer.from("%PDF-1.4\n% Synthetic transport fixture, not a rendered report\n%%EOF") };
	if (task.type === "judgment") {
		activeOpenai++; peakOpenai = Math.max(peakOpenai, activeOpenai);
		await delay(5);
		activeOpenai--;
		const quote = `I recommend ${task.subject.name} at ${task.subject.address}, ${task.subject.city}, ${task.subject.state}.`;
		const judgment: Judgment = { mention: "yes", recommendation: "yes", branch: "matched", rank: task.question.type === "discovery" ? 1 : null, quote, note: "SYNTHETIC software fixture only", competitors: [{ name: "Harbor Cafe", quote: "Another choice is Harbor Cafe." }] };
		return { type: "judgment", judgment };
	}
	const provider = task.target.provider;
	if (provider === "openai") { activeOpenai++; peakOpenai = Math.max(peakOpenai, activeOpenai); }
	else { activeGemini++; peakGemini = Math.max(peakGemini, activeGemini); }
	calls.set(task.requestKey, (calls.get(task.requestKey) ?? 0) + 1);
	const callOrdinal = ++sampleCallCount;
	const auditId = task.requestKey.split(":")[0];
	const rejection = provider === "openai" ? rejectionByAudit.get(auditId) : undefined;
	if (rejection) rejectionByAudit.delete(auditId);
	await delay(5);
	if (provider === "openai") activeOpenai--; else activeGemini--;
	if (rejection) throw Object.assign(new Error("Synthetic provider rejection"), { status: rejection });
	const rawOutput: { synthetic: boolean; circular?: unknown } = { synthetic: true };
	if (injectDurabilityFailure && callOrdinal === 7) rawOutput.circular = rawOutput;
	return { type: "sample", answer: { text: `SYNTHETIC TEST ONLY. I recommend ${task.subject.name} at ${task.subject.address}, ${task.subject.city}, ${task.subject.state}. Another choice is Harbor Cafe.`, citations: [], provider: "stub", requestedModel: task.target.model, returnedModel: task.target.model, searchExecution: "not_executed", citationAvailability: "none_returned", quality: "complete", usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }, rawOutput };
}

async function drain() {
	for (let attempt = 0; attempt < 8; attempt++) {
		const workers = await Promise.all([runPendingAuditTasks(executor, 100), runPendingAuditTasks(executor, 100)]);
		if (workers.every(({ processed }) => !processed)) return;
	}
	throw new Error("Synthetic task drain did not reach idle");
}
function tokenFrom(message: Extract<AuditRuntimeTask, { type: "email" }>) {
	const token = new URLSearchParams(new URL(message.link).hash.slice(1)).get("token");
	assert.ok(token);
	return token;
}
async function newVerifiedAudit(emailLabel: string) {
	const email = `${emailLabel}-${run}@example.test`;
	const audit = await createAudit({ email, website: subject.website, ipHash: `synthetic:${run}:${emailLabel}` });
	const [queued] = await rows<{ payload: Record<string, unknown> }>(db, sql`select payload from audit_tasks where audit_id=${audit.auditId}::uuid and kind='email'`);
	assert.equal(typeof queued.payload.sealed, "string");
	assert.ok(!JSON.stringify(queued.payload).includes("/audit/verify"));
	await drain();
	const message = messages.find((entry) => entry.to === email && entry.kind === "verification");
	assert.ok(message);
	const token = tokenFrom(message);
	const [unused] = await rows<{ used_at: Date | null }>(db, sql`select used_at from audit_access_grants where audit_id=${audit.auditId}::uuid and purpose='verification'`);
	assert.equal(unused.used_at, null);
	const session = await verifyAuditToken({ auditId: audit.auditId, token });
	await assert.rejects(verifyAuditToken({ auditId: audit.auditId, token }));
	await drain();
	return { ...audit, email, session: session.sessionToken, verificationToken: token };
}

try {
	const [p1Before] = await rows<{ total: string }>(db, sql`select count(*)::text total from restaurant_fact_versions`);
	const [guards] = await rows<{ total: string }>(db, sql`select count(*)::text total from pg_trigger where tgname in ('audit_reports_immutable','audit_configs_immutable','audits_frozen_plan')`);
	assert.equal(Number(guards.total), 3);
	await adminAuditAction(admin, { action: "reconcile-budget", reason: "Synthetic isolated database: no actual project spend", payload: { historicalUsd: "0" } });
	await adminAuditAction(admin, { action: "set-enabled", reason: "Enable isolated synthetic workflow only", payload: { enabled: true } });
	const a = await newVerifiedAudit("owner-a");
	const b = await newVerifiedAudit("owner-b");
	await assert.rejects(requireAuditAccess(a.auditId, b.session));
	await assert.rejects(getAuditReport(a.auditId, b.session));
	await assert.rejects(getAuditPdf(a.auditId, b.session));
	await assert.rejects(adminAuditDetail({ id: "organization-admin-only", role: "user" }, a.auditId));
	record("encrypted outbox, unconsumed GET-link equivalent, one-time verification and customer/admin isolation");

	await confirmAudit(a.auditId, a.session, subject);
	const [frozen] = await rows<{ plan_hash: string; count: string }>(db, sql`select plan_hash,(select count(*) from audit_tasks t where t.audit_id=a.id and t.kind='sample')::text count from audits a where id=${a.auditId}::uuid`);
	assert.equal(Number(frozen.count), 20);
	await confirmAudit(a.auditId, a.session, subject);
	await assert.rejects(db.execute(sql`update audits set plan_hash='tampered' where id=${a.auditId}::uuid`));
	const [p1After] = await rows<{ total: string }>(db, sql`select count(*)::text total from restaurant_fact_versions`);
	assert.equal(p1Before.total, p1After.total);
	record("twenty frozen samples, idempotent confirmation and no P1 confirmed-fact writes");

	while (sampleCallCount < 6) await runPendingAuditTasks(executor, 1);
	const firstSixKeys = [...calls.keys()];
	assert.equal(firstSixKeys.length, 6);
	await drain();
	assert.equal(sampleCallCount, 20);
	for (const key of firstSixKeys) assert.equal(calls.get(key), 1);
	for (const count of calls.values()) assert.equal(count, 1);
	const [uncertain] = await rows<{ total: string }>(db, sql`select count(*)::text total from audit_tasks where audit_id=${a.auditId}::uuid and kind='sample' and status='uncertain'`);
	assert.equal(Number(uncertain.total), 1);
	const beforeIdle = sampleCallCount;
	await drain();
	assert.equal(sampleCallCount, beforeIdle);
	assert.ok(peakOpenai <= 2 && peakGemini <= 2);
	let report = await getAuditReport(a.auditId, a.session);
	assert.equal(report.status, "partial");
	assert.equal(report.counts.planned, 20);
	assert.equal(report.counts.valid, 19);
	assert.match(report.limitations.join(" "), /synthetic/i);
	assert.equal((await getAuditPdf(a.auditId, a.session)).bytes.subarray(0, 5).toString(), "%PDF-");
	record("resume after six samples, durability failure uncertain, no resubmission and per-provider concurrency cap");

	const first = await getAuditReport(a.auditId, a.session, 1);
	const sample = report.samples.find((entry) => entry.status === "succeeded" && entry.judgment);
	assert.ok(sample?.judgment);
	await adminAuditAction(admin, { auditId: a.auditId, action: "review", reason: "Synthetic review of the original contiguous evidence", payload: { sampleId: sample.sampleId, judgment: { ...sample.judgment, recommendation: "no", rank: null, note: "Synthetic administrator correction" } } });
	await adminAuditAction(admin, { auditId: a.auditId, action: "publish", reason: "Publish a new immutable synthetic revision", payload: {} });
	await drain();
	report = await getAuditReport(a.auditId, a.session);
	assert.equal(report.version, 2);
	assert.equal((await getAuditReport(a.auditId, a.session, 1)).hash, first.hash);
	assert.equal(sampleCallCount, beforeIdle);
	await assert.rejects(db.execute(sql`update audit_reports set sha256='tampered' where audit_id=${a.auditId}::uuid and version=1`));
	const [stored] = await rows<{ snapshot: AuditReportSnapshot }>(db, sql`select snapshot from audit_reports where audit_id=${a.auditId}::uuid and version=2`);
	assert.equal(stored.snapshot.hash, auditHash({ ...stored.snapshot, hash: undefined }));
	record("evidence-backed administrator review, immutable report versions and delivery-only regeneration");

	const recoveryBefore = messages.length;
	await requestAuditAccessLink({ email: a.email, auditId: a.auditId, ipHash: `recover:${run}` });
	await drain();
	assert.equal(messages.length, recoveryBefore);
	await db.execute(sql`update audit_notifications set created_at=now()-interval '2 hours' where audit_id=${a.auditId}::uuid`);
	await requestAuditAccessLink({ email: a.email, auditId: a.auditId, ipHash: `recover-after-window:${run}` });
	await drain();
	const recovery = messages.slice(recoveryBefore).find((entry) => entry.to === a.email && entry.kind === "recovery");
	assert.ok(recovery);
	const restored = await verifyAuditToken({ auditId: a.auditId, token: tokenFrom(recovery) });
	await requireAuditAccess(a.auditId, restored.sessionToken);
	await db.execute(sql`update audit_access_grants set expires_at=now()-interval '1 second' where audit_id=${b.auditId}::uuid and purpose='session'`);
	await assert.rejects(requireAuditAccess(b.auditId, b.session));
	record("email access recovery and expired-session rejection");

	const raceKeys = [`synthetic-race:${run}:a`, `synthetic-race:${run}:b`];
	const contenders = await Promise.allSettled(raceKeys.map((callKey) => db.transaction((tx) => reserveCallBudget(tx, { callKey, auditId: a.auditId, provider: "synthetic", reservedMicros: 12_000_000 }))));
	assert.equal(contenders.filter((entry) => entry.status === "fulfilled").length, 1);
	assert.ok((await readProjectBudget(db)).usedMicros <= 20_000_000);
	await db.execute(sql`update audit_cost_reservations set status='released' where call_key in (${raceKeys[0]},${raceKeys[1]})`);
	record("concurrent budget reservation cannot exceed the shared US$20 cap");

	injectDurabilityFailure = false;
	const primaryProviderCalls = sampleCallCount;
	for (const statusCode of [401, 403]) {
		const c = await newVerifiedAudit(`rejection-${statusCode}`);
		await confirmAudit(c.auditId, c.session, subject);
		rejectionByAudit.set(c.auditId, statusCode);
		await drain();
		const beforeSupplement = await getAuditReport(c.auditId, c.session, 1);
		const [failed] = await rows<{ id: string; attempts: number }>(db, sql`select id,attempts from audit_tasks where audit_id=${c.auditId}::uuid and kind='sample' and status='failed' and error like ${`%HTTP ${statusCode}%`} limit 1`);
		assert.ok(failed);
		await adminAuditAction(admin, { auditId: c.auditId, action: "retry", reason: `Synthetic explicit retry for ${c.email} after a definite provider rejection`, payload: { kind: "sample", taskId: failed.id } });
		assert.equal((await getAuditReport(c.auditId, c.session)).hash, beforeSupplement.hash);
		await drain();
		const supplemented = await getAuditReport(c.auditId, c.session);
		assert.equal(supplemented.version, 2);
		assert.equal(supplemented.counts.valid, beforeSupplement.counts.valid + 1);
		assert.equal((await getAuditReport(c.auditId, c.session, 1)).hash, beforeSupplement.hash);
		const [attempts] = await rows<{ attempts: number }>(db, sql`select attempts from audit_tasks where id=${failed.id}::uuid`);
		assert.equal(attempts.attempts, 2);
		const [reservations] = await rows<{ total: string }>(db, sql`select count(*)::text total from audit_cost_reservations where call_key in (${`${failed.id}:1`},${`${failed.id}:2`})`);
		assert.equal(Number(reservations.total), 2);
		await access(path.join(process.env.AUDIT_STORAGE_DIR!, c.auditId));
		await adminAuditAction(admin, { auditId: c.auditId, action: "delete", reason: `Synthetic customer erasure for ${c.email}`, payload: {} });
		await assert.rejects(requireAuditAccess(c.auditId, c.session));
		await assert.rejects(access(path.join(process.env.AUDIT_STORAGE_DIR!, c.auditId)));
		const events = await rows<{ reason: string; payload: unknown }>(db, sql`select reason,payload from audit_admin_events where audit_id=${c.auditId}::uuid`);
		assert.ok(events.length > 0);
		for (const event of events) {
			assert.ok(!JSON.stringify(event).includes(c.email));
			assert.deepEqual(event.payload, { customerContentErased: true });
		}
	}
	record("401/403 explicit supplements use new reservations and report versions; customer deletion redacts evidence and audit-event PII");

	const [immutablePlan] = await rows<{ plan_hash: string }>(db, sql`select plan_hash from audits where id=${a.auditId}::uuid`);
	assert.equal(immutablePlan.plan_hash, frozen.plan_hash);
	const summary = { synthetic: true, database, run, checkpoints, plannedSamples: 20, primaryProviderCalls, totalSyntheticProviderCalls: sampleCallCount, unknownDurabilityFailures: 1, peakOpenai, peakGemini, actualExternalSpendUsd: 0, reportId: a.auditId, reportVersion: report.version, budget: await readProjectBudget(db) };
	const state = path.resolve("deploy/audits/.state");
	await mkdir(state, { recursive: true });
	await writeFile(path.join(state, "integration-result.json"), JSON.stringify(summary, null, 2));
	console.log(JSON.stringify({ passed: checkpoints.length, synthetic: true, actualExternalSpendUsd: 0, reportId: a.auditId }));
} finally {
	await db.$client.end();
}
