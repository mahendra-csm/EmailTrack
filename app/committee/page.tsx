"use client";

import { useCallback, useEffect, useState } from "react";

interface Member {
  contact_id: number;
  email: string;
  name: string | null;
  coupon: string | null;
  status: "pending" | "sending" | "sent" | "failed" | "canceled";
  sent_at: string | null;
  last_error: string | null;
  opens: number;
  clicks: number;
  replied: boolean;
  bounced: boolean;
  unsubscribed: boolean;
}
interface Summary {
  total: number;
  sent: number;
  pending: number;
  opened: number;
  clicked: number;
  bounced: number;
  replied: number;
}
interface Data {
  members: Member[];
  summary: Summary;
  sender: string;
  subject: string;
}

function displayStatus(m: Member): { label: string; cls: string } {
  if (m.bounced) return { label: "bounced", cls: "failed" };
  if (m.unsubscribed) return { label: "unsubscribed", cls: "canceled" };
  if (m.replied) return { label: "replied", cls: "active" };
  if (m.status === "sent") return { label: "sent", cls: "sent" };
  if (m.status === "failed") return { label: "failed", cls: "failed" };
  if (m.status === "sending") return { label: "sending", cls: "sending" };
  return { label: "pending", cls: "pending" };
}

export default function CommitteePage() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/committee", { cache: "no-store" });
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sendOne(contactId: number) {
    setBusy((b) => new Set(b).add(contactId));
    setMsg(null);
    try {
      const res = await fetch("/api/committee/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      }).then((r) => r.json());
      if (res.error) setMsg(`Error: ${res.error}`);
      else if (res.skipped) setMsg(res.message ?? "Already sent.");
      else if (res.outcome === "sent") setMsg(`Sent via ${res.smtp}.`);
      else setMsg(`Result: ${res.outcome}${res.error ? ` — ${res.error}` : ""}`);
      await load();
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(contactId);
        return n;
      });
    }
  }

  if (!data) return <p className="muted">Loading…</p>;

  const cards: { label: string; value: number }[] = [
    { label: "Members", value: data.summary.total },
    { label: "Sent", value: data.summary.sent },
    { label: "Opened", value: data.summary.opened },
    { label: "Clicked", value: data.summary.clicked },
    { label: "Replied", value: data.summary.replied },
    { label: "Bounced", value: data.summary.bounced },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Scientific Committee</h1>
          <p className="muted" style={{ margin: 0 }}>
            Sends from <strong>{data.sender}</strong> · subject: “{data.subject}” ·
            personalised with each member’s name &amp; coupon code. Click{" "}
            <strong>Send</strong> per row.
          </p>
        </div>
      </div>

      <div className="grid cards-row" style={{ marginBottom: 14 }}>
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <div className="label">{c.label}</div>
            <div className="value">{c.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {msg && (
        <div className="notice" style={{ marginBottom: 14 }}>
          {msg}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Coupon</th>
              <th>Status</th>
              <th>Engagement</th>
              <th>Sent at</th>
              <th style={{ textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => {
              const st = displayStatus(m);
              const sending = busy.has(m.contact_id);
              const done = m.status === "sent" || m.status === "sending";
              return (
                <tr key={m.contact_id}>
                  <td>{m.name ?? <span className="muted">—</span>}</td>
                  <td>{m.email}</td>
                  <td>
                    <code style={{ fontSize: 12 }}>{m.coupon}</code>
                  </td>
                  <td>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    {m.last_error && (m.status === "failed" || m.bounced) && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2, maxWidth: 240 }}>
                        {m.last_error}
                      </div>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {m.opens > 0 ? `👁 ${m.opens}` : "—"} {m.clicks > 0 ? `· 🔗 ${m.clicks}` : ""}
                  </td>
                  <td className="muted">{m.sent_at?.slice(0, 16) ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn"
                      style={{ padding: "5px 14px", fontSize: 13 }}
                      disabled={sending || done}
                      onClick={() => sendOne(m.contact_id)}
                    >
                      {sending ? "Sending…" : m.status === "sent" ? "Sent" : "Send"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
