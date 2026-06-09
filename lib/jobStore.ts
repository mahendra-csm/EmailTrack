import { db } from "./db";
import { Stage } from "./types";

export type JobStatus = "running" | "done" | "stopped" | "error";

export interface SendJob {
  campaign_id: number;
  stage: number;
  smtp_account_id: number;
  status: JobStatus;
  sent: number;
  failed: number;
  message: string | null;
  updated_at: string;
}

export async function startJob(
  campaignId: number,
  stage: Stage,
  smtpAccountId: number
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO send_jobs (campaign_id, stage, smtp_account_id, status, sent, failed, message, updated_at)
          VALUES (?, ?, ?, 'running', 0, 0, NULL, datetime('now'))
          ON CONFLICT(campaign_id, stage) DO UPDATE SET
            smtp_account_id = excluded.smtp_account_id,
            status = 'running', sent = 0, failed = 0, message = NULL,
            updated_at = datetime('now')`,
    args: [campaignId, stage, smtpAccountId],
  });
}

export async function bumpJob(
  campaignId: number,
  stage: Stage,
  sentDelta: number,
  failedDelta: number,
  message: string | null
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE send_jobs
          SET sent = sent + ?, failed = failed + ?, message = ?, updated_at = datetime('now')
          WHERE campaign_id = ? AND stage = ?`,
    args: [sentDelta, failedDelta, message, campaignId, stage],
  });
}

export async function finishJob(
  campaignId: number,
  stage: Stage,
  status: JobStatus,
  message: string | null
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE send_jobs SET status = ?, message = ?, updated_at = datetime('now')
          WHERE campaign_id = ? AND stage = ?`,
    args: [status, message, campaignId, stage],
  });
}

export async function stopJob(campaignId: number, stage: Stage): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE send_jobs SET status = 'stopped', updated_at = datetime('now')
          WHERE campaign_id = ? AND stage = ?`,
    args: [campaignId, stage],
  });
}

export async function getJob(
  campaignId: number,
  stage: Stage
): Promise<SendJob | null> {
  const c = await db();
  const res = await c.execute({
    sql: "SELECT * FROM send_jobs WHERE campaign_id = ? AND stage = ?",
    args: [campaignId, stage],
  });
  return (res.rows[0] as unknown as SendJob) ?? null;
}

export async function isStopped(campaignId: number, stage: Stage): Promise<boolean> {
  const job = await getJob(campaignId, stage);
  return job?.status === "stopped";
}
