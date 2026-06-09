import { db } from "./db";
import { ParsedContact } from "./excel";
import { Stage, STAGES, STAGE_LABELS } from "./types";

export interface StageTemplateInput {
  stage: Stage;
  subject: string;
  body: string;
}

/**
 * Create a campaign + contacts + 3 stage rows per contact + per-stage
 * templates. Done in two round-trips: insert the campaign (to get its id), then
 * one atomic write batch for templates, contacts, and the stage rows. Stage
 * rows are generated server-side with INSERT...SELECT so we never round-trip
 * per contact — fast even for large lists.
 */
export async function createCampaign(args: {
  name: string;
  contacts: ParsedContact[];
  templates: StageTemplateInput[];
}): Promise<{ campaignId: number; contactCount: number; stageCount: number }> {
  const c = await db();

  const campaign = await c.execute({
    sql: "INSERT INTO campaigns (name, status) VALUES (?, 'active')",
    args: [args.name],
  });
  const campaignId = Number(campaign.lastInsertRowid);

  const stmts: { sql: string; args: (string | number | null)[] }[] = [];

  for (const t of args.templates) {
    stmts.push({
      sql: "INSERT INTO email_templates (campaign_id, stage, subject, body) VALUES (?, ?, ?, ?)",
      args: [campaignId, t.stage, t.subject, t.body],
    });
  }
  for (const ct of args.contacts) {
    stmts.push({
      sql: "INSERT INTO contacts (campaign_id, email, name) VALUES (?, ?, ?)",
      args: [campaignId, ct.email, ct.name],
    });
  }
  // Generate the stage rows from the contacts we just inserted (one per stage).
  for (const stage of STAGES) {
    stmts.push({
      sql: `INSERT INTO campaign_stages (campaign_id, contact_id, stage, status, scheduled_label)
            SELECT campaign_id, id, ?, 'pending', ? FROM contacts WHERE campaign_id = ?`,
      args: [stage, STAGE_LABELS[stage], campaignId],
    });
  }

  await c.batch(stmts, "write");

  return {
    campaignId,
    contactCount: args.contacts.length,
    stageCount: args.contacts.length * STAGES.length,
  };
}
