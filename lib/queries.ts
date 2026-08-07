import { db } from "./db";
import { Campaign, CUSTOM_BATCH_TYPE, EmailTemplate, StageSummary, touchesFor } from "./types";
import { scheduleFor } from "./schedule";
import { PREFETCH_MS } from "./botFilter";

// libSQL rows come back as objects keyed by column name. We cast to our types;
// TEXT -> string, INTEGER -> number, NULL -> null.
type Row = Record<string, unknown>;
const rows = <T>(r: { rows: Row[] }): T[] => r.rows as unknown as T[];
const one = <T>(r: { rows: Row[] }): T | undefined => r.rows[0] as unknown as T | undefined;

// ---- Campaigns ------------------------------------------------------------

export interface CampaignWithCounts extends Campaign {
  total_contacts: number;
  total_sent: number;
  total_pending: number;
}

export async function listCampaigns(): Promise<CampaignWithCounts[]> {
  const c = await db();
  const res = await c.execute(
    `SELECT
       c.*,
       (SELECT COUNT(*) FROM contacts ct WHERE ct.campaign_id = c.id) AS total_contacts,
       (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id = c.id AND s.status = 'sent') AS total_sent,
       (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id = c.id AND s.status = 'pending') AS total_pending
     FROM campaigns c
     ORDER BY c.created_at DESC, c.id DESC`
  );
  return rows<CampaignWithCounts>(res);
}

export async function getCampaign(id: number): Promise<Campaign | undefined> {
  const c = await db();
  const res = await c.execute({ sql: "SELECT * FROM campaigns WHERE id = ?", args: [id] });
  return one<Campaign>(res);
}

export async function deleteCampaign(id: number): Promise<void> {
  const c = await db();
  await c.execute({ sql: "DELETE FROM campaign_stages WHERE campaign_id = ?", args: [id] });
  await c.execute({ sql: "DELETE FROM email_logs WHERE campaign_id = ?", args: [id] });
  await c.execute({ sql: "DELETE FROM email_events WHERE campaign_id = ?", args: [id] });
  await c.execute({ sql: "DELETE FROM email_templates WHERE campaign_id = ?", args: [id] });
  await c.execute({ sql: "DELETE FROM suppressions WHERE campaign_id = ?", args: [id] });
  await c.execute({ sql: "DELETE FROM contacts WHERE campaign_id = ?", args: [id] });
  await c.execute({ sql: "DELETE FROM campaigns WHERE id = ?", args: [id] });
}

// ---- Stage summaries (summary cards) --------------------------------------

export async function stageSummaries(campaign: Campaign): Promise<StageSummary[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT stage,
                 SUM(CASE WHEN status IN ('pending','sending') THEN 1 ELSE 0 END) AS pending,
                 SUM(CASE WHEN status = 'sent'     THEN 1 ELSE 0 END) AS sent,
                 SUM(CASE WHEN status = 'failed'   THEN 1 ELSE 0 END) AS failed,
                 SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) AS canceled,
                 COUNT(*) AS total
          FROM campaign_stages
          WHERE campaign_id = ?
          GROUP BY stage`,
    args: [campaign.id],
  });
  const byStage = new Map(
    rows<{
      stage: number;
      pending: number;
      sent: number;
      failed: number;
      canceled: number;
      total: number;
    }>(res).map((r) => [r.stage, r])
  );
  const sched = campaign.start_date
    ? new Map(scheduleFor(campaign.start_date, campaign.batch_type).map((t) => [t.seq, t.send_date]))
    : new Map<number, string>();

  return touchesFor(campaign.batch_type).map((t) => {
    const r = byStage.get(t.seq);
    return {
      seq: t.seq,
      label: t.label,
      send_date: sched.get(t.seq) ?? null,
      pending: r?.pending ?? 0,
      sent: r?.sent ?? 0,
      failed: r?.failed ?? 0,
      canceled: r?.canceled ?? 0,
      total: r?.total ?? 0,
    };
  });
}

// ---- Per-stage contact rows (stage tables) --------------------------------

export interface StageRow {
  stage_id: number;
  contact_id: number;
  email: string;
  name: string | null;
  status: "pending" | "sending" | "sent" | "failed" | "canceled";
  sent_at: string | null;
  attempts: number;
  last_error: string | null;
  sender: string | null; // pinned SMTP account email
}

export async function stageRows(campaignId: number, stage: number): Promise<StageRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT s.id AS stage_id, s.contact_id, ct.email, ct.name, s.status, s.sent_at,
                 s.attempts, s.last_error, sa.email AS sender
          FROM campaign_stages s
          JOIN contacts ct ON ct.id = s.contact_id
          LEFT JOIN smtp_accounts sa ON sa.id = ct.smtp_account_id
          WHERE s.campaign_id = ? AND s.stage = ?
          ORDER BY ct.email`,
    args: [campaignId, stage],
  });
  return rows<StageRow>(res);
}

