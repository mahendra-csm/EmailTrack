"use client";

import { useEffect, useState } from "react";

export interface SmtpAccountUsage {
  id: number;
  email: string;
  daily_limit: number;
  used_today_count: number;
  remaining: number;
}

function useSmtpAccounts(pollMs = 4000) {
  const [accounts, setAccounts] = useState<SmtpAccountUsage[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/smtp", { cache: "no-store" });
        const data = await res.json();
        if (alive) setAccounts(data.accounts ?? []);
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);
  return accounts;
}

function barColor(pct: number) {
  if (pct >= 100) return "var(--red)";
  if (pct >= 80) return "var(--amber)";
  return "var(--green)";
}

export default function SmtpUsage({ title }: { title?: string }) {
  const accounts = useSmtpAccounts();

  return (
    <div>
      {title && (
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h2>
      )}
      <div className="grid cards-row">
        {accounts.map((a) => {
          const pct = Math.min(
            100,
            Math.round((a.used_today_count / a.daily_limit) * 100)
          );
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
                  / {a.daily_limit.toLocaleString()}
                </span>
              </div>
              <div className="sender-track">
                <div
                  className="sender-fill"
                  style={{ width: `${pct}%`, background: barColor(pct) }}
                />
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>
                {a.remaining.toLocaleString()} left today
              </div>
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
