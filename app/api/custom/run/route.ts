import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/lib/queries";
import { runCustomBatch } from "@/lib/customRunner";
import { isCustom } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Send ONE batch of a custom mail. The Custom mail page calls this in a loop
// until `done` comes back true, so an arbitrarily long list drains without any
// single request running long enough to time out.
export async function POST(req: NextRequest) {
  let body: { campaign_id?: number; batch_size?: number; concurrency?: number; delay_ms?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const campaignId = Number(body.campaign_id);
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });
  }
  const campaign = await getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "Custom mail not found." }, { status: 404 });
  if (!isCustom(campaign.batch_type)) {
    return NextResponse.json({ error: "That campaign is not a custom mail." }, { status: 400 });
  }

  // Pacing comes from the request when given, otherwise from what was saved
  // with the campaign at creation time.
  const result = await runCustomBatch(campaignId, {
    batchSize: body.batch_size,
    concurrency: body.concurrency ?? campaign.concurrency ?? 1,
    delayMs: body.delay_ms ?? campaign.delay_ms ?? 0,
  });
  return NextResponse.json(result);
}
