import nodemailer, { Transporter } from "nodemailer";
import { db } from "./db";
import { SmtpAccount } from "./types";

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Cache one transporter per SMTP account id.
const transports = new Map<number, Transporter>();

function transportFor(acc: SmtpAccount): Transporter {
  let t = transports.get(acc.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: acc.host,
      port: acc.port,
      secure: acc.port === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user: acc.email, pass: acc.password },
    });
    transports.set(acc.id, t);
  }
  return t;
}

/**
 * Reset the daily and hourly windows if they've rolled over. Daily resets at the
 * UTC date change; hourly resets once an hour has elapsed since hour_reset_at.
 * The hourly cap is what keeps a single Hostinger mailbox from bursting and
 * getting auto-disabled.
 */
async function resetWindows(acc: SmtpAccount): Promise<SmtpAccount> {
  const c = await db();
  if (acc.last_reset_date !== today()) {
    await c.execute({
      sql: "UPDATE smtp_accounts SET used_today_count = 0, last_reset_date = ? WHERE id = ?",
      args: [today(), acc.id],
    });
    acc.used_today_count = 0;
    acc.last_reset_date = today();
  }
  const hourMs = 60 * 60 * 1000;
  const lastHour = acc.hour_reset_at ? Date.parse(acc.hour_reset_at.replace(" ", "T") + "Z") : 0;
  if (!lastHour || Date.now() - lastHour >= hourMs) {
    await c.execute({
      sql: "UPDATE smtp_accounts SET used_hour_count = 0, hour_reset_at = datetime('now') WHERE id = ?",
      args: [acc.id],
    });
    acc.used_hour_count = 0;
    acc.hour_reset_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  return acc;
}

function hasQuota(acc: SmtpAccount): boolean {
  return acc.used_today_count < acc.daily_limit && acc.used_hour_count < acc.hourly_limit;
}

async function bumpUsage(accountId: number): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "UPDATE smtp_accounts SET used_today_count = used_today_count + 1, used_hour_count = used_hour_count + 1 WHERE id = ?",
    args: [accountId],
  });
}

export interface AccountUsage extends SmtpAccount {
  remaining: number; // the binding cap right now (min of daily/hourly remaining)
  daily_remaining: number;
  hourly_remaining: number;
}

export async function accountsWithUsage(): Promise<AccountUsage[]> {
  const c = await db();
  const res = await c.execute("SELECT * FROM smtp_accounts ORDER BY id");
  const list = res.rows as unknown as SmtpAccount[];
  const out: AccountUsage[] = [];
  for (const raw of list) {
    const acc = await resetWindows(raw);
    const dailyRem = Math.max(0, acc.daily_limit - acc.used_today_count);
    const hourlyRem = Math.max(0, acc.hourly_limit - acc.used_hour_count);
    out.push({
      ...acc,
      daily_remaining: dailyRem,
      hourly_remaining: hourlyRem,
      remaining: Math.min(dailyRem, hourlyRem),
    });
  }
  return out;
}

export async function getAccountById(id: number): Promise<SmtpAccount | undefined> {
  const c = await db();
  const res = await c.execute({ sql: "SELECT * FROM smtp_accounts WHERE id = ?", args: [id] });
  const acc = res.rows[0] as unknown as SmtpAccount | undefined;
  return acc ? resetWindows(acc) : undefined;
}

/**
 * Pick a sender for a NEW (unpinned) contact: the account with the most hourly
 * headroom that's still under both caps. Choosing the least-loaded box spreads
 * volume evenly across the pool (round-robin) so no single mailbox bursts.
 */
export async function pickSmtp(): Promise<SmtpAccount | null> {
  const c = await db();
  const res = await c.execute("SELECT * FROM smtp_accounts WHERE in_pool = 1");
  const eligible: SmtpAccount[] = [];
  for (const raw of res.rows as unknown as SmtpAccount[]) {
    const acc = await resetWindows(raw);
    if (hasQuota(acc)) eligible.push(acc);
  }
  if (eligible.length === 0) return null;
  eligible.sort(
    (a, b) =>
      a.used_hour_count - b.used_hour_count ||
      a.used_today_count - b.used_today_count ||
      a.id - b.id
  );
  return eligible[0];
}

export function renderTemplate(
  tpl: string,
  vars: { name?: string | null; email: string; coupon?: string | null }
): string {
  return tpl
    .replaceAll("{{name}}", vars.name?.trim() || "there")
    .replaceAll("{{email}}", vars.email)
    .replaceAll("{{coupon}}", vars.coupon?.trim() || "");
}

export interface SendResult {
  ok: boolean;
  smtpEmail: string | null;
  error?: string;
  code?: string; // nodemailer transport error code (e.g. ECONNECTION)
  responseCode?: number; // SMTP reply code (e.g. 550)
  permanent?: boolean; // true => don't retry (hard bounce / bad message)
  exhausted?: boolean; // account is out of daily quota
  notFound?: boolean; // account id no longer exists
}

// Decide whether a send error is worth retrying. 5xx + bad-envelope/message =
// permanent (hard bounce). 4xx, connection, timeout, DNS = transient (retry).
function classify(err: unknown): { permanent: boolean; code?: string; responseCode?: number } {
  const e = err as { code?: string; responseCode?: number };
  const code = e?.code;
  const rc = typeof e?.responseCode === "number" ? e.responseCode : undefined;

  if (rc !== undefined) {
    if (rc >= 500) return { permanent: true, code, responseCode: rc };
    if (rc >= 400) return { permanent: false, code, responseCode: rc }; // greylist / rate limit
  }
  const TRANSIENT = ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNRESET", "EDNS", "EAI_AGAIN"];
  if (code && TRANSIENT.includes(code)) return { permanent: false, code };
  // EENVELOPE (bad address) / EMESSAGE (bad content) won't succeed on retry.
  if (code === "EENVELOPE" || code === "EMESSAGE") return { permanent: true, code };
  // Unknown: treat as transient so a couple of retries can recover it.
  return { permanent: false, code, responseCode: rc };
}

/**
 * Send one message from a SPECIFIC account. Enforces its daily cap and bumps the
 * counter on success. Never throws — failures come back as a classified result.
 */
export async function sendWith(
  accountId: number,
  params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  }
): Promise<SendResult> {
  const acc = await getAccountById(accountId);
  if (!acc) return { ok: false, smtpEmail: null, error: "ACCOUNT_NOT_FOUND", notFound: true };
  if (acc.used_today_count >= acc.daily_limit || acc.used_hour_count >= acc.hourly_limit) {
    return { ok: false, smtpEmail: acc.email, error: "ACCOUNT_EXHAUSTED", exhausted: true };
  }

  const fromName = process.env.MAIL_FROM_NAME?.trim();
  const from = fromName ? `"${fromName}" <${acc.email}>` : acc.email;

  try {
    await transportFor(acc).sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      headers: params.headers,
    });
    await bumpUsage(acc.id);
    return { ok: true, smtpEmail: acc.email };
  } catch (err) {
    const c = classify(err);
    return {
      ok: false,
      smtpEmail: acc.email,
      error: err instanceof Error ? err.message : String(err),
      code: c.code,
      responseCode: c.responseCode,
      permanent: c.permanent,
    };
  }
}