// ---- Pending rows for sending ---------------------------------------------

export interface PendingSend {
  stage_id: number;
  contact_id: number;
  email: string;
  name: string | null;
}

export async function pendingForStage(
  campaignId: number,
  stage: number,
  limit?: number
): Promise<PendingSend[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT s.id AS stage_id, s.contact_id, ct.email, ct.name
          FROM campaign_stages s
          JOIN contacts ct ON ct.id = s.contact_id
          WHERE s.campaign_id = ? AND s.stage = ? AND s.status = 'pending'
          ORDER BY ct.email
          ${limit ? "LIMIT ?" : ""}`,
    args: limit ? [campaignId, stage, limit] : [campaignId, stage],
  });
  return rows<PendingSend>(res);
}

/**
 * Re-queue 'failed' rows so the scheduler tries them again (resets attempts +
 * backoff). 'canceled' rows are left alone — those were suppressed after a hard
 * bounce and shouldn't be re-mailed. Returns how many were re-queued.
 */
export async function requeueFailed(campaignId: number, stage?: number): Promise<number> {
  const c = await db();
  const res = await c.execute({
    sql: `UPDATE campaign_stages
          SET status='pending', attempts=0, last_error=NULL, next_attempt_at=NULL, claimed_at=NULL
          WHERE campaign_id = ? AND status='failed'${stage ? " AND stage = ?" : ""}`,
    args: stage ? [campaignId, stage] : [campaignId],
  });
  return res.rowsAffected ?? 0;
}

export async function pendingCountForStage(campaignId: number, stage: number): Promise<number> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT COUNT(*) AS n FROM campaign_stages
          WHERE campaign_id = ? AND stage = ? AND status = 'pending'`,
    args: [campaignId, stage],
  });
  return (one<{ n: number }>(res)?.n ?? 0) as number;
}

// ---- Logs -----------------------------------------------------------------

export interface LogRow {
  id: number;
  campaign_id: number;
  contact_id: number;
  stage: number;
  smtp_used: string | null;
  status: "sent" | "failed";
  error_message: string | null;
  timestamp: string;
  email: string | null;
}

