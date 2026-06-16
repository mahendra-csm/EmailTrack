import type { Client } from "@libsql/client";
import { getAccountById, pickSmtp, renderTemplate, sendWith } from "./mailer";
import { templatesFor } from "./queries";
import { EmailTemplate } from "./types";
import { instrumentHtml, htmlToText, unsubscribeUrl, appBaseUrl } from "./tracking";
import { unsubToken } from "./token";

// ---------------------------------------------------------------------------
// The one place an email actually gets sent. Both the automatic scheduler and
// the manual "send now" path go through sendStageRow so the rules are identical:
//
//   • SENDER PINNING — the SMTP account that sends a contact's FIRST email is
//     saved on the contact; every later touch for that contact reuses it. Big
//     lists still spread across the 5 accounts on day 1 (each capped at its
//     daily limit), and each contact's follow-ups track back to its sender.
//   • RETRY — transient failures (4xx, timeouts, connection) are retried up to
//     MAX_SEND_ATTEMPTS with a backoff; permanent ones (5xx / bad address) are
//     not.
//   • SUPPRESSION — a permanent failure (hard bounce) cancels that contact's
//     remaining touches so we never keep mailing a dead address.
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS = Math.max(1, Number(process.env.MAX_SEND_ATTEMPTS ?? 3));
export const RETRY_BACKOFF_MIN = Math.max(1, Number(process.env.RETRY_BACKOFF_MIN ?? 30));

export type Outcome = "sent" | "failed" | "retry" | "canceled" | "no_quota";

export interface ClaimRow {
  id: number;
  campaign_id: number;
  contact_id: number;
  stage: number;
}

// Rows that are due now (date reached, not in retry backoff) on a live campaign.
const DUE_WHERE = `s.status='pending' AND s.send_date <= date('now')
  AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= datetime('now'))
  AND ca.status='active' AND ca.auto_send=1`;

// A row is sendable only if the sender it MUST use has quota under BOTH the
// daily and hourly caps: the contact's pinned account if set, otherwise any
// account in the pool.
const HAS_QUOTA = "sa.used_today_count < sa.daily_limit AND sa.used_hour_count < sa.hourly_limit";
const SENDABLE = `(
  (ct.smtp_account_id IS NOT NULL AND EXISTS(
     SELECT 1 FROM smtp_accounts sa WHERE sa.id = ct.smtp_account_id AND ${HAS_QUOTA}))
  OR
  (ct.smtp_account_id IS NULL AND EXISTS(
     SELECT 1 FROM smtp_accounts sa WHERE ${HAS_QUOTA}))
)`;

export async function dueCount(c: Client): Promise<number> {
  const res = await c.execute(
    `SELECT COUNT(*) AS n FROM campaign_stages s
     JOIN campaigns ca ON ca.id = s.campaign_id WHERE ${DUE_WHERE}`
  );
  return Number((res.rows[0] as unknown as { n: number })?.n ?? 0);
}

export async function reclaimStale(c: Client): Promise<void> {
  await c.execute(
    `UPDATE campaign_stages SET status='pending', claimed_at=NULL
     WHERE status='sending' AND (claimed_at IS NULL OR claimed_at < datetime('now','-5 minutes'))`
  );
}

/** Atomically claim a cross-campaign batch of due+sendable rows. */
export async function claimDue(c: Client, maxCount: number): Promise<ClaimRow[]> {
  const res = await c.execute({
    sql: `UPDATE campaign_stages SET status='sending', claimed_at=datetime('now')
          WHERE id IN (
            SELECT s.id FROM campaign_stages s
            JOIN campaigns ca ON ca.id = s.campaign_id
            JOIN contacts ct ON ct.id = s.contact_id
            WHERE ${DUE_WHERE} AND ${SENDABLE}
            ORDER BY s.send_date, s.id
            LIMIT ?
          )
          RETURNING id, campaign_id, contact_id, stage`,
    args: [maxCount],
  });
  return res.rows as unknown as ClaimRow[];
}

/** Atomically claim a batch within one campaign+stage (manual "send now"). */
export async function claimStage(
  c: Client,
  campaignId: number,
  stage: number,
  maxCount: number
): Promise<ClaimRow[]> {
  const res = await c.execute({
    sql: `UPDATE campaign_stages SET status='sending', claimed_at=datetime('now')
          WHERE id IN (
            SELECT s.id FROM campaign_stages s
            WHERE s.campaign_id = ? AND s.stage = ? AND s.status='pending'
              AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= datetime('now'))
            ORDER BY s.id
            LIMIT ?
          )
          RETURNING id, campaign_id, contact_id, stage`,
    args: [campaignId, stage, maxCount],
  });
  return res.rows as unknown as ClaimRow[];
}

