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
      {title && <h2 style={{ marginTop: 0 }}>{title}</h2>}
      <div className="grid cards-row">
        {accounts.map((a) => {
          const pct = Math.min(100, Math.round((a.used_today_count / a.daily_limit) * 100));
          return (
            <div className="stat" key={a.id}>
              <div
                className="label"
                style={{ textTransform: "none", fontWeight: 600, color: "var(--text)" }}
                title={a.email}
              >
                {a.email}
              </div>
              <div className="value" style={{ fontSize: 22 }}>
                {a.used_today_count.toLocaleString()}
                <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
                  {" "}
                  / {a.daily_limit.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: "var(--panel-2)",
                  overflow: "hidden",
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: barColor(pct),
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
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
