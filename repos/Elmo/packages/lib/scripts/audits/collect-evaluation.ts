import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { priceReviewIsCurrent, worstCallMicros } from "../../src/audits/budget";
import { defaultAuditConfig, validateAuditConfig } from "../../src/audits/config";
import { type AuditConfig, type Judgment, judgmentSchema } from "../../src/audits/contracts";
import { evaluateJudgmentQuality, type JudgmentEvaluationRow, type JudgmentFixture } from "../../src/audits/evaluation";
import { auditHash } from "../../src/audits/plan";
import {
	auditQualityEvidenceSchema,
	createAuditQualityEvidence,
	validateAuditQualityEvidence,
} from "../../src/audits/release";

const fixtureFileSchema = z.object({
	schemaVersion: z.literal("restaurant-audit.proposed-fixtures.v1"),
	annotationsPending: z.literal(false),
	fixtures: z.array(auditQualityEvidenceSchema.shape.rows.element.shape.fixture).min(60).max(1000),
});
const runIdSchema = z.string().regex(/^[a-zA-Z\d_-]{8,80}$/);
type Reservation = { id: string; usage?: { resultHash?: string; collectorStatus?: string }; status: string };
type CaseRecord = {
	schemaVersion: "restaurant-audit.evaluation-case.v1";
	runId: string;
	fixtureId: string;
	fixtureHash: string;
	callKey: string;
	reservationId: string;
	status: "dispatched" | "succeeded" | "uncertain";
	judgment?: Judgment;
	resultHash?: string;
};
type Manifest = {
	schemaVersion: "restaurant-audit.evaluation-run.v1";
	runId: string;
	actor: string;
	financialAuditId: string;
	configHash: string;
	fixturesHash: string;
	createdAt: string;
};
export type EvaluationCollectorDependencies = {
	preflight(micros: number): Promise<void>;
	findReservation(callKey: string): Promise<Reservation | undefined>;
	reserve(input: { callKey: string; auditId: string; provider: string; reservedMicros: number }): Promise<string>;
	record(input: { reservationId: string; callKey: string; usage: Record<string, unknown> }): Promise<void>;
	execute(fixture: JudgmentFixture, callKey: string): Promise<Judgment>;
	persist?: typeof writeEvaluationJson;
};

export function validateReviewedEvaluationFixtures(value: unknown, now = Date.now()): JudgmentFixture[] {
	const { fixtures } = fixtureFileSchema.parse(value);
	if (fixtures.some((fixture) => Date.parse(fixture.humanReview.reviewedAt ?? "") > now))
		throw new Error("Human review timestamps cannot be in the future");
	const check = evaluateJudgmentQuality(fixtures.map((fixture) => ({ fixture, actual: fixture.expected })));
	if (!check.passed) throw new Error(`Human-reviewed fixture coverage is incomplete: ${check.reasons.join(" ")}`);
	return fixtures;
}

export function assertEvaluationCollectionEnabled(
	env: NodeJS.ProcessEnv,
	openAiConfigured: boolean,
	currentPriceReview = priceReviewIsCurrent(),
) {
	if (
		env.AUDIT_EVALUATION_LIVE_ENABLED !== "1" ||
		env.PUBLIC_AUDIT_LIVE_CALLS_ENABLED !== "1" ||
		env.AUDIT_SHARED_BUDGET_ENABLED !== "1"
	)
		throw new Error("Explicit evaluation/live/shared-budget flags are required before collecting real judgments");
	if (!currentPriceReview) throw new Error("A current reviewed price bound is required");
	if (!openAiConfigured) throw new Error("The OpenAI judge credential is not configured");
	if (!env.DATABASE_URL) throw new Error("The reconciled project database is required");
}

async function readJson(file: string): Promise<unknown> {
	if ((await stat(file)).size > 5_000_000) throw new Error("Evaluation input exceeds five megabytes");
	const content = await readFile(file);
	if (content.length > 5_000_000) throw new Error("Evaluation input exceeds five megabytes");
	return JSON.parse(content.toString("utf8"));
}

