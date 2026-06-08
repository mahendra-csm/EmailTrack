export type Stage = 1 | 5 | 10;

export const STAGES: Stage[] = [1, 5, 10];

export const STAGE_LABELS: Record<Stage, string> = {
  1: "Day 1",
  5: "Day 5",
  10: "Day 10",
};

export interface SmtpAccount {
  id: number;
  host: string;
  port: number;
  email: string;
  password: string;
  daily_limit: number;
  used_today_count: number;
  last_reset_date: string | null;
}

export interface Campaign {
  id: number;
  name: string;
  created_at: string;
  smtp_account_id: number | null;
  status: "active" | "paused" | "completed";
}

export interface Contact {
  id: number;
  campaign_id: number;
  email: string;
  name: string | null;
}

export interface CampaignStage {
  id: number;
  campaign_id: number;
  contact_id: number;
  stage: Stage;
  status: "pending" | "sent";
  scheduled_label: string;
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
  stage: Stage;
  label: string;
  pending: number;
  sent: number;
  total: number;
}
