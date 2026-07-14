import { NextRequest, NextResponse } from "next/server";
import { getWebinarTemplate } from "@/lib/webinarTemplates";

export const runtime = "nodejs";

// Returns a rendered preview of a webinar template (placeholders filled with
// sample values) as an HTML document, for the picker's <iframe> preview.
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const tpl = getWebinarTemplate(id);
  if (!tpl) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  const html = tpl.html
    .replaceAll("{{name}}", "Researcher")
    .replaceAll("{{email}}", "researcher@example.com")
    .replaceAll("{{unsubscribe_url}}", "#");
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
