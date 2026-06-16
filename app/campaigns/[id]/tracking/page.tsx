import Link from "next/link";
import { getCampaign, trackingMatrix, stageSummaries } from "@/lib/queries";
import { touchesFor } from "@/lib/types";
import { scheduleFor } from "@/lib/schedule";

export const dynamic = "force-dynamic";

function Cell({
  status,
  sentAt,
  due,
}: {
  status: "pending" | "sending" | "sent" | "failed" | "canceled" | undefined;
  sentAt: string | null | undefined;
  due: string | null;
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
  if (status === "failed") {
    return <span className="badge failed">failed</span>;
  }
  if (status === "canceled") {
    return <span className="badge canceled">suppressed</span>;
  }
  return (
    <div>
      <span className="badge pending">{status === "sending" ? "sending" : "pending"}</span>
      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
        {due ? `due ${due}` : ""}
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

  const touches = campaign ? touchesFor(campaign.batch_type) : [];
  const summaries = campaign ? await stageSummaries(campaign) : [];
  const due: Record<number, string | null> =
    campaign?.start_date
      ? Object.fromEntries(
          scheduleFor(campaign.start_date, campaign.batch_type).map((t) => [t.seq, t.send_date])
        )
      : {};

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
            Every contact across the scheduled emails.
          </p>
        </div>
      </div>

      <div className="grid cards-row" style={{ marginBottom: 18 }}>
        {summaries.map((s) => (
          <div className="stat" key={s.seq}>
            <div className="label">
              {s.label}
              {s.send_date ? ` · ${s.send_date}` : ""}
            </div>
            <div className="value" style={{ fontSize: 22 }}>
              {s.sent}
              <span className="muted" style={{ fontSize: 14 }}>
                {" "}
                / {s.total}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {s.pending} pending{s.failed ? ` · ${s.failed} failed` : ""}
              {s.canceled ? ` · ${s.canceled} suppressed` : ""}
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
              {touches.map((t) => (
                <th key={t.seq}>{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contact_id}>
                <td>{r.email}</td>
                <td>{r.name ?? <span className="muted">—</span>}</td>
                {touches.map((t) => (
                  <td key={t.seq}>
                    <Cell
                      status={r.touches[t.seq]?.status}
                      sentAt={r.touches[t.seq]?.sent_at}
                      due={due[t.seq] ?? null}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2 + touches.length} className="muted" style={{ padding: 24 }}>
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
