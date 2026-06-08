import { getDb } from "./db";
import { ParsedContact } from "./excel";
import { Stage, STAGES, STAGE_LABELS } from "./types";

export interface StageTemplateInput {
  stage: Stage;
  subject: string;
  body: string;
}

/**
 * Create a campaign + contacts + the 3 stage rows per contact + per-stage
 * templates, all in one transaction. This is the "Step 1 — Upload Excel" flow.
 */
export function createCampaign(args: {
  name: string;
  contacts: ParsedContact[];
  templates: StageTemplateInput[];
}): { campaignId: number; contactCount: number; stageCount: number } {
  const db = getDb();

  const insertCampaign = db.prepare(
    "INSERT INTO campaigns (name, status) VALUES (?, 'active')"
  );
  const insertContact = db.prepare(
    "INSERT INTO contacts (campaign_id, email, name) VALUES (?, ?, ?)"
  );
  const insertStage = db.prepare(
    `INSERT INTO campaign_stages (campaign_id, contact_id, stage, status, scheduled_label)
     VALUES (?, ?, ?, 'pending', ?)`
  );
  const insertTemplate = db.prepare(
    "INSERT INTO email_templates (campaign_id, stage, subject, body) VALUES (?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    const campaignId = Number(insertCampaign.run(args.name).lastInsertRowid);

    for (const t of args.templates) {
      insertTemplate.run(campaignId, t.stage, t.subject, t.body);
    }

    let stageCount = 0;
    for (const c of args.contacts) {
      const contactId = Number(
        insertContact.run(campaignId, c.email, c.name).lastInsertRowid
      );
      for (const stage of STAGES) {
        insertStage.run(campaignId, contactId, stage, STAGE_LABELS[stage]);
        stageCount++;
      }
    }

    return { campaignId, contactCount: args.contacts.length, stageCount };
  });

  return tx();
}
