import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256, stableJson } from "./compare";

const mocks = vi.hoisted(() => {
	type Row = {
		id?: string;
		storeId: string;
		kind: string;
		key: string;
		payload: Record<string, unknown>;
		sha256: string;
		createdBy: string;
		createdAt: Date;
	};
	const rows: Row[] = [];
	const selected = { value: undefined as Row[] | undefined };
	let tail = Promise.resolve();
	const authorize = vi.fn();
	const fetcher = vi.fn();
	const db = {
		execute: vi.fn().mockResolvedValue([]),
		select: vi.fn(() => ({
			from: () => ({
				where: () => {
					const get = () => selected.value ?? rows.filter((r) => r.kind === "platform_budget");
					return Object.assign(Promise.resolve(get()), { orderBy: async () => get() });
				},
			}),
		})),
		insert: vi.fn(() => ({
			values: (input: Omit<Row, "createdAt">) => {
				const write = () => {
					if (!rows.some((r) => r.kind === input.kind && r.key === input.key && r.storeId === input.storeId))
						rows.push({ ...input, createdAt: new Date() });
				};
				write();
				return Object.assign(Promise.resolve(undefined), { onConflictDoNothing: async () => {} });
			},
		})),
		transaction: vi.fn(async (callback: (conn: unknown) => Promise<unknown>) => {
			const prior = tail;
			let release: () => void = () => {};
			tail = new Promise<void>((resolve) => {
				release = resolve;
			});
			await prior;
			try {
				return await callback(db);
			} finally {
				release();
			}
		}),
	};
	return { db, rows, selected, authorize, fetcher };
});
vi.mock("../../db/db", () => ({ db: mocks.db }));
vi.mock("../service", () => ({ authorizeRestaurantScope: mocks.authorize }));
vi.mock("./platform-adapters", async (importOriginal) => ({
	...(await importOriginal<typeof import("./platform-adapters")>()),
	fetchPlatform: mocks.fetcher,
}));

import {
	bindPlatform,
	budgetAllows,
	listPlatformBindings,
	queryPlatform,
	signPlatformReceipt,
	verifyPlatformReceipt,
} from "./platform-service";

const scope = { organizationId: "org-a", storeId: "00000000-0000-4000-8000-000000000001" };
const requestId = "00000000-0000-4000-8000-000000000002";
const actor = "admin-a";
const secret = "test-secret-at-least-thirty-two-characters";
const input = { ...scope, provider: "google_maps" as const, identifier: "synthetic-id", requestId };

