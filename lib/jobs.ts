import { getDb } from "./db";
import { pendingForStage, templatesFor } from "./queries";
import { getAccountById, renderTemplate, sendWith } from "./mailer";
import { Stage, STAGE_LABELS } from "./types";

// ---------------------------------------------------------------------------
// Lightweight in-process "worker". The send-stage API starts a job and returns
// immediately; this loop processes the batch in the background so the request
// never blocks (no timeouts, no UI freeze). Progress is written straight to
// the DB, so the dashboard reflects it by polling — no Redis/BullMQ needed.
// ---------------------------------------------------------------------------

export interface Job {
  id: string;
  campaignId: number;
  stage: Stage;
  smtpAccountId: number;
  smtpEmail: string;
  total: number;
  sent: number;
  failed: number;
  done: boolean;
  startedAt: number;
  finishedAt?: number;
  message?: string;
}

const g = globalThis as unknown as { __jobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__jobs ?? (g.__jobs = new Map());

function key(campaignId: number, stage: Stage) {
  return `c${campaignId}-s${stage}`;
}

export function activeJobFor(campaignId: number, stage: Stage): Job | undefined {
  const j = jobs.get(key(campaignId, stage));
  return j && !j.done ? j : undefined;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const markSent = (stageId: number) =>
  getDb()
    .prepare(
      "UPDATE campaign_stages SET status = 'sent', sent_at = datetime('now') WHERE id = ?"
    )
    .run(stageId);

const logSend = (row: {
  campaignId: number;
  contactId: number;
  stage: Stage;
  smtp: string | null;
  status: "sent" | "failed";
  error?: string;
}) =>
  getDb()
    .prepare(
      `INSERT INTO email_logs (campaign_id, contact_id, stage, smtp_used, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.campaignId,
      row.contactId,
      row.stage,
      row.smtp,
      row.status,
      row.error ?? null
    );

/**
 * Start sending a stage from a chosen SMTP account. Returns the job (existing
 * one if a send for this stage is already running). Safe to call from a request
 * handler — the heavy work runs detached via processStage().
 */
export function startStageJob(
  campaignId: number,
  stage: Stage,
  smtpAccountId: number
): Job {
  const existing = activeJobFor(campaignId, stage);
  if (existing) return existing;

  const account = getAccountById(smtpAccountId);
  const pending = pendingForStage(campaignId, stage);
  const job: Job = {
    id: `${key(campaignId, stage)}-${Date.now()}`,
    campaignId,
    stage,
    smtpAccountId,
    smtpEmail: account?.email ?? "(unknown)",
    total: pending.length,
    sent: 0,
    failed: 0,
    done: pending.length === 0,
    startedAt: Date.now(),
  };
  jobs.set(key(campaignId, stage), job);

  if (!account) {
    job.done = true;
    job.finishedAt = Date.now();
    job.message = "Selected sender account was not found.";
    return job;
  }
  if (pending.length === 0) {
    job.finishedAt = Date.now();
    job.message = "Nothing pending for this stage.";
    return job;
  }

  // Remember the sender on the campaign (best-effort).
  getDb()
    .prepare("UPDATE campaigns SET smtp_account_id = ? WHERE id = ?")
    .run(smtpAccountId, campaignId);

  // Fire and forget — do NOT await.
  void processStage(job, campaignId, stage, smtpAccountId);
  return job;
}

async function processStage(
  job: Job,
  campaignId: number,
  stage: Stage,
  smtpAccountId: number
) {
  const delay = Number(process.env.SEND_DELAY_MS ?? 400);
  const templates = templatesFor(campaignId);
  const tpl = templates[stage];

  if (!tpl) {
    job.done = true;
    job.finishedAt = Date.now();
    job.message = `No email template for ${STAGE_LABELS[stage]}.`;
    return;
  }

  const pending = pendingForStage(campaignId, stage);

  for (const p of pending) {
    const subject = renderTemplate(tpl.subject, { name: p.name, email: p.email });
    const html = renderTemplate(tpl.body, { name: p.name, email: p.email });

    try {
      const res = await sendWith(smtpAccountId, { to: p.email, subject, html });
      if (res.ok) {
        markSent(p.stage_id);
        logSend({
          campaignId,
          contactId: p.contact_id,
          stage,
          smtp: res.smtpEmail,
          status: "sent",
        });
        job.sent++;
      } else {
        logSend({
          campaignId,
          contactId: p.contact_id,
          stage,
          smtp: res.smtpEmail,
          status: "failed",
          error: res.error,
        });
        job.failed++;
      }
    } catch (err) {
      // ACCOUNT_EXHAUSTED or unexpected — stop, leave the rest pending.
      const message = err instanceof Error ? err.message : String(err);
      job.message =
        message === "ACCOUNT_EXHAUSTED"
          ? `${job.smtpEmail} hit its daily limit — remaining left pending. Pick another sender.`
          : message;
      break;
    }

    if (delay > 0) await sleep(delay);
  }

  job.done = true;
  job.finishedAt = Date.now();
}
