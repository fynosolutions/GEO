import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
const budget = vi.hoisted(() => ({ assertProjectBudget: vi.fn() }));
vi.mock("../db/db", () => ({ db: database }));
vi.mock("./budget", async (original) => ({
	...(await original<typeof import("./budget")>()),
	assertProjectBudget: budget.assertProjectBudget,
}));

import { defaultAuditConfig } from "./config";
import type { AuditAnswer, RestaurantSubject } from "./contracts";
import { buildAuditPlan } from "./plan";
import { adminAuditAction, requireAuditAccess, verifyAuditToken } from "./service";
import { tokenHash, unsealAuditPayload } from "./storage";

const auditId = "a34e3a23-8201-4707-b688-40cc7759f883";
const subject: RestaurantSubject = {
	name: "Cafe Test",
	address: "1 Main Street",
	city: "New York",
	state: "NY",
	country: "US",
	website: "https://restaurant.example",
	aliases: [],
	provenance: "requester_asserted",
};
const plan = buildAuditPlan(subject, defaultAuditConfig);
const audit = {
	id: auditId,
	plan,
	subject,
	email: "owner@example.com",
	website: subject.website,
	status: "running",
	expires_at: new Date(Date.now() + 86400000),
	revoked_at: null,
	current_report_version: 0,
};
const answer: AuditAnswer = {
	text: "Cafe Test is at 1 Main Street, New York.",
	citations: [],
	provider: "openai",
	requestedModel: "test",
	searchExecution: "unknown",
	citationAvailability: "unavailable",
	quality: "complete",
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("AUDIT_TEST_MODE", "1");
	vi.stubEnv("APP_URL", "https://reports.example");
	vi.stubEnv("ELMO_ENCRYPTION_KEY", Buffer.alloc(32, 11).toString("base64"));
	database.execute.mockResolvedValue({ rows: [] });
	budget.assertProjectBudget.mockResolvedValue({ remainingMicros: 20_000_000 });
	database.transaction.mockImplementation((callback: (connection: typeof database) => unknown) => callback(database));
});

