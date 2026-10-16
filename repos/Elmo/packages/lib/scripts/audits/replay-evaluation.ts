import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defaultAuditConfig, validateAuditConfig } from "../../src/audits/config";
import { createSyntheticJudgmentFixtures, evaluateJudgmentQuality } from "../../src/audits/evaluation";
import { readAuditQualityEvidence, validateAuditQualityEvidence } from "../../src/audits/release";
import { buildRecordedJudgmentConfig } from "./promptfooconfig";

type ReplayEvaluator = {
	evaluate(
		config: ReturnType<typeof buildRecordedJudgmentConfig>,
		options: {
			cache: boolean;
			maxConcurrency: number;
			repeat: number;
			generateSuggestions: boolean;
			showProgressBar: boolean;
			silent: boolean;
		},
	): Promise<{
		toEvaluateSummary(): Promise<{
			stats: { successes: number; failures: number; errors: number };
			results: { success: boolean; error?: string; gradingResult?: { reason?: string } }[];
		}>;
	}>;
};

async function optionalEvaluator(): Promise<ReplayEvaluator> {
	const location = process.env.AUDIT_PROMPTFOO_MODULE;
	if (location && !path.isAbsolute(location))
		throw new Error("AUDIT_PROMPTFOO_MODULE must be an absolute local module path");
	try {
		const evaluator = await import(location ? pathToFileURL(location).href : "promptfoo");
		if (typeof evaluator.evaluate !== "function") throw new Error("The configured module does not export an evaluator");
		return evaluator as ReplayEvaluator;
	} catch {
		throw new Error(
			"The optional promptfoo evaluator is not installed in this workspace because its dependency licenses fail repository checks. Use an independently reviewed evaluation environment and set AUDIT_PROMPTFOO_MODULE to its absolute local module path.",
		);
	}
}

async function main() {
	process.env.PROMPTFOO_DISABLE_TELEMETRY = "1";
	process.env.PROMPTFOO_DISABLE_SHARING = "1";
	process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = "1";
	const smoke = process.argv[2] === "--adapter-smoke";
	const evidence = smoke
		? undefined
		: await readAuditQualityEvidence(process.argv[2] ?? process.env.AUDIT_QUALITY_EVIDENCE_FILE);
	const rows =
		evidence?.rows ??
		createSyntheticJudgmentFixtures()
			.slice(0, 2)
			.map((fixture) => ({ fixture, actual: fixture.expected }));
	const config = process.env.AUDIT_EVALUATION_CONFIG_FILE
		? validateAuditConfig(JSON.parse(await readFile(process.env.AUDIT_EVALUATION_CONFIG_FILE, "utf8")))
		: defaultAuditConfig;
	const { evaluate } = await optionalEvaluator();
	const evaluation = await evaluate(buildRecordedJudgmentConfig(rows), {
		cache: false,
		maxConcurrency: 1,
		repeat: 1,
		generateSuggestions: false,
		showProgressBar: false,
		silent: true,
	});
	const summary = await evaluation.toEvaluateSummary();
	if (smoke)
		process.stdout.write(
			`${JSON.stringify({ syntheticFailures: summary.results.filter((result) => !result.success).map((result) => ({ error: result.error, reason: result.gradingResult?.reason })) })}\n`,
		);
	const release = evidence ? validateAuditQualityEvidence(evidence, config) : evaluateJudgmentQuality(rows);
	process.stdout.write(
		`${JSON.stringify({ mode: smoke ? "synthetic_adapter_smoke" : "offline_recorded_replay", newProviderCalls: 0, promptfoo: summary.stats, release }, null, 2)}\n`,
	);
	if (summary.stats.failures || summary.stats.errors || (smoke ? release.passed : !release.passed))
		process.exitCode = 1;
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : "The offline replay could not run"}\n`);
	process.exitCode = 1;
});
