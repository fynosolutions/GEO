import { z } from "zod";

const text = z
	.string()
	.trim()
	.min(1)
	.max(500)
	.refine(
		(value) => !Array.from(value).some((character) => character.charCodeAt(0) < 32),
		"Control characters are not accepted",
	);
const states =
	/^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/;
export const auditWebsiteSchema = z
	.url()
	.max(2000)
	.refine((value) => {
		const url = new URL(value);
		return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
	}, "Provide an HTTP(S) website without credentials");
export const restaurantSubjectSchema = z.object({
	name: text,
	address: text,
	city: text,
	state: z.string().trim().toUpperCase().regex(states, "A US state or DC is required"),
	postalCode: z
		.string()
		.regex(/^\d{5}(-\d{4})?$/)
		.optional(),
	country: z.literal("US").default("US"),
	website: auditWebsiteSchema,
	cuisine: text.optional(),
	aliases: z.array(text).max(20).default([]),
	provenance: z.enum(["requester_asserted", "website_observed"]),
});
export type RestaurantSubject = z.infer<typeof restaurantSubjectSchema>;
export type Subject = RestaurantSubject;

export type AuditTarget = {
	id: string;
	provider: "openai" | "openrouter";
	model: string;
	webSearch: boolean;
	maxOutputTokens: number;
	timeoutMs: number;
	concurrency: number;
	searchEngine?: "exa";
	maxResults?: number;
	maxToolCalls?: number;
};
export type AuditQuestion = { id: string; type: "discovery" | "brand_verification"; language: "en"; text: string };
export type AuditQuestionTemplate = Omit<AuditQuestion, "text" | "language"> & { template: string };
export type AuditConfig = {
	version: string;
	questionBankVersion: string;
	judgmentVersion: string;
	targets: AuditTarget[];
	questionTemplates: AuditQuestionTemplate[];
};

function validateQuestionTemplate(question: AuditQuestionTemplate, ctx: z.RefinementCtx): void {
	const placeholders = question.template.match(/\{[^}]+\}/g) ?? [];
	const allowed = question.type === "discovery" ? ["{city}", "{state}", "{cuisine}"] : ["{city}", "{state}", "{name}"];
	if (placeholders.some((placeholder) => !allowed.includes(placeholder)))
		ctx.addIssue({ code: "custom", message: "Question contains an unsupported or brand-revealing placeholder" });
	if (!question.template.includes("{city}"))
		ctx.addIssue({ code: "custom", message: "Questions must identify the city" });
	if (question.type === "brand_verification" && !question.template.includes("{name}"))
		ctx.addIssue({ code: "custom", message: "Verification questions must identify the restaurant" });
}
export const auditConfigSchema = z
	.object({
		version: z.string().trim().min(1).max(100),
		questionBankVersion: z.string().trim().min(1).max(100),
		judgmentVersion: z.string().trim().min(1).max(100),
		targets: z
			.array(
				z.object({
					id: z.string().regex(/^[a-z0-9_-]{1,50}$/),
					provider: z.enum(["openai", "openrouter"]),
					model: z.string().min(1).max(200),
					webSearch: z.literal(true),
					maxOutputTokens: z.number().int().min(256).max(4096),
					timeoutMs: z.number().int().min(1000).max(90000),
					concurrency: z.number().int().min(1).max(2),
					searchEngine: z.literal("exa").optional(),
					maxResults: z.number().int().min(1).max(3).optional(),
					maxToolCalls: z.number().int().min(1).max(1).optional(),
				}),
			)
			.length(2),
		questionTemplates: z
			.array(
				z.object({
					id: z.string().regex(/^[a-z0-9_-]{1,80}$/),
					type: z.enum(["discovery", "brand_verification"]),
					template: z.string().trim().min(10).max(2000),
				}),
			)
			.length(10),
	})
	.superRefine((config, ctx) => {
		const targets = config.targets;
		const approved =
			targets.some(
				(target) =>
					target.provider === "openai" &&
					target.model === "gpt-5.4-mini-2026-03-17" &&
					target.maxToolCalls === 1 &&
					!target.searchEngine,
			) &&
			targets.some(
				(target) =>
					target.provider === "openrouter" &&
					target.model === "google/gemini-2.5-flash" &&
					target.searchEngine === "exa" &&
					target.maxResults !== undefined,
			);
		if (!approved) ctx.addIssue({ code: "custom", message: "Only approved OpenAI and Gemini/Exa targets are enabled" });
		if (new Set(targets.map((target) => target.id)).size !== 2)
			ctx.addIssue({ code: "custom", message: "Target IDs must be unique" });
		if (new Set(config.questionTemplates.map((question) => question.id)).size !== 10)
			ctx.addIssue({ code: "custom", message: "Question IDs must be unique" });
		if (config.questionTemplates.filter((question) => question.type === "discovery").length !== 8)
			ctx.addIssue({ code: "custom", message: "Exactly eight discovery and two verification questions are required" });
		for (const question of config.questionTemplates) validateQuestionTemplate(question, ctx);
	});
