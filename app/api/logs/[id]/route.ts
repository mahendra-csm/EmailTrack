import { NextRequest, NextResponse } from "next/server";
import { campaignLogs } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({ logs: campaignLogs(Number(id)) });
}
