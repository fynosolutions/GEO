import { it, expect } from "vitest";
import {
  RECORD_NAMES,
  recordDefinition,
  type GroupKey,
} from "../src/modules/merchant/public";
import { fixture, unwrap, known } from "./helpers";
import { seedSamples } from "./sample-data";
import { readForDetection } from "./merchant-client";
it("three fictitious stores cover all record types and full public-entry integration", async () => {
  const ctx = fixture();
  try {
    const sample = await seedSamples(ctx.service);
    const p = sample.primary;
    for (const type of RECORD_NAMES) {
      expect(p.records[type].length, type).toBeGreaterThan(0);
      const page = unwrap(
        await ctx.service.listMerchantRecords({
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          group_key: recordDefinition(type).group,
          record_type: type,
          projection: "workspace",
          page: 1,
          page_size: 100,
        }),
      );
      expect(page.items.length, type).toBe(p.records[type].length);
    }
    const data = unwrap(await readForDetection(ctx.service, p.merchant_id));
    expect(data.channels.items).toHaveLength(2);
    expect(JSON.stringify(data.publishable)).not.toContain(
      "INTERNAL_SAMPLE_DO_NOT_EXPORT",
    );
    expect(JSON.stringify(data.publishable)).not.toContain(
      "NOT-A-REAL-CONTACT",
    );
    expect(data.profile_version).toBe(p.profile_version);
    const changed = unwrap(
      await ctx.service.saveGroup({
        merchant_id: p.merchant_id,
        expected_profile_version: p.profile_version,
        group_key: "space",
        fields: { seats: known(62) },
      }),
    );
    expect(changed.records.scene[0].needs_review).toBe(true);
    expect(
      unwrap(
        await ctx.service.getMerchantProfile({
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          projection: "workspace",
        }),
      ).groups.space.seats.value,
    ).toBe(60);
  } finally {
    ctx.cleanup();
  }
});
