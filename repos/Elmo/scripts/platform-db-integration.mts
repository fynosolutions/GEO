import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "../packages/lib/node_modules/drizzle-orm/index.js";
import { db } from "../packages/lib/src/db/db.ts";
import { restaurantGeoRecords } from "../packages/lib/src/db/schema.ts";
import { member, organization, user } from "../packages/lib/src/db/schema-auth.ts";
import { bindPlatform, listPlatformBindings, queryPlatform } from "../packages/lib/src/restaurants/geo/platform-service.ts";
import { createRestaurantStore } from "../packages/lib/src/restaurants/service.ts";

if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/restaurant_p1_test") throw new Error("Requires isolated restaurant_p1_test database; never run against development or production data");
after(async () => db.$client.end());

test("platform PostgreSQL tenancy, shared budget lock and immutable ID binding (synthetic only)", async suite => {
	const owner = randomUUID(), reader = randomUUID(), outsider = randomUUID();
	const org = randomUUID(), otherOrg = randomUUID();
	await db.insert(user).values([owner, reader, outsider].map(id => ({ id, name: "Synthetic platform tester", email: `${id}@example.test` })));
	await db.insert(organization).values([org, otherOrg].map(id => ({ id, name: "Synthetic platform QA only", slug: id, createdAt: new Date() })));
	await db.insert(member).values([
		{ id: randomUUID(), organizationId: org, userId: owner, role: "admin", createdAt: new Date() },
		{ id: randomUUID(), organizationId: org, userId: reader, role: "member", createdAt: new Date() },
		{ id: randomUUID(), organizationId: otherOrg, userId: outsider, role: "admin", createdAt: new Date() },
	]);
	const first = await createRestaurantStore(owner, { organizationId: org, brandName: "Synthetic platform cafe", label: "Synthetic first branch" });
	const second = await createRestaurantStore(owner, { organizationId: org, brandId: first.brandId, label: "Synthetic second branch" });
	const scope = { organizationId: org, storeId: first.id };
	const previous = await db.select().from(restaurantGeoRecords).where(eq(restaurantGeoRecords.kind, "platform_budget"));
	const spent = previous.reduce((sum, row) => sum + Number(row.payload.reservedMicros), 0);
	if (!Number.isSafeInteger(spent) || spent < 0 || spent > 19_990_000) throw new Error("Test database budget cannot support another synthetic reservation; use an explicitly prepared fresh isolated test database");
	const names = ["GEO_GOOGLE_PLACES_ENABLED", "GEO_GOOGLE_PLACES_API_KEY", "GEO_GOOGLE_MAX_REQUEST_USD", "GEO_YELP_PURPOSE", "GEO_YELP_API_KEY", "GEO_YELP_MAX_REQUEST_USD", "GEO_PLATFORM_PRIOR_SPEND_USD", "BETTER_AUTH_SECRET"];
	const saved = names.map(name => process.env[name]);
	const originalFetch = globalThis.fetch;
	let calls = 0;
	try {
		Object.assign(process.env, { GEO_GOOGLE_PLACES_ENABLED: "true", GEO_GOOGLE_PLACES_API_KEY: "synthetic-key", GEO_GOOGLE_MAX_REQUEST_USD: "0.01", GEO_YELP_PURPOSE: "evaluation", GEO_YELP_API_KEY: "synthetic-key", GEO_YELP_MAX_REQUEST_USD: "0.01", GEO_PLATFORM_PRIOR_SPEND_USD: ((19_990_000 - spent) / 1_000_000).toFixed(6), BETTER_AUTH_SECRET: "synthetic-platform-receipt-secret-at-least-32-characters" });
		globalThis.fetch = async input => {
			const url = new URL(String(input));
			assert.ok(["places.googleapis.com", "api.yelp.com"].includes(url.hostname));
			calls++;
			return new Response(JSON.stringify({ id: "synthetic-id", name: "DO NOT PERSIST API CONTENT", displayName: { text: "DO NOT PERSIST API CONTENT" } }));
		};
		const request = { ...scope, provider: "google_maps" as const, identifier: "synthetic-id", requestId: randomUUID() };
		await suite.test("denies external calls for non-admins and other organizations", async () => {
			assert.equal((await queryPlatform(reader, request)).code, "unauthorized");
			assert.equal((await queryPlatform(outsider, request)).code, "unauthorized");
			assert.equal(calls, 0);
		});
		const otherRequest = { ...request, storeId: second.id, provider: "yelp" as const, requestId: randomUUID() };
		const results = await Promise.all([queryPlatform(owner, request), queryPlatform(owner, otherRequest)]);
		await suite.test("serializes reservations across stores and both platforms", async () => {
			assert.deepEqual(results.map(r => r.code).sort(), ["budget_exceeded", "ok"]);
			assert.equal(calls, 1);
		});
		const success = results.findIndex(r => r.code === "ok");
		const winner = success === 0 ? request : otherRequest;
		const reply = results[success];
		assert.ok(reply.receipt);
		await suite.test("rejects duplicate calls and cross-branch or cross-user confirmations", async () => {
			assert.equal((await queryPlatform(owner, winner)).code, "duplicate_request");
			assert.equal((await bindPlatform(reader, { ...winner, receipt: reply.receipt!, confirmed: true })).code, "unauthorized");
			assert.equal((await bindPlatform(owner, { ...winner, storeId: winner.storeId === first.id ? second.id : first.id, receipt: reply.receipt!, confirmed: true })).code, "unauthorized");
			assert.equal((await bindPlatform(owner, { ...winner, receipt: reply.receipt!, confirmed: true })).code, "ok");
			assert.equal((await listPlatformBindings(reader, winner)).bindings[0].businessId, "synthetic-id");
			assert.equal((await listPlatformBindings(outsider, winner)).bindings.length, 0);
		});
		await suite.test("stores metadata only and protects every record from mutation", async () => {
			const rows = await db.select().from(restaurantGeoRecords).where(eq(restaurantGeoRecords.storeId, winner.storeId));
			assert.ok(!JSON.stringify(rows).includes("DO NOT PERSIST API CONTENT"));
			assert.ok(!JSON.stringify(rows).includes("synthetic-key"));
			const binding = rows.find(row => row.kind === "platform_binding");
			assert.ok(binding);
			await assert.rejects(db.update(restaurantGeoRecords).set({ kind: "tampered" }).where(eq(restaurantGeoRecords.id, binding.id)));
		});
	} finally {
		globalThis.fetch = originalFetch;
		for (let index = 0; index < names.length; index++) {
			if (saved[index] === undefined) delete process.env[names[index]];
			else process.env[names[index]] = saved[index];
		}
	}
});
