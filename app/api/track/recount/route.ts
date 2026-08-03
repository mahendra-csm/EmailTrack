import { NextResponse } from "next/server";
import { reclassifyHistory } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Re-run the (stricter) bot filter over events that were recorded before the
// filter was fixed, so historical open/click counts stop showing scanner and
// privacy-proxy traffic as real readers. Safe to run repeatedly — it only ever
// moves a hit from "human" to "machine", never back.
export async function POST() {
  try {
    const result = await reclassifyHistory();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Re-scan failed." },
      { status: 500 }
    );
  }
}
