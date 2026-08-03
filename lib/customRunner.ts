import { db } from "./db";
import { accountsWithUsage } from "./mailer";
import { claimStage, reclaimStale, sendStageRow, templateCache, ClaimRow } from "./sendCore";

// ---------------------------------------------------------------------------
// The Custom mail sender. One HTTP call = one small batch, so the browser can
// drive a long list without ever hitting the serverless time limit:
//
//   • claim a batch of pending rows atomically (no double-send, even if you
//     open the page twice or a request is retried);
//   • split them into `concurrency` lanes (1–5) that run IN PARALLEL, each lane
//     sending serially with `delayMs` between its own sends — that's the
//     "1 mail, or 4–5 at a time, slowly" pacing;
//   • give each lane a different sending box where possible, so the parallelism
//     spreads across mailboxes instead of hammering one;
//   • stop before the function times out and release anything unsent.
//
// Sending itself goes through sendStageRow, exactly like the cron path, so
// logs, tracking, retries, suppression and pinning behave identically.
// ---------------------------------------------------------------------------

const MAX_RUN_MS = Number(process.env.MAX_TICK_MS ?? 40000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CustomRunResult {
  claimed: number;
  sent: number;
  failed: number;
  retry: number;
  canceled: number;
  noQuota: number;
  remaining: number;
  done: boolean;
  message?: string;
}

export async function runCustomBatch(
  campaignId: number,
  opts: { batchSize?: number; concurrency?: number; delayMs?: number } = {}
): Promise<CustomRunResult> {
  const c = await db();
  const concurrency = Math.min(Math.max(Math.round(opts.concurrency ?? 1), 1), 5);
  const delayMs = Math.min(Math.max(Math.round(opts.delayMs ?? 0), 0), 60_000);
  // Keep each request short: enough rows to be useful, few enough that the
  // pacing delay can't blow the time budget.
  const batchSize = Math.min(Math.max(Math.round(opts.batchSize ?? concurrency * 5), 1), 50);

  const pendingCount = async () => {
    const r = await c.execute({
      sql: `SELECT COUNT(*) AS n FROM campaign_stages
            WHERE campaign_id = ? AND stage = 1 AND status IN ('pending','sending')`,
      args: [campaignId],
    });
    return Number((r.rows[0] as unknown as { n: number })?.n ?? 0);
  };

  await reclaimStale(c);

  const claimed = await claimStage(c, campaignId, 1, batchSize);
  if (claimed.length === 0) {
    const remaining = await pendingCount();
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      retry: 0,
      canceled: 0,
      noQuota: 0,
      remaining,
      done: remaining === 0,
      message: remaining === 0 ? "All done." : "Nothing claimable right now — retrying.",
    };
  }

  // Sending boxes with quota, least-loaded first: lane i uses pool[i % pool.length]
  // so parallel lanes prefer different mailboxes.
  const pool = (await accountsWithUsage())
    .filter((a) => a.in_pool === 1 && a.remaining > 0)
    .sort((a, b) => a.used_hour_count - b.used_hour_count);

  // Deal the claimed rows round-robin into lanes.
  const lanes: ClaimRow[][] = Array.from({ length: concurrency }, () => []);
  claimed.forEach((row, i) => lanes[i % concurrency].push(row));

  const getTemplates = templateCache();
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > MAX_RUN_MS;
  const release = async (ids: number[]) => {
    if (ids.length === 0) return;
    await c.execute({
      sql: `UPDATE campaign_stages SET status='pending', claimed_at=NULL WHERE id IN (${ids
        .map(() => "?")
        .join(",")})`,
      args: ids,
    });
  };

  let sent = 0;
  let failed = 0;
  let retry = 0;
  let canceled = 0;
  let noQuota = 0;
  let message: string | undefined;

  await Promise.all(
    lanes.map(async (rows, laneIndex) => {
      const preferred = pool.length ? pool[laneIndex % pool.length].id : undefined;
      for (let i = 0; i < rows.length; i++) {
        if (outOfTime()) {
          await release(rows.slice(i).map((r) => r.id));
          message = "Paused at the time limit — the next batch picks up where this stopped.";
          return;
        }
        const o = await sendStageRow(c, rows[i], getTemplates, preferred);
        if (o.outcome === "sent") sent++;
        else if (o.outcome === "failed") failed++;
        else if (o.outcome === "retry") retry++;
        else if (o.outcome === "canceled") canceled++;
        else if (o.outcome === "no_quota") noQuota++;

        // Pace this lane; the other lanes keep sending in parallel.
        if (delayMs > 0 && i < rows.length - 1) await sleep(delayMs);
      }
    })
  );

  const remaining = await pendingCount();

  // A custom mail is a one-shot: once nothing is pending it's finished.
  if (remaining === 0) {
    await c.execute({
      sql: "UPDATE campaigns SET status='completed' WHERE id = ? AND status='active'",
      args: [campaignId],
    });
  }

  return {
    claimed: claimed.length,
    sent,
    failed,
    retry,
    canceled,
    noQuota,
    remaining,
    done: remaining === 0,
    message:
      message ??
      (noQuota > 0 && sent === 0
        ? "Every sending box is at its hourly/daily cap — waiting for quota."
        : undefined),
  };
}
