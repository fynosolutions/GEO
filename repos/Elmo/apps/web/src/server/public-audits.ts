import * as service from "@workspace/lib/audits/service";
import { isAdmin, requireAuthSession } from "@/lib/auth/helpers";
import {
	AuditHttpError,
	assertAuditOrigin,
	auditHttpError,
	auditId,
	auditIpHash,
	auditJson,
	auditResponseHeaders,
	auditSessionCookie,
	auditString,
	readAuditBody,
	readAuditSession,
} from "./public-audit-http";

export async function requireAuditAdmin() {
	const session = await requireAuthSession().catch((error: unknown) => {
		if (error instanceof Error && error.message.startsWith("Unauthorized:"))
			throw new AuditHttpError(401, "请先登录内部管理员账号。");
		throw error;
	});
	if (!isAdmin(session)) throw new AuditHttpError(403, "仅限平台内部管理员。");
	return { id: session.user.id, role: "admin" as const };
}

const notFound = () => auditJson({ error: "Endpoint not found." }, 404);
function paths(request: Request, prefix: string): string[] {
	return new URL(request.url).pathname.slice(prefix.length).split("/").filter(Boolean);
}
function sessionHeader(request: Request, id: string, token: string, expiresAt: Date | string) {
	return {
		"Set-Cookie": auditSessionCookie(
			id,
			token,
			expiresAt,
			new URL(process.env.APP_URL ?? request.url).protocol === "https:",
		),
	};
}
function optionalAuditId(value: unknown): string | undefined {
	return typeof value === "string" && value ? auditId(value) : undefined;
}
function objectPayload(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function verify(request: Request, body: Record<string, unknown>): Promise<Response> {
	const result = await service.verifyAuditToken({
		auditId: auditId(auditString(body, "auditId", 80)),
		token: auditString(body, "token", 256),
	});
	return auditJson(
		{ auditId: result.auditId },
		200,
		sessionHeader(request, result.auditId, result.sessionToken, result.expiresAt),
	);
}

async function recover(request: Request, body: Record<string, unknown>): Promise<Response> {
	await service.requestAuditAccessLink({
		email: auditString(body, "email", 254),
		auditId: optionalAuditId(body.auditId),
		ipHash: auditIpHash(request),
	});
	return auditJson({ message: "If a matching report exists, an access link will be sent to that email address." }, 202);
}

async function confirm(request: Request, id: string, body: Record<string, unknown>): Promise<Response> {
	const subject = {
		name: auditString(body, "name", 200),
		address: auditString(body, "address", 300),
		city: auditString(body, "city", 120),
		state: auditString(body, "state", 80),
		country: "US" as const,
		website: auditString(body, "website", 2048),
		cuisine: typeof body.cuisine === "string" ? body.cuisine.slice(0, 120).trim() || undefined : undefined,
	};
	const result = await service.confirmAudit(id, readAuditSession(request, id), subject);
	const headers =
		"sessionToken" in result && typeof result.sessionToken === "string" && "expiresAt" in result
			? sessionHeader(request, result.auditId, result.sessionToken, result.expiresAt as Date | string)
			: undefined;
	return auditJson(
		{ auditId: result.auditId, status: result.status, reused: "reused" in result && result.reused === true },
		202,
		headers,
	);
}

async function publicPost(request: Request, parts: string[]): Promise<Response> {
	const body = await readAuditBody(request);
	if (!parts.length)
		return auditJson(
			await service.createAudit({
				website: auditString(body, "website", 2048),
				email: auditString(body, "email", 254),
				ipHash: auditIpHash(request),
			}),
			202,
		);
	if (parts.length === 1) {
		if (parts[0] === "verify") return verify(request, body);
		if (parts[0] === "access-link") return recover(request, body);
	}
	if (parts.length === 2 && parts[1] === "confirm") return confirm(request, auditId(parts[0]), body);
	return notFound();
}

function reportVersion(request: Request): number | undefined {
	const value = new URL(request.url).searchParams.get("version");
	if (value === null) return undefined;
	const version = Number(value);
	if (!Number.isSafeInteger(version) || version < 1) throw new AuditHttpError(400, "Invalid report version.");
	return version;
}

async function pdfResponse(id: string, token: string, version?: number): Promise<Response> {
	const pdf = await service.getAuditPdf(id, token, version);
	const filename = pdf.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
	return new Response(new Uint8Array(pdf.bytes), {
		headers: {
			...auditResponseHeaders,
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}

async function publicGet(request: Request, parts: string[]): Promise<Response> {
	if (parts.length === 1 && parts[0] === "availability") return auditJson(await service.getAuditAvailability());
	const id = auditId(parts[0]);
	const token = readAuditSession(request, id);
	const version = reportVersion(request);
	if (parts.length === 1) return auditJson(await service.getAuditStatus(id, token));
	if (parts.length !== 2) return notFound();
	switch (parts[1]) {
		case "subject":
			return auditJson(await service.getAuditSubject(id, token));
		case "report":
			return auditJson(await service.getAuditReport(id, token, version));
		case "pdf":
			return pdfResponse(id, token, version);
		default:
			return notFound();
	}
}

export async function publicAuditHandler(request: Request): Promise<Response> {
	try {
		assertAuditOrigin(request, process.env.APP_URL);
		const parts = paths(request, "/api/public-audits");
		if (request.method === "POST") return await publicPost(request, parts);
		if (request.method === "GET") return await publicGet(request, parts);
		return notFound();
	} catch (error) {
		return auditHttpError(error);
	}
}

async function adminPost(request: Request, actor: Awaited<ReturnType<typeof requireAuditAdmin>>): Promise<Response> {
	const body = await readAuditBody(request);
	return auditJson(
		await service.adminAuditAction(actor, {
			auditId: optionalAuditId(body.auditId),
			action: auditString(body, "action", 80),
			payload: objectPayload(body.payload),
			reason: auditString(body, "reason", 2000),
		}),
	);
}

export async function adminAuditHandler(request: Request): Promise<Response> {
	try {
		assertAuditOrigin(request, process.env.APP_URL);
		const actor = await requireAuditAdmin();
		const url = new URL(request.url);
		const parts = paths(request, "/api/admin/audits");
		if (request.method === "POST" && parts.join("/") === "actions") return await adminPost(request, actor);
		if (request.method !== "GET") return notFound();
		if (!parts.length)
			return auditJson(
				await service.adminAuditList(actor, {
					search: url.searchParams.get("search") ?? undefined,
					status: url.searchParams.get("status") ?? undefined,
				}),
			);
		if (parts.length === 1) return auditJson(await service.adminAuditDetail(actor, auditId(parts[0])));
		return notFound();
	} catch (error) {
		return auditHttpError(error);
	}
}
