import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { eq } from "../packages/lib/node_modules/drizzle-orm/index.js";
import { db } from "../packages/lib/src/db/db.ts";
import { restaurantGeoRecords } from "../packages/lib/src/db/schema.ts";
import { member, organization, user } from "../packages/lib/src/db/schema-auth.ts";
import { emptyFacts } from "../packages/lib/src/restaurants/facts.ts";
import { addRestaurantEvidence, confirmRestaurantFacts, createRestaurantStore, saveRestaurantDraft } from "../packages/lib/src/restaurants/service.ts";
import { sha256 } from "../packages/lib/src/restaurants/geo/compare.ts";
import type { Snapshot } from "../packages/lib/src/restaurants/geo/contracts.ts";
import { auditChannel, draftCorrection, getGeoRecord, importManualSnapshot, installPilotBank, recordPublication, verifyPublication } from "../packages/lib/src/restaurants/geo/service.ts";

if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/restaurant_p1_test") throw new Error("Requires isolated restaurant_p1_test database");
after(async () => db.$client.end());
test("GEO evidence, tenancy, immutable records and correction workflow", async suite => {
	const owner = crypto.randomUUID(), reader = crypto.randomUUID(), outsider = crypto.randomUUID();
	const org = crypto.randomUUID(), otherOrg = crypto.randomUUID();
	await db.insert(user).values([owner, reader, outsider].map(id => ({ id, name: "GEO synthetic tester", email: `${id}@example.test` })));
	await db.insert(organization).values([org, otherOrg].map(id => ({ id, name: "GEO software acceptance only", slug: id, createdAt: new Date() })));
	await db.insert(member).values([{ id: crypto.randomUUID(), organizationId: org, userId: owner, role: "admin", createdAt: new Date() }, { id: crypto.randomUUID(), organizationId: org, userId: reader, role: "member", createdAt: new Date() }, { id: crypto.randomUUID(), organizationId: otherOrg, userId: outsider, role: "admin", createdAt: new Date() }]);
	const store = await createRestaurantStore(owner, { organizationId: org, brandName: "Synthetic GEO cafe", label: "Software acceptance only" });
	const other = await createRestaurantStore(owner, { organizationId: org, brandId: store.brandId, label: "Synthetic other branch" });
	const scope = { organizationId: org, storeId: store.id };
	const proof = await addRestaurantEvidence(owner, { ...scope, title: "Synthetic merchant evidence", sourceKind: "merchant_review", sourceUrl: null, observedAt: new Date().toISOString(), text: "TEST ONLY. Synthetic GEO cafe at 1 Example St, New York. Price $$.", attachment: null });
	const facts = emptyFacts();
	facts.identity = { status: "pending", evidenceIds: [proof.id], value: { name: "Synthetic GEO cafe", nativeName: "", aliases: [] } };
	facts.location = { status: "pending", evidenceIds: [proof.id], value: { address: "1 Example St, New York", city: "New York", region: "NY", postalCode: "10001", country: "US", timezone: "America/New_York" } };
	facts.pricing = { status: "pending", evidenceIds: [proof.id], value: { range: "$$", currency: "USD", note: "TEST ONLY" } };
	await saveRestaurantDraft(owner, { ...scope, revision: 0, facts });
	await confirmRestaurantFacts(owner, { ...scope, revision: 1, fields: ["identity", "location", "pricing"], verifiedWith: "Synthetic fixture", note: "Not real restaurant facts" });
	const text = "SYNTHETIC: Synthetic GEO cafe, 1 Example St, New York. Price $$$$.";
	const snapshot: Snapshot = { schemaVersion: "geo.snapshot.v1", id: crypto.randomUUID(), storeId: store.id, channel: "other", listingId: "synthetic-test", url: "https://example.com/location", collectedAt: new Date().toISOString(), method: "manual", collectorVersion: "synthetic-fixture", status: "succeeded", error: null, evidence: [{ id: "page", text, sha256: sha256(text), url: "https://example.com/location" }], fields: { name: { state: "observed", value: "Synthetic GEO cafe", evidenceIds: ["page"], excerpt: "" }, address: { state: "observed", value: "1 Example St, New York", evidenceIds: ["page"], excerpt: "" }, priceRange: { state: "observed", value: "$$$$", evidenceIds: ["page"], excerpt: "" } } };
	const observed = await importManualSnapshot(owner, { ...scope, snapshot });
	await suite.test("enforces tenant, branch and administrator boundaries", async () => {
		await assert.rejects(getGeoRecord(outsider, { ...scope, recordId: observed.id }), /无权/);
		await assert.rejects(getGeoRecord(owner, { ...scope, storeId: other.id, recordId: observed.id }), /其他门店/);
		await assert.rejects(installPilotBank(reader, scope), /管理员/);
		await assert.rejects(importManualSnapshot(owner, { ...scope, snapshot: { ...snapshot, method: "automatic" } }), /manual/);
	});
	await suite.test("preserves idempotency and refuses record overwrites", async () => {
		assert.equal((await importManualSnapshot(owner, { ...scope, snapshot })).id, observed.id);
		await assert.rejects(importManualSnapshot(owner, { ...scope, snapshot: { ...snapshot, error: "changed" } }), /内容不同/);
		await assert.rejects(db.update(restaurantGeoRecords).set({ kind: "tampered" }).where(eq(restaurantGeoRecords.id, observed.id)));
	});
	await suite.test("requires actual publication followed by a newer observation for verification", async () => {
		const audit = await auditChannel(owner, { ...scope, recordId: observed.id, factVersion: 1 });
		const finding = (audit.payload.findings as { id: string; field: string }[]).find(f => f.field === "priceRange");
		assert.ok(finding);
		const draft = await draftCorrection(owner, { ...scope, recordId: audit.id, findingId: finding.id });
		// WSL's database clock can lead Windows; publication must actually follow the saved draft.
		const waitMs = draft.createdAt.getTime() - Date.now() + 10;
		if (waitMs > 10000) throw new Error("Database clock is over ten seconds ahead; synchronize clocks before acceptance");
		if (waitMs > 0) await wait(waitMs);
		const published = await recordPublication(owner, { ...scope, recordId: draft.id, publishedUrl: snapshot.url, publishedAt: new Date().toISOString(), note: "SYNTHETIC TEST PUBLICATION; no external write" });
		await assert.rejects(verifyPublication(owner, { ...scope, recordId: published.id, snapshotId: observed.id }), /发布之后/);
		const corrected = structuredClone(snapshot); corrected.id = crypto.randomUUID(); corrected.collectedAt = new Date().toISOString(); corrected.fields.priceRange.value = "$$";
		corrected.evidence[0].text = "SYNTHETIC corrected price $$"; corrected.evidence[0].sha256 = sha256(corrected.evidence[0].text);
		const updated = await importManualSnapshot(owner, { ...scope, snapshot: corrected });
		const verification = await verifyPublication(owner, { ...scope, recordId: published.id, snapshotId: updated.id });
		assert.equal(verification.payload.status, "verified"); assert.equal(verification.payload.aiRetest, "pending");
	});
});
