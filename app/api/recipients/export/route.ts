import { NextRequest, NextResponse } from "next/server";
import { recipientRecords } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Download the recipient list (optionally one status) as CSV.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const rows = await recipientRecords(status, 100000);

  const header = ["email", "name", "status", "date", "country", "sent_from", "campaign"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.email,
        r.name,
        r.status,
        r.event_date?.slice(0, 19) ?? "",
        r.country,
        r.sender,
        r.campaign,
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const filename = `recipients${status ? `-${status}` : ""}.csv`;
  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
