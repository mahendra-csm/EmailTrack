import * as XLSX from "xlsx";

export interface ParsedContact {
  email: string;
  name: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a pasted address list into contacts — no file needed.
 *
 * Handles the shapes people actually paste: one per line, comma/semicolon
 * separated, `Name <email@x.com>`, `email@x.com, Name`, or a wall of addresses
 * copied out of a mail client. Anything that isn't an address is treated as the
 * name for the address on that line (when there's exactly one).
 */
export function parseEmailList(text: string): ParsedContact[] {
  const seen = new Set<string>();
  const out: ParsedContact[] = [];
  const FIND = /[^\s<>,;:"']+@[^\s<>,;:"']+\.[^\s<>,;:"']+/g;

  for (const line of text.split(/\r?\n/)) {
    const found = line.match(FIND);
    if (!found) continue;

    // With a single address on the line, whatever else is there is the name.
    let name: string | null = null;
    if (found.length === 1) {
      name =
        line
          .replace(found[0], "")
          .replace(/[<>,;"']/g, " ")
          .replace(/\s+/g, " ")
          .trim() || null;
    }

    for (const raw of found) {
      const email = raw.trim().toLowerCase().replace(/^mailto:/, "");
      if (!EMAIL_RE.test(email) || seen.has(email)) continue;
      seen.add(email);
      out.push({ email, name });
    }
  }

  return out;
}

/** Merge contact lists, keeping the first occurrence of each address. */
export function mergeContacts(...lists: ParsedContact[][]): ParsedContact[] {
  const seen = new Set<string>();
  const out: ParsedContact[] = [];
  for (const list of lists) {
    for (const c of list) {
      if (seen.has(c.email)) continue;
      seen.add(c.email);
      out.push(c);
    }
  }
  return out;
}

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
