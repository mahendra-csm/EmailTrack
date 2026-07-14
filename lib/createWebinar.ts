import { db } from "./db";
import { ParsedContact } from "./excel";
import { WEBINAR_BATCH_TYPE } from "./types";
import { getWebinarTemplate } from "./webinarTemplates";
import { today } from "./schedule";

// ---------------------------------------------------------------------------
// Create a WEBINAR: a single one-shot blast of one chosen template to the whole
// list. It's stored as a normal campaign (batch_type = WEBINAR_BATCH_TYPE) with
// exactly ONE template row (stage 1) and one campaign_stages row per contact,
// all dated today so the scheduler drains them across the SMTP pool as fast as
// the daily/hourly caps allow. Everything downstream — sending, open/click
// tracking, per-link clicks, deliverability, reports — reuses the campaign
// machinery unchanged.
// ---------------------------------------------------------------------------

export async function createWebinar(args: {
  name: string;
  contacts: ParsedContact[];
  templateId: number;
  country?: string | null;
}): Promise<{
  campaignId: number;
  contactCount: number;
  startDate: string;
}> {
  const tpl = getWebinarTemplate(args.templateId);
  if (!tpl) throw new Error(`Unknown webinar template: ${args.templateId}`);

  const c = await db();
  const startDate = today();

  const campaign = await c.execute({
    sql: `INSERT INTO campaigns (name, status, batch_type, start_date, auto_send, country)
          VALUES (?, 'active', ?, ?, 1, ?) RETURNING id`,
    args: [args.name, WEBINAR_BATCH_TYPE, startDate, args.country?.trim() || null],
  });
  const campaignId = Number((campaign.rows[0] as { id: number }).id);

  const stmts: { sql: string; args: (string | number | null)[] }[] = [];

  // The single chosen template, copied in as stage 1.
  stmts.push({
    sql: "INSERT INTO email_templates (campaign_id, stage, subject, body) VALUES (?, ?, ?, ?)",
    args: [campaignId, 1, tpl.subject, tpl.html],
  });

  // Chunked multi-row contact inserts (300 rows = 900 params) — a 14.5k upload
  // becomes ~50 statements instead of 14,500.
  const CHUNK = 300;
  for (let i = 0; i < args.contacts.length; i += CHUNK) {
    const chunk = args.contacts.slice(i, i + CHUNK);
    const values = chunk.map(() => "(?, ?, ?)").join(", ");
    const rowArgs: (string | number | null)[] = [];
    for (const ct of chunk) rowArgs.push(campaignId, ct.email, ct.name);
    stmts.push({
      sql: `INSERT INTO contacts (campaign_id, email, name) VALUES ${values}`,
      args: rowArgs,
    });
  }

  // One pending stage row per contact, due today.
  stmts.push({
    sql: `INSERT INTO campaign_stages
            (campaign_id, contact_id, stage, status, scheduled_label, send_date)
          SELECT campaign_id, id, 1, 'pending', 'Webinar blast', ? FROM contacts WHERE campaign_id = ?`,
    args: [startDate, campaignId],
  });

  await c.batch(stmts, "write");

  return { campaignId, contactCount: args.contacts.length, startDate };
}
