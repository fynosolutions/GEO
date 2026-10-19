import { NextRequest } from "next/server";
import { workstation } from "../../workstation";
import { json, failure, localRequest } from "../http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Cross-origin access is not allowed." }, 403);
  try {
    const w = workstation();
    await w.initialize();
    return json({ ok: true, data: { ...w.status, backups: w.backup.list() } });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Cross-origin access is not allowed." }, 403);
  try {
    const { action, name, token } = await req.json(),
      w = workstation();
    await w.initialize();
    let data: unknown;
    if (action === "create") data = await w.createBackup();
    else if (action === "retry_auto") data = await w.createBackup(true);
    else if (action === "skip") {
      w.skipBackup();
      data = { continued: true };
    } else if (action === "prepare") data = await w.prepareRestore(name);
    else if (action === "restore") data = await w.restore(token);
    else if (action === "discard") data = await w.discardRestore(token);
    else return json({ error: "Unknown operation." }, 400);
    return json({ ok: true, data });
  } catch (e) {
    return failure(e);
  }
}
