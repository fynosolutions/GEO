import { describe, expect, it } from "vitest";
import { defaultAuditConfig, validateAuditConfig } from "./config";
import type { AuditAnswer, AuditSampleResult, Judgment, RestaurantSubject, RestaurantWebsiteResult } from "./contracts";
import { judgeRestaurantAnswer, unknownJudgment, validateJudgment } from "./judgment";
import { auditHash, buildAuditPlan } from "./plan";
import { buildAuditReport, renderAuditReportHtml } from "./report";

const subject: RestaurantSubject = {
	name: "Maple Table",
	address: "123 Main Street",
	city: "Seattle",
	state: "WA",
	country: "US",
	website: "https://mapletable.example",
	cuisine: "Italian",
	aliases: [],
	provenance: "requester_asserted",
};
const timestamp = "2026-10-16T12:00:00.000Z";
const plan = buildAuditPlan(subject, defaultAuditConfig, timestamp);
const discovery = plan.questions[0];
const website: RestaurantWebsiteResult = {
	pageFetch: { status: "succeeded" },
	businessExtraction: { status: "succeeded" },
	websiteAudit: { status: "succeeded", score: 80, findings: [] },
	actionChecks: [],
	evidenceRefs: [],
};
function answer(text: string, overrides: Partial<AuditAnswer> = {}): AuditAnswer {
	return {
		text,
		citations: [],
		provider: "openai",
		requestedModel: "gpt-5.4-mini-2026-03-17",
		searchExecution: "unknown",
		citationAvailability: "none_returned",
		quality: "complete",
		...overrides,
	};
}
function judgment(overrides: Partial<Judgment> = {}): Judgment {
	return {
		mention: "yes",
		recommendation: "yes",
		branch: "matched",
		rank: 1,
		quote: "I recommend Maple Table at 123 Main Street in Seattle.",
		note: "The answer explicitly recommends the restaurant at this address.",
		competitors: [],
		...overrides,
	};
}
function report(samples: AuditSampleResult[], websiteInput = website) {
	return buildAuditReport({
		auditId: "test-audit",
		version: 1,
		createdAt: timestamp,
		plan,
		samples,
		website: websiteInput,
	});
}

describe("frozen restaurant detection plan", () => {
	it("produces twenty fixed slots and keeps discovery free of brand clues", () => {
		expect(plan.questions).toHaveLength(10);
		expect(plan.samples).toHaveLength(20);
		expect(new Set(plan.samples.map((sample) => sample.sampleId)).size).toBe(20);
		const questions = plan.questions.filter((question) => question.type === "discovery");
		expect(questions).toHaveLength(8);
		for (const question of questions) {
			expect(question.text).not.toMatch(/Maple Table|123 Main|mapletable/i);
			expect(question.text).toContain("Seattle");
		}
		expect(
			plan.questions
				.filter((question) => question.type === "brand_verification")
				.every((question) => question.text.includes(subject.name)),
		).toBe(true);
	});
	it("freezes independent configuration and provides a canonical content hash", () => {
		expect(Object.isFrozen(plan.questions)).toBe(true);
		expect(auditHash({ b: 2, a: 1 })).toBe(auditHash({ a: 1, b: 2 }));
		expect(buildAuditPlan(subject, defaultAuditConfig, timestamp).hash).toBe(plan.hash);
		expect(buildAuditPlan({ ...subject, city: "Tacoma" }, defaultAuditConfig, timestamp).hash).not.toBe(plan.hash);
		expect(Object.isFrozen(defaultAuditConfig)).toBe(false);
	});
	it("rejects brand leakage through user fields and unsafe target overrides", () => {
		expect(() => buildAuditPlan({ ...subject, cuisine: "Maple Table" })).toThrow(/Discovery/);
		const config = structuredClone(defaultAuditConfig);
		config.targets[0].model = "unpriced-random-model";
		expect(() => validateAuditConfig(config)).toThrow(/approved/);
		config.targets[0] = { ...defaultAuditConfig.targets[0], maxOutputTokens: 10000 };
		expect(() => validateAuditConfig(config)).toThrow();
	});
	it("does not invent cuisine when it is missing", () => {
		const result = buildAuditPlan({ ...subject, cuisine: undefined });
		expect(result.questions.find((question) => question.id === "cuisine")?.text).toContain("local restaurants");
	});
});

