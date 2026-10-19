import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  renameSync,
  cpSync,
  rmSync,
  mkdirSync,
  openSync,
  writeFileSync,
  readFileSync,
  closeSync,
  existsSync,
} from "node:fs";
import { createPublicExport } from "../infrastructure/storage/public-export";
import { openDatabase } from "../infrastructure/database/connection";
import { createRepository } from "../infrastructure/database/repository";
import { createAssetStore } from "../infrastructure/storage/assets";
import {
  createBackupManager,
  safeChild,
} from "../infrastructure/storage/backup";
import {
  createMerchantService,
  type MerchantService,
} from "../modules/merchant/public";
export function createWorkstation() {
  const root = path.resolve(process.env.GEOBASE_DATA_DIR || ".local/geobase"),
    backupDir = path.resolve(
      process.env.GEOBASE_BACKUP_DIR || ".local/backups",
    );
  if (
    root === path.parse(root).root ||
    backupDir === path.parse(backupDir).root ||
    backupDir === root ||
    backupDir.startsWith(root + path.sep)
  )
    throw new Error(
      "Use a dedicated data directory and a separate backup directory outside it.",
    );
  const maxMB = Number(process.env.GEOBASE_MAX_FILE_MB || 50);
  if (!Number.isFinite(maxMB) || maxMB <= 0)
    throw new Error("Invalid attachment size configuration.");
  const lockPath = path.join(path.dirname(root), path.basename(root) + ".lock");
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const lockToken = randomUUID();
  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid, token: lockToken }));
    closeSync(fd);
  } catch {
    let owner: { pid: number };
    try {
      owner = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
      throw new Error(
        "Invalid workstation lock. Close other instances before checking the .lock file beside the data directory.",
      );
    }
    let alive = true;
    try {
      process.kill(owner.pid, 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false;
    }
    if (alive)
      throw new Error(
        "Another workstation is using this data directory. Close that instance first.",
      );
    rmSync(lockPath);
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid, token: lockToken }));
    closeSync(fd);
  }
  const releaseLock = () => {
    try {
      if (JSON.parse(readFileSync(lockPath, "utf8")).token === lockToken)
        rmSync(lockPath);
    } catch {}
  };
  const journalPath = root + ".restore.json";
  const persistJournal = (value: unknown) => {
    const temp = journalPath + ".tmp-" + randomUUID();
    try {
      writeFileSync(temp, JSON.stringify(value), { flag: "wx" });
      renameSync(temp, journalPath);
    } finally {
      rmSync(temp, { force: true });
    }
  };
  const recoverRestore = () => {
    if (!existsSync(journalPath)) return;
    const j = JSON.parse(readFileSync(journalPath, "utf8")) as {
      root: string;
      previous: string;
      replacement: string;
      phase: string;
    };
    const parent = path.dirname(root),
      name = path.basename(root);
    const intended = (value: string, kind: string) =>
      typeof value === "string" &&
      path.dirname(value) === parent &&
      value === path.resolve(value) &&
      path.basename(value).startsWith(name + "." + kind + "-") &&
      /^[a-f0-9-]{36}$/.test(
        path.basename(value).slice((name + "." + kind + "-").length),
      );
    if (
      j.root !== root ||
      !["prepared", "committed"].includes(j.phase) ||
      !intended(j.previous, "previous") ||
      !intended(j.replacement, "replacement")
    )
      throw new Error(
        "Invalid restore journal. Keep data and backups, and inspect the journal.",
      );
    safeChild(parent, j.previous);
    safeChild(parent, j.replacement);
    if (j.phase !== "committed" && existsSync(j.previous)) {
      if (existsSync(root)) {
        const failed = safeChild(
          parent,
          path.join(parent, name + ".replacement-" + randomUUID()),
        );
        renameSync(root, failed);
        rmSync(safeChild(parent, failed), { recursive: true, force: true });
      }
      renameSync(j.previous, root);
    }
    if (j.phase === "committed" && !existsSync(root))
      throw new Error(
        "Restored data directory is missing. Keep backups and inspect the storage.",
      );
    if (!existsSync(root))
      throw new Error(
        "Original data directory is missing. Keep backups and the restore journal for inspection.",
      );
    for (const dir of [j.previous, j.replacement])
      if (existsSync(dir))
        rmSync(safeChild(parent, dir), { recursive: true, force: true });
    rmSync(journalPath);
  };
  let connection: ReturnType<typeof openDatabase>;
  try {
    recoverRestore();
    connection = openDatabase(root);
  } catch (e) {
    releaseLock();
    throw e;
  }
  let service = createMerchantService({
    repository: createRepository(connection),
    assets: createAssetStore(root, maxMB),
  });
  const backup = createBackupManager(root, backupDir, () => connection);
  let busy = false,
    backupError: string | null = null,
    initialized = false,
    startup: Promise<void> | null = null;
  async function exclusive<T>(fn: () => Promise<T>) {
    if (busy)
      throw new Error(
        "A backup, restore or save is in progress. Please try again shortly.",
      );
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  }
  async function initialize() {
    if (initialized) return;
    if (startup) return startup;
    startup = (async () => {
      if (backup.needsAutomatic())
        try {
          await exclusive(() => backup.create(true));
        } catch (e) {
          backupError =
            e instanceof Error ? e.message : "Automatic backup failed.";
        }
      initialized = true;
    })();
    return startup;
  }
  return {
    get service() {
      return service;
    },
    backup,
    exportPublic: (args: Parameters<MerchantService["exportMerchant"]>[0]) =>
      exclusive(() => createPublicExport(service, args, backup.stagingBase)),
    discardRestore: async (token: string) =>
      exclusive(async () => {
        backup.consume(token);
        return { discarded: true };
      }),
    maxMB,
    initialize,
    get status() {
      return {
        busy,
        backup_error: backupError,
        initialized,
        max_file_mb: maxMB,
      };
    },
    command: async <T>(fn: (s: MerchantService) => Promise<T>) => {
      await initialize();
      if (backupError)
        throw new Error(
          "Daily backup failed. Retry or explicitly choose to continue this session.",
        );
      return exclusive(() => fn(service));
    },
    createBackup: async (auto = false) =>
      exclusive(async () => {
        const r = await backup.create(auto);
        backupError = null;
        return r;
      }),
    skipBackup: () => {
      backup.skipToday();
      backupError = null;
    },
    prepareRestore: async (name: string) =>
      exclusive(() => backup.prepareNamed(name)),
    prepareUploadedRestore: async (file: string) =>
      exclusive(() => backup.prepare(file)),
    restore: async (token: string) =>
      exclusive(async () => {
        const entry = backup.getPrepared(token);
        const recovery = await backup.create(false);
        const parent = path.dirname(root),
          previous = safeChild(
            parent,
            path.join(
              parent,
              path.basename(root) + ".previous-" + randomUUID(),
            ),
          ),
          replacement = safeChild(
            parent,
            path.join(
              parent,
              path.basename(root) + ".replacement-" + randomUUID(),
            ),
          );
        mkdirSync(replacement, { recursive: false });
        try {
          cpSync(entry.dir, replacement, { recursive: true });
        } catch (e) {
          rmSync(safeChild(parent, replacement), {
            recursive: true,
            force: true,
          });
          throw e;
        }
        persistJournal({ root, previous, replacement, phase: "prepared" });
        connection.native.close();
        let movedOld = false,
          movedNew = false,
          committed = false,
          rollbackComplete = false;
        try {
          renameSync(root, previous);
          movedOld = true;
          renameSync(replacement, root);
          movedNew = true;
          connection = openDatabase(root);
          service = createMerchantService({
            repository: createRepository(connection),
            assets: createAssetStore(root, maxMB),
          });
          backup.skipToday();
          backupError = null;
          persistJournal({ root, previous, replacement, phase: "committed" });
          committed = true;
          try {
            backup.consume(token);
          } catch (e) {
            console.error("restore staging cleanup deferred", e);
          }
        } catch (e) {
          try {
            try {
              connection.native.close();
            } catch {}
            if (movedNew) renameSync(root, replacement);
            if (movedOld) renameSync(previous, root);
            connection = openDatabase(root);
            service = createMerchantService({
              repository: createRepository(connection),
              assets: createAssetStore(root, maxMB),
            });
            rollbackComplete = true;
          } catch (recoveryError) {
            console.error("restore rollback interrupted", recoveryError);
            throw new Error(
              "Restore interrupted. Original data and the journal are retained. Restart the workstation to recover the original data.",
            );
          }
          throw e;
        } finally {
          if (committed || rollbackComplete) {
            try {
              for (const dir of [previous, replacement])
                if (existsSync(dir))
                  rmSync(safeChild(parent, dir), {
                    recursive: true,
                    force: true,
                  });
              rmSync(journalPath, { force: true });
            } catch (e) {
              console.error("restore cleanup deferred", e);
            }
          }
        }
        return { restored: true, recovery_backup: recovery.name };
      }),
    close: () => {
      connection.native.close();
      releaseLock();
    },
  };
}
type Workstation = ReturnType<typeof createWorkstation>;
const globalState = globalThis as unknown as { __geobase?: Workstation };
export const workstation = () =>
  globalState.__geobase || (globalState.__geobase = createWorkstation());
