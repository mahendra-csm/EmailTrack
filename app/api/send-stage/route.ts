import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/lib/queries";
import { sendStageBatch } from "@/lib/send";
import { getAccountById, pickSmtp } from "@/lib/mailer";
import { Stage, STAGES } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // allow a batch up to 60s on Vercel

export async function POST(req: NextRequest) {
  let body: {
    campaign_id?: number;
    stage?: number;
    smtp_account_id?: number;
    batch_size?: number;
  };
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
  if (!(await getCampaign(campaignId))) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  // Chosen sender, or fall back to the first account with quota.
  let smtpAccountId = Number(body.smtp_account_id);
  if (!smtpAccountId) {
    const fallback = await pickSmtp();
    if (!fallback) {
      return NextResponse.json({ error: "No SMTP account has quota left today." }, { status: 400 });
    }
    smtpAccountId = fallback.id;
  } else if (!(await getAccountById(smtpAccountId))) {
    return NextResponse.json({ error: "Sender account not found." }, { status: 404 });
  }

  const batchSize = Math.min(Math.max(Number(body.batch_size) || 20, 1), 50);
  const result = await sendStageBatch(campaignId, stage, smtpAccountId, batchSize);
  return NextResponse.json(result);
}
