import { NextRequest, NextResponse } from "next/server";
import { getCampaign, stageSummaries, stageRows, dueDate } from "@/lib/queries";
import { activeJobFor } from "@/lib/jobs";
import { STAGES } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  const campaign = getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const summaries = stageSummaries(campaignId);
  const stages = STAGES.map((stage) => ({
    stage,
    due: dueDate(campaign.created_at, stage),
    rows: stageRows(campaignId, stage),
    job: activeJobFor(campaignId, stage) ?? null,
  }));

  return NextResponse.json({ campaign, summaries, stages });
}
