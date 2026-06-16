// ---------------------------------------------------------------------------
// Fixed, baked-in email templates. Both batches draw from this one library;
// the per-batch schedule (lib/types.ts) decides which templateId each touch
// uses. Edit the copy here to change what goes out — no per-campaign editing.
//
//   1 = Invitation (original)   2 = Reminder
//   3 = Early Bird urgency      4 = Final Call
//
// {{name}} / {{email}} placeholders are supported (see lib/mailer.ts).
// ---------------------------------------------------------------------------

export interface BakedTemplate {
  subject: string;
  html: string;
}

const FOOTER = `
<p style="font-size:8pt; color:#888888; border-top:1px solid #dddddd; padding-top:10px; margin-top:20px;">
<span style="font-family:arial,helvetica,sans-serif;">
You are receiving this email because your address is associated with academic or professional research.
To unsubscribe, <a style="color:#888888;" href="{{unsubscribe_url}}">click here</a> or reply with "Unsubscribe" in the subject line.
</span>
</p>`;

const SIGNATURE = `
<p><span style="font-family:arial,helvetica,sans-serif;">
Warm regards,<br />
<strong>Dr. Laura Morgan</strong><br />
Program Director<br />
<strong>OneGrasp</strong><br />
+91 89777 60443<br />
<a style="color:#00acff;" href="https://onegrasp.com/events">https://onegrasp.com/events</a>
</span></p>`;

function wrap(inner: string): string {
  return `<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-size:10pt; font-family:Verdana,Geneva,sans-serif; color:#2c363a; background-color:#ffffff; margin:0; padding:20px;">
${inner}
${SIGNATURE}
${FOOTER}
</body>
</html>`;
}

