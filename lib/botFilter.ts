// ---------------------------------------------------------------------------
// Open/click accuracy: decide whether a tracking hit came from a real human or
// from an automated fetcher, so bot noise never inflates the numbers.
//
// This is the fix for "the view count goes up seconds after I send, but nobody
// has actually read the email". Four independent signals — a hit is machine
// traffic if ANY of them fires:
//
//   1. PREFETCH TIMING — an open/click that arrives within PREFETCH_SEC of the
//      send is physically impossible for a human: the message has only just been
//      delivered. This is exactly how Microsoft Defender/SafeLinks, Proofpoint
//      URL Defense, Barracuda and most corporate gateways behave — they fetch
//      every image and follow every link at delivery time, usually with a
//      browser-like user-agent, which is why timing (not the UA) is the signal
//      that catches them. Default 90s, tune with PREFETCH_SEC.
//
//   2. PRIVACY PROXY PRE-CACHING — Apple Mail Privacy Protection (on by default
//      since iOS 15) downloads every remote image the moment the mail arrives,
//      whether or not the person ever opens it. Its proxy sends a truncated
//      WebKit user-agent with no "Safari/" or "Version/" token and comes from
//      Apple's network (17.0.0.0/8). Counting those as opens is the single
//      biggest source of fake open rates in the industry.
//
//   3. USER-AGENT — known security scanners, link-preview crawlers and CLI
//      fetchers. Deliberately HIGH-PRECISION: only strings that never appear in
//      a real mail client, so genuine opens are never dropped.
//
//   4. NO USER-AGENT — every real mail client and browser sends one. A pixel
//      fetched without any UA is a script.
//
// Nothing is thrown away: flagged hits are still stored in email_events with
// bot=1 and a bot_reason, so the Deliverability page can show exactly how much
// machine traffic was filtered and why.
// ---------------------------------------------------------------------------

/** Anything faster than this after the send is machine-generated, not a person. */
export const PREFETCH_MS = Math.max(0, Number(process.env.PREFETCH_SEC ?? 90)) * 1000;

// High-precision: strings that only ever appear in automated fetchers, never in
// a real mail client. "bot" is matched only as a word-ending (so "Googlebot",
// "Slackbot-Link", "SomeCrawlerBot" match but real UAs don't); the rest are
// distinctive vendor/tool tokens. curl/wget/java are anchored with a slash so
// they can't clip a normal UA fragment.
const BOT_UA =
  /bot(?![a-z])|crawler|spider|proofpoint|urldefense|barracuda|mimecast|messagelabs|symantec|forcepoint|mailcontrol|fireeye|cloudmark|ironport|zscaler|bitdefender|kaspersky|sophos|trendmicro|mcafee|paloalto|whatsapp|telegram|facebookexternalhit|skypeuripreview|bingpreview|embedly|curl\/|wget|python-requests|go-http-client|java\/|okhttp|headless|phantom|puppeteer|playwright|axios|libwww|apache-httpclient|preview|scan(ner)?[\/ ]|monitor|uptime|validator/i;

// Apple Mail Privacy Protection relay: a WebKit UA with the browser tokens
// stripped ("…AppleWebKit/605.1.15 (KHTML, like Gecko)" and nothing after it).
// A real Safari/Mail UA always carries "Version/x" and/or "Safari/x".
function isPrivacyProxyUa(ua: string): boolean {
  if (!/applewebkit/i.test(ua)) return false;
  return !/safari\//i.test(ua) && !/version\//i.test(ua) && !/mobile\//i.test(ua);
}

/** Apple owns all of 17.0.0.0/8 — MPP image fetches originate there. */
function isAppleNetwork(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const first = ip.split(",")[0].trim().replace(/^::ffff:/, "");
  return /^17\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(first);
}

/** True if this user-agent is a known non-human fetcher. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return BOT_UA.test(ua);
}

export type HitReason =
  | "prefetch" // arrived too soon after the send — delivery-time scan
  | "privacy-proxy" // Apple Mail Privacy Protection / image proxy pre-cache
  | "scanner-ua" // known security scanner or crawler
  | "no-ua"; // no user-agent at all

export interface HitVerdict {
  bot: boolean;
  reason: HitReason | null;
  /** ms between the send and this hit, when the token carried a send time. */
  msSinceSend: number | null;
}

/**
 * Classify a tracking hit. `msSinceSend` is (event time − send time) when the
 * send time is known (embedded in the signed token); pass null when it isn't
 * (an old token) and the timing signal is simply skipped.
 */
export function classifyHit(args: {
  ua?: string | null;
  ip?: string | null;
  msSinceSend?: number | null;
}): HitVerdict {
  const { ua, ip } = args;
  const ms = typeof args.msSinceSend === "number" ? args.msSinceSend : null;

  if (ms !== null && ms >= 0 && ms < PREFETCH_MS) {
    return { bot: true, reason: "prefetch", msSinceSend: ms };
  }
  if (!ua) return { bot: true, reason: "no-ua", msSinceSend: ms };
  if (isBotUserAgent(ua)) return { bot: true, reason: "scanner-ua", msSinceSend: ms };
  if (isPrivacyProxyUa(ua) || isAppleNetwork(ip)) {
    return { bot: true, reason: "privacy-proxy", msSinceSend: ms };
  }
  return { bot: false, reason: null, msSinceSend: ms };
}

/** Back-compat boolean wrapper (same rules as classifyHit). */
export function isBotHit(
  ua: string | null | undefined,
  msSinceSend: number | null | undefined
): boolean {
  return classifyHit({ ua, msSinceSend }).bot;
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") || headers.get("cf-connecting-ip");
}
