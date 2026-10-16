import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
	createSyntheticJudgmentFixtures,
	evaluateJudgmentQuality,
	type JudgmentEvaluationRow,
	promptfooJudgmentTests,
} from "./evaluation";

describe("restaurant judgment release evaluation", () => {
	it("exports executable expression assertions for offline promptfoo replay", () => {
		const [fixture] = createSyntheticJudgmentFixtures();
		const [{ assert: assertions }] = promptfooJudgmentTests([fixture]);
		expect(runInNewContext(assertions[0].value, { output: JSON.stringify(fixture.expected) })).toBe(true);
		expect(
			runInNewContext(assertions[0].value, { output: JSON.stringify({ ...fixture.expected, recommendation: "no" }) }),
		).toBe(false);
	});
	it("provides diverse pending fixtures without claiming human labeling", () => {
		const fixtures = createSyntheticJudgmentFixtures();
		expect(fixtures).toHaveLength(64);
		expect(new Set(fixtures.map((fixture) => fixture.category)).size).toBe(8);
		expect(fixtures.every((fixture) => fixture.annotationsPending && fixture.synthetic)).toBe(true);
		expect(promptfooJudgmentTests(fixtures)[0].description).toContain("HUMAN REVIEW PENDING");
	});
	it("refuses release even if proposed labels are reproduced perfectly before human review", () => {
		const rows = createSyntheticJudgmentFixtures().map((fixture) => ({ fixture, actual: fixture.expected }));
		const quality = evaluateJudgmentQuality(rows);
		expect(quality.accuracy).toBe(1);
		expect(quality.passed).toBe(false);
		expect(quality.counts.humanReviewed).toBe(0);
		expect(quality.reasons.join(" ")).toContain("human review");
	});
	it("prevents all-unknown answers from passing with superficially high precision", () => {
		const rows: JudgmentEvaluationRow[] = createSyntheticJudgmentFixtures().map((fixture) => ({
			fixture: {
				...fixture,
				annotationsPending: false,
				humanReview: { status: "reviewed", reviewer: "test-reviewer", reviewedAt: "2026-10-16T12:00:00Z" },
			},
			actual: { mention: "unknown", recommendation: "unknown", branch: "unknown" },
		}));
		const quality = evaluateJudgmentQuality(rows);
		expect(quality.knownAnswerCoverage).toBe(0);
		expect(quality.passed).toBe(false);
		expect(quality.recommendationPrecision).toBeNull();
	});
	it("accepts reviewed cases only when all accuracy, precision and coverage gates pass", () => {
		const rows: JudgmentEvaluationRow[] = createSyntheticJudgmentFixtures().map((fixture) => ({
			fixture: {
				...fixture,
				annotationsPending: false,
				humanReview: { status: "reviewed", reviewer: "test-reviewer", reviewedAt: "2026-10-16T12:00:00Z" },
			},
			actual: fixture.expected,
		}));
		expect(evaluateJudgmentQuality(rows).passed).toBe(true);
		expect(() => evaluateJudgmentQuality([...rows, rows[0]])).toThrow(/unique/);
	});

	it("cannot substitute sixty easy positive cases for the required ambiguity and failure scenarios", () => {
		const [fixture] = createSyntheticJudgmentFixtures();
		const rows: JudgmentEvaluationRow[] = Array.from({ length: 60 }, (_, index) => ({
			fixture: {
				...fixture,
				id: `only-positive-${index}`,
				annotationsPending: false,
				humanReview: { status: "reviewed", reviewer: "test-reviewer", reviewedAt: "2026-10-16T12:00:00Z" },
			},
			actual: fixture.expected,
		}));
		const quality = evaluateJudgmentQuality(rows);
		expect(quality.accuracy).toBe(1);
		expect(quality.passed).toBe(false);
		expect(quality.reasons.join(" ")).toContain("must cover");
	});
});