export type TemplateProvider = (campaignId: number) => Promise<Record<number, EmailTemplate>>;

/** A per-call cache so we fetch each campaign's templates once. */
export function templateCache(): TemplateProvider {
  const cache = new Map<number, Record<number, EmailTemplate>>();
  return async (id) => {
    let t = cache.get(id);
    if (!t) {
      t = await templatesFor(id);
      cache.set(id, t);
    }
    return t;
  };
}

async function log(
  c: Client,
  row: ClaimRow,
  smtp: string | null,
  status: "sent" | "failed",
  error: string | null
): Promise<void> {
  await c.execute({
    sql: `INSERT INTO email_logs (campaign_id, contact_id, stage, smtp_used, status, error_message)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [row.campaign_id, row.contact_id, row.stage, smtp, status, error],
  });
}

interface ContactRow {
  id: number;
  email: string;
  name: string | null;
  smtp_account_id: number | null;
  unsubscribed_at: string | null;
  replied_at: string | null;
}

/** Cancel this touch + the contact's remaining touches, e.g. after opt-out. */
async function cancelContactFrom(
  c: Client,
  rowId: number,
  contactId: number,
  stage: number,
  reason: string
): Promise<void> {
  await c.execute({
    sql: "UPDATE campaign_stages SET status='canceled', claimed_at=NULL, next_attempt_at=NULL, last_error=? WHERE id=?",
    args: [reason, rowId],
  });
  await c.execute({
    sql: `UPDATE campaign_stages SET status='canceled', claimed_at=NULL, next_attempt_at=NULL, last_error=?
          WHERE contact_id=? AND stage > ? AND status IN ('pending','sending')`,
    args: [reason, contactId, stage],
  });
}

/**
 * Send one already-claimed ('sending') stage row. Handles pinning, retry,
 * suppression, status + log writes. Returns what happened.
 */
export async function sendStageRow(
  c: Client,
  row: ClaimRow,
  getTemplates: TemplateProvider,
  preferredAccountId?: number
): Promise<{ outcome: Outcome; smtp?: string; error?: string }> {
  const contactRes = await c.execute({
    sql: "SELECT id, email, name, smtp_account_id, unsubscribed_at, replied_at FROM contacts WHERE id = ?",
    args: [row.contact_id],
  });
  const contact = contactRes.rows[0] as unknown as ContactRow | undefined;
  if (!contact) {
    await c.execute({
      sql: "UPDATE campaign_stages SET status='failed', claimed_at=NULL, last_error='Contact missing' WHERE id=?",
      args: [row.id],
    });
    await log(c, row, null, "failed", "Contact missing");
    return { outcome: "failed", error: "Contact missing" };
  }

  // Never mail an opted-out / replied / globally-suppressed address.
  let stopReason: string | null = null;
  if (contact.unsubscribed_at) stopReason = "Unsubscribed";
  else if (contact.replied_at) stopReason = "Replied — follow-ups stopped";
  else {
    const supp = await c.execute({
      sql: "SELECT reason FROM suppressions WHERE email = ? LIMIT 1",
      args: [contact.email],
    });
    if (supp.rows.length) {
      const reason = (supp.rows[0] as unknown as { reason: string | null }).reason;
      stopReason = `Suppressed${reason ? ` (${reason})` : ""}`;
    }
  }
  if (stopReason) {
    await cancelContactFrom(c, row.id, row.contact_id, row.stage, stopReason);
    return { outcome: "canceled", error: stopReason };
  }

  const tpl = (await getTemplates(row.campaign_id))[row.stage];
  if (!tpl) {
    await c.execute({
      sql: "UPDATE campaign_stages SET status='failed', claimed_at=NULL, last_error='No template' WHERE id=?",
      args: [row.id],
    });
    await log(c, row, null, "failed", "No template for stage");
    return { outcome: "failed", error: "No template" };
  }

  // --- Resolve the sender, honouring the pin. ---
  let account = contact.smtp_account_id
    ? await getAccountById(contact.smtp_account_id)
    : undefined;
  if (!account) {
    // Unpinned (or pinned account vanished): choose one and pin it on success.
    if (preferredAccountId) {
      const pref = await getAccountById(preferredAccountId);
      if (pref && pref.used_today_count < pref.daily_limit && pref.used_hour_count < pref.hourly_limit)
        account = pref;
    }
    if (!account) account = (await pickSmtp()) ?? undefined;
  }
  if (
    !account ||
    account.used_today_count >= account.daily_limit ||
    account.used_hour_count >= account.hourly_limit
  ) {
    // Required sender is at its daily or hourly cap — release for a later tick.
    await c.execute({
      sql: "UPDATE campaign_stages SET status='pending', claimed_at=NULL WHERE id=?",
      args: [row.id],
    });
    return { outcome: "no_quota" };
  }

  const vars = { name: contact.name, email: contact.email };
  const subject = renderTemplate(tpl.subject, vars);
  const ids = { c: row.campaign_id, k: row.contact_id, s: row.stage };
  const unsubUrl = unsubscribeUrl(unsubToken({ e: contact.email, c: row.campaign_id }));
  const rendered = renderTemplate(tpl.body, vars);
  const html = instrumentHtml(rendered, ids, unsubUrl);
  const text = htmlToText(rendered, unsubUrl);

  // List-Unsubscribe (+ one-click) — required by Gmail/Yahoo for bulk senders.
  const oneClick = appBaseUrl() && unsubUrl.startsWith("http");
  const headers: Record<string, string> = {
    "List-Unsubscribe": oneClick
      ? `<${unsubUrl}>, <mailto:${account.email}?subject=Unsubscribe>`
      : `<mailto:${account.email}?subject=Unsubscribe>`,
  };
  if (oneClick) headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";

  const res = await sendWith(account.id, { to: contact.email, subject, html, text, headers });

  if (res.ok) {
    await c.execute({
      sql: "UPDATE campaign_stages SET status='sent', sent_at=datetime('now'), attempts=attempts+1, last_error=NULL, next_attempt_at=NULL, claimed_at=NULL WHERE id=?",
      args: [row.id],
    });
    if (!contact.smtp_account_id) {
      await c.execute({
        sql: "UPDATE contacts SET smtp_account_id=? WHERE id=?",
        args: [account.id, contact.id],
      });
    }
    await log(c, row, res.smtpEmail, "sent", null);
    return { outcome: "sent", smtp: res.smtpEmail ?? undefined };
  }

  if (res.exhausted || res.notFound) {
    await c.execute({
      sql: "UPDATE campaign_stages SET status='pending', claimed_at=NULL WHERE id=?",
      args: [row.id],
    });
    return { outcome: "no_quota" };
  }

  // --- A real send error. Count the attempt and decide retry vs. fail. ---
  const errMsg = `${res.responseCode ?? ""} ${res.error ?? ""}`.trim().slice(0, 200) || "send failed";
  const attRes = await c.execute({
    sql: "UPDATE campaign_stages SET attempts=attempts+1, last_error=? WHERE id=? RETURNING attempts",
    args: [errMsg, row.id],
  });
  const attempts = Number((attRes.rows[0] as unknown as { attempts: number })?.attempts ?? 1);

  if (res.permanent) {
    await c.execute({
      sql: "UPDATE campaign_stages SET status='failed', claimed_at=NULL, next_attempt_at=NULL WHERE id=?",
      args: [row.id],
    });
    await log(c, row, res.smtpEmail, "failed", errMsg);
    // Hard bounce: stop mailing this contact — cancel its remaining touches.
    await c.execute({
      sql: `UPDATE campaign_stages SET status='canceled', claimed_at=NULL, next_attempt_at=NULL,
              last_error=?
            WHERE contact_id=? AND stage > ? AND status IN ('pending','sending')`,
      args: [`Suppressed: permanent failure on email ${row.stage}`, row.contact_id, row.stage],
    });
    return { outcome: "failed", error: errMsg };
  }

  if (attempts >= MAX_ATTEMPTS) {
    await c.execute({
      sql: "UPDATE campaign_stages SET status='failed', claimed_at=NULL, next_attempt_at=NULL WHERE id=?",
      args: [row.id],
    });
    await log(c, row, res.smtpEmail, "failed", `Gave up after ${attempts} attempts: ${errMsg}`);
    return { outcome: "failed", error: errMsg };
  }

  // Transient: requeue with a backoff so we don't hammer the server.
  await c.execute({
    sql: "UPDATE campaign_stages SET status='pending', claimed_at=NULL, next_attempt_at=datetime('now', ?) WHERE id=?",
    args: [`+${RETRY_BACKOFF_MIN} minutes`, row.id],
  });
  await log(c, row, res.smtpEmail, "failed", `Attempt ${attempts} failed (retrying): ${errMsg}`);
  return { outcome: "retry", error: errMsg };
}
