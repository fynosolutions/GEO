import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
  createReadStream,
  createWriteStream,
} from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { ZipArchive } from "archiver";
import yauzl from "yauzl";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createRepository } from "../database/repository";
import type { Connection } from "../database/connection";
import {
  validateMerchantProfile,
  hydrateMerchantProfile,
  type Profile,
} from "../../modules/merchant/public";
interface Manifest {
  format_version: 1;
  created_at: string;
  database: { sha256: string; size: number };
  counts: Record<string, number>;
  assets: { id: string; sha256: string; size: number }[];
}
export function safeChild(root: string, target: string) {
  const base = path.resolve(root),
    dest = path.resolve(target);
  if (dest === base || !dest.startsWith(base + path.sep))
    throw new Error("Operation path is outside the workspace.");
  return dest;
}
export async function fileHash(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function counts(db: Database.Database) {
  const result: Record<string, number> = {};
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];
  for (const { name } of tables) {
    if (!/^[a-zA-Z0-9_]+$/.test(name))
      throw new Error("Invalid database structure.");
    result[name] = (
      db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }
    ).n;
  }
  return result;
}
function referenced(db: Database.Database) {
  const assets = new Map<
    string,
    { id: string; sha256: string; size: number }
  >();
  const rows = db
    .prepare("SELECT merchant_id, version, body FROM profile_versions")
    .iterate() as Iterable<{
    merchant_id: string;
    version: number;
    body: string;
  }>;
  for (const row of rows) {
    const p = hydrateMerchantProfile(JSON.parse(row.body) as Profile);
    validateMerchantProfile(p);
    if (p.merchant_id !== row.merchant_id || p.profile_version !== row.version)
      throw new Error("Invalid profile version reference.");
    if (p.brand_id) {
      const brand = db
        .prepare("SELECT body FROM brand_versions WHERE key=?")
        .get(p.brand_id + ":" + p.brand?.brand_version) as
        { body: string } | undefined;
      if (
        !brand ||
        !p.brand ||
        JSON.stringify(JSON.parse(brand.body)) !== JSON.stringify(p.brand)
      )
        throw new Error("Historical brand reference mismatch.");
    } else if (p.brand !== null) throw new Error("Brand association mismatch.");
    for (const r of p.records.asset) {
      if (!r.file) throw new Error("Asset file reference is missing.");
      const f = r.file;
      if (
        f.id !== f.sha256 ||
        !/^[a-f0-9]{64}$/.test(f.id) ||
        !Number.isSafeInteger(f.size) ||
        f.size < 1
      )
        throw new Error("Invalid attachment reference.");
      const prior = assets.get(f.id);
      if (prior && prior.size !== f.size)
        throw new Error("Attachment metadata mismatch.");
      assets.set(f.id, { id: f.id, sha256: f.sha256, size: f.size });
    }
  }
  return [...assets.values()];
}
function validateCurrentDatabase(db: Database.Database) {
  const repository = createRepository({ native: db, db: drizzle(db) });
  const stable = (value: unknown) =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, v[k]]),
          )
        : v,
    );
  for (const latest of repository.list()) {
    const current = repository.read(latest.merchant_id);
    if (!current || stable(current) !== stable(latest))
      throw new Error(
        "Current profile does not match its latest historical version.",
      );
  }
}
export function createBackupManager(
  root: string,
  backupDir: string,
  connection: () => Connection,
) {
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone:
        process.env.GEOBASE_WORKSTATION_TIMEZONE ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  root = path.resolve(root);
  backupDir = path.resolve(backupDir);
  if (
    root === path.parse(root).root ||
    backupDir === path.parse(backupDir).root ||
    backupDir === root ||
    backupDir.startsWith(root + path.sep)
  )
    throw new Error(
      "Backup directory must be outside the data directory and cannot be a drive root.",
    );
  mkdirSync(backupDir, { recursive: true });
  const stagingBase = path.join(backupDir, ".staging");
  mkdirSync(stagingBase, { recursive: true });
  const prepared = new Map<
    string,
    { dir: string; manifest: Manifest; source: string }
  >();
  const removeStage = (dir: string) =>
    rmSync(safeChild(stagingBase, dir), { recursive: true, force: true });
  async function create(auto = false) {
    const token = randomUUID(),
      stage = safeChild(stagingBase, path.join(stagingBase, token));
    await mkdir(path.join(stage, "assets"), { recursive: true });
    const dest = path.join(
        backupDir,
        `${auto ? "auto" : "manual"}-${new Date().toISOString().replace(/[:.]/g, "-")}-${token.slice(0, 8)}.geobase.zip`,
      ),
      temp = dest + ".tmp";
    try {
      const dbfile = path.join(stage, "database.sqlite");
      await connection().native.backup(dbfile);
      const copied = new Database(dbfile, { readonly: true });
      let refs: Manifest["assets"], recordCounts: Record<string, number>;
      try {
        refs = referenced(copied);
        validateCurrentDatabase(copied);
        recordCounts = counts(copied);
      } finally {
        copied.close();
      }
      for (const ref of refs) {
        const source = path.join(root, "assets", ref.id);
        if (
          statSync(source).size !== ref.size ||
          (await fileHash(source)) !== ref.sha256
        )
          throw new Error(
            "Attachment missing or invalid. Backup was not created.",
          );
        await copyFile(source, path.join(stage, "assets", ref.id));
      }
      const manifest: Manifest = {
        format_version: 1,
        created_at: new Date().toISOString(),
        database: {
          sha256: await fileHash(dbfile),
          size: statSync(dbfile).size,
        },
        counts: recordCounts,
        assets: refs,
      };
      writeFileSync(
        path.join(stage, "manifest.json"),
        JSON.stringify(manifest),
      );
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(temp, { flags: "wx" }),
          archive = new ZipArchive({ zlib: { level: 1 } });
        output.on("close", resolve);
        output.on("error", reject);
        archive.on("error", reject);
        archive.on("warning", reject);
        archive.pipe(output);
        archive.file(dbfile, { name: "database.sqlite" });
        archive.file(path.join(stage, "manifest.json"), {
          name: "manifest.json",
        });
        for (const ref of refs)
          archive.file(path.join(stage, "assets", ref.id), {
            name: "assets/" + ref.id,
          });
        void archive.finalize().catch(reject);
      });
      renameSync(temp, dest);
      removeStage(stage);
      if (auto) {
        writeFileSync(
          path.join(root, "backup-state.json"),
          JSON.stringify({
            day: today(),
            last_backup: path.basename(dest),
          }),
        );
        const backups = list().filter((x) => x.name.startsWith("auto-"));
        for (const old of backups.slice(7))
          rmSync(safeChild(backupDir, path.join(backupDir, old.name)));
      }
      return { name: path.basename(dest), ...summary(manifest) };
    } catch (e) {
      removeStage(stage);
      if (existsSync(temp)) rmSync(safeChild(backupDir, temp));
      throw e;
    }
  }
  function list() {
    return readdirSync(backupDir)
      .filter((n) => /^(auto|manual)-[\w.-]+\.geobase\.zip$/.test(n))
      .map((name) => ({
        name,
        size: statSync(path.join(backupDir, name)).size,
        created_at: statSync(path.join(backupDir, name)).mtime.toISOString(),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  function summary(m: Manifest) {
    return {
      created_at: m.created_at,
      merchants: m.counts.merchants || 0,
      versions: m.counts.profile_versions || 0,
      assets: m.assets.length,
      asset_bytes: m.assets.reduce((a, f) => a + f.size, 0),
    };
  }
  async function prepare(file: string, source = "uploaded") {
    const token = randomUUID(),
      dir = safeChild(stagingBase, path.join(stagingBase, token));
    await mkdir(path.join(dir, "assets"), { recursive: true });
    try {
      await extract(file, dir);
      const manifest = JSON.parse(
        await readFile(path.join(dir, "manifest.json"), "utf8"),
      ) as Manifest;
      if (
        manifest.format_version !== 1 ||
        !Array.isArray(manifest.assets) ||
        !manifest.counts
      )
        throw new Error("Unsupported backup format.");
      const dbfile = path.join(dir, "database.sqlite");
      if (
        statSync(dbfile).size !== manifest.database.size ||
        (await fileHash(dbfile)) !== manifest.database.sha256
      )
        throw new Error("Database validation failed.");
      const database = new Database(dbfile, { readonly: true });
      try {
        if (
          database.pragma("integrity_check", { simple: true }) !== "ok" ||
          (database.pragma("foreign_key_check") as unknown[]).length
        )
          throw new Error("Database or reference integrity check failed.");
        const actual = counts(database);
        if (
          JSON.stringify(Object.entries(actual).sort()) !==
          JSON.stringify(Object.entries(manifest.counts).sort())
        )
          throw new Error("Record counts do not match the manifest.");
        const current = connection().native;
        const migrations = (d: Database.Database) =>
          d.prepare("SELECT hash FROM __drizzle_migrations ORDER BY id").all();
        if (
          JSON.stringify(migrations(database)) !==
          JSON.stringify(migrations(current))
        )
          throw new Error("Incompatible database schema version.");
        const refs = referenced(database);
        validateCurrentDatabase(database);
        if (
          JSON.stringify(refs.sort((a, b) => a.id.localeCompare(b.id))) !==
          JSON.stringify(
            [...manifest.assets].sort((a, b) => a.id.localeCompare(b.id)),
          )
        )
          throw new Error(
            "Attachment manifest does not match historical references.",
          );
        const missing = database
          .prepare(
            "SELECT m.id FROM merchants m LEFT JOIN profile_versions v ON v.merchant_id=m.id AND v.version=m.version WHERE v.key IS NULL",
          )
          .all();
        if (missing.length)
          throw new Error("Restaurant has no current profile version.");
      } finally {
        database.close();
      }
      if (
        new Set(manifest.assets.map((f) => f.id)).size !==
        manifest.assets.length
      )
        throw new Error("Duplicate attachment manifest entry.");
      for (const f of manifest.assets) {
        if (!/^[a-f0-9]{64}$/.test(f.id))
          throw new Error("Invalid attachment identifier.");
        const filePath = path.join(dir, "assets", f.id);
        if (
          statSync(filePath).size !== f.size ||
          (await fileHash(filePath)) !== f.sha256
        )
          throw new Error("Attachment missing or integrity check failed.");
      }
      if (
        readdirSync(path.join(dir, "assets")).length !== manifest.assets.length
      )
        throw new Error("Package contains attachments outside its manifest.");
      renameSync(
        path.join(dir, "database.sqlite"),
        path.join(dir, "geobase.db"),
      );
      prepared.set(token, { dir, manifest, source });
      return { token, source, ...summary(manifest) };
    } catch (e) {
      removeStage(dir);
      throw e;
    }
  }
  return {
    create,
    list,
    prepare,
    stagingBase,
    prepareNamed: async (name: string) => {
      if (!list().some((b) => b.name === name))
        throw new Error("Backup not found.");
      return prepare(safeChild(backupDir, path.join(backupDir, name)), name);
    },
    getPrepared: (token: string) => {
      const entry = prepared.get(token);
      if (!entry)
        throw new Error("Restore validation expired. Select the backup again.");
      return entry;
    },
    consume: (token: string) => {
      const entry = prepared.get(token);
      if (entry) removeStage(entry.dir);
      prepared.delete(token);
    },
    needsAutomatic: () => {
      try {
        return (
          JSON.parse(readFileSync(path.join(root, "backup-state.json"), "utf8"))
            .day !== today()
        );
      } catch {
        return true;
      }
    },
    skipToday: () =>
      writeFileSync(
        path.join(root, "backup-state.json"),
        JSON.stringify({
          day: today(),
          skipped: true,
        }),
      ),
  };
}
async function extract(file: string, dest: string) {
  await new Promise<void>((resolve, reject) => {
    yauzl.open(
      file,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(error || new Error("Backup is not a valid ZIP file."));
          return;
        }
        const names = new Set<string>();
        let count = 0,
          total = 0;
        const fail = (e: unknown) => {
          zip.close();
          reject(e);
        };
        zip.on("error", fail);
        zip.on("end", resolve);
        zip.on("entry", (entry) => {
          const name = entry.fileName;
          total += entry.uncompressedSize;
          if (
            ++count > 100002 ||
            total > 1024 ** 4 ||
            names.has(name) ||
            !/^(manifest\.json|database\.sqlite|assets\/[a-f0-9]{64})$/.test(
              name,
            ) ||
            ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000 ||
            (name === "manifest.json" &&
              entry.uncompressedSize > 16 * 1024 * 1024)
          ) {
            fail(
              new Error(
                "Backup contains invalid, duplicate or oversized entries.",
              ),
            );
            return;
          }
          names.add(name);
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              fail(err || new Error("Could not read a backup entry."));
              return;
            }
            void pipeline(
              stream,
              createWriteStream(safeChild(dest, path.join(dest, name)), {
                flags: "wx",
              }),
            ).then(() => zip.readEntry(), fail);
          });
        });
        zip.readEntry();
      },
    );
  });
}
