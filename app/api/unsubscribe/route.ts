import { NextRequest, NextResponse } from "next/server";
import { verify, UnsubToken } from "@/lib/token";
import { unsubscribeEmail } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(message: string, ok: boolean): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Unsubscribe</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f6f7f9;margin:0;padding:48px 16px;color:#2c363a;">
<div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;text-align:center;">
<div style="font-size:34px;margin-bottom:8px;">${ok ? "✅" : "⚠️"}</div>
<p style="font-size:15px;line-height:1.5;margin:0;">${message}</p>
</div></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Handles both the footer link (GET) and Gmail/Yahoo one-click POST (RFC 8058).
async function handle(req: NextRequest) {
  const p = verify<UnsubToken>(req.nextUrl.searchParams.get("t"));
  if (!p || !p.e) {
    return page("This unsubscribe link is invalid or has expired.", false);
  }
  try {
    await unsubscribeEmail(p.e, p.c ?? null);
  } catch {
    return page("Something went wrong. Please reply to the email with 'Unsubscribe'.", false);
  }
  return page(
    `You've been unsubscribed. <strong>${p.e}</strong> will no longer receive these emails.`,
    true
  );
}

export const GET = handle;
export const POST = handle;
