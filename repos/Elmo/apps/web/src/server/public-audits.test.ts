import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createAudit: vi.fn(),
	verifyAuditToken: vi.fn(),
	getAuditStatus: vi.fn(),
	getAuditReport: vi.fn(),
	getAuditSubject: vi.fn(),
	confirmAudit: vi.fn(),
	getAuditPdf: vi.fn(),
	requestAuditAccessLink: vi.fn(),
	getAuditAvailability: vi.fn(),
	adminAuditList: vi.fn(),
	adminAuditDetail: vi.fn(),
	adminAuditAction: vi.fn(),
	requireAuthSession: vi.fn(),
}));
vi.mock("@workspace/lib/audits/service", () => mocks);
vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: mocks.requireAuthSession,
	isAdmin: (session: { user: { role?: string } }) => session.user.role === "admin",
}));

import { adminAuditHandler, publicAuditHandler } from "./public-audits";

function request(path: string, body?: unknown, cookie?: string) {
	return new Request(`https://reports.example${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: { origin: "https://reports.example", "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("APP_URL", "https://reports.example");
});

describe("customer report access", () => {
	it("does not consume a verification token on GET, including email scanner prefetch", async () => {
		await publicAuditHandler(request("/api/public-audits/verify?auditId=report_a123&token=secret"));
		expect(mocks.verifyAuditToken).not.toHaveBeenCalled();
	});
	it("exchanges a POSTed token for a private cookie without putting it in JSON", async () => {
		mocks.verifyAuditToken.mockResolvedValue({
			auditId: "report_a123",
			sessionToken: "private_session",
			expiresAt: "2026-10-23T00:00:00Z",
		});
		const response = await publicAuditHandler(
			request("/api/public-audits/verify", { auditId: "report_a123", token: "email_token" }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ auditId: "report_a123" });
		expect(response.headers.get("set-cookie")).toContain("private_session");
		expect(response.headers.get("set-cookie")).toContain("HttpOnly");
		expect(response.headers.get("cache-control")).toContain("no-store");
	});
	it("blocks every customer resource without an audit-specific session", async () => {
		for (const suffix of ["", "/subject", "/report", "/pdf"]) {
			const response = await publicAuditHandler(
				request(`/api/public-audits/report_b123${suffix}`, undefined, "audit_session_report_a123=secret"),
			);
			expect(response.status).toBe(401);
		}
		expect(mocks.getAuditStatus).not.toHaveBeenCalled();
		expect(mocks.getAuditSubject).not.toHaveBeenCalled();
		expect(mocks.getAuditReport).not.toHaveBeenCalled();
		expect(mocks.getAuditPdf).not.toHaveBeenCalled();
	});
	it("forwards the audit and session together for service-level authorization", async () => {
		mocks.getAuditReport.mockRejectedValue({ status: 403, message: "Access denied" });
		const response = await publicAuditHandler(
			request("/api/public-audits/report_a123/report", undefined, "audit_session_report_a123=wrong_session"),
		);
		expect(mocks.getAuditReport).toHaveBeenCalledWith("report_a123", "wrong_session", undefined);
		expect(response.status).toBe(403);
	});
	it("uses a neutral response for access recovery", async () => {
		mocks.requestAuditAccessLink.mockResolvedValue(undefined);
		const response = await publicAuditHandler(
			request("/api/public-audits/access-link", { email: "not-found@example.com" }),
		);
		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({
			message: "If a matching report exists, an access link will be sent to that email address.",
		});
	});
	it("sets a fresh scoped cookie when location confirmation reuses an existing report", async () => {
		mocks.confirmAudit.mockResolvedValue({
			auditId: "report_old123",
			status: "completed",
			reused: true,
			sessionToken: "reused_private",
			expiresAt: "2026-10-23T00:00:00Z",
		});
		const response = await publicAuditHandler(
			request(
				"/api/public-audits/report_new123/confirm",
				{
					name: "Test Restaurant",
					address: "1 Main St",
					city: "New York",
					state: "NY",
					website: "https://restaurant.example",
				},
				"audit_session_report_new123=valid_session",
			),
		);
		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ auditId: "report_old123", status: "completed", reused: true });
		expect(response.headers.get("set-cookie")).toContain("audit_session_report_old123=reused_private");
	});
});

describe("internal audit administration", () => {
	it("requires a signed-in internal account before any admin read", async () => {
		mocks.requireAuthSession.mockRejectedValue(new Error("Unauthorized: Authentication required"));
		const response = await adminAuditHandler(request("/api/admin/audits"));
		expect(response.status).toBe(401);
		expect(mocks.adminAuditList).not.toHaveBeenCalled();
	});
	it("rejects organization administrators without platform administrator role", async () => {
		mocks.requireAuthSession.mockResolvedValue({ user: { id: "member123", role: "user" }, organizationRole: "admin" });
		const response = await adminAuditHandler(request("/api/admin/audits"));
		expect(response.status).toBe(403);
		expect(mocks.adminAuditList).not.toHaveBeenCalled();
	});
	it("passes only a verified platform administrator actor to the service", async () => {
		mocks.requireAuthSession.mockResolvedValue({ user: { id: "admin123", role: "admin" } });
		mocks.adminAuditList.mockResolvedValue({ audits: [] });
		const response = await adminAuditHandler(request("/api/admin/audits"));
		expect(response.status).toBe(200);
		expect(mocks.adminAuditList).toHaveBeenCalledWith(
			{ id: "admin123", role: "admin" },
			{ search: undefined, status: undefined },
		);
	});
});
