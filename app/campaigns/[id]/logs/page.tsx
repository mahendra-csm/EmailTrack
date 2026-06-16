import Link from "next/link";
import { campaignLogs, getCampaign } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LogsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaignId = Number(id);
  const campaign = await getCampaign(campaignId);
  const logs = await campaignLogs(campaignId);

  return (
    <div>
      <Link href={`/campaigns/${id}`} className="muted">
        ← Back to campaign
      </Link>
      <h1 style={{ marginTop: 6 }}>
        Logs{campaign ? ` — ${campaign.name}` : ""}
      </h1>

      {logs.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ margin: 0 }}>
            No sends logged yet.
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16, padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Email</th>
                <th>Stage</th>
                <th>SMTP</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{l.timestamp}</td>
                  <td>{l.email ?? l.contact_id}</td>
                  <td>Email {l.stage}</td>
                  <td className="muted">{l.smtp_used ?? "—"}</td>
                  <td>
                    <span className={`badge ${l.status}`}>{l.status}</span>
                  </td>
                  <td className="muted" style={{ maxWidth: 280 }}>
                    {l.error_message ?? "—"}
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
