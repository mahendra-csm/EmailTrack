import { sign, SendToken } from "./token";

// ---------------------------------------------------------------------------
// Turns a rendered template into a tracked, compliant email:
//   • every external link is rewritten through /api/track/click (signed, so no
//     open-redirect and no forgery), which logs a click then 302s to the target;
//   • a 1x1 open pixel is injected before </body>;
//   • {{unsubscribe_url}} is replaced with the one-click unsubscribe link;
//   • a plain-text alternative is derived (better deliverability than HTML-only).
// If APP_URL isn't set we skip click/open rewriting but still fill the
// unsubscribe link, so sends never silently break.
// ---------------------------------------------------------------------------

export function appBaseUrl(): string {
  return (process.env.APP_URL || "").replace(/\/+$/, "");
}

export function unsubscribeUrl(token: string): string {
  const base = appBaseUrl();
  return base ? `${base}/api/unsubscribe?t=${token}` : `mailto:?subject=Unsubscribe`;
}

function rewriteLinks(html: string, ids: SendToken, base: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    const tok = sign({ ...ids, u: url });
    return `href="${base}/api/track/click?t=${tok}"`;
  });
}

function openPixel(ids: SendToken, base: string): string {
  const tok = sign(ids);
  return `<img src="${base}/api/track/open?t=${tok}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;" />`;
}

/** Instrument the HTML body for a specific send. */
export function instrumentHtml(
  html: string,
  ids: SendToken,
  unsubUrl: string
): string {
  const base = appBaseUrl();
  let out = html;
  if (base) out = rewriteLinks(out, ids, base); // before unsub substitution
  out = out.replaceAll("{{unsubscribe_url}}", unsubUrl);
  if (base) {
    const pixel = openPixel(ids, base);
    out = out.includes("</body>") ? out.replace("</body>", `${pixel}</body>`) : out + pixel;
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&raquo;": "»",
};

/** Crude but effective HTML -> text for the plain-text alternative. */
export function htmlToText(html: string, unsubUrl: string): string {
  let t = html.replace(/{{unsubscribe_url}}/g, unsubUrl);
  t = t
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  for (const [k, v] of Object.entries(ENTITIES)) t = t.split(k).join(v);
  t = t
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!t.includes(unsubUrl)) t += `\n\nUnsubscribe: ${unsubUrl}`;
  return t;
}
