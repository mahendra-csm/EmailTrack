import Link from "next/link";
import { databaseRecords, databaseStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<number, string> = { 1: "Day 1", 5: "Day 5", 10: "Day 10" };

export default function DatabasePage() {
  const records = databaseRecords();
  const stats = databaseStats();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Database</h1>
          <p className="muted" style={{ margin: 0 }}>
            Every email this system has sent, across all campaigns.
          </p>
        </div>
      </div>

      <div className="grid cards-row" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="label">Total records</div>
          <div className="value">{stats.total.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="label">Sent</div>
          <div className="value" style={{ color: "var(--green)" }}>
            {stats.sent.toLocaleString()}
          </div>
        </div>
        <div className="stat">
          <div className="label">Failed</div>
          <div className="value" style={{ color: stats.failed ? "var(--red)" : "var(--text)" }}>
            {stats.failed.toLocaleString()}
          </div>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="big">🗄</div>
            <p style={{ margin: 0 }}>No emails sent yet.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Recipient</th>
                <th>Name</th>
                <th>Campaign</th>
                <th>Stage</th>
                <th>Sent from</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{r.timestamp}</td>
                  <td>{r.email ?? "—"}</td>
                  <td>{r.name ?? <span className="muted">—</span>}</td>
                  <td>
                    {r.campaign_name ? (
                      <Link href={`/campaigns/${r.campaign_id}`}>{r.campaign_name}</Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{STAGE_LABEL[r.stage] ?? r.stage}</td>
                  <td className="muted">{r.smtp_used ?? "—"}</td>
                  <td>
                    <span className={`badge ${r.status}`}>{r.status}</span>
                  </td>
                  <td className="muted" style={{ maxWidth: 240 }}>
                    {r.error_message ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
