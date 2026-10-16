import { describe, expect, it, vi } from "vitest";
import {
	fetchPlatform,
	GOOGLE_FIELDS,
	mapPlatformResponse,
	normalizePlatformId,
	platformConfig,
	usdMicros,
} from "./platform-adapters";
import { assertHtmlSource } from "./platform-contracts";

describe("HTML collector routing", () => {
	it("keeps official and other public websites available", () => {
		expect(() => assertHtmlSource("official", "https://example.com")).not.toThrow();
		expect(() => assertHtmlSource("other", "https://sites.google.com/view/restaurant")).not.toThrow();
	});
	it("prevents a platform page from bypassing the live route through another channel", () => {
		for (const url of [
			"https://www.yelp.com/biz/example",
			"https://maps.app.goo.gl/example",
			"https://www.google.com/maps/place/example",
			"https://maps.google.com/",
		])
			expect(() => assertHtmlSource("other", url)).toThrow("实时查询");
		expect(() => assertHtmlSource("google_maps", "https://example.com")).toThrow("实时查询");
	});
});

describe("platform identifiers and activation", () => {
	it("accepts Yelp aliases and canonical IDs but never turns input into a request host", () => {
		expect(normalizePlatformId("yelp", "https://www.yelp.com/biz/example-new-york?x=1")).toBe("example-new-york");
		for (const input of [
			"https://yelp.com.evil.test/biz/store",
			"https://user@yelp.com/biz/store",
			"https://yelp.com/biz/..%2fsecret",
			"../store",
			"https://yelp.com:444/biz/store",
		])
			expect(normalizePlatformId("yelp", input)).toBeNull();
		expect(normalizePlatformId("google_maps", "https://maps.app.goo.gl/example")).toBeNull();
	});
	it("does not start external calls without purpose, key and conservative pricing", () => {
		expect(platformConfig("google_maps", {}).code).toBe("not_enabled");
		expect(platformConfig("google_maps", { GEO_GOOGLE_PLACES_ENABLED: "true" }).code).toBe("not_configured");
		expect(
			platformConfig("google_maps", { GEO_GOOGLE_PLACES_ENABLED: "true", GEO_GOOGLE_PLACES_API_KEY: "key" }).code,
		).toBe("pricing_required");
		expect(platformConfig("yelp", { GEO_YELP_PURPOSE: "analysis", GEO_YELP_API_KEY: "key" }).code).toBe("not_enabled");
		expect(usdMicros("0.000001")).toBe(1);
		for (const value of ["-1", "NaN", "1e-3", "0.0000001"]) expect(usdMicros(value)).toBeNull();
	});
});
describe("platform field mapping", () => {
	it("maps Google weekdays, multiple periods and overnight hours without declaring unreturned days closed", () => {
		const result = mapPlatformResponse("google_maps", {
			id: "example",
			displayName: { text: "Synthetic restaurant" },
			businessStatus: "OPERATIONAL",
			regularOpeningHours: {
				periods: [
					{ open: { day: 0, hour: 18, minute: 0 }, close: { day: 1, hour: 2, minute: 0 } },
					{ open: { day: 1, hour: 11 }, close: { day: 1, hour: 14 } },
					{ open: { day: 1, hour: 17 }, close: { day: 1, hour: 22 } },
				],
			},
		});
		expect(result.hours[7].intervals[0]).toEqual({ open: "18:00", close: "02:00", closesNextDay: true });
		expect(result.hours[1].intervals).toHaveLength(2);
		expect(result.hours[2]).toBeUndefined();
		expect(result.fields.address.state).toBe("not_provided");
		expect(result.fields.businessStatus.value).toContain("不代表此刻开门");
	});
	it("only recognizes Google's explicit all-week 24-hour representation", () => {
		const result = mapPlatformResponse("google_maps", {
			id: "example",
			regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
		});
		expect(Object.values(result.hours)).toHaveLength(7);
		expect(result.hours[1].state).toBe("24h");
		expect(
			mapPlatformResponse("google_maps", {
				id: "example",
				regularOpeningHours: { periods: [{ open: { day: 1, hour: 9 } }] },
			}).hours,
		).toEqual({});
	});
	it("does not confuse Yelp URLs and closure flags with merchant website or permanent closure", () => {
		const result = mapPlatformResponse("yelp", {
			id: "canonical-id",
			url: "https://www.yelp.com/biz/alias",
			is_closed: true,
			hours: [
				{
					hours_type: "REGULAR",
					open: [
						{ day: 0, start: "1800", end: "0200", is_overnight: true },
						{ day: 1, start: "0000", end: "0000", is_overnight: true },
					],
				},
			],
		});
		expect(result.businessId).toBe("canonical-id");
		expect(result.fields.website.state).toBe("not_provided");
		expect(result.fields.businessStatus.value).toContain("是否永久待核实");
		expect(result.hours[1].intervals[0].closesNextDay).toBe(true);
		expect(result.hours[2].state).toBe("24h");
		expect(result.hours[3]).toBeUndefined();
	});
});
describe("bounded private HTTP requests", () => {
	it("uses fixed hosts and field masks, no cache, no redirects or automatic retries", async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-id" })));
		expect((await fetchPlatform("google_maps", "synthetic-id", "secret", fetcher)).code).toBe("ok");
		expect(fetcher).toHaveBeenCalledOnce();
		const [url, options] = fetcher.mock.calls[0];
		expect(String(url)).toContain("https://places.googleapis.com/v1/places/synthetic-id");
		expect(String(url)).not.toContain("secret");
		expect(options).toMatchObject({
			cache: "no-store",
			redirect: "error",
			headers: { "X-Goog-FieldMask": GOOGLE_FIELDS },
		});
	});
	it.each([
		[401, "unauthorized"],
		[403, "unauthorized"],
		[404, "not_found"],
		[429, "rate_limited"],
		[500, "unavailable"],
	] as const)("classifies HTTP %s without returning provider error bodies", async (status, code) => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive error and secret", { status }));
		expect(await fetchPlatform("yelp", "alias", "secret", fetcher)).toEqual({ code });
		expect(fetcher).toHaveBeenCalledOnce();
	});
	it("rejects oversized, malformed and mismatched Google responses", async () => {
		for (const body of ["x".repeat(250001), "not-json", JSON.stringify({ id: "other-id" })]) {
			const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
			expect(await fetchPlatform("google_maps", "expected", "secret", fetcher)).toEqual({ code: "invalid_response" });
		}
	});
	it("times out once without leaking thrown exceptions", async () => {
		vi.useFakeTimers();
		try {
			const fetcher = vi
				.fn<typeof fetch>()
				.mockImplementation(
					(_url, options) =>
						new Promise((_resolve, reject) =>
							options?.signal?.addEventListener("abort", () => reject(new Error("secret network error"))),
						),
				);
			const pending = fetchPlatform("yelp", "alias", "secret", fetcher);
			await vi.advanceTimersByTimeAsync(12001);
			expect(await pending).toEqual({ code: "timeout" });
			expect(fetcher).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});
});
