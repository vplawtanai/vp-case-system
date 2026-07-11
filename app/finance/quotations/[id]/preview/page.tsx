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
  scope_of_legal_services: string | null;
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

type ClientRow = {
  id: string;
  name: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type CaseRow = {
  id: number;
  file_no: string | null;
  title: string | null;
  client_name: string | null;
};

type MatterRow = {
  id: string;
  matter_no: string | null;
  title: string | null;
};

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
          ? supabase.from("clients").select("id, name, tax_id, email, phone, address").eq("id", loadedQuotation.client_id).maybeSingle()
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

  const clientName = getClientDisplayValue(quotation, client, "name") || quotation?.client_id || "-";
  const clientAddress = getClientDisplayValue(quotation, client, "address");
  const clientTaxId = getClientDisplayValue(quotation, client, "tax_id");
  const clientPhone = getClientDisplayValue(quotation, client, "phone");
  const clientEmail = getClientDisplayValue(quotation, client, "email");
  const clientContact = getSnapshotText(quotation?.client_snapshot_json, "contact_person") || getSnapshotText(quotation?.client_snapshot_json, "contact_name") || "-";
  const matterLabel = getMatterLabel(quotation, caseItem, matter);
  const scopeText = quotation?.scope_of_legal_services?.trim() || getMatterDescription(quotation, caseItem, matter) || "-";
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
            <div style={providerHeaderStyle}>
              <div className="quotation-logo" style={companyMarkStyle}>VP</div>
              <div>
                <div style={companyNameThaiStyle}>บริษัท วีพี พาร์ทเนอร์ จำกัด</div>
                <div style={companyNameStyle}>VP Partners Co., Ltd.</div>
                <div style={companyMetaStyle}>Professional Legal Services</div>
              </div>
            </div>
            <div style={documentTitleBlockStyle}>
              <h1 style={documentTitleStyle}>ใบเสนอราคา / Quotation</h1>
              <div style={statusStyle}>{quotation.status || "draft"}</div>
            </div>
          </header>

          <section className="quotation-compact-block" style={topGridStyle}>
            <div style={panelStyle}>
              <h2 style={panelTitleStyle}>ผู้ให้บริการ / Service Provider</h2>
              <InfoLine label="Company" value="บริษัท วีพี พาร์ทเนอร์ จำกัด / VP Partners Co., Ltd." />
              <InfoLine label="Tax ID" value="-" />
              <InfoLine label="Address" value="-" />
              <InfoLine label="Phone" value="-" />
              <InfoLine label="Email" value="-" />
              <InfoLine label="Website" value="-" />
            </div>
            <div style={panelStyle}>
              <h2 style={panelTitleStyle}>ข้อมูลเอกสาร / Document Information</h2>
              <InfoLine label="Quotation No." value={quotation.quotation_no || "-"} strong />
              <InfoLine label="Status" value={quotation.status || "draft"} />
              <InfoLine label="Issue Date" value={formatDate(quotation.issue_date)} />
              <InfoLine label="Valid Until" value={formatDate(quotation.valid_until)} />
              <InfoLine label="Reference / Linked Matter" value={matterLabel} />
            </div>
          </section>

          <section className="quotation-compact-block" style={panelStyle}>
            <h2 style={panelTitleStyle}>ลูกค้า / Client</h2>
            <div style={clientGridStyle}>
              <InfoLine label="Client Name" value={clientName} strong />
              <InfoLine label="Tax ID" value={clientTaxId} />
              <InfoLine label="Phone" value={clientPhone} />
              <InfoLine label="Email" value={clientEmail} />
              <InfoLine label="Contact Person" value={clientContact} />
              <InfoLine label="Address" value={clientAddress} wide />
            </div>
          </section>

          <section className="quotation-compact-block" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>ขอบเขตงาน / Scope of Legal Services</h2>
            <div style={scopeBoxStyle}>{scopeText}</div>
          </section>

          <section className="quotation-compact-block" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>รายการค่าบริการ / Fee Items</h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>No.</th>
                  <th style={thStyle}>Description</th>
                  <th style={rightThStyle}>Quantity</th>
                  <th style={rightThStyle}>Unit Price</th>
                  <th style={rightThStyle}>VAT</th>
                  <th style={rightThStyle}>Amount Before Tax</th>
                  <th style={rightThStyle}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td style={tdStyle} colSpan={7}>No line items.</td></tr>
                ) : items.map((item, index) => (
                  <tr key={item.id || index}>
                    <td style={tdStyle}>{index + 1}</td>
                    <td style={descriptionTdStyle}>{item.description || "-"}</td>
                    <td style={rightTdStyle}>{formatQuantity(item.quantity)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.unit_price)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.vat_amount)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.amount_before_tax)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="quotation-keep-together" style={totalsSectionStyle}>
            <div style={termsBoxStyle}>
              <h2 style={sectionTitleStyle}>หมายเหตุและเงื่อนไข / Notes and Conditions</h2>
              {quotation.note ? <p style={noteParagraphStyle}>{quotation.note}</p> : null}
              <ul style={termsListStyle}>
                <li>ใบเสนอราคานี้ไม่ใช่ใบแจ้งหนี้หรือใบเสร็จรับเงิน</li>
                <li>ค่าธรรมเนียมศาล ค่าธรรมเนียมราชการ ค่าเดินทาง ค่าที่พัก ค่าถ่ายเอกสาร ค่าจัดส่ง ค่าแปลเอกสาร และค่าใช้จ่ายนอกกระเป๋าอื่น ๆ ไม่รวมอยู่ในใบเสนอราคานี้ เว้นแต่ระบุไว้โดยชัดแจ้ง</li>
                <li>การเริ่มงานขึ้นอยู่กับการยืนยันจากลูกความและ/หรือเงื่อนไขการชำระเงินที่คู่สัญญาตกลงกัน</li>
                <li>ใบเสนอราคานี้มีผลถึงวันที่ Valid Until ที่ระบุไว้ข้างต้น</li>
              </ul>
            </div>
            <div style={totalsBoxStyle}>
              <TotalLine label="Subtotal Vatable" value={quotation.subtotal_vatable} />
              <TotalLine label="Subtotal Non-Vatable" value={quotation.subtotal_non_vatable} />
              <TotalLine label="VAT" value={quotation.vat_amount} />
              <TotalLine label="Grand Total / จำนวนเงินตามใบเสนอราคา" value={quotation.grand_total} strong />
            </div>
          </section>

          <section className="signature-section" style={signatureGridStyle}>
            <SignatureBlock
              title="ผู้เสนอราคา / Service Provider"
              name={preparedBy}
              position="Authorized Partner / Partner / -"
            />
            <SignatureBlock
              title="ผู้ยอมรับใบเสนอราคา / Client Acceptance"
              name="____________________"
              position="____________________"
            />
          </section>
        </article>
      ) : null}
    </>
  );
}

