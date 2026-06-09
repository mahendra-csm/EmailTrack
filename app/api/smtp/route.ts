import { NextResponse } from "next/server";
import { accountsWithUsage } from "@/lib/mailer";

export const runtime = "nodejs";

export async function GET() {
  const accounts = (await accountsWithUsage()).map((a) => ({
    id: a.id,
    email: a.email,
    daily_limit: a.daily_limit,
    used_today_count: a.used_today_count,
    remaining: a.remaining,
  }));
  return NextResponse.json({ accounts });
}
