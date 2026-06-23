import { ImapFlow } from "imapflow";
import type { Db } from "./db";
import { db } from "./db";
import { markReplied, processBounce } from "./events";

// ---------------------------------------------------------------------------
// Mailbox polling. Connects to each sender mailbox over IMAP and looks at recent
// messages:
//   • REPLIES  — From matches one of our contacts -> mark replied, stop their
//     follow-ups.
//   • BOUNCES  — a delivery-failure notice (Mailer-Daemon / "Undelivered…") ->
//     parse the failed recipient out of the report and suppress it so the next
//     follow-up skips that address.
// Best-effort: a mailbox that won't connect is recorded in `errors` and skipped.
// Creds reuse the SMTP account; IMAP host defaults to the SMTP host with
// "smtp."->"imap." (Hostinger), overridable via IMAP_HOST.
// ---------------------------------------------------------------------------

function imapHostFor(smtpHost: string): string {
  return process.env.IMAP_HOST || smtpHost.replace(/^smtp\./i, "imap.");
}

interface Acct {
  id: number;
  host: string;
  email: string;
  password: string;
  last_reply_poll: string | null;
}

export interface ReplyPollResult {
  accounts: number;
  scanned: number;
  replies: number;
  bounces: number;
  errors: string[];
}

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
const EMAIL_RE_G = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

/** Does this message look like a delivery-failure notice? */
function looksLikeBounce(from: string, name: string, subject: string): boolean {
  const who = `${from} ${name}`.toLowerCase();
  if (/mailer.?daemon|postmaster|mail delivery|delivery (subsystem|status)/.test(who)) return true;
  return /undeliver|delivery (status|failure|notification)|failure notice|returned mail|mail delivery (failed|system)|could not be delivered|delivery has failed|not delivered/i.test(
    subject || ""
  );
}

/** Pull the failed recipient(s) out of a bounce, keeping only real contacts. */
export async function bounceTargets(c: Db, source: string): Promise<string[]> {
  const found = new Set<string>();
  const add = (s?: string) => {
    const m = s?.match(EMAIL_RE);
    if (m) found.add(m[0].toLowerCase());
  };
  for (const re of [
    /Final-Recipient:\s*rfc822;\s*([^\r\n]+)/gi,
    /Original-Recipient:\s*rfc822;\s*([^\r\n]+)/gi,
    /X-Failed-Recipients:\s*([^\r\n]+)/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) add(m[1]);
  }
  // Fallback: any address in the report that we actually mailed.
  let candidates = [...found];
  if (candidates.length === 0) {
    candidates = [...new Set((source.match(EMAIL_RE_G) || []).map((s) => s.toLowerCase()))].slice(0, 30);
  }
  if (candidates.length === 0) return [];
  const res = await c.execute({
    sql: `SELECT DISTINCT lower(email) AS e FROM contacts WHERE lower(email) IN (${candidates
      .map(() => "?")
      .join(",")})`,
    args: candidates,
  });
  return (res.rows as unknown as { e: string }[]).map((r) => r.e);
}

export async function pollReplies(): Promise<ReplyPollResult> {
  const c = await db();
  const res = await c.execute(
    "SELECT id, host, email, password, last_reply_poll FROM smtp_accounts ORDER BY id"
  );
  const accounts = res.rows as unknown as Acct[];
  let scanned = 0;
  let replies = 0;
  let bounces = 0;
  const errors: string[] = [];

  for (const a of accounts) {
    const since = a.last_reply_poll
      ? new Date(a.last_reply_poll)
      : new Date(Date.now() - 3 * 86400 * 1000);

    const client = new ImapFlow({
      host: imapHostFor(a.host),
      port: 993,
      secure: true,
      auth: { user: a.email, pass: a.password },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search({ since }, { uid: true });
        if (uids && uids.length) {
          for await (const msg of client.fetch(uids, { uid: true, envelope: true })) {
            scanned++;
            const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim() ?? "";
            const fname = msg.envelope?.from?.[0]?.name ?? "";
            const subject = msg.envelope?.subject ?? "";

            if (looksLikeBounce(from, fname, subject)) {
              let src = "";
              try {
                const full = await client.fetchOne(String(msg.uid), { source: true }, { uid: true });
                src = full && full.source ? full.source.toString("utf8") : "";
              } catch {
                /* couldn't fetch body — skip */
              }
              for (const email of await bounceTargets(c, src)) {
                if (await processBounce(email)) bounces++;
              }
            } else if (from) {
              const ct = await c.execute({
                sql: "SELECT id, campaign_id FROM contacts WHERE lower(email) = ? AND replied_at IS NULL",
                args: [from],
              });
              for (const row of ct.rows as unknown as { id: number; campaign_id: number }[]) {
                await markReplied(row.id, row.campaign_id);
                replies++;
              }
            }
          }
        }
      } finally {
        lock.release();
      }
      await c.execute({
        sql: "UPDATE smtp_accounts SET last_reply_poll = datetime('now') WHERE id = ?",
        args: [a.id],
      });
    } catch (err) {
      errors.push(`${a.email}: ${(err instanceof Error ? err.message : String(err)).slice(0, 140)}`);
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
  }

  return { accounts: accounts.length, scanned, replies, bounces, errors };
}
