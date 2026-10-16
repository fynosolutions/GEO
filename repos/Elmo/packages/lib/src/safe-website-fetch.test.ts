import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicWebsiteFetcher } from "./safe-website-fetch";

type ResponseFixture = {
	status?: number;
	headers?: Record<string, string>;
	chunks?: string[];
	complete?: boolean;
	stall?: boolean;
};

function harness(fixtures: ResponseFixture[] = [{}]) {
	const lookup = vi.fn(async () => [{ address: "93.184.215.14", family: 4 }]);
	const options: RequestOptions[] = [];
	const request = vi.fn((input: RequestOptions, callback: (response: IncomingMessage) => void) => {
		options.push(input);
		const fixture = fixtures[options.length - 1] ?? {};
		const stream = new PassThrough();
		const response = Object.assign(stream, {
			statusCode: fixture.status ?? 200,
			headers: fixture.headers ?? { "content-type": "text/html; charset=utf-8" },
			complete: fixture.complete ?? true,
		}) as unknown as IncomingMessage;
		const outgoing = new EventEmitter() as ClientRequest;
		outgoing.end = () => {
			queueMicrotask(() => {
				callback(response);
				if (!fixture.stall) {
					for (const chunk of fixture.chunks ?? ["<html>Restaurant menu</html>"]) stream.write(chunk);
					stream.end();
				}
			});
			return outgoing;
		};
		input.signal?.addEventListener(
			"abort",
			() => {
				response.destroy(input.signal?.reason);
				outgoing.emit("error", input.signal?.reason);
			},
			{ once: true },
		);
		return outgoing;
	});
	return { ...createPublicWebsiteFetcher({ lookup, request }), lookup, request, options };
}

afterEach(() => vi.useRealTimers());

describe("public website destination protection", () => {
	it.each([
		"file:///etc/passwd",
		"ftp://restaurant.example/menu",
		"https://user:secret@restaurant.example",
		"https://restaurant.example:8443",
		"http://localhost",
		"http://a.local",
		"http://a.internal",
		"http://127.0.0.1",
		"http://2130706433",
		"http://0x7f000001",
		"http://0.1.2.3",
		"http://10.0.0.1",
		"http://100.64.0.1",
		"http://169.254.169.254/latest/meta-data",
		"http://172.31.0.1",
		"http://192.168.0.1",
		"http://192.0.0.9",
		"http://192.0.2.1",
		"http://198.18.0.1",
		"http://198.51.100.1",
		"http://203.0.113.1",
		"http://224.0.0.1",
		"http://255.255.255.255",
		"http://[::1]",
		"http://[::ffff:127.0.0.1]",
		"http://[::ffff:8.8.8.8]",
		"http://[fc00::1]",
		"http://[fe80::1]",
		"http://[ff02::1]",
		"http://[64:ff9b::a00:1]",
		"http://[2001::1]",
		"http://[2001:db8::1]",
		"http://[2002:0808:0808::1]",
		"http://[3fff:1::1]",
	])("rejects non-public or unsupported destination %s", async (url) => {
		const client = harness();
		await expect(client.fetchPublicWebsite(url)).rejects.toThrow();
		expect(client.request).not.toHaveBeenCalled();
	});
	it("rejects a DNS answer containing a private address even when another answer is public", async () => {
		const client = harness();
		client.lookup.mockResolvedValue([
			{ address: "93.184.215.14", family: 4 },
			{ address: "10.0.0.1", family: 4 },
		]);
		await expect(client.fetchPublicWebsite("https://restaurant.example")).rejects.toThrow("non-public");
		expect(client.request).not.toHaveBeenCalled();
	});
	it("fails closed for an empty or malformed DNS answer", async () => {
		const client = harness();
		client.lookup.mockResolvedValueOnce([]).mockResolvedValueOnce([{ address: "invalid", family: 4 }]);
		await expect(client.validatePublicWebsiteUrl("https://restaurant.example")).rejects.toThrow("non-public");
		await expect(client.validatePublicWebsiteUrl("https://restaurant.example")).rejects.toThrow("non-public");
	});
	it.each(["https://8.8.8.8/menu", "https://[2606:4700:4700::1111]/menu"])(
		"accepts a public literal without a separate DNS lookup: %s",
		async (url) => {
			const client = harness();
			expect((await client.validatePublicWebsiteUrl(url)).href).toBe(url);
			expect(client.lookup).not.toHaveBeenCalled();
		},
	);
	it("pins the previously checked address while preserving hostname and HTTPS server identity", async () => {
		const client = harness();
		client.lookup.mockResolvedValueOnce([{ address: "93.184.215.14", family: 4 }]);
		const result = await client.fetchPublicWebsite("https://restaurant.example/menu?lang=en#section");
		expect(result.body).toContain("Restaurant menu");
		expect(result.url).toBe("https://restaurant.example/menu?lang=en");
		expect(client.options[0]).toMatchObject({
			hostname: "restaurant.example",
			servername: "restaurant.example",
			path: "/menu?lang=en",
			agent: false,
			autoSelectFamily: false,
			headers: { "accept-encoding": "identity" },
		});
		const pinned = vi.fn();
		client.options[0]?.lookup?.("restaurant.example", { family: 4 }, pinned);
		expect(pinned).toHaveBeenCalledWith(null, "93.184.215.14", 4);
		expect(client.lookup).toHaveBeenCalledTimes(1);
	});
	it("prefers an approved IPv4 answer for deployments without IPv6 connectivity", async () => {
		const client = harness();
		client.lookup.mockResolvedValueOnce([
			{ address: "2606:4700:4700::1111", family: 6 },
			{ address: "93.184.215.14", family: 4 },
		]);
		await client.fetchPublicWebsite("https://restaurant.example");
		const pinned = vi.fn();
		client.options[0]?.lookup?.("restaurant.example", { family: 4 }, pinned);
		expect(pinned).toHaveBeenCalledWith(null, "93.184.215.14", 4);
	});
	it("revalidates DNS on a same-host redirect instead of trusting a prior safe resolution", async () => {
		const client = harness([{ status: 302, headers: { location: "/menu" } }]);
		client.lookup.mockResolvedValueOnce([{ address: "93.184.215.14", family: 4 }]);
		client.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
		await expect(client.fetchPublicWebsite("https://restaurant.example")).rejects.toThrow("non-public");
		expect(client.request).toHaveBeenCalledTimes(1);
	});
	it("does not dispatch a redirect to a private IP", async () => {
		const client = harness([{ status: 302, headers: { location: "http://169.254.169.254/" } }]);
		await expect(client.fetchPublicWebsite("https://restaurant.example")).rejects.toThrow("non-public");
		expect(client.request).toHaveBeenCalledTimes(1);
	});
	it("removes caller credentials and custom headers when a redirect changes origin", async () => {
		const client = harness([{ status: 302, headers: { location: "https://other.example/menu" } }, {}]);
		await client.fetchPublicWebsite("https://restaurant.example", {
			headers: { Authorization: "Bearer test", Cookie: "session=test", "X-Api-Key": "test" },
		});
		expect(client.options[0]?.headers).toMatchObject({ authorization: "Bearer test" });
		expect(client.options[1]?.headers).not.toHaveProperty("authorization");
		expect(client.options[1]?.headers).not.toHaveProperty("cookie");
		expect(client.options[1]?.headers).not.toHaveProperty("x-api-key");
	});
	it("can forbid all redirects for credentialed reader services", async () => {
		const client = harness([{ status: 302, headers: { location: "/menu" } }]);
		await expect(client.fetchPublicWebsite("https://restaurant.example", { maxRedirects: 0 })).rejects.toThrow(
			"redirect limit",
		);
		expect(client.request).toHaveBeenCalledTimes(1);
	});
});

