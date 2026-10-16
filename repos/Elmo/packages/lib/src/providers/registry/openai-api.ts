import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, type InferToolOutput } from "ai";
import { getCredential } from "../../secrets";
import { extractCitationsFromOpenAI, extractTextFromOpenAI } from "../../text-extraction";
import {
	API_PROVIDER_MAX_OUTPUT_TOKENS,
	configuredWhen,
	OPENAI_WEB_SEARCH_CONTEXT_SIZE,
	OPENAI_WEB_SEARCH_MAX_TOOL_CALLS,
	RESEARCH_WEB_SEARCH_CONTEXT_SIZE,
	RESEARCH_WEB_SEARCH_MAX_USES,
	reportedWebQueries,
	warnIfOutputCapped,
} from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { structuredResearch } from "./ai-sdk";
import { nonEmptyStrings } from "./scrape-shared";

const DEFAULT_RESEARCH_MODEL = "gpt-5-mini";

function getOpenAIResponsesModel(model: string) {
	const apiKey = getCredential("OPENAI_API_KEY");
	const provider = apiKey ? createOpenAI({ apiKey }) : openai;
	return provider.responses(model);
}

type WebSearchOutput = InferToolOutput<ReturnType<typeof openai.tools.webSearch>>;

/**
 * The web-search tool runs on OpenAI's side, so the query it actually issued
 * comes back on the tool *result*, not the call — the call's input is empty.
 * A single search reports `query`; a fanned-out one reports `queries`.
 *
 * `tools` is only passed when web search is on, so the compiler can't tie a
 * result back to the tool that produced it and types `output` as `unknown`;
 * callers establish that link by matching `toolName` first. The shape itself is
 * the SDK's, so a renamed field still fails the build here.
 */
function webSearchQueries(output: unknown): string[] {
	const action = (output as WebSearchOutput).action;
	if (action?.type !== "search") return [];
	return nonEmptyStrings([action.query, ...(action.queries ?? [])]);
}

function isResponsesPayload(body: unknown): body is { output: unknown[] } {
	return Array.isArray((body as { output?: unknown } | null | undefined)?.output);
}

function rebuildRawOutput(result: { text: string; sources: readonly { sourceType: string }[] }) {
	const annotations = result.sources
		.filter((source): source is typeof source & { url: string; title?: string } => source.sourceType === "url")
		.map((source) => ({ type: "url_citation", url: source.url, title: source.title }));
	return {
		output: [{ type: "message", content: [{ type: "output_text", text: result.text, annotations }] }],
	};
}

function answerQuality(text: string, finishReason: string): "empty" | "truncated" | "complete" | "unknown" {
	if (!text.trim()) return "empty";
	if (finishReason === "length") return "truncated";
	return finishReason === "stop" ? "complete" : "unknown";
}

function searchExecution(
	searchCalls: number,
	webSearch: boolean,
	hasPayload: boolean,
): "executed" | "not_executed" | "unknown" {
	if (searchCalls > 0) return "executed";
	return !webSearch || hasPayload ? "not_executed" : "unknown";
}

async function runOpenAI(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const webSearch = options?.webSearch === true;

	const result = await generateText({
		// Routed through getOpenAIResponsesModel (not the bare `openai` global,
		// which reads process.env internally) so overlay credentials apply here.
		model: getOpenAIResponsesModel(model),
		prompt,
		maxOutputTokens: options?.maxOutputTokens ?? API_PROVIDER_MAX_OUTPUT_TOKENS["openai-api"],
		...(options?.signal ? { abortSignal: options.signal } : {}),
		...(options?.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
		toolChoice: webSearch ? "auto" : "none",
		...(webSearch
			? {
					tools: { web_search: openai.tools.webSearch({ searchContextSize: OPENAI_WEB_SEARCH_CONTEXT_SIZE }) },
					providerOptions: { openai: { maxToolCalls: options?.maxToolCalls ?? OPENAI_WEB_SEARCH_MAX_TOOL_CALLS } },
				}
			: {}),
	});

	warnIfOutputCapped("openai-api", model, result.finishReason);

	// The payload's web_search_call items are the only record of what the model
	// searched; the rebuilt fallback carries the answer and citations but none.
	const body = result.response?.body;
	const rawOutput = isResponsesPayload(body) ? body : rebuildRawOutput(result);

	const webQueries = result.content.flatMap((part) =>
		part.type === "tool-result" && part.toolName === "web_search" ? webSearchQueries(part.output) : [],
	);
	const searchCalls = isResponsesPayload(body)
		? body.output.filter((part) => (part as { type?: string }).type === "web_search_call").length
		: result.content.filter((part) => part.type === "tool-result" && part.toolName === "web_search").length;
	const textContent = extractTextFromOpenAI(rawOutput);
	const citations = extractCitationsFromOpenAI(rawOutput);

	return {
		rawOutput,
		webQueries: reportedWebQueries(webQueries, { webSearch: options?.webSearch ?? false }),
		textContent,
		citations,
		modelVersion: result.response?.modelId ?? model,
		auditMetadata: {
			searchExecution: searchExecution(searchCalls, webSearch, isResponsesPayload(body)),
			citationAvailability: citations.length ? "returned" : "none_returned",
			quality: answerQuality(textContent, result.finishReason),
			usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, searchCalls },
			providerRequestId: result.response?.id,
		},
	};
}

export const openaiApi: Provider = {
	id: "openai-api",
	name: "OpenAI API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("OPENAI_API_KEY"),

	async run(_model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_RESEARCH_MODEL;
		return runOpenAI(prompt, version, options);
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
		version = DEFAULT_RESEARCH_MODEL,
		signal,
		maxOutputTokens,
		maxRetries,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const object = await structuredResearch(getOpenAIResponsesModel(version), {
			prompt,
			schema,
			signal,
			maxOutputTokens,
			maxRetries,
			...(webSearch
				? {
						tools: {
							web_search: openai.tools.webSearch({ searchContextSize: RESEARCH_WEB_SEARCH_CONTEXT_SIZE }),
						},
						providerOptions: { openai: { maxToolCalls: RESEARCH_WEB_SEARCH_MAX_USES } },
					}
				: {}),
		});
		return { object, modelVersion: version };
	},
};
