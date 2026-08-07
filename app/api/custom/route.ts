import { NextRequest, NextResponse } from "next/server";
import { mergeContacts, parseContacts, parseEmailList } from "@/lib/excel";
import { createCustomMail, normalizePacing } from "@/lib/createCustom";
import { customMails } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60; // large uploads need time to insert

// List every custom-mail send with its progress.
export async function GET() {
  return NextResponse.json({ mails: await customMails() });
}

// Create one: pasted HTML + subject + sheet + recipient limit + pacing.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const subject = String(form.get("subject") ?? "").trim();
    const html = String(form.get("html") ?? "").trim();
    const file = form.get("file");
    const country = String(form.get("country") ?? "").trim() || null;
    const limit = Number(form.get("limit"));
    const { concurrency, delayMs } = normalizePacing(
      Number(form.get("concurrency")),
      Number(form.get("delay_ms"))
    );

    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
    if (!subject) return NextResponse.json({ error: "A subject line is required." }, { status: 400 });
    if (!html) return NextResponse.json({ error: "Paste the email HTML." }, { status: 400 });
    if (!Number.isFinite(limit) || limit < 1) {
      return NextResponse.json({ error: "Set how many emails to send (limit)." }, { status: 400 });
    }

    // Recipients can be pasted straight into the box, uploaded as a sheet, or
    // both (pasted addresses win on duplicates since they carry the name typed
    // alongside them).
    const pasted = parseEmailList(String(form.get("emails") ?? ""));
    const fromFile =
      file instanceof File && file.size > 0
        ? parseContacts(Buffer.from(await file.arrayBuffer()))
        : [];
    const contacts = mergeContacts(pasted, fromFile);
    if (contacts.length === 0) {
      return NextResponse.json(
        { error: "No valid email addresses — paste some addresses or upload a sheet." },
        { status: 400 }
      );
    }

    const result = await createCustomMail({
      name,
      subject,
      html,
      contacts,
      limit,
      concurrency,
      delayMs,
      country,
      templateName: String(form.get("template_name") ?? "").trim() || null,
    });
    return NextResponse.json({ ...result, inFile: contacts.length }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create the custom mail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
