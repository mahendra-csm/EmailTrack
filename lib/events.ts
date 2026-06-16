import { db } from "./db";

// ---------------------------------------------------------------------------
// Engagement events (open / click / unsubscribe / reply / bounce) and the
// global suppression list that the send path checks before every email.
// ---------------------------------------------------------------------------

export type EventType = "open" | "click" | "unsubscribe" | "reply" | "bounce" | "complaint";

export async function recordEvent(e: {
  type: EventType;
  campaignId?: number | null;
  contactId?: number | null;
  stage?: number | null;
  url?: string | null;
  meta?: string | null;
}): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO email_events (type, campaign_id, contact_id, stage, url, meta)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [e.type, e.campaignId ?? null, e.contactId ?? null, e.stage ?? null, e.url ?? null, e.meta ?? null],
  });
}

/** Add an email to the global suppression list (idempotent). */
export async function suppress(email: string, reason: string, campaignId?: number | null): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO suppressions (email, reason, campaign_id) VALUES (?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET reason=excluded.reason`,
    args: [email.toLowerCase().trim(), reason, campaignId ?? null],
  });
}

export async function isSuppressed(email: string): Promise<boolean> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT 1 FROM suppressions WHERE email = ? LIMIT 1",
    args: [email.toLowerCase().trim()],
  });
  return r.rows.length > 0;
}

/**
 * Opt an address out everywhere: suppress it, mark every matching contact
 * unsubscribed, cancel their remaining touches, and log the event.
 */
export async function unsubscribeEmail(email: string, campaignId?: number | null): Promise<void> {
  const c = await db();
  const norm = email.toLowerCase().trim();
  await suppress(norm, "unsubscribe", campaignId);
  await c.execute({
    sql: "UPDATE contacts SET unsubscribed_at = datetime('now') WHERE lower(email) = ?",
    args: [norm],
  });
  await c.execute({
    sql: `UPDATE campaign_stages SET status='canceled', claimed_at=NULL, next_attempt_at=NULL,
            last_error='Unsubscribed'
          WHERE status IN ('pending','sending')
            AND contact_id IN (SELECT id FROM contacts WHERE lower(email) = ?)`,
    args: [norm],
  });
  // Attach the event to a contact for per-campaign reporting if we can find one.
  const ct = await c.execute({
    sql: "SELECT id, campaign_id FROM contacts WHERE lower(email) = ? ORDER BY id DESC LIMIT 1",
    args: [norm],
  });
  const row = ct.rows[0] as unknown as { id: number; campaign_id: number } | undefined;
  await recordEvent({
    type: "unsubscribe",
    campaignId: campaignId ?? row?.campaign_id ?? null,
    contactId: row?.id ?? null,
  });
}

/** Mark a contact as replied and stop their remaining follow-ups. */
export async function markReplied(contactId: number, campaignId: number): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "UPDATE contacts SET replied_at = datetime('now') WHERE id = ? AND replied_at IS NULL",
    args: [contactId],
  });
  await c.execute({
    sql: `UPDATE campaign_stages SET status='canceled', claimed_at=NULL, next_attempt_at=NULL,
            last_error='Replied — follow-ups stopped'
          WHERE contact_id = ? AND status IN ('pending','sending')`,
    args: [contactId],
  });
  await recordEvent({ type: "reply", campaignId, contactId });
}
