import { NextResponse } from "next/server";
import { ensureCommittee, listCommittee, COMMITTEE_SENDER, COMMITTEE_SUBJECT } from "@/lib/committee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { campaignId } = await ensureCommittee();
  const members = await listCommittee(campaignId);

  const summary = {
    total: members.length,
    sent: members.filter((m) => m.status === "sent").length,
    pending: members.filter((m) => m.status === "pending" || m.status === "failed").length,
    opened: members.filter((m) => m.opens > 0).length,
    clicked: members.filter((m) => m.clicks > 0).length,
    bounced: members.filter((m) => m.bounced).length,
    replied: members.filter((m) => m.replied).length,
  };

  return NextResponse.json({
    members,
    summary,
    sender: COMMITTEE_SENDER.email,
    subject: COMMITTEE_SUBJECT,
  });
}
