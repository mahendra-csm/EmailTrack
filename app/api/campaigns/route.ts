import { NextResponse } from "next/server";
import { listCampaigns } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ campaigns: await listCampaigns() });
}
