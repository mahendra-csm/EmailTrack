import { NextRequest, NextResponse } from "next/server";
import { getCampaign, stageSummaries, stageRows, campaignDeliverability } from "@/lib/queries";
import { scheduleFor } from "@/lib/schedule";
import { touchesFor } from "@/lib/types";

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

  const summaries = await stageSummaries(campaign);
  const sched = campaign.start_date
    ? new Map(scheduleFor(campaign.start_date, campaign.batch_type).map((t) => [t.seq, t.send_date]))
    : new Map<number, string>();

  const stages = await Promise.all(
    touchesFor(campaign.batch_type).map(async (t) => ({
      stage: t.seq,
      label: t.label,
      due: sched.get(t.seq) ?? null,
      rows: await stageRows(campaignId, t.seq),
    }))
  );

  const deliverability = await campaignDeliverability(campaignId);

  return NextResponse.json({ campaign, summaries, stages, deliverability });
}
