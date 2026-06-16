import { NextRequest, NextResponse } from "next/server";
import { verify, SendToken } from "@/lib/token";
import { recordEvent } from "@/lib/events";

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
    await recordEvent({ type: "click", campaignId: p.c, contactId: p.k, stage: p.s, url: p.u });
  } catch {
    // logging must not block the redirect
  }
  return NextResponse.redirect(p.u, 302);
}
