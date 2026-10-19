import { NextRequest, NextResponse } from "next/server";
export function localRequest(req: NextRequest) {
  const authority = req.headers.get("host");
  if (!authority) return false;
  let host: string;
  try {
    host = new URL("http://" + authority).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.host !== authority || url.protocol !== req.nextUrl.protocol)
        return false;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Geobase-Application": "f1" },
  });
export const invalidArguments = () =>
  json(
    {
      ok: false,
      contract_version: "f1.v2",
      error: {
        code: "INVALID_ARGUMENT",
        message: "Request arguments must be a valid JSON object.",
      },
    },
    400,
  );
export const failure = (e: unknown) =>
  json(
    {
      ok: false,
      error: {
        code: "STORAGE_ERROR",
        message:
          e instanceof Error && !("code" in e)
            ? e.message
            : "Storage operation failed. Check files, disk space and configuration, then try again.",
      },
    },
    503,
  );
