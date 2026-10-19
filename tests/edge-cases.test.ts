import { it, expect, beforeEach, afterEach } from "vitest";
import { fixture, unwrap, merchantInput, known } from "./helpers";
let ctx: ReturnType<typeof fixture>;
beforeEach(() => {
  ctx = fixture();
});
afterEach(() => ctx.cleanup());
it("assigns reusable cuisine ids and preserves versions on a label roundtrip", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  const second = unwrap(
    await ctx.service.createMerchant({
      ...merchantInput,
      display_name: "Sample second location",
    }),
  );
  expect(p.groups.offering.primary_cuisines.value).toEqual(
    second.groups.offering.primary_cuisines.value,
  );
  expect(p.groups.offering.primary_cuisines.options?.[0].label).toBe(
    "New American",
  );
  p = unwrap(
    await ctx.service.verifyFacts({
      merchant_id: p.merchant_id,
      expected_profile_version: 1,
      targets: ["offering.primary_cuisines"],
      state: "verified",
      source_note: "Sample verification",
      verified_at: "2026-10-19T09:00:00+08:00",
    }),
  );
  const version = p.profile_version;
  p = unwrap(
    await ctx.service.saveGroup({
      merchant_id: p.merchant_id,
      expected_profile_version: version,
      group_key: "offering",
      fields: { primary_cuisines: known(["New American"]) },
    }),
  );
  expect(p.profile_version).toBe(version);
  expect(p.groups.offering.primary_cuisines.verification_state).toBe(
    "verified",
  );
});
it("rolls back a newly created brand when minimum merchant validation fails", async () => {
  const bad = await ctx.service.createMerchant({
    ...merchantInput,
    display_name: "",
    new_brand: { name: "Brand that must roll back" },
  });
  expect(bad.ok).toBe(false);
  expect(unwrap(await ctx.service.listBrands())).toHaveLength(0);
  expect(
    unwrap(await ctx.service.listMerchants({ page: 1, page_size: 20 })).total,
  ).toBe(0);
});
it("detects same-address duplicate candidates without blocking creation", async () => {
  const first = unwrap(await ctx.service.createMerchant(merchantInput));
  const matches = unwrap(
    await ctx.service.findMerchantDuplicates({
      name: "Completely different sample name",
      address: merchantInput.address,
    }),
  );
  expect(matches.items[0].merchant_id).toBe(first.merchant_id);
  expect(
    (
      await ctx.service.createMerchant({
        ...merchantInput,
        display_name: "Completely different sample name",
      })
    ).ok,
  ).toBe(true);
});
it("rejects float money and compares large decimal ranges without rounding", async () => {
  const p = unwrap(await ctx.service.createMerchant(merchantInput));
  const invalid = await ctx.service.saveGroup({
    merchant_id: p.merchant_id,
    expected_profile_version: 1,
    group_key: "commercial",
    fields: { average_spend: known(0.1 + 0.2), currency: known("USD") },
  });
  expect(invalid.ok).toBe(false);
  const reversed = await ctx.service.saveGroup({
    merchant_id: p.merchant_id,
    expected_profile_version: 1,
    group_key: "commercial",
    fields: {
      average_spend: known("100000000000000000000.02"),
      average_spend_max: known("100000000000000000000.01"),
      currency: known("USD"),
    },
  });
  expect(reversed.ok).toBe(false);
});
it("invalidates scenario conclusions referencing a changed room collection", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  p = unwrap(
    await ctx.service.saveRecord({
      merchant_id: p.merchant_id,
      expected_profile_version: 1,
      record_type: "scene",
      values: {
        name: "Group dining for ten",
        judgment: "applicable",
        basis_keys: ["space.private_rooms"],
        basis_note: "Manual confirmation",
        confirmed_at: "2026-10-19T09:00:00+08:00",
      },
    }),
  );
  p = unwrap(
    await ctx.service.saveRecord({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      record_type: "room",
      values: { name: "Sample ten-seat room", capacity: 10 },
    }),
  );
  expect(p.records.scene[0].needs_review).toBe(true);
});
it("does not return expired contact collections as currently verified facts", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  p = unwrap(
    await ctx.service.saveRecord({
      merchant_id: p.merchant_id,
      expected_profile_version: 1,
      record_type: "contact",
      values: { type: "phone", value: "+1-512-555-0100" },
      metadata: { valid_to: "2026-10-18" },
    }),
  );
  p = unwrap(
    await ctx.service.verifyFacts({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      targets: ["contact:" + p.records.contact[0].record_id],
      state: "verified",
      source_note: "Sample verification",
      verified_at: "2026-10-18T09:00:00+08:00",
    }),
  );
  const result = unwrap(
    await ctx.service.getMerchantFacts({
      merchant_id: p.merchant_id,
      profile_version: p.profile_version,
      field_keys: ["identity.public_contacts"],
      verified_only: true,
      as_of_date: "2026-10-19",
    }),
  );
  expect(result.facts).toHaveLength(0);
  expect(result.excluded_fields).toHaveLength(1);
});
it("hydrates additive unknown fields without changing stored historical snapshots", async () => {
  const p = unwrap(await ctx.service.createMerchant(merchantInput)),
    raw = structuredClone(p);
  delete (raw.groups.location as Record<string, unknown>).country;
  ctx.connection.native
    .prepare("UPDATE profile_versions SET body=? WHERE key=?")
    .run(JSON.stringify(raw), p.merchant_id + ":1");
  const old = unwrap(
    await ctx.service.getMerchantProfile({
      merchant_id: p.merchant_id,
      profile_version: 1,
      projection: "workspace",
    }),
  );
  expect(old.groups.location.country.value_state).toBe("unknown");
  const stored = ctx.connection.native
    .prepare("SELECT body FROM profile_versions WHERE key=?")
    .get(p.merchant_id + ":1") as { body: string };
  expect(JSON.parse(stored.body).groups.location.country).toBeUndefined();
});
