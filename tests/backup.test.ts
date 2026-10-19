import { it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  createWriteStream,
  unlinkSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { ZipArchive } from "archiver";
import {
  createBackupManager,
  safeChild,
} from "../src/infrastructure/storage/backup";
import { openDatabase } from "../src/infrastructure/database/connection";
import { createRepository } from "../src/infrastructure/database/repository";
import { createWorkstation } from "../src/app/workstation";
import { fixture, unwrap, merchantInput } from "./helpers";
let ctx: ReturnType<typeof fixture>;
beforeEach(() => {
  ctx = fixture();
});
afterEach(() => ctx.cleanup());
it("backs up real assets, complete versions and ids; validates a portable package", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  p = unwrap(
    await ctx.service.uploadMerchantAsset({
      merchant_id: p.merchant_id,
      expected_profile_version: p.profile_version,
      bytes: Buffer.from("fixture bytes"),
      name: "sample.pdf",
      mime: "application/pdf",
      category: "Menus",
    }),
  );
  const backup = createBackupManager(
      ctx.root,
      ctx.backups,
      () => ctx.connection,
    ),
    created = await backup.create();
  expect(created.merchants).toBe(1);
  expect(created.versions).toBe(2);
  expect(created.assets).toBe(1);
  const prepared = await backup.prepareNamed(created.name);
  const restored = openDatabase(backup.getPrepared(prepared.token).dir);
  try {
    const repository = createRepository(restored);
    expect(repository.read(p.merchant_id)).toEqual(p);
    expect(repository.history(p.merchant_id)).toHaveLength(2);
    expect(
      readFileSync(
        path.join(
          backup.getPrepared(prepared.token).dir,
          "assets",
          p.records.asset[0].file!.id,
        ),
      ).toString(),
    ).toBe("fixture bytes");
  } finally {
    restored.native.close();
  }
});
it("rejects missing attachments without touching current database", async () => {
  let p = unwrap(await ctx.service.createMerchant(merchantInput));
  p = unwrap(
    await ctx.service.uploadMerchantAsset({
      merchant_id: p.merchant_id,
      expected_profile_version: 1,
      bytes: Buffer.from("keep this"),
      name: "file.pdf",
      mime: "application/pdf",
      category: "Menus",
    }),
  );
  const b = createBackupManager(ctx.root, ctx.backups, () => ctx.connection),
    good = await b.create(),
    prepared = await b.prepareNamed(good.name),
    entry = b.getPrepared(prepared.token),
    corrupt = path.join(ctx.dir, "missing.zip");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(corrupt),
      zip = new ZipArchive();
    output.on("close", resolve);
    zip.on("error", reject);
    zip.pipe(output);
    zip.file(path.join(entry.dir, "geobase.db"), { name: "database.sqlite" });
    zip.file(path.join(entry.dir, "manifest.json"), { name: "manifest.json" });
    void zip.finalize();
  });
  await expect(b.prepare(corrupt)).rejects.toThrow();
  expect(ctx.repository.read(p.merchant_id)).toEqual(p);
});
it("rejects unsupported versions, traversal and duplicate archive entries", async () => {
  const b = createBackupManager(ctx.root, ctx.backups, () => ctx.connection);
  for (const names of [
    ["manifest.json", "manifest.json"],
    ["unexpected.txt"],
  ]) {
    const bad = path.join(ctx.dir, crypto.randomUUID() + ".zip");
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(bad),
        zip = new ZipArchive();
      stream.on("close", resolve);
      zip.on("error", reject);
      zip.pipe(stream);
      for (const name of names) zip.append("{}", { name });
      void zip.finalize();
    });
    await expect(b.prepare(bad)).rejects.toThrow();
  }
  expect(() =>
    safeChild(ctx.root, path.resolve(ctx.root, "..", "escape")),
  ).toThrow();
  const good = await b.create(),
    prepared = await b.prepareNamed(good.name),
    entry = b.getPrepared(prepared.token),
    manifest = JSON.parse(
      readFileSync(path.join(entry.dir, "manifest.json"), "utf8"),
    );
  manifest.format_version = 999;
  const bad = path.join(ctx.dir, "unsupported.zip");
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(bad),
      zip = new ZipArchive();
    stream.on("close", resolve);
    zip.on("error", reject);
    zip.pipe(stream);
    zip.append(JSON.stringify(manifest), { name: "manifest.json" });
    zip.file(path.join(entry.dir, "geobase.db"), { name: "database.sqlite" });
    void zip.finalize();
  });
  await expect(b.prepare(bad)).rejects.toThrow("Unsupported");
});
it("does not mark failed automatic backup successful and retains only seven completed automatic backups", async () => {
  const b = createBackupManager(ctx.root, ctx.backups, () => ctx.connection);
  const manual = await b.create();
  for (let i = 0; i < 9; i++) await b.create(true);
  expect(b.list().filter((x) => x.name.startsWith("auto-"))).toHaveLength(7);
  expect(b.list().some((x) => x.name === manual.name)).toBe(true);
  expect(b.needsAutomatic()).toBe(false);
});
it("restores only after preserving the previous workstation and reopens all services", async () => {
  const oldData = process.env.GEOBASE_DATA_DIR,
    oldBackups = process.env.GEOBASE_BACKUP_DIR;
  process.env.GEOBASE_DATA_DIR = path.join(ctx.dir, "runtime");
  process.env.GEOBASE_BACKUP_DIR = path.join(ctx.dir, "runtime-backups");
  const w = createWorkstation();
  try {
    await w.initialize();
    const first = unwrap(
        await w.command((s) => s.createMerchant(merchantInput)),
      ),
      saved = await w.createBackup();
    const second = unwrap(
      await w.command((s) =>
        s.createMerchant({
          ...merchantInput,
          display_name: "Must not exist after restore",
        }),
      ),
    );
    const summary = await w.prepareRestore(saved.name);
    expect(summary.merchants).toBe(1);
    const done = await w.restore(summary.token);
    expect(done.restored).toBe(true);
    expect(w.backup.list().some((x) => x.name === done.recovery_backup)).toBe(
      true,
    );
    expect(
      unwrap(await w.service.listMerchants({ page: 1, page_size: 20 })).total,
    ).toBe(1);
    expect(
      unwrap(
        await w.service.getMerchantProfile({
          merchant_id: first.merchant_id,
          projection: "workspace",
        }),
      ).merchant_id,
    ).toBe(first.merchant_id);
    const missing = await w.service.getMerchantProfile({
      merchant_id: second.merchant_id,
      projection: "workspace",
    });
    expect(missing.ok).toBe(false);
  } finally {
    w.close();
    if (oldData === undefined) delete process.env.GEOBASE_DATA_DIR;
    else process.env.GEOBASE_DATA_DIR = oldData;
    if (oldBackups === undefined) delete process.env.GEOBASE_BACKUP_DIR;
    else process.env.GEOBASE_BACKUP_DIR = oldBackups;
  }
});
