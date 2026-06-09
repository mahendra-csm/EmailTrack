import { db } from "./db";
import {
  pendingForStage,
  pendingCountForStage,
  templatesFor,
} from "./queries";
import { getAccountById, renderTemplate, sendWith } from "./mailer";
import { Stage } from "./types";

// ---------------------------------------------------------------------------
// Serverless-friendly sending. Instead of a background worker (which Vercel
// kills after the response), each call sends ONE small batch and returns. The
// browser calls this repeatedly until `remaining` is 0 or the sender is
// exhausted — every request stays well within the function time limit.
// ---------------------------------------------------------------------------

export interface BatchResult {
  sent: number;
  failed: number;
  remaining: number;
  exhausted: boolean;
  error?: string;
  message?: string;
  smtpEmail?: string;
}

async function markSent(stageId: number): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "UPDATE campaign_stages SET status = 'sent', sent_at = datetime('now') WHERE id = ?",
    args: [stageId],
  });
}

async function logSend(row: {
  campaignId: number;
  contactId: number;
  stage: Stage;
  smtp: string | null;
  status: "sent" | "failed";
  error?: string;
}): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO email_logs (campaign_id, contact_id, stage, smtp_used, status, error_message)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [row.campaignId, row.contactId, row.stage, row.smtp, row.status, row.error ?? null],
  });
}

async function setCampaignSender(campaignId: number, accountId: number): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "UPDATE campaigns SET smtp_account_id = ? WHERE id = ?",
    args: [accountId, campaignId],
  });
}

export async function sendStageBatch(
  campaignId: number,
  stage: Stage,
  accountId: number,
  batchSize = 20
): Promise<BatchResult> {
  const account = await getAccountById(accountId);
  if (!account) {
    return { sent: 0, failed: 0, remaining: 0, exhausted: false, error: "Sender account not found." };
  }

  const tpl = (await templatesFor(campaignId))[stage];
  if (!tpl) {
    const remaining = await pendingCountForStage(campaignId, stage);
    return { sent: 0, failed: 0, remaining, exhausted: false, message: `No email template for stage ${stage}.` };
  }

  const pending = await pendingForStage(campaignId, stage, batchSize);

  let sent = 0;
  let failed = 0;
  let exhausted = false;
  let message: string | undefined;

  for (const p of pending) {
    const fresh = await getAccountById(accountId);
    if (!fresh || fresh.used_today_count >= fresh.daily_limit) {
      exhausted = true;
      message = `${account.email} hit its daily limit — pick another sender.`;
      break;
    }

    const subject = renderTemplate(tpl.subject, { name: p.name, email: p.email });
    const html = renderTemplate(tpl.body, { name: p.name, email: p.email });
    const res = await sendWith(accountId, { to: p.email, subject, html });

    if (res.ok) {
      await markSent(p.stage_id);
      await logSend({ campaignId, contactId: p.contact_id, stage, smtp: res.smtpEmail, status: "sent" });
      sent++;
    } else {
      await logSend({
        campaignId,
        contactId: p.contact_id,
        stage,
        smtp: res.smtpEmail,
        status: "failed",
        error: res.error,
      });
      failed++;
    }
  }

  if (sent > 0) await setCampaignSender(campaignId, accountId);
  const remaining = await pendingCountForStage(campaignId, stage);

  return { sent, failed, remaining, exhausted, message, smtpEmail: account.email };
}
