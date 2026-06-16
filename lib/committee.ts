import { db } from "./db";
import { sendStageRow, templateCache } from "./sendCore";

// ---------------------------------------------------------------------------
// Scientific Committee referral feature. A fixed list of committee members, a
// fixed referral template, and a dedicated sender (support@onegrasp.com). It is
// stored as a normal (auto_send=0) campaign + contacts so it reuses ALL the
// tracking / bounce / reply / deliverability machinery — but it's driven from
// its own page where each member is sent one at a time.
// ---------------------------------------------------------------------------

export interface CommitteeMember {
  email: string;
  name: string;
  code: string;
}

export const COMMITTEE_CAMPAIGN_NAME = "Scientific Committee";

export const COMMITTEE_SENDER = {
  host: "smtp.hostinger.com",
  port: 587,
  email: "support@onegrasp.com",
  password: "OneGrasp@3070",
};

export const COMMITTEE_SUBJECT =
  "Free Conference Attendance & Certificate for the First 50 Registrants!";

// Names are the coupon prefix (capitalised); edit here if you want fuller names.
export const COMMITTEE: CommitteeMember[] = [
  { email: "bosebishnu@gmail.com", name: "Bishnu", code: "bishnuOG2026" },
  { email: "manjunathpharmacology@gmail.com", name: "Manjunath", code: "manjunathOG2026" },
  { email: "subhash1948@yahoo.com", name: "Subhash", code: "subhashOG2026" },
  { email: "kbright@rediffmail.com", name: "Bright", code: "brightOG2026" },
  { email: "binduashwini@rvce.edu.in", name: "Bindu", code: "binduOG2026" },
  { email: "chintanpatel@gcet.ac.in", name: "Chintan", code: "chintanOG2026" },
  { email: "dkc.foe@gmail.com", name: "Dk", code: "dkOG2026" },
  { email: "david@davidwortley.com", name: "David", code: "davidOG2026" },
  { email: "hadierfani68@yahoo.com", name: "Hadi", code: "hadiOG2026" },
  { email: "jahanavee.ichchhaporia@utu.ac.in", name: "Jahanavee", code: "jahanaveeOG2026" },
  { email: "J.Odugbesan@uel.ac.uk", name: "Jamiu", code: "jamiuOG2026" },
  { email: "drnallabala@gmail.com", name: "Nallabala", code: "nallabalaOG2026" },
  { email: "nazrul@iub.edu.bd", name: "Nazrul", code: "nazrulOG2026" },
  { email: "rohansingh@khalsa.com", name: "Rohan", code: "rohanOG2026" },
  { email: "rudrarupgupta21@gmail.com", name: "Rudrarup", code: "rudrarupOG2026" },
  { email: "sathishamg88@gmail.com", name: "Satish", code: "satishOG2026" },
  { email: "sanjaypatel54@gmail.com", name: "Sanjay", code: "sanjayOG2026" },
  { email: "drskmishrain@yahoo.com", name: "Santosh", code: "santoshOG2026" },
  { email: "subash_ghimire@ku.edu.np", name: "Subhash", code: "subhashOG2026" },
  { email: "sudarshan.mech@sode-edu.in", name: "Sudarshan", code: "sudarshanOG2026" },
  { email: "vikram@karunya.edu", name: "Vikram", code: "vikramOG2026" },
  { email: "ahmedsaqr@mans.edu.eg", name: "Ahmed", code: "ahmedOG2026" },
  { email: "mahafawzyaly88@gmail.com", name: "Maha", code: "mahaOG2026" },
  { email: "obengsika@yahoo.com", name: "Obeng", code: "obengOG2026" },
  { email: "pradip57.prl@rediffmail.com", name: "Pradip", code: "pradipOG2026" },
  { email: "rpashtoon@hotmail.com", name: "Rahmatullah", code: "rahmatullahOG2026" },
  { email: "ganeshadhikarireal@gmail.com", name: "Ganesh", code: "ganeshOG2026" },
  { email: "nroy@georgiasouthern.edu", name: "Nalanda", code: "nalandaOG2026" },
  { email: "lmarvide@ual.es", name: "Luisa", code: "luisaOG2026" },
  { email: "f.hakimi@iav.ac.ma", name: "Fatiha", code: "fatihaOG2026" },
  { email: "nofouz@um.edu.my", name: "Nofouz", code: "nofouzOG2026" },
  { email: "juleekim119@gmail.com", name: "Ju", code: "juOG2026" },
  { email: "nilesh.charankar1@gmail.com", name: "Nilesh", code: "nileshOG2026" },
  { email: "mkhoukhi@uaeu.ac.ae", name: "Maatouk", code: "maatoukOG2026" },
  { email: "jkassu@gmail.com", name: "Kassu", code: "kassuOG2026" },
  { email: "mccolautti@gmail.com", name: "Maria", code: "mariaOG2026" },
  { email: "kotlapraneetha@gmail.com", name: "Praneetha", code: "praneethaOG2026" },
  { email: "hebaaffify@yahoo.com", name: "Heba", code: "hebaOG2026" },
  { email: "mary.dalamaga@gmail.com", name: "Mary", code: "maryOG2026" },
  { email: "mahendrabella55@gmail.com", name: "Mahendra", code: "MaheOG2026" },
];

