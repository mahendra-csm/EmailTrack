import { NextRequest, NextResponse } from "next/server";
import { runDueSends } from "@/lib/scheduler";

export const runtime = "nodejs";
export const maxDuration = 60; // each ping sends one batch within the time limit
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// The automatic heartbeat. Point an external scheduler (cron-job.org) at:
//
//   https://<your-app>/api/cron/tick?key=YOUR_CRON_SECRET     (every 2-5 min)
//
// It sends the next due batch and returns a small JSON summary. Re-running is
// always safe — already-sent rows are skipped. The `key` must match the
// CRON_SECRET env var, or the request is rejected. (A Bearer <secret> header is
// also accepted, which is how Vercel Cron authenticates if you use that.)
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
  // Keep modest: at ~1-1.5s per send, ~25 fits inside the 60s function limit.
  // The scheduler also enforces a time budget, so this is just the claim size.
  const batch = Math.min(Math.max(Number(process.env.CRON_BATCH_SIZE) || 25, 1), 200);
  const result = await runDueSends(batch);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
