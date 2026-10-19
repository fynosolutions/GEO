import { NextRequest } from "next/server";
import { createReadStream, rmSync } from "node:fs";
import { Readable } from "node:stream";
import { workstation } from "../../workstation";
import { localRequest, json, failure } from "../http";
import { safeChild } from "../../../infrastructure/storage/backup";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Cross-origin exports are not allowed." }, 403);
  try {
    const args = await req.json(),
      w = workstation();
    await w.initialize();
    const exported = await w.exportPublic(args);
    const stream = createReadStream(exported.file);
    stream.on("close", () =>
      rmSync(safeChild(w.backup.stagingBase, exported.dir), {
        recursive: true,
        force: true,
      }),
    );
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=public-materials.zip",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
