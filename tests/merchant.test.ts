import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unlinkSync } from "node:fs";
import path from "node:path";
import {
  createMerchantService,
  FACT_FIELDS,
  GROUPS,
  RECORD_NAMES,
  recordDefinition,
  type Profile,
  type RecordType,
  type Value,
  type Result,
} from "../src/modules/merchant/public";
import { fixture, unwrap, merchantInput, known, hours } from "./helpers";
let ctx: ReturnType<typeof fixture>;
let p: Profile;
beforeEach(async () => {
  ctx = fixture();
  p = unwrap(await ctx.service.createMerchant(merchantInput));
});
afterEach(() => ctx.cleanup());
const args = () => ({
  merchant_id: p.merchant_id,
  expected_profile_version: p.profile_version,
});
async function save(
  group_key: keyof typeof GROUPS,
  fields: Record<string, unknown>,
) {
  p = unwrap(
    await ctx.service.saveGroup({
      ...args(),
      group_key,
      fields: fields as never,
    }),
  );
  return p;
}
async function record(record_type: RecordType, values: Record<string, Value>) {
  p = unwrap(await ctx.service.saveRecord({ ...args(), record_type, values }));
  return p.records[record_type].at(-1)!;
}
function errorCode<T>(r: Result<T>) {
  expect(r.ok).toBe(false);
  return !r.ok ? r.error.code : "unexpected success";
}
describe("F1 business and module integration", () => {
  it("persists minimal records, defaults unknown/pending, survives reopen", async () => {
    expect(p.groups.operations.status.value_state).toBe("unknown");
    expect(p.groups.relationship.internal_note.publication_state).toBe(
      "internal",
    );
    expect(p.groups.identity.display_name.publication_state).toBe("pending");
    expect(p.groups.operations.timezone.value).toBe("America/Chicago");
    const second = createMerchantService({
      repository: ctx.repository,
      assets: ctx.assets,
    });
    expect(
      unwrap(
        await second.getMerchantProfile({
          merchant_id: p.merchant_id,
          projection: "workspace",
        }),
      ).merchant_id,
    ).toBe(p.merchant_id);
  });
  it("allows real same-name branches and isolates ids, references and pagination", async () => {
    const second = unwrap(await ctx.service.createMerchant(merchantInput));
    expect(second.merchant_id).not.toBe(p.merchant_id);
    const room = await record("room", {
      name: "Sample private dining room",
      capacity: 10,
    });
    const cross = await ctx.service.saveRecord({
      merchant_id: second.merchant_id,
      expected_profile_version: 1,
      record_type: "price",
      values: {
        object_type: "room",
        object_id: room.record_id,
        amount: "100.00",
        currency: "USD",
        unit: "room",
      },
    });
    expect(errorCode(cross)).toBe("OWNERSHIP_MISMATCH");
    expect(
      unwrap(await ctx.service.listMerchants({ page: 1, page_size: 1 })).total,
    ).toBe(2);
    expect(
      errorCode(await ctx.service.listMerchants({ page: 0, page_size: 200 })),
    ).toBe("INVALID_ARGUMENT");
  });
  it("preserves unknown/not-applicable/known false/zero and explicit known empty collection", async () => {
    await save("space", {
      outdoor: known(false),
      parking_capacity: known(0),
      area: {
        value_state: "not_applicable",
        value: null,
        not_applicable_reason: "Not applicable",
      },
    });
    expect(p.groups.space.outdoor.value).toBe(false);
    expect(p.groups.space.parking_capacity.value).toBe(0);
    expect(p.groups.space.area.value_state).toBe("not_applicable");
    expect(p.collection_states.alias.value_state).toBe("unknown");
    p = unwrap(
      await ctx.service.setCollectionState({
        ...args(),
        record_type: "alias",
        state: { value_state: "known", not_applicable_reason: "" },
      }),
    );
    expect(
      unwrap(await ctx.service.getMerchantNames({ merchant_id: p.merchant_id }))
        .collection_state.value_state,
    ).toBe("known");
    expect(
      errorCode(
        await ctx.service.saveGroup({
          ...args(),
          group_key: "space",
          fields: { wifi: { value_state: "not_applicable", value: null } },
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
  });
  it("verifies only selected facts, invalidates only changed fact, keeps old versions", async () => {
    p = unwrap(
      await ctx.service.verifyFacts({
        ...args(),
        targets: ["identity.display_name", "location.address"],
        state: "verified",
        source_note: "Sample phone confirmation",
        verified_at: "2026-10-19T09:00:00+08:00",
      }),
    );
    const version = p.profile_version;
    await save("identity", {
      display_name: known("Sample renamed restaurant"),
    });
    expect(p.groups.identity.display_name.verification_state).toBe(
      "unverified",
    );
    expect(p.groups.location.address.verification_state).toBe("verified");
    const old = unwrap(
      await ctx.service.getMerchantProfile({
        merchant_id: p.merchant_id,
        profile_version: version,
        projection: "workspace",
      }),
    );
    expect(old.groups.identity.display_name.value).toBe(
      merchantInput.display_name,
    );
    expect(old.groups.identity.display_name.verification_state).toBe(
      "verified",
    );
    expect(
      errorCode(
        await ctx.service.verifyFacts({
          ...args(),
          targets: ["space.wifi"],
          state: "verified",
          source_note: "",
          verified_at: null,
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
  });
  it("rejects stale saves, does not create empty versions", async () => {
    const version = p.profile_version;
    await save("identity", { display_name: known(merchantInput.display_name) });
    expect(p.profile_version).toBe(version);
    await save("identity", { description: known("Sample notes only") });
    expect(
      errorCode(
        await ctx.service.saveGroup({
          merchant_id: p.merchant_id,
          expected_profile_version: version,
          group_key: "identity",
          fields: { description: known("Outdated page overwrite") },
        }),
      ),
    ).toBe("VERSION_CONFLICT");
  });
  it("freezes shared brand versions for both branches atomically", async () => {
    const brand = unwrap(
      await ctx.service.createBrand({
        name: "Sample Juniper",
        description: "Previous description",
      }),
    );
    const a = unwrap(
        await ctx.service.createMerchant({
          ...merchantInput,
          brand_id: brand.brand_id,
        }),
      ),
      b = unwrap(
        await ctx.service.createMerchant({
          ...merchantInput,
          display_name: "Sample Juniper second location",
          brand_id: brand.brand_id,
        }),
      );
    unwrap(
      await ctx.service.updateBrand({
        brand_id: brand.brand_id,
        expected_brand_version: 1,
        name: brand.name,
        aliases: [],
        founded_year: "",
        description: "Updated description",
        publication_state: "pending",
      }),
    );
    for (const store of [a, b]) {
      expect(
        unwrap(
          await ctx.service.getMerchantProfile({
            merchant_id: store.merchant_id,
            projection: "workspace",
          }),
        ).brand?.description,
      ).toBe("Updated description");
      expect(
        unwrap(
          await ctx.service.getMerchantProfile({
            merchant_id: store.merchant_id,
            profile_version: 1,
            projection: "workspace",
          }),
        ).brand?.description,
      ).toBe("Previous description");
    }
  });
  it("validates overnight last-order and adjacent-day overlaps", async () => {
    await save("operations", {
      status: known("open"),
      weekly_hours: known(hours()),
    });
    expect(p.groups.operations.weekly_hours.value).toHaveLength(7);
    const bad = hours();
    bad[0].periods[0] = {
      start: "17:00",
      end: "02:00",
      end_day_offset: 1,
      last_order: "03:00",
      last_order_day_offset: 1,
    } as never;
    expect(
      errorCode(
        await ctx.service.saveGroup({
          ...args(),
          group_key: "operations",
          fields: { weekly_hours: known(bad) as never },
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
    const overlap = hours();
    overlap[1].periods[0] = {
      start: "01:00",
      end: "12:00",
      end_day_offset: 0 as 1,
    };
    expect(
      errorCode(
        await ctx.service.saveGroup({
          ...args(),
          group_key: "operations",
          fields: { weekly_hours: known(overlap) as never },
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
  });
  it("rejects overlapping date exceptions and preserves stopped schedules", async () => {
    await save("operations", { weekly_hours: known(hours()) });
    await record("date_exception", {
      start_date: "2026-10-01",
      end_date: "2026-10-07",
      mode: "closed",
    });
    expect(
      errorCode(
        await ctx.service.saveRecord({
          ...args(),
          record_type: "date_exception",
          values: {
            start_date: "2026-10-07",
            end_date: "2026-10-08",
            mode: "closed",
          },
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
    await save("operations", { status: known("permanently_closed") });
    expect(p.groups.operations.weekly_hours.value).toHaveLength(7);
  });
  it("keeps pricing object/currency/unit and rejects conflicting prices", async () => {
    const room = await record("room", {
      name: "Ten-seat room",
      capacity: 10,
      recommended: 8,
    });
    await record("price", {
      object_type: "room",
      object_id: room.record_id,
      amount: "128.00",
      currency: "USD",
      unit: "room / event",
      valid_from: "2026-10-01",
      valid_to: "2026-10-31",
    });
    expect(p.records.price[0].values.amount).toBe("128.00");
    expect(
      errorCode(
        await ctx.service.saveRecord({
          ...args(),
          record_type: "price",
          values: {
            object_type: "room",
            object_id: room.record_id,
            amount: "130",
            currency: "USD",
            unit: "room / event",
          },
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
    expect(
      errorCode(
        await ctx.service.saveGroup({
          ...args(),
          group_key: "commercial",
          fields: { average_spend: known(100) },
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
    await save("commercial", {
      average_spend: known("128.00"),
      currency: known("USD"),
    });
    expect(p.groups.commercial.average_spend.value).toBe("128.00");
  });
  it("keeps immutable channel snapshots and correction relationships", async () => {
    const channel = await record("channel", {
      platform: "Sample Google Business Profile",
      name: "Fictional restaurant",
      url: "https://example.com/store",
    });
    const first = await record("snapshot", {
      channel_id: channel.record_id,
      collected_at: "2026-10-19T08:00:00+08:00",
      url: "https://example.com/store",
      raw_name: "Original listing content",
      rating: 4.5,
      rating_scale: 5,
      review_count: 10,
    });
    const fixed = p.profile_version;
    await record("snapshot", {
      channel_id: channel.record_id,
      collected_at: "2026-10-19T09:00:00+08:00",
      url: "https://example.com/store",
      raw_name: "Corrected listing content",
      corrects_id: first.record_id,
    });
    expect(
      errorCode(
        await ctx.service.saveRecord({
          ...args(),
          record_type: "snapshot",
          record_id: first.record_id,
          values: first.values,
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
    expect(
      unwrap(
        await ctx.service.listChannelSnapshots({
          merchant_id: p.merchant_id,
          profile_version: fixed,
          page: 1,
          page_size: 20,
        }),
      ).items,
    ).toHaveLength(1);
    expect(p.groups.identity.display_name.value).toBe(
      merchantInput.display_name,
    );
  });
  it("flags scenario dependencies for review after facts change", async () => {
    await save("space", { seats: known(100) });
    await record("scene", {
      name: "Business dinner",
      judgment: "applicable",
      basis_keys: ["space.seats"],
      basis_note: "Sample on-site verification",
      confirmed_at: "2026-10-19T09:00:00+08:00",
    });
    await save("space", { seats: known(80) });
    expect(p.records.scene[0].needs_review).toBe(true);
  });
  it("excludes internal metadata, pending values, evidence and contacts from public projection", async () => {
    await save("identity", {
      display_name: {
        ...known(merchantInput.display_name),
        publication_state: "public",
        source_note: "Confidential source",
        note: "Confidential notes",
      },
    });
    await save("relationship", {
      internal_note: known("Confidential agreement"),
    });
    await record("person", {
      name: "Confidential contact",
      contact: "Confidential phone",
    });
    const out = unwrap(
      await ctx.service.getMerchantProfile({
        merchant_id: p.merchant_id,
        projection: "publishable",
      }),
    );
    const text = JSON.stringify(out);
    for (const secret of [
      "Confidential source",
      "Confidential notes",
      "Confidential agreement",
      "Confidential contact",
      "Confidential phone",
    ])
      expect(text).not.toContain(secret);
    expect(out.groups.identity.display_name.value).toBe(
      merchantInput.display_name,
    );
    expect(out.groups.location.address).toBeUndefined();
    expect(
      unwrap(
        await ctx.service.getMerchantProfile({
          merchant_id: p.merchant_id,
          projection: "workspace",
        }),
      ).records.person,
    ).toHaveLength(1);
    expect(
      errorCode(
        await ctx.service.setPublication({
          ...args(),
          targets: ["relationship.internal_note"],
          publication_state: "public",
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
  });
  it("filters expired facts on fixed as-of dates independently from version", async () => {
    await save("identity", {
      description: {
        ...known("Time-limited description"),
        valid_to: "2026-10-18",
        publication_state: "public",
      },
    });
    const args = {
      merchant_id: p.merchant_id,
      profile_version: p.profile_version,
      projection: "publishable" as const,
    };
    expect(
      unwrap(
        await ctx.service.getMerchantProfile({
          ...args,
          as_of_date: "2026-10-18",
        }),
      ).groups.identity.description.value,
    ).toBe("Time-limited description");
    expect(
      unwrap(
        await ctx.service.getMerchantProfile({
          ...args,
          as_of_date: "2026-10-19",
        }),
      ).groups.identity.description,
    ).toBeUndefined();
  });
  it("keeps historic assets readable after disabling and rejects later version access", async () => {
    p = unwrap(
      await ctx.service.uploadMerchantAsset({
        ...args(),
        name: "sample-menu.pdf",
        category: "Menus",
        mime: "application/pdf",
        bytes: Buffer.from("sample-pdf"),
      }),
    );
    const asset = p.records.asset[0],
      version = p.profile_version;
    const earlier = await ctx.service.getMerchantAsset({
      merchant_id: p.merchant_id,
      profile_version: 1,
      asset_id: asset.record_id,
      projection: "workspace",
    });
    expect(errorCode(earlier)).toBe("RECORD_NOT_FOUND");
    p = unwrap(
      await ctx.service.saveRecord({
        ...args(),
        record_type: "asset",
        record_id: asset.record_id,
        values: { ...asset.values, usage: "disabled" },
      }),
    );
    const result = unwrap(
      await ctx.service.readMerchantAsset({
        merchant_id: p.merchant_id,
        profile_version: version,
        asset_id: asset.record_id,
        projection: "workspace",
      }),
    );
    expect(Buffer.from(result.bytes).toString()).toBe("sample-pdf");
    unlinkSync(path.join(ctx.root, "assets", asset.file!.id));
    expect(
      errorCode(
        await ctx.service.getMerchantAsset({
          merchant_id: p.merchant_id,
          profile_version: version,
          asset_id: asset.record_id,
          projection: "workspace",
        }),
      ),
    ).toBe("ASSET_UNAVAILABLE");
  });
  it("exports only selected public assets, omits unselected references", async () => {
    p = unwrap(
      await ctx.service.uploadMerchantAsset({
        ...args(),
        name: "public-menu.pdf",
        category: "Menus",
        mime: "application/pdf",
        bytes: Buffer.from("public-menu"),
        publication_state: "public",
      }),
    );
    const rid = p.records.asset[0].record_id;
    const out = unwrap(
      await ctx.service.exportMerchant({
        merchant_id: p.merchant_id,
        asset_ids: [],
      } as never),
    );
    expect(out.json.records.asset).toHaveLength(0);
    const selected = unwrap(
      await ctx.service.exportMerchant({
        merchant_id: p.merchant_id,
        asset_ids: [rid],
      } as never),
    );
    expect(selected.json.records.asset).toHaveLength(1);
  });
  it("archives and restores without altering operation state or ids", async () => {
    await save("operations", { status: known("open") });
    p = unwrap(
      await ctx.service.archiveMerchant({ ...args(), archived: true }),
    );
    expect(
      unwrap(await ctx.service.listMerchants({ page: 1, page_size: 20 })).total,
    ).toBe(0);
    expect(p.groups.operations.status.value).toBe("open");
    p = unwrap(
      await ctx.service.archiveMerchant({ ...args(), archived: false }),
    );
    expect(
      unwrap(await ctx.service.listMerchants({ page: 1, page_size: 20 }))
        .items[0].merchant_id,
    ).toBe(p.merchant_id);
  });
  it("rolls back current rows and snapshots if persistence fails midway", async () => {
    const fail = createMerchantService({
      repository: {
        ...ctx.repository,
        save(profile, change) {
          ctx.repository.save(profile, change);
          throw new Error("simulated disk error");
        },
      },
      assets: ctx.assets,
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      errorCode(
        await fail.saveGroup({
          ...args(),
          group_key: "identity",
          fields: { description: known("should roll back") },
        }),
      ),
    ).toBe("STORAGE_ERROR");
    logged.mockRestore();
    expect(ctx.repository.read(p.merchant_id)?.profile_version).toBe(1);
    expect(ctx.repository.history(p.merchant_id)).toHaveLength(1);
  });
  it("returns explicit missing and invalid contract errors", async () => {
    expect(
      errorCode(
        await ctx.service.getMerchantProfile({
          merchant_id: "missing",
          projection: "workspace",
        }),
      ),
    ).toBe("MERCHANT_NOT_FOUND");
    expect(
      errorCode(
        await ctx.service.getMerchantProfile({
          merchant_id: p.merchant_id,
          profile_version: 99,
          projection: "workspace",
        }),
      ),
    ).toBe("PROFILE_VERSION_NOT_FOUND");
    expect(
      errorCode(
        await ctx.service.getMerchantProfile({
          merchant_id: p.merchant_id,
          projection: undefined as never,
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
    expect(
      errorCode(
        await ctx.service.getMerchantFacts({
          merchant_id: p.merchant_id,
          verified_only: false,
          field_keys: ["invented"],
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
  });
  it("all eleven groups and record catalogs are accessible only through public entry", async () => {
    const catalog = unwrap(await ctx.service.getMerchantFieldCatalog());
    expect(Object.keys(catalog.groups)).toHaveLength(11);
    for (const group of Object.keys(GROUPS))
      expect(
        unwrap(
          await ctx.service.getMerchantProfile({
            merchant_id: p.merchant_id,
            projection: "workspace",
          }),
        ).groups,
      ).toHaveProperty(group);
    for (const type of RECORD_NAMES) {
      const out = unwrap(
        await ctx.service.listMerchantRecords({
          merchant_id: p.merchant_id,
          profile_version: 1,
          record_type: type,
          group_key: recordDefinition(type).group,
          projection: "workspace",
          page: 1,
          page_size: 20,
        }),
      );
      expect(out.collection_state.value_state).toBe("unknown");
    }
    expect(
      errorCode(
        await ctx.service.listMerchantRecords({
          merchant_id: p.merchant_id,
          profile_version: 1,
          record_type: "room",
          group_key: "identity",
          projection: "workspace",
          page: 1,
          page_size: 20,
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
  });
});
