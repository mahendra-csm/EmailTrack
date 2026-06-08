"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { SmtpAccountUsage } from "../../components/SmtpUsage";

interface StageRow {
  stage_id: number;
  contact_id: number;
  email: string;
  name: string | null;
  status: "pending" | "sent";
  sent_at: string | null;
}
interface Job {
  total: number;
  sent: number;
  failed: number;
  done: boolean;
  smtpEmail?: string;
  message?: string;
}
interface Summary {
  stage: number;
  label: string;
  pending: number;
  sent: number;
  total: number;
}
interface StageBlock {
  stage: number;
  due: string;
  rows: StageRow[];
  job: Job | null;
}
interface Detail {
  campaign: { id: number; name: string; status: string; created_at: string };
  summaries: Summary[];
  stages: StageBlock[];
}

const STAGE_LABEL: Record<number, string> = { 1: "Day 1", 5: "Day 5", 10: "Day 10" };

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [accounts, setAccounts] = useState<SmtpAccountUsage[]>([]);
  const [activeStage, setActiveStage] = useState<number>(1);
  const [selectedSmtp, setSelectedSmtp] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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

  // Default the sender to the first account with quota left.
  useEffect(() => {
    if (selectedSmtp === null && accounts.length > 0) {
      const firstFree = accounts.find((a) => a.remaining > 0) ?? accounts[0];
      setSelectedSmtp(firstFree.id);
    }
  }, [accounts, selectedSmtp]);

  // Poll while any job is running.
  useEffect(() => {
    const running = data?.stages.some((s) => s.job && !s.job.done);
    if (!running) return;
    const t = setInterval(() => {
      loadDetail();
      loadAccounts();
    }, 1500);
    return () => clearInterval(t);
  }, [data, loadDetail, loadAccounts]);

  const stageBlock = useMemo(
    () => data?.stages.find((s) => s.stage === activeStage),
    [data, activeStage]
  );
  const stageSummary = useMemo(
    () => data?.summaries.find((s) => s.stage === activeStage),
    [data, activeStage]
  );

  async function sendStage() {
    if (!selectedSmtp) return;
    setSending(true);
    try {
      await fetch("/api/send-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: Number(id),
          stage: activeStage,
          smtp_account_id: selectedSmtp,
        }),
      });
      await loadDetail();
      await loadAccounts();
    } finally {
      setSending(false);
    }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const job = stageBlock?.job ?? null;
  const running = !!(job && !job.done);

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href="/" className="muted">
            ← All campaigns
          </Link>
          <h1 style={{ marginTop: 6 }}>{data.campaign.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Created {data.campaign.created_at}
          </p>
        </div>
        <div className="row-actions">
          <Link href={`/campaigns/${id}/tracking`} className="btn secondary">
            Tracking
          </Link>
          <Link href={`/campaigns/${id}/logs`} className="btn secondary">
            Logs
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid cards-row" style={{ marginBottom: 8 }}>
        <div className="stat">
          <div className="label">Total contacts</div>
          <div className="value">{data.summaries[0]?.total ?? 0}</div>
        </div>
        {data.summaries.map((s) => (
          <div className="stat" key={s.stage}>
            <div className="label">{s.label}</div>
            <div className="value">
              {s.sent}
              <span className="muted" style={{ fontSize: 15 }}>
                {" "}
                / {s.total}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {s.pending} pending
            </div>
          </div>
        ))}
      </div>

      {/* Send bar: pick sender + send the active stage */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="send-bar" style={{ marginTop: 0 }}>
          <div className="sender-field">
            <span className="lab">Send from</span>
            <select
              value={selectedSmtp ?? ""}
              onChange={(e) => setSelectedSmtp(Number(e.target.value))}
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
            disabled={!selectedSmtp || (stageSummary?.pending ?? 0) === 0 || sending || running}
            onClick={sendStage}
            style={{ alignSelf: "flex-end" }}
          >
            {running ? "Sending…" : `Send ${STAGE_LABEL[activeStage]} (${stageSummary?.pending ?? 0})`}
          </button>
          {job && (
            <span className="progress" style={{ alignSelf: "flex-end" }}>
              {running
                ? `Sending via ${job.smtpEmail} … ${job.sent + job.failed}/${job.total}`
                : job.message ??
                  `Done — ${job.sent} sent${job.failed ? `, ${job.failed} failed` : ""}`}
            </span>
          )}
        </div>

        {/* Horizontal stage tabs */}
        <div className="tabs" style={{ marginTop: 14 }}>
          {data.stages.map((s) => {
            const summ = data.summaries.find((x) => x.stage === s.stage);
            return (
              <button
                key={s.stage}
                className={`tab${activeStage === s.stage ? " active" : ""}`}
                onClick={() => setActiveStage(s.stage)}
              >
                {STAGE_LABEL[s.stage]}
                <span className="pill">{summ?.pending ?? 0}</span>
              </button>
            );
          })}
        </div>

        {/* Active stage email list (vertical) */}
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
            </div>
            <span className="due-tag">Follow-up due: {stageBlock?.due}</span>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
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
                    </td>
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
