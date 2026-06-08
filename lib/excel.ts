import * as XLSX from "xlsx";

export interface ParsedContact {
  email: string;
  name: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse an uploaded .xlsx/.csv buffer into a de-duplicated contact list.
 * Column detection is forgiving: any header containing "email" / "name"
 * matches; if there are no obvious headers, the first email-looking column
 * is used.
 */
export function parseContacts(buffer: Buffer): ParsedContact[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const emailKey =
    headers.find((h) => h.toLowerCase().includes("email")) ??
    headers.find((h) => rows.some((r) => EMAIL_RE.test(String(r[h]).trim())));
  const nameKey = headers.find((h) => h.toLowerCase().includes("name"));

  const seen = new Set<string>();
  const out: ParsedContact[] = [];

  for (const r of rows) {
    const email = emailKey ? String(r[emailKey]).trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    const name = nameKey ? String(r[nameKey]).trim() : "";
    out.push({ email, name: name || null });
  }

  return out;
}