export async function campaignLogs(campaignId: number, limit = 500): Promise<LogRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT l.*, ct.email
          FROM email_logs l
          LEFT JOIN contacts ct ON ct.id = l.contact_id
          WHERE l.campaign_id = ?
          ORDER BY l.id DESC
          LIMIT ?`,
    args: [campaignId, limit],
  });
  return rows<LogRow>(res);
}

// ---- Templates ------------------------------------------------------------

export async function templatesFor(campaignId: number): Promise<Record<number, EmailTemplate>> {
  const c = await db();
  const res = await c.execute({
    sql: "SELECT * FROM email_templates WHERE campaign_id = ?",
    args: [campaignId],
  });
  const out: Record<number, EmailTemplate> = {};
  for (const r of rows<EmailTemplate>(res)) out[r.stage] = r;
  return out;
}

// ---- Tracking matrix ------------------------------------------------------

export interface TouchCell {
  status: "pending" | "sending" | "sent" | "failed" | "canceled";
  sent_at: string | null;
}
export interface TrackingRow {
  contact_id: number;
  email: string;
  name: string | null;
  touches: Record<number, TouchCell>; // keyed by touch seq (1..4)
  opens: number;
  clicks: number;
  stageEvents: Record<number, { opens: number; clicks: number }>;
}

export async function trackingMatrix(campaignId: number): Promise<TrackingRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT ct.id AS contact_id, ct.email, ct.name,
                 s.stage, s.status, s.sent_at
          FROM contacts ct
          JOIN campaign_stages s ON s.contact_id = ct.id
          WHERE ct.campaign_id = ?
          ORDER BY ct.email, s.stage`,
    args: [campaignId],
  });

  const byContact = new Map<number, TrackingRow>();
  for (const r of rows<{
    contact_id: number;
    email: string;
    name: string | null;
    stage: number;
    status: TouchCell["status"];
    sent_at: string | null;
  }>(res)) {
    let row = byContact.get(r.contact_id);
    if (!row) {
      row = {
        contact_id: r.contact_id,
        email: r.email,
        name: r.name,
        touches: {},
        opens: 0,
        clicks: 0,
        stageEvents: {},
      };
      byContact.set(r.contact_id, row);
    }
    row.touches[r.stage] = { status: r.status, sent_at: r.sent_at };
  }

  const events = await c.execute({
    sql: `SELECT contact_id, stage,
                 SUM(CASE WHEN type = 'open' THEN 1 ELSE 0 END) AS opens,
                 SUM(CASE WHEN type = 'click' THEN 1 ELSE 0 END) AS clicks
          FROM email_events
          WHERE campaign_id = ? AND bot = 0
          GROUP BY contact_id, stage`,
    args: [campaignId],
  });

  for (const e of rows<{ contact_id: number; stage: number; opens: number; clicks: number }>(events)) {
    const row = byContact.get(e.contact_id);
    if (row) {
      row.stageEvents[e.stage] = { opens: e.opens ?? 0, clicks: e.clicks ?? 0 };
      row.opens += e.opens ?? 0;
      row.clicks += e.clicks ?? 0;
    }
  }

  return [...byContact.values()];
}

// ---- Database view --------------------------------------------------------

export interface DatabaseRow {
  id: number;
  timestamp: string;
  campaign_id: number;
  campaign_name: string | null;
  email: string | null;
  name: string | null;
  stage: number;
  smtp_used: string | null;
  status: "sent" | "failed";
  error_message: string | null;
}

export async function databaseRecords(limit = 1000): Promise<DatabaseRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT l.id, l.timestamp, l.campaign_id, l.stage, l.smtp_used,
                 l.status, l.error_message, ct.email, ct.name,
                 c.name AS campaign_name
          FROM email_logs l
          LEFT JOIN contacts ct ON ct.id = l.contact_id
          LEFT JOIN campaigns c ON c.id = l.campaign_id
          ORDER BY l.id DESC
          LIMIT ?`,
    args: [limit],
  });
  return rows<DatabaseRow>(res);
}

export interface DatabaseStats {
  total: number;
  sent: number;
  failed: number;
}

export async function databaseStats(): Promise<DatabaseStats> {
  const c = await db();
  const res = await c.execute(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'sent'   THEN 1 ELSE 0 END) AS sent,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM email_logs`
  );
  const r = one<{ total: number; sent: number | null; failed: number | null }>(res);
  return { total: r?.total ?? 0, sent: r?.sent ?? 0, failed: r?.failed ?? 0 };
}

// ---- Deliverability / engagement ------------------------------------------

