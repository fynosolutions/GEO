import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/restaurant-platforms", () => ({
	platformBindFn: vi.fn(),
	platformBindingsFn: vi.fn(),
	platformQueryFn: vi.fn(),
}));

import { PlatformPanel, platformResultHtml } from "./platform-panel";

describe("platform preview rendering", () => {
	it("does not expose query or confirmation controls to ordinary members", () => {
		const html = renderToStaticMarkup(
			<PlatformPanel provider="google_maps" scope={{ organizationId: "org", storeId: "store" }} canConfirm={false} />,
		);
		expect(html).not.toContain("<button");
		expect(html).not.toContain("确认绑定");
		expect(html).toContain("不进入诊断、导出或周检测");
	});
	it("keeps the query button disabled until readiness is known", () => {
		const html = renderToStaticMarkup(
			<PlatformPanel provider="yelp" scope={{ organizationId: "org", storeId: "store" }} canConfirm />,
		);
		expect(html).toContain("disabled");
		expect(html).toContain("Yelp Business ID");
	});
	it("escapes external field content and distinguishes unprovided hours from closure", () => {
		const html = platformResultHtml({
			provider: "google_maps",
			businessId: "synthetic",
			queriedAt: "2026-10-15T00:00:00Z",
			sourceUrl: "https://maps.google.com",
			fields: { name: { state: "observed", value: '<script>alert("x")</script>' }, website: { state: "not_provided" } },
			hours: {},
			attributions: [{ name: "Google Maps" }],
		});
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("周一：未提供");
		expect(html).not.toContain("周一：休息");
		expect(html).toContain("default-src 'none'");
	});
});
