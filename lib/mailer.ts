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

async function resetIfNewDay(acc: SmtpAccount): Promise<SmtpAccount> {
  if (acc.last_reset_date !== today()) {
    const c = await db();
    await c.execute({
      sql: "UPDATE smtp_accounts SET used_today_count = 0, last_reset_date = ? WHERE id = ?",
      args: [today(), acc.id],
    });
    acc.used_today_count = 0;
    acc.last_reset_date = today();
  }
  return acc;
}

async function bumpUsage(accountId: number): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "UPDATE smtp_accounts SET used_today_count = used_today_count + 1 WHERE id = ?",
    args: [accountId],
  });
}

export interface AccountUsage extends SmtpAccount {
  remaining: number;
}

export async function accountsWithUsage(): Promise<AccountUsage[]> {
  const c = await db();
  const res = await c.execute("SELECT * FROM smtp_accounts ORDER BY id");
  const list = res.rows as unknown as SmtpAccount[];
  const out: AccountUsage[] = [];
  for (const raw of list) {
    const acc = await resetIfNewDay(raw);
    out.push({ ...acc, remaining: Math.max(0, acc.daily_limit - acc.used_today_count) });
  }
  return out;
}

export async function getAccountById(id: number): Promise<SmtpAccount | undefined> {
  const c = await db();
  const res = await c.execute({ sql: "SELECT * FROM smtp_accounts WHERE id = ?", args: [id] });
  const acc = res.rows[0] as unknown as SmtpAccount | undefined;
  return acc ? resetIfNewDay(acc) : undefined;
}

/** First account in the pool with quota left today, or null. */
export async function pickSmtp(): Promise<SmtpAccount | null> {
  const c = await db();
  const res = await c.execute("SELECT * FROM smtp_accounts ORDER BY id");
  for (const raw of res.rows as unknown as SmtpAccount[]) {
    const acc = await resetIfNewDay(raw);
    if (acc.used_today_count < acc.daily_limit) return acc;
  }
  return null;
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
 * Send one message from a SPECIFIC account. Enforces its daily cap and bumps
 * the counter on success. Throws "ACCOUNT_EXHAUSTED" when out of quota.
 */
export async function sendWith(
  accountId: number,
  params: { to: string; subject: string; html: string }
): Promise<SendResult> {
  const acc = await getAccountById(accountId);
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
    await bumpUsage(acc.id);
    return { ok: true, smtpEmail: acc.email };
  } catch (err) {
    return {
      ok: false,
      smtpEmail: acc.email,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