describe("evidence-grounded restaurant judgments", () => {
	it("separates a negative mention from a recommendation", () => {
		const text = "I do not recommend Maple Table; service was inconsistent.";
		const result = validateJudgment(
			subject,
			discovery,
			answer(text),
			judgment({ recommendation: "no", branch: "unknown", rank: null, quote: text }),
		);
		expect(result.mention).toBe("yes");
		expect(result.recommendation).toBe("no");
	});
	it("requires literal evidence and rejects contradictory positive classifications", () => {
		expect(() => validateJudgment(subject, discovery, answer("Nothing found."), judgment())).toThrow(/literally/);
		expect(() => validateJudgment(subject, discovery, answer(judgment().quote), judgment({ mention: "no" }))).toThrow(
			/confirmed mention/,
		);
		expect(() =>
			validateJudgment(
				subject,
				discovery,
				answer("I recommend another place."),
				judgment({ quote: "I recommend another place." }),
			),
		).toThrow(/identify the subject/);
	});
	it("keeps chain-brand-only and unsubstantiated other-branch claims unknown", () => {
		const text = "I recommend Maple Table.";
		expect(validateJudgment(subject, discovery, answer(text), judgment({ quote: text })).branch).toBe("unknown");
		expect(
			validateJudgment(subject, discovery, answer(text), judgment({ quote: text, branch: "wrong_branch" })).branch,
		).toBe("unknown");
	});
	it("accepts an evidenced wrong branch without counting it as the correct location", () => {
		const text = "I recommend Maple Table at 456 Oak Avenue in Tacoma.";
		const result = validateJudgment(
			subject,
			discovery,
			answer(text),
			judgment({ quote: text, branch: "wrong_branch" }),
		);
		expect(result.branch).toBe("wrong_branch");
		const snapshot = report([
			{ sampleId: plan.samples[0].sampleId, status: "succeeded", answer: answer(text), judgment: result },
		]);
		expect(snapshot.groups[0].recommendation.numerator).toBe(1);
		expect(snapshot.groups[0].correctBranchRecommendation.numerator).toBe(0);
	});
	it("does not convert an ambiguous same-name restaurant or a truncated answer into a negative", async () => {
		const result = await judgeRestaurantAnswer(
			subject,
			discovery,
			answer("Maple Table in another town is mentioned, but identity is unclear."),
			async () => unknownJudgment("The name cannot establish the same restaurant."),
		);
		expect(result.mention).toBe("unknown");
		let called = false;
		const truncated = await judgeRestaurantAnswer(
			subject,
			discovery,
			answer("Maple Table", { quality: "truncated" }),
			async () => {
				called = true;
				return judgment();
			},
		);
		expect(called).toBe(false);
		expect(truncated.recommendation).toBe("unknown");
	});
	it("prevents rank on verification answers and fabricated competitor evidence", () => {
		expect(() => validateJudgment(subject, plan.questions[8], answer(judgment().quote), judgment())).toThrow(/Rank/);
		expect(() =>
			validateJudgment(
				subject,
				discovery,
				answer(judgment().quote),
				judgment({ competitors: [{ name: "Other Cafe", quote: "Other Cafe is great." }] }),
			),
		).toThrow(/Competitor evidence/);
	});
});

