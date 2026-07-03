import { NextRequest, NextResponse } from "next/server";
import { getCampaignReport } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (isNaN(campaignId)) {
    return NextResponse.json({ error: "Invalid Campaign ID." }, { status: 400 });
  }

  const report = await getCampaignReport(campaignId);
  if (!report) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json(report);
}