async function optionalJson(file: string): Promise<unknown | undefined> {
	try {
		return await readJson(file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

export async function writeEvaluationJson(file: string, value: unknown): Promise<void> {
	const content = `${JSON.stringify(value, null, 2)}\n`;
	if (Buffer.byteLength(content) > 5_000_000) throw new Error("Evaluation output exceeds five megabytes");
	const temporary = `${file}.${randomUUID()}.tmp`;
	await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
	await rename(temporary, file);
}

async function prepareManifest(options: {
	runId: string;
	actor: string;
	outputDir: string;
	config: AuditConfig;
	fixtures: JudgmentFixture[];
}): Promise<Manifest> {
	const file = path.join(options.outputDir, "run.json");
	const expected = {
		schemaVersion: "restaurant-audit.evaluation-run.v1" as const,
		runId: options.runId,
		actor: options.actor,
		configHash: auditHash(options.config),
		fixturesHash: auditHash(options.fixtures),
	};
	const existing = await optionalJson(file);
	if (existing !== undefined) {
		if (!existing || typeof existing !== "object") throw new Error("The saved evaluation run manifest is corrupt");
		const saved = existing as Manifest;
		if (
			Object.entries(expected).some(([key, value]) => saved[key as keyof Manifest] !== value) ||
			!z.uuid().safeParse(saved.financialAuditId).success
		)
			throw new Error("The run ID is already bound to a different actor, configuration, or fixture set");
		return saved;
	}
	const manifest = { ...expected, financialAuditId: randomUUID(), createdAt: new Date().toISOString() };
	try {
		await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") return prepareManifest(options);
		throw error;
	}
	return manifest;
}

function caseFile(directory: string, fixtureId: string) {
	return path.join(directory, `case-${auditHash(fixtureId)}.json`);
}

async function completedCase(
	manifest: Manifest,
	fixture: JudgmentFixture,
	directory: string,
	deps: EvaluationCollectorDependencies,
): Promise<CaseRecord | undefined> {
	const raw = await optionalJson(caseFile(directory, fixture.id));
	if (raw !== undefined && (!raw || typeof raw !== "object")) throw new Error("The saved evaluation case is corrupt");
	const saved = raw as CaseRecord | undefined;
	const callKey = `quality:${manifest.runId}:${fixture.id}`;
	const reservation = await deps.findReservation(callKey);
	if (!saved && !reservation) return undefined;
	if (
		!saved ||
		saved.status !== "succeeded" ||
		!saved.judgment ||
		saved.runId !== manifest.runId ||
		saved.fixtureHash !== auditHash(fixture) ||
		saved.callKey !== callKey ||
		saved.reservationId !== reservation?.id ||
		reservation.status === "released"
	)
		throw new Error(
			`The previous outcome for ${fixture.id} is uncertain. This run will not resubmit it automatically.`,
		);
	const judgment = judgmentSchema.parse(saved.judgment);
	if (
		saved.resultHash !== auditHash(judgment) ||
		reservation.usage?.resultHash !== saved.resultHash ||
		reservation.usage.collectorStatus !== "succeeded"
	)
		throw new Error("The saved evaluation result does not match its durable budget receipt");
	return { ...saved, judgment };
}

async function collectCase(
	manifest: Manifest,
	fixture: JudgmentFixture,
	config: AuditConfig,
	directory: string,
	deps: EvaluationCollectorDependencies,
): Promise<CaseRecord> {
	const callKey = `quality:${manifest.runId}:${fixture.id}`;
	const reservationId = await deps.reserve({
		callKey,
		auditId: manifest.financialAuditId,
		provider: "openai",
		reservedMicros: worstCallMicros(config.targets[0], true),
	});
	const initial: CaseRecord = {
		schemaVersion: "restaurant-audit.evaluation-case.v1",
		runId: manifest.runId,
		fixtureId: fixture.id,
		fixtureHash: auditHash(fixture),
		callKey,
		reservationId,
		status: "dispatched",
	};
	const persist = deps.persist ?? writeEvaluationJson;
	try {
		await persist(caseFile(directory, fixture.id), initial);
		const judgment = judgmentSchema.parse(await deps.execute(fixture, callKey));
		const record = { ...initial, status: "succeeded" as const, judgment, resultHash: auditHash(judgment) };
		await persist(caseFile(directory, fixture.id), record);
		await deps.record({
			reservationId,
			callKey,
			usage: {
				qualityEvaluation: true,
				runId: manifest.runId,
				actor: manifest.actor,
				fixtureId: fixture.id,
				collectorStatus: "succeeded",
				resultHash: record.resultHash,
				accounting: "reserved_upper_bound_not_verified_charge",
			},
		});
		return record;
	} catch (error) {
		await deps
			.record({
				reservationId,
				callKey,
				usage: {
					qualityEvaluation: true,
					runId: manifest.runId,
					actor: manifest.actor,
					fixtureId: fixture.id,
					collectorStatus: "uncertain",
					accounting: "reserved_upper_bound_not_verified_charge",
				},
			})
			.catch(() => {});
		await persist(caseFile(directory, fixture.id), { ...initial, status: "uncertain" }).catch(() => {});
		throw error;
	}
}

export async function collectEvaluation(
	options: { runId: string; actor: string; outputDir: string; config: AuditConfig; fixtures: JudgmentFixture[] },
	deps: EvaluationCollectorDependencies,
) {
	runIdSchema.parse(options.runId);
	z.string().trim().min(3).max(200).parse(options.actor);
	const config = validateAuditConfig(options.config);
	const fixtures = validateReviewedEvaluationFixtures({
		schemaVersion: "restaurant-audit.proposed-fixtures.v1",
		annotationsPending: false,
		fixtures: options.fixtures,
	});
	const outputDir = path.resolve(options.outputDir);
	if (outputDir.split(path.sep).some((segment) => ["public", ".git"].includes(segment.toLowerCase())))
		throw new Error("Evaluation journals must use a private directory");
	await mkdir(outputDir, { recursive: true, mode: 0o700 });
	const manifest = await prepareManifest({ ...options, outputDir, config, fixtures });
	const records = new Map<string, CaseRecord>();
	for (const fixture of fixtures) {
		const record = await completedCase(manifest, fixture, outputDir, deps);
		if (record) records.set(fixture.id, record);
	}
	const missing = fixtures.filter((fixture) => !records.has(fixture.id));
	if (missing.length) await deps.preflight(missing.length * worstCallMicros(config.targets[0], true));
	for (const fixture of missing) records.set(fixture.id, await collectCase(manifest, fixture, config, outputDir, deps));
	const rows: JudgmentEvaluationRow[] = fixtures.map((fixture) => {
		const judgment = records.get(fixture.id)?.judgment;
		if (!judgment) throw new Error("The evaluation still has missing outcomes");
		return {
			fixture,
			actual: { mention: judgment.mention, recommendation: judgment.recommendation, branch: judgment.branch },
		};
	});
	const evidence = createAuditQualityEvidence(config, rows);
	const receipts = [...records.values()].map(({ fixtureId, callKey, reservationId, resultHash }) => ({
		fixtureId,
		callKey,
		reservationId,
		resultHash,
	}));
	await (deps.persist ?? writeEvaluationJson)(path.join(outputDir, "quality-evidence.json"), {
		...evidence,
		collection: {
			runId: manifest.runId,
			actor: manifest.actor,
			financialAuditId: manifest.financialAuditId,
			fixturesHash: manifest.fixturesHash,
			receipts,
		},
	});
	return {
		evidenceFile: path.join(outputDir, "quality-evidence.json"),
		runId: manifest.runId,
		collected: missing.length,
		reused: records.size - missing.length,
		reservedUpperBoundMicros: missing.length * worstCallMicros(config.targets[0], true),
		release: validateAuditQualityEvidence(evidence, config),
	};
}

function argumentsForCli(args: string[]) {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 2) {
		const name = args[index];
		const value = args[index + 1];
		if (!["--run-id", "--actor", "--fixtures", "--output-dir", "--config"].includes(name) || !value || values.has(name))
			throw new Error("Use --run-id, --actor, --fixtures, --output-dir, and optional --config");
		values.set(name, value);
	}
	for (const key of ["--run-id", "--actor", "--fixtures", "--output-dir"])
		if (!values.has(key)) throw new Error(`Missing required ${key}`);
	return values;
}

async function main() {
	const args = argumentsForCli(process.argv.slice(2));
	assertEvaluationCollectionEnabled(process.env, !!process.env.OPENAI_API_KEY);
	const fixtures = validateReviewedEvaluationFixtures(await readJson(args.get("--fixtures")!));
	const config = args.has("--config") ? validateAuditConfig(await readJson(args.get("--config")!)) : defaultAuditConfig;
	const [{ db }, budget, runtime, { sql }] = await Promise.all([
		import("../../src/db/db"),
		import("../../src/audits/budget"),
		import("../../src/audits/runtime"),
		import("drizzle-orm"),
	]);
	try {
		const result = await collectEvaluation(
			{
				runId: args.get("--run-id")!,
				actor: args.get("--actor")!,
				outputDir: args.get("--output-dir")!,
				fixtures,
				config,
			},
			{
				preflight: async (amount) => {
					await db.transaction(async (tx) => {
						await budget.assertProjectBudget(tx, amount);
					});
				},
				findReservation: async (callKey) => {
					const [reservation] = await budget.rows<Reservation>(
						db,
						sql`select id,status,usage from audit_cost_reservations where call_key=${callKey}`,
					);
					return reservation;
				},
				reserve: (input) => db.transaction((tx) => budget.reserveCallBudget(tx, input)),
				record: async ({ reservationId, callKey, usage }) => {
					const results = await budget.rows<{ id: string }>(
						db,
						sql`update audit_cost_reservations set usage=${JSON.stringify(usage)}::jsonb where id=${reservationId}::uuid and call_key=${callKey} returning id`,
					);
					if (!results.length) throw new Error("The budget receipt could not be recorded");
				},
				execute: async (fixture, requestKey) => {
					const result = await runtime.executeAuditRuntimeTask({
						type: "judgment",
						subject: fixture.subject,
						question: fixture.question,
						answer: fixture.answer,
						requestKey,
					});
					if (result.type !== "judgment") throw new Error("The evaluator returned an unexpected result");
					return result.judgment;
				},
			},
		);
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		if (!result.release.passed) process.exitCode = 1;
	} finally {
		await db.$client.end();
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.message : "Evaluation collection failed"}\n`);
		process.exitCode = 1;
	});
