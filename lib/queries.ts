import { db } from "./db";
import {
  Campaign,
  EmailTemplate,
  Stage,
  StageSummary,
  STAGES,
  STAGE_LABELS,
} from "./types";

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

export async function stageSummaries(campaignId: number): Promise<StageSummary[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT stage,
                 SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                 SUM(CASE WHEN status = 'sent'    THEN 1 ELSE 0 END) AS sent,
                 COUNT(*) AS total
          FROM campaign_stages
          WHERE campaign_id = ?
          GROUP BY stage`,
    args: [campaignId],
  });
  const byStage = new Map(
    rows<{ stage: Stage; pending: number; sent: number; total: number }>(res).map((r) => [
      r.stage,
      r,
    ])
  );
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

// ---- Per-stage contact rows (stage tables) --------------------------------

export interface StageRow {
  stage_id: number;
  contact_id: number;
  email: string;
  name: string | null;
  status: "pending" | "sent";
  sent_at: string | null;
}

export async function stageRows(campaignId: number, stage: Stage): Promise<StageRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT s.id AS stage_id, s.contact_id, ct.email, ct.name, s.status, s.sent_at
          FROM campaign_stages s
          JOIN contacts ct ON ct.id = s.contact_id
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
  stage: Stage,
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

export async function pendingCountForStage(campaignId: number, stage: Stage): Promise<number> {
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

export async function trackingMatrix(campaignId: number): Promise<TrackingRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT
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
          ORDER BY ct.email`,
    args: [campaignId],
  });
  return rows<TrackingRow>(res);
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

// ---- Followup due dates (created_at + stage days) -------------------------

export function dueDate(createdAt: string, stageDays: number): string {
  const base = new Date(createdAt.replace(" ", "T") + "Z");
  base.setUTCDate(base.getUTCDate() + stageDays);
  return base.toISOString().slice(0, 10);
}