export interface DeliverabilityTotals {
  sent: number;
  delivered: number;
  failed: number;
  canceled: number;
  opens: number;
  opensUnique: number;
  clicks: number;
  clicksUnique: number;
  replies: number;
  unsubs: number;
  bounces: number;
  suppressed: number;
}

export async function deliverabilityTotals(): Promise<DeliverabilityTotals> {
  const c = await db();
  const s = one<{ sent: number; failed: number; canceled: number }>(
    await c.execute(`SELECT
        SUM(CASE WHEN status='sent'     THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status='failed'   THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status='canceled' THEN 1 ELSE 0 END) AS canceled
      FROM campaign_stages`)
  );
  const e = one<{
    opens: number;
    opens_unique: number;
    clicks: number;
    clicks_unique: number;
    replies: number;
    unsubs: number;
    bounces: number;
  }>(
    await c.execute(`SELECT
        SUM(CASE WHEN type='open'  THEN 1 ELSE 0 END) AS opens,
        COUNT(DISTINCT CASE WHEN type='open'  THEN contact_id END) AS opens_unique,
        SUM(CASE WHEN type='click' THEN 1 ELSE 0 END) AS clicks,
        COUNT(DISTINCT CASE WHEN type='click' THEN contact_id END) AS clicks_unique,
        COUNT(DISTINCT CASE WHEN type='reply'  THEN contact_id END) AS replies,
        COUNT(DISTINCT CASE WHEN type='unsubscribe' THEN contact_id END) AS unsubs,
        COUNT(DISTINCT CASE WHEN type='bounce' THEN contact_id END) AS bounces
      FROM email_events WHERE bot = 0`)
  );
  const supp = one<{ n: number }>(await c.execute("SELECT COUNT(*) AS n FROM suppressions"));
  const sent = s?.sent ?? 0;
  const bounces = e?.bounces ?? 0;
  return {
    sent,
    delivered: Math.max(sent - bounces, 0),
    failed: s?.failed ?? 0,
    canceled: s?.canceled ?? 0,
    opens: e?.opens ?? 0,
    opensUnique: e?.opens_unique ?? 0,
    clicks: e?.clicks ?? 0,
    clicksUnique: e?.clicks_unique ?? 0,
    replies: e?.replies ?? 0,
    unsubs: e?.unsubs ?? 0,
    bounces,
    suppressed: supp?.n ?? 0,
  };
}

export interface CampaignDelivStats {
  sent: number;
  delivered: number;
  failed: number;
  opens: number;
  opensUnique: number;
  clicks: number;
  clicksUnique: number;
  replies: number;
  unsubs: number;
  bounces: number;
}

/** Deliverability totals for a single campaign (for its own page). */
export async function campaignDeliverability(campaignId: number): Promise<CampaignDelivStats> {
  const c = await db();
  const s = one<{ sent: number; failed: number }>(
    await c.execute({
      sql: `SELECT SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent,
                   SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
            FROM campaign_stages WHERE campaign_id = ?`,
      args: [campaignId],
    })
  );
  const e = one<{
    opens: number;
    opens_unique: number;
    clicks: number;
    clicks_unique: number;
    replies: number;
    unsubs: number;
    bounces: number;
  }>(
    await c.execute({
      sql: `SELECT SUM(CASE WHEN type='open'  THEN 1 ELSE 0 END) AS opens,
                   COUNT(DISTINCT CASE WHEN type='open'  THEN contact_id END) AS opens_unique,
                   SUM(CASE WHEN type='click' THEN 1 ELSE 0 END) AS clicks,
                   COUNT(DISTINCT CASE WHEN type='click' THEN contact_id END) AS clicks_unique,
                   COUNT(DISTINCT CASE WHEN type='reply'  THEN contact_id END) AS replies,
                   COUNT(DISTINCT CASE WHEN type='unsubscribe' THEN contact_id END) AS unsubs,
                   COUNT(DISTINCT CASE WHEN type='bounce' THEN contact_id END) AS bounces
            FROM email_events WHERE campaign_id = ? AND bot = 0`,
      args: [campaignId],
    })
  );
  const sent = s?.sent ?? 0;
  const bounces = e?.bounces ?? 0;
  return {
    sent,
    delivered: Math.max(sent - bounces, 0),
    failed: s?.failed ?? 0,
    opens: e?.opens ?? 0,
    opensUnique: e?.opens_unique ?? 0,
    clicks: e?.clicks ?? 0,
    clicksUnique: e?.clicks_unique ?? 0,
    replies: e?.replies ?? 0,
    unsubs: e?.unsubs ?? 0,
    bounces,
  };
}

