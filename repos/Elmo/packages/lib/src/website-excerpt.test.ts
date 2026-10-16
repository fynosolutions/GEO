import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ fetchPublicWebsite: vi.fn(), validatePublicWebsiteUrl: vi.fn() }));
vi.mock("./safe-website-fetch", () => network);
vi.mock("./audits/website", () => {
	throw new Error("Legacy onboarding cannot require the Python audit collector");
});

import { getWebsiteExcerpt } from "./website-excerpt";

const article = `<!DOCTYPE html><html><head><title>Acme Robotics</title></head><body><nav>Careers Login</nav><article><h1>Acme Robotics</h1><p>Acme Robotics designs autonomous mobile robots for restaurant kitchens. The robots move inventory between storage areas and preparation stations while staff focus on serving guests. Operators can adjust the restaurant floor plan and review inventory from one control panel.</p><p>The restaurant automation service operates in twelve locations and supports staff with accurate, accessible information.</p></article></body></html>`;
const response = (body: string, status = 200) => ({ url: "https://restaurant.example/", status, body });

beforeEach(() => {
	vi.resetAllMocks();
	network.validatePublicWebsiteUrl.mockImplementation(async (value: string) => {
		const parsed = new URL(value);
		parsed.hash = "";
		return parsed;
	});
	network.fetchPublicWebsite.mockRejectedValue(new Error("Source unavailable"));
});
afterEach(() => vi.unstubAllEnvs());

describe("Node-only legacy website context", () => {
	it("retains Jina context without loading Python or requiring a project checkout", async () => {
		vi.stubEnv("GEO_PYTHON", "missing-python");
		vi.stubEnv("GEO_PROJECT_ROOT", "/missing/project");
		network.fetchPublicWebsite.mockResolvedValueOnce(response("# Acme\nRendered restaurant website"));
		expect(await getWebsiteExcerpt("restaurant.example/menu?view=lunch#menu")).toContain("Rendered restaurant website");
		expect(network.validatePublicWebsiteUrl).toHaveBeenCalledWith("https://restaurant.example/menu?view=lunch#menu");
		expect(network.fetchPublicWebsite).toHaveBeenCalledTimes(1);
		expect(network.fetchPublicWebsite.mock.calls[0]?.[0]).toBe(
			"https://r.jina.ai/https://restaurant.example/menu?view=lunch",
		);
	});
	it("falls back to safe HTML and Readability when the reader is unavailable", async () => {
		network.fetchPublicWebsite.mockResolvedValueOnce(response("", 401)).mockResolvedValueOnce(response(article));
		const excerpt = await getWebsiteExcerpt("https://restaurant.example/menu?view=dinner");
		expect(excerpt).toContain("autonomous mobile robots");
		expect(excerpt).not.toContain("Careers Login");
		expect(excerpt).not.toContain("<p>");
		expect(network.fetchPublicWebsite.mock.calls[1]?.[0]).toBe("https://restaurant.example/menu?view=dinner");
	});
	it("passes the optional Jina key only to the fixed reader and forbids its redirects", async () => {
		vi.stubEnv("JINA_API_KEY", "synthetic_reader_key");
		network.fetchPublicWebsite
			.mockRejectedValueOnce(new Error("Reader redirect refused"))
			.mockResolvedValueOnce(response(article));
		expect(await getWebsiteExcerpt("restaurant.example")).toContain("Acme Robotics");
		expect(network.fetchPublicWebsite.mock.calls[0]?.[1]).toMatchObject({
			headers: { Authorization: "Bearer synthetic_reader_key" },
			maxRedirects: 0,
		});
		expect(network.fetchPublicWebsite.mock.calls[1]?.[1].headers.Authorization).toBeUndefined();
	});
	it("does not send credentials when no reader key is configured", async () => {
		vi.stubEnv("JINA_API_KEY", "");
		network.fetchPublicWebsite.mockResolvedValueOnce(response("Public reader content"));
		await getWebsiteExcerpt("restaurant.example");
		expect(network.fetchPublicWebsite.mock.calls[0]?.[1].headers.Authorization).toBeUndefined();
	});
	it("rejects private or unsupported target URLs before sharing them with a reader", async () => {
		network.validatePublicWebsiteUrl.mockRejectedValue(new Error("Destination is not public HTTP(S)"));
		expect(await getWebsiteExcerpt("http://127.0.0.1/metadata")).toBe("");
		expect(await getWebsiteExcerpt("ftp://restaurant.example/menu")).toBe("");
		expect(network.fetchPublicWebsite).not.toHaveBeenCalled();
	});
	it("returns a best-effort empty excerpt when both sources fail", async () => {
		expect(await getWebsiteExcerpt("restaurant.example")).toBe("");
		expect(network.fetchPublicWebsite).toHaveBeenCalledTimes(2);
	});
	it("removes non-visible scripts and styles in the plain-body fallback", async () => {
		network.fetchPublicWebsite
			.mockResolvedValueOnce(response("", 503))
			.mockResolvedValueOnce(
				response(
					"<html><body><div>Open for lunch</div><script>secret script</script><style>hidden style</style><noscript>hidden fallback</noscript></body></html>",
				),
			);
		const excerpt = await getWebsiteExcerpt("restaurant.example");
		expect(excerpt).toContain("Open for lunch");
		expect(excerpt).not.toMatch(/secret script|hidden style|hidden fallback/);
	});
	it("bounds reader excerpts to 200 lines and 20,000 characters", async () => {
		network.fetchPublicWebsite.mockResolvedValueOnce(
			response(Array.from({ length: 300 }, (_, index) => `line ${index}`).join("\n")),
		);
		const excerpt = await getWebsiteExcerpt("restaurant.example");
		expect(excerpt.split("\n")).toHaveLength(200);
		expect(excerpt).not.toContain("line 200");
		network.fetchPublicWebsite.mockResolvedValueOnce(response("x".repeat(40_000)));
		expect((await getWebsiteExcerpt("restaurant.example")).length).toBe(20_000);
	});
	it("skips empty URLs", async () => {
		expect(await getWebsiteExcerpt("  ")).toBe("");
		expect(network.validatePublicWebsiteUrl).not.toHaveBeenCalled();
		expect(network.fetchPublicWebsite).not.toHaveBeenCalled();
	});
});
