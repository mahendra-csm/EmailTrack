import { NextRequest, NextResponse } from "next/server";
import { parseContacts } from "@/lib/excel";
import { createCampaign } from "@/lib/createCampaign";
import { BatchType } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const file = form.get("file");
    const batchType = (Number(form.get("batch_type")) === 2 ? 2 : 1) as BatchType;
    const startDate = String(form.get("start_date") ?? "").trim() || undefined;
    const country = String(form.get("country") ?? "").trim() || null;

    if (!name) {
      return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "An Excel/CSV file is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contacts = parseContacts(buffer);
    if (contacts.length === 0) {
      return NextResponse.json(
        { error: "No valid email addresses found in the file." },
        { status: 400 }
      );
    }

    const result = await createCampaign({ name, contacts, batchType, startDate, country });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
