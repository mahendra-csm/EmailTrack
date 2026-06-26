"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { SmtpAccountUsage } from "../../components/SmtpUsage";

interface StageRow {
  stage_id: number;
  contact_id: number;
  email: string;
  name: string | null;
  status: "pending" | "sending" | "sent" | "failed" | "canceled";
  sent_at: string | null;
  attempts: number;
  last_error: string | null;
  sender: string | null;
}
interface Summary {
  seq: number;
  label: string;
  send_date: string | null;
  pending: number;
  sent: number;
  failed: number;
  canceled: number;
  total: number;
}
interface StageBlock {
  stage: number;
  label: string;
  due: string | null;
  rows: StageRow[];
}
interface Deliverability {
  sent: number;
  failed: number;
  opens: number;
  opensUnique: number;
  clicksUnique: number;
  replies: number;
  unsubs: number;
  bounces: number;
}
interface Detail {
  campaign: {
    id: number;
    name: string;
    status: string;
    created_at: string;
    batch_type: number;
    start_date: string | null;
    auto_send: number;
    country: string | null;
  };
  summaries: Summary[];
  stages: StageBlock[];
  deliverability: Deliverability;
}

function rate(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}
interface BatchResult {
  sent: number;
  failed: number;
  remaining: number;
  exhausted: boolean;
  error?: string;
  message?: string;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [accounts, setAccounts] = useState<SmtpAccountUsage[]>([]);
  const [activeStage, setActiveStage] = useState<number>(1);
  const [selectedSmtp, setSelectedSmtp] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to load campaign.");
      return;
    }
    setData(await res.json());
  }, [id]);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/smtp", { cache: "no-store" });
    const d = await res.json();
    setAccounts(d.accounts ?? []);
  }, []);

  useEffect(() => {
    loadDetail();
    loadAccounts();
  }, [loadDetail, loadAccounts]);

  useEffect(() => {
    if (selectedSmtp === null && accounts.length > 0) {
      const firstFree = accounts.find((a) => a.remaining > 0) ?? accounts[0];
      setSelectedSmtp(firstFree.id);
    }
  }, [accounts, selectedSmtp]);

  const stageBlock = useMemo(
    () => data?.stages.find((s) => s.stage === activeStage),
    [data, activeStage]
  );
  const stageSummary = useMemo(
    () => data?.summaries.find((s) => s.seq === activeStage),
    [data, activeStage]
  );
  const activeLabel = stageBlock?.label ?? `Email ${activeStage}`;

  const today = new Date().toISOString().slice(0, 10);
  const nextDue = useMemo(
    () =>
      data?.summaries
        .filter((s) => s.pending > 0 && s.send_date)
        .sort((a, b) => (a.send_date! < b.send_date! ? -1 : 1))[0] ?? null,
    [data]
  );

  // Manual override: push the active email now in serverless-safe batches.
  async function sendStage() {
    if (!selectedSmtp) return;
    setSending(true);
    cancelRef.current = false;
    let totalSent = 0;
    let totalFailed = 0;
    setProgress("Starting…");
    try {
      while (!cancelRef.current) {
        const res: BatchResult = await fetch("/api/send-stage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaign_id: Number(id),
            stage: activeStage,
            smtp_account_id: selectedSmtp,
            batch_size: 20,
          }),
        }).then((r) => r.json());

        if (res.error) {
          setProgress(res.error);
          break;
        }
        totalSent += res.sent ?? 0;
        totalFailed += res.failed ?? 0;
        setProgress(
          `Sent ${totalSent}${totalFailed ? `, ${totalFailed} failed` : ""} · ${res.remaining} left`
        );
        await loadDetail();
        await loadAccounts();

        if (res.exhausted) {
          setProgress(`${res.message ?? "Sender hit its daily limit."} (sent ${totalSent})`);
          break;
        }
        if (res.remaining <= 0) {
          setProgress(`Done — sent ${totalSent}${totalFailed ? `, ${totalFailed} failed` : ""}.`);
          break;
        }
        if ((res.sent ?? 0) === 0 && (res.failed ?? 0) === 0) {
          setProgress(res.message ?? "Stopped — nothing was sent.");
          break;
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function toggleAutoSend() {
    if (!data) return;
    const next = data.campaign.auto_send === 1 ? 0 : 1;
    await fetch(`/api/campaigns/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_send: next }),
    });
    await loadDetail();
  }

  async function retryFailed() {
    setProgress("Re-queuing failed…");
    const res = await fetch(`/api/campaigns/${id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: activeStage }),
    }).then((r) => r.json());
    setProgress(`Re-queued ${res.requeued ?? 0} failed — they'll send on the next run.`);
    await loadDetail();
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const auto = data.campaign.auto_send === 1 && data.campaign.status !== "completed";

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href="/" className="muted">
            ← All campaigns
          </Link>
          <h1 style={{ marginTop: 6 }}>{data.campaign.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Batch {data.campaign.batch_type}
            {data.campaign.country ? ` · ${data.campaign.country}` : ""} · starts{" "}
            {data.campaign.start_date ?? "—"} · created {data.campaign.created_at}
          </p>
        </div>
        <div className="row-actions">
          <button
            className="btn secondary"
            onClick={toggleAutoSend}
            title={data.campaign.auto_send === 1 ? "Stop auto-sending this campaign" : "Resume auto-sending"}
          >
            {data.campaign.auto_send === 1 ? "⏸ Pause sending" : "▶ Resume sending"}
          </button>
          <Link href={`/campaigns/${id}/tracking`} className="btn secondary">
            Tracking
          </Link>
          <Link href={`/campaigns/${id}/logs`} className="btn secondary">
            Logs
          </Link>
        </div>
      </div>

      {/* Automatic-sending banner */}
      <div
        className="notice"
        style={{
          background: auto ? "#eafff1" : "#fff7e6",
          border: "1px solid var(--border)",
          marginBottom: 14,
        }}
      >
        {data.campaign.status === "completed" ? (
          <>✅ <strong>Completed</strong> — every scheduled email has been sent.</>
        ) : auto ? (
          <>
            🤖 <strong>Automatic</strong> — emails go out on their own each day via the scheduler.{" "}
            {nextDue ? (
              <>
                Next: <strong>{nextDue.label}</strong> on <strong>{nextDue.send_date}</strong>
                {nextDue.send_date && nextDue.send_date <= today ? " (due now)" : ""} ·{" "}
                {nextDue.pending} pending.
              </>
            ) : (
              <>Nothing left pending.</>
            )}
          </>
        ) : (
          <>⏸ Auto-send is off for this campaign — use “Send now” below.</>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid cards-row" style={{ marginBottom: 8 }}>
        <div className="stat">
          <div className="label">Total contacts</div>
          <div className="value">{data.summaries[0]?.total ?? 0}</div>
        </div>
        {data.summaries.map((s) => (
          <div className="stat" key={s.seq}>
            <div className="label">
              {s.label}
              {s.send_date ? ` · ${s.send_date}` : ""}
            </div>
            <div className="value">
              {s.sent}
              <span className="muted" style={{ fontSize: 15 }}>
                {" "}
                / {s.total}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {s.pending} pending{s.failed ? ` · ${s.failed} failed` : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Per-campaign deliverability */}
      <h2 style={{ fontSize: 15, margin: "18px 2px 8px" }}>Deliverability</h2>
      <div className="grid cards-row" style={{ marginBottom: 8 }}>
        <div className="stat">
          <div className="label">Sent</div>
          <div className="value">{data.deliverability.sent.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="label">Delivered</div>
          <div className="value">{data.deliverability.delivered.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="label">Open rate</div>
          <div className="value">{rate(data.deliverability.opensUnique, data.deliverability.delivered)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {data.deliverability.opensUnique.toLocaleString()} opened
          </div>
        </div>
        <div className="stat">
          <div className="label">Click rate</div>
          <div className="value">{rate(data.deliverability.clicksUnique, data.deliverability.delivered)}</div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "0 2px 14px" }}>
        Rates above are calculated over delivered emails (sent minus bounces).
      </p>
        <div className="stat">
          <div className="label">Replies</div>
          <div className="value">{data.deliverability.replies.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="label">Bounced</div>
          <div className="value">{data.deliverability.bounces.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="label">Unsub</div>
          <div className="value">{data.deliverability.unsubs.toLocaleString()}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="send-bar" style={{ marginTop: 0 }}>
          <div className="sender-field">
            <span className="lab">Send from</span>
            <select
              value={selectedSmtp ?? ""}
              onChange={(e) => setSelectedSmtp(Number(e.target.value))}
              disabled={sending}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.remaining <= 0}>
                  {a.email} — {a.remaining.toLocaleString()} left
                  {a.remaining <= 0 ? " (full)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn"
            disabled={!selectedSmtp || (stageSummary?.pending ?? 0) === 0 || sending}
            onClick={sendStage}
            style={{ alignSelf: "flex-end" }}
            title="Override the schedule and send this email right now"
          >
            {sending ? "Sending…" : `Send now: ${activeLabel} (${stageSummary?.pending ?? 0})`}
          </button>
          {sending && (
            <button
              className="btn secondary"
              onClick={() => {
                cancelRef.current = true;
              }}
              style={{ alignSelf: "flex-end" }}
            >
              Stop
            </button>
          )}
          {progress && (
            <span className="progress" style={{ alignSelf: "flex-end" }}>
              {progress}
            </span>
          )}
        </div>

        <div className="tabs" style={{ marginTop: 14 }}>
          {data.stages.map((s) => {
            const summ = data.summaries.find((x) => x.seq === s.stage);
            return (
              <button
                key={s.stage}
                className={`tab${activeStage === s.stage ? " active" : ""}`}
                onClick={() => setActiveStage(s.stage)}
              >
                {s.label}
                <span className="pill">{summ?.pending ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div className="counts muted">
              {stageSummary?.sent ?? 0} sent · {stageSummary?.pending ?? 0} pending
              {stageSummary?.failed ? ` · ${stageSummary.failed} failed` : ""}
              {stageSummary?.canceled ? ` · ${stageSummary.canceled} suppressed` : ""}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {(stageSummary?.failed ?? 0) > 0 && (
                <button className="btn secondary" onClick={retryFailed} disabled={sending}>
                  Retry {stageSummary?.failed} failed
                </button>
              )}
              <span className="due-tag">Scheduled: {stageBlock?.due ?? "—"}</span>
            </div>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Sender</th>
                  <th>Sent at</th>
                </tr>
              </thead>
              <tbody>
                {stageBlock?.rows.map((r) => (
                  <tr key={r.stage_id}>
                    <td>{r.email}</td>
                    <td>{r.name ?? <span className="muted">—</span>}</td>
                    <td>
                      <span className={`badge ${r.status}`}>{r.status}</span>
                      {r.last_error && (r.status === "failed" || r.status === "canceled") && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2, maxWidth: 260 }}>
                          {r.attempts > 0 ? `${r.attempts}× · ` : ""}
                          {r.last_error}
                        </div>
                      )}
                    </td>
                    <td className="muted">{r.sender ?? "—"}</td>
                    <td className="muted">{r.sent_at ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
