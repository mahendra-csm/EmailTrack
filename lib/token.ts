import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Tiny signed-token helper for unsubscribe + open/click links. We don't store a
// token per send; instead we sign a small payload (campaign/contact/stage, or an
// email) with HMAC so the public endpoints can trust it without a DB lookup and
// nobody can forge an unsubscribe/open for someone else.
// ---------------------------------------------------------------------------

const SECRET =
  process.env.TRACK_SECRET || process.env.CRON_SECRET || "dev-insecure-secret-change-me";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function sign(payload: object): string {
  const data = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(data).digest()).slice(0, 22);
  return `${data}.${sig}`;
}

export function verify<T = Record<string, unknown>>(token: string | null | undefined): T | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(data).digest()).slice(0, 22);
  // constant-time compare
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(fromB64url(data).toString()) as T;
  } catch {
    return null;
  }
}

// Conventional payloads -----------------------------------------------------

export interface SendToken {
  c: number; // campaign_id
  k: number; // contact_id
  s: number; // stage
}
export interface UnsubToken {
  e: string; // email
  c?: number; // campaign_id (origin)
}

export const trackToken = (t: SendToken) => sign(t);
export const unsubToken = (t: UnsubToken) => sign(t);
