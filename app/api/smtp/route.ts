import { NextRequest, NextResponse } from "next/server";
import { accountsWithUsage } from "@/lib/mailer";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const accounts = (await accountsWithUsage()).map((a) => ({
    id: a.id,
    email: a.email,
    daily_limit: a.daily_limit,
    used_today_count: a.used_today_count,
    hourly_limit: a.hourly_limit,
    used_hour_count: a.used_hour_count,
    daily_remaining: a.daily_remaining,
    hourly_remaining: a.hourly_remaining,
    remaining: a.remaining,
  }));
  return NextResponse.json({ accounts });
}

// Update an account's send limits (tune to your Hostinger plan, since seed env
// vars don't run on Vercel).
export async function POST(req: NextRequest) {
  let body: { id?: number; daily_limit?: number; hourly_limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const sets: string[] = [];
  const args: number[] = [];
  if (body.daily_limit != null) {
    sets.push("daily_limit = ?");
    args.push(Math.max(1, Math.floor(Number(body.daily_limit))));
  }
  if (body.hourly_limit != null) {
    sets.push("hourly_limit = ?");
    args.push(Math.max(1, Math.floor(Number(body.hourly_limit))));
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const c = await db();
  await c.execute({ sql: `UPDATE smtp_accounts SET ${sets.join(", ")} WHERE id = ?`, args: [...args, id] });
  return NextResponse.json({ ok: true });
}
