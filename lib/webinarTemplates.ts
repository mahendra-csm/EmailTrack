// ---------------------------------------------------------------------------
// Selectable WEBINAR email templates. Unlike the campaign drip library
// (lib/templates.ts, keyed by touch), a webinar sends ONE of these as a single
// blast. The user picks one on the /webinar page; createWebinar copies the
// chosen subject+html into the campaign's email_templates(stage 1), after which
// the normal send/track/report code reads it exactly like any other template.
//
// Placeholders supported at send time (lib/mailer.ts renderTemplate +
// lib/tracking.ts): {{name}}, {{email}}, {{unsubscribe_url}}. Every https link
// is auto-rewritten through /api/track/click, so each inserted link's clicks are
// tracked per-recipient (see the report page's per-link breakdown).
// ---------------------------------------------------------------------------

export interface WebinarTemplate {
  id: number;
  name: string; // shown in the picker
  description: string; // one-line helper in the picker
  subject: string;
  html: string;
}

// --- Template 1: full International Scientific Conferences webinar invite -----
const INVITE_HTML = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>International Scientific Conferences: Importance &amp; Awareness</title>
<!--[if mso]>
<style>
  * { font-family: Arial, sans-serif !important; }
</style>
<![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family:'Poppins', Arial, Helvetica, sans-serif;">

<!-- Preheader (hidden preview text) -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
An invitation to a live international webinar on research conferences, DOIs, and academic visibility — 23 July 2026.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:32px 0;">
<tr>
<td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border:1px solid #e2e4e8; max-width:600px; width:100%; font-family:'Poppins', Arial, Helvetica, sans-serif;">

<!-- Header -->
<tr>
<td style="background-color:#0f1f38; padding:28px 32px; text-align:center;">
<span style="color:#ffffff; font-size:19px; font-weight:600; letter-spacing:1px; font-family:'Poppins', Arial, sans-serif;">ONEGRASP</span>
<div style="color:#a9b3c6; font-size:11px; margin-top:6px; letter-spacing:0.5px; font-family:'Poppins', Arial, sans-serif;">INTERNATIONAL SCIENTIFIC CONFERENCES</div>
</td>
</tr>

<!-- Salutation -->
<tr>
<td style="padding:36px 40px 0 40px;">
<p style="margin:0 0 18px 0; font-size:14px; color:#333333;">Dear {{name}},</p>
<p style="margin:0 0 18px 0; font-size:14px; color:#333333; line-height:1.7;">
You are invited to join a live international webinar for researchers, academics, and professionals on how scientific conferences support publication, indexing, and global research visibility.
</p>
</td>
</tr>

<!-- Title -->
<tr>
<td style="padding:0 40px;">
<h1 style="margin:0 0 6px 0; font-size:20px; line-height:1.4; color:#0f1f38; font-family:'Poppins', Arial, sans-serif; font-weight:600;">
International Scientific Conferences: Importance &amp; Awareness
</h1>
<p style="margin:0 0 20px 0; font-size:13px; color:#666666; font-family:'Poppins', Arial, sans-serif;">
A structured session on conference publishing, Crossref DOIs, and building a globally recognized research profile.
</p>
</td>
</tr>

<!-- Details box -->
<tr>
<td style="padding:0 40px 8px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e4e8;">
<tr>
<td style="padding:20px 22px; font-size:13px; color:#333333; line-height:2;">
<strong>Date:</strong> 23 July 2026<br>
<strong>Time:</strong> 6:00 PM – 8:00 PM IST&nbsp;&nbsp;<span style="color:#777777;">(please convert to your local time zone)</span><br>
<strong>Format:</strong> Live, online<br>
<strong>Details:</strong> <a href="https://webinar.onegrasp.com" style="color:#0f1f38;">webinar.onegrasp.com</a>
</td>
</tr>
</table>
</td>
</tr>

<!-- Speakers -->
<tr>
<td style="padding:28px 40px 0 40px;">
<h2 style="font-size:14px; color:#0f1f38; margin:0 0 12px 0; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; border-bottom:1px solid #e2e4e8; padding-bottom:8px;">Speakers</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:#444444; line-height:1.8;">
<tr><td style="padding:5px 0;">Dr. Rudrarup Gupta — Business &amp; Economics</td></tr>
<tr><td style="padding:5px 0; border-top:1px solid #f0f0f0;">Dr. G N Manjunath — Health &amp; Medical</td></tr>
<tr><td style="padding:5px 0; border-top:1px solid #f0f0f0;">Sudha Suchitra — Engineering &amp; Technology</td></tr>
<tr><td style="padding:5px 0; border-top:1px solid #f0f0f0;">Dr. D K Chaturvedi — Interdisciplinary</td></tr>
<tr><td style="padding:5px 0; border-top:1px solid #f0f0f0;">Dr. Bishnu Pada Bose — Engineering &amp; Technology</td></tr>
</table>
</td>
</tr>

<!-- What you'll gain -->
<tr>
<td style="padding:26px 40px 0 40px;">
<h2 style="font-size:14px; color:#0f1f38; margin:0 0 12px 0; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; border-bottom:1px solid #e2e4e8; padding-bottom:8px;">Session Outcomes</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:#444444; line-height:1.9;">
<tr><td style="padding:2px 0;">✓ How presenting research internationally supports academic careers</td></tr>
<tr><td style="padding:2px 0;">✓ Steps to secure a Crossref DOI for a conference abstract</td></tr>
<tr><td style="padding:2px 0;">✓ Methods to increase research visibility through indexing and CPD credits</td></tr>
<tr><td style="padding:2px 0;">✓ Access to 180+ million research records for discovery and collaboration</td></tr>
<tr><td style="padding:2px 0;">✓ A Certificate of Participation issued after the session</td></tr>
</table>
</td>
</tr>

<!-- CTA button -->
<tr>
<td style="padding:32px 40px; text-align:center;">
<a href="https://www.paypal.com/ncp/payment/AKABJJ3NADBLU" target="_blank"
style="background-color:#0f1f38; color:#ffffff; text-decoration:none; font-size:14px; font-family:'Poppins', Arial, sans-serif; font-weight:600; padding:14px 40px; display:inline-block; letter-spacing:0.5px;">
CONFIRM PARTICIPATION
</a>
<p style="font-size:11px; color:#888888; margin:14px 0 0 0;">
Payment is processed securely via PayPal. Registration is confirmed by email upon receipt.
</p>
</td>
</tr>

<!-- Divider -->
<tr>
<td style="padding:0 40px;">
<hr style="border:none; border-top:1px solid #e2e4e8; margin:0;">
</td>
</tr>

<!-- Contact -->
<tr>
<td style="padding:22px 40px; text-align:center; font-size:13px; color:#555555; line-height:1.7;">
For questions regarding this session, please contact<br>
<a href="mailto:support@onegrasp.com" style="color:#0f1f38;">support@onegrasp.com</a>
&nbsp;|&nbsp;
<a href="tel:+918977760443" style="color:#0f1f38;">+91 89777 60443</a>
</td>
</tr>

<!-- Closing -->
<tr>
<td style="padding:0 40px 24px 40px;">
<p style="font-size:13px; color:#333333; margin:0;">We look forward to your participation.</p>
<p style="font-size:13px; color:#333333; margin:8px 0 0 0;">Regards,<br>The OneGrasp Team</p>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#f4f5f7; padding:22px 40px; text-align:center;">
<p style="font-size:11px; color:#999999; margin:0 0 6px 0;">
OneGrasp · International Scientific Conferences &amp; Research Webinars<br>
Hyderabad, India
</p>
<p style="font-size:11px; color:#999999; margin:0;">
You received this invitation as a researcher or academic professional in our network.<br>
<a href="{{unsubscribe_url}}" style="color:#999999;">Unsubscribe</a> from future webinar invitations.
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`;

// --- Template 2: condensed / text-forward variant (better deliverability) ----
const CONCISE_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
<tr><td align="center" style="padding:28px 15px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e4e8;max-width:600px;width:100%;">
<tr><td style="background:#0f1f38;padding:22px 32px;">
<span style="color:#ffffff;font-size:17px;font-weight:600;letter-spacing:1px;">ONEGRASP</span>
</td></tr>
<tr><td style="padding:32px 34px;">
<p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 16px;">Dear {{name}},</p>
<h1 style="font-size:19px;color:#0f1f38;margin:0 0 12px;line-height:1.4;">You're invited: International Scientific Conferences — Importance &amp; Awareness</h1>
<p style="font-size:14px;color:#444;line-height:1.8;margin:0 0 16px;">
A live online webinar for researchers and academics on conference publishing, Crossref DOIs, indexing, and global research visibility.
</p>
<p style="font-size:14px;color:#333;line-height:2;margin:0 0 20px;border:1px solid #e2e4e8;padding:16px 20px;">
<strong>Date:</strong> 23 July 2026<br>
<strong>Time:</strong> 6:00 PM – 8:00 PM IST<br>
<strong>Format:</strong> Live, online<br>
<strong>Details:</strong> <a href="https://webinar.onegrasp.com" style="color:#0d6efd;">webinar.onegrasp.com</a>
</p>
<div style="text-align:center;margin:26px 0;">
<a href="https://www.paypal.com/ncp/payment/AKABJJ3NADBLU" target="_blank" style="background:#0f1f38;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 38px;display:inline-block;letter-spacing:0.5px;">CONFIRM PARTICIPATION</a>
</div>
<p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 6px;">
Includes a Certificate of Participation, Crossref DOI guidance, and access to 180+ million research records.
</p>
<p style="font-size:13px;color:#555;line-height:1.7;margin:18px 0 0;">
Questions? <a href="mailto:support@onegrasp.com" style="color:#0d6efd;">support@onegrasp.com</a> · +91 89777 60443
</p>
<p style="font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:14px;margin-top:22px;">
OneGrasp · Hyderabad, India · <a href="{{unsubscribe_url}}" style="color:#9ca3af;">Unsubscribe</a>
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

// --- Template 3: "$1 — last chance" urgency / final-call variant -------------
const LAST_CHANCE_HTML = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Final Call — Join the International Scientific Conferences Webinar for $1</title>
<!--[if mso]>
<style>* { font-family: Arial, sans-serif !important; }</style>
<![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family:'Poppins', Arial, Helvetica, sans-serif;">

<!-- Preheader (hidden preview text) -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
Last chance: confirm your seat at the live international research webinar for just $1 — registration closes soon.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:32px 0;">
<tr>
<td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border:1px solid #e2e4e8; max-width:600px; width:100%; font-family:'Poppins', Arial, Helvetica, sans-serif;">

<!-- Header -->
<tr>
<td style="background-color:#0f1f38; padding:28px 32px; text-align:center;">
<span style="color:#ffffff; font-size:19px; font-weight:600; letter-spacing:1px; font-family:'Poppins', Arial, sans-serif;">ONEGRASP</span>
<div style="color:#a9b3c6; font-size:11px; margin-top:6px; letter-spacing:0.5px; font-family:'Poppins', Arial, sans-serif;">INTERNATIONAL SCIENTIFIC CONFERENCES</div>
</td>
</tr>

<!-- Urgency ribbon -->
<tr>
<td style="background-color:#fdecea; border-bottom:1px solid #f5c6c0; padding:12px 32px; text-align:center;">
<span style="color:#b42318; font-size:12px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase;">Final Call · Registration Closing Soon</span>
</td>
</tr>

<!-- Salutation + hook -->
<tr>
<td style="padding:34px 40px 0 40px;">
<p style="margin:0 0 18px 0; font-size:14px; color:#333333;">Dear {{name}},</p>
<p style="margin:0 0 18px 0; font-size:14px; color:#333333; line-height:1.7;">
This is your <strong>last chance</strong> to grab your seat at our live international webinar for researchers and academics. Registrations are closing, and only a limited number of seats remain.
</p>
</td>
</tr>

<!-- $1 highlight -->
<tr>
<td style="padding:6px 40px 0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1f38;">
<tr>
<td style="padding:22px 24px; text-align:center;">
<div style="color:#a9b3c6; font-size:12px; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Register Today For Only</div>
<div style="color:#ffffff; font-size:38px; font-weight:700; line-height:1; font-family:'Poppins', Arial, sans-serif;">$1</div>
<div style="color:#a9b3c6; font-size:12px; margin-top:8px;">One-time registration · Certificate of Participation included</div>
</td>
</tr>
</table>
</td>
</tr>

<!-- Title -->
<tr>
<td style="padding:26px 40px 0 40px;">
<h1 style="margin:0 0 6px 0; font-size:19px; line-height:1.4; color:#0f1f38; font-family:'Poppins', Arial, sans-serif; font-weight:600;">
International Scientific Conferences: Importance &amp; Awareness
</h1>
<p style="margin:0 0 18px 0; font-size:13px; color:#666666;">
A structured live session on conference publishing, Crossref DOIs, and building a globally recognized research profile.
</p>
</td>
</tr>

<!-- Details box -->
<tr>
<td style="padding:0 40px 8px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e4e8;">
<tr>
<td style="padding:20px 22px; font-size:13px; color:#333333; line-height:2;">
<strong>Date:</strong> 23 July 2026<br>
<strong>Time:</strong> 6:00 PM – 8:00 PM IST&nbsp;&nbsp;<span style="color:#777777;">(please convert to your local time zone)</span><br>
<strong>Format:</strong> Live, online<br>
<strong>Details:</strong> <a href="https://webinar.onegrasp.com" style="color:#0f1f38;">webinar.onegrasp.com</a>
</td>
</tr>
</table>
</td>
</tr>

<!-- What you'll gain -->
<tr>
<td style="padding:26px 40px 0 40px;">
<h2 style="font-size:14px; color:#0f1f38; margin:0 0 12px 0; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; border-bottom:1px solid #e2e4e8; padding-bottom:8px;">What You Get For $1</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:#444444; line-height:1.9;">
<tr><td style="padding:2px 0;">✓ Live access to the full international webinar session</td></tr>
<tr><td style="padding:2px 0;">✓ Step-by-step guidance to secure a Crossref DOI for your abstract</td></tr>
<tr><td style="padding:2px 0;">✓ Methods to boost research visibility through indexing and CPD credits</td></tr>
<tr><td style="padding:2px 0;">✓ Access to 180+ million research records for discovery and collaboration</td></tr>
<tr><td style="padding:2px 0;">✓ A Certificate of Participation issued after the session</td></tr>
</table>
</td>
</tr>

<!-- CTA button -->
<tr>
<td style="padding:30px 40px 8px 40px; text-align:center;">
<a href="https://www.paypal.com/ncp/payment/AKABJJ3NADBLU" target="_blank"
style="background-color:#b42318; color:#ffffff; text-decoration:none; font-size:15px; font-family:'Poppins', Arial, sans-serif; font-weight:600; padding:15px 44px; display:inline-block; letter-spacing:0.5px;">
JOIN NOW FOR $1
</a>
<p style="font-size:12px; color:#b42318; font-weight:600; margin:16px 0 0 0;">
Don't miss out — this is the last opportunity to register.
</p>
<p style="font-size:11px; color:#888888; margin:8px 0 0 0;">
Payment is processed securely via PayPal. Your seat is confirmed by email upon receipt.
</p>
</td>
</tr>

<!-- Divider -->
<tr>
<td style="padding:16px 40px 0 40px;">
<hr style="border:none; border-top:1px solid #e2e4e8; margin:0;">
</td>
</tr>

<!-- Contact -->
<tr>
<td style="padding:20px 40px; text-align:center; font-size:13px; color:#555555; line-height:1.7;">
Questions about registration? Contact<br>
<a href="mailto:support@onegrasp.com" style="color:#0f1f38;">support@onegrasp.com</a>
&nbsp;|&nbsp;
<a href="tel:+918977760443" style="color:#0f1f38;">+91 89777 60443</a>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#f4f5f7; padding:22px 40px; text-align:center;">
<p style="font-size:11px; color:#999999; margin:0 0 6px 0;">
OneGrasp · International Scientific Conferences &amp; Research Webinars<br>
Hyderabad, India
</p>
<p style="font-size:11px; color:#999999; margin:0;">
You received this invitation as a researcher or academic professional in our network.<br>
<a href="{{unsubscribe_url}}" style="color:#999999;">Unsubscribe</a> from future webinar invitations.
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`;

export const WEBINAR_TEMPLATES: Record<number, WebinarTemplate> = {
  1: {
    id: 1,
    name: "Conference Webinar — Full Invitation",
    description: "Detailed branded layout with speakers, session outcomes, and CTA.",
    subject: "You're Invited | International Scientific Conferences Webinar — 23 July 2026",
    html: INVITE_HTML,
  },
  2: {
    id: 2,
    name: "Conference Webinar — Concise",
    description: "Shorter, text-forward version — lighter and better for the inbox.",
    subject: "Live Webinar Invitation | International Scientific Conferences — 23 July",
    html: CONCISE_HTML,
  },
  3: {
    id: 3,
    name: "Conference Webinar — $1 Last Chance",
    description: "Urgency / final-call variant highlighting $1 registration and a closing deadline.",
    subject: "Last Chance | Join the International Scientific Conferences Webinar for $1",
    html: LAST_CHANCE_HTML,
  },
};

/** Lightweight metadata for the picker UI (no heavy HTML strings). */
export const WEBINAR_TEMPLATE_META = Object.values(WEBINAR_TEMPLATES).map((t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  subject: t.subject,
}));

export function getWebinarTemplate(id: number): WebinarTemplate | undefined {
  return WEBINAR_TEMPLATES[id];
}
