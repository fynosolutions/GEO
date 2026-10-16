import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { type AuditConfig, restaurantSubjectSchema } from "./contracts";
import { evaluateJudgmentQuality, type JudgmentEvaluationRow, type JudgmentQualityResult } from "./evaluation";
import { auditHash } from "./plan";

const labels = z.object({
	mention: z.enum(["yes", "no", "unknown"]),
	recommendation: z.enum(["yes", "no", "unknown"]),
	branch: z.enum(["matched", "wrong_branch", "unknown"]),
});
export const auditQualityEvidenceSchema = z.object({
	schemaVersion: z.literal("restaurant-audit.quality.v1"),
	configHash: z.string().regex(/^[a-f\d]{64}$/),
	evaluatedAt: z.iso.datetime({ offset: true }),
	source: z.literal("budget_accounted_judgments"),
	rows: z
		.array(
			z.object({
				fixture: z.object({
					id: z.string().min(1).max(160),
					category: z.string().min(1).max(160),
					subject: restaurantSubjectSchema,
					question: z.object({
						id: z.string().min(1),
						type: z.enum(["discovery", "brand_verification"]),
						language: z.literal("en"),
						text: z.string().min(1).max(5000),
					}),
					answer: z.object({
						text: z.string().max(100000),
						citations: z
							.array(
								z.object({ url: z.string().max(4000), title: z.string().optional(), citedText: z.string().optional() }),
							)
							.max(100),
						provider: z.string().min(1),
						requestedModel: z.string().min(1),
						returnedModel: z.string().optional(),
						searchExecution: z.enum(["executed", "not_executed", "unknown"]),
						citationAvailability: z.enum(["returned", "none_returned", "unavailable", "parse_error"]),
						quality: z.enum(["complete", "truncated", "empty", "unknown"]),
					}),
					expected: labels,
					synthetic: z.boolean(),
					annotationsPending: z.boolean(),
					humanReview: z.object({
						status: z.enum(["pending", "reviewed"]),
						reviewer: z.string().min(1).max(200).optional(),
						reviewedAt: z.iso.datetime({ offset: true }).optional(),
					}),
				}),
				actual: labels,
			}),
		)
		.min(1)
		.max(1000),
});
export type AuditQualityEvidence = z.infer<typeof auditQualityEvidenceSchema>;
export type AuditQualityCheck = {
	passed: boolean;
	reasons: string[];
	quality?: JudgmentQualityResult;
	configHash?: string;
};

export function createAuditQualityEvidence(
	config: AuditConfig,
	rows: JudgmentEvaluationRow[],
	evaluatedAt = new Date().toISOString(),
): AuditQualityEvidence {
	return auditQualityEvidenceSchema.parse({
		schemaVersion: "restaurant-audit.quality.v1",
		configHash: auditHash(config),
		evaluatedAt,
		source: "budget_accounted_judgments",
		rows,
	});
}

export function validateAuditQualityEvidence(value: unknown, config: AuditConfig, now = Date.now()): AuditQualityCheck {
	const parsed = auditQualityEvidenceSchema.safeParse(value);
	if (!parsed.success)
		return { passed: false, reasons: ["The local quality evidence does not match the required evaluation format."] };
	const evidence = parsed.data;
	const reasons: string[] = [];
	if (evidence.configHash !== auditHash(config))
		reasons.push("The quality evidence belongs to a different model, prompt, or rule configuration.");
	const evaluatedAt = Date.parse(evidence.evaluatedAt);
	if (evaluatedAt > now) reasons.push("The evaluation timestamp cannot be in the future.");
	if (
		evidence.rows.some(
			(row) => row.fixture.humanReview.reviewedAt && Date.parse(row.fixture.humanReview.reviewedAt) > evaluatedAt,
		)
	)
		reasons.push("Human review must be recorded before evaluation publication.");
	try {
		const quality = evaluateJudgmentQuality(evidence.rows);
		reasons.push(...quality.reasons);
		return { passed: !reasons.length, reasons, quality, configHash: evidence.configHash };
	} catch {
		return {
			passed: false,
			reasons: [...reasons, "The quality evidence contains duplicate or invalid evaluation cases."],
		};
	}
}

export async function readAuditQualityEvidence(
	file = process.env.AUDIT_QUALITY_EVIDENCE_FILE,
): Promise<AuditQualityEvidence> {
	if (!file) throw new Error("No local quality evidence file is configured");
	const info = await stat(file);
	if (!info.isFile() || info.size > 5_000_000)
		throw new Error("The local quality evidence file is invalid or exceeds five megabytes");
	const bytes = await readFile(file);
	if (bytes.length > 5_000_000) throw new Error("The local quality evidence file exceeds five megabytes");
	return auditQualityEvidenceSchema.parse(JSON.parse(bytes.toString("utf8")));
}

export async function checkAuditQualityEvidence(
	config: AuditConfig,
	file = process.env.AUDIT_QUALITY_EVIDENCE_FILE,
): Promise<AuditQualityCheck> {
	try {
		return validateAuditQualityEvidence(await readAuditQualityEvidence(file), config);
	} catch {
		return {
			passed: false,
			reasons: ["Reviewed, budget-accounted judgment evidence is required before public release."],
		};
	}
}
