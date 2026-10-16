import { type SQL, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { sha256, stableJson } from "../restaurants/geo/compare";
import type { AuditTarget } from "./contracts";

export const PROJECT_BUDGET_MICROS = 20_000_000;
export const PROJECT_BUDGET_LOCK = 716304882;
const accountId = "restaurant-geo-project";

export async function rows<T>(connection: DbConnection, query: SQL): Promise<T[]> {
	const result = await connection.execute(query);
	return result.rows as T[];
}

export function usdMicros(value: unknown) {
	const raw = String(value ?? "");
	if (!/^\d+(\.\d{1,6})?$/.test(raw)) throw new Error("Use a non-negative USD amount with at most six decimals");
	const micros = Math.round(Number(raw) * 1_000_000);
	if (!Number.isSafeInteger(micros) || micros > PROJECT_BUDGET_MICROS) throw new Error("The project test cap is US$20");
	return micros;
}

function acknowledgedLegacySpend() {
	const value = process.env.GEO_PLATFORM_PRIOR_SPEND_USD;
	return value === undefined || !value.trim() ? 0 : usdMicros(value.trim());
}

export async function readProjectBudget(connection: DbConnection) {
	const [account] = await rows<{ reconciled: boolean; historical_micros: number; accepting: boolean }>(
		connection,
		sql`select reconciled,historical_micros,accepting from audit_budget_accounts where id=${accountId}`,
	);
	const legacy = await rows<{ id: string; sha256: string; payload: { reservedMicros?: unknown } }>(
		connection,
		sql`select id,sha256,payload from restaurant_geo_records where kind='platform_budget'`,
	);
	let legacyMicros = 0;
	for (const record of legacy) {
		const value = record.payload.reservedMicros;
		if (record.sha256 !== sha256(stableJson(record.payload)) || !Number.isSafeInteger(value) || Number(value) < 0)
			throw new Error("Legacy platform reservations need review");
		legacyMicros += Number(value);
	}
	const [cost] = await rows<{ total: string }>(
		connection,
		sql`select coalesce(sum(case when status='released' then 0 when status='settled' then actual_micros else reserved_micros end),0)::text as total from audit_cost_reservations`,
	);
	const trackedMicros = Number(cost?.total ?? 0);
	const historicalMicros = account?.historical_micros ?? 0;
	const legacyPriorMicros = acknowledgedLegacySpend();
	if (![historicalMicros, legacyMicros, trackedMicros].every((value) => Number.isSafeInteger(value) && value >= 0))
		throw new Error("Project accounting contains invalid amounts and needs review");
	if (account && historicalMicros < legacyPriorMicros)
		throw new Error("Historical spend must include previously acknowledged legacy spending");
	const usedMicros = historicalMicros + legacyMicros + trackedMicros;
	if (!Number.isSafeInteger(usedMicros)) throw new Error("Project accounting exceeds the supported amount range");
	return {
		capMicros: PROJECT_BUDGET_MICROS,
		historicalMicros,
		legacyPriorMicros,
		legacyMicros,
		trackedMicros,
		usedMicros,
		remainingMicros: Math.max(0, PROJECT_BUDGET_MICROS - usedMicros),
		reconciled: account?.reconciled ?? false,
		accepting: account?.accepting ?? false,
	};
}

export async function assertProjectBudget(connection: DbConnection, nextMicros: number) {
	await connection.execute(sql`select pg_advisory_xact_lock(${PROJECT_BUDGET_LOCK})`);
	const budget = await readProjectBudget(connection);
	if (!budget.reconciled) throw new Error("The project budget must be reconciled before paid calls");
	if (!Number.isSafeInteger(nextMicros) || nextMicros <= 0 || budget.remainingMicros < nextMicros)
		throw new Error("The project test budget is exhausted");
	return budget;
}

export async function reserveCallBudget(
	connection: DbConnection,
	input: { callKey: string; auditId: string; provider: string; reservedMicros: number },
) {
	await assertProjectBudget(connection, input.reservedMicros);
	const [created] = await rows<{ id: string }>(
		connection,
		sql`insert into audit_cost_reservations(call_key,audit_id,provider,reserved_micros) values(${input.callKey},${input.auditId}::uuid,${input.provider},${input.reservedMicros}) on conflict(call_key) do nothing returning id`,
	);
	if (!created) throw new Error("This billable call has already been reserved");
	return created.id;
}

export async function reconcileProjectBudget(
	connection: DbConnection,
	actor: string,
	historicalMicros: number,
	notes: string,
) {
	await connection.execute(sql`select pg_advisory_xact_lock(${PROJECT_BUDGET_LOCK})`);
	const [existing] = await rows<{ reconciled: boolean; historical_micros: number }>(
		connection,
		sql`select reconciled,historical_micros from audit_budget_accounts where id=${accountId} for update`,
	);
	if (existing?.reconciled && historicalMicros < existing.historical_micros)
		throw new Error("Historical spend cannot be reduced after reconciliation");
	if (historicalMicros < 0 || !Number.isSafeInteger(historicalMicros) || historicalMicros > PROJECT_BUDGET_MICROS)
		throw new Error("Invalid historical spend");
	if (historicalMicros < acknowledgedLegacySpend())
		throw new Error("Historical spend cannot be lower than previously acknowledged legacy spending");
	await connection.execute(
		sql`insert into audit_budget_accounts(id,historical_micros,reconciled,notes,updated_by) values(${accountId},${historicalMicros},true,${notes},${actor}) on conflict(id) do update set historical_micros=excluded.historical_micros,reconciled=true,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=now()`,
	);
	return readProjectBudget(connection);
}

/** Deliberately reserves full context bounds, not the old average run estimate. */
export function worstCallMicros(target: AuditTarget, judgment = false) {
	if (judgment) return Math.ceil((32768 * 0.75 + 1536 * 4.5) * 1.25);
	if (target.provider === "openai" && target.model === "gpt-5.4-mini-2026-03-17" && (target.maxToolCalls ?? 1) <= 1) {
		return Math.ceil((400_000 * 0.75 + target.maxOutputTokens * 4.5 + (target.webSearch ? 10_000 : 0)) * 1.25);
	}
	if (
		target.provider === "openrouter" &&
		target.model === "google/gemini-2.5-flash" &&
		(!target.webSearch || (target.searchEngine === "exa" && (target.maxResults ?? 3) <= 3))
	) {
		return Math.ceil((1_048_576 * 0.3 + target.maxOutputTokens * 2.5 + (target.webSearch ? 7_000 : 0)) * 1.25);
	}
	throw new Error("This model configuration has no reviewed cost bound");
}

export function priceReviewIsCurrent() {
	const reviewed = Date.parse(process.env.AUDIT_PRICE_REVIEWED_AT ?? "");
	const age = Date.now() - reviewed;
	return Number.isFinite(age) && age >= 0 && age <= 7 * 86400000;
}
