import { NextRequest } from "next/server";
import path from "node:path";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { workstation } from "../../../workstation";
import { json, localRequest } from "../../http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Cross-origin access is not allowed." }, 403);
  const w = workstation(),
    name = req.nextUrl.searchParams.get("name") || "";
  if (!w.backup.list().some((b) => b.name === name))
    return json({ error: "Backup not found." }, 404);
  const file = path.join(
    path.resolve(process.env.GEOBASE_BACKUP_DIR || ".local/backups"),
    name,
  );
  return new Response(
    Readable.toWeb(createReadStream(file)) as ReadableStream,
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