export const TEMPLATES: Record<number, BakedTemplate> = {
  // 1 — Original invitation -------------------------------------------------
  1: {
    subject: "Invitation to International Conference Series 2026 | 300+ Online Events",
    html: wrap(`
<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Dear Sir/Madam,</strong></span></p>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong>OneGrasp</strong> feels great pleasure in inviting you to our upcoming <strong>International Conference Series 2026</strong>. This expansive series features <strong>300+ International conferences</strong> across <strong>11 Disciplines</strong>, conducted completely <strong>Online</strong> to ensure global accessibility for all.</span></p>

<p><span style="font-family:arial,helvetica,sans-serif;">You may secure your place on this premier stage with Early Bird registration starting from <strong>$25</strong>. We are proud to welcome Researchers, Scholars, Students and Global Professionals to join this vibrant academic community.</span></p>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong>
<a style="color:#00acff;" href="https://www.crossref.org/" target="_blank" rel="noopener noreferrer">Crossref</a> |
<a style="color:#00acff;" href="https://www.doi.org/" target="_blank" rel="noopener noreferrer">DOI</a> |
<a style="color:#00acff;" href="https://thecpd.group/" target="_blank" rel="noopener noreferrer">CPD</a> |
<a style="color:#00acff;" href="https://metaspectra.org/" target="_blank" rel="noopener noreferrer">MetaSpectra</a> |
<a style="color:#00acff;" href="https://rmetahub.com/" target="_blank" rel="noopener noreferrer">RMetaHub</a> |
<a style="color:#00acff;" href="https://journalcitationindex.org/" target="_blank" rel="noopener noreferrer">JournalsCitationIndex</a>
</strong></span></p>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Explore Our Conference Categories</strong></span></p>
<ol>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Business &amp; Economics</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Health and Medical Sciences</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Engineering and Technology</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Education</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Physical &amp; Life Sciences</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Social Science and Humanities</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Agricultural and Food Sciences</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Interdisciplinary and Emerging Fields</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Mathematics &amp; Data Science</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Arts, Culture &amp; Communication</strong></a></li>
<li><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer"><strong>Sports &amp; Physical Education</strong></a></li>
</ol>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Benefits &amp; Advantages:</strong></span></p>
<ul>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>CPD Certification:</strong> <a style="color:#00acff;" href="https://thecpd.group/" target="_blank" rel="noopener noreferrer">CPD</a> (Continuing Professional Development) for attendees.</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>Global Indexing &amp; DOI:</strong> Through <a style="color:#00acff;" href="https://www.crossref.org/" target="_blank" rel="noopener noreferrer">Crossref</a> and <a style="color:#00acff;" href="https://www.doi.org/" target="_blank" rel="noopener noreferrer">DOI</a>, persistent identifiers for global citability.</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>Strategic Partnerships:</strong> <a style="color:#00acff;" href="https://metaspectra.org/" target="_blank" rel="noopener noreferrer">MetaSpectra</a>, <a style="color:#00acff;" href="https://rmetahub.com/" target="_blank" rel="noopener noreferrer">RMetaHub</a>, <a style="color:#00acff;" href="https://journalcitationindex.org/" target="_blank" rel="noopener noreferrer">JournalsCitationIndex</a> &amp; IntellimindEd-USA.</span></li>
</ul>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Essential Details:</strong></span></p>
<ul>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>Deadlines:</strong> Vary by event — see <a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer">onegrasp.com/events/</a>.</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>Participant Guidelines:</strong> <a style="color:#00acff;" href="https://onegrasp.com/guidelines/" target="_blank" rel="noopener noreferrer">onegrasp.com/guidelines/</a>.</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>Format:</strong> 100% Online.</span></li>
</ul>

<p><span style="font-family:arial,helvetica,sans-serif;">We look forward to your valuable contribution.</span></p>`),
  },

  // 2 — Reminder ------------------------------------------------------------
  2: {
    subject: "Reminder: Your invitation to International Conference Series 2026",
    html: wrap(`
<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Dear Sir/Madam,</strong></span></p>

<p><span style="font-family:arial,helvetica,sans-serif;">A quick reminder from <strong>OneGrasp</strong> — our <strong>International Conference Series 2026</strong> is open for registration, with <strong>300+ online conferences</strong> across <strong>11 disciplines</strong> and Early Bird pricing from just <strong>$25</strong>.</span></p>

<p><span style="font-family:arial,helvetica,sans-serif;">We did not want you to miss your place on this global academic stage.</span></p>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer">Browse your field and submission portals &raquo;</a></strong></span></p>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Why researchers join us:</strong></span></p>
<ul>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>CPD Certification</strong> for all attendees (<a style="color:#00acff;" href="https://thecpd.group/" target="_blank" rel="noopener noreferrer">thecpd.group</a>)</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>Global Indexing &amp; DOI</strong> via <a style="color:#00acff;" href="https://www.crossref.org/" target="_blank" rel="noopener noreferrer">Crossref</a> and <a style="color:#00acff;" href="https://www.doi.org/" target="_blank" rel="noopener noreferrer">DOI</a></span></li>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>100% Online</strong> — attend from anywhere</span></li>
</ul>

<p><span style="font-family:arial,helvetica,sans-serif;">If now is not the right time, simply ignore this note.</span></p>`),
  },

  // 3 — Early Bird urgency --------------------------------------------------
  3: {
    subject: "Early Bird from $25 is closing — International Conference Series 2026",
    html: wrap(`
<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Dear Sir/Madam,</strong></span></p>

<p><span style="font-family:arial,helvetica,sans-serif;">A friendly note that <strong>Early Bird registration</strong> for the OneGrasp <strong>International Conference Series 2026</strong> — starting from <strong>$25</strong> — is filling fast across our <strong>300+ online events</strong>.</span></p>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Securing your place now means:</strong></span></p>
<ul>
<li><span style="font-family:arial,helvetica,sans-serif;">A presentation slot in your discipline (11 fields available)</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;">A <strong>DOI</strong> and global indexing for every eligible paper (<a style="color:#00acff;" href="https://www.crossref.org/" target="_blank" rel="noopener noreferrer">Crossref</a> + <a style="color:#00acff;" href="https://www.doi.org/" target="_blank" rel="noopener noreferrer">DOI</a>)</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;"><strong>CPD certification</strong> for your professional portfolio</span></li>
</ul>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer">Choose your conference and register &raquo;</a></strong><br />
<a style="color:#00acff;" href="https://onegrasp.com/guidelines/" target="_blank" rel="noopener noreferrer">Participant guidelines</a></span></p>

<p><span style="font-family:arial,helvetica,sans-serif;">Questions? Just reply to this email — we are happy to help.</span></p>`),
  },

  // 4 — Final Call ----------------------------------------------------------
  4: {
    subject: "Final call: International Conference Series 2026 registration",
    html: wrap(`
<p><span style="font-family:arial,helvetica,sans-serif;"><strong>Dear Sir/Madam,</strong></span></p>

<p><span style="font-family:arial,helvetica,sans-serif;">This is our <strong>final reminder</strong> regarding the OneGrasp <strong>International Conference Series 2026</strong>. We would be glad to welcome you among the researchers, scholars and professionals already taking part.</span></p>

<ul>
<li><span style="font-family:arial,helvetica,sans-serif;">300+ online conferences across 11 disciplines</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;">Early Bird from <strong>$25</strong></span></li>
<li><span style="font-family:arial,helvetica,sans-serif;">DOI, global indexing and CPD certification</span></li>
<li><span style="font-family:arial,helvetica,sans-serif;">100% Online</span></li>
</ul>

<p><span style="font-family:arial,helvetica,sans-serif;"><strong><a style="color:#00acff;" href="https://onegrasp.com/events/" target="_blank" rel="noopener noreferrer">Register before slots close &raquo;</a></strong></span></p>

<p><span style="font-family:arial,helvetica,sans-serif;">If we do not hear from you, we will not send further reminders about this series. Thank you for your time, and we hope to see you at a future OneGrasp event.</span></p>`),
  },
};
