import { NextRequest, NextResponse } from "next/server";
import { verify, SendToken } from "@/lib/token";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  const p = verify<SendToken>(req.nextUrl.searchParams.get("t"));
  if (p) {
    try {
      await recordEvent({
        type: "open",
        campaignId: p.c,
        contactId: p.k,
        stage: p.s,
        meta: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      });
    } catch {
      // never let logging break the pixel
    }
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    },
  });
}
