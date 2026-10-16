import { getProvider } from "../providers";
import type { Provider } from "../providers/types";
import type {
	AuditAnswer,
	AuditQuestion,
	AuditReportSnapshot,
	AuditTarget,
	Judgment,
	RestaurantSubject,
	RestaurantWebsiteResult,
} from "./contracts";
import { type AuditEmailContent, buildAuditEmail, renderAuditPdf } from "./delivery";
import { judgeRestaurantAnswer } from "./judgment";
import { prepareRestaurantSubject } from "./website";

export type AuditRuntimeTask =
	| { type: "website"; website: string }
	| { type: "sample"; subject: RestaurantSubject; question: AuditQuestion; target: AuditTarget; requestKey: string }
	| {
			type: "judgment";
			subject: RestaurantSubject;
			question: AuditQuestion;
			answer: AuditAnswer;
			target?: AuditTarget;
			requestKey: string;
	  }
	| { type: "pdf"; report: AuditReportSnapshot }
	| {
			type: "email";
			to: string;
			kind: "verification" | "report_ready" | "recovery";
			link: string;
			restaurantName?: string;
			idempotencyKey: string;
	  };

export type AuditRuntimeResult =
	| { type: "website"; website: RestaurantWebsiteResult; rawOutput: unknown }
	| { type: "sample"; answer: AuditAnswer; rawOutput: unknown }
	| { type: "judgment"; judgment: Judgment }
	| { type: "pdf"; bytes: Buffer }
	| { type: "email"; providerMessageId?: string };

export type AuditRuntimeDependencies = {
	provider?: (id: string) => Provider;
	collect?: typeof prepareRestaurantSubject;
	renderPdf?: typeof renderAuditPdf;
	sendEmail?: (
		to: string,
		content: AuditEmailContent,
		idempotencyKey: string,
	) => Promise<void | { providerMessageId?: string }>;
};

function assertLiveCallsEnabled() {
	if (process.env.PUBLIC_AUDIT_LIVE_CALLS_ENABLED !== "1")
		throw new Error("Live audit calls are disabled; reconcile the project budget before enabling them");
}

export async function runAuditSample(
	question: AuditQuestion,
	target: AuditTarget,
	requestKey: string,
	provider: (id: string) => Provider = getProvider,
): Promise<Extract<AuditRuntimeResult, { type: "sample" }>> {
	assertLiveCallsEnabled();
	const runner = provider(target.provider === "openai" ? "openai-api" : "openrouter");
	if (!runner.isConfigured()) throw new Error(`Audit provider ${target.provider} is not configured`);
	// Discovery prompts deliberately receive no target brand, URL or business facts.
	const result = await runner.run(target.provider === "openai" ? "chatgpt" : "gemini", question.text, {
		version: target.model,
		webSearch: target.webSearch,
		signal: AbortSignal.timeout(target.timeoutMs),
		maxOutputTokens: target.maxOutputTokens,
		maxToolCalls: target.maxToolCalls,
		maxRetries: 0,
		searchEngine: target.searchEngine,
		maxResults: target.maxResults,
		requestKey,
	});
	const metadata = result.auditMetadata;
	return {
		type: "sample",
		rawOutput: result.rawOutput,
		answer: {
			text: result.textContent,
			citations: result.citations.map(({ url, title }) => ({ url, ...(title ? { title } : {}) })),
			provider: target.provider,
			requestedModel: target.model,
			returnedModel: result.modelVersion,
			searchExecution: metadata?.searchExecution ?? "unknown",
			citationAvailability: metadata?.citationAvailability ?? "unavailable",
			quality: metadata?.quality ?? (!result.textContent.trim() ? "empty" : "unknown"),
			usage: metadata?.usage,
			providerRequestId: metadata?.providerRequestId,
		},
	};
}

export async function runAuditJudgment(
	task: Extract<AuditRuntimeTask, { type: "judgment" }>,
	provider: (id: string) => Provider = getProvider,
): Promise<Judgment> {
	assertLiveCallsEnabled();
	const runner = provider("openai-api");
	if (!runner.isConfigured() || !runner.runStructuredResearch)
		throw new Error("The configured audit judge is unavailable");
	const runStructured = runner.runStructuredResearch.bind(runner);
	let authenticationError: unknown;
	const judgment = await judgeRestaurantAnswer(task.subject, task.question, task.answer, async (prompt, schema) => {
		if (Buffer.byteLength(prompt, "utf8") > 32768)
			throw new Error("Judgment context exceeds the reviewed input budget");
		try {
			const response = await runStructured({
				prompt,
				schema,
				webSearch: false,
				version: "gpt-5.4-mini-2026-03-17",
				signal: AbortSignal.timeout(90000),
				maxOutputTokens: 1536,
				maxRetries: 0,
			});
			return response.object;
		} catch (error) {
			const status =
				(error as { status?: number; statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode;
			if (status === 401 || status === 403) authenticationError = error;
			throw error;
		}
	});
	if (authenticationError) throw authenticationError;
	return judgment;
}

export async function executeAuditRuntimeTask(
	task: AuditRuntimeTask,
	deps: AuditRuntimeDependencies = {},
): Promise<AuditRuntimeResult> {
	switch (task.type) {
		case "website": {
			const result = await (deps.collect ?? prepareRestaurantSubject)(task.website);
			return { type: "website", website: result.website, rawOutput: result };
		}
		case "sample":
			return runAuditSample(task.question, task.target, task.requestKey, deps.provider);
		case "judgment":
			return { type: "judgment", judgment: await runAuditJudgment(task, deps.provider) };
		case "pdf":
			return { type: "pdf", bytes: await (deps.renderPdf ?? renderAuditPdf)(task.report) };
		case "email": {
			if (!deps.sendEmail) throw new Error("Audit email delivery is not configured");
			const result = await deps.sendEmail(task.to, buildAuditEmail(task), task.idempotencyKey);
			return { type: "email", providerMessageId: result?.providerMessageId };
		}
	}
}
