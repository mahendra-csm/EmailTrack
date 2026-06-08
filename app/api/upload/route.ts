import { NextRequest, NextResponse } from "next/server";
import { parseContacts } from "@/lib/excel";
import { createCampaign, StageTemplateInput } from "@/lib/createCampaign";
import { Stage, STAGES } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_SUBJECT: Record<Stage, string> = {
  1: "Quick hello, {{name}}",
  5: "Following up, {{name}}",
  10: "One last note, {{name}}",
};

const DEFAULT_BODY: Record<Stage, string> = {
  1: "<p>Hi {{name}},</p><p>Reaching out for the first time...</p>",
  5: "<p>Hi {{name}},</p><p>Just following up on my earlier note...</p>",
  10: "<p>Hi {{name}},</p><p>Last time I'll reach out — let me know if helpful.</p>",
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const file = form.get("file");

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

    // Templates come from the form (subject_1, body_1, ...) with sensible defaults.
    const templates: StageTemplateInput[] = STAGES.map((stage) => ({
      stage,
      subject: String(form.get(`subject_${stage}`) ?? "").trim() || DEFAULT_SUBJECT[stage],
      body: String(form.get(`body_${stage}`) ?? "").trim() || DEFAULT_BODY[stage],
    }));

    const result = createCampaign({ name, contacts, templates });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
