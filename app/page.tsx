import Link from "next/link";
import { listCampaigns } from "@/lib/queries";
import SmtpUsage from "./components/SmtpUsage";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const campaigns = listCampaigns();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <p className="muted" style={{ margin: 0 }}>
            Upload a list, then send each stage by hand.
          </p>
        </div>
        <Link href="/upload" className="btn">
          ＋ New campaign
        </Link>
      </div>

      {/* How to use — always shown at the top of the dashboard */}
      <div className="howto">
        <div className="howto-title">📖 How to use this app</div>
        <div className="howto-sub">
          A manual sender: you upload a list, then send each follow-up stage by
          hand. Nothing sends automatically — you stay in full control.
        </div>
        <div className="steps">
          <div className="step">
            <div className="num">1</div>
            <div className="step-title">Upload a list</div>
            <div className="step-body">
              Click <b>New campaign</b>. Upload an <b>Excel/CSV</b> with an{" "}
              <b>email</b> column (and optional <b>name</b>), and write the three
              follow-up emails. The app creates <b>Day 1, Day 5, Day 10</b> for
              every contact.
            </div>
          </div>
          <div className="step">
            <div className="num">2</div>
            <div className="step-title">Pick a sender &amp; send</div>
            <div className="step-body">
              Open the campaign. Choose <b>which email address to send from</b>,
              switch to the <b>Day 1 / 5 / 10</b> tab, and click <b>Send</b>. Each
              sender can send <b>2,900 / day</b>; pick another when one fills up.
            </div>
          </div>
          <div className="step">
            <div className="num">3</div>
            <div className="step-title">Track progress</div>
            <div className="step-body">
              The campaign’s <b>Tracking</b> page shows every contact across all
              stages — who’s been emailed, when, and the <b>follow-up due date</b>{" "}
              for anything still pending.
            </div>
          </div>
          <div className="step">
            <div className="num">4</div>
            <div className="step-title">Monitor &amp; review</div>
            <div className="step-body">
              <b>Senders</b> shows live daily usage for each address.{" "}
              <b>Database</b> is the full record of every email ever sent, with
              status and which sender it used.
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
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
