import SmtpUsage from "../components/SmtpUsage";

export default function SendersPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Senders</h1>
          <p className="muted" style={{ margin: 0 }}>
            Live daily usage per SMTP account. Counters reset at midnight (UTC).
          </p>
        </div>
      </div>
      <SmtpUsage />
    </div>
  );
}
