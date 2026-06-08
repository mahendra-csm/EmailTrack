import nodemailer, { Transporter } from "nodemailer";
import { getDb } from "./db";
import { SmtpAccount } from "./types";

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Cache one transporter per SMTP account id so we reuse connections.
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

// Roll the daily counter over to a new day if needed, then return the account.
function resetIfNewDay(acc: SmtpAccount): SmtpAccount {
  if (acc.last_reset_date !== today()) {
    getDb()
      .prepare(
        "UPDATE smtp_accounts SET used_today_count = 0, last_reset_date = ? WHERE id = ?"
      )
      .run(today(), acc.id);
    acc.used_today_count = 0;
    acc.last_reset_date = today();
  }
  return acc;
}

/**
 * Pick the first SMTP account in the pool that still has quota left today.
 * Returns null when every account has hit its daily_limit.
 */
export function pickSmtp(): SmtpAccount | null {
  const db = getDb();
  const accounts = db
    .prepare("SELECT * FROM smtp_accounts ORDER BY id")
    .all() as SmtpAccount[];

  for (const raw of accounts) {
    const acc = resetIfNewDay(raw);
    if (acc.used_today_count < acc.daily_limit) return acc;
  }
  return null;
}

export interface AccountUsage extends SmtpAccount {
  remaining: number;
}

/** All accounts with their daily counters rolled over and remaining computed. */
export function accountsWithUsage(): AccountUsage[] {
  const accounts = getDb()
    .prepare("SELECT * FROM smtp_accounts ORDER BY id")
    .all() as SmtpAccount[];
  return accounts.map((raw) => {
    const acc = resetIfNewDay(raw);
    return { ...acc, remaining: Math.max(0, acc.daily_limit - acc.used_today_count) };
  });
}

/** Fetch one account by id with its daily counter rolled over. */
export function getAccountById(id: number): SmtpAccount | undefined {
  const acc = getDb()
    .prepare("SELECT * FROM smtp_accounts WHERE id = ?")
    .get(id) as SmtpAccount | undefined;
  return acc ? resetIfNewDay(acc) : undefined;
}

function bumpUsage(accountId: number) {
  getDb()
    .prepare(
      "UPDATE smtp_accounts SET used_today_count = used_today_count + 1 WHERE id = ?"
    )
    .run(accountId);
}

export function renderTemplate(
  tpl: string,
  vars: { name?: string | null; email: string }
): string {
  return tpl
    .replaceAll("{{name}}", vars.name?.trim() || "there")
    .replaceAll("{{email}}", vars.email);
}

export interface SendResult {
  ok: boolean;
  smtpEmail: string | null;
  error?: string;
}

/**
 * Send one message from a SPECIFIC account (the one the user picked in the UI).
 * Enforces that account's daily cap and bumps its counter on success.
 * Throws "ACCOUNT_EXHAUSTED" when the chosen account has no quota left.
 */
export async function sendWith(
  accountId: number,
  params: { to: string; subject: string; html: string }
): Promise<SendResult> {
  const acc = getAccountById(accountId);
  if (!acc) throw new Error("ACCOUNT_NOT_FOUND");
  if (acc.used_today_count >= acc.daily_limit) throw new Error("ACCOUNT_EXHAUSTED");

  const fromName = process.env.MAIL_FROM_NAME?.trim();
  const from = fromName ? `"${fromName}" <${acc.email}>` : acc.email;

  try {
    await transportFor(acc).sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    bumpUsage(acc.id);
    return { ok: true, smtpEmail: acc.email };
  } catch (err) {
    return {
      ok: false,
      smtpEmail: acc.email,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send one message. Picks an SMTP account from the pool, sends, and bumps the
 * usage counter on success. Throws "POOL_EXHAUSTED" when no quota remains.
 */
export async function sendOne(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const acc = pickSmtp();
  if (!acc) throw new Error("POOL_EXHAUSTED");

  const fromName = process.env.MAIL_FROM_NAME?.trim();
  const from = fromName ? `"${fromName}" <${acc.email}>` : acc.email;

  try {
    await transportFor(acc).sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    bumpUsage(acc.id);
    return { ok: true, smtpEmail: acc.email };
  } catch (err) {
    return {
      ok: false,
      smtpEmail: acc.email,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
