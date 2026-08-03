import { ImapFlow } from "imapflow";
import type { Db } from "./db";
import { db } from "./db";
import { markReplied, processBounce } from "./events";

// ---------------------------------------------------------------------------
// Mailbox polling. Connects to each sender mailbox over IMAP and looks at recent
// messages:
//   • REPLIES  — matched to the contact either by the thread token we stamp into
//     every outgoing Message-ID (survives people replying from a different
//     address / alias) or, failing that, by the From address.
//   • BOUNCES  — a delivery-failure notice (Mailer-Daemon / "Undelivered…") ->
//     parse the failed recipient out of the report and suppress it so the next
//     follow-up skips that address.
//
// AUTO-REPLIES (out-of-office, vacation, "we received your mail" robots) are
// deliberately NOT counted: they're machine mail, and treating them as a human
// reply both inflates the reply rate and silently kills that contact's
// follow-ups.
//
// Every run is written to `reply_polls` so the dashboard can show when the poll
// last ran, what it found, and the exact error if a mailbox refused to connect.
// Best-effort: a mailbox that won't connect is recorded and skipped.
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
  autoReplies: number;
  folders: string[];
  errors: string[];
}

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
const EMAIL_RE_G = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

// The token we stamp into every outgoing Message-ID (see lib/sendCore.ts):
//   <c{campaign}.k{contact}.s{stage}.{rand}@domain>
// A reply quotes it back in In-Reply-To / References, which is how we match a
// reply to the exact contact even when they answer from another address.
const THREAD_RE = /c(\d+)\.k(\d+)\.s(\d+)\./;

/** How far back to look on the first ever poll for a mailbox. */
const FIRST_POLL_DAYS = Number(process.env.IMAP_LOOKBACK_DAYS ?? 3);

/** Does this message look like a delivery-failure notice? */
function looksLikeBounce(from: string, name: string, subject: string): boolean {
  const who = `${from} ${name}`.toLowerCase();
  if (/mailer.?daemon|postmaster|mail delivery|delivery (subsystem|status)/.test(who)) return true;
  return /undeliver|delivery (status|failure|notification)|failure notice|returned mail|mail delivery (failed|system)|could not be delivered|delivery has failed|not delivered/i.test(
    subject || ""
  );
}

/**
 * Machine-generated auto-response (out-of-office / autoresponder)? RFC 3834
 * headers first, then the usual subject wording as a fallback.
 */
export function looksAutomated(headers: string, subject: string): boolean {
  const h = headers.toLowerCase();
  if (/^auto-submitted:\s*(?!no)/m.test(h)) return true;
  if (/^x-auto(reply|respond|-response-suppress)/m.test(h)) return true;
  if (/^precedence:\s*(bulk|auto_reply|junk)/m.test(h)) return true;
  return /out of (the )?office|auto(matic)?[- ]?(reply|response|responder)|away from (my|the) (desk|office)|on (annual |maternity |sick )?leave until|vacation (reply|response)|thank you for (your (email|message)|contacting)/i.test(
    subject || ""
  );
}

