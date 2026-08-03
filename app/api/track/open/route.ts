import { NextRequest, NextResponse } from "next/server";
import { verify, SendToken } from "@/lib/token";
import { recordEvent } from "@/lib/events";
import { classifyHit, clientIp } from "@/lib/botFilter";

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
      const ua = req.headers.get("user-agent");
      const ip = clientIp(req.headers);
      // A pixel fetched moments after the send, from Apple's privacy proxy, or
      // by a scanner is NOT a person reading the email — it's stored with bot=1
      // and a reason instead of inflating the open count.
      const v = classifyHit({
        ua,
        ip,
        msSinceSend: typeof p.t === "number" ? Date.now() - p.t : null,
      });
      await recordEvent({
        type: "open",
        campaignId: p.c,
        contactId: p.k,
        stage: p.s,
        meta: ua?.slice(0, 200) ?? null,
        bot: v.bot,
        botReason: v.reason,
        ip,
        msSinceSend: v.msSinceSend,
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
