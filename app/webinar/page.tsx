"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WEBINAR_TEMPLATE_META } from "@/lib/webinarTemplates";

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia", "Germany",
  "France", "Italy", "Spain", "Netherlands", "United Arab Emirates", "Saudi Arabia",
  "Singapore", "Malaysia", "Indonesia", "Philippines", "Nigeria", "South Africa",
  "Brazil", "Mexico", "Japan", "China", "South Korea", "Pakistan", "Bangladesh",
  "Sri Lanka", "Egypt", "Turkey", "Poland", "Sweden",
];

interface WebinarRow {
  id: number;
  name: string;
  country: string | null;
  status: string;
  total_contacts: number;
  total_sent: number;
  total_pending: number;
  created_at: string;
}

export default function WebinarPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<number>(WEBINAR_TEMPLATE_META[0]?.id ?? 1);
  const [webinars, setWebinars] = useState<WebinarRow[]>([]);

  const loadWebinars = useCallback(async () => {
    const res = await fetch("/api/webinar", { cache: "no-store" });
    if (res.ok) setWebinars((await res.json()).webinars ?? []);
  }, []);

  useEffect(() => {
    loadWebinars();
  }, [loadWebinars]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("template_id", String(templateId));
      const res = await fetch("/api/webinar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create webinar.");
      router.push(`/campaigns/${data.campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webinar.");
      setBusy(false);
    }
  }

  const selected = WEBINAR_TEMPLATE_META.find((t) => t.id === templateId);

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <h1>Webinar</h1>
          <p className="muted" style={{ margin: 0 }}>
            Pick a template, name it, upload your sheet — one blast to the whole
            list, with full open/click tracking.
          </p>
        </div>
      </div>

      {/* Existing webinars */}
      {webinars.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 26 }}>
          <table>
            <thead>
              <tr>
                <th>Webinar</th>
                <th>Country</th>
                <th>Contacts</th>
                <th>Sent</th>
                <th>Pending</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {webinars.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link href={`/campaigns/${w.id}`} style={{ fontWeight: 600 }}>
                      {w.name}
                    </Link>
                  </td>
                  <td>{w.country ?? <span className="muted">—</span>}</td>
                  <td>{w.total_contacts}</td>
                  <td>{w.total_sent}</td>
                  <td>{w.total_pending}</td>
                  <td>
                    <span className="badge active">{w.status}</span>
                  </td>
                  <td className="muted">{w.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: 16, margin: "0 2px 12px" }}>New webinar</h2>

      {error && <div className="notice error">{error}</div>}

      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="lab">Webinar name</span>
          <input
            type="text"
            name="name"
            placeholder="International Scientific Conferences — 23 July"
            required
          />
        </label>

        {/* Template picker */}
        <div className="field">
          <span className="lab">Template</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {WEBINAR_TEMPLATE_META.map((t) => (
              <label
                key={t.id}
                className="card"
                style={{
                  cursor: "pointer",
                  borderColor: templateId === t.id ? "var(--accent, #00acff)" : "var(--border)",
                  padding: 14,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="radio"
                    name="template_pick"
                    value={t.id}
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                  />
                  <strong>{t.name}</strong>
                </span>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {t.description}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Subject: {t.subject}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Live preview */}
        <div className="field">
          <span className="lab">Preview{selected ? ` — ${selected.name}` : ""}</span>
          <iframe
            key={templateId}
            title="Template preview"
            src={`/api/webinar/preview?id=${templateId}`}
            style={{
              width: "100%",
              height: 460,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "#fff",
            }}
          />
        </div>

        <label className="field">
          <span className="lab">Contacts file (.xlsx / .csv)</span>
          <input type="file" name="file" accept=".xlsx,.xls,.csv" required />
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            One <strong>email</strong> column (optional <strong>name</strong>).
            Duplicates and invalid rows are dropped automatically.
          </span>
        </label>

        <label className="field">
          <span className="lab">Target country</span>
          <input type="text" name="country" list="country-list" placeholder="e.g. India" />
          <datalist id="country-list">
            {COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <div className="card" style={{ marginBottom: 14, background: "#fff7e6" }}>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            <strong>How it sends:</strong> the whole list is queued to go out
            today. The scheduler drains it across all sending accounts as fast as
            their hourly/daily caps allow — pause your other campaigns so this one
            gets the full sending capacity. Every link in the email is
            click-tracked per recipient; opens are tracked with a pixel. Watch
            progress on the webinar page, and see per-link clicks under{" "}
            <strong>Report</strong>.
          </div>
        </div>

        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create & queue blast"}
        </button>
      </form>
    </div>
  );
}
