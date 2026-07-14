import { NextRequest, NextResponse } from "next/server";
import { verify, SendToken } from "@/lib/token";
import { recordEvent } from "@/lib/events";
import { isBotHit } from "@/lib/botFilter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifies the signed link, logs the click, then 302s to the original URL.
// Because the destination is inside the signed token, this is not an open
// redirect — only URLs we wrapped at send time can be reached.
export async function GET(req: NextRequest) {
  const p = verify<SendToken & { u: string }>(req.nextUrl.searchParams.get("t"));
  if (!p || typeof p.u !== "string" || !/^https?:\/\//i.test(p.u)) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });
  }
  try {
    // Security scanners (SafeLinks/Proofpoint/…) fetch every link instantly with
    // a browser-like UA — the ≤2s-after-send timing is what unmasks them so a
    // machine click on a link never counts as real engagement.
    const ua = req.headers.get("user-agent");
    const bot = isBotHit(ua, typeof p.t === "number" ? Date.now() - p.t : null);
    await recordEvent({
      type: "click",
      campaignId: p.c,
      contactId: p.k,
      stage: p.s,
      url: p.u,
      meta: ua?.slice(0, 200) ?? null,
      bot,
    });
  } catch {
    // logging must not block the redirect
  }
  return NextResponse.redirect(p.u, 302);
}
