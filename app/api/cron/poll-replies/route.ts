import { NextRequest, NextResponse } from "next/server";
import { pollReplies } from "@/lib/replies";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Point a second cron-job.org schedule here (every ~15 min):
//   https://<your-app>/api/cron/poll-replies?key=CRON_SECRET
// It scans the sender mailboxes for replies and stops follow-ups to anyone
// who answered.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const key = req.nextUrl.searchParams.get("key");
  const auth = req.headers.get("authorization");
  return key === secret || auth === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await pollReplies();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "poll failed" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
