import { NextRequest, NextResponse } from "next/server";
import { sendCommitteeOne } from "@/lib/committee";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { contactId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const contactId = Number(body.contactId);
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required." }, { status: 400 });
  }
  const result = await sendCommitteeOne(contactId);
  return NextResponse.json(result);
}
