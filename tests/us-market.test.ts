import { afterEach, beforeEach, expect, it } from "vitest";
import {
  FACT_FIELDS,
  createMerchantService,
  type Result,
} from "../src/modules/merchant/public";
import { createBackupManager } from "../src/infrastructure/storage/backup";
import { fixture, merchantInput, known, unwrap } from "./helpers";

let ctx: ReturnType<typeof fixture>;
beforeEach(() => {
  ctx = fixture();
});
afterEach(() => ctx.cleanup());
function invalid(result: Result<unknown>) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).not.toMatch(/[\u3400-\u9fff]/);
  }
}
it("exposes an English U.S. catalog and stores explicit U.S. defaults without verification", async () => {
  const catalog = unwrap(await ctx.service.getMerchantFieldCatalog());
  expect(catalog.market).toEqual({
    country: "US",
    language: "en-US",
    currency: "USD",
    coordinate_system: "WGS84",
  });
  expect(JSON.stringify(catalog)).not.toMatch(/[\u3400-\u9fff]/);
  const p = unwrap(
    await ctx.service.createMerchant({
      ...merchantInput,
      display_name: "Sample Café Juniper",
    }),
  );
  expect(p.groups.location.country.value).toBe("US");
  expect(p.groups.location.state.value).toBe("TX");
  expect(p.groups.location.postal_code.value).toBe("78701");
  expect(p.groups.commercial.currency.value).toBe("USD");
  expect(p.groups.operations.timezone.value).toBe("America/Chicago");
  expect(p.groups.commercial.currency.verification_state).toBe("unverified");
  expect(p.groups.commercial.sales_tax_included.value_state).toBe("unknown");
  expect(FACT_FIELDS.space.find((f) => f.key === "area_sq_ft")?.unit).toBe(
    "sq ft",
  );
  expect(
    FACT_FIELDS.service.find((f) => f.key === "delivery_distance_miles")?.unit,
  ).toBe("mi");
});
it("requires a U.S. time zone and rolls back invalid creation and nested brands", async () => {
  for (const timezone of [undefined, "Asia/Shanghai", "America/Invalid", ""]) {
    invalid(
      await ctx.service.createMerchant({
        ...merchantInput,
        timezone: timezone as string,
        new_brand: { name: "Must roll back" },
      }),
    );
  }
  expect(unwrap(await ctx.service.listBrands())).toHaveLength(0);
  expect(
    unwrap(await ctx.service.listMerchants({ page: 1, page_size: 10 })).total,
  ).toBe(0);
});
it("preserves ZIP leading zeros and validates state and ZIP syntax without guessing missing values", async () => {
  invalid(
    await ctx.service.createMerchant({ ...merchantInput, state: "Texas" }),
  );
  invalid(
    await ctx.service.createMerchant({ ...merchantInput, postal_code: "1234" }),
  );
  const p = unwrap(
    await ctx.service.createMerchant({
      ...merchantInput,
      city: "Boston",
      region: "Boston, MA",
      state: "MA",
      postal_code: "02108-1234",
      timezone: "America/New_York",
    }),
  );
  expect(p.groups.location.postal_code.value).toBe("02108-1234");
  const partial = unwrap(
    await ctx.service.createMerchant({
      ...merchantInput,
      city: undefined,
      state: undefined,
      postal_code: undefined,
    }),
  );
  expect(partial.groups.location.postal_code.value_state).toBe("unknown");
});
it("rejects new non-English standard text transactionally while preserving original source names", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  invalid(
    await ctx.service.saveGroup({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      group_key: "identity",
      fields: { description: known("中文说明") },
    }),
  );
  const priorOptions = unwrap(
    await ctx.service.getMerchantFieldCatalog(),
  ).cuisine_options;
  invalid(
    await ctx.service.saveGroup({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      group_key: "offering",
      fields: { primary_cuisines: known(["中餐"]) },
    }),
  );
  expect(
    unwrap(await ctx.service.getMerchantFieldCatalog()).cuisine_options,
  ).toEqual(priorOptions);
  p = unwrap(
    await ctx.service.saveRecord({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      record_type: "alias",
      values: { name: "原名", language: "zh" },
    }),
  );
  expect(p.records.alias[0].values.name).toBe("原名");
  p = unwrap(
    await ctx.service.saveRecord({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      record_type: "channel",
      values: {
        name: "Sample listing",
        platform: "Google Business Profile",
        url: "https://example.com/restaurant",
      },
    }),
  );
  p = unwrap(
    await ctx.service.recordChannelSnapshot({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      values: {
        channel_id: p.records.channel[0].record_id,
        collected_at: "2026-10-19T09:00:00-05:00",
        url: "https://example.com/restaurant",
        raw_name: "渠道原名",
      },
    }),
  );
  expect(p.records.snapshot[0].values.raw_name).toBe("渠道原名");
});
it("validates U.S. phone entry and preserves the extension separately", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  invalid(
    await ctx.service.saveRecord({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      record_type: "contact",
      values: { type: "phone", value: "+86 21 12345678" },
    }),
  );
  p = unwrap(
    await ctx.service.saveRecord({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      record_type: "contact",
      values: {
        type: "phone",
        value: "+1 (512) 555-0100",
        country_prefix: "+1",
        extension: "123",
      },
    }),
  );
  expect(p.records.contact[0].values.extension).toBe("123");
});
it("keeps USD decimal amounts and rejects changing a U.S. price to CNY without conversion", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  const args = () => ({
    merchant_id: p.merchant_id,
    expected_profile_version: p.profile_version,
    group_key: "commercial" as const,
  });
  p = unwrap(
    await ctx.service.saveGroup({
      ...args(),
      fields: {
        average_spend: known("28.50"),
        sales_tax_included: known(false),
        gratuity_policy: known("Optional tips excluded."),
      },
    }),
  );
  expect(p.groups.commercial.average_spend.value).toBe("28.50");
  expect(p.groups.commercial.average_spend.currency).toBe("USD");
  invalid(
    await ctx.service.saveGroup({
      ...args(),
      fields: { currency: known("CNY") },
    }),
  );
  expect(
    unwrap(
      await ctx.service.getMerchantProfile({
        merchant_id: p.merchant_id,
        projection: "workspace",
      }),
    ).groups.commercial.average_spend.value,
  ).toBe("28.50");
});
it("uses the restaurant's local date across daylight-saving transitions", async () => {
  const service = (iso: string) =>
    createMerchantService({
      repository: ctx.repository,
      assets: ctx.assets,
      clock: () => new Date(iso),
    });
  const s = service("2026-03-08T05:30:00Z");
  const chicago = unwrap(await s.createMerchant(merchantInput));
  expect(
    unwrap(
      await s.getMerchantProfile({
        merchant_id: chicago.merchant_id,
        projection: "workspace",
      }),
    ).as_of_date,
  ).toBe("2026-03-07");
  const later = service("2026-03-09T05:30:00Z");
  expect(
    unwrap(
      await later.getMerchantProfile({
        merchant_id: chicago.merchant_id,
        projection: "workspace",
      }),
    ).as_of_date,
  ).toBe("2026-03-09");
  expect(
    unwrap(
      await later.getMerchantProfile({
        merchant_id: chicago.merchant_id,
        projection: "workspace",
        as_of_date: "2026-03-07",
      }),
    ).as_of_date,
  ).toBe("2026-03-07");
});
it("reads, edits and backs up legacy profiles without converting facts, units or old snapshots", async () => {
  const legacy = unwrap(await ctx.service.createMerchant(merchantInput));
  legacy.profile_version = 2;
  Object.assign(legacy.groups.identity.display_name, known("原有餐馆"));
  Object.assign(legacy.groups.location.country, known("中国"));
  Object.assign(legacy.groups.operations.timezone, known("Asia/Shanghai"));
  Object.assign(legacy.groups.commercial.currency, known("CNY"));
  Object.assign(legacy.groups.space.area, known(100), { unit: "sq m" });
  Object.assign(legacy.groups.service.delivery_distance, known(5), {
    unit: "km",
  });
  delete legacy.groups.space.area_sq_ft;
  delete legacy.groups.service.delivery_distance_miles;
  ctx.repository.save(legacy, {
    version: 2,
    at: legacy.updated_at,
    type: "legacy_fixture",
    changes: [],
  });
  const body = () =>
    ctx.connection.native
      .prepare(
        "select body from profile_versions where merchant_id = ? and version = 2",
      )
      .get(legacy.merchant_id);
  const originalBody = body();
  const p = unwrap(
    await ctx.service.getMerchantProfile({
      merchant_id: legacy.merchant_id,
      projection: "workspace",
    }),
  );
  expect(p.groups.space.area_sq_ft.value_state).toBe("unknown");
  expect(p.readiness?.english_review_fields).toContain("identity.display_name");
  const next = unwrap(
    await ctx.service.saveGroup({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      group_key: "identity",
      fields: {
        description: known("English description added after upgrade."),
      },
    }),
  );
  expect(next.groups.identity.display_name.value).toBe("原有餐馆");
  expect(next.groups.space.area.value).toBe(100);
  expect(next.groups.service.delivery_distance.value).toBe(5);
  expect(next.groups.operations.timezone.value).toBe("Asia/Shanghai");
  expect(body()).toEqual(originalBody);
  const manager = createBackupManager(
    ctx.root,
    ctx.backups,
    () => ctx.connection,
  );
  const backup = await manager.create();
  const prepared = await manager.prepareNamed(backup.name);
  expect(prepared.merchants).toBe(1);
});
