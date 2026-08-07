import { NextRequest, NextResponse } from "next/server";
import {
  deleteTemplate,
  listTemplates,
  renameTemplate,
  saveTemplate,
} from "@/lib/customTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The saved custom-mail template library.
//   GET                       — every saved template, most recently used first
//   POST {name,subject,body}  — save a draft without sending it
//   POST {id,name}            — rename
//   DELETE ?id=               — remove
export async function GET() {
  return NextResponse.json({ templates: await listTemplates() });
}

export async function POST(req: NextRequest) {
  let body: { id?: number; name?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.id) {
      if (!body.name?.trim()) {
        return NextResponse.json({ error: "A name is required." }, { status: 400 });
      }
      await renameTemplate(Number(body.id), body.name);
      return NextResponse.json({ ok: true, id: Number(body.id) });
    }

    const subject = String(body.subject ?? "").trim();
    const html = String(body.body ?? "").trim();
    if (!subject) return NextResponse.json({ error: "A subject is required." }, { status: 400 });
    if (!html) return NextResponse.json({ error: "Paste the email HTML first." }, { status: 400 });

    // used:false — saving a draft isn't a send, so it doesn't count as usage.
    const id = await saveTemplate({
      name: String(body.name ?? "").trim(),
      subject,
      body: html,
      used: false,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save the template." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  await deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