export const COMMITTEE_HTML = `<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#000000;background:#ffffff;margin:0;padding:20px;">
<p><strong>Your OneGrasp Referral Code is Now Active</strong></p>
<p>Dear Prof. {{name}},</p>
<p>Thank you for being a valued <strong>Scientific Committee Member</strong>.</p>
<p><strong>Your Exclusive Referral Coupon Code:</strong> <strong>{{coupon}}</strong></p>
<p><strong>Registration Link:</strong> <a href="https://onegrasp.com/events/exclusive">https://onegrasp.com/events/exclusive</a></p>
<p><strong>Limited Launch Offer - First Come, First Served</strong></p>
<p>The first <strong>50 listeners</strong> across the Scientific Member Referral Program who register using any Scientific Member referral coupon code will receive:</p>
<ul>
<li><strong>Free Conference Attendance</strong></li>
<li><strong>Conference Participation Certificate</strong></li>
</ul>
<p>Only a few slots are available and will be allocated on a first-come, first-served basis.</p>
<p>After the first 50 listener registrations are filled:</p>
<ul>
<li>Listener registration will be available at the applicable fee.</li>
<li>Your referral coupon code will continue to provide an exclusive discount.</li>
</ul>
<p><strong>We encourage you to share your code today with:</strong></p>
<ul>
<li>Students</li>
<li>Research Scholars</li>
<li>Faculty Members</li>
<li>Researchers</li>
<li>Professional Contacts</li>
</ul>
<p>The earlier your network registers, the greater their opportunity to secure the limited complimentary listener benefits.</p>
<p>Thank you for supporting the global research community.</p>
<p>Warm Regards,<br /><strong>OneGrasp Conferences</strong></p>
<p style="font-size:11px;color:#666666;border-top:1px solid #cccccc;padding-top:8px;margin-top:18px;">If you no longer wish to receive these emails, <a href="{{unsubscribe_url}}" style="color:#666666;">unsubscribe here</a>.</p>
</body></html>`;

type Row = Record<string, unknown>;

/** Create (or top up) the committee campaign, sender, template and members. */
export async function ensureCommittee(): Promise<{ campaignId: number; accountId: number }> {
  const c = await db();

  // Dedicated sender, kept OUT of the campaign pool (in_pool = 0).
  await c.execute({
    sql: `INSERT INTO smtp_accounts (host, port, email, password, daily_limit, hourly_limit, in_pool)
          VALUES (?, ?, ?, ?, 2900, 100, 0)
          ON CONFLICT(email) DO UPDATE SET
            host=excluded.host, port=excluded.port, password=excluded.password, in_pool=0`,
    args: [COMMITTEE_SENDER.host, COMMITTEE_SENDER.port, COMMITTEE_SENDER.email, COMMITTEE_SENDER.password],
  });
  const accountId = Number(
    (await c.execute({ sql: "SELECT id FROM smtp_accounts WHERE email = ?", args: [COMMITTEE_SENDER.email] }))
      .rows[0].id
  );

  // Campaign (auto_send=0 so the scheduler never touches it).
  const existingCamp = (
    await c.execute({ sql: "SELECT id FROM campaigns WHERE name = ? LIMIT 1", args: [COMMITTEE_CAMPAIGN_NAME] })
  ).rows[0] as Row | undefined;
  let campaignId: number;
  if (existingCamp) {
    campaignId = Number(existingCamp.id);
  } else {
    const ins = await c.execute({
      sql: "INSERT INTO campaigns (name, status, batch_type, start_date, auto_send, country) VALUES (?, 'active', 1, date('now'), 0, NULL)",
      args: [COMMITTEE_CAMPAIGN_NAME],
    });
    campaignId = Number(ins.lastInsertRowid);
  }

  // Template (stage 1) — keep it current.
  const tpl = (
    await c.execute({ sql: "SELECT id FROM email_templates WHERE campaign_id = ? AND stage = 1", args: [campaignId] })
  ).rows[0] as Row | undefined;
  if (tpl) {
    await c.execute({
      sql: "UPDATE email_templates SET subject = ?, body = ? WHERE id = ?",
      args: [COMMITTEE_SUBJECT, COMMITTEE_HTML, Number(tpl.id)],
    });
  } else {
    await c.execute({
      sql: "INSERT INTO email_templates (campaign_id, stage, subject, body) VALUES (?, 1, ?, ?)",
      args: [campaignId, COMMITTEE_SUBJECT, COMMITTEE_HTML],
    });
  }

  // Insert any members not already present (idempotent; adds new ones over time).
  const existing = new Set(
    (await c.execute({ sql: "SELECT lower(email) AS e FROM contacts WHERE campaign_id = ?", args: [campaignId] }))
      .rows.map((r) => (r as Row).e as string)
  );
  for (const m of COMMITTEE) {
    if (existing.has(m.email.toLowerCase())) continue;
    const ins = await c.execute({
      sql: "INSERT INTO contacts (campaign_id, email, name, coupon) VALUES (?, ?, ?, ?)",
      args: [campaignId, m.email, m.name, m.code],
    });
    await c.execute({
      sql: "INSERT INTO campaign_stages (campaign_id, contact_id, stage, status, scheduled_label, send_date) VALUES (?, ?, 1, 'pending', 'Committee', date('now'))",
      args: [campaignId, Number(ins.lastInsertRowid)],
    });
  }

  return { campaignId, accountId };
}

