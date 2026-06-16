import { db } from "./db";
import { ParsedContact } from "./excel";
import { BatchType } from "./types";
import { TEMPLATES } from "./templates";
import { scheduleFor, today, addDays } from "./schedule";

// ---------------------------------------------------------------------------
// Create a batch campaign: contacts + one stage row per touch (with a concrete
// send_date) + a copy of the baked templates for this campaign. Templates are
// copied per-campaign (keyed by touch seq) so the existing send/log/tracking
// code keeps reading them the same way, and so editing the global library later
// never rewrites history.
// ---------------------------------------------------------------------------

/**
 * Pick a start date whose send days don't collide with any already-scheduled
 * pending send. Both batches step by 2 days, so a collision only happens when
 * two batches share a start parity — we just nudge the start forward a day at a
 * time until none of its send dates are already taken. This is what guarantees
 * "only one batch sends per day".
 */
async function resolveStartDate(desired: string, batchType: BatchType): Promise<string> {
  const c = await db();
  const res = await c.execute(
    `SELECT DISTINCT send_date FROM campaign_stages s
     JOIN campaigns ca ON ca.id = s.campaign_id
     WHERE s.status IN ('pending','sending') AND s.send_date IS NOT NULL AND ca.status = 'active'`
  );
  const busy = new Set(
    (res.rows as unknown as { send_date: string }[]).map((r) => r.send_date)
  );
  let start = desired;
  for (let i = 0; i < 90; i++) {
    const dates = scheduleFor(start, batchType).map((t) => t.send_date);
    if (!dates.some((d) => busy.has(d))) return start;
    start = addDays(start, 1);
  }
  return start;
}

export async function createCampaign(args: {
  name: string;
  contacts: ParsedContact[];
  batchType: BatchType;
  startDate?: string; // YYYY-MM-DD; defaults to today
}): Promise<{
  campaignId: number;
  contactCount: number;
  stageCount: number;
  startDate: string;
  sendDates: string[];
}> {
  const c = await db();

  const desired = args.startDate?.trim() || today();
  const startDate = await resolveStartDate(desired, args.batchType);
  const schedule = scheduleFor(startDate, args.batchType);

  const campaign = await c.execute({
    sql: `INSERT INTO campaigns (name, status, batch_type, start_date, auto_send)
          VALUES (?, 'active', ?, ?, 1)`,
    args: [args.name, args.batchType, startDate],
  });
  const campaignId = Number(campaign.lastInsertRowid);

  const stmts: { sql: string; args: (string | number | null)[] }[] = [];

  // One template row per touch (copied from the baked library).
  for (const t of schedule) {
    const tpl = TEMPLATES[t.templateId];
    stmts.push({
      sql: "INSERT INTO email_templates (campaign_id, stage, subject, body) VALUES (?, ?, ?, ?)",
      args: [campaignId, t.seq, tpl.subject, tpl.html],
    });
  }
  for (const ct of args.contacts) {
    stmts.push({
      sql: "INSERT INTO contacts (campaign_id, email, name) VALUES (?, ?, ?)",
      args: [campaignId, ct.email, ct.name],
    });
  }
  // Stage rows generated from the contacts we just inserted — one per touch,
  // each carrying its concrete send_date.
  for (const t of schedule) {
    stmts.push({
      sql: `INSERT INTO campaign_stages
              (campaign_id, contact_id, stage, status, scheduled_label, send_date)
            SELECT campaign_id, id, ?, 'pending', ?, ? FROM contacts WHERE campaign_id = ?`,
      args: [t.seq, t.label, t.send_date, campaignId],
    });
  }

  await c.batch(stmts, "write");

  return {
    campaignId,
    contactCount: args.contacts.length,
    stageCount: args.contacts.length * schedule.length,
    startDate,
    sendDates: schedule.map((t) => t.send_date),
  };
}
