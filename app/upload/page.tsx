"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BATCH_SCHEDULE, BatchType } from "@/lib/types";

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia", "Germany",
  "France", "Italy", "Spain", "Netherlands", "United Arab Emirates", "Saudi Arabia",
  "Singapore", "Malaysia", "Indonesia", "Philippines", "Nigeria", "South Africa",
  "Brazil", "Mexico", "Japan", "China", "South Korea", "Pakistan", "Bangladesh",
  "Sri Lanka", "Egypt", "Turkey", "Poland", "Sweden",
];

export default function UploadPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchType, setBatchType] = useState<BatchType>(1);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      router.push(`/campaigns/${data.campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(false);
    }
  }

  const touches = BATCH_SCHEDULE[batchType];

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Upload a list</h1>
      <p className="muted">
        Drop in an Excel/CSV with an <strong>email</strong> column (optional{" "}
        <strong>name</strong>). Pick a batch — the fixed follow-up sequence then
        sends <strong>automatically</strong> on schedule. No templates to write.
      </p>

      {error && <div className="notice error">{error}</div>}

      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="lab">Campaign name</span>
          <input type="text" name="name" placeholder="June invitation — Batch 1" required />
        </label>

        <label className="field">
          <span className="lab">Contacts file (.xlsx / .csv)</span>
          <input type="file" name="file" accept=".xlsx,.xls,.csv" required />
        </label>

        <div className="field">
          <span className="lab">Batch</span>
          <div style={{ display: "flex", gap: 10 }}>
            {([1, 2] as BatchType[]).map((b) => (
              <label
                key={b}
                className="card"
                style={{
                  flex: 1,
                  cursor: "pointer",
                  borderColor: batchType === b ? "var(--accent, #00acff)" : "var(--border)",
                  padding: 12,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="radio"
                    name="batch_type"
                    value={b}
                    checked={batchType === b}
                    onChange={() => setBatchType(b)}
                  />
                  <strong>Batch {b}</strong>
                </span>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {b === 1 ? "Sends days 1, 3, 5, 7 — 4 emails" : "Sends days 2, 4, 6 — 3 emails"}
                </div>
              </label>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="lab">Target country</span>
          <input type="text" name="country" list="country-list" placeholder="e.g. India" />
          <datalist id="country-list">
            {COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Which country this list targets — shown on the dashboard and used to
            group your sending stats.
          </span>
        </label>

        <label className="field">
          <span className="lab">Start date (optional — defaults to today)</span>
          <input type="date" name="start_date" />
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            If these days collide with another active batch, the start auto-shifts
            so only one batch ever sends per day.
          </span>
        </label>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Schedule for Batch {batchType}</h2>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {touches.map((t) => (
              <li key={t.seq} style={{ marginBottom: 4 }}>
                <strong>{t.label}</strong>{" "}
                <span className="muted">— day {t.offset + 1}</span>
              </li>
            ))}
          </ol>
        </div>

        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Create & schedule"}
        </button>
      </form>
    </div>
  );
}
