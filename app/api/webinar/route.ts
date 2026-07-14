import { NextRequest, NextResponse } from "next/server";
import { parseContacts } from "@/lib/excel";
import { createWebinar } from "@/lib/createWebinar";
import { getWebinarTemplate } from "@/lib/webinarTemplates";
import { listCampaigns } from "@/lib/queries";
import { isWebinar } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // large (14k+) uploads need time to insert

// List existing webinars (batch_type = 3) with their counts.
export async function GET() {
  const all = await listCampaigns();
  const webinars = all.filter((c) => isWebinar(c.batch_type));
  return NextResponse.json({ webinars });
}

// Create a webinar: name + template + uploaded sheet -> single blast.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const file = form.get("file");
    const templateId = Number(form.get("template_id"));
    const country = String(form.get("country") ?? "").trim() || null;

    if (!name) {
      return NextResponse.json({ error: "Webinar name is required." }, { status: 400 });
    }
    if (!getWebinarTemplate(templateId)) {
      return NextResponse.json({ error: "Please choose a valid template." }, { status: 400 });
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

    const result = await createWebinar({ name, contacts, templateId, country });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create webinar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
