import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAuditConfig } from "../../src/audits/config";
import { createSyntheticJudgmentFixtures } from "../../src/audits/evaluation";
import {
	assertEvaluationCollectionEnabled,
	collectEvaluation,
	type EvaluationCollectorDependencies,
	validateReviewedEvaluationFixtures,
	writeEvaluationJson,
} from "./collect-evaluation";

let directory: string;
beforeEach(async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), "elmo-quality-collector-"));
});
afterEach(async () => {
	const resolved = path.resolve(directory);
	if (
		path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
		!path.basename(resolved).startsWith("elmo-quality-collector-")
	)
		throw new Error("Unexpected cleanup target");
	await rm(resolved, { recursive: true, force: true });
});

function reviewedFixtures() {
	return createSyntheticJudgmentFixtures().map((fixture) => ({
		...fixture,
		annotationsPending: false,
		humanReview: { status: "reviewed" as const, reviewer: "test-reviewer", reviewedAt: "2026-10-01T12:00:00Z" },
	}));
}
function dependencies() {
	const ledger = new Map<string, { id: string; status: string; usage?: Record<string, unknown> }>();
	const execute = vi.fn(async (fixture) => ({
		...fixture.expected,
		rank: null,
		quote: fixture.expected.mention === "yes" ? fixture.answer.text : "",
		note: "Injected local test judgment",
		competitors: [],
	}));
	const reserve = vi.fn(async (input) => {
		if (ledger.has(input.callKey)) throw new Error("Already reserved");
		const id = `reservation-${ledger.size + 1}`;
		ledger.set(input.callKey, { id, status: "reserved" });
		return id;
	});
	const deps: EvaluationCollectorDependencies = {
		preflight: vi.fn().mockResolvedValue(undefined),
		findReservation: async (key) => ledger.get(key),
		reserve,
		record: async ({ callKey, usage }) => {
			const item = ledger.get(callKey);
			if (!item) throw new Error("Missing receipt");
			item.usage = usage;
		},
		execute,
	};
	return { deps, ledger, execute, reserve };
}
function options() {
	return {
		runId: "test-run-0001",
		actor: "test-operator",
		outputDir: directory,
		config: defaultAuditConfig,
		fixtures: reviewedFixtures(),
	};
}

describe("budget-accounted quality collection", () => {
	it("requires explicit live flags, a reviewed price, a real judge credential, and the shared database", () => {
		const env = {
			AUDIT_EVALUATION_LIVE_ENABLED: "1",
			PUBLIC_AUDIT_LIVE_CALLS_ENABLED: "1",
			AUDIT_SHARED_BUDGET_ENABLED: "1",
			DATABASE_URL: "postgresql://fixture",
		};
		expect(() => assertEvaluationCollectionEnabled(env, true, true)).not.toThrow();
		expect(() => assertEvaluationCollectionEnabled({ ...env, AUDIT_EVALUATION_LIVE_ENABLED: "0" }, true, true)).toThrow(
			/Explicit/,
		);
		expect(() => assertEvaluationCollectionEnabled(env, false, true)).toThrow(/credential/);
		expect(() => assertEvaluationCollectionEnabled(env, true, false)).toThrow(/price/);
		expect(() => assertEvaluationCollectionEnabled({ ...env, DATABASE_URL: "" }, true, true)).toThrow(/database/);
	});

	it("rejects proposed or undersized labels before reserving money", async () => {
		const fixture = dependencies();
		await expect(
			collectEvaluation({ ...options(), fixtures: createSyntheticJudgmentFixtures() }, fixture.deps),
		).rejects.toThrow(/Human-reviewed/);
		expect(fixture.reserve).not.toHaveBeenCalled();
		expect(() =>
			validateReviewedEvaluationFixtures({
				schemaVersion: "restaurant-audit.proposed-fixtures.v1",
				annotationsPending: false,
				fixtures: reviewedFixtures().slice(0, 59),
			}),
		).toThrow();
	});

	it("reserves each case before execution, persists receipts, and resumes a completed run without new calls", async () => {
		const fixture = dependencies();
		fixture.execute.mockImplementation(async (item) => {
			expect(fixture.ledger.has(`quality:test-run-0001:${item.id}`)).toBe(true);
			return {
				...item.expected,
				rank: null,
				quote: item.expected.mention === "yes" ? item.answer.text : "",
				note: "Injected local test judgment",
				competitors: [],
			};
		});
		const first = await collectEvaluation(options(), fixture.deps);
		expect(first.collected).toBe(64);
		expect(fixture.execute).toHaveBeenCalledTimes(64);
		const saved = JSON.parse(await readFile(first.evidenceFile, "utf8"));
		expect(saved.collection.receipts).toHaveLength(64);
		expect(saved.source).toBe("budget_accounted_judgments");
		const second = await collectEvaluation(options(), fixture.deps);
		expect(second).toMatchObject({ collected: 0, reused: 64 });
		expect(fixture.execute).toHaveBeenCalledTimes(64);
	});

	it("never reissues an uncertain dispatch after a result write fails", async () => {
		const fixture = dependencies();
		fixture.deps.persist = async (file, value) => {
			if ((value as { status?: string }).status === "succeeded") throw new Error("Simulated storage failure");
			await writeEvaluationJson(file, value);
		};
		await expect(collectEvaluation(options(), fixture.deps)).rejects.toThrow(/storage failure/);
		expect(fixture.execute).toHaveBeenCalledOnce();
		expect([...fixture.ledger.values()][0].usage?.collectorStatus).toBe("uncertain");
		await expect(collectEvaluation(options(), fixture.deps)).rejects.toThrow(/uncertain/);
		expect(fixture.execute).toHaveBeenCalledOnce();
	});

	it("rejects a reused run ID after the fixture set changes", async () => {
		const fixture = dependencies();
		await collectEvaluation(options(), fixture.deps);
		const changed = options();
		changed.fixtures[0].answer.text += " Different answer.";
		await expect(collectEvaluation(changed, fixture.deps)).rejects.toThrow(
			/different actor, configuration, or fixture set/,
		);
		expect(fixture.execute).toHaveBeenCalledTimes(64);
	});
});
