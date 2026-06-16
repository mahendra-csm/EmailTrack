import Link from "next/link";
import { listCampaigns } from "@/lib/queries";
import SmtpUsage from "./components/SmtpUsage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const campaigns = await listCampaigns();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <p className="muted" style={{ margin: 0 }}>
            Upload a list, pick a batch — the follow-up sequence sends itself.
          </p>
        </div>
        <Link href="/upload" className="btn">
          ＋ New campaign
        </Link>
      </div>

      {/* How to use — compact guide at the top of the dashboard */}
      <div className="howto">
        <div className="howto-head">
          <span className="howto-title">How to use</span>
          <span className="howto-sub">
            Upload &amp; pick a batch — the scheduler sends each follow-up on its day.
          </span>
        </div>
        <ol className="steps">
          <li className="step">
            <span className="num">1</span>
            <div>
              <div className="step-title">Upload a list</div>
              <div className="step-body">
                <b>New campaign</b> → an Excel/CSV with an <b>email</b> column.
                Choose <b>Batch 1</b> (days 1,3,5,7) or <b>Batch 2</b> (days 2,4,6).
              </div>
            </div>
          </li>
          <li className="step">
            <span className="num">2</span>
            <div>
              <div className="step-title">It sends itself</div>
              <div className="step-body">
                Fixed templates go out automatically on schedule via the cron
                ping — no clicking. Only one batch sends per day.
              </div>
            </div>
          </li>
          <li className="step">
            <span className="num">3</span>
            <div>
              <div className="step-title">Track progress</div>
              <div className="step-body">
                <b>Tracking</b> shows each contact across the scheduled emails,
                with send dates.
              </div>
            </div>
          </li>
          <li className="step">
            <span className="num">4</span>
            <div>
              <div className="step-title">Monitor</div>
              <div className="step-body">
                <b>Senders</b> = live usage. <b>Database</b> = every email sent.
              </div>
            </div>
          </li>
        </ol>
      </div>

      <div style={{ marginBottom: 30 }}>
        <SmtpUsage title="Sender usage today" />
      </div>

      {campaigns.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="big">📭</div>
            <p style={{ margin: 0 }}>
              No campaigns yet.{" "}
              <Link href="/upload" style={{ fontWeight: 600 }}>
                Upload an Excel file
              </Link>{" "}
              to get started.
            </p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Country</th>
                <th>Contacts</th>
                <th>Sent</th>
                <th>Pending</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/campaigns/${c.id}`} style={{ fontWeight: 600 }}>
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.country ?? <span className="muted">—</span>}</td>
                  <td>{c.total_contacts}</td>
                  <td>{c.total_sent}</td>
                  <td>{c.total_pending}</td>
                  <td>
                    <span className="badge active">{c.status}</span>
                  </td>
                  <td className="muted">{c.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
