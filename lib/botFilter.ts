// ---------------------------------------------------------------------------
// Open/click accuracy: decide whether a tracking hit came from a real human or
// from an automated fetcher, so bot noise never inflates the numbers.
//
// Two independent signals — an event is a bot if EITHER fires:
//
//   1. USER-AGENT — known security scanners, link-preview crawlers and CLI
//      fetchers. This list is deliberately HIGH-PRECISION: it only contains
//      strings that never appear in a real mail client's UA, so we don't drop
//      genuine opens. In particular "GoogleImageProxy" (a real Gmail open) and
//      plain "Outlook"/"Apple Mail"/"Mozilla" are intentionally NOT matched.
//
//   2. PREFETCH TIMING — an open or click that arrives within a couple of
//      seconds of the send is physically impossible for a human (the message
//      hasn't even been read yet). This is exactly how Microsoft SafeLinks /
//      Proofpoint URL Defense / Barracuda scan links at delivery time and click
//      every one of them. Those scanners often present a browser-like UA, so
//      timing is the signal that catches them.
// ---------------------------------------------------------------------------

// Any hit faster than this after the send is machine-generated, not a person.
export const PREFETCH_MS = 2000;

// High-precision: strings that only ever appear in automated fetchers, never in
// a real mail client. "bot" is matched only as a word-ending (so "Googlebot",
// "Slackbot-Link", "SomeCrawlerBot" match but real UAs don't); the rest are
// distinctive vendor/tool tokens. curl/wget/java are anchored with a slash so
// they can't clip a normal UA fragment.
const BOT_UA =
  /bot(?![a-z])|crawler|spider|proofpoint|urldefense|barracuda|mimecast|messagelabs|symantec|forcepoint|mailcontrol|fireeye|cloudmark|ironport|zscaler|bitdefender|kaspersky|sophos|trendmicro|mcafee|paloalto|whatsapp|telegram|facebookexternalhit|skypeuripreview|bingpreview|embedly|curl\/|wget|python-requests|go-http-client|java\/|okhttp|headless|phantom|puppeteer|playwright|axios|libwww|apache-httpclient/i;

/** True if this user-agent is a known non-human fetcher. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false; // absent UA alone isn't enough to call it a bot
  return BOT_UA.test(ua);
}

/**
 * Classify a tracking hit. `msSinceSend` is (event time − send time) when the
 * send time is known (embedded in the signed token); pass null/undefined if it
 * isn't (e.g. an old token) and only the UA signal is used.
 */
export function isBotHit(
  ua: string | null | undefined,
  msSinceSend: number | null | undefined
): boolean {
  if (isBotUserAgent(ua)) return true;
  if (typeof msSinceSend === "number" && msSinceSend >= 0 && msSinceSend < PREFETCH_MS) {
    return true;
  }
  return false;
}