beforeEach(() => {
	vi.unstubAllEnvs();
	vi.stubEnv("GEO_GOOGLE_PLACES_ENABLED", "true");
	vi.stubEnv("GEO_GOOGLE_PLACES_API_KEY", "test-key-never-persist");
	vi.stubEnv("GEO_GOOGLE_MAX_REQUEST_USD", "0.05");
	vi.stubEnv("GEO_PLATFORM_PRIOR_SPEND_USD", "0");
	vi.stubEnv("BETTER_AUTH_SECRET", secret);
	mocks.rows.length = 0;
	mocks.selected.value = undefined;
	mocks.authorize.mockReset().mockResolvedValue({});
	mocks.fetcher.mockReset().mockResolvedValue({
		code: "ok",
		result: {
			provider: "google_maps",
			businessId: "synthetic-id",
			fields: { name: { value: "Never persist this restaurant" } },
		},
	});
});
describe("authorized queries and conservative accounting", () => {
	it("rejects unauthorized scope before calling a platform or reserving money", async () => {
		mocks.authorize.mockRejectedValue(new Error("wrong organization"));
		expect(await queryPlatform(actor, input)).toEqual({ code: "unauthorized" });
		expect(mocks.fetcher).not.toHaveBeenCalled();
		expect(mocks.rows).toHaveLength(0);
	});
	it("reserves once, rejects duplicate submission, and persists no API values or secrets", async () => {
		const result = await queryPlatform(actor, input);
		expect(result.code).toBe("ok");
		expect(result.receipt).toBeTruthy();
		expect(await queryPlatform(actor, input)).toEqual({ code: "duplicate_request" });
		expect(mocks.fetcher).toHaveBeenCalledOnce();
		const stored = JSON.stringify(mocks.rows);
		expect(stored).not.toContain("Never persist");
		expect(stored).not.toContain("test-key-never-persist");
		expect(stored).not.toContain("synthetic-id");
		expect(mocks.rows.find((r) => r.kind === "platform_budget")?.payload.reservedMicros).toBe(50000);
	});
	it("retains the cost ceiling on uncertain outcomes", async () => {
		mocks.fetcher.mockResolvedValue({ code: "timeout" });
		expect(await queryPlatform(actor, input)).toEqual({ code: "timeout" });
		expect(mocks.rows.filter((r) => r.kind === "platform_budget")).toHaveLength(1);
		expect(mocks.rows[0].payload.reservedMicros).toBe(50000);
	});
	it("does not exceed the shared project budget for concurrent store requests", async () => {
		vi.stubEnv("GEO_GOOGLE_MAX_REQUEST_USD", "11");
		const replies = await Promise.all([
			queryPlatform(actor, input),
			queryPlatform(actor, {
				...input,
				storeId: "00000000-0000-4000-8000-000000000003",
				requestId: "00000000-0000-4000-8000-000000000004",
			}),
		]);
		expect(replies.map((r) => r.code).sort()).toEqual(["budget_exceeded", "ok"]);
		expect(mocks.fetcher).toHaveBeenCalledOnce();
	});
	it("includes prior external spending and fails closed on corrupt accounting", async () => {
		vi.stubEnv("GEO_PLATFORM_PRIOR_SPEND_USD", "20");
		expect(await queryPlatform(actor, input)).toEqual({ code: "budget_exceeded" });
		expect(mocks.fetcher).not.toHaveBeenCalled();
		expect(budgetAllows(0, -1, 1)).toBe(false);
		expect(budgetAllows(0, 19_999_999, 1)).toBe(true);
		expect(budgetAllows(0, 19_999_999, 2)).toBe(false);
	});
});
describe("preview-bound identity confirmation", () => {
	it("rejects tampering, expired previews and cross-user or cross-store binding", () => {
		const data = {
			...scope,
			actor,
			provider: "yelp" as const,
			businessId: "canonical-id",
			requestId,
			expires: Date.now() + 60000,
		};
		const token = signPlatformReceipt(data, secret);
		expect(verifyPlatformReceipt(token, actor, scope, secret).businessId).toBe("canonical-id");
		expect(() => verifyPlatformReceipt(`${token}x`, actor, scope, secret)).toThrow();
		expect(() => verifyPlatformReceipt(token, "someone-else", scope, secret)).toThrow();
		expect(() => verifyPlatformReceipt(token, actor, { ...scope, storeId: requestId }, secret)).toThrow();
		expect(() => verifyPlatformReceipt(token, actor, scope, secret, data.expires + 1)).toThrow();
	});
	it("only saves canonical ID and confirmation time after a successful preview", async () => {
		const payload = { provider: "yelp", code: "ok" };
		mocks.selected.value = [
			{
				storeId: scope.storeId,
				kind: "platform_query",
				key: requestId,
				payload,
				sha256: sha256(stableJson(payload)),
				createdBy: actor,
				createdAt: new Date(),
			},
		];
		const receipt = signPlatformReceipt(
			{ ...scope, actor, provider: "yelp", businessId: "canonical-id", requestId, expires: Date.now() + 60000 },
			secret,
		);
		expect(await bindPlatform(actor, { ...scope, receipt, confirmed: true })).toEqual({ code: "ok" });
		const binding = mocks.rows.find((r) => r.kind === "platform_binding");
		expect(Object.keys(binding?.payload ?? {}).sort()).toEqual(["businessId", "confirmedAt", "provider"]);
		expect(binding?.sha256).toBe(sha256(stableJson(binding?.payload)));
		mocks.selected.value = binding ? [binding] : [];
		expect((await listPlatformBindings(actor, scope)).bindings[0].businessId).toBe("canonical-id");
	});
});
