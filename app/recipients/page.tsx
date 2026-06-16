import Link from "next/link";
import { recipientRecords, recipientStatusCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "valid", label: "Valid" },
  { key: "bounced", label: "Bounced" },
  { key: "unsubscribed", label: "Unsubscribed" },
  { key: "replied", label: "Replied" },
  { key: "pending", label: "Pending" },
];

const BADGE: Record<string, string> = {
  valid: "sent",
  bounced: "failed",
  unsubscribed: "canceled",
  replied: "active",
  pending: "pending",
};

export default async function RecipientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const active = sp.status && sp.status !== "all" ? sp.status : undefined;

  const [rows, counts] = await Promise.all([
    recipientRecords(active, 2000),
    recipientStatusCounts(),
  ]);

  const exportHref = `/api/recipients/export${active ? `?status=${active}` : ""}`;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Recipients</h1>
          <p className="muted" style={{ margin: 0 }}>
            Every address with its status, date, country, and the sender it went out from.
          </p>
        </div>
        <a href={exportHref} className="btn secondary" download>
          ⭳ Export CSV
        </a>
      </div>

      {/* Status tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map((t) => {
          const isActive = (t.key === "all" && !active) || t.key === active;
          const href = t.key === "all" ? "/recipients" : `/recipients?status=${t.key}`;
          return (
            <Link key={t.key} href={href} className={`tab${isActive ? " active" : ""}`}>
              {t.label}
              <span className="pill">{counts[t.key] ?? 0}</span>
            </Link>
          );
        })}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Status</th>
              <th>Date</th>
              <th>Country</th>
              <th>Sent from</th>
              <th>Campaign</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contact_id}>
                <td>{r.email}</td>
                <td>{r.name ?? <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge ${BADGE[r.status] ?? "pending"}`}>{r.status}</span>
                </td>
                <td className="muted">{r.event_date?.slice(0, 10) ?? "—"}</td>
                <td>{r.country ?? <span className="muted">—</span>}</td>
                <td className="muted">{r.sender ?? "—"}</td>
                <td className="muted">{r.campaign ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ padding: 24 }}>
                  No recipients{active ? ` with status “${active}”` : ""} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length >= 2000 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Showing the first 2,000 — use a status filter or Export CSV for the full list.
        </p>
      )}
    </div>
  );
}
