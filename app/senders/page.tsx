import SmtpUsage from "../components/SmtpUsage";

export default function SendersPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Senders</h1>
          <p className="muted" style={{ margin: 0 }}>
            Live daily &amp; hourly usage per SMTP account. The hourly cap keeps a
            mailbox from bursting and getting disabled — lower it if Hostinger
            still blocks a box.
          </p>
        </div>
      </div>
      <SmtpUsage editable />
    </div>
  );
}
