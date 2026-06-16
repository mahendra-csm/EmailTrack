import { ImapFlow } from "imapflow";
import { db } from "./db";
import { markReplied } from "./events";

// ---------------------------------------------------------------------------
// Reply detection. Polls each sender mailbox over IMAP for recent messages and,
// when a message's From address matches one of our contacts, marks that contact
// as replied and STOPS their remaining follow-ups (so we never keep mailing
// someone who already answered). Best-effort: a mailbox that won't connect is
// recorded in `errors` and skipped — it never blocks the others or the sender.
//
// Creds reuse the SMTP account (email + password). IMAP host defaults to the
// SMTP host with "smtp." -> "imap." (Hostinger), overridable via IMAP_HOST.
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
  errors: string[];
}

export async function pollReplies(): Promise<ReplyPollResult> {
  const c = await db();
  const res = await c.execute(
    "SELECT id, host, email, password, last_reply_poll FROM smtp_accounts ORDER BY id"
  );
  const accounts = res.rows as unknown as Acct[];
  let scanned = 0;
  let replies = 0;
  const errors: string[] = [];

  for (const a of accounts) {
    // Look back to the last successful poll, or 3 days on first run.
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
          for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
            scanned++;
            const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
            if (!from) continue;
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

  return { accounts: accounts.length, scanned, replies, errors };
}
