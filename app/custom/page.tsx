"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia", "Germany",
  "France", "Italy", "Spain", "Netherlands", "United Arab Emirates", "Saudi Arabia",
  "Singapore", "Malaysia", "Indonesia", "Philippines", "Nigeria", "South Africa",
  "Brazil", "Mexico", "Japan", "China", "South Korea", "Pakistan", "Bangladesh",
  "Sri Lanka", "Egypt", "Turkey", "Poland", "Sweden",
];

interface CustomMail {
  id: number;
  name: string;
  country: string | null;
  status: string;
  created_at: string;
  send_limit: number | null;
  concurrency: number | null;
  delay_ms: number | null;
  total_contacts: number;
  sent: number;
  pending: number;
  failed: number;
  opens_unique: number;
  clicks_unique: number;
}

interface RunResult {
  sent: number;
  failed: number;
  remaining: number;
  noQuota: number;
  done: boolean;
  message?: string;
  error?: string;
}

export default function CustomMailPage() {
  const [mails, setMails] = useState<CustomMail[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Composer state
  const [html, setHtml] = useState("");
  const [emails, setEmails] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [concurrency, setConcurrency] = useState(1);
  const [delaySec, setDelaySec] = useState(2);

  const [limit, setLimit] = useState(50);
  const limitTouched = useRef(false);

  // Live count of the pasted addresses (same rules the server parses with).
  const pastedCount = useMemo(() => {
    const found = emails.match(/[^\s<>,;:"']+@[^\s<>,;:"']+\.[^\s<>,;:"']+/g) ?? [];
    return new Set(found.map((e) => e.toLowerCase())).size;
  }, [emails]);

  // Follow the pasted list until the limit is edited by hand, so pasting 200
  // addresses doesn't quietly send to the first 50.
  useEffect(() => {
    if (!limitTouched.current && pastedCount > 0) setLimit(pastedCount);
  }, [pastedCount]);

  // Send-loop state
  const [runningId, setRunningId] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/custom", { cache: "no-store" });
    if (res.ok) setMails((await res.json()).mails ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh the table while a send is running so opens/clicks tick up live.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10000);
    return () => clearInterval(t);
  }, [load]);

  /**
   * Drive one custom mail to completion: each call sends a small batch at the
   * chosen concurrency/pace, and we loop until nothing is pending. Stopping just
   * ends the loop — unsent rows stay pending and Resume picks them up.
   */
  const runMail = useCallback(
    async (id: number, conc?: number, delayMs?: number) => {
      setRunningId(id);
      setError(null);
      stopRef.current = false;
      let sent = 0;
      let failed = 0;
      setProgress("Starting…");
      try {
        while (!stopRef.current) {
          const res: RunResult = await fetch("/api/custom/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaign_id: id,
              concurrency: conc,
              delay_ms: delayMs,
            }),
          }).then((r) => r.json());

          if (res.error) {
            setProgress(res.error);
            break;
          }
          sent += res.sent ?? 0;
          failed += res.failed ?? 0;
          setProgress(
            `Sent ${sent}${failed ? ` · ${failed} failed` : ""} · ${res.remaining} left`
          );
          await load();

          if (res.done) {
            setProgress(`Finished — sent ${sent}${failed ? `, ${failed} failed` : ""}.`);
            break;
          }
          if ((res.sent ?? 0) === 0 && (res.failed ?? 0) === 0) {
            setProgress(
              res.message ?? "Stopped — nothing could be sent right now. Try Resume later."
            );
            break;
          }
        }
        if (stopRef.current) {
          setProgress(`Stopped — sent ${sent}. The rest stays queued; press Resume anytime.`);
        }
      } finally {
        setRunningId(null);
        await load();
      }
    },
    [load]
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const form = e.currentTarget;
      const fd = new FormData(form);
      fd.set("html", html);
      fd.set("emails", emails);
      fd.set("concurrency", String(concurrency));
      fd.set("delay_ms", String(Math.round(delaySec * 1000)));
      const res = await fetch("/api/custom", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create the custom mail.");

      setNotice(
        `Queued ${data.queued} recipient${data.queued === 1 ? "" : "s"}` +
          (data.skipped ? ` (${data.skipped} of ${data.inFile} in the file skipped by your limit)` : "") +
          " — sending now."
      );
      form.reset();
      setHtml("");
      setEmails("");
      await load();
      // Send it straight away at the pace just chosen.
      await runMail(data.campaignId, concurrency, Math.round(delaySec * 1000));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the custom mail.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div className="page-head">
        <div>
          <h1>Custom mail</h1>
          <p className="muted" style={{ margin: 0 }}>
            Paste your own HTML, upload a sheet, cap how many go out — one send,
            paced 1–5 at a time, with the same logs, opens, clicks and replies as
            a campaign.
          </p>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {/* Live send progress */}
      {(runningId !== null || progress) && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14 }}>
              {runningId !== null ? "Sending…" : "Last run"}
            </strong>
            <span className="muted" style={{ fontSize: 13 }}>{progress}</span>
            <div className="spacer" style={{ flex: 1 }} />
            {runningId !== null && (
              <button
                className="btn secondary"
                onClick={() => {
                  stopRef.current = true;
                  setProgress("Stopping after the current batch…");
                }}
              >
                ■ Stop
              </button>
            )}
          </div>
        </div>
      )}

      {/* Existing custom mails */}
      {mails.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 26 }}>
          <table>
            <thead>
              <tr>
                <th>Custom mail</th>
                <th>Queued</th>
                <th>Sent</th>
                <th>Left</th>
                <th>Failed</th>
                <th>Opens</th>
                <th>Clicks</th>
                <th>Pace</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mails.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/campaigns/${m.id}`} style={{ fontWeight: 600 }}>
                      {m.name}
                    </Link>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {m.country ? `${m.country} · ` : ""}
                      {m.created_at}
                    </div>
                  </td>
                  <td>{m.total_contacts}</td>
                  <td>{m.sent}</td>
                  <td>{m.pending}</td>
                  <td>{m.failed}</td>
                  <td>{m.opens_unique}</td>
                  <td>{m.clicks_unique}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {m.concurrency ?? 1} at a time
                    {m.delay_ms ? ` · ${(m.delay_ms / 1000).toFixed(1)}s gap` : ""}
                  </td>
                  <td>
                    <span className="badge active">{m.pending > 0 ? m.status : "completed"}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      {m.pending > 0 && (
                        <button
                          className="btn secondary"
                          disabled={runningId !== null}
                          onClick={() => runMail(m.id, m.concurrency ?? 1, m.delay_ms ?? 0)}
                        >
                          {m.sent > 0 ? "▶ Resume" : "▶ Send"}
                        </button>
                      )}
                      <Link className="btn secondary" href={`/campaigns/${m.id}/logs`}>
                        Logs
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: 16, margin: "0 2px 12px" }}>New custom mail</h2>

      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="lab">Name (internal)</span>
          <input type="text" name="name" placeholder="Oncology invite — 3 Aug test" required />
        </label>

        <label className="field">
          <span className="lab">Subject line</span>
          <input
            type="text"
            name="subject"
            placeholder="Invitation to speak at …"
            required
          />
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            <code>{"{{name}}"}</code> and <code>{"{{email}}"}</code> work here and in the HTML.
          </span>
        </label>

        <label className="field">
          <span className="lab">Email HTML</span>
          <textarea
            name="html_display"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="<html>…paste your full email HTML here…</html>"
            required
            rows={14}
            style={{
              width: "100%",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12.5,
              lineHeight: 1.5,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--border)",
              resize: "vertical",
            }}
          />
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Links are rewritten for per-recipient click tracking and an open pixel
            is added automatically. If you don&apos;t include{" "}
            <code>{"{{unsubscribe_url}}"}</code>, a small unsubscribe footer is
            appended for you.
          </span>
        </label>

        <div className="field">
          <span className="lab" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Preview</span>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: "2px 10px", fontSize: 12 }}
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? "Hide" : "Show"}
            </button>
          </span>
          {showPreview && (
            <iframe
              title="Custom mail preview"
              srcDoc={html || "<p style='font-family:sans-serif;color:#999'>Paste HTML to preview it here.</p>"}
              style={{
                width: "100%",
                height: 420,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "#fff",
              }}
            />
          )}
        </div>

        <label className="field">
          <span className="lab" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Recipients — paste addresses</span>
            <span className="muted" style={{ fontWeight: 400 }}>
              {pastedCount} address{pastedCount === 1 ? "" : "es"} detected
            </span>
          </span>
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder={
              "one@example.com\nDr. Jane Roe <jane@example.com>\nthree@example.com, Prof. Lee\nfour@example.com; five@example.com"
            }
            rows={7}
            style={{
              width: "100%",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12.5,
              lineHeight: 1.6,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--border)",
              resize: "vertical",
            }}
          />
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            One per line, or separated by commas/semicolons. <code>Name &lt;email&gt;</code>{" "}
            works too — the name feeds <code>{"{{name}}"}</code>. Duplicates and
            invalid entries are dropped automatically.
          </span>
        </label>

        <label className="field">
          <span className="lab">…or upload a sheet (optional)</span>
          <input type="file" name="file" accept=".xlsx,.xls,.csv" />
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            One <strong>email</strong> column (optional <strong>name</strong>). If
            you do both, the pasted list comes first and duplicates are merged.
          </span>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label className="field">
            <span className="lab">Send limit</span>
            <input
              type="number"
              name="limit"
              min={1}
              value={limit}
              onChange={(e) => {
                limitTouched.current = true;
                setLimit(Number(e.target.value));
              }}
              required
            />
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Only the first N addresses are queued — the rest are ignored.
            </span>
          </label>

          <label className="field">
            <span className="lab">In parallel</span>
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} at a time
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Each lane uses a different mailbox where possible.
            </span>
          </label>

          <label className="field">
            <span className="lab">Gap between sends</span>
            <input
              type="number"
              min={0}
              max={60}
              step={0.5}
              value={delaySec}
              onChange={(e) => setDelaySec(Number(e.target.value))}
            />
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Seconds each lane waits between its own sends.
            </span>
          </label>
        </div>

        <label className="field">
          <span className="lab">Target country (optional)</span>
          <input type="text" name="country" list="country-list" placeholder="e.g. India" />
          <datalist id="country-list">
            {COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <div className="card" style={{ marginBottom: 14, background: "#fff7e6" }}>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            <strong>How it sends:</strong> this is a one-shot send — it is never
            auto-resent and the daily cron never touches it. Pressing the button
            queues your capped list and starts sending immediately at the pace
            above; the page keeps going until the list is finished. You can Stop
            at any point and Resume later — nothing is ever sent twice.
            Unsubscribed, bounced and suppressed addresses are skipped as usual.
          </div>
        </div>

        <button className="btn" type="submit" disabled={busy || runningId !== null}>
          {busy ? "Queuing…" : "Create & send now"}
        </button>
      </form>
    </div>
  );
}