export type FrozenAuditPlan = {
	schemaVersion: "restaurant-audit.plan.v1";
	subject: RestaurantSubject;
	questions: AuditQuestion[];
	targets: AuditTarget[];
	samples: { sampleId: string; questionId: string; targetId: string }[];
	configVersion: string;
	questionBankVersion: string;
	judgmentVersion: string;
	language: "en";
	repetitions: 1;
	createdAt: string;
	hash: string;
};
export type Citation = { url: string; title?: string; citedText?: string };
export type ProviderUsage = { inputTokens?: number; outputTokens?: number; searchCalls?: number; costUsd?: number };
export type AuditRunOptions = {
	signal: AbortSignal;
	maxOutputTokens: number;
	webSearch: boolean;
	searchEngine?: "exa";
	maxResults?: number;
	maxToolCalls?: number;
	requestKey: string;
};
export type AuditAnswer = {
	text: string;
	citations: Citation[];
	provider: string;
	requestedModel: string;
	returnedModel?: string;
	searchExecution: "executed" | "not_executed" | "unknown";
	citationAvailability: "returned" | "none_returned" | "unavailable" | "parse_error";
	quality: "complete" | "truncated" | "empty" | "unknown";
	usage?: ProviderUsage;
	providerRequestId?: string;
};
export const judgmentSchema = z.object({
	mention: z.enum(["yes", "no", "unknown"]),
	recommendation: z.enum(["yes", "no", "unknown"]),
	branch: z.enum(["matched", "wrong_branch", "unknown"]),
	rank: z.number().int().min(1).max(1000).nullable(),
	quote: z.string().max(10000),
	note: z.string().trim().min(1).max(2000),
	competitors: z.array(z.object({ name: text, quote: z.string().min(1).max(10000) })).max(30),
});
export type Judgment = z.infer<typeof judgmentSchema>;
export type AuditSampleResult = {
	sampleId: string;
	status: "pending" | "running" | "succeeded" | "failed" | "uncertain" | "skipped";
	answer?: AuditAnswer;
	judgment?: Judgment;
	error?: string;
	evidenceRefs?: EvidenceRef[];
};
export type EvidenceRef = {
	id: string;
	sha256: string;
	sourceUrl?: string;
	path?: string;
	bytes?: number;
	collectedAt?: string;
};
export type StageResult = {
	status: "succeeded" | "failed" | "unknown" | "not_started";
	error?: string;
	data?: unknown;
	score?: number | null;
	findings?: {
		id: string;
		title: string;
		detail: string;
		priority: "high" | "medium" | "low";
		evidenceIds: string[];
	}[];
};
export type ActionCheck = {
	id: string;
	kind: string;
	status: "found" | "missing" | "unknown";
	url?: string;
	evidenceIds: string[];
};
export type RestaurantWebsiteResult = {
	pageFetch: StageResult;
	businessExtraction: StageResult;
	websiteAudit: StageResult;
	actionChecks: ActionCheck[];
	evidenceRefs: EvidenceRef[];
	candidates?: Partial<RestaurantSubject>[];
};
export type AuditMetric = { numerator: number; denominator: number; rate: number | null; unknown: number };
export type AuditGroupMetrics = {
	targetId: string;
	questionType: AuditQuestion["type"];
	planned: number;
	valid: number;
	judged: number;
	failed: number;
	missing: number;
	mention: AuditMetric;
	recommendation: AuditMetric;
	correctBranchRecommendation: AuditMetric;
	citation: AuditMetric;
	targetCitation: AuditMetric;
	citationUnavailable: number;
};
export type AuditPriorityAction = {
	id: string;
	priority: "high" | "medium" | "low";
	title: string;
	detail: string;
	evidenceIds: string[];
};
export type AuditReportSnapshot = {
	schemaVersion: "restaurant-audit.report.v1";
	auditId: string;
	version: number;
	createdAt: string;
	planHash: string;
	subject: RestaurantSubject;
	status: "completed" | "partial" | "failed";
	synthetic: boolean;
	counts: { planned: number; valid: number; judged: number; failed: number; missing: number };
	website: RestaurantWebsiteResult;
	websiteTechnicalScore: number | null;
	targets: AuditTarget[];
	questions: AuditQuestion[];
	groups: AuditGroupMetrics[];
	competitors: { name: string; mentions: number; shareOfVoice: number | null; sampleIds: string[] }[];
	brandShareOfVoice: { brand: string; mentions: number; denominator: number; rate: number | null };
	actions: AuditPriorityAction[];
	samples: AuditSampleResult[];
	limitations: string[];
	hash: string;
};
