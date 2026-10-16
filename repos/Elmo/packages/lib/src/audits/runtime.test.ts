import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAuditConfig } from "./config";
import { buildAuditEmail } from "./delivery";
import { executeAuditRuntimeTask, runAuditJudgment, runAuditSample } from "./runtime";
import { getSafeWebsiteExcerpt, type WebsiteCollection } from "./website";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("public audit runtime", () => {
	it.each([401, 403])(
		"propagates judge authentication failure %s so the worker can stop this provider",
		async (statusCode) => {
			vi.stubEnv("PUBLIC_AUDIT_LIVE_CALLS_ENABLED", "1");
			const runStructuredResearch = vi
				.fn()
				.mockRejectedValue(Object.assign(new Error("Authentication rejected"), { statusCode }));
			const subject = {
				name: "Test Cafe",
				address: "1 Main Street",
				city: "Boston",
				state: "MA",
				country: "US" as const,
				website: "https://example.com",
				aliases: [],
				provenance: "requester_asserted" as const,
			};
			await expect(
				runAuditJudgment(
					{
						type: "judgment",
						subject,
						question: { id: "q", type: "discovery", language: "en", text: "Where should I eat in Boston?" },
						answer: {
							text: "I recommend Test Cafe at 1 Main Street.",
							citations: [],
							provider: "openai",
							requestedModel: "test",
							searchExecution: "not_executed",
							citationAvailability: "none_returned",
							quality: "complete",
						},
						requestKey: "judge",
					},
					() => ({
						id: "openai-api",
						name: "test",
						access: "api",
						isConfigured: () => true,
						run: vi.fn(),
						runStructuredResearch,
					}),
				),
			).rejects.toMatchObject({ statusCode });
			expect(runStructuredResearch).toHaveBeenCalledWith(
				expect.objectContaining({
					webSearch: false,
					version: "gpt-5.4-mini-2026-03-17",
					maxOutputTokens: 1536,
					maxRetries: 0,
				}),
			);
		},
	);
	it("does not send live calls unless explicitly enabled", async () => {
		const provider = vi.fn();
		await expect(
			runAuditSample(
				{ id: "q", type: "discovery", language: "en", text: "Where should I eat in Boston?" },
				defaultAuditConfig.targets[0]!,
				"sample",
				provider,
			),
		).rejects.toThrow("disabled");
		expect(provider).not.toHaveBeenCalled();
	});

	it("sends only the frozen discovery question and preserves unknown search metadata", async () => {
		vi.stubEnv("PUBLIC_AUDIT_LIVE_CALLS_ENABLED", "1");
		const run = vi.fn().mockResolvedValue({
			textContent: "Restaurant choices",
			citations: [],
			webQueries: [],
			rawOutput: {},
			modelVersion: "google/gemini-2.5-flash",
			auditMetadata: {
				searchExecution: "unknown",
				citationAvailability: "none_returned",
				quality: "complete",
				usage: { inputTokens: 10, outputTokens: 20 },
			},
		});
		const result = await runAuditSample(
			{ id: "q", type: "discovery", language: "en", text: "Where should I eat in Boston?" },
			defaultAuditConfig.targets[1]!,
			"sample-1",
			() => ({ id: "openrouter", name: "test", access: "api", isConfigured: () => true, run }),
		);
		expect(run).toHaveBeenCalledWith(
			"gemini",
			"Where should I eat in Boston?",
			expect.objectContaining({ maxRetries: 0, maxOutputTokens: 4096, searchEngine: "exa", maxResults: 3 }),
		);
		expect(result.answer.searchExecution).toBe("unknown");
		expect(result.answer.usage?.outputTokens).toBe(20);
	});

	it("delivery retry does not call any model and uses an idempotency key", async () => {
		const sendEmail = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
		const provider = vi.fn();
		const result = await executeAuditRuntimeTask(
			{
				type: "email",
				kind: "report_ready",
				to: "owner@example.com",
				link: "https://reports.example.com/report/a",
				idempotencyKey: "audit-a-report-1",
			},
			{ sendEmail, provider },
		);
		expect(result).toEqual({ type: "email", providerMessageId: "message-1" });
		expect(sendEmail).toHaveBeenCalledWith(
			"owner@example.com",
			expect.objectContaining({ subject: "Your restaurant AI visibility report is ready" }),
			"audit-a-report-1",
		);
		expect(provider).not.toHaveBeenCalled();
	});

	it("escapes user-controlled restaurant names and rejects executable email links", () => {
		expect(
			buildAuditEmail({
				kind: "report_ready",
				link: "https://reports.example.com/a",
				restaurantName: '<img src=x onerror="alert(1)">',
			}).html,
		).not.toContain("<img");
		expect(() => buildAuditEmail({ kind: "verification", link: "javascript:alert(1)" })).toThrow();
	});

	it("extracts text exclusively from the bounded secure collector", async () => {
		const collection: WebsiteCollection = {
			website: {
				pageFetch: { status: "succeeded" },
				businessExtraction: { status: "unknown" },
				websiteAudit: { status: "not_started" },
				actionChecks: [],
				evidenceRefs: [],
			},
			evidence: [],
			pages: [
				{
					url: "https://example.com",
					html: "<html><body><h1>Restaurant</h1><p>Seasonal local food</p><script>alert('secret')</script></body></html>",
				},
			],
		};
		const collector = vi.fn().mockResolvedValue(collection);
		const excerpt = await getSafeWebsiteExcerpt("https://example.com", collector);
		expect(excerpt).toContain("Seasonal local food");
		expect(excerpt).not.toContain("secret");
		expect(collector).toHaveBeenCalledWith("https://example.com", "excerpt");
	});
});
