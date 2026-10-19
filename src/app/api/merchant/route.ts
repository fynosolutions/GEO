import { NextRequest } from "next/server";
import { workstation } from "../../workstation";
import type { MerchantService } from "../../../modules/merchant/public";
import { json, failure, localRequest, invalidArguments } from "../http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reads = new Set([
  "getMerchantFieldCatalog",
  "listBrands",
  "findMerchantDuplicates",
  "listMerchants",
  "getMerchantProfile",
  "getMerchantFacts",
  "getMerchantNames",
  "listMerchantRecords",
  "listChannelSnapshots",
  "getMerchantAsset",
  "getMerchantEvidence",
  "getMerchantHistory",
  "exportMerchant",
]);
const writes = new Set([
  "createBrand",
  "updateBrand",
  "createMerchant",
  "saveGroup",
  "saveRecord",
  "removeRecord",
  "setCollectionState",
  "verifyFacts",
  "setPublication",
  "archiveMerchant",
  "recordChannelSnapshot",
]);
type Method = (args: never) => Promise<unknown>;
export async function GET(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Only local same-origin access is allowed." }, 403);
  try {
    const op = req.nextUrl.searchParams.get("op") || "";
    if (!reads.has(op)) return json({ error: "Unknown query." }, 404);
    const w = workstation();
    await w.initialize();
    if (w.status.busy)
      return json(
        {
          ok: false,
          error: {
            message:
              "The workstation is processing data. Please try again shortly.",
          },
        },
        503,
      );
    let args: unknown;
    try {
      args = JSON.parse(req.nextUrl.searchParams.get("args") || "{}");
    } catch {
      return invalidArguments();
    }
    if (!args || typeof args !== "object" || Array.isArray(args))
      return invalidArguments();
    const fn = w.service[op as keyof MerchantService] as Method;
    return json(await fn(args as never));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  if (!localRequest(req))
    return json({ error: "Only local same-origin access is allowed." }, 403);
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return invalidArguments();
    }
    if (!body || typeof body !== "object") return invalidArguments();
    const { op, args } = body as { op: string; args: unknown };
    if (!args || typeof args !== "object" || Array.isArray(args))
      return invalidArguments();
    if (!writes.has(op)) return json({ error: "Unknown command." }, 404);
    return json(
      await workstation().command((s) =>
        (s[op as keyof MerchantService] as Method)(args as never),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
