import { NextRequest, NextResponse } from "next/server";
import { stopJob } from "@/lib/jobStore";
import { Stage, STAGES } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { campaign_id?: number; stage?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const campaignId = Number(body.campaign_id);
  const stage = Number(body.stage) as Stage;
  if (!campaignId || !STAGES.includes(stage)) {
    return NextResponse.json({ error: "campaign_id and stage required." }, { status: 400 });
  }
  await stopJob(campaignId, stage);
  return NextResponse.json({ ok: true });
}
