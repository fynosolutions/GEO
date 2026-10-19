import { it, expect, beforeEach, afterEach } from "vitest";
import {
  writeFileSync,
  unlinkSync,
  renameSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import { createWorkstation } from "../src/app/workstation";
import { createBackupManager } from "../src/infrastructure/storage/backup";
import { createPublicExport } from "../src/infrastructure/storage/public-export";
import { fixture, unwrap, merchantInput } from "./helpers";
let ctx: ReturnType<typeof fixture>,
  oldData: string | undefined,
  oldBackup: string | undefined;
beforeEach(() => {
  ctx = fixture();
  oldData = process.env.GEOBASE_DATA_DIR;
  oldBackup = process.env.GEOBASE_BACKUP_DIR;
  process.env.GEOBASE_DATA_DIR = path.join(ctx.dir, "runtime");
  process.env.GEOBASE_BACKUP_DIR = path.join(ctx.dir, "runtime-backups");
});
afterEach(() => {
  if (oldData === undefined) delete process.env.GEOBASE_DATA_DIR;
  else process.env.GEOBASE_DATA_DIR = oldData;
  if (oldBackup === undefined) delete process.env.GEOBASE_BACKUP_DIR;
  else process.env.GEOBASE_BACKUP_DIR = oldBackup;
  ctx.cleanup();
});
it("prevents two runtime instances from sharing a data directory", async () => {
  const first = createWorkstation();
  try {
    expect(() => createWorkstation()).toThrow("Another workstation is using");
  } finally {
    first.close();
  }
  const second = createWorkstation();
  second.close();
});
it("blocks editing after failed daily backup until explicit continuation", async () => {
  let w = createWorkstation();
  await w.initialize();
  const p = unwrap(await w.command((s) => s.createMerchant(merchantInput)));
  const saved = unwrap(
    await w.command((s) =>
      s.uploadMerchantAsset({
        merchant_id: p.merchant_id,
        expected_profile_version: 1,
        bytes: Buffer.from("missing daily backup asset"),
        name: "sample.txt",
        mime: "text/plain",
        category: "Sample",
      }),
    ),
  );
  w.close();
  unlinkSync(
    path.join(
      process.env.GEOBASE_DATA_DIR!,
      "assets",
      saved.records.asset[0].file!.id,
    ),
  );
  writeFileSync(
    path.join(process.env.GEOBASE_DATA_DIR!, "backup-state.json"),
    JSON.stringify({ day: "2000-01-01" }),
  );
  w = createWorkstation();
  try {
    await w.initialize();
    expect(w.status.backup_error).toBeTruthy();
    await expect(
      w.command((s) => s.createMerchant(merchantInput)),
    ).rejects.toThrow("Daily backup failed.");
    expect(
      unwrap(
        await w.service.getMerchantProfile({
          merchant_id: p.merchant_id,
          projection: "workspace",
        }),
      ).merchant_id,
    ).toBe(p.merchant_id);
    w.skipBackup();
    unwrap(
      await w.command((s) =>
        s.createMerchant({
          ...merchantInput,
          display_name: "Sample created after explicit continue",
        }),
      ),
    );
  } finally {
    w.close();
  }
});
it("aborts restore when the mandatory current backup cannot complete", async () => {
  const w = createWorkstation();
  try {
    await w.initialize();
    let p = unwrap(await w.command((s) => s.createMerchant(merchantInput)));
    const good = await w.createBackup();
    const prepared = await w.prepareRestore(good.name);
    p = unwrap(
      await w.command((s) =>
        s.uploadMerchantAsset({
          merchant_id: p.merchant_id,
          expected_profile_version: p.profile_version,
          bytes: Buffer.from("needed before restore"),
          name: "sample.txt",
          mime: "text/plain",
          category: "Sample",
        }),
      ),
    );
    unlinkSync(
      path.join(
        process.env.GEOBASE_DATA_DIR!,
        "assets",
        p.records.asset[0].file!.id,
      ),
    );
    await expect(w.restore(prepared.token)).rejects.toThrow();
    const current = unwrap(
      await w.service.getMerchantProfile({
        merchant_id: p.merchant_id,
        projection: "workspace",
      }),
    );
    expect(current.profile_version).toBe(p.profile_version);
    expect(current.records.asset).toHaveLength(1);
  } finally {
    w.close();
  }
});
it("refuses to back up inconsistent current rows and historical snapshots", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  p = unwrap(
    await ctx.service.saveRecord({
      merchant_id: p.merchant_id,
      expected_profile_version: 1,
      record_type: "room",
      values: { name: "Sample private dining room", capacity: 10 },
    }),
  );
  const room = structuredClone(p.records.room[0]);
  room.values.name = "Inconsistency caused by external modification";
  ctx.connection.native
    .prepare("UPDATE merchant_room SET body=? WHERE id=?")
    .run(JSON.stringify(room), room.record_id);
  const b = createBackupManager(ctx.root, ctx.backups, () => ctx.connection);
  await expect(b.create()).rejects.toThrow(
    "Current profile does not match its latest historical version.",
  );
});
it("public ZIP contains only selected actual files and no internal material", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  for (const name of ["selected.txt", "unselected.txt"])
    p = unwrap(
      await ctx.service.uploadMerchantAsset({
        merchant_id: p.merchant_id,
        expected_profile_version: p.profile_version,
        bytes: Buffer.from(name + " bytes"),
        name,
        mime: "text/plain",
        category: "Sample",
        publication_state: "public",
      }),
    );
  p = unwrap(
    await ctx.service.saveGroup({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      group_key: "relationship",
      fields: {
        internal_note: {
          value_state: "known",
          value: "SECRET_INTERNAL_MARKER",
        },
      },
    }),
  );
  const b = createBackupManager(ctx.root, ctx.backups, () => ctx.connection);
  const result = await createPublicExport(
    ctx.service,
    {
      merchant_id: p.merchant_id,
      profile_version: p.profile_version,
      asset_ids: [p.records.asset[0].record_id],
    },
    b.stagingBase,
  );
  const entries = await zipEntries(result.file);
  expect(Object.keys(entries).sort()).toEqual(
    [
      "assets/" + p.records.asset[0].record_id + ".txt",
      "merchant.json",
      "merchant.md",
    ].sort(),
  );
  expect(entries["assets/" + p.records.asset[0].record_id + ".txt"]).toBe(
    "selected.txt bytes",
  );
  expect(Object.values(entries).join("\n")).not.toContain(
    "SECRET_INTERNAL_MARKER",
  );
  expect(Object.values(entries).join("\n")).not.toContain("unselected.txt");
});
async function zipEntries(file: string) {
  return new Promise<Record<string, string>>((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error);
        return;
      }
      const entries: Record<string, string> = {};
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
      zip.on("entry", (entry) =>
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) {
            reject(err);
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (data) => chunks.push(Buffer.from(data)));
          stream.on("error", reject);
          stream.on("end", () => {
            entries[entry.fileName] = Buffer.concat(chunks).toString();
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}
it("recovers the original directory after an interrupted restore before commit", async () => {
  let w = createWorkstation();
  const p = unwrap(await w.service.createMerchant(merchantInput));
  w.close();
  const root = process.env.GEOBASE_DATA_DIR!,
    previous = root + ".previous-" + crypto.randomUUID(),
    replacement = root + ".replacement-" + crypto.randomUUID();
  mkdirSync(replacement);
  writeFileSync(
    root + ".restore.json",
    JSON.stringify({ root, previous, replacement, phase: "prepared" }),
  );
  renameSync(root, previous);
  w = createWorkstation();
  try {
    expect(
      unwrap(
        await w.service.getMerchantProfile({
          merchant_id: p.merchant_id,
          projection: "workspace",
        }),
      ).merchant_id,
    ).toBe(p.merchant_id);
    expect(existsSync(previous)).toBe(false);
    expect(existsSync(root + ".restore.json")).toBe(false);
  } finally {
    w.close();
  }
});
