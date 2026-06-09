import { NextRequest, NextResponse } from "next/server";
import { getCampaign, stageSummaries, stageRows, dueDate } from "@/lib/queries";
import { getJob } from "@/lib/jobStore";
import { STAGES } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const summaries = await stageSummaries(campaignId);
  const stages = await Promise.all(
    STAGES.map(async (stage) => ({
      stage,
      due: dueDate(campaign.created_at, stage),
      rows: await stageRows(campaignId, stage),
      job: await getJob(campaignId, stage),
    }))
  );

  return NextResponse.json({ campaign, summaries, stages });
}
