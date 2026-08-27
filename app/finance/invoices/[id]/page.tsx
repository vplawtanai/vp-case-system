"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { feeAgreementStatusLabel } from "../../fee-agreements/lifecycle";
import { supabase } from "../../../../lib/supabase";

type Json = Record<string, unknown>;
type Invoice = {
  id: string;
  billing_plan_id: string;
  primary_billing_installment_id: string;
  fee_agreement_id: string;
  source_quotation_id: string | null;
  client_id: string;
  case_id: number | null;
  advisory_matter_id: string | null;
  invoice_no: string | null;
  document_status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  language_code: string;
  customer_note: string | null;
  payment_terms_text: string | null;
  internal_note: string | null;
  amount_before_vat: number | string;
  vat_amount: number | string;
  total_amount: number | string;
  customer_name: string | null;
  customer_tax_id: string | null;
  customer_branch: string | null;
  customer_billing_address: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  matter_snapshot_json: Json | null;
  source_snapshot_json: Json | null;
  created_at: string;
  updated_at: string;
};
type InvoiceItem = { id: string; description: string; vat_applicable: boolean; vat_rate: number | string; tax_category: string | null; price_tax_mode: string | null; amount_before_vat: number | string; vat_amount: number | string; line_total: number | string; sort_order: number };
type BillingPlan = { id: string; title: string | null; status: string; billing_method: string };
type Installment = { id: string; installment_no: number; title: string; trigger_type: string; trigger_description: string | null; due_date: string | null; status: string; readiness_event_date: string | null; readiness_reference: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string };
type FeeAgreement = { id: string; agreement_no: string | null; title: string; status: string; engagement_basis: "formal_agreement" | "accepted_quotation" | null; source_reference: string | null };

