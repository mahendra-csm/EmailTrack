import { db } from "./db";
import { Campaign, EmailTemplate, StageSummary, touchesFor } from "./types";
import { scheduleFor } from "./schedule";

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
      row = { contact_id: r.contact_id, email: r.email, name: r.name, touches: {} };
      byContact.set(r.contact_id, row);
    }
    row.touches[r.stage] = { status: r.status, sent_at: r.sent_at };
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
  failed: number;
  canceled: number;
  opens: number;
  opensUnique: number;
  clicksUnique: number;
  replies: number;
  unsubs: number;
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
    clicks_unique: number;
    replies: number;
    unsubs: number;
  }>(
    await c.execute(`SELECT
        SUM(CASE WHEN type='open'  THEN 1 ELSE 0 END) AS opens,
        COUNT(DISTINCT CASE WHEN type='open'  THEN contact_id END) AS opens_unique,
        COUNT(DISTINCT CASE WHEN type='click' THEN contact_id END) AS clicks_unique,
        SUM(CASE WHEN type='reply' THEN 1 ELSE 0 END) AS replies,
        SUM(CASE WHEN type='unsubscribe' THEN 1 ELSE 0 END) AS unsubs
      FROM email_events`)
  );
  const supp = one<{ n: number }>(await c.execute("SELECT COUNT(*) AS n FROM suppressions"));
  return {
    sent: s?.sent ?? 0,
    failed: s?.failed ?? 0,
    canceled: s?.canceled ?? 0,
    opens: e?.opens ?? 0,
    opensUnique: e?.opens_unique ?? 0,
    clicksUnique: e?.clicks_unique ?? 0,
    replies: e?.replies ?? 0,
    unsubs: e?.unsubs ?? 0,
    suppressed: supp?.n ?? 0,
  };
}

export interface CampaignDeliverability {
  id: number;
  name: string;
  status: string;
  sent: number;
  failed: number;
  opens_unique: number;
  clicks_unique: number;
  replies: number;
  unsubs: number;
}

export async function deliverabilityByCampaign(): Promise<CampaignDeliverability[]> {
  const c = await db();
  const res = await c.execute(
    `SELECT c.id, c.name, c.status,
       (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id=c.id AND s.status='sent') AS sent,
       (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id=c.id AND s.status='failed') AS failed,
       (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='open') AS opens_unique,
       (SELECT COUNT(DISTINCT e.contact_id) FROM email_events e WHERE e.campaign_id=c.id AND e.type='click') AS clicks_unique,
       (SELECT COUNT(*) FROM email_events e WHERE e.campaign_id=c.id AND e.type='reply') AS replies,
       (SELECT COUNT(*) FROM email_events e WHERE e.campaign_id=c.id AND e.type='unsubscribe') AS unsubs
     FROM campaigns c
     ORDER BY c.created_at DESC, c.id DESC`
  );
  return rows<CampaignDeliverability>(res);
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
