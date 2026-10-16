import type { AuditAnswer, AuditQuestion, Judgment, RestaurantSubject } from "./contracts";
import { type JudgmentRunner, judgeRestaurantAnswer } from "./judgment";

export type JudgmentLabels = Pick<Judgment, "mention" | "recommendation" | "branch">;
export type JudgmentFixture = {
	id: string;
	category: string;
	subject: RestaurantSubject;
	question: AuditQuestion;
	answer: AuditAnswer;
	expected: JudgmentLabels;
	synthetic: boolean;
	annotationsPending: boolean;
	humanReview: { status: "pending" | "reviewed"; reviewer?: string; reviewedAt?: string };
};
export type JudgmentEvaluationRow = { fixture: JudgmentFixture; actual: JudgmentLabels };
export type JudgmentQualityResult = {
	passed: boolean;
	counts: { total: number; humanReviewed: number; pending: number };
	accuracy: number | null;
	recommendationPrecision: number | null;
	matchedBranchPrecision: number | null;
	knownAnswerCoverage: number | null;
	reasons: string[];
};

type SyntheticCase = {
	category: string;
	text: (name: string, street: string, city: string) => string;
	expected: JudgmentLabels;
	quality?: AuditAnswer["quality"];
};
const syntheticCases: SyntheticCase[] = [
	{
		category: "recommended_correct_branch",
		text: (name, street, city) => `I recommend ${name} at ${street} in ${city} for dinner. It is my first suggestion.`,
		expected: { mention: "yes", recommendation: "yes", branch: "matched" },
	},
	{
		category: "recommended_brand_only",
		text: (name) => `I recommend ${name} for dinner. I could not verify a particular street location.`,
		expected: { mention: "yes", recommendation: "yes", branch: "unknown" },
	},
	{
		category: "negative_mention",
		text: (name) =>
			`I do not recommend ${name}. Its name appears in local discussions, but it would not be my suggestion.`,
		expected: { mention: "yes", recommendation: "no", branch: "unknown" },
	},
	{
		category: "not_mentioned",
		text: () => "I recommend Oak Cafe and Harbor Bistro. I have no further suggestions.",
		expected: { mention: "no", recommendation: "no", branch: "unknown" },
	},
	{
		category: "wrong_branch",
		text: (name) =>
			`I recommend ${name} at 999 Pine Avenue in Tacoma. This is a different branch, not the requested location.`,
		expected: { mention: "yes", recommendation: "yes", branch: "wrong_branch" },
	},
	{
		category: "same_name_ambiguity",
		text: (name) =>
			`There are several unrelated restaurants called ${name}. I cannot identify which business the question refers to, so I cannot recommend a specific one.`,
		expected: { mention: "unknown", recommendation: "unknown", branch: "unknown" },
	},
	{
		category: "factual_only",
		text: (name, street, city) =>
			`${name} is listed at ${street} in ${city}. This is a factual listing only; I am not recommending it.`,
		expected: { mention: "yes", recommendation: "no", branch: "matched" },
	},
	{
		category: "truncated_answer",
		text: (name) => `My recommendation may include ${name}, but first I need to verify`,
		expected: { mention: "unknown", recommendation: "unknown", branch: "unknown" },
		quality: "truncated",
	},
];

/** Proposed labels must be reviewed by a person before the release gate can pass. */
export function createSyntheticJudgmentFixtures(): JudgmentFixture[] {
	return Array.from({ length: 8 }, (_, index) => {
		const name = [
			"Juniper Kitchen",
			"Maple Supper Club",
			"Cedar Noodle House",
			"Harbor Trattoria",
			"Elm Garden",
			"Birch Bistro",
			"Cypress Grill",
			"Willow Cafe",
		][index];
		const subject: RestaurantSubject = {
			name,
			address: `${120 + index} Main Street`,
			city: "Seattle",
			state: "WA",
			country: "US",
			website: `https://restaurant-${index}.example`,
			cuisine: "American",
			aliases: [],
			provenance: "requester_asserted",
		};
		return syntheticCases.map((item) => ({
			id: `${item.category}-${index + 1}`,
			category: item.category,
			subject,
			question: {
				id: "dinner",
				type: "discovery" as const,
				language: "en" as const,
				text: "Which restaurants would you recommend for dinner in Seattle, WA?",
			},
			answer: {
				text: item.text(name, subject.address, subject.city),
				citations: [],
				provider: "synthetic-fixture",
				requestedModel: "fixture",
				searchExecution: "not_executed" as const,
				citationAvailability: "unavailable" as const,
				quality: item.quality ?? ("complete" as const),
			},
			expected: { ...item.expected },
			synthetic: true,
			annotationsPending: true,
			humanReview: { status: "pending" as const },
		}));
	}).flat();
}