/** Pull one header's raw value out of a raw header block. */
function headerValue(raw: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n[^\\s]|$)`, "im");
  const m = raw.match(re);
  return m ? m[1].replace(/\r?\n\s+/g, " ").trim() : "";
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

/**
 * Which folders to scan. Replies routinely land in Spam/Junk on Hostinger, and
 * some users file them straight out of the inbox, so we scan the inbox plus any
 * junk-ish folder unless IMAP_FOLDERS overrides the list.
 */
async function foldersToScan(client: ImapFlow): Promise<string[]> {
  const configured = (process.env.IMAP_FOLDERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length) return configured;

  const out = ["INBOX"];
  try {
    for (const box of await client.list()) {
      const path = box.path;
      if (path.toUpperCase() === "INBOX") continue;
      const junk =
        box.specialUse === "\\Junk" || /(^|[./])(junk|spam|bulk mail)$/i.test(path);
      if (junk) out.push(path);
    }
  } catch {
    /* server refused LIST — inbox only */
  }
  return out;
}

export async function pollReplies(source = "cron"): Promise<ReplyPollResult> {
  const c = await db();
  const res = await c.execute(
    "SELECT id, host, email, password, last_reply_poll FROM smtp_accounts ORDER BY id"
  );
  const accounts = res.rows as unknown as Acct[];
  // Never treat mail from one of our own boxes as a reply from a contact.
  const ownAddresses = new Set(accounts.map((a) => a.email.toLowerCase()));

  let scanned = 0;
  let replies = 0;
  let bounces = 0;
  let autoReplies = 0;
  const folders = new Set<string>();
  const errors: string[] = [];

  for (const a of accounts) {
    const since = a.last_reply_poll
      ? new Date(Date.parse(a.last_reply_poll.replace(" ", "T") + "Z") - 86400 * 1000)
      : new Date(Date.now() - FIRST_POLL_DAYS * 86400 * 1000);

    const client = new ImapFlow({
      host: imapHostFor(a.host),
      port: Number(process.env.IMAP_PORT ?? 993),
      secure: true,
      auth: { user: a.email, pass: a.password },
      logger: false,
    });

    try {
      await client.connect();
      for (const folder of await foldersToScan(client)) {
        let lock;
        try {
          lock = await client.getMailboxLock(folder);
        } catch {
          continue; // folder vanished / not selectable
        }
        folders.add(folder);
        try {
          const uids = await client.search({ since }, { uid: true });
          if (!uids || !uids.length) continue;

          for await (const msg of client.fetch(
            uids,
            { uid: true, envelope: true, headers: true },
            { uid: true }
          )) {
            scanned++;
            const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim() ?? "";
            const fname = msg.envelope?.from?.[0]?.name ?? "";
            const subject = msg.envelope?.subject ?? "";
            const rawHeaders = msg.headers ? msg.headers.toString("utf8") : "";

            if (looksLikeBounce(from, fname, subject)) {
              let src = rawHeaders;
              try {
                const full = await client.fetchOne(String(msg.uid), { source: true }, { uid: true });
                if (full && full.source) src = full.source.toString("utf8");
              } catch {
                /* couldn't fetch body — fall back to headers */
              }
              for (const email of await bounceTargets(c, src)) {
                if (await processBounce(email)) bounces++;
              }
              continue;
            }

            if (!from || ownAddresses.has(from)) continue;

            // Out-of-office and other robots are not engagement.
            if (looksAutomated(rawHeaders, subject)) {
              autoReplies++;
              continue;
            }

            // 1) Thread token from our Message-ID — the reliable match.
            const thread = `${headerValue(rawHeaders, "in-reply-to")} ${headerValue(
              rawHeaders,
              "references"
            )}`.match(THREAD_RE);
            let matched = false;
            if (thread) {
              const contactId = Number(thread[2]);
              const campaignId = Number(thread[1]);
              const known = await c.execute({
                sql: "SELECT id, campaign_id FROM contacts WHERE id = ? AND replied_at IS NULL",
                args: [contactId],
              });
              const row = known.rows[0] as unknown as { id: number; campaign_id: number } | undefined;
              if (row) {
                await markReplied(row.id, row.campaign_id || campaignId);
                replies++;
                matched = true;
              } else if (known.rows.length === 0) {
                // Already marked replied — nothing to do, but it was a real match.
                matched = true;
              }
            }

            // 2) Fall back to the From address across every campaign it appears in.
            if (!matched) {
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

  const result: ReplyPollResult = {
    accounts: accounts.length,
    scanned,
    replies,
    bounces,
    autoReplies,
    folders: [...folders],
    errors,
  };

  // Record the run so /deliverability can show whether polling is alive.
  try {
    await c.execute({
      sql: `INSERT INTO reply_polls (source, accounts, scanned, replies, bounces, errors)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        source,
        accounts.length,
        scanned,
        replies,
        bounces,
        errors.length ? errors.join(" | ").slice(0, 1000) : null,
      ],
    });
  } catch {
    /* logging the poll must never fail the poll */
  }

  return result;
}
