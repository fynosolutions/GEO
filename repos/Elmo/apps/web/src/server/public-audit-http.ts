import { createHash } from "node:crypto";

export class AuditHttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export const auditResponseHeaders = {
	"Cache-Control": "private, no-store",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
};

export function auditJson(value: unknown, status = 200, headers?: HeadersInit): Response {
	return Response.json(value, { status, headers: { ...auditResponseHeaders, ...headers } });
}

export function assertAuditOrigin(request: Request, canonicalUrl?: string): void {
	if (request.method === "GET" || request.method === "HEAD") return;
	const origin = request.headers.get("origin");
	const expected = new URL(canonicalUrl ?? request.url).origin;
	if (origin !== expected) throw new AuditHttpError(403, "This request must come from this website.");
	if (request.headers.get("sec-fetch-site") === "cross-site")
		throw new AuditHttpError(403, "Cross-site request rejected.");
}

export async function readAuditBody(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		throw new AuditHttpError(415, "Use application/json.");
	if (Number(request.headers.get("content-length")) > 32_768) throw new AuditHttpError(413, "Request is too large.");
	const reader = request.body?.getReader();
	if (!reader) throw new AuditHttpError(400, "A request body is required.");
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const item = await reader.read();
			if (item.done) break;
			size += item.value.byteLength;
			if (size > 32_768) {
				await reader.cancel();
				throw new AuditHttpError(413, "Request is too large.");
			}
			chunks.push(item.value);
		}
		const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid object");
		return body as Record<string, unknown>;
	} catch (error) {
		if (error instanceof AuditHttpError) throw error;
		throw new AuditHttpError(400, "Invalid JSON request.");
	}
}

export function auditString(body: Record<string, unknown>, key: string, maxLength = 500): string {
	const value = body[key];
	if (typeof value !== "string" || !value.trim() || value.length > maxLength)
		throw new AuditHttpError(400, `Invalid ${key}.`);
	return value.trim();
}

export function auditId(value: string | undefined): string {
	if (!value || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) throw new AuditHttpError(404, "Audit not found.");
	return value;
}

export function auditSessionCookie(id: string, token: string, expiresAt: Date | string, secure: boolean): string {
	if (!/^[a-zA-Z0-9_-]+$/.test(token)) throw new AuditHttpError(500, "Unable to establish access.");
	return `audit_session_${auditId(id)}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure ? "; Secure" : ""}`;
}

export function readAuditSession(request: Request, id: string): string {
	const prefix = `audit_session_${auditId(id)}=`;
	const token = request.headers
		.get("cookie")
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(prefix))
		?.slice(prefix.length);
	if (!token || !/^[a-zA-Z0-9_-]+$/.test(token))
		throw new AuditHttpError(401, "Please use your email access link to open this report.");
	return token;
}

export function auditIpHash(request: Request): string {
	const address = process.env.AUDIT_TRUST_PROXY === "1" ? (request.headers.get("x-real-ip") ?? "unknown") : "local";
	return createHash("sha256")
		.update(`${process.env.BETTER_AUTH_SECRET ?? "local-audit"}:${address}`)
		.digest("hex");
}

export function auditHttpError(error: unknown): Response {
	if (error instanceof AuditHttpError) return auditJson({ error: error.message }, error.status);
	if (error instanceof Error && error.name === "ZodError")
		return auditJson({ error: "Please check the supplied fields and try again." }, 400);
	const candidate = error as { status?: unknown; statusCode?: unknown; code?: string; message?: string };
	const supplied = candidate?.status ?? candidate?.statusCode;
	const codeStatus: Record<string, number> = {
		UNAUTHORIZED: 401,
		FORBIDDEN: 403,
		NOT_FOUND: 404,
		RATE_LIMITED: 429,
		DISABLED: 503,
		BUDGET_EXCEEDED: 503,
		CONFLICT: 409,
		INVALID_INPUT: 400,
	};
	const status =
		typeof supplied === "number" && supplied >= 400 && supplied <= 599
			? supplied
			: (codeStatus[candidate?.code ?? ""] ?? 500);
	return auditJson(
		{
			error:
				status < 500
					? (candidate.message ?? "Request could not be completed.")
					: "This service is temporarily unavailable. Please try again later.",
		},
		status,
	);
}