const statusLabels: Record<string, string> = { draft: "ร่างใบแจ้งหนี้", issued: "ออกใบแจ้งหนี้แล้ว", cancelled: "ยกเลิก", voided: "ยกเลิกเลขที่เอกสารแล้ว" };
const installmentStatusLabels: Record<string, string> = { pending: "รอดำเนินการ", ready_to_invoice: "พร้อมออกใบแจ้งหนี้", invoiced: "ออกใบแจ้งหนี้แล้ว", cancelled: "ยกเลิก" };
const triggerLabels: Record<string, string> = { agreement_effective: "เมื่อการว่าจ้างมีผล", date: "ตามวันที่", case_milestone: "ตามเหตุการณ์สำคัญ", manual: "กำหนดด้วยตนเอง", recurring_period: "ตามรอบระยะเวลา" };
const numberValue = (value: number | string | null | undefined) => Number(value || 0);
const money = (value: number | string | null | undefined, currency: string) => `${numberValue(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const date = (value: string | null | undefined) => value ? value.slice(0, 10) : "-";
const text = (value: unknown, fallback = "-") => typeof value === "string" && value.trim() ? value : fallback;

export default function InvoiceDraftDetailPage() {
  return <QuotationGuard>{() => <InvoiceDraftDetail />}</QuotationGuard>;
}

function InvoiceDraftDetail() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [installment, setInstallment] = useState<Installment | null>(null);
  const [agreement, setAgreement] = useState<FeeAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const invoiceResult = await supabase
      .from("finance_invoices")
      .select("id,billing_plan_id,primary_billing_installment_id,fee_agreement_id,source_quotation_id,client_id,case_id,advisory_matter_id,invoice_no,document_status,issue_date,due_date,currency,language_code,customer_note,payment_terms_text,internal_note,amount_before_vat,vat_amount,total_amount,customer_name,customer_tax_id,customer_branch,customer_billing_address,customer_phone,customer_email,matter_snapshot_json,source_snapshot_json,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (invoiceResult.error) { console.error("Failed to load Invoice Draft", invoiceResult.error); setError("ไม่สามารถโหลดร่างใบแจ้งหนี้ได้"); setLoading(false); return; }
    if (!invoiceResult.data) { setError("ไม่พบร่างใบแจ้งหนี้"); setLoading(false); return; }
    const invoiceRow = invoiceResult.data as Invoice;
    setInvoice(invoiceRow);
    const [itemsResult, planResult, installmentResult, agreementResult] = await Promise.all([
      supabase.from("finance_invoice_items").select("id,description,vat_applicable,vat_rate,tax_category,price_tax_mode,amount_before_vat,vat_amount,line_total,sort_order").eq("invoice_id", id).order("sort_order").order("id"),
      supabase.from("finance_billing_plans").select("id,title,status,billing_method").eq("id", invoiceRow.billing_plan_id).maybeSingle(),
      supabase.from("finance_billing_installments").select("id,installment_no,title,trigger_type,trigger_description,due_date,status,readiness_event_date,readiness_reference,amount_before_tax,vat_amount,total_amount").eq("id", invoiceRow.primary_billing_installment_id).maybeSingle(),
      supabase.from("finance_fee_agreements").select("id,agreement_no,title,status,engagement_basis,source_reference").eq("id", invoiceRow.fee_agreement_id).maybeSingle(),
    ]);
    if (itemsResult.error || planResult.error || installmentResult.error || agreementResult.error) {
      console.error("Failed to load Invoice Draft source context", { items: itemsResult.error, plan: planResult.error, installment: installmentResult.error, agreement: agreementResult.error });
      setError("โหลดข้อมูลต้นทางของร่างใบแจ้งหนี้บางส่วนไม่สำเร็จ กรุณารีเฟรช");
    }
    setItems((itemsResult.data || []) as InvoiceItem[]);
    setPlan((planResult.data || null) as BillingPlan | null);
    setInstallment((installmentResult.data || null) as Installment | null);
    setAgreement((agreementResult.data || null) as FeeAgreement | null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  if (loading) return <main style={page}>กำลังโหลดร่างใบแจ้งหนี้...</main>;
  if (!invoice) return <main style={page}>{error || "ไม่พบร่างใบแจ้งหนี้"}</main>;

  const matter = text(invoice.matter_snapshot_json?.title, text(invoice.matter_snapshot_json?.file_no, invoice.case_id || invoice.advisory_matter_id ? "เรื่อง/คดีที่เชื่อมไว้" : "ยังไม่ผูกเรื่อง"));
  const engagementReference = agreement ? agreement.engagement_basis === "accepted_quotation" ? text(agreement.source_reference, agreement.title) : text(agreement.agreement_no, agreement.title) : "-";

  return <main className="invoice-draft-page" style={page}>
    <nav className="invoice-navigation-toolbar" style={navigationToolbar} aria-label="การนำทางเอกสารที่เกี่ยวข้อง">
      <Link style={{ ...navigationLink, ...navigationBack }} href={`/finance/billing-plans/${invoice.billing_plan_id}`}><NavigationIcon name="back" />กลับไปแผนเรียกเก็บเงิน</Link>
      <Link style={{ ...navigationLink, ...navigationSource }} href={`/finance/fee-agreements/${invoice.fee_agreement_id}`}><NavigationIcon name="document" />เปิดข้อมูลการว่าจ้างต้นทาง</Link>
      {invoice.source_quotation_id ? <Link style={{ ...navigationLink, ...navigationSource }} href={`/finance/quotations/${invoice.source_quotation_id}`}><NavigationIcon name="document" />เปิดใบเสนอราคาต้นทาง</Link> : null}
    </nav>
    {error ? <div style={warning}>{error}</div> : null}

    <section style={{ ...card, ...headerCard }}>
      <div className="invoice-identity-header" style={identityHeader}>
        <div><span style={eyebrow}>INVOICE DRAFT</span><h1 style={title}>ร่างใบแจ้งหนี้</h1><p style={draftReference}>รหัสร่างภายใน {invoice.id.slice(0, 8).toUpperCase()}</p></div>
        <div style={statusPanel}><span style={metaLabel}>สถานะเอกสาร</span><StatusBadge status={invoice.document_status} label={statusLabels[invoice.document_status] || invoice.document_status} /><span style={updatedText}>สร้างเมื่อ {date(invoice.created_at)}</span></div>
      </div>
      <div style={numberNotice}><strong>ยังไม่มีเลขที่ใบแจ้งหนี้</strong><span>ระบบจะกำหนดเลขที่อย่างเป็นทางการเมื่อผ่านขั้นตอนออกใบแจ้งหนี้ในอนาคตเท่านั้น</span></div>
    </section>

    <section style={foundationNotice}><strong>พื้นที่ตรวจสอบร่าง Phase 4B</strong><span>ข้อมูลการเงินและตัวตนในร่างนี้เป็นแบบอ่านอย่างเดียว ยังไม่มีการออกเอกสาร การชำระเงิน หรือการบันทึกบัญชี</span></section>

    <section style={sourceTrail}>
      <h2 style={sourceTitle}>เส้นทางเอกสารต้นทาง</h2>
      <div className="invoice-source-nodes" style={sourceNodes}>
        {invoice.source_quotation_id ? <><SourceNode label="ใบเสนอราคา"><Link href={`/finance/quotations/${invoice.source_quotation_id}`}>{sourceQuotationNo(invoice.source_snapshot_json)}</Link></SourceNode><Arrow /></> : null}
        <SourceNode label={agreement?.engagement_basis === "accepted_quotation" ? "การว่าจ้างตามใบเสนอราคา" : "ข้อตกลงค่าบริการ"}><Link href={`/finance/fee-agreements/${invoice.fee_agreement_id}`}>{engagementReference}</Link>{agreement ? <StatusBadge status={agreement.status} label={feeAgreementStatusLabel(agreement.status)} /> : null}</SourceNode>
        <Arrow /><SourceNode label="แผนเรียกเก็บเงิน"><Link href={`/finance/billing-plans/${invoice.billing_plan_id}`}>{text(plan?.title, "แผนเรียกเก็บเงิน")}</Link></SourceNode>
        <Arrow /><SourceNode label={`งวดที่ ${installment?.installment_no || "-"}`}>{text(installment?.title, "งวดเรียกเก็บเงิน")}{installment ? <StatusBadge status={installment.status} label={installmentStatusLabels[installment.status] || installment.status} /> : null}</SourceNode>
        <Arrow /><SourceNode label="ร่างใบแจ้งหนี้" current>{invoice.id.slice(0, 8).toUpperCase()}</SourceNode>
      </div>
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>ข้อมูลลูกค้าและเอกสาร</h2>
      <div style={detailGrid}>
        <Field label="ลูกค้า" value={text(invoice.customer_name)} />
        <Field label="เลขประจำตัวผู้เสียภาษี" value={text(invoice.customer_tax_id)} />
        {invoice.customer_branch ? <Field label="สำนักงานใหญ่/สาขา" value={invoice.customer_branch} /> : null}
        <Field label="เรื่อง/คดี" value={matter} />
        <Field label="วันที่ออกเอกสาร" value={invoice.issue_date ? date(invoice.issue_date) : "ยังไม่กำหนดในร่าง"} />
        <Field label="วันที่ครบกำหนด" value={date(invoice.due_date)} />
        <Field label="ภาษา" value={invoice.language_code === "th" ? "ไทย" : "English"} />
        <Field label="สกุลเงิน" value={invoice.currency} />
      </div>
      {invoice.customer_billing_address || invoice.customer_phone || invoice.customer_email ? <div style={contactBlock}><strong>ข้อมูลติดต่อ/ที่อยู่ออกเอกสาร</strong>{invoice.customer_billing_address ? <span>{invoice.customer_billing_address}</span> : null}<span>{[invoice.customer_phone, invoice.customer_email].filter(Boolean).join(" · ")}</span></div> : null}
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>บริบทของงวดเรียกเก็บเงิน</h2>
      <div style={detailGrid}>
        <Field label="เงื่อนไขเรียกเก็บ" value={text(installment?.trigger_description, triggerLabels[installment?.trigger_type || ""] || "-")} />
        <Field label="วันที่เงื่อนไขเกิดขึ้นจริง" value={date(installment?.readiness_event_date)} />
        {installment?.readiness_reference ? <Field label="หลักฐาน/เลขอ้างอิง" value={installment.readiness_reference} /> : null}
        <Field label="สถานะงวด" value={installment ? installmentStatusLabels[installment.status] || installment.status : "-"} />
      </div>
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>รายการค่าบริการ</h2>
      {items.length === 0 ? <div style={warning}>ไม่พบรายการค่าบริการในร่างใบแจ้งหนี้</div> : <div style={tableScroll}><table className="invoice-item-table" style={table}><thead><tr><th>รายการ</th><th>อัตรา VAT</th><th>มูลค่าก่อน VAT</th><th>VAT</th><th>ยอดรวม</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.description}</strong>{item.tax_category ? <small style={itemMeta}>{item.tax_category}</small> : null}</td><td>{item.vat_applicable ? `${numberValue(item.vat_rate)}%` : "ไม่อยู่ในบังคับ VAT"}</td><td>{money(item.amount_before_vat, invoice.currency)}</td><td>{money(item.vat_amount, invoice.currency)}</td><td><strong>{money(item.line_total, invoice.currency)}</strong></td></tr>)}</tbody></table></div>}
      <div className="invoice-total-grid" style={totalsGrid}><Metric label="มูลค่าก่อน VAT" value={money(invoice.amount_before_vat, invoice.currency)} /><Metric label="VAT" value={money(invoice.vat_amount, invoice.currency)} /><Metric label="ยอดรวม" value={money(invoice.total_amount, invoice.currency)} prominent /></div>
    </section>

    {invoice.payment_terms_text || invoice.customer_note || invoice.internal_note ? <section style={card}><h2 style={sectionTitle}>หมายเหตุและเงื่อนไข</h2><div style={detailGrid}>{invoice.payment_terms_text ? <Field label="เงื่อนไขการชำระเงิน" value={invoice.payment_terms_text} /> : null}{invoice.customer_note ? <Field label="หมายเหตุสำหรับลูกค้า" value={invoice.customer_note} /> : null}{invoice.internal_note ? <Field label="หมายเหตุภายใน" value={invoice.internal_note} /> : null}</div></section> : null}

    <style jsx global>{`
      .invoice-item-table th, .invoice-item-table td { padding: 10px 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .invoice-item-table th { background: #f8fafc; color: #475569; font-size: 12px; text-align: left; white-space: nowrap; }
      .invoice-item-table th:nth-child(n+3), .invoice-item-table td:nth-child(n+3) { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .invoice-item-table tbody tr:last-child td { border-bottom: 0; }
      @media (max-width: 760px) {
        .invoice-draft-page { padding: 14px !important; }
        .invoice-navigation-toolbar, .invoice-identity-header, .invoice-total-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .invoice-navigation-toolbar a { width: 100%; white-space: normal !important; }
        .invoice-source-nodes { display: grid !important; grid-template-columns: minmax(0, 1fr); }
        .invoice-source-arrow { display: none; }
      }
    `}</style>
  </main>;
}

function Field({ label, value }: { label: string; value: ReactNode }) { return <div style={{ minWidth: 0 }}><small style={fieldLabel}>{label}</small><div style={fieldValue}>{value}</div></div>; }
function StatusBadge({ status, label }: { status: string; label: string }) { return <span style={{ ...badge, ...(status === "draft" || status === "ready_to_invoice" ? amberBadge : status === "cancelled" || status === "voided" ? redBadge : greenBadge) }}>{label}</span>; }
function SourceNode({ label, current = false, children }: { label: string; current?: boolean; children: ReactNode }) { return <div style={{ ...sourceNode, ...(current ? currentNode : {}) }}><small style={fieldLabel}>{label}</small><div style={sourceNodeContent}>{children}</div></div>; }
function Arrow() { return <span className="invoice-source-arrow" style={sourceArrow} aria-hidden="true">→</span>; }
function Metric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...metric, ...(prominent ? prominentMetric : {}) }}><small>{label}</small><strong style={metricValue}>{value}</strong></div>; }
function NavigationIcon({ name }: { name: "back" | "document" }) { const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; return name === "back" ? <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg> : <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" /></svg>; }
function sourceQuotationNo(snapshot: Json | null) { const sourceDocument = snapshot?.source_document; return text(sourceDocument && typeof sourceDocument === "object" && !Array.isArray(sourceDocument) ? (sourceDocument as Json).quotation_no : null, "ใบเสนอราคาต้นทาง"); }

const page: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24 };
const card: CSSProperties = { marginBottom: 16, padding: 18, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" };
const navigationToolbar: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,max-content)", gap: 8, marginBottom: 18, padding: 8, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" };
const navigationLink: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 38, padding: "8px 11px", border: "1px solid", borderRadius: 6, fontSize: 14, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" };
const navigationBack: CSSProperties = { borderColor: "#cbd5e1", background: "#fff", color: "#475569" };
const navigationSource: CSSProperties = { borderColor: "#c7d2fe", background: "#eef2ff", color: "#3730a3" };
const warning: CSSProperties = { marginBottom: 12, padding: 12, borderRadius: 6, background: "#fff7ed", color: "#9a3412" };
const headerCard: CSSProperties = { padding: 0, overflow: "hidden" };
const identityHeader: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 24, padding: 20 };
const eyebrow: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 800 };
const title: CSSProperties = { margin: "4px 0", color: "#172033", fontSize: 28 };
const draftReference: CSSProperties = { margin: 0, color: "#64748b", fontSize: 13 };
const statusPanel: CSSProperties = { display: "grid", alignContent: "start", justifyItems: "end", gap: 7, minWidth: 190, padding: "8px 12px", borderLeft: "2px solid #fbbf24", background: "#fffbeb" };
const metaLabel: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 700 };
const updatedText: CSSProperties = { color: "#64748b", fontSize: 12 };
const numberNotice: CSSProperties = { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px", padding: "12px 20px", borderTop: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", fontSize: 13 };
const foundationNotice: CSSProperties = { display: "grid", gap: 3, marginBottom: 16, padding: 12, border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", color: "#1e40af", fontSize: 13 };
const sourceTrail: CSSProperties = { marginBottom: 16, padding: "12px 0", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" };
const sourceTitle: CSSProperties = { margin: "0 0 10px", color: "#475569", fontSize: 14 };
const sourceNodes: CSSProperties = { display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap" };
const sourceNode: CSSProperties = { flex: "1 1 165px", minWidth: 0, padding: 10, border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", fontSize: 13 };
const currentNode: CSSProperties = { borderColor: "#2563eb", background: "#eff6ff" };
const sourceNodeContent: CSSProperties = { display: "grid", gap: 6, marginTop: 5, overflowWrap: "anywhere" };
const sourceArrow: CSSProperties = { alignSelf: "center", color: "#64748b", fontSize: 19 };
const sectionTitle: CSSProperties = { margin: "0 0 14px", color: "#172033", fontSize: 18 };
const detailGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 };
const fieldLabel: CSSProperties = { color: "#64748b", fontSize: 12 };
const fieldValue: CSSProperties = { marginTop: 3, color: "#172033", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
const contactBlock: CSSProperties = { display: "grid", gap: 4, marginTop: 14, padding: 12, border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc", color: "#475569", fontSize: 13 };
const tableScroll: CSSProperties = { overflowX: "auto" };
const table: CSSProperties = { width: "100%", minWidth: 720, border: "1px solid #e2e8f0", borderRadius: 6, borderSpacing: 0, tableLayout: "fixed" };
const itemMeta: CSSProperties = { display: "block", marginTop: 3, color: "#64748b" };
const totalsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginTop: 14, border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" };
const metric: CSSProperties = { display: "grid", gap: 5, padding: 12, borderLeft: "1px solid #e2e8f0", color: "#64748b" };
const prominentMetric: CSSProperties = { background: "#f0fdf4", color: "#166534" };
const metricValue: CSSProperties = { color: "#172033", fontSize: 18, fontVariantNumeric: "tabular-nums" };
const badge: CSSProperties = { display: "inline-block", width: "fit-content", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
const amberBadge: CSSProperties = { background: "#fef3c7", color: "#92400e" };
const greenBadge: CSSProperties = { background: "#dcfce7", color: "#166534" };
const redBadge: CSSProperties = { background: "#fee2e2", color: "#b91c1c" };
