import { getDb } from "./db";
import {
  Campaign,
  CampaignStage,
  Contact,
  EmailLog,
  EmailTemplate,
  Stage,
  StageSummary,
  STAGES,
  STAGE_LABELS,
} from "./types";

// ---- Campaigns ------------------------------------------------------------

export interface CampaignWithCounts extends Campaign {
  total_contacts: number;
  total_sent: number;
  total_pending: number;
}

export function listCampaigns(): CampaignWithCounts[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         c.*,
         (SELECT COUNT(*) FROM contacts ct WHERE ct.campaign_id = c.id) AS total_contacts,
         (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id = c.id AND s.status = 'sent') AS total_sent,
         (SELECT COUNT(*) FROM campaign_stages s WHERE s.campaign_id = c.id AND s.status = 'pending') AS total_pending
       FROM campaigns c
       ORDER BY c.created_at DESC, c.id DESC`
    )
    .all() as CampaignWithCounts[];
}

export function getCampaign(id: number): Campaign | undefined {
  return getDb()
    .prepare("SELECT * FROM campaigns WHERE id = ?")
    .get(id) as Campaign | undefined;
}

// ---- Stage summaries (the summary cards) ----------------------------------

export function stageSummaries(campaignId: number): StageSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT stage,
              SUM(status = 'pending') AS pending,
              SUM(status = 'sent')    AS sent,
              COUNT(*)                AS total
       FROM campaign_stages
       WHERE campaign_id = ?
       GROUP BY stage`
    )
    .all(campaignId) as {
    stage: Stage;
    pending: number;
    sent: number;
    total: number;
  }[];

  const byStage = new Map(rows.map((r) => [r.stage, r]));
  return STAGES.map((stage) => {
    const r = byStage.get(stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      pending: r?.pending ?? 0,
      sent: r?.sent ?? 0,
      total: r?.total ?? 0,
    };
  });
}

// ---- Per-stage contact rows (the stage tables) ----------------------------

export interface StageRow {
  stage_id: number;
  contact_id: number;
  email: string;
  name: string | null;
  status: "pending" | "sent";
  sent_at: string | null;
}

export function stageRows(campaignId: number, stage: Stage): StageRow[] {
  return getDb()
    .prepare(
      `SELECT s.id AS stage_id, s.contact_id, ct.email, ct.name, s.status, s.sent_at
       FROM campaign_stages s
       JOIN contacts ct ON ct.id = s.contact_id
       WHERE s.campaign_id = ? AND s.stage = ?
       ORDER BY ct.email`
    )
    .all(campaignId, stage) as StageRow[];
}

// ---- Logs -----------------------------------------------------------------

export interface LogRow extends EmailLog {
  email: string;
}

export function campaignLogs(campaignId: number, limit = 500): LogRow[] {
  return getDb()
    .prepare(
      `SELECT l.*, ct.email
       FROM email_logs l
       LEFT JOIN contacts ct ON ct.id = l.contact_id
       WHERE l.campaign_id = ?
       ORDER BY l.id DESC
       LIMIT ?`
    )
    .all(campaignId, limit) as LogRow[];
}

// ---- Templates ------------------------------------------------------------

export function templatesFor(campaignId: number): Record<number, EmailTemplate> {
  const rows = getDb()
    .prepare("SELECT * FROM email_templates WHERE campaign_id = ?")
    .all(campaignId) as EmailTemplate[];
  const out: Record<number, EmailTemplate> = {};
  for (const r of rows) out[r.stage] = r;
  return out;
}

// ---- Pending stage rows for sending --------------------------------------

export interface PendingSend {
  stage_id: number;
  contact_id: number;
  email: string;
  name: string | null;
}

export function pendingForStage(campaignId: number, stage: Stage): PendingSend[] {
  return getDb()
    .prepare(
      `SELECT s.id AS stage_id, s.contact_id, ct.email, ct.name
       FROM campaign_stages s
       JOIN contacts ct ON ct.id = s.contact_id
       WHERE s.campaign_id = ? AND s.stage = ? AND s.status = 'pending'
       ORDER BY ct.email`
    )
    .all(campaignId, stage) as PendingSend[];
}

// ---- Tracking matrix (one row per contact, all 3 stages side by side) -----

export interface TrackingRow {
  contact_id: number;
  email: string;
  name: string | null;
  s1_status: "pending" | "sent";
  s1_sent_at: string | null;
  s5_status: "pending" | "sent";
  s5_sent_at: string | null;
  s10_status: "pending" | "sent";
  s10_sent_at: string | null;
}

export function trackingMatrix(campaignId: number): TrackingRow[] {
  return getDb()
    .prepare(
      `SELECT
         ct.id AS contact_id, ct.email, ct.name,
         MAX(CASE WHEN s.stage = 1  THEN s.status  END) AS s1_status,
         MAX(CASE WHEN s.stage = 1  THEN s.sent_at END) AS s1_sent_at,
         MAX(CASE WHEN s.stage = 5  THEN s.status  END) AS s5_status,
         MAX(CASE WHEN s.stage = 5  THEN s.sent_at END) AS s5_sent_at,
         MAX(CASE WHEN s.stage = 10 THEN s.status  END) AS s10_status,
         MAX(CASE WHEN s.stage = 10 THEN s.sent_at END) AS s10_sent_at
       FROM contacts ct
       JOIN campaign_stages s ON s.contact_id = ct.id
       WHERE ct.campaign_id = ?
       GROUP BY ct.id
       ORDER BY ct.email`
    )
    .all(campaignId) as TrackingRow[];
}

// ---- Database view (every send record, across all campaigns) ---------------

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

export function databaseRecords(limit = 1000): DatabaseRow[] {
  return getDb()
    .prepare(
      `SELECT
         l.id, l.timestamp, l.campaign_id, l.stage, l.smtp_used,
         l.status, l.error_message,
         ct.email, ct.name,
         c.name AS campaign_name
       FROM email_logs l
       LEFT JOIN contacts ct  ON ct.id = l.contact_id
       LEFT JOIN campaigns c  ON c.id  = l.campaign_id
       ORDER BY l.id DESC
       LIMIT ?`
    )
    .all(limit) as DatabaseRow[];
}

export interface DatabaseStats {
  total: number;
  sent: number;
  failed: number;
}

export function databaseStats(): DatabaseStats {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(status = 'sent')   AS sent,
              SUM(status = 'failed') AS failed
       FROM email_logs`
    )
    .get() as { total: number; sent: number | null; failed: number | null };
  return { total: r.total, sent: r.sent ?? 0, failed: r.failed ?? 0 };
}

// ---- Followup due dates (created_at + stage days) -------------------------

export function dueDate(createdAt: string, stageDays: number): string {
  // createdAt is "YYYY-MM-DD HH:MM:SS" (UTC). We only need the date part.
  const base = new Date(createdAt.replace(" ", "T") + "Z");
  base.setUTCDate(base.getUTCDate() + stageDays);
  return base.toISOString().slice(0, 10);
}

export type { Contact, CampaignStage };
