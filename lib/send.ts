import { db } from "./db";
import { pendingCountForStage } from "./queries";
import { getAccountById } from "./mailer";
import { claimStage, sendStageRow, templateCache } from "./sendCore";

// ---------------------------------------------------------------------------
// Manual "send now" override for a single touch. Sends one small batch and
// returns; the browser loops it until done (serverless-safe). It goes through
// the SAME core as the scheduler, so sender pinning and retries still apply —
// already-pinned contacts send from their pinned account regardless of the
// sender chosen here; only first-touch (unpinned) contacts use the chosen one.
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

export async function sendStageBatch(
  campaignId: number,
  stage: number,
  accountId: number,
  batchSize = 20
): Promise<BatchResult> {
  const c = await db();
  const account = await getAccountById(accountId);
  if (!account) {
    return { sent: 0, failed: 0, remaining: 0, exhausted: false, error: "Sender account not found." };
  }

  const claimed = await claimStage(c, campaignId, stage, batchSize);
  if (claimed.length === 0) {
    const remaining = await pendingCountForStage(campaignId, stage);
    return {
      sent: 0,
      failed: 0,
      remaining,
      exhausted: false,
      message: remaining > 0 ? "Nothing sendable right now (in retry backoff?)." : "All sent.",
    };
  }

  const getTemplates = templateCache();
  let sent = 0;
  let failed = 0;
  let exhausted = false;
  let message: string | undefined;

  for (const row of claimed) {
    const o = await sendStageRow(c, row, getTemplates, accountId);
    if (o.outcome === "sent") sent++;
    else if (o.outcome === "failed" || o.outcome === "retry") failed++;
    else if (o.outcome === "no_quota") {
      exhausted = true;
      message = "A required sender is out of quota — pick another or wait for the daily reset.";
    }
  }

  const remaining = await pendingCountForStage(campaignId, stage);
  return { sent, failed, remaining, exhausted, message, smtpEmail: account.email };
}
