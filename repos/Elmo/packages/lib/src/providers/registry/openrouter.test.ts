import { afterEach, describe, expect, it, vi } from "vitest";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { openrouter } from "./openrouter";

function stubFetch(overrides: Record<string, unknown> = {}) {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({
			model: "openai/gpt-5-mini-2025-08-07",
			choices: [{ message: { content: "answer" } }],
			...overrides,
		}),
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const [, init] = fetchMock.mock.calls[0];
	return JSON.parse((init as RequestInit).body as string);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("openrouter run", () => {
	it("keeps returned citations separate from independently confirmed search execution", async () => {
		stubFetch({
			choices: [
				{
					message: {
						content: "A sourced answer",
						annotations: [
							{ type: "url_citation", url_citation: { url: "https://restaurant.example/menu", title: "Menu" } },
						],
					},
					finish_reason: "stop",
				},
			],
		});
		const result = await openrouter.run("gemini", "prompt", {
			version: "google/gemini-2.5-flash",
			webSearch: true,
			searchEngine: "exa",
			requestKey: "audit",
		});
		expect(result.citations).toHaveLength(1);
		expect(result.auditMetadata).toMatchObject({ searchExecution: "unknown", citationAvailability: "returned" });
	});
	it("preserves provider authentication status without leaking response bodies", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "private provider diagnostic" }),
		);
		await expect(
			openrouter.run("gemini", "prompt", { version: "google/gemini-2.5-flash", requestKey: "audit" }),
		).rejects.toMatchObject({ status: 401, message: "OpenRouter API error (401)" });
	});
	it("pins Exa for audits, disables fallback and reports unproven searches as unknown", async () => {
		const fetchMock = stubFetch({
			id: "request-a",
			model: "google/gemini-2.5-flash",
			choices: [{ message: { content: "answer" }, finish_reason: "stop" }],
			usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.0002 },
		});
		const signal = AbortSignal.timeout(1000);
		const result = await openrouter.run("gemini", "prompt", {
			version: "google/gemini-2.5-flash",
			webSearch: true,
			searchEngine: "exa",
			maxResults: 3,
			maxOutputTokens: 4096,
			signal,
			requestKey: "a",
		});
		expect(sentBody(fetchMock)).toMatchObject({
			model: "google/gemini-2.5-flash",
			max_tokens: 4096,
			plugins: [{ id: "web", engine: "exa", max_results: 3 }],
			provider: { allow_fallbacks: false },
		});
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal });
		expect(result.auditMetadata).toMatchObject({
			searchExecution: "unknown",
			quality: "complete",
			providerRequestId: "request-a",
			usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.0002 },
		});
	});
	it("caps output tokens and requests web search via the :online alias", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.model).toBe("openai/gpt-5-mini:online");
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
	});

	it("caps output tokens and leaves the slug bare when webSearch is off", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.model).toBe("openai/gpt-5-mini");
	});

	it("does not double-append :online when the version already carries it", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini:online" });

		expect(sentBody(fetchMock).model).toBe("openai/gpt-5-mini:online");
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		stubFetch({ choices: [{ message: { content: "clipped" }, finish_reason: "length" }] });

		const result = await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
		// Logged, never thrown — the partial answer still flows through.
		expect(result.textContent).toBe("clipped");
	});
});
