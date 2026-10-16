import { describe, expect, it } from "vitest";
import {
	AuditHttpError,
	assertAuditOrigin,
	auditHttpError,
	auditSessionCookie,
	readAuditBody,
	readAuditSession,
} from "./public-audit-http";

describe("public audit HTTP boundary", () => {
	it("preserves temporary-unavailable status without exposing internal failure details", async () => {
		const response = auditHttpError({ status: 503, message: "private database connection detail" });
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain("private database");
	});
	it("rejects cross-site writes and missing origins before a submission can mutate state", () => {
		for (const origin of [undefined, "https://attacker.example"]) {
			const request = new Request("https://reports.example/api/public-audits", {
				method: "POST",
				headers: origin ? { origin } : {},
			});
			expect(() => assertAuditOrigin(request)).toThrow(AuditHttpError);
		}
		expect(() =>
			assertAuditOrigin(
				new Request("https://reports.example/api/public-audits", {
					method: "POST",
					headers: { origin: "https://reports.example" },
				}),
			),
		).not.toThrow();
	});
	it("accepts only the requested audit's cookie, preventing cross-report cookie substitution", () => {
		const request = new Request("https://reports.example", {
			headers: { cookie: "audit_session_report_a123=token_a123" },
		});
		expect(readAuditSession(request, "report_a123")).toBe("token_a123");
		expect(() => readAuditSession(request, "report_b123")).toThrow("email access link");
	});
	it("issues an HttpOnly SameSite cookie with HTTPS protection", () => {
		expect(auditSessionCookie("report_a123", "secret_123", "2026-10-23T00:00:00Z", true)).toContain(
			"HttpOnly; SameSite=Lax",
		);
		expect(auditSessionCookie("report_a123", "secret_123", "2026-10-23T00:00:00Z", true)).toContain("; Secure");
		expect(() => auditSessionCookie("report_a123", "bad; Path=/", new Date(), true)).toThrow();
	});
	it("rejects an oversized body even without a content-length header", async () => {
		const request = new Request("https://reports.example", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ input: "x".repeat(33000) }),
		});
		await expect(readAuditBody(request)).rejects.toMatchObject({ status: 413 });
	});
	it("rejects malformed JSON and non-object request bodies", async () => {
		for (const body of ["{", "[]", "null"])
			await expect(
				readAuditBody(
					new Request("https://reports.example", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body,
					}),
				),
			).rejects.toMatchObject({ status: 400 });
	});
});
