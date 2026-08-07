import { db } from "./db";
import { ParsedContact } from "./excel";
import { CUSTOM_BATCH_TYPE } from "./types";
import { today } from "./schedule";
import { saveTemplate } from "./customTemplates";

// ---------------------------------------------------------------------------
// Create a CUSTOM MAIL send: your own pasted HTML + subject, your own sheet,
// capped at a chosen number of recipients, sent ONCE.
//
// It is stored as an ordinary campaign (batch_type = CUSTOM_BATCH_TYPE) with a
// single template (stage 1) and one campaign_stages row per queued contact, so
// every downstream feature — logs, open/click tracking, suppression, bounce and
// reply handling, deliverability, reports — works exactly as it does for a
// normal campaign. The difference is auto_send = 0: the global cron never
// touches it, you press Send on the Custom mail page and it drains at the pace
// you chose (1–5 in flight, with a gap between each send).
// ---------------------------------------------------------------------------

export const MAX_CONCURRENCY = 5;

/** Clamp the pacing controls to something a mailbox will tolerate. */
export function normalizePacing(concurrency?: number, delayMs?: number) {
  const c = Math.min(Math.max(Math.round(Number(concurrency) || 1), 1), MAX_CONCURRENCY);
  const d = Math.min(Math.max(Math.round(Number(delayMs) || 0), 0), 60_000);
  return { concurrency: c, delayMs: d };
}

/**
 * Make sure the pasted HTML carries an unsubscribe link. Bulk mail without one
 * is a spam-filter magnet (and the List-Unsubscribe header alone isn't visible
 * to the reader), so if the body has no {{unsubscribe_url}} placeholder we
 * append a plain footer that uses it.
 */
export function withUnsubscribeFooter(html: string): string {
  if (html.includes("{{unsubscribe_url}}")) return html;
  const footer =
    `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a8a8a;text-align:center;">` +
    `You received this email because your address is on our mailing list. ` +
    `<a href="{{unsubscribe_url}}" style="color:#8a8a8a;">Unsubscribe</a>` +
    `</div>`;
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${footer}</body>`);
  return html + footer;
}

export async function createCustomMail(args: {
  name: string;
  subject: string;
  html: string;
  contacts: ParsedContact[];
  limit: number;
  concurrency: number;
  delayMs: number;
  country?: string | null;
  /** Name to file this HTML under in the template library. */
  templateName?: string | null;
}): Promise<{
  campaignId: number;
  queued: number;
  skipped: number;
  startDate: string;
  templateId: number | null;
}> {
  const c = await db();
  const startDate = today();
  const { concurrency, delayMs } = normalizePacing(args.concurrency, args.delayMs);

  // The limit is the whole point of this feature: only the first N addresses in
  // the sheet are queued, the rest are simply not created.
  const limit = Math.max(1, Math.floor(args.limit));
  const queued = args.contacts.slice(0, limit);
  const skipped = Math.max(0, args.contacts.length - queued.length);

  const campaign = await c.execute({
    sql: `INSERT INTO campaigns
            (name, status, batch_type, start_date, auto_send, country, send_limit, concurrency, delay_ms)
          VALUES (?, 'active', ?, ?, 0, ?, ?, ?, ?) RETURNING id`,
    args: [
      args.name,
      CUSTOM_BATCH_TYPE,
      startDate,
      args.country?.trim() || null,
      queued.length,
      concurrency,
      delayMs,
    ],
  });
  const campaignId = Number((campaign.rows[0] as { id: number }).id);

  const stmts: { sql: string; args: (string | number | null)[] }[] = [];

  stmts.push({
    sql: "INSERT INTO email_templates (campaign_id, stage, subject, body) VALUES (?, ?, ?, ?)",
    args: [campaignId, 1, args.subject, withUnsubscribeFooter(args.html)],
  });

  // Chunked multi-row inserts (300 rows = 900 params per statement).
  const CHUNK = 300;
  for (let i = 0; i < queued.length; i += CHUNK) {
    const chunk = queued.slice(i, i + CHUNK);
    const values = chunk.map(() => "(?, ?, ?)").join(", ");
    const rowArgs: (string | number | null)[] = [];
    for (const ct of chunk) rowArgs.push(campaignId, ct.email, ct.name);
    stmts.push({
      sql: `INSERT INTO contacts (campaign_id, email, name) VALUES ${values}`,
      args: rowArgs,
    });
  }

  stmts.push({
    sql: `INSERT INTO campaign_stages
            (campaign_id, contact_id, stage, status, scheduled_label, send_date)
          SELECT campaign_id, id, 1, 'pending', 'Custom mail', ? FROM contacts WHERE campaign_id = ?`,
    args: [startDate, campaignId],
  });

  await c.batch(stmts, "write");

  // File the HTML in the template library so the next send can just pick it.
  // Never let a library failure break an otherwise-good send.
  let templateId: number | null = null;
  try {
    templateId = await saveTemplate({
      name: args.templateName?.trim() || args.name,
      subject: args.subject,
      body: args.html,
    });
  } catch {
    /* template library is a convenience, not part of the send */
  }

  return { campaignId, queued: queued.length, skipped, startDate, templateId };
}
