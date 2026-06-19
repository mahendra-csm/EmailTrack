// ---------------------------------------------------------------------------
// Fixed, baked-in email templates. Both batches draw from this one library;
// the per-batch schedule (lib/types.ts) decides which templateId each touch
// uses. Edit the copy here to change what goes out — no per-campaign editing.
//
//   1 = Call for Abstracts (invitation)   2 = Reminder
//   3 = Early Bird                        4 = Final Call
//
// Deliverability-focused: simple table layout, text-first, very few links
// (Events, Telegram, WhatsApp, Website), plain-text categories, plain-text
// alternative auto-derived at send time. {{name}} / {{coupon}} supported.
// ---------------------------------------------------------------------------

export interface BakedTemplate {
  subject: string;
  html: string;
}

const P = `font-size:15px;line-height:1.8;color:#374151;`;
const LINK = `color:#0d6efd;text-decoration:none;`;

const SIGNATURE = `
<p style="${P}margin-top:30px;">
Warm Regards,<br /><br />
<strong>Dr. Laura Morgan</strong><br />
Programme Director<br />
OneGrasp Scientific Conferences<br /><br />
Phone / WhatsApp: +91 89777 60443<br />
Website: <a href="https://onegrasp.com" style="${LINK}">onegrasp.com</a>
</p>`;

const FOOTER = `
<p style="font-size:12px;line-height:1.6;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:15px;margin-top:25px;">
You are receiving this email as part of the academic and professional research community.
If you no longer wish to receive these emails, <a href="{{unsubscribe_url}}" style="color:#9ca3af;">unsubscribe here</a>.
</p>`;

const BUTTON = `
<div style="text-align:center;margin:30px 0;">
<a href="https://onegrasp.com/events" style="background:#0d6efd;color:#ffffff;text-decoration:none;padding:14px 28px;display:inline-block;border-radius:4px;font-weight:bold;">Explore Conferences</a>
</div>`;

function wrap(inner: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fa;">
<tr><td align="center" style="padding:30px 15px;">
<table width="650" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e5e7eb;">
<tr><td style="padding:35px;">
${inner}
${SIGNATURE}
${FOOTER}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export const TEMPLATES: Record<number, BakedTemplate> = {
  // 1 — Call for Abstracts / Invitation -------------------------------------
  1: {
    subject: "Call for Abstracts | OneGrasp International Conference Series 2026",
    html: wrap(`
<h2 style="margin-top:0;color:#1f2937;">OneGrasp International Conference Series 2026</h2>

<p style="${P}">Dear Researcher / Esteemed Academic,</p>
<p style="${P}">Warm Greetings from <strong>OneGrasp Scientific Conferences</strong>.</p>
<p style="${P}">We are pleased to invite you to participate in the OneGrasp International Conference Series 2026, featuring 500+ international online conferences across diverse academic and professional disciplines.</p>
<p style="${P}">Abstract submission deadlines are approaching. We encourage you to submit your abstract at the earliest opportunity and secure your participation before the respective conference deadlines close.</p>
<p style="${P}"><strong>Early Bird Registration is available from USD 79.</strong></p>

<h3 style="color:#1f2937;">Conference Categories</h3>
<p style="font-size:15px;line-height:1.9;color:#374151;">
Business &amp; Economics<br />
Health &amp; Medical Sciences<br />
Engineering &amp; Technology<br />
Education<br />
Physical &amp; Life Sciences<br />
Social Sciences &amp; Humanities<br />
Agriculture &amp; Food Sciences<br />
Interdisciplinary &amp; Emerging Fields<br />
Mathematics &amp; Data Science<br />
Arts, Culture &amp; Communication<br />
Sports &amp; Physical Education
</p>

${BUTTON}

<p style="${P}">Participation offers:</p>
<ul style="color:#374151;line-height:1.8;">
<li>CPD Certification</li>
<li>Crossref DOI Assignment</li>
<li>International Research Visibility</li>
<li>Global Networking Opportunities</li>
<li>Online Presentation Facilities</li>
<li>Publication &amp; Indexing Opportunities</li>
</ul>

<p style="${P}">Our conference series is supported through collaborations with MetaSpectra, RMetaHub, Journals Citation Index (JCI), and IntellimindEd-USA.</p>

<h3 style="color:#1f2937;">Stay Connected</h3>
<p style="${P}">Telegram Community:<br /><a href="https://t.me/OneGrasp" style="${LINK}">https://t.me/OneGrasp</a></p>
<p style="${P}">WhatsApp Community:<br /><a href="https://chat.whatsapp.com/KThtaTgNgCa73eI6pDu6SG" style="${LINK}">Join WhatsApp Community</a></p>

<p style="${P}">We look forward to welcoming you to our global academic community. For any queries regarding abstract submission, registration, or participation, please feel free to contact us.</p>`),
  },

  // 2 — Reminder ------------------------------------------------------------
  2: {
    subject: "Reminder | Call for Abstracts — OneGrasp Conference Series 2026",
    html: wrap(`
<h2 style="margin-top:0;color:#1f2937;">OneGrasp International Conference Series 2026</h2>

<p style="${P}">Dear Researcher,</p>
<p style="${P}">This is a gentle reminder that abstract submissions for the OneGrasp International Conference Series 2026 are open across 500+ international online conferences.</p>
<p style="${P}"><strong>Early Bird Registration is available from USD 79.</strong> We encourage you to submit your abstract before the respective deadlines close.</p>

${BUTTON}

<p style="${P}">If you have already submitted, please disregard this reminder. For any queries regarding submission or registration, feel free to contact us.</p>`),
  },

  // 3 — Early Bird ----------------------------------------------------------
  3: {
    subject: "Early Bird from USD 79 — OneGrasp Conference Series 2026",
    html: wrap(`
<h2 style="margin-top:0;color:#1f2937;">OneGrasp International Conference Series 2026</h2>

<p style="${P}">Dear Researcher,</p>
<p style="${P}">Early Bird registration for the OneGrasp International Conference Series 2026 — from <strong>USD 79</strong> — is closing soon across our 500+ online conferences.</p>
<p style="${P}">Securing your place now includes:</p>
<ul style="color:#374151;line-height:1.8;">
<li>CPD Certification</li>
<li>Crossref DOI Assignment</li>
<li>Publication &amp; Indexing Opportunities</li>
<li>Online Presentation Facilities</li>
</ul>

${BUTTON}

<p style="${P}">For any queries regarding abstract submission or registration, please feel free to contact us.</p>`),
  },

  // 4 — Final Call ----------------------------------------------------------
  4: {
    subject: "Final Reminder | OneGrasp International Conference Series 2026",
    html: wrap(`
<h2 style="margin-top:0;color:#1f2937;">OneGrasp International Conference Series 2026</h2>

<p style="${P}">Dear Researcher,</p>
<p style="${P}">This is a final reminder regarding the OneGrasp International Conference Series 2026 — 500+ international online conferences, with Early Bird registration available from <strong>USD 79</strong>.</p>
<p style="${P}">We would be glad to welcome you among the researchers and academics already taking part. Please submit your abstract before the respective deadlines close.</p>

${BUTTON}

<p style="${P}">If we do not hear from you, we will not send further reminders about this series. Thank you for your time, and we hope to welcome you to a future OneGrasp event.</p>`),
  },
};