describe("bounded public website responses", () => {
	it("requires successful HTML by default and allows an explicit plain-text reader response", async () => {
		const client = harness([
			{ status: 503 },
			{ headers: { "content-type": "application/octet-stream" } },
			{ headers: { "content-type": "text/plain" }, chunks: ["# Restaurant menu"] },
		]);
		await expect(client.fetchPublicWebsite("https://restaurant.example")).rejects.toThrow("successful");
		await expect(client.fetchPublicWebsite("https://restaurant.example")).rejects.toThrow("content type");
		expect(
			(await client.fetchPublicWebsite("https://restaurant.example", { allowedContentTypes: ["text/plain"] })).body,
		).toBe("# Restaurant menu");
	});
	it("rejects compressed responses even if a server ignores identity encoding", async () => {
		const client = harness([{ headers: { "content-type": "text/html", "content-encoding": "gzip" } }]);
		await expect(client.fetchPublicWebsite("https://restaurant.example")).rejects.toThrow("Encoded");
	});
	it("enforces the declared content length before consuming a body", async () => {
		const client = harness([{ headers: { "content-type": "text/html", "content-length": "99999999" } }]);
		await expect(client.fetchPublicWebsite("https://restaurant.example")).rejects.toThrow("size limit");
	});
	it("enforces streaming byte limits even without a declared content length", async () => {
		const client = harness([{ chunks: ["1234", "5678"] }]);
		await expect(client.fetchPublicWebsite("https://restaurant.example", { maxBytes: 7 })).rejects.toThrow(
			"size limit",
		);
	});
	it("does not let callers increase the maximum accepted response size", async () => {
		const client = harness([{ chunks: ["x".repeat(2 * 1024 * 1024 + 1)] }]);
		await expect(client.fetchPublicWebsite("https://restaurant.example", { maxBytes: 999_999_999 })).rejects.toThrow(
			"size limit",
		);
	});
	it("does not accept incomplete HTTP responses as usable website context", async () => {
		const client = harness([{ complete: false }]);
		await expect(client.fetchPublicWebsite("https://restaurant.example")).rejects.toThrow("interrupted");
	});
	it("bounds DNS resolution within the overall request timeout", async () => {
		vi.useFakeTimers();
		const client = harness();
		client.lookup.mockImplementation(() => new Promise(() => {}));
		const assertion = expect(
			client.fetchPublicWebsite("https://restaurant.example", { timeoutMs: 10 }),
		).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(10);
		await assertion;
		expect(client.request).not.toHaveBeenCalled();
	});
	it("bounds a response that sends headers but never completes its body", async () => {
		vi.useFakeTimers();
		const client = harness([{ stall: true }]);
		const assertion = expect(
			client.fetchPublicWebsite("https://restaurant.example", { timeoutMs: 10 }),
		).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(10);
		await assertion;
	});
	it("supports the reader's 30 second timeout while bounding larger caller requests", async () => {
		vi.useFakeTimers();
		const client = harness();
		client.lookup.mockImplementation(() => new Promise(() => {}));
		const assertion = expect(
			client.fetchPublicWebsite("https://restaurant.example", { timeoutMs: 90_000 }),
		).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(15_000);
		expect(client.request).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(15_000);
		await assertion;
	});
});
