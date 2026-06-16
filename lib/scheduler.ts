import { db } from "./db";
import { accountsWithUsage } from "./mailer";
import { claimDue, dueCount, reclaimStale, sendStageRow, templateCache } from "./sendCore";

// ---------------------------------------------------------------------------
// The automatic heartbeat. An external scheduler (cron-job.org) pings
// /api/cron/tick every few minutes; each ping runs this once:
//
//   1. Reset SMTP daily counters if the date rolled over.
//   2. Reclaim rows stuck 'sending' from a crashed/overlapping tick.
//   3. Atomically claim a batch of due + sendable rows (no double-send).
//   4. Send each via the shared core (pinning + retry + suppression).
//
// Large lists drain across successive ticks; quotas and pinning are enforced
// per row in sendStageRow.
// ---------------------------------------------------------------------------

const DELAY_MS = Number(process.env.SEND_DELAY_MS ?? 400);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TickResult {
  ok: boolean;
  claimed: number;
  sent: number;
  failed: number;
  retry: number;
  canceled: number;
  noQuota: number;
  remaining: number;
  message?: string;
  smtp?: string;
}

export async function runDueSends(maxCount = 50): Promise<TickResult> {
  const c = await db();

  // Reset any account whose counter is from a previous day, so quota checks in
  // the claim SQL see fresh numbers.
  await accountsWithUsage();
  await reclaimStale(c);

  const due = await dueCount(c);
  if (due === 0) {
    return { ok: true, claimed: 0, sent: 0, failed: 0, retry: 0, canceled: 0, noQuota: 0, remaining: 0, message: "Nothing due." };
  }

  const claimed = await claimDue(c, maxCount);
  if (claimed.length === 0) {
    return {
      ok: true,
      claimed: 0,
      sent: 0,
      failed: 0,
      retry: 0,
      canceled: 0,
      noQuota: 0,
      remaining: due,
      message: "Due rows exist but every required sender is out of quota — will resume when quota frees.",
    };
  }

  const getTemplates = templateCache();
  let sent = 0;
  let failed = 0;
  let retry = 0;
  let canceled = 0;
  let noQuota = 0;
  let smtp: string | undefined;

  for (let i = 0; i < claimed.length; i++) {
    const o = await sendStageRow(c, claimed[i], getTemplates);
    if (o.outcome === "sent") {
      sent++;
      smtp = o.smtp ?? smtp;
    } else if (o.outcome === "failed") failed++;
    else if (o.outcome === "retry") retry++;
    else if (o.outcome === "canceled") canceled++;
    else if (o.outcome === "no_quota") noQuota++;

    // Throttle only between real sends.
    if (DELAY_MS > 0 && o.outcome === "sent" && i < claimed.length - 1) await sleep(DELAY_MS);
  }

  // Mark campaigns whose every stage is done (sent/failed/canceled) as completed.
  await c.execute(
    `UPDATE campaigns SET status='completed'
     WHERE status='active' AND auto_send=1
       AND NOT EXISTS (
         SELECT 1 FROM campaign_stages s
         WHERE s.campaign_id = campaigns.id AND s.status IN ('pending','sending')
       )`
  );

  const remaining = await dueCount(c);
  return { ok: true, claimed: claimed.length, sent, failed, retry, canceled, noQuota, remaining, smtp };
}
