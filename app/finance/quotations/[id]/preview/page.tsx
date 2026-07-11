"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { QuotationGuard } from "../../shared";

type QuotationRow = {
  id: string;
  quotation_no: string | null;
  client_id: string | null;
  case_id: number | null;
  advisory_matter_id: string | null;
  issue_date: string | null;
  valid_until: string | null;
  status: string | null;
  subtotal_vatable: number | string | null;
  subtotal_non_vatable: number | string | null;
  vat_amount: number | string | null;
  grand_total: number | string | null;
  note: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
  client_snapshot_json?: Record<string, unknown> | null;
  matter_snapshot_json?: Record<string, unknown> | null;
};

type QuotationItemRow = {
  id?: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  amount_before_tax: number | string | null;
  vat_amount: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type ClientRow = { id: string; name: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };

export default function QuotationPreviewPage() {
  const params = useParams();
  const quotationId = Array.isArray(params.id) ? params.id[0] : params.id || "";

  return (
    <QuotationGuard>
      {() => <QuotationPreview quotationId={quotationId} />}
    </QuotationGuard>
  );
}

function QuotationPreview({ quotationId }: { quotationId: string }) {
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [items, setItems] = useState<QuotationItemRow[]>([]);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [caseItem, setCaseItem] = useState<CaseRow | null>(null);
  const [matter, setMatter] = useState<MatterRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    const loadPreview = async () => {
      setLoading(true);
      setErrorText("");

      if (!quotationId) {
        setErrorText("Quotation not found.");
        setLoading(false);
        return;
      }

      const quotationRes = await supabase
        .from("finance_quotations")
        .select("*")
        .eq("id", quotationId)
        .maybeSingle();

      if (quotationRes.error || !quotationRes.data) {
        console.error("Failed to load quotation preview", { quotationId, error: quotationRes.error });
        setErrorText("Quotation not found.");
        setLoading(false);
        return;
      }

      const loadedQuotation = quotationRes.data as QuotationRow;
      setQuotation(loadedQuotation);

      const [itemsRes, clientRes, caseRes, matterRes] = await Promise.all([
        supabase
          .from("finance_quotation_items")
          .select("*")
          .eq("quotation_id", quotationId)
          .order("sort_order", { ascending: true }),
        loadedQuotation.client_id
          ? supabase.from("clients").select("id, name").eq("id", loadedQuotation.client_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        loadedQuotation.case_id
          ? supabase.from("cases").select("id, file_no, title, client_name").eq("id", loadedQuotation.case_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        loadedQuotation.advisory_matter_id
          ? supabase.from("advisory_matters").select("id, matter_no, title").eq("id", loadedQuotation.advisory_matter_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (itemsRes.error) console.warn("Failed to load quotation preview items", itemsRes.error);
      if (clientRes.error) console.warn("Failed to load quotation preview client", clientRes.error);
      if (caseRes.error) console.warn("Failed to load quotation preview case", caseRes.error);
      if (matterRes.error) console.warn("Failed to load quotation preview advisory matter", matterRes.error);

      setItems((itemsRes.data || []) as QuotationItemRow[]);
      setClient((clientRes.data || null) as ClientRow | null);
      setCaseItem((caseRes.data || null) as CaseRow | null);
      setMatter((matterRes.data || null) as MatterRow | null);
      setLoading(false);
    };

    loadPreview();
  }, [quotationId]);

  const clientName = getSnapshotText(quotation?.client_snapshot_json, "name") || client?.name || quotation?.client_id || "-";
  const matterLabel = getMatterLabel(quotation, caseItem, matter);
  const preparedBy = quotation?.updated_by_name || quotation?.created_by_name || quotation?.updated_by_email || quotation?.created_by_email || "-";

  return (
    <>
      <style>{printCss}</style>
      <div className="print-hidden" style={toolbarStyle}>
        <Link href={quotationId ? `/finance/quotations/${quotationId}` : "/finance/quotations"} style={secondaryButtonStyle}>
          Back to Quotation
        </Link>
        <button type="button" onClick={() => window.print()} style={primaryButtonStyle}>
          Print
        </button>
      </div>

      {loading ? <div style={messageStyle}>Loading quotation preview...</div> : null}
      {!loading && errorText ? <div style={errorStyle}>{errorText}</div> : null}

      {!loading && quotation ? (
        <article className="quotation-print-document" style={documentStyle}>
          <header style={documentHeaderStyle}>
            <div>
              <div style={companyMarkStyle}>VP</div>
              <div style={companyNameStyle}>VP Partners Co., Ltd.</div>
              <div style={companyMetaStyle}>Professional legal services</div>
            </div>
            <div style={documentTitleBlockStyle}>
              <h1 style={documentTitleStyle}>Quotation</h1>
              <div style={statusStyle}>{quotation.status || "draft"}</div>
            </div>
          </header>

          <section style={infoGridStyle}>
            <Info label="Quotation No." value={quotation.quotation_no || "-"} />
            <Info label="Issue Date" value={formatDate(quotation.issue_date)} />
            <Info label="Valid Until" value={formatDate(quotation.valid_until)} />
            <Info label="Client" value={clientName} />
            <Info label="Linked Matter" value={matterLabel} wide />
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Line Items</h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>No.</th>
                  <th style={thStyle}>Description</th>
                  <th style={rightThStyle}>Quantity</th>
                  <th style={rightThStyle}>Unit Price</th>
                  <th style={rightThStyle}>Amount Before Tax</th>
                  <th style={rightThStyle}>VAT</th>
                  <th style={rightThStyle}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td style={tdStyle} colSpan={7}>No line items.</td></tr>
                ) : items.map((item, index) => (
                  <tr key={item.id || index}>
                    <td style={tdStyle}>{index + 1}</td>
                    <td style={tdStyle}>{item.description || "-"}</td>
                    <td style={rightTdStyle}>{formatQuantity(item.quantity)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.unit_price)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.amount_before_tax)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.vat_amount)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={totalsSectionStyle}>
            <div style={noteBoxStyle}>
              <div style={labelStyle}>Note</div>
              <div style={noteTextStyle}>{quotation.note || "-"}</div>
            </div>
            <div style={totalsBoxStyle}>
              <TotalLine label="Subtotal Vatable" value={quotation.subtotal_vatable} />
              <TotalLine label="Subtotal Non-Vatable" value={quotation.subtotal_non_vatable} />
              <TotalLine label="VAT" value={quotation.vat_amount} />
              <TotalLine label="Grand Total" value={quotation.grand_total} strong />
            </div>
          </section>

          <section style={signatureGridStyle}>
            <SignatureBlock label="Prepared by" name={preparedBy} />
            <SignatureBlock label="Approved by" name="Authorized Partner" />
          </section>
        </article>
      ) : null}
    </>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={wide ? wideInfoStyle : infoStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

function TotalLine({ label, value, strong = false }: { label: string; value: number | string | null; strong?: boolean }) {
  return (
    <div style={strong ? totalStrongLineStyle : totalLineStyle}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

function SignatureBlock({ label, name }: { label: string; name: string }) {
  return (
    <div style={signatureBlockStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={signatureNameStyle}>{name}</div>
      <div style={signatureLineStyle} />
      <div style={dateLineStyle}>Date: ____________________</div>
    </div>
  );
}

function getMatterLabel(quotation: QuotationRow | null, caseItem: CaseRow | null, matter: MatterRow | null) {
  if (!quotation) return "-";
  const snapshotType = getSnapshotText(quotation.matter_snapshot_json, "type");
  if (snapshotType === "case") {
    const fileNo = getSnapshotText(quotation.matter_snapshot_json, "file_no");
    const title = getSnapshotText(quotation.matter_snapshot_json, "title");
    return [fileNo, title].filter(Boolean).join(" - ") || String(quotation.case_id || "Case");
  }
  if (snapshotType === "advisory") {
    const matterNo = getSnapshotText(quotation.matter_snapshot_json, "matter_no");
    const title = getSnapshotText(quotation.matter_snapshot_json, "title");
    return [matterNo, title].filter(Boolean).join(" - ") || String(quotation.advisory_matter_id || "Advisory");
  }
  if (caseItem) return [caseItem.file_no, caseItem.title || caseItem.client_name].filter(Boolean).join(" - ") || String(caseItem.id);
  if (matter) return [matter.matter_no, matter.title].filter(Boolean).join(" - ") || matter.id;
  if (quotation.case_id) return `Case: ${quotation.case_id}`;
  if (quotation.advisory_matter_id) return `Advisory: ${quotation.advisory_matter_id}`;
  return "Unlinked";
}

function getSnapshotText(snapshot: Record<string, unknown> | null | undefined, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function formatDate(value: string | null) {
  return value ? String(value).slice(0, 10) : "-";
}

function formatQuantity(value: number | string | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatMoney(value: number | string | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const printCss = `
  @media print {
    body {
      background: #ffffff !important;
      padding-left: 0 !important;
    }
    aside,
    nav,
    .print-hidden {
      display: none !important;
    }
    main {
      max-width: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .quotation-print-document {
      width: 210mm !important;
      min-height: 297mm !important;
      margin: 0 auto !important;
      box-shadow: none !important;
      border: none !important;
      page-break-after: avoid;
    }
  }
`;

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginBottom: 16,
};

const documentStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  boxShadow: "0 8px 30px rgba(15, 23, 42, 0.08)",
  padding: "42px 46px",
};

const documentHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  borderBottom: "2px solid #111827",
  paddingBottom: 20,
  marginBottom: 24,
};

const companyMarkStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 8,
  background: "#111827",
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontSize: 20,
  fontWeight: 900,
  marginBottom: 10,
};

const companyNameStyle: React.CSSProperties = { fontSize: 18, fontWeight: 900 };
const companyMetaStyle: React.CSSProperties = { marginTop: 4, fontSize: 12, color: "#6b7280", fontWeight: 700 };
const documentTitleBlockStyle: React.CSSProperties = { textAlign: "right" };
const documentTitleStyle: React.CSSProperties = { margin: 0, fontSize: 34, fontWeight: 900, letterSpacing: 0 };
const statusStyle: React.CSSProperties = { marginTop: 8, textTransform: "capitalize", fontWeight: 900, color: "#374151" };

const infoGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginBottom: 26,
};

const infoStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 4, padding: 10, minWidth: 0 };
const wideInfoStyle: React.CSSProperties = { ...infoStyle, gridColumn: "span 3" };
const labelStyle: React.CSSProperties = { fontSize: 11, color: "#6b7280", fontWeight: 900, textTransform: "uppercase", marginBottom: 5 };
const valueStyle: React.CSSProperties = { fontSize: 14, color: "#111827", fontWeight: 800, lineHeight: 1.45 };

const sectionStyle: React.CSSProperties = { marginBottom: 22 };
const sectionTitleStyle: React.CSSProperties = { margin: "0 0 10px", fontSize: 16, fontWeight: 900 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "9px 7px", borderBottom: "1px solid #d1d5db", fontSize: 11, color: "#374151", fontWeight: 900 };
const rightThStyle: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "10px 7px", borderBottom: "1px solid #e5e7eb", fontSize: 12, verticalAlign: "top" };
const rightTdStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", whiteSpace: "nowrap" };

const totalsSectionStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 320px",
  gap: 22,
  alignItems: "start",
  marginTop: 18,
};

const noteBoxStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 4, padding: 12, minHeight: 96 };
const noteTextStyle: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" };
const totalsBoxStyle: React.CSSProperties = { display: "grid", gap: 8 };
const totalLineStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 };
const totalStrongLineStyle: React.CSSProperties = { ...totalLineStyle, borderTop: "2px solid #111827", paddingTop: 10, fontSize: 16 };

const signatureGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 42,
  marginTop: 52,
};

const signatureBlockStyle: React.CSSProperties = { minHeight: 132 };
const signatureNameStyle: React.CSSProperties = { fontWeight: 800, minHeight: 24 };
const signatureLineStyle: React.CSSProperties = { borderBottom: "1px solid #111827", marginTop: 48 };
const dateLineStyle: React.CSSProperties = { marginTop: 12, fontSize: 12, color: "#374151" };

const primaryButtonStyle: React.CSSProperties = { border: "1px solid #111827", background: "#111827", color: "#ffffff", borderRadius: 6, padding: "9px 12px", fontWeight: 800, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid #d1d5db", background: "#ffffff", color: "#111827", borderRadius: 6, padding: "9px 12px", fontWeight: 800, textDecoration: "none" };
const messageStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: 18, fontWeight: 800 };
const errorStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: 18, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontWeight: 800 };
