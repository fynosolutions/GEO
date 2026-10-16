import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	headers: vi.fn(),
	auth: vi.fn(),
	query: vi.fn(),
	bind: vi.fn(),
	list: vi.fn(),
	mode: "local",
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: () => ({ handler: (fn: (context: unknown) => unknown) => (args: unknown) => fn(args) }),
	}),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: mocks.headers }));
vi.mock("@workspace/deployment", () => ({ getDeployment: () => ({ mode: mocks.mode }) }));
vi.mock("@/lib/auth/helpers", () => ({ requireAuthSession: mocks.auth }));
vi.mock("@workspace/lib/restaurants/geo/platform-service", () => ({
	queryPlatform: mocks.query,
	bindPlatform: mocks.bind,
	listPlatformBindings: mocks.list,
}));

import { platformBindingsFn, platformQueryFn } from "./restaurant-platforms";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.mode = "local";
	mocks.auth.mockResolvedValue({ user: { id: "admin" } });
	mocks.list.mockResolvedValue({ bindings: [] });
	mocks.query.mockResolvedValue({ code: "not_configured" });
});
describe("live platform server boundary", () => {
	it("sets no-store for both metadata and live responses", async () => {
		await platformBindingsFn({ data: { organizationId: "org", storeId: "00000000-0000-4000-8000-000000000001" } });
		expect(mocks.headers).toHaveBeenCalledWith("Cache-Control", "no-store, private");
		await platformQueryFn({
			data: {
				organizationId: "org",
				storeId: "00000000-0000-4000-8000-000000000001",
				provider: "google_maps",
				identifier: "synthetic",
				requestId: "00000000-0000-4000-8000-000000000002",
			},
		});
		expect(mocks.query).toHaveBeenCalledWith("admin", expect.objectContaining({ identifier: "synthetic" }));
	});
	it("requires authentication even when platform credentials are not configured", async () => {
		mocks.auth.mockRejectedValue(new Error("Login required"));
		await expect(
			platformBindingsFn({ data: { organizationId: "org", storeId: "00000000-0000-4000-8000-000000000001" } }),
		).rejects.toThrow("Login required");
		expect(mocks.list).not.toHaveBeenCalled();
	});
	it("does not enable this local pilot on other deployments", async () => {
		mocks.mode = "cloud";
		await expect(
			platformBindingsFn({ data: { organizationId: "org", storeId: "00000000-0000-4000-8000-000000000001" } }),
		).rejects.toThrow("本地部署");
		expect(mocks.list).not.toHaveBeenCalled();
	});
});
