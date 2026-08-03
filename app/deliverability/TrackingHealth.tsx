"use client";

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Two things that used to be invisible and caused all the confusion:
//
//   1. WHY the open count is lower than the raw pixel hits — how much traffic
//      was rejected as scanners / privacy-proxy pre-caching / delivery-time
//      prefetch, broken down by reason.
//   2. WHETHER reply detection is running at all — the last IMAP poll, what it
//      scanned, and the exact error if a mailbox refused the connection, with a
//      button to run it on demand instead of waiting for the cron.
// ---------------------------------------------------------------------------

interface FilteredHit {
  type: string;
  reason: string;
  n: number;
}
interface PollRow {
  id: number;
  ran_at: string;
  source: string | null;
  accounts: number;
  scanned: number;
  replies: number;
  bounces: number;
  errors: string | null;
}

const REASON_LABEL: Record<string, string> = {
  prefetch: "Scanned at delivery (opened seconds after the send)",
  "privacy-proxy": "Apple Mail Privacy / image proxy pre-cache",
  "scanner-ua": "Known security scanner or crawler",
  "no-ua": "No browser identity (script)",
  unclassified: "Flagged before reasons were recorded",
};

export default function TrackingHealth({
  filtered,
  prefetchSec,
}: {
  filtered: FilteredHit[];
  prefetchSec: number;
}) {
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadPolls = useCallback(async () => {
    const res = await fetch("/api/replies/poll", { cache: "no-store" });
    if (res.ok) setPolls((await res.json()).polls ?? []);
  }, []);

  useEffect(() => {
    loadPolls();
  }, [loadPolls]);

  async function pollNow() {
    setBusy("poll");
    setMsg(null);
    try {
      const res = await fetch("/api/replies/poll", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Poll failed.");
      setMsg(
        `Scanned ${d.scanned} message${d.scanned === 1 ? "" : "s"} across ${d.accounts} mailbox` +
          `${d.accounts === 1 ? "" : "es"} (${(d.folders ?? []).join(", ") || "INBOX"}): ` +
          `${d.replies} new repl${d.replies === 1 ? "y" : "ies"}, ${d.bounces} bounce${
            d.bounces === 1 ? "" : "s"
          }, ${d.autoReplies ?? 0} auto-reply ignored.` +
          (d.errors?.length ? ` Errors: ${d.errors.join(" | ")}` : "")
      );
      await loadPolls();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Poll failed.");
    } finally {
      setBusy(null);
    }
  }

  async function rescan() {
    if (
      !confirm(
        "Re-check past opens and clicks with the current bot filter? Hits that were " +
          "delivery-time scans or privacy-proxy pre-caching will be reclassified as machine " +
          "traffic, so historical open/click numbers will go DOWN to the real figures."
      )
    ) {
      return;
    }
    setBusy("rescan");
    setMsg(null);
    try {
      const res = await fetch("/api/track/recount", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Re-scan failed.");
      setMsg(
        `Re-scanned ${d.scanned.toLocaleString()} past open/click hits — ${d.flagged.toLocaleString()} were machine traffic and no longer count. Reload to see the corrected rates.`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Re-scan failed.");
    } finally {
      setBusy(null);
    }
  }

  const totalFiltered = filtered.reduce((a, f) => a + Number(f.n), 0);
  const last = polls[0];

  return (
    <>
      <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Tracking accuracy</h2>
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginBottom: 12 }}>
          Opens and clicks only count when a real person is behind them. A hit is
          rejected when it arrives within <strong>{prefetchSec}s</strong> of the send
          (mail gateways fetch every image and follow every link at delivery), when
          it comes from Apple Mail Privacy Protection or another image proxy that
          pre-downloads images whether or not the mail is read, when the user-agent
          is a known scanner, or when there is no user-agent at all. Tune the window
          with the <code>PREFETCH_SEC</code> env var.
        </div>

        {totalFiltered > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Rejected as machine traffic</th>
                <th>Opens</th>
                <th>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set(filtered.map((f) => f.reason))].map((reason) => {
                const opens = filtered.find((f) => f.reason === reason && f.type === "open")?.n ?? 0;
                const clicks = filtered.find((f) => f.reason === reason && f.type === "click")?.n ?? 0;
                return (
                  <tr key={reason}>
                    <td>{REASON_LABEL[reason] ?? reason}</td>
                    <td>{Number(opens).toLocaleString()}</td>
                    <td>{Number(clicks).toLocaleString()}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ fontWeight: 600 }}>Total excluded</td>
                <td style={{ fontWeight: 600 }}>
                  {filtered
                    .filter((f) => f.type === "open")
                    .reduce((a, f) => a + Number(f.n), 0)
                    .toLocaleString()}
                </td>
                <td style={{ fontWeight: 600 }}>
                  {filtered
                    .filter((f) => f.type === "click")
                    .reduce((a, f) => a + Number(f.n), 0)
                    .toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No machine traffic recorded yet.
          </p>
        )}

        <div className="row-actions" style={{ marginTop: 14 }}>
          <button className="btn secondary" onClick={rescan} disabled={busy !== null}>
            {busy === "rescan" ? "Re-scanning…" : "Re-check past opens & clicks"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Applies the current filter to events recorded before it was tightened.
          </span>
        </div>
      </div>

      <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Reply detection</h2>
      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={pollNow} disabled={busy !== null}>
            {busy === "poll" ? "Scanning mailboxes…" : "↻ Poll mailboxes now"}
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {last
              ? `Last run ${last.ran_at} UTC (${last.source ?? "cron"}) — scanned ${last.scanned}, ` +
                `${last.replies} replies, ${last.bounces} bounces` +
                (last.errors ? ` · errors: ${last.errors}` : "")
              : "No poll has ever run — replies and bounces will not appear until it does."}
          </span>
        </div>

        {msg && (
          <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
            {msg}
          </div>
        )}

        {polls.length > 1 && (
          <table style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Ran at (UTC)</th>
                <th>By</th>
                <th>Scanned</th>
                <th>Replies</th>
                <th>Bounces</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {polls.map((p) => (
                <tr key={p.id}>
                  <td>{p.ran_at}</td>
                  <td>{p.source ?? "cron"}</td>
                  <td>{p.scanned}</td>
                  <td>{p.replies}</td>
                  <td>{p.bounces}</td>
                  <td style={{ color: p.errors ? "var(--red)" : undefined }}>
                    {p.errors ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