function InfoLine({ label, value, strong = false, wide = false }: { label: string; value: string; strong?: boolean; wide?: boolean }) {
  return (
    <div style={wide ? wideInfoLineStyle : infoLineStyle}>
      <span style={infoLineLabelStyle}>{label}</span>
      <span style={strong ? strongInfoLineValueStyle : infoLineValueStyle}>{value || "-"}</span>
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

function SignatureBlock({ title, name, position }: { title: string; name: string; position: string }) {
  return (
    <div style={signatureBlockStyle}>
      <div style={signatureTitleStyle}>{title}</div>
      <div style={signatureLineStyle} />
      <div style={signatureFieldStyle}>Name: {name}</div>
      <div style={signatureFieldStyle}>Position: {position}</div>
      <div style={signatureFieldStyle}>Date: ____________________</div>
    </div>
  );
}

function getClientDisplayValue(quotation: QuotationRow | null, client: ClientRow | null, key: keyof ClientRow) {
  const snapshotValue = getSnapshotText(quotation?.client_snapshot_json, key);
  const clientValue = client?.[key];
  if (snapshotValue) return snapshotValue;
  return typeof clientValue === "string" && clientValue.trim() ? clientValue : "-";
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
  return "-";
}

function getMatterDescription(quotation: QuotationRow | null, caseItem: CaseRow | null, matter: MatterRow | null) {
  if (!quotation) return "";
  return (
    getSnapshotText(quotation.matter_snapshot_json, "description") ||
    getSnapshotText(quotation.matter_snapshot_json, "title") ||
    caseItem?.title ||
    matter?.title ||
    ""
  );
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
    @page {
      size: A4;
      margin: 8mm;
    }
    body {
      background: #ffffff !important;
      padding-left: 0 !important;
    }
    body * {
      visibility: hidden !important;
    }
    .quotation-print-document,
    .quotation-print-document * {
      visibility: visible !important;
    }
    aside,
    nav,
    header:not(.quotation-print-document header),
    button,
    [role="button"],
    .print-hidden {
      display: none !important;
    }
    main {
      max-width: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .quotation-print-document {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      min-height: auto !important;
      margin: 0 auto !important;
      box-shadow: none !important;
      border: none !important;
      padding: 0 !important;
      page-break-after: avoid;
      color: #111827 !important;
      font-size: 10.5pt !important;
    }
    .quotation-print-document header {
      margin-bottom: 10px !important;
      padding-bottom: 10px !important;
    }
    .quotation-print-document table {
      page-break-inside: auto;
    }
    .quotation-print-document tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .quotation-print-document th,
    .quotation-print-document td {
      padding-top: 5px !important;
      padding-bottom: 5px !important;
    }
    .quotation-compact-block {
      margin-bottom: 9px !important;
    }
    .quotation-keep-together {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-top: 10px !important;
    }
    .signature-section {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-top: 20px !important;
    }
    .signature-section > div {
      min-height: 115px !important;
      padding: 10px !important;
    }
    .quotation-logo {
      background: #ffffff !important;
      color: #111827 !important;
      border: 2px solid #111827 !important;
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
  maxWidth: 920,
  margin: "0 auto",
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  boxShadow: "0 10px 32px rgba(15, 23, 42, 0.08)",
  padding: "38px 42px",
};

const documentHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 28,
  borderBottom: "3px solid #111827",
  paddingBottom: 18,
  marginBottom: 22,
};

const providerHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
};

const companyMarkStyle: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 8,
  background: "#111827",
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontSize: 21,
  fontWeight: 900,
  flex: "0 0 auto",
};

const companyNameThaiStyle: React.CSSProperties = { fontSize: 17, fontWeight: 900, lineHeight: 1.35 };
const companyNameStyle: React.CSSProperties = { fontSize: 15, fontWeight: 900, lineHeight: 1.35 };
const companyMetaStyle: React.CSSProperties = { marginTop: 4, fontSize: 12, color: "#6b7280", fontWeight: 800 };
const documentTitleBlockStyle: React.CSSProperties = { textAlign: "right", minWidth: 260 };
const documentTitleStyle: React.CSSProperties = { margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: 0 };
const statusStyle: React.CSSProperties = {
  marginTop: 8,
  display: "inline-block",
  textTransform: "capitalize",
  fontWeight: 900,
  color: "#111827",
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 12,
};

const topGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginBottom: 14,
};

const panelStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: 14,
  minWidth: 0,
  marginBottom: 14,
};

const panelTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 14,
  fontWeight: 900,
  color: "#111827",
};

const clientGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 18,
};

const infoLineStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "132px minmax(0, 1fr)",
  gap: 8,
  padding: "5px 0",
  borderBottom: "1px solid #f3f4f6",
  fontSize: 12,
};

const wideInfoLineStyle: React.CSSProperties = { ...infoLineStyle, gridColumn: "span 2" };
const infoLineLabelStyle: React.CSSProperties = { color: "#6b7280", fontWeight: 800 };
const infoLineValueStyle: React.CSSProperties = { color: "#111827", fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" };
const strongInfoLineValueStyle: React.CSSProperties = { ...infoLineValueStyle, fontWeight: 900 };

const sectionStyle: React.CSSProperties = { marginBottom: 20 };
const sectionTitleStyle: React.CSSProperties = { margin: "0 0 10px", fontSize: 15, fontWeight: 900 };
const scopeBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#fafafa",
  padding: 12,
  fontSize: 13,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
};

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "9px 7px",
  borderBottom: "1px solid #d1d5db",
  background: "#f9fafb",
  fontSize: 10.5,
  color: "#374151",
  fontWeight: 900,
};
const rightThStyle: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "10px 7px", borderBottom: "1px solid #e5e7eb", fontSize: 11.5, verticalAlign: "top" };
const descriptionTdStyle: React.CSSProperties = { ...tdStyle, overflowWrap: "anywhere", lineHeight: 1.45 };
const rightTdStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", whiteSpace: "nowrap" };

const totalsSectionStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 330px",
  gap: 22,
  alignItems: "start",
  marginTop: 18,
};

const termsBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: 13,
  minHeight: 120,
};
const noteParagraphStyle: React.CSSProperties = { margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap" };
const termsListStyle: React.CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 12.2, lineHeight: 1.65 };
const totalsBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  border: "1px solid #111827",
  borderRadius: 6,
  padding: 14,
};
const totalLineStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12.5 };
const totalStrongLineStyle: React.CSSProperties = { ...totalLineStyle, borderTop: "2px solid #111827", paddingTop: 10, fontSize: 15 };

const signatureGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 38,
  marginTop: 44,
};

const signatureBlockStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: 16,
  minHeight: 168,
};
const signatureTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 900, marginBottom: 52 };
const signatureLineStyle: React.CSSProperties = { borderBottom: "1px solid #111827", marginBottom: 12 };
const signatureFieldStyle: React.CSSProperties = { marginTop: 8, fontSize: 12, color: "#374151" };

const primaryButtonStyle: React.CSSProperties = { border: "1px solid #111827", background: "#111827", color: "#ffffff", borderRadius: 6, padding: "9px 12px", fontWeight: 800, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid #d1d5db", background: "#ffffff", color: "#111827", borderRadius: 6, padding: "9px 12px", fontWeight: 800, textDecoration: "none" };
const messageStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: 18, fontWeight: 800 };
const errorStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: 18, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontWeight: 800 };
