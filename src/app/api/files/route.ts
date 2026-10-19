import { NextRequest } from "next/server";
import { workstation } from "../../workstation";
import type { Projection } from "../../../modules/merchant/public";
import { json, failure, localRequest } from "../http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Cross-origin uploads are not allowed." }, 403);
  try {
    const w = workstation();
    const limit = w.maxMB * 1024 * 1024;
    if (Number(req.headers.get("content-length") || 0) > limit + 1024 * 1024)
      return json(
        {
          ok: false,
          error: { message: `File size must not exceed${w.maxMB} MB` },
        },
        413,
      );
    const form = await req.formData(),
      file = form.get("file");
    if (!(file instanceof File) || file.size > limit || !file.size)
      return json(
        {
          ok: false,
          error: { message: `Choose a non-empty file (maximum${w.maxMB} MB)` },
        },
        400,
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    return json(
      await w.command((s) =>
        s.uploadMerchantAsset({
          merchant_id: String(form.get("merchant_id")),
          expected_profile_version: Number(
            form.get("expected_profile_version"),
          ),
          name: file.name,
          mime: file.type,
          bytes,
          category: String(form.get("category") || ""),
        }),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Cross-origin reads are not allowed." }, 403);
  try {
    const w = workstation();
    await w.initialize();
    if (w.status.busy)
      throw new Error("The workstation is busy. Please try again shortly.");
    const q = req.nextUrl.searchParams;
    const result = await w.service.readMerchantAsset({
      merchant_id: q.get("merchant_id") || "",
      profile_version: Number(q.get("profile_version")),
      asset_id: q.get("asset_id") || "",
      projection: q.get("projection") as Projection,
    });
    if (!result.ok) return json(result, 404);
    const f = result.data.file;
    return new Response(Buffer.from(result.data.bytes), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.original_name || "asset")}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
