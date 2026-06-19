import { db } from "./db";
import { accountsWithUsage } from "./mailer";
import { claimDue, dueCount, reclaimStale, sendStageRow, templateCache, ClaimRow } from "./sendCore";

// ---------------------------------------------------------------------------
// The automatic heartbeat. An external scheduler (cron-job.org) pings
// /api/cron/tick every few minutes; each ping runs this once:
//
//   1. Reset SMTP daily counters if the date rolled over.
//   2. Reclaim rows stuck 'sending' from a crashed/overlapping tick.
//   3. Atomically claim a batch of due + sendable rows (no double-send).
//   4. Bucket them by sending box and send ALL boxes IN PARALLEL (each box
//      serial through its own queue) — so N boxes give ~Nx throughput despite
//      slow per-send SMTP latency.
//
// Large lists drain across successive ticks; quotas and pinning are enforced
// per row in sendStageRow.
// ---------------------------------------------------------------------------

// SMTP latency already paces sends (~seconds each) and the hourly cap governs
// the overall rate, so the inter-send delay is small.
const DELAY_MS = Number(process.env.SEND_DELAY_MS ?? 150);
// Stop a tick well before the 60s serverless limit (with headroom for the
// wrap-up queries) and release whatever's left, so it never times out.
const MAX_TICK_MS = Number(process.env.MAX_TICK_MS ?? 40000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseHHMM(s?: string): number | null {
  const m = s?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Daily send window (UTC). If SEND_WINDOW_START is set, the scheduler only sends
 * between START and END each day — so every batch (including follow-ups you
 * don't re-upload) goes out at the same local hour instead of at UTC midnight.
 * e.g. 9:30 AM IST = 04:00 UTC -> SEND_WINDOW_START="04:00".
 */
function sendWindow(): { ok: boolean; message?: string } {
  const start = parseHHMM(process.env.SEND_WINDOW_START);
  const end = parseHHMM(process.env.SEND_WINDOW_END);
  if (start == null && end == null) return { ok: true };
  const now = new Date();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const s = start ?? 0;
  const e = end ?? 24 * 60;
  const inside = s <= e ? mins >= s && mins < e : mins >= s || mins < e; // handles wrap past midnight
  if (inside) return { ok: true };
  return {
    ok: false,
    message: `Outside send window (UTC ${process.env.SEND_WINDOW_START ?? "00:00"}–${process.env.SEND_WINDOW_END ?? "24:00"}).`,
  };
}

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

  // Respect the daily send window (e.g. start at 9:30 AM local) before doing work.
  const win = sendWindow();
  if (!win.ok) {
    return { ok: true, claimed: 0, sent: 0, failed: 0, retry: 0, canceled: 0, noQuota: 0, remaining: 0, message: win.message };
  }

  // Reset any account whose counter is from a previous day, so quota checks in
  // the claim SQL see fresh numbers. Keep the snapshot for sender assignment.
  const usage = await accountsWithUsage();
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
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > MAX_TICK_MS;
  const release = async (ids: number[]) => {
    if (ids.length === 0) return;
    await c.execute({
      sql: `UPDATE campaign_stages SET status='pending', claimed_at=NULL WHERE id IN (${ids
        .map(() => "?")
        .join(",")})`,
      args: ids,
    });
  };

  // Each claimed contact's pinned sender (follow-ups must reuse it).
  const contactIds = [...new Set(claimed.map((r) => r.contact_id))];
  const pinRes = await c.execute({
    sql: `SELECT id, smtp_account_id FROM contacts WHERE id IN (${contactIds.map(() => "?").join(",")})`,
    args: contactIds,
  });
  const pinOf = new Map<number, number | null>();
  for (const r of pinRes.rows as unknown as { id: number; smtp_account_id: number | null }[]) {
    pinOf.set(Number(r.id), r.smtp_account_id == null ? null : Number(r.smtp_account_id));
  }

  // Pool boxes available for unpinned (first-touch) contacts, least-loaded first.
  const pool = usage
    .filter((a) => a.in_pool === 1 && a.remaining > 0)
    .sort((a, b) => a.used_hour_count - b.used_hour_count);

  // Bucket rows by the box they'll send from: pinned -> its box, unpinned ->
  // round-robin across the pool. Each box becomes one serial queue; the queues
  // run IN PARALLEL so all boxes send at the same time.
  const buckets = new Map<number, ClaimRow[]>();
  const noBox: number[] = [];
  let rr = 0;
  for (const row of claimed) {
    const pin = pinOf.get(row.contact_id) ?? null;
    let acct: number | null;
    if (pin != null) acct = pin;
    else if (pool.length > 0) acct = pool[rr++ % pool.length].id;
    else acct = null;
    if (acct == null) {
      noBox.push(row.id);
      continue;
    }
    let arr = buckets.get(acct);
    if (!arr) {
      arr = [];
      buckets.set(acct, arr);
    }
    arr.push(row);
  }
  await release(noBox);

  let sent = 0;
  let failed = 0;
  let retry = 0;
  let canceled = 0;
  let noQuota = 0;
  let smtp: string | undefined;
  let message: string | undefined;

  await Promise.all(
    [...buckets.entries()].map(async ([accountId, rows]) => {
      for (let i = 0; i < rows.length; i++) {
        if (outOfTime()) {
          await release(rows.slice(i).map((r) => r.id));
          message = "Time budget reached — remainder released for the next tick.";
          return;
        }
        const o = await sendStageRow(c, rows[i], getTemplates, accountId);
        if (o.outcome === "sent") {
          sent++;
          smtp = o.smtp ?? smtp;
        } else if (o.outcome === "failed") failed++;
        else if (o.outcome === "retry") retry++;
        else if (o.outcome === "canceled") canceled++;
        else if (o.outcome === "no_quota") noQuota++;

        // Small gap between a single box's own sends; boxes still run in parallel.
        if (DELAY_MS > 0 && o.outcome === "sent" && i < rows.length - 1) await sleep(DELAY_MS);
      }
    })
  );

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
  return { ok: true, claimed: claimed.length, sent, failed, retry, canceled, noQuota, remaining, smtp, message };
}