export interface CampaignDeliverability {
  id: number;
  name: string;
  status: string;
  country: string | null;
  sent: number;
  delivered: number;
  failed: number;
  bounces: number;
  opens: number;
  opens_unique: number;
  clicks: number;
  clicks_unique: number;
  replies: number;
  unsubs: number;
}

export async function deliverabilityByCampaign(): Promise<CampaignDeliverability[]> {
  const c = await db();
  const res = await c.execute(
    `SELECT c.id, c.name, c.status, c.country,
       (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id=c.id AND s.status='sent') AS sent,
       (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id=c.id AND s.status='failed') AS failed,
       (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='bounce') AS bounces,
       (SELECT SUM(CASE WHEN e.type='open' THEN 1 ELSE 0 END) FROM email_events e WHERE e.campaign_id=c.id AND e.bot=0) AS opens,
       (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='open' AND e.bot=0) AS opens_unique,
       (SELECT SUM(CASE WHEN e.type='click' THEN 1 ELSE 0 END) FROM email_events e WHERE e.campaign_id=c.id AND e.bot=0) AS clicks,
       (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='click' AND e.bot=0) AS clicks_unique,
       (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='reply') AS replies,
       (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='unsubscribe') AS unsubs
     FROM campaigns c
     ORDER BY c.created_at DESC, c.id DESC`
  );
  return rows<CampaignDeliverability>(res).map((row) => ({
    ...row,
    delivered: Math.max(row.sent - row.bounces, 0),
  }));
}

// ---- Custom mail ----------------------------------------------------------

export interface CustomMailRow extends Campaign {
  total_contacts: number;
  sent: number;
  pending: number;
  failed: number;
  opens_unique: number;
  clicks_unique: number;
}

