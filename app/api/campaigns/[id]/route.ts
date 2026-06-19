import { NextRequest, NextResponse } from "next/server";
import { getCampaign, stageSummaries, stageRows, campaignDeliverability } from "@/lib/queries";
import { scheduleFor } from "@/lib/schedule";
import { touchesFor } from "@/lib/types";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Pause/resume a campaign's automatic sending (auto_send 0/1).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = Number(id);
  const campaign = await getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  let body: { auto_send?: number | boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.auto_send === undefined) {
    return NextResponse.json({ error: "auto_send is required." }, { status: 400 });
  }
  const value = body.auto_send ? 1 : 0;
  const c = await db();
  await c.execute({
    sql: "UPDATE campaigns SET auto_send = ?, status = CASE WHEN ? = 1 AND status = 'completed' THEN 'active' ELSE status END WHERE id = ?",
    args: [value, value, campaignId],
  });
  return NextResponse.json({ ok: true, auto_send: value });
}

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
