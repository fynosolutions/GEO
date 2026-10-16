import { afterEach, describe, expect, it, vi } from "vitest";

const secure = vi.hoisted(() => ({ getSafeWebsiteExcerpt: vi.fn() }));
vi.mock("./audits/website", () => secure);

import { getWebsiteExcerpt } from "./website-excerpt";

afterEach(() => vi.clearAllMocks());
describe("safe website excerpt", () => {
	it("normalizes a bare domain before invoking the secure collector", async () => {
		secure.getSafeWebsiteExcerpt.mockResolvedValue("Restaurant facts");
		expect(await getWebsiteExcerpt("restaurant.example/menu")).toBe("Restaurant facts");
		expect(secure.getSafeWebsiteExcerpt).toHaveBeenCalledWith("https://restaurant.example/menu");
	});
	it("returns an empty best-effort excerpt when the safe collector rejects a destination", async () => {
		secure.getSafeWebsiteExcerpt.mockRejectedValue(new Error("private address"));
		expect(await getWebsiteExcerpt("http://127.0.0.1")).toBe("");
	});
	it("does not collect an empty URL", async () => {
		expect(await getWebsiteExcerpt("")).toBe("");
		expect(secure.getSafeWebsiteExcerpt).not.toHaveBeenCalled();
	});
});