/** Every custom-mail send with its live progress, newest first. */
export async function customMails(): Promise<CustomMailRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT c.*,
            (SELECT COUNT(*) FROM contacts ct WHERE ct.campaign_id = c.id) AS total_contacts,
            (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id=c.id AND s.status='sent') AS sent,
            (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id=c.id AND s.status IN ('pending','sending')) AS pending,
            (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id=c.id AND s.status='failed') AS failed,
            (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='open' AND e.bot=0) AS opens_unique,
            (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='click' AND e.bot=0) AS clicks_unique
          FROM campaigns c
          WHERE c.batch_type = ?
          ORDER BY c.id DESC`,
    args: [CUSTOM_BATCH_TYPE],
  });
  return rows<CustomMailRow>(res);
}

// ---- Tracking quality (how much machine traffic we filtered) --------------

export interface FilteredHits {
  type: "open" | "click";
  reason: string;
  n: number;
}

/**
 * Breakdown of the open/click hits that were rejected as machine traffic, by
 * reason. This is what makes the numbers explainable: "your open count didn't
 * jump because 4,200 pixel fetches were delivery-time scans, not readers".
 */
export async function filteredHits(): Promise<FilteredHits[]> {
  const c = await db();
  const res = await c.execute(
    `SELECT type, COALESCE(bot_reason, 'unclassified') AS reason, COUNT(*) AS n
     FROM email_events
     WHERE bot = 1 AND type IN ('open','click')
     GROUP BY type, COALESCE(bot_reason, 'unclassified')
     ORDER BY n DESC`
  );
  return rows<FilteredHits>(res);
}

export interface ReplyPollRow {
  id: number;
  ran_at: string;
  source: string | null;
  accounts: number;
  scanned: number;
  replies: number;
  bounces: number;
  errors: string | null;
}

/** Recent IMAP poll runs — shows whether reply detection is alive at all. */
export async function recentReplyPolls(limit = 10): Promise<ReplyPollRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: "SELECT * FROM reply_polls ORDER BY id DESC LIMIT ?",
    args: [limit],
  });
  return rows<ReplyPollRow>(res);
}

/**
 * Re-classify HISTORICAL open/click events with the current filter rules.
 *
 * Old rows were flagged with a 2-second prefetch window and no privacy-proxy
 * detection, so campaigns sent before the fix carry inflated open/click counts.
 * We can still reconstruct the timing: campaign_stages.sent_at holds when that
 * exact touch went out, so (event.created_at − stage.sent_at) is the same signal
 * the live endpoint gets from the token, and `meta` holds the user-agent.
 * Returns how many rows changed.
 */
export async function reclassifyHistory(): Promise<{ flagged: number; scanned: number }> {
  const c = await db();
  const windowSec = Math.round(PREFETCH_MS / 1000);

  const total = one<{ n: number }>(
    await c.execute("SELECT COUNT(*) AS n FROM email_events WHERE type IN ('open','click')")
  );

  // 1. Timing: the hit landed within the prefetch window of its own send.
  const timing = await c.execute({
    sql: `UPDATE email_events e
          SET bot = 1, bot_reason = 'prefetch'
          FROM campaign_stages s
          WHERE e.type IN ('open','click') AND e.bot = 0
            AND s.contact_id = e.contact_id AND s.stage = e.stage AND s.sent_at IS NOT NULL
            AND e.created_at::timestamp >= s.sent_at::timestamp
            AND e.created_at::timestamp < s.sent_at::timestamp + (? || ' seconds')::interval`,
    args: [String(windowSec)],
  });

  // 2. Apple Mail Privacy Protection / image-proxy user-agents: a WebKit UA with
  //    the real browser tokens stripped.
  const proxy = await c.execute(
    `UPDATE email_events
     SET bot = 1, bot_reason = 'privacy-proxy'
     WHERE type IN ('open','click') AND bot = 0
       AND meta ILIKE '%AppleWebKit%'
       AND meta NOT ILIKE '%Safari/%' AND meta NOT ILIKE '%Version/%' AND meta NOT ILIKE '%Mobile/%'`
  );

  // 3. No user-agent at all — every real client sends one.
  const noUa = await c.execute(
    `UPDATE email_events SET bot = 1, bot_reason = 'no-ua'
     WHERE type IN ('open','click') AND bot = 0 AND (meta IS NULL OR meta = '')`
  );

  // 4. Events that predate their own campaign belong to a DELETED campaign whose
  //    id was later handed to a new one (see the id-reuse guard in lib/db.ts).
  //    They aren't this campaign's readers, so they must not count for it.
  const stale = await c.execute(
    `UPDATE email_events e SET bot = 1, bot_reason = 'stale-campaign-id'
     FROM campaigns c
     WHERE c.id = e.campaign_id AND e.bot = 0 AND e.created_at < c.created_at`
  );

  return {
    flagged:
      timing.rowsAffected + proxy.rowsAffected + noUa.rowsAffected + stale.rowsAffected,
    scanned: total?.n ?? 0,
  };
}

// ---- Recipients (valid / bounced / unsubscribed / replied) ----------------

// One derived row per contact: status, the date it happened, the country it
// targeted, and which sender address it went out from.
const RECIPIENT_INNER = `
  SELECT ct.id AS contact_id, ct.email, ct.name, cm.name AS campaign, cm.country,
    sa.email AS sender,
    CASE
      WHEN sup.reason = 'bounce'            THEN 'bounced'
      WHEN ct.unsubscribed_at IS NOT NULL   THEN 'unsubscribed'
      WHEN ct.replied_at IS NOT NULL        THEN 'replied'
      WHEN EXISTS(SELECT 1 FROM campaign_stages s WHERE s.contact_id = ct.id AND s.status='sent') THEN 'valid'
      ELSE 'pending'
    END AS status,
    CASE
      WHEN sup.reason = 'bounce'            THEN sup.created_at
      WHEN ct.unsubscribed_at IS NOT NULL   THEN ct.unsubscribed_at
      WHEN ct.replied_at IS NOT NULL        THEN ct.replied_at
      ELSE (SELECT MAX(s.sent_at) FROM campaign_stages s WHERE s.contact_id = ct.id AND s.status='sent')
    END AS event_date
  FROM contacts ct
  JOIN campaigns cm ON cm.id = ct.campaign_id
  LEFT JOIN smtp_accounts sa ON sa.id = ct.smtp_account_id
  LEFT JOIN suppressions sup ON lower(sup.email) = lower(ct.email)
