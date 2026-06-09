import Link from "next/link";
import { getCampaign, trackingMatrix, dueDate, stageSummaries } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STAGES = [
  { stage: 1, label: "Day 1" },
  { stage: 5, label: "Day 5" },
  { stage: 10, label: "Day 10" },
] as const;

function Cell({
  status,
  sentAt,
  due,
}: {
  status: "pending" | "sent";
  sentAt: string | null;
  due: string;
}) {
  if (status === "sent") {
    return (
      <div>
        <span className="badge sent">sent</span>
        <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
          {sentAt?.slice(0, 10) ?? ""}
        </div>
      </div>
    );
  }
  return (
    <div>
      <span className="badge pending">pending</span>
      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
        due {due}
      </div>
    </div>
  );
}

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaignId = Number(id);
  const campaign = await getCampaign(campaignId);
  const rows = await trackingMatrix(campaignId);
  const summaries = await stageSummaries(campaignId);

  const due: Record<number, string> = {};
  if (campaign) {
    for (const s of STAGES) due[s.stage] = dueDate(campaign.created_at, s.stage);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href={`/campaigns/${id}`} className="muted">
            ← Back to campaign
          </Link>
          <h1 style={{ marginTop: 6 }}>
            Tracking{campaign ? ` — ${campaign.name}` : ""}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Every contact across all three follow-up stages.
          </p>
        </div>
      </div>

      {/* quick stage totals */}
      <div className="grid cards-row" style={{ marginBottom: 18 }}>
        {summaries.map((s) => (
          <div className="stat" key={s.stage}>
            <div className="label">
              {s.label} · due {due[s.stage]}
            </div>
            <div className="value" style={{ fontSize: 22 }}>
              {s.sent}
              <span className="muted" style={{ fontSize: 14 }}>
                {" "}
                / {s.total}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {s.pending} pending
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Day 1</th>
              <th>Day 5</th>
              <th>Day 10</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contact_id}>
                <td>{r.email}</td>
                <td>{r.name ?? <span className="muted">—</span>}</td>
                <td>
                  <Cell status={r.s1_status} sentAt={r.s1_sent_at} due={due[1]} />
                </td>
                <td>
                  <Cell status={r.s5_status} sentAt={r.s5_sent_at} due={due[5]} />
                </td>
                <td>
                  <Cell status={r.s10_status} sentAt={r.s10_sent_at} due={due[10]} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 24 }}>
                  No contacts in this campaign.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
