import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { createBackupManager } from "../src/infrastructure/storage/backup";
import {
  validateMerchantProfile,
  type MerchantRecord,
} from "../src/modules/merchant/public";
import { fixture, unwrap, merchantInput } from "./helpers";
const ctx = fixture(),
  started = performance.now();
try {
  for (let store = 0; store < 300; store++) {
    const p = unwrap(
      await ctx.service.createMerchant({
        ...merchantInput,
        display_name: `Capacity test restaurant${store}`,
      }),
    );
    const metadata = {
      ...p.groups.identity.display_name,
      value: true,
      field_key: "",
      verification_state: "unverified" as const,
    };
    p.records.room = Array.from({ length: 100 }, (_, i): MerchantRecord => {
      const rid = crypto.randomUUID();
      return {
        record_id: rid,
        merchant_id: p.merchant_id,
        record_type: "room",
        values: { name: `Sample private dining room${i}`, capacity: 10 },
        metadata: { ...metadata, field_key: "room:" + rid },
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });
    p.records.asset = Array.from({ length: 34 }, (_, i): MerchantRecord => {
      const rid = crypto.randomUUID(),
        file = ctx.assets.put(
          Buffer.from(
            `Capacity fixture: ${store}/${i}. Small synthetic file; not a full-size photo.`,
          ),
          { name: `sample-${i}.txt`, mime: "text/plain" },
        );
      return {
        record_id: rid,
        merchant_id: p.merchant_id,
        record_type: "asset",
        values: {
          name: `Sample attachment${i}`,
          category: "Capacity test",
          usage: "active",
        },
        metadata: { ...metadata, field_key: "asset:" + rid },
        created_at: p.created_at,
        updated_at: p.updated_at,
        file,
      };
    });
    p.collection_states.room = {
      value_state: "known",
      not_applicable_reason: "",
    };
    p.collection_states.asset = {
      value_state: "known",
      not_applicable_reason: "",
    };
    p.profile_version = 2;
    validateMerchantProfile(p);
    ctx.repository.transaction(() =>
      ctx.repository.save(p, {
        version: 2,
        at: p.updated_at,
        type: "capacity_fixture",
        changes: [],
      }),
    );
    if (store % 100 === 99) console.log(`Prepared ${store + 1}/300 stores`);
  }
  const seeded = performance.now(),
    listStart = performance.now(),
    page = unwrap(await ctx.service.listMerchants({ page: 1, page_size: 20 })),
    listMs = performance.now() - listStart;
  const detailStart = performance.now();
  unwrap(
    await ctx.service.getMerchantProfile({
      merchant_id: page.items[0].merchant_id,
      projection: "workspace",
    }),
  );
  const detailMs = performance.now() - detailStart;
  const manager = createBackupManager(
      ctx.root,
      ctx.backups,
      () => ctx.connection,
    ),
    backupStart = performance.now(),
    saved = await manager.create(),
    backupMs = performance.now() - backupStart,
    prepareStart = performance.now();
  await manager.prepareNamed(saved.name);
  const prepareMs = performance.now() - prepareStart;
  const report = {
    at: new Date().toISOString(),
    stores: 300,
    room_records: 30000,
    attachments: 10200,
    note: "Synthetic small text files; does not measure full-size images/PDF throughput or years of edit history. Fixture batch persistence is not manual-entry timing.",
    seed_ms: Math.round(seeded - started),
    list_ms: Math.round(listMs),
    detail_ms: Math.round(detailMs),
    backup_ms: Math.round(backupMs),
    validate_ms: Math.round(prepareMs),
    backup_asset_count: saved.assets,
    backup_versions: saved.versions,
  };
  mkdirSync(".local/qa", { recursive: true });
  writeFileSync(".local/qa/capacity.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  ctx.cleanup();
}
