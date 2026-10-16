import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbConnection } from "../db/db-connection";
import { sha256, stableJson } from "../restaurants/geo/compare";
import {
	assertProjectBudget,
	PROJECT_BUDGET_MICROS,
	priceReviewIsCurrent,
	readProjectBudget,
	reconcileProjectBudget,
	reserveCallBudget,
	usdMicros,
	worstCallMicros,
} from "./budget";
import { defaultAuditConfig } from "./config";

type LegacyRecord = { id: string; sha256: string; payload: { reservedMicros: unknown } };
function legacy(id: string, reservedMicros: number): LegacyRecord {
	const payload = { reservedMicros };
	return { id, payload, sha256: sha256(stableJson(payload)) };
}
function connectionFixture(
	options: {
		historical?: number;
		reconciled?: boolean;
		legacy?: LegacyRecord[];
		tracked?: string;
		duplicate?: boolean;
	} = {},
) {
	const queries: string[] = [];
	const account = {
		historical_micros: options.historical ?? 1_000_000,
		reconciled: options.reconciled ?? true,
		accepting: true,
	};
	const execute = vi.fn(async (query) => {
		const statement = new PgDialect().sqlToQuery(query).sql;
		queries.push(statement);
		if (statement.includes("audit_budget_accounts") && statement.startsWith("select")) return { rows: [account] };
		if (statement.includes("restaurant_geo_records")) return { rows: options.legacy ?? [] };
		if (statement.includes("sum(case")) return { rows: [{ total: options.tracked ?? "0" }] };
		if (statement.startsWith("insert into audit_cost_reservations"))
			return { rows: options.duplicate ? [] : [{ id: "reservation-id" }] };
		return { rows: [] };
	});
	return { connection: { execute } as unknown as DbConnection, queries, execute };
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe("shared project budget safety", () => {
	it("uses acknowledged legacy prior spending as a floor instead of adding it twice", async () => {
		vi.stubEnv("GEO_PLATFORM_PRIOR_SPEND_USD", "2");
		const account = connectionFixture({ historical: 2_000_000, tracked: "1000000" });
		expect(await readProjectBudget(account.connection)).toMatchObject({
			historicalMicros: 2_000_000,
			legacyPriorMicros: 2_000_000,
			usedMicros: 3_000_000,
		});
		await expect(readProjectBudget(connectionFixture({ historical: 1_999_999 }).connection)).rejects.toThrow(
			/previously acknowledged/,
		);
		await expect(
			reconcileProjectBudget(
				connectionFixture({ historical: 0, reconciled: false }).connection,
				"admin",
				1_999_999,
				"initial reconciliation",
			),
		).rejects.toThrow(/previously acknowledged/);
	});

	it("fails closed for invalid prior history and corrupted aggregate counters", async () => {
		vi.stubEnv("GEO_PLATFORM_PRIOR_SPEND_USD", "unknown");
		await expect(readProjectBudget(connectionFixture().connection)).rejects.toThrow();
		vi.stubEnv("GEO_PLATFORM_PRIOR_SPEND_USD", "0");
		await expect(readProjectBudget(connectionFixture({ tracked: "not-a-number" }).connection)).rejects.toThrow(
			/invalid amounts/,
		);
		await expect(readProjectBudget(connectionFixture({ historical: -1 }).connection)).rejects.toThrow(
			/invalid amounts/,
		);
	});
	it("counts historical spend, every legacy reservation, and the new ledger exactly once", async () => {
		const fixture = connectionFixture({
			historical: 1_000_000,
			legacy: [legacy("google-one", 20_000), legacy("yelp-one", 30_000)],
			tracked: "75000",
		});
		const result = await readProjectBudget(fixture.connection);
		expect(result).toMatchObject({
			historicalMicros: 1_000_000,
			legacyMicros: 50_000,
			trackedMicros: 75_000,
			usedMicros: 1_125_000,
			remainingMicros: 18_875_000,
		});
		expect(fixture.queries.filter((query) => query.includes("restaurant_geo_records"))).toHaveLength(1);
	});
	it("fails closed for modified or malformed legacy reservations", async () => {
		const corrupted = legacy("tampered", 20_000);
		corrupted.payload.reservedMicros = 1;
		await expect(readProjectBudget(connectionFixture({ legacy: [corrupted] }).connection)).rejects.toThrow(/review/);
		const invalid = {
			id: "invalid",
			payload: { reservedMicros: "20000" },
			sha256: sha256(stableJson({ reservedMicros: "20000" })),
		};
		await expect(readProjectBudget(connectionFixture({ legacy: [invalid] }).connection)).rejects.toThrow(/review/);
	});
	it("does not reserve if the full next call exceeds remaining funds or reconciliation is missing", async () => {
		const exhausted = connectionFixture({ historical: 19_999_999 });
		await expect(
			reserveCallBudget(exhausted.connection, {
				auditId: "audit",
				callKey: "call",
				provider: "openai",
				reservedMicros: 2,
			}),
		).rejects.toThrow(/exhausted/);
		expect(exhausted.queries.some((query) => query.startsWith("insert into audit_cost_reservations"))).toBe(false);
		await expect(assertProjectBudget(connectionFixture({ reconciled: false }).connection, 1)).rejects.toThrow(
			/reconciled/,
		);
	});
	it("refuses duplicate billable call identities instead of silently dispatching twice", async () => {
		const fixture = connectionFixture({ duplicate: true });
		await expect(
			reserveCallBudget(fixture.connection, {
				auditId: "audit",
				callKey: "same-call",
				provider: "openai",
				reservedMicros: 100,
			}),
		).rejects.toThrow(/already been reserved/);
		expect(fixture.queries[0]).toContain("pg_advisory_xact_lock");
	});
	it("cannot reduce reconciled historical spend", async () => {
		const fixture = connectionFixture({ historical: 100 });
		await expect(reconcileProjectBudget(fixture.connection, "administrator", 99, "correction")).rejects.toThrow(
			/cannot be reduced/,
		);
		expect(fixture.queries.some((query) => query.startsWith("insert into audit_budget_accounts"))).toBe(false);
	});
	it("parses exact six-decimal USD amounts and rejects overflow, negatives and exponent notation", () => {
		expect(usdMicros("0.000001")).toBe(1);
		expect(usdMicros("20")).toBe(PROJECT_BUDGET_MICROS);
		for (const value of ["20.000001", "-1", "1e-3", "0.0000001", "NaN", "Infinity"])
			expect(() => usdMicros(value)).toThrow();
	});
	it("provides reviewed bounds only for approved models and an independently bounded judge", () => {
		expect(worstCallMicros(defaultAuditConfig.targets[0])).toBeGreaterThan(300_000);
		expect(worstCallMicros(defaultAuditConfig.targets[1])).toBeGreaterThan(300_000);
		expect(worstCallMicros(defaultAuditConfig.targets[0], true)).toBeGreaterThan(30_000);
		expect(worstCallMicros(defaultAuditConfig.targets[0], true)).toBeLessThan(50_000);
		expect(() => worstCallMicros({ ...defaultAuditConfig.targets[0], model: "unreviewed-model" })).toThrow(/reviewed/);
	});
	it("requires a price review from the last seven days and refuses future timestamps", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
		vi.stubEnv("AUDIT_PRICE_REVIEWED_AT", "2026-10-09T12:00:00Z");
		expect(priceReviewIsCurrent()).toBe(true);
		vi.stubEnv("AUDIT_PRICE_REVIEWED_AT", "2026-10-09T11:59:59Z");
		expect(priceReviewIsCurrent()).toBe(false);
		vi.stubEnv("AUDIT_PRICE_REVIEWED_AT", "2026-10-16T12:00:01Z");
		expect(priceReviewIsCurrent()).toBe(false);
	});
});