export interface CommitteeRow {
  contact_id: number;
  email: string;
  name: string | null;
  coupon: string | null;
  status: "pending" | "sending" | "sent" | "failed" | "canceled";
  sent_at: string | null;
  last_error: string | null;
  sender: string | null;
  opens: number;
  clicks: number;
  replied: boolean;
  bounced: boolean;
  unsubscribed: boolean;
}

export async function listCommittee(campaignId: number): Promise<CommitteeRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT ct.id AS contact_id, ct.email, ct.name, ct.coupon, ct.replied_at, ct.unsubscribed_at,
            s.status AS status, s.sent_at, s.last_error, sa.email AS sender,
            (SELECT COUNT(*) FROM email_events e WHERE e.contact_id = ct.id AND e.type='open')  AS opens,
            (SELECT COUNT(*) FROM email_events e WHERE e.contact_id = ct.id AND e.type='click') AS clicks,
            EXISTS(SELECT 1 FROM suppressions sp WHERE lower(sp.email)=lower(ct.email) AND sp.reason='bounce') AS bounced
          FROM contacts ct
          JOIN campaign_stages s ON s.contact_id = ct.id AND s.stage = 1
          LEFT JOIN smtp_accounts sa ON sa.id = ct.smtp_account_id
          WHERE ct.campaign_id = ?
          ORDER BY ct.id`,
    args: [campaignId],
  });
  return (res.rows as Row[]).map((r) => ({
    contact_id: Number(r.contact_id),
    email: r.email as string,
    name: (r.name as string) ?? null,
    coupon: (r.coupon as string) ?? null,
    status: r.status as CommitteeRow["status"],
    sent_at: (r.sent_at as string) ?? null,
    last_error: (r.last_error as string) ?? null,
    sender: (r.sender as string) ?? null,
    opens: Number(r.opens),
    clicks: Number(r.clicks),
    replied: !!r.replied_at,
    bounced: !!Number(r.bounced),
    unsubscribed: !!r.unsubscribed_at,
  }));
}

/** Send the referral email to ONE committee member via the dedicated sender. */
export async function sendCommitteeOne(
  contactId: number
): Promise<{ outcome?: string; smtp?: string; error?: string; skipped?: boolean; message?: string }> {
  const c = await db();
  const { campaignId, accountId } = await ensureCommittee();

  const row = (
    await c.execute({
      sql: "SELECT id FROM campaign_stages WHERE contact_id = ? AND campaign_id = ? AND stage = 1",
      args: [contactId, campaignId],
    })
  ).rows[0] as Row | undefined;
  if (!row) return { error: "Not a committee member." };

  // Atomic claim so a double-click can't double-send.
  const claim = await c.execute({
    sql: `UPDATE campaign_stages SET status='sending', claimed_at=datetime('now')
          WHERE id = ? AND status IN ('pending','failed')
          RETURNING id, campaign_id, contact_id, stage`,
    args: [Number(row.id)],
  });
  if (claim.rows.length === 0) return { skipped: true, message: "Already sent (or sending)." };

  const cl = claim.rows[0] as Row;
  return sendStageRow(
    c,
    {
      id: Number(cl.id),
      campaign_id: Number(cl.campaign_id),
      contact_id: Number(cl.contact_id),
      stage: Number(cl.stage),
    },
    templateCache(),
    accountId
  );
}
