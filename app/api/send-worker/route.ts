import { NextRequest, NextResponse } from "next/server";
import { sendStageBatch } from "@/lib/send";
import { bumpJob, finishJob, getJob, isStopped } from "@/lib/jobStore";
import { enqueueWorker, verifyQstash, WorkerPayload } from "@/lib/qstash";
import { Stage, STAGES } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Emails per worker run = emails per QStash message. Bigger batch = fewer
// QStash messages (free tier = 500/day), but each run must finish under
// maxDuration (60s). 50 keeps 15k emails/day at ~300 messages. Tune via env.
const BATCH = Math.min(Math.max(Number(process.env.WORKER_BATCH_SIZE) || 50, 1), 90);

// Called by QStash. Sends one batch, records progress, and re-enqueues itself
// until the stage is finished, the sender is exhausted, or it's stopped.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("upstash-signature") ?? "";
  const raw = await req.text();
  if (!(await verifyQstash(signature, raw))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WorkerPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const campaignId = Number(payload.campaign_id);
  const stage = Number(payload.stage) as Stage;
  const smtpAccountId = Number(payload.smtp_account_id);
  if (!campaignId || !STAGES.includes(stage) || !smtpAccountId) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const job = await getJob(campaignId, stage);
  if (!job || job.status === "stopped") {
    return NextResponse.json({ stopped: true });
  }

  const result = await sendStageBatch(campaignId, stage, smtpAccountId, BATCH);
  await bumpJob(campaignId, stage, result.sent, result.failed, result.message ?? null);

  if (result.error) {
    await finishJob(campaignId, stage, "error", result.error);
    return NextResponse.json({ done: true, error: result.error });
  }
  if (result.exhausted) {
    await finishJob(campaignId, stage, "done", result.message ?? "Sender hit daily limit.");
    return NextResponse.json({ done: true });
  }
  if (result.remaining <= 0) {
    await finishJob(campaignId, stage, "done", "Completed.");
    return NextResponse.json({ done: true });
  }
  // No progress this round (e.g. missing template) — stop to avoid a loop.
  if (result.sent === 0 && result.failed === 0) {
    await finishJob(campaignId, stage, "done", result.message ?? "Stopped — nothing sent.");
    return NextResponse.json({ done: true });
  }
  if (await isStopped(campaignId, stage)) {
    await finishJob(campaignId, stage, "stopped", "Stopped.");
    return NextResponse.json({ stopped: true });
  }

  await enqueueWorker({ campaign_id: campaignId, stage, smtp_account_id: smtpAccountId }, 1);
  return NextResponse.json({ continued: true, remaining: result.remaining });
}
