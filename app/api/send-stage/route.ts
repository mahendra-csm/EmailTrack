import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/lib/queries";
import { startStageJob } from "@/lib/jobs";
import { getAccountById, pickSmtp } from "@/lib/mailer";
import { Stage, STAGES } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { campaign_id?: number; stage?: number; smtp_account_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const campaignId = Number(body.campaign_id);
  const stage = Number(body.stage) as Stage;

  if (!campaignId || !STAGES.includes(stage)) {
    return NextResponse.json(
      { error: "campaign_id and a valid stage (1, 5, or 10) are required." },
      { status: 400 }
    );
  }
  if (!getCampaign(campaignId)) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  // Use the sender the user picked; fall back to the first account with quota.
  let smtpAccountId = Number(body.smtp_account_id);
  if (!smtpAccountId) {
    const fallback = pickSmtp();
    if (!fallback) {
      return NextResponse.json(
        { error: "No SMTP account has quota left today." },
        { status: 400 }
      );
    }
    smtpAccountId = fallback.id;
  } else if (!getAccountById(smtpAccountId)) {
    return NextResponse.json({ error: "Sender account not found." }, { status: 404 });
  }

  const job = startStageJob(campaignId, stage, smtpAccountId);
  return NextResponse.json({ job });
}
