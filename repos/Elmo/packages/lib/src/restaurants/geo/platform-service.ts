import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertProjectBudget, PROJECT_BUDGET_LOCK } from "../../audits/budget";
import { db } from "../../db/db";
import type { DbConnection } from "../../db/db-connection";
import { restaurantGeoRecords } from "../../db/schema";
import { authorizeRestaurantScope } from "../service";
import { sha256, stableJson } from "./compare";
import type { Scope } from "./contracts";
import { fetchPlatform, normalizePlatformId, platformConfig } from "./platform-adapters";
import {
	type PlatformBinding,
	type PlatformCode,
	type PlatformProvider,
	type PlatformReply,
	type platformBindInput,
	platformProvider,
	type platformQueryInput,
} from "./platform-contracts";

const BUDGET_MICROS = 20_000_000;
async function event(
	conn: DbConnection,
	actor: string,
	storeId: string,
	kind: string,
	key: string,
	payload: Record<string, unknown>,
) {
	await conn
		.insert(restaurantGeoRecords)
		.values({ storeId, kind, key, payload, sha256: sha256(stableJson(payload)), createdBy: actor });
}
const receiptSchema = z.object({
	actor: z.string(),
	organizationId: z.string(),
	storeId: z.uuid(),
	provider: platformProvider,
	businessId: z.string().min(1).max(250),
	requestId: z.uuid(),
	expires: z.number(),
});
type Receipt = z.infer<typeof receiptSchema>;
function receiptSecret() {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret || secret.length < 32) throw new Error("Receipt signing unavailable");
	return secret;
}
export function signPlatformReceipt(data: Receipt, secret = receiptSecret()) {
	const body = Buffer.from(JSON.stringify(data)).toString("base64url");
	return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function verifyPlatformReceipt(
	token: string,
	actor: string,
	scope: Scope,
	secret = receiptSecret(),
	now = Date.now(),
) {
	const [body, signature, extra] = token.split(".");
	if (!body || !signature || extra) throw new Error("Invalid receipt");
	const expected = createHmac("sha256", secret).update(body).digest();
	const actual = Buffer.from(signature, "base64url");
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid receipt");
	const parsed = receiptSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
	if (
		parsed.actor !== actor ||
		parsed.storeId !== scope.storeId ||
		parsed.organizationId !== scope.organizationId ||
		parsed.expires <= now ||
		!normalizePlatformId(parsed.provider, parsed.businessId)
	)
		throw new Error("Invalid receipt scope");
	return parsed;
}
export async function listPlatformBindings(
	actor: string,
	scope: Scope,
): Promise<{ code: PlatformCode; bindings: PlatformBinding[]; availability: Record<PlatformProvider, PlatformCode> }> {
	const availability = { google_maps: platformConfig("google_maps").code, yelp: platformConfig("yelp").code };
	try {
		await authorizeRestaurantScope(db, actor, scope);
		const rows = await db
			.select()
			.from(restaurantGeoRecords)
			.where(and(eq(restaurantGeoRecords.storeId, scope.storeId), eq(restaurantGeoRecords.kind, "platform_binding")))
			.orderBy(desc(restaurantGeoRecords.createdAt), desc(restaurantGeoRecords.id));
		const bindings: PlatformBinding[] = [];
		for (const row of rows) {
			if (row.sha256 !== sha256(stableJson(row.payload))) continue;
			const value = row.payload as unknown as PlatformBinding;
			if (
				platformProvider.safeParse(value.provider).success &&
				typeof value.businessId === "string" &&
				!bindings.some((b) => b.provider === value.provider)
			)
				bindings.push(value);
		}
		return { code: "ok", availability, bindings };
	} catch {
		return { code: "database_required", availability, bindings: [] };
	}
}
// Every call consumes its ceiling, even on timeout; no unverified refunds or automatic retries.
export function budgetAllows(prior: number, reserved: number, next: number) {
	return (
		[prior, reserved, next].every((n) => Number.isSafeInteger(n) && n >= 0) &&
		next > 0 &&
		prior + reserved + next <= BUDGET_MICROS
	);
}

async function platformCallFitsBudget(connection: DbConnection, prior: number, reserved: number, next: number) {
	if (process.env.AUDIT_SHARED_BUDGET_ENABLED !== "1") return budgetAllows(prior, reserved, next);
	try {
		const budget = await assertProjectBudget(connection, next);
		// A reconciled account must not erase spending already acknowledged by the legacy integration.
		return budget.historicalMicros >= prior;
	} catch {
		return false;
	}
}
export async function queryPlatform(actor: string, input: z.infer<typeof platformQueryInput>): Promise<PlatformReply> {
	try {
		await authorizeRestaurantScope(db, actor, input, true);
	} catch {
		return { code: "unauthorized" };
	}
	const id = normalizePlatformId(input.provider, input.identifier);
	if (!id) return { code: "invalid_identifier" };
	const config = platformConfig(input.provider);
	if (config.code !== "ok") return { code: config.code };
	try {
		receiptSecret();
	} catch {
		return { code: "not_configured" };
	}
	let reserved: PlatformCode;
	try {
		reserved = await db.transaction(
			async (tx) => {
				await authorizeRestaurantScope(tx, actor, input, true);
				// One lock covers all organizations and both providers sharing this project budget.
				await tx.execute(sql`select pg_advisory_xact_lock(${PROJECT_BUDGET_LOCK})`);
				const rows = await tx
					.select()
					.from(restaurantGeoRecords)
					.where(eq(restaurantGeoRecords.kind, "platform_budget"));
				if (rows.some((r) => r.key === input.requestId)) return "duplicate_request";
				if (
					rows.some(
						(r) =>
							r.storeId === input.storeId &&
							r.payload.provider === input.provider &&
							Date.now() - r.createdAt.getTime() < 15000,
					)
				)
					return "rate_limited";
				let total = 0;
				for (const row of rows) {
					if (
						row.sha256 !== sha256(stableJson(row.payload)) ||
						!Number.isSafeInteger(row.payload.reservedMicros) ||
						Number(row.payload.reservedMicros) < 0
					)
						return "budget_exceeded";
					total += Number(row.payload.reservedMicros);
				}
				if (!(await platformCallFitsBudget(tx, config.priorMicros as number, total, config.maxMicros as number)))
					return "budget_exceeded";
				await event(tx, actor, input.storeId, "platform_budget", input.requestId, {
					provider: input.provider,
					reservedMicros: config.maxMicros,
					accounting: "upper_bound_not_verified_charge",
				});
				return "ok";
			},
			{ isolationLevel: "read committed" },
		);
	} catch {
		return { code: "database_required" };
	}
	if (reserved !== "ok") return { code: reserved };
	const reply = await fetchPlatform(input.provider, id, config.key as string);
	try {
		await event(db, actor, input.storeId, "platform_query", input.requestId, {
			provider: input.provider,
			code: reply.code,
		});
	} catch {
		return { code: "database_required" };
	}
	if (reply.code === "ok" && reply.result)
		reply.receipt = signPlatformReceipt({
			actor,
			organizationId: input.organizationId,
			storeId: input.storeId,
			provider: input.provider,
			businessId: reply.result.businessId,
			requestId: input.requestId,
			expires: Date.now() + 10 * 60_000,
		});
	return reply;
}
export async function bindPlatform(
	actor: string,
	input: z.infer<typeof platformBindInput>,
): Promise<{ code: PlatformCode }> {
	try {
		const receipt = verifyPlatformReceipt(input.receipt, actor, input);
		await db.transaction(async (tx) => {
			await authorizeRestaurantScope(tx, actor, input, true);
			const [query] = await tx
				.select()
				.from(restaurantGeoRecords)
				.where(
					and(
						eq(restaurantGeoRecords.storeId, input.storeId),
						eq(restaurantGeoRecords.kind, "platform_query"),
						eq(restaurantGeoRecords.key, receipt.requestId),
					),
				);
			if (!query || query.payload.code !== "ok" || query.sha256 !== sha256(stableJson(query.payload)))
				throw new Error("Preview required");
			const payload = {
				provider: receipt.provider,
				businessId: receipt.businessId,
				confirmedAt: new Date().toISOString(),
			};
			await tx
				.insert(restaurantGeoRecords)
				.values({
					storeId: input.storeId,
					kind: "platform_binding",
					key: receipt.requestId,
					payload,
					sha256: sha256(stableJson(payload)),
					createdBy: actor,
				})
				.onConflictDoNothing();
		});
		return { code: "ok" };
	} catch {
		return { code: "unauthorized" };
	}
}
