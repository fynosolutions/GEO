import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import type { AssetStore, AssetFile } from "../../modules/merchant/public";
export function createAssetStore(root: string, maxMB = 50): AssetStore {
  const dir = path.join(root, "assets");
  mkdirSync(dir, { recursive: true });
  const filePath = (id: string) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid asset identifier");
    return path.join(dir, id);
  };
  return {
    max_bytes: maxMB * 1024 * 1024,
    put(bytes, info) {
      if (!bytes.length || bytes.length > maxMB * 1024 * 1024)
        throw new Error(`File must be non-empty and no larger than${maxMB} MB`);
      const sha256 = createHash("sha256").update(bytes).digest("hex"),
        dest = filePath(sha256);
      if (!existsSync(dest)) {
        const tmp = dest + "." + randomUUID() + ".tmp";
        writeFileSync(tmp, bytes, { flag: "wx" });
        renameSync(tmp, dest);
      } else {
        const existing = readFileSync(dest);
        if (
          existing.length !== bytes.length ||
          createHash("sha256").update(existing).digest("hex") !== sha256
        )
          throw new Error(
            "Stored attachment is damaged. Check storage or restore a backup first.",
          );
      }
      const file: AssetFile = {
        id: sha256,
        original_name: path.basename(info.name),
        mime: info.mime || "application/octet-stream",
        size: bytes.length,
        sha256,
        uploaded_at: new Date().toISOString(),
      };
      if (
        bytes.length >= 24 &&
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71
      ) {
        const buf = Buffer.from(bytes);
        file.width = buf.readUInt32BE(16);
        file.height = buf.readUInt32BE(20);
      }
      return file;
    },
    read(file) {
      const data = readFileSync(filePath(file.id));
      if (
        data.length !== file.size ||
        createHash("sha256").update(data).digest("hex") !== file.sha256
      )
        throw new Error("Attachment integrity check failed.");
      return data;
    },
  };
}
