"use client";

import { useCallback, useEffect, useState } from "react";

export interface SmtpAccountUsage {
  id: number;
  email: string;
  daily_limit: number;
  used_today_count: number;
  hourly_limit: number;
  used_hour_count: number;
  daily_remaining: number;
  hourly_remaining: number;
  remaining: number;
}

function useSmtpAccounts(pollMs = 4000) {
  const [accounts, setAccounts] = useState<SmtpAccountUsage[]>([]);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/smtp", { cache: "no-store" });
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return { accounts, reload: load };
}

function barColor(pct: number) {
  if (pct >= 100) return "var(--red)";
  if (pct >= 80) return "var(--amber)";
  return "var(--green)";
}

function Bar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="sender-track">
      <div className="sender-fill" style={{ width: `${pct}%`, background: barColor(pct) }} />
    </div>
  );
}

export default function SmtpUsage({ title, editable = false }: { title?: string; editable?: boolean }) {
  const { accounts, reload } = useSmtpAccounts();

  async function saveLimits(id: number, daily: number, hourly: number) {
    await fetch("/api/smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, daily_limit: daily, hourly_limit: hourly }),
    });
    reload();
  }

  return (
    <div>
      {title && <h2 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h2>}
      <div className="grid cards-row">
        {accounts.map((a) => {
          const local = a.email.split("@")[0];
          const domain = a.email.slice(local.length);
          return (
            <div className="stat sender-card" key={a.id} title={a.email}>
              <div className="sender-email">
                <span className="sender-local">{local}</span>
                <span className="sender-domain">{domain}</span>
              </div>

              <div className="value" style={{ fontSize: 22, marginTop: 8 }}>
                {a.used_today_count.toLocaleString()}
                <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
                  {" "}
                  / {a.daily_limit.toLocaleString()} today
                </span>
              </div>
              <Bar used={a.used_today_count} limit={a.daily_limit} />

              <div style={{ fontSize: 14, marginTop: 10, fontWeight: 600 }}>
                {a.used_hour_count.toLocaleString()}
                <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
                  {" "}
                  / {a.hourly_limit.toLocaleString()} this hour
                </span>
              </div>
              <Bar used={a.used_hour_count} limit={a.hourly_limit} />

              <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>
                {a.remaining.toLocaleString()} sendable now
                {a.hourly_remaining < a.daily_remaining ? " (hourly cap)" : ""}
              </div>

              {editable && <LimitEditor account={a} onSave={saveLimits} />}
            </div>
          );
        })}
        {accounts.length === 0 && (
          <div className="muted" style={{ padding: 8 }}>
            No SMTP accounts configured.
          </div>
        )}
      </div>
    </div>
  );
}

function LimitEditor({
  account,
  onSave,
}: {
  account: SmtpAccountUsage;
  onSave: (id: number, daily: number, hourly: number) => Promise<void>;
}) {
  const [daily, setDaily] = useState(String(account.daily_limit));
  const [hourly, setHourly] = useState(String(account.hourly_limit));
  const [busy, setBusy] = useState(false);
  const dirty = Number(daily) !== account.daily_limit || Number(hourly) !== account.hourly_limit;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
      <label className="muted" style={{ fontSize: 11 }}>
        Daily
        <input
          type="number"
          value={daily}
          min={1}
          onChange={(e) => setDaily(e.target.value)}
          style={{ width: 64, marginLeft: 4, padding: "2px 6px" }}
        />
      </label>
      <label className="muted" style={{ fontSize: 11 }}>
        Hourly
        <input
          type="number"
          value={hourly}
          min={1}
          onChange={(e) => setHourly(e.target.value)}
          style={{ width: 56, marginLeft: 4, padding: "2px 6px" }}
        />
      </label>
      <button
        className="btn secondary"
        disabled={!dirty || busy}
        style={{ padding: "3px 10px", fontSize: 12 }}
        onClick={async () => {
          setBusy(true);
          await onSave(account.id, Number(daily), Number(hourly));
          setBusy(false);
        }}
      >
        {busy ? "…" : "Save"}
      </button>
    </div>
  );
}
