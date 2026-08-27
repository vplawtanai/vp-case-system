"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { feeAgreementStatusLabel } from "../../fee-agreements/lifecycle";
import { supabase } from "../../../../lib/supabase";
import {
  bangkokToday,
  displayText,
  formatBangkokDateTime,
  formatDocumentDate,
  invoiceDraftFingerprint,
  invoiceDraftForm,
  invoiceStatusLabels,
  installmentStatusLabels,
  money,
  safeInvoiceError,
  sourceQuotationNo,
  triggerLabels,
  type FinanceInvoice,
  type FinanceInvoiceItem,
  type InvoiceDraftForm,
} from "../shared";

type BillingPlan = { id: string; title: string | null; status: string; billing_method: string };
type Installment = { id: string; installment_no: number; title: string; trigger_type: string; trigger_description: string | null; due_date: string | null; status: string; readiness_event_date: string | null; readiness_confirmed_at: string | null; readiness_reference: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string };
type FeeAgreement = { id: string; agreement_no: string | null; title: string; status: string; engagement_basis: "formal_agreement" | "accepted_quotation" | null; source_reference: string | null };
type FormErrors = Partial<Record<"issueDate" | "dueDate", string>>;

const invoiceSelect = "id,billing_plan_id,primary_billing_installment_id,fee_agreement_id,source_quotation_id,client_id,case_id,advisory_matter_id,invoice_no,document_status,issue_date,due_date,currency,language_code,customer_note,payment_terms_text,internal_note,amount_before_vat,vat_amount,total_amount,seller_name_th,seller_name_en,seller_tax_id,seller_branch,seller_address,seller_phone,seller_email,seller_website,customer_name,customer_tax_id,customer_branch,customer_billing_address,customer_phone,customer_email,seller_snapshot_json,customer_snapshot_json,matter_snapshot_json,source_snapshot_json,issued_snapshot_json,issued_at,cancelled_at,cancel_reason,created_at,updated_at";
const itemSelect = "id,description,source_quantity,source_unit_price,allocation_percent,vat_applicable,vat_rate,tax_category,price_tax_mode,amount_before_vat,vat_amount,line_total,sort_order";

export default function InvoiceDetailPage() {
  return <QuotationGuard>{() => <InvoiceWorkspace />}</QuotationGuard>;
}

function InvoiceWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [installment, setInstallment] = useState<Installment | null>(null);
  const [agreement, setAgreement] = useState<FeeAgreement | null>(null);
  const [form, setForm] = useState<InvoiceDraftForm>({ issueDate: "", dueDate: "", customerNote: "", paymentTermsText: "", internalNote: "", languageCode: "th" });
  const [baseline, setBaseline] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issueConfirmed, setIssueConfirmed] = useState(false);
  const [cancelPanelOpen, setCancelPanelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const actionLock = useRef(false);
  const settingsRef = useRef<HTMLElement | null>(null);
  const issueDateRef = useRef<HTMLInputElement | null>(null);
  const dueDateRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const invoiceResult = await supabase.from("finance_invoices").select(invoiceSelect).eq("id", id).maybeSingle();
    if (invoiceResult.error) {
      console.error("Failed to load Invoice", invoiceResult.error);
      setError("ไม่สามารถโหลดใบแจ้งหนี้ได้"); setLoading(false); return;
    }
    if (!invoiceResult.data) { setError("ไม่พบใบแจ้งหนี้"); setLoading(false); return; }
    const invoiceRow = invoiceResult.data as FinanceInvoice;
    const [itemsResult, planResult, installmentResult, agreementResult] = await Promise.all([
      supabase.from("finance_invoice_items").select(itemSelect).eq("invoice_id", id).order("sort_order").order("id"),
      supabase.from("finance_billing_plans").select("id,title,status,billing_method").eq("id", invoiceRow.billing_plan_id).maybeSingle(),
      supabase.from("finance_billing_installments").select("id,installment_no,title,trigger_type,trigger_description,due_date,status,readiness_event_date,readiness_confirmed_at,readiness_reference,amount_before_tax,vat_amount,total_amount").eq("id", invoiceRow.primary_billing_installment_id).maybeSingle(),
      supabase.from("finance_fee_agreements").select("id,agreement_no,title,status,engagement_basis,source_reference").eq("id", invoiceRow.fee_agreement_id).maybeSingle(),
    ]);
    if (itemsResult.error || planResult.error || installmentResult.error || agreementResult.error) {
      console.error("Failed to load Invoice source context", { items: itemsResult.error, plan: planResult.error, installment: installmentResult.error, agreement: agreementResult.error });
      setError("โหลดข้อมูลต้นทางของใบแจ้งหนี้บางส่วนไม่สำเร็จ กรุณารีเฟรช");
    }
    const nextForm = invoiceDraftForm(invoiceRow);
    setInvoice(invoiceRow);
    setItems((itemsResult.data || []) as FinanceInvoiceItem[]);
    setPlan((planResult.data || null) as BillingPlan | null);
    setInstallment((installmentResult.data || null) as Installment | null);
    setAgreement((agreementResult.data || null) as FeeAgreement | null);
    setForm(nextForm);
    setBaseline(invoiceDraftFingerprint(nextForm));
    setFormErrors({});
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const fingerprint = useMemo(() => invoiceDraftFingerprint(form), [form]);
  const dirty = Boolean(baseline) && fingerprint !== baseline;
  const isDraft = invoice?.document_status === "draft";

  const updateForm = <Key extends keyof InvoiceDraftForm>(key: Key, value: InvoiceDraftForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "issueDate" || key === "dueDate") setFormErrors((current) => ({ ...current, [key]: undefined }));
    setMessage("");
  };

  const validateDates = (requireIssueDate: boolean) => {
    const nextErrors: FormErrors = {};
    if (requireIssueDate && !form.issueDate) nextErrors.issueDate = "กรุณาระบุวันที่ออกเอกสาร";
    if (form.issueDate && form.dueDate && form.dueDate < form.issueDate) nextErrors.dueDate = "วันที่ครบกำหนดต้องไม่มาก่อนวันที่ออกเอกสาร";
    if (requireIssueDate && form.issueDate && form.issueDate > bangkokToday()) nextErrors.issueDate = "วันที่ออกใบแจ้งหนี้ต้องไม่เป็นวันในอนาคต";
    setFormErrors(nextErrors);
    const first = nextErrors.issueDate ? issueDateRef.current : nextErrors.dueDate ? dueDateRef.current : null;
    if (first) requestAnimationFrame(() => { first.scrollIntoView({ behavior: "smooth", block: "center" }); first.focus(); });
    return Object.keys(nextErrors).length === 0;
  };

  const saveDraft = async () => {
    if (!invoice || !isDraft || !dirty || saving || actionLock.current || !validateDates(false)) return;
    actionLock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("save_finance_invoice_draft", {
        p_invoice_id: invoice.id,
        p_issue_date: form.issueDate || null,
        p_due_date: form.dueDate || null,
        p_customer_note: form.customerNote,
        p_payment_terms_text: form.paymentTermsText,
        p_internal_note: form.internalNote,
        p_language_code: form.languageCode,
      });
      if (result.error) throw result.error;
      setBaseline(invoiceDraftFingerprint(form));
      setInvoice((current) => current ? { ...current, issue_date: form.issueDate || null, due_date: form.dueDate || null, customer_note: form.customerNote.trim() || null, payment_terms_text: form.paymentTermsText.trim() || null, internal_note: form.internalNote.trim() || null, language_code: form.languageCode, updated_at: new Date().toISOString() } : current);
      setMessage("บันทึกการเปลี่ยนแปลงแล้ว");
    } catch (saveError) {
      setError(safeInvoiceError(saveError, "บันทึกร่างใบแจ้งหนี้ไม่สำเร็จ"));
    } finally {
      actionLock.current = false; setSaving(false);
    }
  };

  const openIssueReview = () => {
    setError(""); setMessage("");
    if (!validateDates(true)) return;
    if (dirty) {
      setError("กรุณาบันทึกการเปลี่ยนแปลงก่อนออกใบแจ้งหนี้");
      settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setIssueConfirmed(false); setIssuePanelOpen(true);
    requestAnimationFrame(() => document.getElementById("invoice-issue-confirmation")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const issueInvoice = async () => {
    if (!invoice || !isDraft || !issueConfirmed || issuing || actionLock.current) return;
    if (!validateDates(true) || dirty) return;
    actionLock.current = true; setIssuing(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("issue_finance_invoice", { p_invoice_id: invoice.id, p_human_confirmed: true });
      if (result.error) throw result.error;
      setIssuePanelOpen(false);
      await load();
      setMessage("ออกใบแจ้งหนี้แล้ว ระบบได้กำหนดเลขที่เอกสารและล็อกข้อมูลเรียบร้อย");
    } catch (issueError) {
      setError(safeInvoiceError(issueError, "ออกใบแจ้งหนี้ไม่สำเร็จ"));
    } finally {
      actionLock.current = false; setIssuing(false);
    }
  };

  const cancelDraft = async () => {
    if (!invoice || !isDraft || !cancelReason.trim() || cancelling || actionLock.current) return;
    actionLock.current = true; setCancelling(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("cancel_finance_invoice_draft", { p_invoice_id: invoice.id, p_reason: cancelReason });
      if (result.error) throw result.error;
      setCancelPanelOpen(false);
      await load();
      setMessage("ยกเลิกร่างใบแจ้งหนี้แล้ว งวดต้นทางยังคงสถานะพร้อมออกใบแจ้งหนี้");
    } catch (cancelError) {
      setError(safeInvoiceError(cancelError, "ยกเลิกร่างใบแจ้งหนี้ไม่สำเร็จ"));
    } finally {
      actionLock.current = false; setCancelling(false);
    }
  };

  if (loading) return <main style={page}>กำลังโหลดใบแจ้งหนี้...</main>;
  if (!invoice) return <main style={page}>{error || "ไม่พบใบแจ้งหนี้"}</main>;

  const matter = displayText(invoice.matter_snapshot_json?.title, displayText(invoice.matter_snapshot_json?.file_no, invoice.case_id || invoice.advisory_matter_id ? "เรื่อง/คดีที่เชื่อมไว้" : "ยังไม่ผูกเรื่อง"));
  const engagementReference = agreement ? agreement.engagement_basis === "accepted_quotation" ? displayText(agreement.source_reference, agreement.title) : displayText(agreement.agreement_no, agreement.title) : "-";
  const installmentLabel = installment ? `งวดที่ ${installment.installment_no}${installment.title ? ` · ${installment.title}` : ""}` : "-";

  return <main className="invoice-workspace" style={page}>
    <nav className="invoice-navigation-toolbar" style={navigationToolbar} aria-label="การนำทางเอกสารที่เกี่ยวข้อง">
      <NavigationLink href={`/finance/billing-plans/${invoice.billing_plan_id}`} icon="back" variant="back">กลับไปแผนเรียกเก็บเงิน</NavigationLink>
      <NavigationLink href={`/finance/fee-agreements/${invoice.fee_agreement_id}`} icon="document" variant="source">เปิดข้อมูลการว่าจ้างต้นทาง</NavigationLink>
      {invoice.source_quotation_id ? <NavigationLink href={`/finance/quotations/${invoice.source_quotation_id}`} icon="document" variant="source">เปิดใบเสนอราคาต้นทาง</NavigationLink> : null}
    </nav>

    {error ? <div role="alert" style={errorNotice}>{error}</div> : null}
    {message ? <div role="status" style={successNotice}>{message}</div> : null}

    <section style={{ ...surface, ...headerSurface }}>
      <div className="invoice-identity-header" style={identityHeader}>
        <div><span style={eyebrow}>{isDraft ? "INVOICE DRAFT" : "INVOICE"}</span><h1 style={title}>{isDraft ? "ร่างใบแจ้งหนี้" : "ใบแจ้งหนี้"}</h1>{isDraft ? <p style={draftReference}>รหัสอ้างอิงร่างภายใน {invoice.id.slice(0, 8).toUpperCase()}</p> : <div style={officialNumber}><small>เลขที่ใบแจ้งหนี้</small><strong style={officialNumberValue}>{displayText(invoice.invoice_no)}</strong></div>}</div>
        <div className="invoice-status-panel" style={{ ...statusPanel, ...(invoice.document_status === "issued" ? issuedStatusPanel : {}) }}><span style={metaLabel}>สถานะเอกสาร</span><StatusBadge status={invoice.document_status} label={invoiceStatusLabels[invoice.document_status] || invoice.document_status} />{invoice.issued_at ? <span style={updatedText}>ออกเอกสาร {formatBangkokDateTime(invoice.issued_at)}</span> : null}<span style={updatedText}>สร้าง {formatBangkokDateTime(invoice.created_at)}</span><span style={updatedText}>แก้ไขล่าสุด {formatBangkokDateTime(invoice.updated_at)}</span></div>
      </div>
      {isDraft ? <div style={numberNotice}><strong>ยังไม่มีเลขที่ใบแจ้งหนี้</strong><span>เลขที่ VP-IV จะถูกกำหนดเมื่อยืนยันออกใบแจ้งหนี้เท่านั้น</span></div> : null}
      {invoice.document_status === "issued" ? <div style={issuedNotice}><strong>เอกสารถูกออกแล้วและเป็นแบบอ่านอย่างเดียว</strong><span>ขั้นตอนถัดไปคือรอรับชำระเงิน</span><span>การออกใบแจ้งหนี้ยังไม่ถือว่าได้รับชำระเงิน</span></div> : null}
      {invoice.document_status === "cancelled" ? <div style={cancelledNotice}><strong>ร่างนี้ถูกยกเลิกแล้ว</strong><span>{displayText(invoice.cancel_reason)}</span></div> : null}
    </section>

    <section style={sourceTrail}>
      <h2 style={compactHeading}>เส้นทางเอกสารต้นทาง</h2>
      <div className="invoice-source-nodes" style={sourceNodes}>
        {invoice.source_quotation_id ? <><SourceNode label="ใบเสนอราคา"><Link href={`/finance/quotations/${invoice.source_quotation_id}`}>{sourceQuotationNo(invoice.source_snapshot_json)}</Link></SourceNode><Arrow /></> : null}
        <SourceNode label={agreement?.engagement_basis === "accepted_quotation" ? "การว่าจ้างตามใบเสนอราคา" : "ข้อตกลงค่าบริการ"}><Link href={`/finance/fee-agreements/${invoice.fee_agreement_id}`}>{engagementReference}</Link>{agreement ? <StatusBadge status={agreement.status} label={feeAgreementStatusLabel(agreement.status)} /> : null}</SourceNode>
        <Arrow /><SourceNode label="แผนเรียกเก็บเงิน"><Link href={`/finance/billing-plans/${invoice.billing_plan_id}`}>{displayText(plan?.title, "แผนเรียกเก็บเงิน")}</Link></SourceNode>
        <Arrow /><SourceNode label={`งวดที่ ${installment?.installment_no || "-"}`}>{displayText(installment?.title, "งวดเรียกเก็บเงิน")}{installment ? <StatusBadge status={installment.status} label={installmentStatusLabels[installment.status] || installment.status} /> : null}</SourceNode>
        <Arrow /><SourceNode label={isDraft ? "ร่างใบแจ้งหนี้" : "ใบแจ้งหนี้"} current>{invoice.invoice_no || invoice.id.slice(0, 8).toUpperCase()}</SourceNode>
      </div>
    </section>

    <section style={surface}>
      <SectionHeading title="ข้อมูลลูกค้าและการเรียกเก็บเงิน" description="ข้อมูลนี้คัดลอกจากการว่าจ้างต้นทางและไม่สามารถแก้ไขจากใบแจ้งหนี้ได้" />
      <div style={detailGrid}>
        <Field label="ลูกค้า" value={displayText(invoice.customer_name)} />
        <Field label="เลขประจำตัวผู้เสียภาษี" value={displayText(invoice.customer_tax_id)} />
        <Field label="สำนักงานใหญ่/สาขา" value={displayText(invoice.customer_branch)} />
        <Field label="เรื่อง/งาน" value={matter} />
        <Field label="สกุลเงิน" value={invoice.currency} />
        <Field label="แหล่งข้อมูล" value={engagementReference} />
      </div>
      <div style={addressBlock}><span style={fieldLabel}>ที่อยู่ออกเอกสาร</span><strong>{displayText(invoice.customer_billing_address)}</strong>{invoice.customer_phone || invoice.customer_email ? <span>{[invoice.customer_phone, invoice.customer_email].filter(Boolean).join(" · ")}</span> : null}</div>
      {!invoice.customer_tax_id ? <div style={neutralWarning}>ยังไม่มีเลขประจำตัวผู้เสียภาษีของลูกค้า กรุณาตรวจสอบข้อมูลลูกค้าให้ถูกต้อง</div> : null}
    </section>

    <section style={surface}>
      <SectionHeading title="เหตุผลและหลักฐานการเรียกเก็บงวดนี้" description="แสดงเหตุการณ์ที่ผู้ใช้งานยืนยันแล้วว่างวดนี้พร้อมจัดทำใบแจ้งหนี้" />
      <div style={detailGrid}>
        <Field label="งวดเรียกเก็บเงิน" value={installmentLabel} />
        <Field label="เงื่อนไขเรียกเก็บ" value={displayText(installment?.trigger_description, triggerLabels[installment?.trigger_type || ""] || "-")} />
        <Field label="วันที่เงื่อนไขเกิดขึ้นจริง" value={installment?.readiness_event_date || "-"} />
        <Field label="บันทึกยืนยันเมื่อ" value={formatBangkokDateTime(installment?.readiness_confirmed_at)} />
        <Field label="หลักฐาน/เลขอ้างอิง" value={displayText(installment?.readiness_reference)} />
        <Field label="ยอดของงวด" value={money(installment?.total_amount, invoice.currency)} />
      </div>
    </section>

    <section style={surface}>
      <SectionHeading title="รายการค่าบริการ" description="รายการและยอดเงินคัดลอกจากงวดในแผนเรียกเก็บเงินและเป็นแบบอ่านอย่างเดียว" />
      {items.length === 0 ? <div style={neutralWarning}>{isDraft ? "ไม่พบรายการค่าบริการในร่างใบแจ้งหนี้" : "ไม่พบรายการค่าบริการในใบแจ้งหนี้"}</div> : <div style={tableScroll}><table className="invoice-item-table" style={table}><colgroup><col style={{ width: "42%" }} /><col style={{ width: "13%" }} /><col style={{ width: "15%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /></colgroup><thead><tr><th>รายการ</th><th>VAT</th><th>มูลค่าก่อน VAT</th><th>VAT</th><th>ยอดรวม</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.description}</strong>{item.allocation_percent !== null ? <small style={itemMeta}>สัดส่วนจากรายการต้นทาง {Number(item.allocation_percent).toLocaleString("en-US", { maximumFractionDigits: 4 })}%</small> : null}</td><td>{item.vat_applicable ? `${Number(item.vat_rate)}%` : "ไม่มี VAT"}</td><td>{money(item.amount_before_vat, invoice.currency)}</td><td>{money(item.vat_amount, invoice.currency)}</td><td><strong>{money(item.line_total, invoice.currency)}</strong></td></tr>)}</tbody></table></div>}
      <div className="invoice-total-grid" style={totalsGrid}><Metric label="มูลค่าก่อน VAT" value={money(invoice.amount_before_vat, invoice.currency)} /><Metric label="VAT" value={money(invoice.vat_amount, invoice.currency)} /><Metric label="ยอดรวม" value={money(invoice.total_amount, invoice.currency)} prominent /></div>
    </section>

    {isDraft ? <section ref={settingsRef} id="invoice-draft-settings" style={surface} className="invoice-draft-settings">
      <SectionHeading title="ข้อมูลสำหรับออกใบแจ้งหนี้" description="แก้ไขเฉพาะข้อมูลการนำเสนอเอกสาร รายการและยอดเงินต้นทางจะไม่เปลี่ยน" />
      <div style={formGrid}>
        <FormField label="วันที่ออกเอกสาร" required error={formErrors.issueDate}><input ref={issueDateRef} style={inputStyle(Boolean(formErrors.issueDate))} type="date" value={form.issueDate} disabled={saving} onChange={(event) => updateForm("issueDate", event.target.value)} /></FormField>
        <FormField label="วันที่ครบกำหนด" helper="ไม่บังคับ หากเงื่อนไขเรียกเก็บไม่มีวันที่แน่นอน" error={formErrors.dueDate}><input ref={dueDateRef} style={inputStyle(Boolean(formErrors.dueDate))} type="date" value={form.dueDate} disabled={saving} onChange={(event) => updateForm("dueDate", event.target.value)} /></FormField>
        <FormField label="ภาษาเอกสาร"><select style={inputStyle(false)} value={form.languageCode} disabled={saving} onChange={(event) => updateForm("languageCode", event.target.value === "en" ? "en" : "th")}><option value="th">ไทย</option><option value="en">English</option></select></FormField>
      </div>
      <div style={notesGrid}>
        <FormField label="ข้อมูลการชำระเงิน" helper="แสดงในเอกสารสำหรับลูกค้า"><textarea style={textareaStyle} rows={4} value={form.paymentTermsText} disabled={saving} onChange={(event) => updateForm("paymentTermsText", event.target.value)} /></FormField>
        <FormField label="หมายเหตุถึงลูกค้า" helper="แสดงในเอกสารสำหรับลูกค้า"><textarea style={textareaStyle} rows={4} value={form.customerNote} disabled={saving} onChange={(event) => updateForm("customerNote", event.target.value)} /></FormField>
        <FormField label="หมายเหตุภายใน" helper="ใช้ภายในสำนักงานและไม่แสดงใน Preview/Print"><textarea style={textareaStyle} rows={4} value={form.internalNote} disabled={saving} onChange={(event) => updateForm("internalNote", event.target.value)} /></FormField>
      </div>
      <div style={saveRow}><span style={dirty ? unsavedState : savedState}>{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "บันทึกแล้ว"}</span><button type="button" style={{ ...secondaryButton, ...(!dirty ? disabledButton : {}) }} disabled={!dirty || saving} onClick={() => void saveDraft()}>{saving ? "กำลังบันทึก..." : dirty ? "บันทึกการเปลี่ยนแปลง" : "บันทึกแล้ว"}</button></div>
    </section> : <section style={surface}>
      <SectionHeading title="ข้อมูลในใบแจ้งหนี้" description="ข้อมูลนี้ถูกล็อกเมื่อออกใบแจ้งหนี้และแสดงเป็นแบบอ่านอย่างเดียว" />
      <div style={readOnlyGrid}>
        <ReadOnlyValue label="วันที่ออกเอกสาร" value={formatDocumentDate(invoice.issue_date, "th")} />
        <ReadOnlyValue label="วันที่ครบกำหนด" value={invoice.due_date ? formatDocumentDate(invoice.due_date, "th") : "ไม่ระบุ"} />
        <ReadOnlyValue label="ภาษา" value={invoice.language_code === "en" ? "English" : "ไทย"} />
      </div>
      <div style={readOnlyNotesGrid}>
        <ReadOnlyValue label="ข้อมูลการชำระเงิน" value={displayText(invoice.payment_terms_text, "ไม่ระบุ")} multiline />
        <ReadOnlyValue label="หมายเหตุถึงลูกค้า" value={displayText(invoice.customer_note, "ไม่ระบุ")} multiline />
        <div style={internalNoteBlock}><ReadOnlyValue label="หมายเหตุภายใน" value={displayText(invoice.internal_note, "ไม่ระบุ")} multiline /><small style={internalNoteHelper}>ข้อมูลภายในสำนักงาน ไม่แสดงใน Preview หรือ Print</small></div>
      </div>
    </section>}

    <section style={previewBand}>
      <div><span style={eyebrow}>PREVIEW & PRINT</span><h2 style={previewTitle}>ตรวจสอบเอกสารที่ลูกค้าจะได้รับ</h2><p style={sectionDescription}>{isDraft ? "Preview และ Print ใช้รูปแบบ A4 เดียวกัน การเปิดหรือพิมพ์ร่างไม่ออกเลขที่ VP-IV และไม่เปลี่ยนสถานะเอกสาร" : "Preview และ Print ใช้ข้อมูลที่ถูกล็อกไว้เมื่อออกใบแจ้งหนี้ และไม่เปลี่ยนสถานะเอกสาร"}</p></div>
      <div style={previewActions}>{isDraft && dirty ? <><span style={{ ...secondaryButton, ...disabledButton }} aria-disabled="true">ดูตัวอย่าง</span><span style={{ ...primaryDarkButton, ...disabledButton }} aria-disabled="true">พิมพ์</span></> : <><Link style={secondaryButton} href={`/finance/invoices/${invoice.id}/preview`}>ดูตัวอย่าง</Link><Link style={primaryDarkButton} href={`/finance/invoices/${invoice.id}/preview?print=1`} target="_blank">พิมพ์</Link></>}</div>
      {isDraft && dirty ? <div style={{ ...neutralWarning, flexBasis: "100%", marginTop: 0 }}>กรุณาบันทึกการเปลี่ยนแปลงก่อนเปิด Preview หรือ Print เพื่อให้เอกสารตรงกับข้อมูลล่าสุด</div> : null}
    </section>

    {invoice.document_status === "issued" ? <section style={nextStepZone}><span style={nextStepEyebrow}>ขั้นตอนถัดไป</span><h2 style={nextStepTitle}>รอรับชำระเงิน</h2><p style={nextStepDescription}>เมื่อได้รับชำระเงินแล้ว ให้บันทึกการรับชำระเพื่อดำเนินการในขั้นตอนการเงินถัดไป</p><p style={nextStepNote}>ขณะนี้ยังไม่มีการรับชำระหรือออกเอกสารทางการเงินอื่นจากใบแจ้งหนี้ฉบับนี้</p></section> : null}

    {isDraft ? <>
      <section style={finalActionZone}>
        <span style={finalEyebrow}>ขั้นตอนสุดท้าย</span><h2 style={finalTitle}>ตรวจสอบและออกใบแจ้งหนี้</h2><p style={finalDescription}>เมื่อออกใบแจ้งหนี้แล้ว ระบบจะกำหนดเลขที่ VP-IV และล็อกข้อมูลเอกสารฉบับนี้</p>
        <div className="invoice-final-summary" style={finalSummary}><Metric label="ลูกค้า" value={displayText(invoice.customer_name)} /><Metric label="งวด" value={`งวดที่ ${installment?.installment_no || "-"}`} /><Metric label="ยอดรวม" value={money(invoice.total_amount, invoice.currency)} prominent /></div>
        {dirty ? <div style={neutralWarning}>มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก กรุณาบันทึกก่อนออกใบแจ้งหนี้</div> : null}
        <button type="button" style={{ ...issueButton, ...(dirty ? disabledButton : {}) }} disabled={dirty || issuing} onClick={openIssueReview}>ออกใบแจ้งหนี้</button>

        {issuePanelOpen ? <div id="invoice-issue-confirmation" style={confirmationPanel}>
          <h3 style={confirmationTitle}>ยืนยันการออกใบแจ้งหนี้</h3>
          <div style={confirmationGrid}><Field label="ลูกค้า" value={displayText(invoice.customer_name)} /><Field label="งวด" value={installmentLabel} /><Field label="มูลค่าก่อน VAT" value={money(invoice.amount_before_vat, invoice.currency)} /><Field label="VAT" value={money(invoice.vat_amount, invoice.currency)} /><Field label="ยอดรวม" value={money(invoice.total_amount, invoice.currency)} /><Field label="วันที่ออกเอกสาร" value={form.issueDate || "-"} /><Field label="วันที่ครบกำหนด" value={form.dueDate || "-"} /></div>
          <label style={confirmCheck}><input type="checkbox" checked={issueConfirmed} onChange={(event) => setIssueConfirmed(event.target.checked)} />ยืนยันว่าตรวจสอบข้อมูลใบแจ้งหนี้ครบถ้วนแล้ว และต้องการออกใบแจ้งหนี้ฉบับนี้</label>
          <p style={confirmationHelp}>ระบบจะสร้างเลขที่อย่างเป็นทางการและทำให้เอกสารเป็นแบบอ่านอย่างเดียว การออกใบแจ้งหนี้ไม่ถือว่าได้รับชำระเงิน</p>
          <div style={confirmationActions}><button type="button" style={secondaryButton} disabled={issuing} onClick={() => setIssuePanelOpen(false)}>กลับไปตรวจสอบ</button><button type="button" style={{ ...issueButton, ...(!issueConfirmed ? disabledButton : {}) }} disabled={!issueConfirmed || issuing} onClick={() => void issueInvoice()}>{issuing ? "กำลังออกใบแจ้งหนี้..." : "ยืนยันออกใบแจ้งหนี้"}</button></div>
        </div> : null}
      </section>

      <section style={otherActions}><h2 style={otherActionsTitle}>การดำเนินการอื่น</h2><p style={sectionDescription}>การยกเลิกร่างจะไม่ยกเลิกหลักฐานความพร้อมของงวด และไม่สร้างเลขที่ใบแจ้งหนี้</p>{!cancelPanelOpen ? <button type="button" style={dangerOutlineButton} onClick={() => setCancelPanelOpen(true)}>ยกเลิกร่างใบแจ้งหนี้</button> : <div style={cancelPanel}><FormField label="เหตุผลที่ยกเลิกร่าง" required><textarea style={textareaStyle} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></FormField><div style={confirmationActions}><button type="button" style={secondaryButton} disabled={cancelling} onClick={() => { setCancelPanelOpen(false); setCancelReason(""); }}>ไม่ยกเลิก</button><button type="button" style={{ ...dangerButton, ...(!cancelReason.trim() ? disabledButton : {}) }} disabled={!cancelReason.trim() || cancelling} onClick={() => void cancelDraft()}>{cancelling ? "กำลังยกเลิก..." : "ยืนยันยกเลิกร่าง"}</button></div></div>}</section>
    </> : null}

    <style jsx global>{`
      .invoice-item-table th, .invoice-item-table td { padding: 11px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .invoice-item-table th { background: #f8fafc; color: #475569; font-size: 12px; text-align: left; white-space: nowrap; }
      .invoice-item-table th:nth-child(n+3), .invoice-item-table td:nth-child(n+3) { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .invoice-item-table th:nth-child(2), .invoice-item-table td:nth-child(2) { text-align: center; }
      .invoice-item-table tbody tr:last-child td { border-bottom: 0; }
      .invoice-draft-settings { scroll-margin-top: 84px; }
      @media (max-width: 760px) {
        .invoice-workspace { padding: 14px !important; }
        .invoice-navigation-toolbar, .invoice-identity-header, .invoice-total-grid, .invoice-final-summary { grid-template-columns: minmax(0, 1fr) !important; }
        .invoice-navigation-toolbar a { width: 100%; box-sizing: border-box; white-space: normal !important; }
        .invoice-source-nodes { display: grid !important; grid-template-columns: minmax(0, 1fr); }
        .invoice-source-arrow { display: none; }
        .invoice-status-panel { min-width: 0 !important; justify-items: start !important; border-left: 0 !important; border-top: 2px solid #86efac; }
      }
    `}</style>
  </main>;
}

function SectionHeading({ title, description }: { title: string; description: string }) { return <div style={sectionHeading}><h2 style={sectionTitle}>{title}</h2><p style={sectionDescription}>{description}</p></div>; }
function Field({ label, value }: { label: string; value: ReactNode }) { return <div style={{ minWidth: 0 }}><small style={fieldLabel}>{label}</small><div style={fieldValue}>{value}</div></div>; }
function ReadOnlyValue({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) { return <div style={readOnlyValue}><small style={fieldLabel}>{label}</small><div style={{ ...readOnlyText, ...(multiline ? readOnlyMultiline : {}) }}>{value}</div></div>; }
function FormField({ label, helper, required = false, error, children }: { label: string; helper?: string; required?: boolean; error?: string; children: ReactNode }) { return <label style={formField}><span style={formLabel}>{label}{required ? <strong style={requiredMark}> *</strong> : null}</span>{children}{helper ? <small style={formHelper}>{helper}</small> : null}{error ? <small style={formError}>{error}</small> : null}</label>; }
function StatusBadge({ status, label }: { status: string; label: string }) { return <span style={{ ...badge, ...(status === "draft" || status === "ready_to_invoice" ? amberBadge : status === "cancelled" || status === "voided" ? redBadge : greenBadge) }}>{label}</span>; }
function SourceNode({ label, current = false, children }: { label: string; current?: boolean; children: ReactNode }) { return <div style={{ ...sourceNode, ...(current ? currentNode : {}) }}><small style={fieldLabel}>{label}</small><div style={sourceNodeContent}>{children}</div></div>; }
function Arrow() { return <span className="invoice-source-arrow" style={sourceArrow} aria-hidden="true">→</span>; }
function Metric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...metric, ...(prominent ? prominentMetric : {}) }}><small>{label}</small><strong style={metricValue}>{value}</strong></div>; }
function NavigationLink({ href, icon, variant, children }: { href: string; icon: "back" | "document"; variant: "back" | "source"; children: ReactNode }) { return <Link style={{ ...navigationLink, ...(variant === "back" ? navigationBack : navigationSource) }} href={href}><NavigationIcon name={icon} />{children}</Link>; }
function NavigationIcon({ name }: { name: "back" | "document" }) { const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; return name === "back" ? <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg> : <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" /></svg>; }

const page: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24, color: "#172033" };
const surface: CSSProperties = { marginBottom: 18, padding: 20, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" };
const navigationToolbar: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,max-content)", gap: 8, marginBottom: 18, padding: 8, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" };
const navigationLink: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 38, padding: "8px 11px", border: "1px solid", borderRadius: 6, fontSize: 14, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" };
const navigationBack: CSSProperties = { borderColor: "#cbd5e1", background: "#fff", color: "#475569" };
const navigationSource: CSSProperties = { borderColor: "#c7d2fe", background: "#eef2ff", color: "#3730a3" };
const errorNotice: CSSProperties = { marginBottom: 14, padding: 13, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2", color: "#b91c1c" };
const successNotice: CSSProperties = { marginBottom: 14, padding: 13, border: "1px solid #bbf7d0", borderRadius: 6, background: "#f0fdf4", color: "#166534" };
const headerSurface: CSSProperties = { padding: 0, overflow: "hidden" };
const identityHeader: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 24, padding: 22 };
const eyebrow: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 800, letterSpacing: 0 };
const title: CSSProperties = { margin: "4px 0", color: "#172033", fontSize: 28 };
const draftReference: CSSProperties = { margin: 0, color: "#64748b", fontSize: 13 };
const officialNumber: CSSProperties = { display: "grid", gap: 2, marginTop: 8, color: "#475569" };
const officialNumberValue: CSSProperties = { color: "#14532d", fontSize: 20, lineHeight: 1.25, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" };
const issuedStatusPanel: CSSProperties = { borderLeftColor: "#22c55e", background: "#f0fdf4" };
const statusPanel: CSSProperties = { display: "grid", alignContent: "start", justifyItems: "end", gap: 7, minWidth: 210, padding: "8px 12px", borderLeft: "2px solid #fbbf24", background: "#fffbeb" };
const metaLabel: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 700 };
const updatedText: CSSProperties = { color: "#64748b", fontSize: 12 };
const numberNotice: CSSProperties = { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px", padding: "12px 22px", borderTop: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", fontSize: 13 };
const issuedNotice: CSSProperties = { ...numberNotice, borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" };
const cancelledNotice: CSSProperties = { ...numberNotice, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" };
const sourceTrail: CSSProperties = { marginBottom: 18, padding: "14px 0", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" };
const compactHeading: CSSProperties = { margin: "0 0 10px", color: "#475569", fontSize: 14 };
const sourceNodes: CSSProperties = { display: "flex", alignItems: "stretch", gap: 7, flexWrap: "wrap" };
const sourceNode: CSSProperties = { flex: "1 1 150px", minWidth: 0, padding: 10, border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", fontSize: 13 };
const currentNode: CSSProperties = { borderColor: "#2563eb", background: "#eff6ff" };
const sourceNodeContent: CSSProperties = { display: "grid", gap: 6, marginTop: 5, overflowWrap: "anywhere" };
const sourceArrow: CSSProperties = { alignSelf: "center", color: "#64748b", fontSize: 18 };
const sectionHeading: CSSProperties = { marginBottom: 16 };
const sectionTitle: CSSProperties = { margin: 0, color: "#172033", fontSize: 18 };
const sectionDescription: CSSProperties = { margin: "5px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.55 };
const detailGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 16 };
const fieldLabel: CSSProperties = { color: "#64748b", fontSize: 12 };
const fieldValue: CSSProperties = { marginTop: 3, color: "#172033", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
const addressBlock: CSSProperties = { display: "grid", gap: 4, marginTop: 16, padding: 13, borderLeft: "3px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontSize: 13 };
const neutralWarning: CSSProperties = { marginTop: 14, padding: 11, borderLeft: "3px solid #f59e0b", background: "#fffbeb", color: "#92400e", fontSize: 13 };
const tableScroll: CSSProperties = { overflowX: "auto" };
const table: CSSProperties = { width: "100%", minWidth: 720, border: "1px solid #e2e8f0", borderSpacing: 0, tableLayout: "fixed" };
const itemMeta: CSSProperties = { display: "block", marginTop: 4, color: "#64748b" };
const totalsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginTop: 14, marginLeft: "auto", maxWidth: 720, border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" };
const metric: CSSProperties = { display: "grid", gap: 5, minWidth: 0, padding: 13, borderLeft: "1px solid #e2e8f0", color: "#64748b" };
const prominentMetric: CSSProperties = { background: "#f0fdf4", color: "#166534" };
const metricValue: CSSProperties = { color: "#172033", fontSize: 17, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 };
const notesGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14, marginTop: 16 };
const readOnlyGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 1, border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden", background: "#f8fafc" };
const readOnlyNotesGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14, marginTop: 16 };
const readOnlyValue: CSSProperties = { minWidth: 0, padding: 13, borderLeft: "1px solid #e2e8f0" };
const readOnlyText: CSSProperties = { marginTop: 4, color: "#172033", fontWeight: 700, lineHeight: 1.55, overflowWrap: "anywhere" };
const readOnlyMultiline: CSSProperties = { minHeight: 54, whiteSpace: "pre-wrap", fontWeight: 500 };
const internalNoteBlock: CSSProperties = { border: "1px solid #dbeafe", borderRadius: 6, background: "#f8fbff" };
const internalNoteHelper: CSSProperties = { display: "block", padding: "0 13px 12px", color: "#475569", fontSize: 11 };
const formField: CSSProperties = { display: "grid", alignContent: "start", gap: 6, minWidth: 0 };
const formLabel: CSSProperties = { color: "#334155", fontSize: 13, fontWeight: 700 };
const requiredMark: CSSProperties = { color: "#b91c1c" };
const formHelper: CSSProperties = { color: "#64748b", fontSize: 11, lineHeight: 1.4 };
const formError: CSSProperties = { color: "#b91c1c", fontSize: 12 };
const inputStyle = (invalid: boolean): CSSProperties => ({ width: "100%", minHeight: 40, boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${invalid ? "#dc2626" : "#cbd5e1"}`, borderRadius: 6, background: "#fff", color: "#172033", font: "inherit" });
const textareaStyle: CSSProperties = { ...inputStyle(false), minHeight: 100, resize: "vertical" };
const saveRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 18, paddingTop: 16, borderTop: "1px solid #e2e8f0" };
const savedState: CSSProperties = { color: "#166534", fontSize: 13, fontWeight: 700 };
const unsavedState: CSSProperties = { color: "#92400e", fontSize: 13, fontWeight: 700 };
const secondaryButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 40, boxSizing: "border-box", padding: "9px 13px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#334155", font: "inherit", fontWeight: 700, textDecoration: "none", cursor: "pointer" };
const primaryDarkButton: CSSProperties = { ...secondaryButton, borderColor: "#172033", background: "#172033", color: "#fff" };
const disabledButton: CSSProperties = { opacity: 0.55, cursor: "not-allowed" };
const previewBand: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 18, marginBottom: 18, padding: "18px 20px", borderTop: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1", background: "#f8fafc" };
const previewTitle: CSSProperties = { margin: "4px 0 0", color: "#172033", fontSize: 19 };
const previewActions: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const nextStepZone: CSSProperties = { marginBottom: 18, padding: "20px 22px", border: "1px solid #bfdbfe", borderRadius: 8, background: "#f8fbff" };
const nextStepEyebrow: CSSProperties = { color: "#1d4ed8", fontSize: 11, fontWeight: 900 };
const nextStepTitle: CSSProperties = { margin: "5px 0", color: "#1e3a8a", fontSize: 21 };
const nextStepDescription: CSSProperties = { margin: 0, color: "#334155", lineHeight: 1.6 };
const nextStepNote: CSSProperties = { margin: "8px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const finalActionZone: CSSProperties = { marginBottom: 18, padding: 22, border: "1px solid #86efac", borderRadius: 8, background: "#f7fff9" };
const finalEyebrow: CSSProperties = { color: "#15803d", fontSize: 11, fontWeight: 900 };
const finalTitle: CSSProperties = { margin: "5px 0", color: "#14532d", fontSize: 22 };
const finalDescription: CSSProperties = { margin: "0 0 16px", color: "#3f6212", lineHeight: 1.55 };
const finalSummary: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginBottom: 16, border: "1px solid #bbf7d0", borderRadius: 6, overflow: "hidden", background: "#fff" };
const issueButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "10px 18px", border: "1px solid #166534", borderRadius: 6, background: "#166534", color: "#fff", font: "inherit", fontWeight: 800, cursor: "pointer" };
const confirmationPanel: CSSProperties = { marginTop: 18, padding: 18, border: "1px solid #86efac", borderRadius: 6, background: "#fff", scrollMarginTop: 84 };
const confirmationTitle: CSSProperties = { margin: "0 0 14px", color: "#14532d", fontSize: 17 };
const confirmationGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 13 };
const confirmCheck: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 9, marginTop: 16, padding: 12, border: "1px solid #cbd5e1", borderRadius: 6, color: "#334155", fontWeight: 700, lineHeight: 1.5 };
const confirmationHelp: CSSProperties = { margin: "10px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const confirmationActions: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 14 };
const otherActions: CSSProperties = { marginBottom: 18, padding: "18px 20px", border: "1px solid #fecaca", borderRadius: 8, background: "#fff" };
const otherActionsTitle: CSSProperties = { margin: 0, color: "#7f1d1d", fontSize: 16 };
const dangerOutlineButton: CSSProperties = { ...secondaryButton, marginTop: 12, borderColor: "#fca5a5", color: "#b91c1c" };
const dangerButton: CSSProperties = { ...issueButton, borderColor: "#b91c1c", background: "#b91c1c" };
const cancelPanel: CSSProperties = { marginTop: 14, padding: 14, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2" };
const badge: CSSProperties = { display: "inline-block", width: "fit-content", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
const amberBadge: CSSProperties = { background: "#fef3c7", color: "#92400e" };
const greenBadge: CSSProperties = { background: "#dcfce7", color: "#166534" };
const redBadge: CSSProperties = { background: "#fee2e2", color: "#b91c1c" };
