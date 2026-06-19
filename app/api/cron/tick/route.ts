import { NextRequest, NextResponse, after } from "next/server";
import { runDueSends } from "@/lib/scheduler";

export const runtime = "nodejs";
export const maxDuration = 60; // background send work runs up to this limit
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// The automatic heartbeat. Point an external scheduler (cron-job.org) at:
//   https://<your-app>/api/cron/tick?key=YOUR_CRON_SECRET     (every 1 min)
//
// External cron services time out the REQUEST at ~30s, but a batch of slow SMTP
// sends takes longer — so we respond IMMEDIATELY (the cron sees success) and do
// the actual sending in the background via after(), which keeps running up to
// maxDuration. Sending is idempotent and time-bounded inside runDueSends.
// ---------------------------------------------------------------------------

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse to run unsecured
  const key = req.nextUrl.searchParams.get("key");
  const auth = req.headers.get("authorization");
  return key === secret || auth === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const batch = Math.min(Math.max(Number(process.env.CRON_BATCH_SIZE) || 25, 1), 200);

  // Run the send in the background so the cron request returns right away.
  after(async () => {
    try {
      await runDueSends(batch);
    } catch (err) {
      console.error("cron tick send failed:", err);
    }
  });

  return NextResponse.json({ ok: true, queued: true });
}

export const GET = handle;
export const POST = handle;
