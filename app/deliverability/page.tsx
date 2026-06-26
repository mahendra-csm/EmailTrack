import {
  deliverabilityTotals,
  deliverabilityByCampaign,
  senderHealth,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}
export default async function DeliverabilityPage() {
  const totals = await deliverabilityTotals();
  const campaigns = await deliverabilityByCampaign();
  const senders = await senderHealth();

   
  const cards = [
    { label: "Emails sent", value: totals.sent.toLocaleString(), sub: "" },
    { label: "Delivered", value: totals.delivered.toLocaleString(), sub: "" },
    { label: "Open rate", value: pct(totals.opensUnique, totals.delivered), sub: `${totals.opensUnique.toLocaleString()} unique · ${totals.opens.toLocaleString()} total` },
    { label: "Click rate", value: pct(totals.clicksUnique, totals.delivered), sub: `${totals.clicksUnique.toLocaleString()} unique · ${totals.clicks.toLocaleString()} total` },
    { label: "Reply rate", value: pct(totals.replies, totals.delivered), sub: `${totals.replies.toLocaleString()} replied` },
    { label: "Bounce rate", value: pct(totals.bounces, totals.sent), sub: `${totals.bounces.toLocaleString()} bounced & removed` },
    { label: "Unsub rate", value: pct(totals.unsubs, totals.sent), sub: `${totals.unsubs.toLocaleString()} opted out` },
    { label: "Failed", value: totals.failed.toLocaleString(), sub: `${totals.suppressed.toLocaleString()} suppressed total` },
  ];
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Deliverability</h1>
          <p className="muted" style={{ margin: 0 }}>
            Opens, clicks, replies and opt-outs across all campaigns.
          </p>
        </div>
      </div>

      <div className="grid cards-row" style={{ marginBottom: 8 }}>
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <div className="label">{c.label}</div>
            <div className="value">{c.value}</div>
            {c.sub && (
              <div className="muted" style={{ fontSize: 12 }}>
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12, margin: "0 2px 14px" }}>
        Open / click / reply rates are measured over delivered emails (sent minus bounces).
        Bounce and unsub rates still use the total sent count as the base.
      </p>

      <p className="muted" style={{ fontSize: 12, margin: "4px 2px 22px" }}>
        Open tracking needs <code>APP_URL</code> set to your public URL, and works once
        recipients view images. Reply detection runs from the{" "}
        <code>/api/cron/poll-replies</code> schedule.
      </p>

      <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>By campaign</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 28 }}>
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Country</th>
              <th>Sent</th>
              <th>Delivered</th>
              <th>Opens</th>
              <th>Open %</th>
              <th>Clicks</th>
              <th>Click %</th>
              <th>Replies</th>
              <th>Unsubs</th>
              <th>Failed</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{c.country ?? <span className="muted">—</span>}</td>
                <td>{c.sent.toLocaleString()}</td>
                <td>{c.delivered.toLocaleString()}</td>
                <td>
                  {c.opens_unique.toLocaleString()}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {c.opens.toLocaleString()} total
                  </div>
                </td>
                <td>{pct(c.opens_unique, c.delivered)}</td>
                <td>
                  {c.clicks_unique.toLocaleString()}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {c.clicks.toLocaleString()} total
                  </div>
                </td>
                <td>{pct(c.clicks_unique, c.delivered)}</td>
                <td>{c.replies.toLocaleString()}</td>
                <td>{c.unsubs.toLocaleString()}</td>
                <td>{c.failed.toLocaleString()}</td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={9} className="muted" style={{ padding: 24 }}>
                  No campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Sender health</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Sender</th>
              <th>Sent</th>
              <th>Failed</th>
              <th>Failure %</th>
            </tr>
          </thead>
          <tbody>
            {senders.map((s) => {
              const total = s.sent + s.failed;
              const bad = total ? s.failed / total : 0;
              return (
                <tr key={s.sender}>
                  <td>{s.sender}</td>
                  <td>{s.sent.toLocaleString()}</td>
                  <td>{s.failed.toLocaleString()}</td>
                  <td style={{ color: bad > 0.05 ? "var(--red)" : undefined }}>{pct(s.failed, total)}</td>
                </tr>
              );
            })}
            {senders.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: 24 }}>
                  No sends logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
