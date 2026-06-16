import { NextRequest, NextResponse } from "next/server";
import { getCampaign, requeueFailed } from "@/lib/queries";

export const runtime = "nodejs";

// Re-queue this campaign's failed sends (optionally one stage) so the scheduler
// retries them. Suppressed (canceled) rows are not touched.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!(await getCampaign(campaignId))) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  let stage: number | undefined;
  try {
    const body = await req.json();
    if (body?.stage) stage = Number(body.stage);
  } catch {
    // no body = retry all stages
  }
  const requeued = await requeueFailed(campaignId, stage);
  return NextResponse.json({ requeued });
}
