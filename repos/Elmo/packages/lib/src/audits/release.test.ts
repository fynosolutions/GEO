import { describe, expect, it } from "vitest";
import { defaultAuditConfig } from "./config";
import { createSyntheticJudgmentFixtures } from "./evaluation";
import { checkAuditQualityEvidence, createAuditQualityEvidence, validateAuditQualityEvidence } from "./release";

function proposedEvidence(reviewed = false) {
	return createAuditQualityEvidence(
		defaultAuditConfig,
		createSyntheticJudgmentFixtures().map((fixture) => ({
			fixture: reviewed
				? {
						...fixture,
						annotationsPending: false,
						humanReview: { status: "reviewed" as const, reviewer: "test reviewer", reviewedAt: "2026-10-15T12:00:00Z" },
					}
				: fixture,
			actual: fixture.expected,
		})),
		"2026-10-16T12:00:00Z",
	);
}

describe("public audit quality release evidence", () => {
	it("blocks perfect proposed labels until attributable human review exists", () => {
		const result = validateAuditQualityEvidence(
			proposedEvidence(),
			defaultAuditConfig,
			Date.parse("2026-10-16T12:00:00Z"),
		);
		expect(result.passed).toBe(false);
		expect(result.quality?.counts.pending).toBe(64);
	});
	it("recomputes thresholds instead of trusting an asserted passed property", () => {
		const evidence = proposedEvidence(true);
		for (const row of evidence.rows) row.actual = { mention: "unknown", recommendation: "unknown", branch: "unknown" };
		const result = validateAuditQualityEvidence(
			{ ...evidence, passed: true },
			defaultAuditConfig,
			Date.parse("2026-10-16T12:00:00Z"),
		);
		expect(result.passed).toBe(false);
		expect(result.quality?.knownAnswerCoverage).toBe(0);
	});

	it("binds passing evidence to the exact released model and question configuration", () => {
		const evidence = proposedEvidence(true);
		expect(validateAuditQualityEvidence(evidence, defaultAuditConfig, Date.parse("2026-10-16T12:00:00Z")).passed).toBe(
			true,
		);
		const changed = structuredClone(defaultAuditConfig);
		changed.questionTemplates[0].template += " List current sources.";
		expect(validateAuditQualityEvidence(evidence, changed, Date.parse("2026-10-16T12:00:00Z")).passed).toBe(false);
	});

	it("rejects fabricated future chronology and fails closed when local evidence is absent", async () => {
		const evidence = proposedEvidence(true);
		expect(validateAuditQualityEvidence(evidence, defaultAuditConfig, Date.parse("2026-10-15T12:00:00Z")).passed).toBe(
			false,
		);
		evidence.rows[0].fixture.humanReview.reviewedAt = "2026-10-17T12:00:00Z";
		expect(validateAuditQualityEvidence(evidence, defaultAuditConfig, Date.parse("2026-10-18T12:00:00Z")).passed).toBe(
			false,
		);
		expect((await checkAuditQualityEvidence(defaultAuditConfig, "nonexistent-local-quality-fixture.json")).passed).toBe(
			false,
		);
	});
});
