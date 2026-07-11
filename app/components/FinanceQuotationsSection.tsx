"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type FinanceQuotationsSectionProps = {
  caseId?: string | number | null;
  advisoryMatterId?: string | null;
};

type QuotationRow = {
  id: string;
  quotation_no: string | null;
  status: string | null;
  issue_date: string | null;
  valid_until: string | null;
  grand_total: number | string | null;
};

export default function FinanceQuotationsSection({
  caseId,
  advisoryMatterId,
}: FinanceQuotationsSectionProps) {
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadQuotations = async () => {
      setLoading(true);

      let query = supabase
        .from("finance_quotations")
        .select("id, quotation_no, status, issue_date, valid_until, grand_total")
        .order("issue_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (caseId) {
        query = query.eq("case_id", Number(caseId));
      } else if (advisoryMatterId) {
        query = query.eq("advisory_matter_id", advisoryMatterId);
      } else {
        setQuotations([]);
        setLoading(false);
        return;
      }

      const { data, error } = await query;
      if (error) {
        console.warn("Unable to load linked quotations", error);
        setQuotations([]);
        setLoading(false);
        return;
      }

      setQuotations((data || []) as QuotationRow[]);
      setLoading(false);
    };

    loadQuotations();
  }, [advisoryMatterId, caseId]);

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Finance Documents</h2>
          <p style={noteStyle}>
            Finance documents are separate from legacy fee references. Quotations are not invoices or receipts.
          </p>
        </div>
      </div>

      <div style={subsectionStyle}>
        <h3 style={subTitleStyle}>Quotations</h3>
        {loading ? <div style={emptyStyle}>Loading quotations...</div> : null}
        {!loading && quotations.length === 0 ? (
          <div style={emptyStyle}>No quotations linked to this matter yet.</div>
        ) : null}
        {!loading && quotations.length > 0 ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Quotation No</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Issue Date</th>
                  <th style={thStyle}>Valid Until</th>
                  <th style={rightThStyle}>Grand Total</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((quotation) => (
                  <tr key={quotation.id}>
                    <td style={tdStyle}>{quotation.quotation_no || "-"}</td>
                    <td style={tdStyle}><StatusBadge status={quotation.status} /></td>
                    <td style={tdStyle}>{formatDate(quotation.issue_date)}</td>
                    <td style={tdStyle}>{formatDate(quotation.valid_until)}</td>
                    <td style={rightTdStyle}>{formatMoney(quotation.grand_total)}</td>
                    <td style={tdStyle}>
                      <Link href={`/finance/quotations/${quotation.id}`} style={viewLinkStyle}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const normalized = String(status || "draft").toLowerCase();
  const style = statusStyles[normalized] || statusStyles.draft;
  return <span style={{ ...badgeStyle, ...style }}>{normalized}</span>;
}

function formatDate(value: string | null) {
  return value ? String(value).slice(0, 10) : "-";
}

function formatMoney(value: number | string | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#ffffff",
  padding: 16,
  marginBottom: 18,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 900,
  color: "#111827",
};

const noteStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#6b7280",
  fontSize: 13,
  lineHeight: 1.5,
};

const subsectionStyle: React.CSSProperties = {
  borderTop: "1px solid #f3f4f6",
  paddingTop: 12,
};

const subTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 16,
  fontWeight: 900,
  color: "#111827",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 720,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "9px 8px",
  borderBottom: "1px solid #e5e7eb",
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const rightThStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #f3f4f6",
  color: "#111827",
  fontSize: 13,
  verticalAlign: "top",
};

const rightTdStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const emptyStyle: React.CSSProperties = {
  border: "1px dashed #d1d5db",
  borderRadius: 10,
  padding: 14,
  color: "#6b7280",
  fontSize: 13,
  fontWeight: 700,
};

const viewLinkStyle: React.CSSProperties = {
  color: "#1d4ed8",
  fontWeight: 800,
  textDecoration: "none",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "capitalize",
};

const statusStyles: Record<string, React.CSSProperties> = {
  draft: { background: "#f3f4f6", color: "#374151" },
  sent: { background: "#dbeafe", color: "#1e40af" },
  accepted: { background: "#dcfce7", color: "#166534" },
  cancelled: { background: "#fee2e2", color: "#991b1b" },
};