describe("administrator review and access service", () => {
	it("replaces a failed delivery with a fresh access grant while keeping the failed mail unchanged", async () => {
		const failedMail = {
			id: "c1acf86a-242e-46fa-bd18-8fd4627c0806",
			task_key: "mail:verification:initial",
			kind: "email",
			status: "failed",
			attempts: 1,
			error: "Old delivery failed",
			payload: { sealed: "old-expired-ciphertext" },
		};
		database.execute
			.mockResolvedValueOnce({
				rows: [{ ...audit, status: "completed", current_report_version: 1, verified_at: new Date() }],
			})
			.mockResolvedValueOnce({ rows: [failedMail] });
		await expect(
			adminAuditAction(
				{ id: "internal-admin", role: "admin" },
				{ auditId, action: "retry", reason: "Replace expired report delivery link", payload: { kind: "mail" } },
			),
		).resolves.toMatchObject({ retried: 1 });
		const dialect = new PgDialect();
		const statements = database.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query));
		const delivery = statements.find((statement) => statement.sql.startsWith("insert into audit_tasks"));
		const grant = statements.find((statement) => statement.sql.startsWith("insert into audit_access_grants"));
		expect(delivery).toBeDefined();
		expect(grant).toBeDefined();
		const encrypted = JSON.parse(String(delivery?.params[3]));
		const task = await unsealAuditPayload<{ type: string; kind: string; link: string }>(auditId, encrypted);
		const token = new URLSearchParams(new URL(task.link).hash.slice(1)).get("token");
		expect(task.kind).toBe("report_ready");
		expect(token).toHaveLength(43);
		expect(grant?.params).toContain(tokenHash(token ?? ""));
		expect(grant?.sql).toContain("interval '30 minutes'");
		expect(statements.some((statement) => statement.sql.startsWith("update audit_tasks"))).toBe(false);
		expect(budget.assertProjectBudget).not.toHaveBeenCalled();
	});
	it("does not publish a report while sample collection or judgment is still in progress", async () => {
		database.execute.mockResolvedValueOnce({ rows: [audit] }).mockResolvedValueOnce({ rows: [{ total: "1" }] });
		await expect(
			adminAuditAction(
				{ id: "internal-admin", role: "admin" },
				{ auditId, action: "publish", reason: "Publish report too early" },
			),
		).rejects.toMatchObject({ status: 409, code: "detection_running" });
	});
	it("allows an explicit sample supplement after a definite provider rejection", async () => {
		const sample = {
			id: "c1acf86a-242e-46fa-bd18-8fd4627c0806",
			audit_id: auditId,
			task_key: `sample:${plan.samples[0].sampleId}`,
			kind: "sample",
			status: "failed",
			attempts: 1,
			dispatched_at: new Date(),
			error: "Provider rejected the request (HTTP 401); no automatic retry was made",
			result: null,
		};
		database.execute
			.mockResolvedValueOnce({ rows: [{ ...audit, status: "partial", current_report_version: 1 }] })
			.mockResolvedValueOnce({ rows: [sample] });
		await expect(
			adminAuditAction(
				{ id: "internal-admin", role: "admin" },
				{
					auditId,
					action: "retry",
					reason: "Credentials fixed; supplement one failed sample",
					payload: { kind: "sample", taskId: sample.id },
				},
			),
		).resolves.toMatchObject({ retried: 1 });
		expect(budget.assertProjectBudget).toHaveBeenCalled();
	});
	it("refuses a sample supplement when the earlier call could have been billed", async () => {
		const sample = {
			id: "c1acf86a-242e-46fa-bd18-8fd4627c0806",
			task_key: `sample:${plan.samples[0].sampleId}`,
			status: "failed",
			attempts: 1,
			dispatched_at: new Date(),
			error: "The call did not return a durable result; it was not automatically resubmitted",
		};
		database.execute.mockResolvedValueOnce({ rows: [audit] }).mockResolvedValueOnce({ rows: [sample] });
		await expect(
			adminAuditAction(
				{ id: "internal-admin", role: "admin" },
				{
					auditId,
					action: "retry",
					reason: "Attempt unsafe sample repeat",
					payload: { kind: "sample", taskId: sample.id },
				},
			),
		).rejects.toMatchObject({ status: 409, code: "uncertain_call" });
		expect(budget.assertProjectBudget).not.toHaveBeenCalled();
	});
	it("refuses a manual review while an automatic judgment is in flight", async () => {
		database.execute
			.mockResolvedValueOnce({ rows: [audit] })
			.mockResolvedValueOnce({ rows: [{ result: { answer } }] })
			.mockResolvedValueOnce({ rows: [{ status: "running", result: null }] });
		await expect(
			adminAuditAction(
				{ id: "internal-admin", role: "admin" },
				{
					auditId,
					action: "review",
					reason: "Review original evidence",
					payload: {
						sampleId: plan.samples[0].sampleId,
						judgment: {
							mention: "yes",
							recommendation: "unknown",
							branch: "unknown",
							rank: null,
							quote: answer.text,
							note: "The answer identifies the restaurant.",
							competitors: [],
						},
					},
				},
			),
		).rejects.toMatchObject({ status: 409, code: "judgment_running" });
	});
	it("rejects prototype property names as administrator actions", async () => {
		database.execute.mockResolvedValueOnce({ rows: [audit] });
		await expect(
			adminAuditAction(
				{ id: "internal-admin", role: "admin" },
				{ auditId, action: "constructor", reason: "Attempt unsupported action" },
			),
		).rejects.toMatchObject({ status: 400, code: "invalid_action" });
	});
	it("does not grant access when the session is not attached to the requested audit", async () => {
		database.execute.mockResolvedValueOnce({ rows: [audit] }).mockResolvedValueOnce({ rows: [] });
		await expect(requireAuditAccess(auditId, "x".repeat(43))).rejects.toMatchObject({
			status: 403,
			code: "access_required",
		});
	});
	it("rejects a consumed or expired email grant instead of creating a new session", async () => {
		database.execute.mockResolvedValueOnce({ rows: [audit] }).mockResolvedValueOnce({ rows: [] });
		await expect(verifyAuditToken({ auditId, token: "x".repeat(43) })).rejects.toMatchObject({
			status: 403,
			code: "invalid_link",
		});
	});
});