describe("fixed-sample English report", () => {
	it("excludes private evidence storage fields before hashing the shared report snapshot", () => {
		const sample: AuditSampleResult = {
			sampleId: plan.samples[0].sampleId,
			status: "succeeded",
			answer: answer(judgment().quote),
			evidenceRefs: [{ id: "answer", sha256: "a".repeat(64), path: "private-answer.json" }],
		};
		const sourceWebsite = {
			...website,
			evidenceRefs: [{ id: "home", sha256: "b".repeat(64), path: "private-home.html" }],
			businessExtraction: {
				status: "succeeded" as const,
				data: { nested: { path: "private-extraction", visible: "kept" } },
			},
		};
		const snapshot = report([sample], sourceWebsite);
		expect(JSON.stringify(snapshot)).not.toContain('"path":');
		expect(JSON.stringify(snapshot)).toContain('"visible":"kept"');
		expect(snapshot.hash).toBe(auditHash({ ...JSON.parse(JSON.stringify(snapshot)), hash: undefined }));
		const moved = { ...sample, evidenceRefs: [{ ...sample.evidenceRefs![0], path: "moved-private-answer.json" }] };
		expect(report([moved], sourceWebsite).hash).toBe(snapshot.hash);
		expect(sample.evidenceRefs?.[0].path).toBe("private-answer.json");
	});

	it("separates any citation from a submitted-domain citation and rejects lookalike hosts", () => {
		const sources = [
			"https://other.example/review",
			"https://menu.mapletable.example/dinner",
			"https://mapletable.example.evil.test/fake",
		];
		const samples: AuditSampleResult[] = sources.map((url, index) => ({
			sampleId: plan.samples[index * 2].sampleId,
			status: "succeeded",
			answer: answer("Restaurant answer", { citationAvailability: "returned", citations: [{ url }] }),
		}));
		const snapshot = report(samples);
		expect(snapshot.groups[0].citation).toMatchObject({ numerator: 3, denominator: 3, rate: 1 });
		expect(snapshot.groups[0].targetCitation).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3, unknown: 5 });
		expect(renderAuditReportHtml(snapshot)).toContain("Submitted domain:");
	});

	it("does not treat an unavailable or malformed citation interface as a known missing official source", () => {
		const samples: AuditSampleResult[] = [
			{
				sampleId: plan.samples[0].sampleId,
				status: "succeeded",
				answer: answer("Answer", { citationAvailability: "unavailable" }),
			},
			{
				sampleId: plan.samples[2].sampleId,
				status: "succeeded",
				answer: answer("Answer", { citationAvailability: "returned", citations: [{ url: "javascript:alert(1)" }] }),
			},
			{
				sampleId: plan.samples[4].sampleId,
				status: "succeeded",
				answer: answer("Answer", { citationAvailability: "none_returned" }),
			},
		];
		expect(report(samples).groups[0].targetCitation).toEqual({ numerator: 0, denominator: 1, rate: 0, unknown: 7 });
	});

	it("uses all planned slots, explicit denominators, and unavailable citations", () => {
		const sample: AuditSampleResult = {
			sampleId: plan.samples[0].sampleId,
			status: "succeeded",
			answer: answer(judgment().quote, { citationAvailability: "unavailable" }),
			judgment: judgment(),
		};
		const snapshot = report([sample]);
		expect(snapshot.counts).toEqual({ planned: 20, valid: 1, judged: 1, failed: 0, missing: 19 });
		expect(snapshot.status).toBe("partial");
		expect(snapshot.groups[0].mention).toEqual({ numerator: 1, denominator: 1, rate: 1, unknown: 7 });
		expect(snapshot.groups[0].citation.rate).toBeNull();
		expect(snapshot.groups[0].citationUnavailable).toBe(1);
		expect(snapshot.groups.find((group) => group.questionType === "brand_verification")?.planned).toBe(2);
		expect(snapshot.samples).toHaveLength(20);
		expect(() => report([sample, sample])).toThrow(/Duplicate/);
	});
	it("keeps website score unavailable on audit failure and still serves a failed AI report", () => {
		const snapshot = report([], { ...website, websiteAudit: { status: "failed", score: 0, error: "Fetch failed" } });
		expect(snapshot.websiteTechnicalScore).toBeNull();
		expect(snapshot.status).toBe("failed");
		expect(snapshot.groups[0].mention.rate).toBeNull();
	});
	it("bounds competitor voice to observed discovery brand-answer pairs", () => {
		const first = {
			...judgment(),
			competitors: [
				{ name: "Oak Cafe", quote: "Oak Cafe" },
				{ name: "Oak Cafe", quote: "Oak Cafe" },
			],
		};
		const snapshot = report([
			{
				sampleId: plan.samples[0].sampleId,
				status: "succeeded",
				answer: answer(`${judgment().quote} Oak Cafe`),
				judgment: first,
			},
		]);
		expect(snapshot.competitors[0]).toMatchObject({ mentions: 1, shareOfVoice: 0.5 });
		expect(snapshot.brandShareOfVoice.rate).toBe(0.5);
	});
	it("escapes customer and model content in all report channels and forbids remote resources", () => {
		const malicious = "<script>alert('leak')</script><img src=https://evil.example/x>";
		const snapshot = report([{ sampleId: plan.samples[0].sampleId, status: "succeeded", answer: answer(malicious) }]);
		const html = renderAuditReportHtml(snapshot);
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img src=");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("default-src 'none'");
		expect(html).toContain("9. Missing Data and Limitations");
		expect(Object.isFrozen(snapshot.samples)).toBe(true);
	});

	it("labels stub output as synthetic and leaves caller-owned website data mutable", () => {
		const sourceWebsite = structuredClone(website);
		sourceWebsite.websiteAudit.findings = [
			{
				id: "schema",
				title: "Schema finding",
				detail: "Review the schema.",
				priority: "medium",
				evidenceIds: ["page:home"],
			},
		];
		const snapshot = report(
			[
				{
					sampleId: plan.samples[0].sampleId,
					status: "succeeded",
					answer: answer("Synthetic content", { provider: "stub" }),
				},
			],
			sourceWebsite,
		);
		expect(snapshot.synthetic).toBe(true);
		expect(renderAuditReportHtml(snapshot)).toContain("Synthetic Test Report");
		expect(snapshot.limitations.join(" ")).toContain("not a real restaurant visibility measurement");
		expect(Object.isFrozen(sourceWebsite.websiteAudit.findings[0].evidenceIds)).toBe(false);
		sourceWebsite.websiteAudit.findings[0].evidenceIds.push("page:menu");
		expect(snapshot.actions[0].evidenceIds).toEqual(["page:home"]);
	});
});
