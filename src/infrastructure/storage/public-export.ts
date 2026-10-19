import { ZipArchive } from "archiver";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { MerchantService } from "../../modules/merchant/public";
import { safeChild } from "./backup";
export async function createPublicExport(
  service: MerchantService,
  args: Parameters<MerchantService["exportMerchant"]>[0],
  stagingBase: string,
) {
  const result = await service.exportMerchant(args);
  if (!result.ok) throw new Error(result.error.message);
  const dir = safeChild(stagingBase, path.join(stagingBase, randomUUID()));
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  const data = result.data.json;
  const materialPaths = new Map<string, string>();
  for (const asset of data.records.asset) {
    const read = await service.readMerchantAsset({
      merchant_id: data.merchant_id,
      profile_version: data.profile_version,
      asset_id: asset.record_id,
      projection: "publishable",
      as_of_date: data.as_of_date,
    });
    if (!read.ok) throw new Error(read.error.message);
    const extension = path.extname(String(asset.values.name || ""));
    const relative =
      "assets/" +
      asset.record_id +
      (/^[.][a-zA-Z0-9]{1,8}$/.test(extension) ? extension : ".bin");
    materialPaths.set(asset.record_id, relative);
    writeFileSync(path.join(dir, relative), read.data.bytes);
    Object.assign(asset, { export_path: relative });
  }
  writeFileSync(path.join(dir, "merchant.json"), JSON.stringify(data, null, 2));
  writeFileSync(
    path.join(dir, "merchant.md"),
    result.data.markdown +
      (data.records.asset.length
        ? "## Selected media files" +
          data.records.asset
            .map(
              (a) =>
                `- [${String(a.values.name).replace(/[\[\]]/g, "")}](${materialPaths.get(a.record_id)})`,
            )
            .join("\n")
        : ""),
  );
  const file = path.join(dir, "public-materials.zip");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(file, { flags: "wx" }),
      zip = new ZipArchive({ zlib: { level: 1 } });
    output.on("close", resolve);
    output.on("error", reject);
    zip.on("error", reject);
    zip.on("warning", reject);
    zip.pipe(output);
    zip.file(path.join(dir, "merchant.json"), { name: "merchant.json" });
    zip.file(path.join(dir, "merchant.md"), { name: "merchant.md" });
    for (const asset of data.records.asset) {
      const relative = materialPaths.get(asset.record_id)!;
      zip.file(path.join(dir, relative), { name: relative });
    }
    void zip.finalize().catch(reject);
  });
  return { dir, file };
}