`;

export interface RecipientRow {
  contact_id: number;
  email: string;
  name: string | null;
  campaign: string | null;
  country: string | null;
  sender: string | null;
  status: "valid" | "bounced" | "unsubscribed" | "replied" | "pending";
  event_date: string | null;
}

export async function recipientRecords(status?: string, limit = 1000): Promise<RecipientRow[]> {
  const c = await db();
  const where = status ? "WHERE status = ?" : "";
  const res = await c.execute({
    sql: `SELECT * FROM (${RECIPIENT_INNER}) ${where}
          ORDER BY (event_date IS NULL), event_date DESC, contact_id DESC
          LIMIT ?`,
    args: status ? [status, limit] : [limit],
  });
  return rows<RecipientRow>(res);
}

export async function recipientStatusCounts(): Promise<Record<string, number>> {
  const c = await db();
  const res = await c.execute(
    `SELECT status, COUNT(*) AS n FROM (${RECIPIENT_INNER}) GROUP BY status`
  );
  const out: Record<string, number> = {};
  let total = 0;
  for (const r of rows<{ status: string; n: number }>(res)) {
    out[r.status] = r.n;
    total += r.n;
  }
  out.all = total;
  return out;
}

export interface SenderHealthRow {
  sender: string;
  sent: number;
  failed: number;
}

export async function senderHealth(): Promise<SenderHealthRow[]> {
  const c = await db();
  const res = await c.execute(
    `SELECT smtp_used AS sender,
        SUM(CASE WHEN status='sent'   THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
     FROM email_logs WHERE smtp_used IS NOT NULL
     GROUP BY smtp_used ORDER BY sent DESC`
  );
  return rows<SenderHealthRow>(res);
}

export interface ContactReportRow {
  contact_id: number;
  email: string;
  name: string | null;
  coupon: string | null;
  unsubscribed_at: string | null;
  replied_at: string | null;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  opens_count: number;
  clicks_count: number;
  bounced: boolean;
  unsubscribed: boolean;
  replied: boolean;
  clicked_links: string[];
  clicked_gt_2: boolean;
  clicked_gt_3: boolean;
  clicked_gt_5: boolean;
  touches: Record<number, { status: string; sent_at: string | null; last_error: string | null }>;
}

export interface CampaignReport {
  campaign: Campaign;
  contacts: ContactReportRow[];
}

export async function getCampaignReport(campaignId: number): Promise<CampaignReport | undefined> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return undefined;

  const c = await db();
  
  // 1. Fetch all contacts in campaign
  const ctRes = await c.execute({
    sql: "SELECT id, email, name, unsubscribed_at, replied_at, coupon FROM contacts WHERE campaign_id = ?",
    args: [campaignId],
  });
  const contactsList = rows<{
    id: number;
    email: string;
    name: string | null;
    coupon: string | null;
    unsubscribed_at: string | null;
    replied_at: string | null;
  }>(ctRes);

  // 2. Fetch all stages in campaign
  const stageRes = await c.execute({
    sql: "SELECT contact_id, stage, status, sent_at, last_error FROM campaign_stages WHERE campaign_id = ?",
    args: [campaignId],
  });
  const stagesList = rows<{
    contact_id: number;
    stage: number;
    status: "pending" | "sending" | "sent" | "failed" | "canceled";
    sent_at: string | null;
    last_error: string | null;
  }>(stageRes);

  // 3. Fetch all events in campaign (bot/scanner hits excluded so opens, clicks
  //    and the per-recipient clicked-link list reflect real humans only).
  const eventRes = await c.execute({
    sql: "SELECT contact_id, type, url FROM email_events WHERE campaign_id = ? AND bot = 0",
    args: [campaignId],
  });
  const eventsList = rows<{
    contact_id: number;
    type: string;
    url: string | null;
  }>(eventRes);

  // Group stages and events by contact_id for O(N) mapping
  const stagesByContact = new Map<number, typeof stagesList>();
  for (const s of stagesList) {
    if (!stagesByContact.has(s.contact_id)) {
      stagesByContact.set(s.contact_id, []);
    }
    stagesByContact.get(s.contact_id)!.push(s);
  }

  const eventsByContact = new Map<number, typeof eventsList>();
  for (const e of eventsList) {
    if (e.contact_id === null || e.contact_id === undefined) continue;
    if (!eventsByContact.has(e.contact_id)) {
      eventsByContact.set(e.contact_id, []);
    }
    eventsByContact.get(e.contact_id)!.push(e);
  }

  const contactReportRows: ContactReportRow[] = [];

  for (const ct of contactsList) {
    const cStages = stagesByContact.get(ct.id) ?? [];
    const cEvents = eventsByContact.get(ct.id) ?? [];

    let sent_count = 0;
    let failed_count = 0;
    let bounce_count = 0;
    let opens_count = 0;
    let clicks_count = 0;
    const clicked_links_set = new Set<string>();

    const touches: Record<number, { status: string; sent_at: string | null; last_error: string | null }> = {};
    for (const s of cStages) {
      touches[s.stage] = {
        status: s.status,
        sent_at: s.sent_at,
        last_error: s.last_error,
      };
      if (s.status === "sent") {
        sent_count++;
      } else if (s.status === "failed") {
        failed_count++;
      }
    }

    for (const e of cEvents) {
      if (e.type === "open") {
        opens_count++;
      } else if (e.type === "click") {
        clicks_count++;
        if (e.url) clicked_links_set.add(e.url);
      } else if (e.type === "bounce") {
        bounce_count++;
      }
    }

    const bounced = bounce_count > 0;
    const unsubscribed = ct.unsubscribed_at !== null;
    const replied = ct.replied_at !== null;
    
    // Delivered is sent minus bounced
    const delivered_count = Math.max(sent_count - bounce_count, 0);

    contactReportRows.push({
      contact_id: ct.id,
      email: ct.email,
      name: ct.name,
      coupon: ct.coupon,
      unsubscribed_at: ct.unsubscribed_at,
      replied_at: ct.replied_at,
      sent_count,
      failed_count,
      delivered_count,
      opens_count,
      clicks_count,
      bounced,
      unsubscribed,
      replied,
      clicked_links: Array.from(clicked_links_set),
      clicked_gt_2: clicks_count > 2,
      clicked_gt_3: clicks_count > 3,
      clicked_gt_5: clicks_count > 5,
      touches,
    });
  }

  return {
    campaign,
    contacts: contactReportRows,
  };
}
