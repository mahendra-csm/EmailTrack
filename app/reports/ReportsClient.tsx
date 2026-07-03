"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import type { CampaignWithCounts, CampaignReport, ContactReportRow } from "@/lib/queries";

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function ReportsClientInner({ campaigns }: { campaigns: CampaignWithCounts[] }) {
  const searchParams = useSearchParams();
  const campaignIdParam = searchParams.get("campaignId");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "bounced" | "unsubscribed" | "replied" | "opened_not_clicked" | "clicked_1" | "clicked_2" | "clicked_3" | "clicked_5"
  >("all");

  // Initialize selectedId from query param or first campaign
  useEffect(() => {
    if (campaignIdParam) {
      setSelectedId(Number(campaignIdParam));
    } else if (campaigns.length > 0) {
      setSelectedId(campaigns[0].id);
    }
  }, [campaignIdParam, campaigns]);

  const loadReport = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/report`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Failed to load report.");
      }
      const data: CampaignReport = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId !== null) {
      loadReport(selectedId);
    }
  }, [selectedId, loadReport]);

  const filteredContacts = useMemo(() => {
    if (!report) return [];
    return report.contacts.filter((c) => {
      // 1. Search term filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        c.email.toLowerCase().includes(searchLower) ||
        (c.name && c.name.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;

      // 2. Engagement category filter
      switch (filterType) {
        case "bounced":
          return c.bounced;
        case "unsubscribed":
          return c.unsubscribed;
        case "replied":
          return c.replied;
        case "opened_not_clicked":
          return c.opens_count > 0 && c.clicks_count === 0;
        case "clicked_1":
          return c.clicks_count >= 1;
        case "clicked_2":
          return c.clicked_gt_2;
        case "clicked_3":
          return c.clicked_gt_3;
        case "clicked_5":
          return c.clicked_gt_5;
        case "all":
        default:
          return true;
      }
    });
  }, [report, searchTerm, filterType]);

  // Engagement calculations for current report
  const summaryStats = useMemo(() => {
    if (!report) return null;
    const contacts = report.contacts;
    const total = contacts.length;
    let sent = 0;
    let failed = 0;
    let bounced = 0;
    let unsubscribed = 0;
    let replied = 0;
    let openedUnique = 0;
    let clickedUnique = 0;
    let clicked2 = 0;
    let clicked3 = 0;
    let clicked5 = 0;

    for (const c of contacts) {
      sent += c.sent_count;
      failed += c.failed_count;
      if (c.bounced) bounced++;
      if (c.unsubscribed) unsubscribed++;
      if (c.replied) replied++;
      if (c.opens_count > 0) openedUnique++;
      if (c.clicks_count > 0) clickedUnique++;
      if (c.clicked_gt_2) clicked2++;
      if (c.clicked_gt_3) clicked3++;
      if (c.clicked_gt_5) clicked5++;
    }

    const delivered = Math.max(sent - bounced, 0);

    return {
      total,
      sent,
      failed,
      bounced,
      unsubscribed,
      replied,
      delivered,
      openedUnique,
      clickedUnique,
      clicked2,
      clicked3,
      clicked5,
    };
  }, [report]);

  const touches = useMemo(() => {
    if (!report) return [];
    // Batch 1: 4 touches, Batch 2: 3 touches
    const batchType = report.campaign.batch_type;
    return batchType === 1
      ? [
          { seq: 1, label: "Invitation" },
          { seq: 2, label: "Reminder" },
          { seq: 3, label: "Early Bird" },
          { seq: 4, label: "Final Call" },
        ]
      : [
          { seq: 1, label: "Invitation" },
          { seq: 2, label: "Reminder" },
          { seq: 3, label: "Final Call" },
        ];
  }, [report]);

  const exportExcel = () => {
    if (!report || filteredContacts.length === 0) return;

    const dataRows = filteredContacts.map((c) => {
      const rowData: Record<string, any> = {
        "Email": c.email,
        "Name": c.name ?? "",
        "Campaign Name": report.campaign.name,
        "Campaign Date": report.campaign.start_date || report.campaign.created_at,
        "Campaign Status": report.campaign.status,
        "Sent Mails": c.sent_count,
        "Failed Mails": c.failed_count,
        "Delivered Mails": c.delivered_count,
        "Opens": c.opens_count,
        "Clicks": c.clicks_count,
        "Clicked Links": c.clicked_links.join(", "),
        "Clicked > 2 Times": c.clicked_gt_2 ? "Yes" : "No",
        "Clicked > 3 Times": c.clicked_gt_3 ? "Yes" : "No",
        "Clicked > 5 Times": c.clicked_gt_5 ? "Yes" : "No",
        "Bounced": c.bounced ? "Yes" : "No",
        "Unsubscribed": c.unsubscribed ? "Yes" : "No",
        "Replied": c.replied ? "Yes" : "No",
      };

      // Add follow-up stage detail columns
      touches.forEach((t) => {
        const touch = c.touches[t.seq];
        rowData[`Stage ${t.seq} (${t.label})`] = touch
          ? `${touch.status}${touch.sent_at ? ` (sent ${touch.sent_at.slice(0, 10)})` : ""}`
          : "pending";
      });

      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts Report");

    // Set columns widths automatically
    const columnWidths = Object.keys(dataRows[0]).map((key) => {
      let maxLen = key.length;
      dataRows.forEach((row: any) => {
        const valStr = String(row[key] ?? "");
        if (valStr.length > maxLen) {
          maxLen = valStr.length;
        }
      });
      return { wch: Math.min(maxLen + 2, 40) }; // cap width at 40
    });
    worksheet["!cols"] = columnWidths;

    const filePrefix = report.campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    XLSX.writeFile(workbook, `${filePrefix}_engagement_report.xlsx`);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaign Reports</h1>
          <p className="muted" style={{ margin: 0 }}>
            Analyze contact engagement, identify hot leads, and export lists for retargeting.
          </p>
        </div>
      </div>

      {/* Campaign Selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="campaign-select" style={{ fontWeight: 600 }}>
            Select Campaign:
          </label>
          <select
            id="campaign-select"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border-strong)",
              minWidth: "260px",
              background: "#fff",
              fontSize: "14px",
            }}
          >
            {campaigns.length === 0 && <option value="">No campaigns available</option>}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.country ?? "Global"}) — {c.status}
              </option>
            ))}
          </select>

          {report && (
            <Link
              href={`/campaigns/${report.campaign.id}`}
              className="btn secondary"
              style={{ padding: "7px 12px", fontSize: "13px" }}
            >
              Go to Campaign Details →
            </Link>
          )}
        </div>
      </div>

      {loading && <p className="muted">Loading report details...</p>}
      {error && <div className="notice error">{error}</div>}

      {!loading && !error && report && summaryStats && (
        <>
          {/* Campaign details & Overview cards */}
          <div
            className="notice"
            style={{
              background: report.campaign.status === "completed" ? "#eafff1" : "#fff7e6",
              border: "1px solid var(--border)",
              marginBottom: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              {report.campaign.status === "completed" ? (
                <>
                  ✅ <strong>Completed Campaign</strong>
                </>
              ) : (
                <>
                  🔄 <strong>Active Campaign (Going On)</strong>
                </>
              )}{" "}
              · Created at {report.campaign.created_at}
              {report.campaign.start_date && (
                <>
                  {" "}· Started on <strong>{report.campaign.start_date}</strong>
                </>
              )}
            </div>
            <span className="badge active">{report.campaign.status}</span>
          </div>

          <div className="grid cards-row" style={{ marginBottom: 20 }}>
            <div className="stat">
              <div className="label">Total Contacts</div>
              <div className="value">{summaryStats.total.toLocaleString()}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Upload audience list size
              </div>
            </div>
            <div className="stat">
              <div className="label">Delivered</div>
              <div className="value">{summaryStats.delivered.toLocaleString()}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {summaryStats.sent} sent · {summaryStats.bounced} bounced
              </div>
            </div>
            <div className="stat">
              <div className="label">Open Rate</div>
              <div className="value">{pct(summaryStats.openedUnique, summaryStats.delivered)}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {summaryStats.openedUnique} unique openers
              </div>
            </div>
            <div className="stat">
              <div className="label">Click Rate</div>
              <div className="value">{pct(summaryStats.clickedUnique, summaryStats.delivered)}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {summaryStats.clickedUnique} unique clickers
              </div>
            </div>
            <div className="stat">
              <div className="label">Hot Leads ({">"}2 Clicks)</div>
              <div className="value">{summaryStats.clicked2.toLocaleString()}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {summaryStats.clicked3} {">"}3 clicks · {summaryStats.clicked5} {">"}5 clicks
              </div>
            </div>
            <div className="stat">
              <div className="label">Opt-outs & Replies</div>
              <div className="value">{summaryStats.unsubscribed + summaryStats.replied}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {summaryStats.unsubscribed} unsubs · {summaryStats.replied} replies
              </div>
            </div>
          </div>

          {/* Filtering and Search Controls */}
          <div
            className="card"
            style={{
              marginBottom: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", flex: 1 }}>
              <input
                type="text"
                placeholder="Search email or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-strong)",
                  fontSize: "14px",
                  minWidth: "220px",
                }}
              />

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-strong)",
                  background: "#fff",
                  fontSize: "14px",
                }}
              >
                <option value="all">All Contacts ({summaryStats.total})</option>
                <option value="opened_not_clicked">Opened but didn&apos;t click ({summaryStats.openedUnique - summaryStats.clickedUnique})</option>
                <option value="clicked_1">Clicked at least once ({summaryStats.clickedUnique})</option>
                <option value="clicked_2">Clicked &gt; 2 times ({summaryStats.clicked2})</option>
                <option value="clicked_3">Clicked &gt; 3 times ({summaryStats.clicked3})</option>
                <option value="clicked_5">Clicked &gt; 5 times ({summaryStats.clicked5})</option>
                <option value="bounced">Bounced ({summaryStats.bounced})</option>
                <option value="unsubscribed">Unsubscribed ({summaryStats.unsubscribed})</option>
                <option value="replied">Replied ({summaryStats.replied})</option>
              </select>

              <span className="muted" style={{ fontSize: "13px" }}>
                Showing {filteredContacts.length} contacts
              </span>
            </div>

            <button
              onClick={exportExcel}
              disabled={filteredContacts.length === 0}
              className="btn"
              style={{ alignSelf: "center" }}
            >
              📥 Download Excel Report
            </button>
          </div>

          {/* Report Table */}
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Delivery</th>
                  <th>Opens</th>
                  <th>Clicks</th>
                  <th>Clicked Links</th>
                  {touches.map((t) => (
                    <th key={t.seq} style={{ whiteSpace: "nowrap" }}>
                      Stage {t.seq}: {t.label.split(" · ")[1]}
                    </th>
                  ))}
                  <th>Engagement</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c) => {
                  let badgeClass = "pending";
                  let statusLabel = "active";
                  if (c.bounced) {
                    badgeClass = "failed";
                    statusLabel = "bounced";
                  } else if (c.unsubscribed) {
                    badgeClass = "canceled";
                    statusLabel = "unsubscribed";
                  } else if (c.replied) {
                    badgeClass = "sent";
                    statusLabel = "replied";
                  }

                  return (
                    <tr key={c.contact_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.email}</div>
                        {c.name && <div className="muted" style={{ fontSize: 11 }}>{c.name}</div>}
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>
                          {c.sent_count} sent
                          {c.failed_count > 0 && (
                            <span style={{ color: "var(--red)", marginLeft: 4 }}>
                              ({c.failed_count} fail)
                            </span>
                          )}
                        </div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          Delivered: {c.delivered_count}
                        </div>
                      </td>
                      <td style={{ fontWeight: c.opens_count > 0 ? 600 : "normal" }}>
                        {c.opens_count > 0 ? `👁 ${c.opens_count}` : "—"}
                      </td>
                      <td style={{ fontWeight: c.clicks_count > 0 ? 600 : "normal" }}>
                        {c.clicks_count > 0 ? `🔗 ${c.clicks_count}` : "—"}
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        {c.clicked_links.length > 0 ? (
                          <div style={{ fontSize: 11, wordBreak: "break-all" }}>
                            {c.clicked_links.map((link, idx) => (
                              <div key={idx} style={{ marginBottom: 2 }}>
                                <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>
                                  {link}
                                </a>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      {touches.map((t) => {
                        const touch = c.touches[t.seq];
                        return (
                          <td key={t.seq}>
                            {touch ? (
                              <div>
                                <span className={`badge ${touch.status}`}>{touch.status}</span>
                                {touch.sent_at && (
                                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                                    {touch.sent_at.slice(0, 10)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="badge pending">pending</span>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <span className={`badge ${badgeClass}`}>{statusLabel}</span>
                        {c.clicked_gt_2 && (
                          <div style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600, marginTop: 4 }}>
                            🔥 Hot Leads
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredContacts.length === 0 && (
                  <tr>
                    <td colSpan={6 + touches.length} className="muted" style={{ padding: 24, textAlign: "center" }}>
                      No contacts found matching the filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReportsClient({ campaigns }: { campaigns: CampaignWithCounts[] }) {
  return (
    <Suspense fallback={<p className="muted">Loading reports...</p>}>
      <ReportsClientInner campaigns={campaigns} />
    </Suspense>
  );
}
