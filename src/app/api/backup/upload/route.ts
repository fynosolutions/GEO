import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { workstation } from "../../../workstation";
import { safeChild } from "../../../../infrastructure/storage/backup";
import { json, failure, localRequest } from "../../http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Cross-origin uploads are not allowed." }, 403);
  if (!req.body) return json({ error: "Backup is empty." }, 400);
  const w = workstation(),
    file = safeChild(
      w.backup.stagingBase,
      path.join(w.backup.stagingBase, randomUUID() + ".upload"),
    );
  try {
    await pipeline(
      Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(file, { flags: "wx" }),
    );
    return json({ ok: true, data: await w.prepareUploadedRestore(file) });
  } catch (e) {
    return failure(e);
  } finally {
    rmSync(safeChild(w.backup.stagingBase, file), { force: true });
  }
}
