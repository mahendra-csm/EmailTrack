// ---------------------------------------------------------------------------
// Two-batch, fixed-template campaign model.
//
//   Batch 1 sends on days 1, 3, 5, 7  (4 touches)
//   Batch 2 sends on days 2, 4, 6     (3 touches)
//
// Both batches share ONE library of baked-in templates (see lib/templates.ts),
// keyed by templateId. A "touch" is one scheduled send: its `seq` (1..4) is what
// we store in campaign_stages.stage, `offset` is how many days after the
// campaign's start_date it goes out, and `templateId` is which email to use.
// Because Batch 2 starts one day after Batch 1 and both step by 2 days, the two
// batches never land on the same calendar day — no sending conflicts.
// ---------------------------------------------------------------------------

export type BatchType = 1 | 2;
export const BATCH_TYPES: BatchType[] = [1, 2];

export interface TouchDef {
  seq: number; // 1..4 — stored in campaign_stages.stage
  offset: number; // days after start_date
  templateId: number; // which baked template (lib/templates.ts)
  label: string; // shown in the UI
}

export const BATCH_SCHEDULE: Record<BatchType, TouchDef[]> = {
  1: [
    { seq: 1, offset: 0, templateId: 1, label: "Email 1 · Invitation" },
    { seq: 2, offset: 2, templateId: 2, label: "Email 2 · Reminder" },
    { seq: 3, offset: 4, templateId: 3, label: "Email 3 · Early Bird" },
    { seq: 4, offset: 6, templateId: 4, label: "Email 4 · Final Call" },
  ],
  2: [
    { seq: 1, offset: 0, templateId: 1, label: "Email 1 · Invitation" },
    { seq: 2, offset: 2, templateId: 2, label: "Email 2 · Reminder" },
    { seq: 3, offset: 4, templateId: 4, label: "Email 3 · Final Call" },
  ],
};

/** Calendar days within the week each batch sends on (for display/help text). */
export const BATCH_DAYS: Record<BatchType, number[]> = { 1: [1, 3, 5, 7], 2: [2, 4, 6] };

export function touchesFor(batchType: BatchType): TouchDef[] {
  return BATCH_SCHEDULE[batchType] ?? BATCH_SCHEDULE[1];
}

export interface SmtpAccount {
  id: number;
  host: string;
  port: number;
  email: string;
  password: string;
  daily_limit: number;
  used_today_count: number;
  last_reset_date: string | null;
  hourly_limit: number;
  used_hour_count: number;
  hour_reset_at: string | null;
  in_pool: number; // 1 = part of the campaign sending pool, 0 = dedicated (e.g. committee)
}

export interface Campaign {
  id: number;
  name: string;
  created_at: string;
  smtp_account_id: number | null;
  status: "active" | "paused" | "completed";
  batch_type: BatchType;
  start_date: string | null;
  auto_send: number; // 1 = scheduler may send it, 0 = paused from auto-send
  country: string | null; // target country for this campaign (label/segmentation)
}

export type StageStatus = "pending" | "sending" | "sent" | "failed" | "canceled";

export interface Contact {
  id: number;
  campaign_id: number;
  email: string;
  name: string | null;
  smtp_account_id: number | null; // pinned sender — all touches for this contact use it
  coupon: string | null; // referral/coupon code (used by the committee feature)
}

export interface CampaignStage {
  id: number;
  campaign_id: number;
  contact_id: number;
  stage: number; // touch seq 1..4
  status: StageStatus;
  scheduled_label: string;
  send_date: string | null; // YYYY-MM-DD this touch is due
  claimed_at: string | null;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  sent_at: string | null;
}

export interface EmailLog {
  id: number;
  campaign_id: number;
  contact_id: number;
  stage: number;
  smtp_used: string | null;
  status: "sent" | "failed";
  error_message: string | null;
  timestamp: string;
}

export interface EmailTemplate {
  id: number;
  campaign_id: number;
  stage: number;
  subject: string;
  body: string;
}

export interface StageSummary {
  seq: number;
  label: string;
  send_date: string | null;
  pending: number;
  sent: number;
  failed: number;
  canceled: number;
  total: number;
}