function isReviewed(fixture: JudgmentFixture): boolean {
	return (
		!fixture.annotationsPending &&
		fixture.humanReview.status === "reviewed" &&
		!!fixture.humanReview.reviewer?.trim() &&
		Number.isFinite(Date.parse(fixture.humanReview.reviewedAt ?? ""))
	);
}

function precision(rows: JudgmentEvaluationRow[], key: "recommendation" | "branch", positive: string): number | null {
	const predicted = rows.filter((row) => row.actual[key] === positive);
	return predicted.length
		? predicted.filter((row) => row.fixture.expected[key] === positive).length / predicted.length
		: null;
}

export function evaluateJudgmentQuality(rows: JudgmentEvaluationRow[]): JudgmentQualityResult {
	if (new Set(rows.map((row) => row.fixture.id)).size !== rows.length)
		throw new Error("Evaluation fixture IDs must be unique");
	const humanReviewed = rows.filter((row) => isReviewed(row.fixture)).length;
	const correct = rows.filter((row) =>
		(Object.keys(row.fixture.expected) as (keyof JudgmentLabels)[]).every(
			(key) => row.actual[key] === row.fixture.expected[key],
		),
	).length;
	const explicit = rows.filter(
		(row) => row.fixture.expected.mention !== "unknown" && row.fixture.expected.recommendation !== "unknown",
	);
	const metrics = {
		accuracy: rows.length ? correct / rows.length : null,
		recommendationPrecision: precision(rows, "recommendation", "yes"),
		matchedBranchPrecision: precision(rows, "branch", "matched"),
		knownAnswerCoverage: explicit.length
			? explicit.filter((row) => row.actual.mention !== "unknown" && row.actual.recommendation !== "unknown").length /
				explicit.length
			: null,
	};
	const reasons: string[] = [];
	const requiredCategories = [
		"recommended_correct_branch",
		"recommended_brand_only",
		"negative_mention",
		"not_mentioned",
		"wrong_branch",
		"same_name_ambiguity",
		"factual_only",
		"truncated_answer",
	];
	const categories = new Set(rows.map((row) => row.fixture.category));
	if (requiredCategories.some((category) => !categories.has(category)))
		reasons.push(
			"Evaluation must cover recommendations, negative and absent mentions, chain ambiguity, wrong branches, same-name ambiguity, factual-only answers, and incomplete answers.",
		);
	if (rows.length < 60) reasons.push("At least 60 evaluation cases are required.");
	if (humanReviewed !== rows.length || humanReviewed < 60)
		reasons.push(
			"At least 60 cases and all included labels must have attributable human review; proposed synthetic labels are not human annotations.",
		);
	if (metrics.accuracy === null || metrics.accuracy < 0.9)
		reasons.push("Major-conclusion accuracy must be at least 90%.");
	if (metrics.recommendationPrecision === null || metrics.recommendationPrecision < 0.95)
		reasons.push("Positive recommendation precision must be at least 95% and include positive predictions.");
	if (metrics.matchedBranchPrecision === null || metrics.matchedBranchPrecision < 0.95)
		reasons.push("Matched-location precision must be at least 95% and include positive predictions.");
	if (metrics.knownAnswerCoverage === null || metrics.knownAnswerCoverage < 0.8)
		reasons.push("Explicit-case judgment coverage must be at least 80%.");
	return {
		passed: !reasons.length,
		counts: { total: rows.length, humanReviewed, pending: rows.length - humanReviewed },
		...metrics,
		reasons,
	};
}

export async function runJudgmentEvaluation(
	fixtures: JudgmentFixture[],
	runStructured: JudgmentRunner,
): Promise<{ rows: JudgmentEvaluationRow[]; quality: JudgmentQualityResult }> {
	const rows: JudgmentEvaluationRow[] = [];
	for (const fixture of fixtures) {
		const actual = await judgeRestaurantAnswer(fixture.subject, fixture.question, fixture.answer, runStructured);
		rows.push({
			fixture,
			actual: { mention: actual.mention, recommendation: actual.recommendation, branch: actual.branch },
		});
	}
	return { rows, quality: evaluateJudgmentQuality(rows) };
}

export function promptfooJudgmentTests(fixtures: JudgmentFixture[]) {
	return fixtures.map((fixture) => ({
		description: `${fixture.id}${fixture.annotationsPending ? " — HUMAN REVIEW PENDING" : ""}`,
		vars: { fixture: JSON.stringify(fixture) },
		assert: [
			{
				type: "javascript" as const,
				value: `(()=>{const result=JSON.parse(output); const expected=${JSON.stringify(fixture.expected)}; return Object.keys(expected).every(key=>result[key]===expected[key]);})()`,
			},
		],
	}));
}
