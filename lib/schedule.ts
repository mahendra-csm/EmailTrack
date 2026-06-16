import { BatchType, touchesFor } from "./types";

// ---------------------------------------------------------------------------
// Pure date helpers for the batch schedule. Everything is a YYYY-MM-DD string
// in UTC so it matches SQLite's date('now') and is timezone-stable.
// ---------------------------------------------------------------------------

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ScheduledTouch {
  seq: number;
  templateId: number;
  label: string;
  send_date: string;
}

/** The concrete send dates for a batch starting on `startDate`. */
export function scheduleFor(startDate: string, batchType: BatchType): ScheduledTouch[] {
  return touchesFor(batchType).map((t) => ({
    seq: t.seq,
    templateId: t.templateId,
    label: t.label,
    send_date: addDays(startDate, t.offset),
  }));
}
