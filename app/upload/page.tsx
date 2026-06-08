"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGE_DEFAULTS = [
  {
    stage: 1,
    label: "Day 1",
    subject: "Quick hello, {{name}}",
    body: "Hi {{name}},\n\nReaching out for the first time...",
  },
  {
    stage: 5,
    label: "Day 5",
    subject: "Following up, {{name}}",
    body: "Hi {{name}},\n\nJust following up on my earlier note...",
  },
  {
    stage: 10,
    label: "Day 10",
    subject: "One last note, {{name}}",
    body: "Hi {{name}},\n\nLast time I'll reach out — let me know if helpful.",
  },
];

export default function UploadPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Upload campaign</h1>
      <p className="muted">
        Excel/CSV with an <strong>email</strong> column (and optional{" "}
        <strong>name</strong>). Three stages — Day 1, Day 5, Day 10 — are created
        per contact. Use <code>{"{{name}}"}</code> and <code>{"{{email}}"}</code>{" "}
        as placeholders.
      </p>

      {error && <div className="notice error">{error}</div>}

      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="lab">Campaign name</span>
          <input type="text" name="name" placeholder="June outreach" required />
        </label>

        <label className="field">
          <span className="lab">Contacts file (.xlsx / .csv)</span>
          <input type="file" name="file" accept=".xlsx,.xls,.csv" required />
        </label>

        {STAGE_DEFAULTS.map((s) => (
          <div className="card" key={s.stage} style={{ marginBottom: 14 }}>
            <h2 style={{ marginTop: 0 }}>{s.label} email</h2>
            <label className="field">
              <span className="lab">Subject</span>
              <input type="text" name={`subject_${s.stage}`} defaultValue={s.subject} />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="lab">Body (HTML allowed)</span>
              <textarea name={`body_${s.stage}`} defaultValue={s.body} />
            </label>
          </div>
        ))}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Create campaign"}
        </button>
      </form>
    </div>
  );
}
