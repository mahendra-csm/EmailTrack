import { NextResponse } from "next/server";
import { pollReplies } from "@/lib/replies";
import { recentReplyPolls } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Dashboard-triggered mailbox scan ("Poll now" on /deliverability). Same work as
// the cron schedule, but you see the result — including the exact IMAP error —
// immediately instead of guessing why replies aren't showing up.
export async function POST() {
  try {
    const result = await pollReplies("manual");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poll failed." },
      { status: 500 }
    );
  }
}

// Recent poll history, so the page can show when it last ran.
export async function GET() {
  return NextResponse.json({ polls: await recentReplyPolls(10) });
}
