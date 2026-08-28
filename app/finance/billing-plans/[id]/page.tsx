"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";
import { feeAgreementStatusLabel } from "../../fee-agreements/lifecycle";

type Json = Record<string, unknown>;
type BillingPlan = { id: string; fee_agreement_id: string; status: string; billing_method: string; currency: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; title: string | null; description: string | null; installment_count: number; recurring_config_json: Json | null; created_at: string; updated_at: string };
type FeeAgreement = { id: string; agreement_no: string | null; title: string; client_id: string; case_id: number | null; advisory_matter_id: string | null; source_quotation_id: string | null; source_reference: string | null; status: string; engagement_basis: "formal_agreement" | "accepted_quotation" | null; client_snapshot_json: Json | null; matter_snapshot_json: Json | null; source_document_snapshot_json: Json | null };
type Installment = { id: string; installment_no: number; sort_order: number; title: string; trigger_description: string | null; trigger_type: string; due_date: string | null; milestone_code: string | null; recurring_period_start: string | null; recurring_period_end: string | null; status: string; ready_to_invoice_at: string | null; readiness_event_date: string | null; readiness_confirmed_at: string | null; readiness_note: string | null; readiness_reference: string | null; invoiced_at: string | null; cancelled_at: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; created_at: string };
type Allocation = { id: string; billing_installment_id: string; fee_agreement_item_id: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; allocation_percent: number | string | null; sort_order: number; allocation_snapshot_json: Json | null; created_at: string };
type AgreementItem = { id: string; description: string };
type InvoiceSummary = { id: string; primary_billing_installment_id: string; document_status: string; invoice_no: string | null; issued_at: string | null; voided_at: string | null; cancelled_at: string | null; created_at: string };
type DraftInstallment = { id: string; installment_no: number; sort_order: number; title: string; trigger_description: string; trigger_type: string; due_date: string; milestone_code: string; recurring_period_start: string; recurring_period_end: string };
type DraftForm = { title: string; description: string; installments: DraftInstallment[] };
type ReadinessForm = { eventDate: string; confirmed: boolean; note: string; reference: string };
type ReadinessErrors = Partial<Record<"eventDate" | "confirmed", string>>;
type InvoiceDraftDiagnostic = {
  operation: "create_finance_invoice_draft_from_installment";
  timestamp: string;
  billing_plan_id: string;
  billing_installment_id: string;
  error_code: string | null;
  error_message: string;
  error_details: string | null;
  error_hint: string | null;
};
type AllocationColumnKey = "description" | "amount_before_tax" | "vat_amount" | "total_amount" | "allocation_percent";

const numberValue = (value: number | string | null | undefined) => Number(value || 0);
const money = (value: number | string | null | undefined, currency = "THB") => `${numberValue(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const date = (value: string | null | undefined) => value ? value.slice(0, 10) : "-";
const dateTime = (value: string | null | undefined) => value ? value.replace("T", " ").slice(0, 16) : "-";
const text = (value: unknown, fallback = "-") => typeof value === "string" && value.trim() ? value : fallback;
const planStatus: Record<string, string> = { draft: "ร่างแผนเรียกเก็บเงิน", active: "พร้อมดำเนินการเรียกเก็บเงิน", completed: "ดำเนินการครบแล้ว", cancelled: "ยกเลิก" };
const installmentStatus: Record<string, string> = { pending: "รอดำเนินการ", ready_to_invoice: "พร้อมออกใบแจ้งหนี้", invoiced: "ออกใบแจ้งหนี้แล้ว", cancelled: "ยกเลิก" };
const billingMethod: Record<string, string> = { single: "งวดเดียว", installments: "หลายงวด", milestone: "ตามเหตุการณ์สำคัญ", recurring: "เรียกเก็บเป็นรอบ", manual: "กำหนดเอง" };
const triggerType: Record<string, string> = { agreement_effective: "เมื่อข้อตกลงมีผล", date: "ตามวันที่", case_milestone: "ตามเหตุการณ์สำคัญ", manual: "กำหนดด้วยตนเอง", recurring_period: "ตามรอบระยะเวลา" };
const invoiceStatus: Record<string, string> = { draft: "ร่างใบแจ้งหนี้", issued: "ออกใบแจ้งหนี้แล้ว", cancelled: "ยกเลิกร่างแล้ว", voided: "ยกเลิกแล้ว" };
const allocationColumns: Array<{ key: AllocationColumnKey; label: string; width: string; numeric?: boolean }> = [
  { key: "description", label: "รายการตามข้อตกลง", width: "40%" },
  { key: "amount_before_tax", label: "ก่อน VAT", width: "17%", numeric: true },
  { key: "vat_amount", label: "VAT", width: "13%", numeric: true },
  { key: "total_amount", label: "ยอดรวม", width: "17%", numeric: true },
  { key: "allocation_percent", label: "สัดส่วนในงวด", width: "13%", numeric: true },
];

export default function BillingPlanDetailPage() {
  return <QuotationGuard>{(access) => <BillingPlanDetail canManage={access.permissions.canEditFinanceQuotation} />}</QuotationGuard>;
}

function BillingPlanDetail({ canManage }: { canManage: boolean }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [agreement, setAgreement] = useState<FeeAgreement | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [draft, setDraft] = useState<DraftForm>({ title: "", description: "", installments: [] });
  const [savedBaseline, setSavedBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [installmentActionId, setInstallmentActionId] = useState<string | null>(null);
  const [readinessInstallmentId, setReadinessInstallmentId] = useState<string | null>(null);
  const [readinessForm, setReadinessForm] = useState<ReadinessForm>({ eventDate: "", confirmed: false, note: "", reference: "" });
  const [readinessErrors, setReadinessErrors] = useState<ReadinessErrors>({});
  const [readinessSummaryError, setReadinessSummaryError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invoiceDiagnostic, setInvoiceDiagnostic] = useState<InvoiceDraftDiagnostic | null>(null);
  const [diagnosticCopyStatus, setDiagnosticCopyStatus] = useState("");
  const saveLock = useRef(false);
  const statusLock = useRef(false);
  const installmentActionLock = useRef(false);
  const readinessPanelRef = useRef<HTMLDivElement>(null);
  const readinessDateRef = useRef<HTMLInputElement>(null);
  const readinessConfirmationRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    const planResult = await supabase
      .from("finance_billing_plans")
      .select("id,fee_agreement_id,status,billing_method,currency,amount_before_tax,vat_amount,total_amount,title,description,installment_count,recurring_config_json,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();

    if (planResult.error) {
      setError("ไม่สามารถโหลดแผนเรียกเก็บเงินได้");
      setLoading(false);
      return;
    }
    if (!planResult.data) {
      setError("ไม่พบแผนเรียกเก็บเงิน");
      setLoading(false);
      return;
    }

    const planRow = planResult.data as BillingPlan;
    setPlan(planRow);
    const [agreementResult, installmentsResult] = await Promise.all([
      supabase
        .from("finance_fee_agreements")
        .select("id,agreement_no,title,client_id,case_id,advisory_matter_id,source_quotation_id,source_reference,status,engagement_basis,client_snapshot_json,matter_snapshot_json,source_document_snapshot_json")
        .eq("id", planRow.fee_agreement_id)
        .maybeSingle(),
      supabase
        .from("finance_billing_installments")
        .select("id,installment_no,sort_order,title,trigger_description,trigger_type,due_date,milestone_code,recurring_period_start,recurring_period_end,status,ready_to_invoice_at,readiness_event_date,readiness_confirmed_at,readiness_note,readiness_reference,invoiced_at,cancelled_at,amount_before_tax,vat_amount,total_amount,created_at")
        .eq("billing_plan_id", id)
        .order("installment_no")
        .order("sort_order")
        .order("created_at")
        .order("id"),
    ]);

    const installmentRows = (installmentsResult.data || []) as Installment[];
    const installmentIds = installmentRows.map((installment) => installment.id);
    const invoicesResult = installmentIds.length
      ? await supabase
        .from("finance_invoices")
        .select("id,primary_billing_installment_id,document_status,invoice_no,issued_at,voided_at,cancelled_at,created_at")
        .in("primary_billing_installment_id", installmentIds)
        .order("created_at")
      : { data: [], error: null };
    const allocationsResult = installmentIds.length
      ? await supabase
        .from("finance_billing_installment_items")
        .select("id,billing_installment_id,fee_agreement_item_id,amount_before_tax,vat_amount,total_amount,allocation_percent,sort_order,allocation_snapshot_json,created_at")
        .in("billing_installment_id", installmentIds)
        .order("sort_order")
        .order("created_at")
        .order("id")
      : { data: [], error: null };

    const allocationRows = (allocationsResult.data || []) as Allocation[];
    const agreementItemIds = [...new Set(allocationRows.map((allocation) => allocation.fee_agreement_item_id))];
    const agreementItemsResult = agreementItemIds.length
      ? await supabase
        .from("finance_fee_agreement_items")
        .select("id,description")
        .eq("fee_agreement_id", planRow.fee_agreement_id)
        .in("id", agreementItemIds)
      : { data: [], error: null };

    if (agreementResult.error || installmentsResult.error || allocationsResult.error || agreementItemsResult.error || invoicesResult.error) {
      setError("โหลดรายละเอียดแผนเรียกเก็บเงินบางส่วนไม่สำเร็จ กรุณารีเฟรช");
    }
    setAgreement((agreementResult.data || null) as FeeAgreement | null);
    setInstallments(installmentRows);
    setAllocations(allocationRows);
    setAgreementItems((agreementItemsResult.data || []) as AgreementItem[]);
    setInvoices((invoicesResult.data || []) as InvoiceSummary[]);
    const nextDraft = billingPlanDraft(planRow, installmentRows);
    setDraft(nextDraft);
    setSavedBaseline(JSON.stringify(nextDraft));
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!readinessInstallmentId) return;
    requestAnimationFrame(() => readinessPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [readinessInstallmentId]);

  const dirty = Boolean(plan?.status === "draft" && savedBaseline && JSON.stringify(draft) !== savedBaseline);
  const updateDraftInstallment = (installmentId: string, patch: Partial<DraftInstallment>) => setDraft((current) => ({ ...current, installments: current.installments.map((installment) => installment.id === installmentId ? { ...installment, ...patch } : installment) }));
  const saveDraft = async () => {
    if (!plan || plan.status !== "draft" || !canManage || saveLock.current || !dirty) return;
    const invalid = validateBillingPlanDraft(draft);
    if (invalid) { setError(invalid); return; }
    saveLock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("save_finance_billing_plan_draft", {
        p_billing_plan_id: plan.id,
        p_fee_agreement_id: plan.fee_agreement_id,
        p_title: draft.title,
        p_description: draft.description,
        p_billing_method: plan.billing_method,
        p_recurring_config_json: plan.recurring_config_json,
        p_installments: draft.installments.map((installment) => ({
          installment_no: installment.installment_no,
          sort_order: installment.sort_order,
          title: installment.title,
          trigger_description: installment.trigger_description || null,
          trigger_type: installment.trigger_type,
          due_date: installment.due_date || null,
          milestone_code: installment.milestone_code || null,
          recurring_period_start: installment.recurring_period_start || null,
          recurring_period_end: installment.recurring_period_end || null,
          items: allocations.filter((allocation) => allocation.billing_installment_id === installment.id).map((allocation) => ({
            fee_agreement_item_id: allocation.fee_agreement_item_id,
            amount_before_tax: numberValue(allocation.amount_before_tax),
            vat_amount: numberValue(allocation.vat_amount),
            total_amount: numberValue(allocation.total_amount),
            allocation_percent: allocation.allocation_percent === null ? null : numberValue(allocation.allocation_percent),
            sort_order: allocation.sort_order,
            allocation_snapshot_json: allocation.allocation_snapshot_json,
          })),
        })),
      });
      if (result.error) throw result.error;
      await load();
      setMessage("บันทึกแผนเรียกเก็บเงินแล้ว");
    } catch (saveError) {
      console.error("Failed to save Billing Plan draft", saveError);
      setError(billingPlanErrorMessage(saveError));
    } finally {
      saveLock.current = false; setSaving(false);
    }
  };
  const changePlanStatus = async (nextStatus: "active" | "cancelled") => {
    if (!plan || !canManage || statusLock.current) return;
    if (dirty) { setError("กรุณาบันทึกการเปลี่ยนแปลงก่อนเปลี่ยนสถานะแผน"); return; }
    const confirmation = nextStatus === "active"
      ? "ยืนยันให้แผนเรียกเก็บเงินนี้พร้อมดำเนินการใช่หรือไม่ ระบบจะล็อกโครงสร้างงวดและยอดจัดสรรตามข้อตกลง"
      : "ยืนยันยกเลิกแผนเรียกเก็บเงินนี้ใช่หรือไม่";
    if (!window.confirm(confirmation)) return;
    statusLock.current = true; setStatusSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("set_finance_billing_plan_status", { p_billing_plan_id: plan.id, p_next_status: nextStatus });
      if (result.error) throw result.error;
      await load();
      setMessage(nextStatus === "active" ? "แผนเรียกเก็บเงินพร้อมดำเนินการแล้ว" : "ยกเลิกแผนเรียกเก็บเงินแล้ว");
    } catch (statusError) {
      console.error("Failed to update Billing Plan status", statusError);
      setError(billingPlanErrorMessage(statusError));
    } finally {
      statusLock.current = false; setStatusSaving(false);
    }
  };
  const openReadinessPanel = (installment: Installment) => {
    if (!canManage || plan?.status !== "active" || installment.status !== "pending") return;
    setError(""); setMessage(""); setReadinessErrors({}); setReadinessSummaryError("");
    setReadinessForm({ eventDate: bangkokToday(), confirmed: false, note: "", reference: "" });
    setReadinessInstallmentId(installment.id);
  };
  const closeReadinessPanel = () => {
    if (installmentActionId) return;
    setReadinessInstallmentId(null); setReadinessErrors({}); setReadinessSummaryError("");
  };
  const confirmInstallmentReadiness = async (installment: Installment) => {
    if (!canManage || plan?.status !== "active" || installment.status !== "pending" || installmentActionLock.current) return;
    const nextErrors: ReadinessErrors = {};
    if (!readinessForm.eventDate) nextErrors.eventDate = "กรุณาระบุวันที่ที่เงื่อนไขการเรียกเก็บเงินเกิดขึ้นจริง";
    else if (readinessForm.eventDate > bangkokToday()) nextErrors.eventDate = "วันที่ยืนยันความพร้อมต้องไม่เป็นวันที่ในอนาคต";
    if (!readinessForm.confirmed) nextErrors.confirmed = "กรุณายืนยันว่าเงื่อนไขการเรียกเก็บเงินของงวดนี้เกิดขึ้นแล้ว";
    if (Object.keys(nextErrors).length) {
      setReadinessErrors(nextErrors);
      setReadinessSummaryError("กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนยืนยันความพร้อมออกใบแจ้งหนี้");
      requestAnimationFrame(() => (nextErrors.eventDate ? readinessDateRef.current : readinessConfirmationRef.current)?.focus());
      return;
    }
    installmentActionLock.current = true; setInstallmentActionId(installment.id); setError(""); setMessage(""); setReadinessSummaryError("");
    try {
      const result = await supabase.rpc("confirm_finance_billing_installment_ready", {
        p_installment_id: installment.id,
        p_readiness_event_date: readinessForm.eventDate,
        p_human_confirmed: readinessForm.confirmed,
        p_note: readinessForm.note.trim() || null,
        p_reference: readinessForm.reference.trim() || null,
      });
      if (result.error) throw result.error;
      setReadinessInstallmentId(null); setReadinessErrors({});
      await load();
      setMessage(`งวดที่ ${installment.installment_no} พร้อมสำหรับจัดทำใบแจ้งหนี้แล้ว`);
    } catch (readinessError) {
      console.error("Failed to confirm Billing Installment readiness", readinessError);
      setReadinessSummaryError(billingReadinessErrorMessage(readinessError));
    } finally {
      installmentActionLock.current = false; setInstallmentActionId(null);
    }
  };
  const createOrOpenInvoiceDraft = async (installment: Installment, existingInvoice?: InvoiceSummary) => {
    if (existingInvoice) { router.push(`/finance/invoices/${existingInvoice.id}`); return; }
    if (!canManage || plan?.status !== "active" || installment.status !== "ready_to_invoice" || installmentActionLock.current) return;
    const billingPlanId = plan.id;
    installmentActionLock.current = true; setInstallmentActionId(installment.id); setError(""); setMessage(""); setInvoiceDiagnostic(null); setDiagnosticCopyStatus("");
    try {
      const result = await supabase.rpc("create_finance_invoice_draft_from_installment", { p_billing_installment_id: installment.id });
      if (result.error) throw result.error;
      const invoiceId = typeof result.data === "string" ? result.data : "";
      if (!invoiceId) throw new Error("Invoice Draft id was not returned");
      router.push(`/finance/invoices/${invoiceId}`);
    } catch (invoiceError) {
      console.error("Failed to create or open Invoice Draft", invoiceError);
      const presentation = invoiceDraftErrorPresentation(invoiceError);
      setError(presentation.message);
      if (!presentation.knownBusinessError) {
        setInvoiceDiagnostic(buildInvoiceDraftDiagnostic(invoiceError, billingPlanId, installment.id));
      }
    } finally {
      installmentActionLock.current = false; setInstallmentActionId(null);
    }
  };
  const copyInvoiceDiagnostic = async () => {
    if (!invoiceDiagnostic) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(invoiceDiagnostic, null, 2));
      setDiagnosticCopyStatus("คัดลอกข้อมูลตรวจสอบแล้ว");
    } catch (copyError) {
      console.error("Failed to copy Invoice Draft diagnostic", copyError);
      setDiagnosticCopyStatus("คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  const totalsMismatch = useMemo(() => {
    if (!plan) return false;
    const installmentBeforeTax = installments.reduce((sum, installment) => sum + numberValue(installment.amount_before_tax), 0);
    const installmentVat = installments.reduce((sum, installment) => sum + numberValue(installment.vat_amount), 0);
    const installmentTotal = installments.reduce((sum, installment) => sum + numberValue(installment.total_amount), 0);
    const differs = (left: number, right: number) => Math.abs(left - right) > 0.005;

    return differs(numberValue(plan.amount_before_tax), installmentBeforeTax)
      || differs(numberValue(plan.vat_amount), installmentVat)
      || differs(numberValue(plan.total_amount), installmentTotal);
  }, [installments, plan]);

  const duplicateInstallmentNo = useMemo(() => new Set(installments.map((installment) => installment.installment_no)).size !== installments.length, [installments]);
  if (loading) return <main style={page}>กำลังโหลดแผนเรียกเก็บเงิน...</main>;
  if (!plan) return <main style={page}>{error || "ไม่พบแผนเรียกเก็บเงิน"}</main>;

  const client = text(agreement?.client_snapshot_json?.name, text(agreement?.client_snapshot_json?.display_name, "-"));
  const matter = text(agreement?.matter_snapshot_json?.title, text(agreement?.matter_snapshot_json?.file_no, agreement?.case_id || agreement?.advisory_matter_id ? "-" : "ข้อตกลงระดับลูกค้า"));
  const quotationNo = text(agreement?.source_document_snapshot_json?.quotation_no, text(agreement?.source_reference, "ใบเสนอราคาต้นทาง"));
  const acceptedQuotationBasis = agreement?.engagement_basis === "accepted_quotation";
  const engagementKindLabel = acceptedQuotationBasis ? "การว่าจ้างตามใบเสนอราคา" : "ข้อตกลงค่าบริการ";
  const engagementReference = agreement ? acceptedQuotationBasis ? quotationNo : text(agreement.agreement_no, agreement.title) : "-";
  const allocationByInstallment = new Map<string, Allocation[]>();
  allocations.forEach((allocation) => allocationByInstallment.set(allocation.billing_installment_id, [...(allocationByInstallment.get(allocation.billing_installment_id) || []), allocation]));
  const agreementItemById = new Map(agreementItems.map((item) => [item.id, item.description]));

  return <main className="billing-plan-page" style={page}>
    {agreement ? <nav className="billing-plan-navigation-toolbar" style={navigationToolbar} aria-label="การนำทางเอกสารที่เกี่ยวข้อง">
      <Link className="billing-plan-navigation-link billing-plan-navigation-back" style={{ ...navigationLink, ...navigationBackLink }} href={`/finance/fee-agreements/${agreement.id}`}><NavigationIcon name="back" /><span>{acceptedQuotationBasis ? "กลับไปการว่าจ้างตามใบเสนอราคา" : "กลับไปข้อตกลงค่าบริการ"}</span></Link>
      {agreement?.source_quotation_id ? <Link className="billing-plan-navigation-link billing-plan-navigation-source" style={{ ...navigationLink, ...navigationSourceLink }} href={`/finance/quotations/${agreement.source_quotation_id}`}><NavigationIcon name="source" /><span>เปิดใบเสนอราคาต้นทาง</span></Link> : null}
    </nav> : null}
    {error ? <div style={warning}>{error}</div> : null}
    {invoiceDiagnostic ? <details style={diagnosticPanel}>
      <summary style={diagnosticSummary}>ข้อมูลสำหรับตรวจสอบระบบ</summary>
      <div style={diagnosticGrid}>
        <DiagnosticField label="Error code" value={invoiceDiagnostic.error_code || "-"} />
        <DiagnosticField label="Diagnostic message" value={invoiceDiagnostic.error_message || "-"} />
        <DiagnosticField label="Details" value={invoiceDiagnostic.error_details || "-"} />
        <DiagnosticField label="Hint" value={invoiceDiagnostic.error_hint || "-"} />
        <DiagnosticField label="billing_installment_id" value={invoiceDiagnostic.billing_installment_id} />
      </div>
      <div style={diagnosticActions}>
        <button type="button" style={diagnosticCopyButton} onClick={() => void copyInvoiceDiagnostic()}>คัดลอกข้อมูลตรวจสอบ</button>
        {diagnosticCopyStatus ? <span role="status" style={diagnosticCopyStatusStyle}>{diagnosticCopyStatus}</span> : null}
      </div>
    </details> : null}
    {message ? <div style={success}>{message}</div> : null}

    <section style={{ ...card, ...planHeaderCard }}>
      <div className="billing-plan-identity-header" style={planIdentityHeader}>
        <div style={planIdentityCopy}><span style={planEyebrow}>BILLING PLAN</span><h1 style={planTitle}>{text(plan.status === "draft" ? draft.title : plan.title, "แผนเรียกเก็บเงิน")}</h1><p style={planReference}>{agreement ? `อ้างอิง${engagementKindLabel} ${engagementReference}` : "ไม่พบรายการการว่าจ้างอ้างอิง"}</p>{plan.status !== "draft" && plan.description ? <p style={description}>{plan.description}</p> : null}</div>
        <div className="billing-plan-status-panel" style={planStatusPanel}><span style={metaLabel}>สถานะแผน</span><StatusBadge status={plan.status} label={planStatus[plan.status] || plan.status} prominent /><span style={planUpdated}>แก้ไขล่าสุด {date(plan.updated_at)}</span></div>
      </div>
      {plan.status === "draft" && canManage ? <div className="billing-plan-header-edit-grid" style={headerEditGrid}>
        <label style={label}>ชื่อแผน<input style={input} value={draft.title} disabled={saving || statusSaving} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label style={label}>หมายเหตุแผน<textarea style={{ ...input, minHeight: 72, resize: "vertical" }} value={draft.description} disabled={saving || statusSaving} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      </div> : null}
      <div className="billing-plan-metadata-grid" style={planMetadataGrid}>
        <Field label="วิธีเรียกเก็บเงิน" value={billingMethod[plan.billing_method] || plan.billing_method} />
        <Field label="สกุลเงิน" value={plan.currency} />
        <Field label="จำนวนงวด" value={plan.installment_count} />
        <Field label="สร้างเมื่อ" value={date(plan.created_at)} />
        <Field label="แก้ไขล่าสุด" value={date(plan.updated_at)} />
      </div>
    </section>

    {canManage && plan.status === "draft" ? <section aria-live="polite" style={{ ...saveStateNotice, ...(dirty ? dirtyStateNotice : savedStateNotice) }}>
      <strong>{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "ข้อมูลล่าสุดถูกบันทึกแล้ว"}</strong>
      <span>{dirty ? "ตรวจสอบข้อมูลให้ครบ แล้วบันทึกที่ส่วนตรวจสอบท้ายแผน" : "ตรวจสอบงวดและยอดจัดสรรทั้งหมดก่อนยืนยันแผนพร้อมดำเนินการ"}</span>
    </section> : null}
    {canManage && plan.status === "active" ? <section style={{ ...card, ...activeNotice }}><div><strong>แผนพร้อมดำเนินการเรียกเก็บเงิน</strong><p style={actionHelp}>งวดต่าง ๆ ยังไม่ถือว่าออกใบแจ้งหนี้จนกว่าจะดำเนินการในขั้นตอน Invoice</p></div><button className="billing-plan-cancel-button" type="button" style={cancelButton} disabled={statusSaving} onClick={() => void changePlanStatus("cancelled")}>{statusSaving ? "กำลังดำเนินการ..." : "ยกเลิกแผน"}</button></section> : null}

    <section style={sourceChain}>
      <h2 style={sourceChainTitle}>เส้นทางเอกสารต้นทาง</h2>
      <div className="billing-plan-source-chain-nodes" style={chainNodes}>
        {agreement?.source_quotation_id ? <><ChainNode title="ใบเสนอราคา" status={text(agreement.source_document_snapshot_json?.status, "")}><Link href={`/finance/quotations/${agreement.source_quotation_id}`}>{quotationNo}</Link></ChainNode><span className="billing-plan-chain-arrow" style={chainArrow} aria-hidden="true">→</span></> : null}
        <ChainNode title={engagementKindLabel} status={agreement?.status || null} statusText={agreement ? feeAgreementStatusLabel(agreement.status) : undefined}>{agreement ? <Link href={`/finance/fee-agreements/${agreement.id}`}>{engagementReference}</Link> : <span style={unavailable}>ไม่พบรายการการว่าจ้างที่เชื่อมไว้</span>}</ChainNode>
        <span className="billing-plan-chain-arrow" style={chainArrow} aria-hidden="true">→</span>
        <ChainNode title="แผนเรียกเก็บเงิน" status={plan.status} current>{text(plan.title, billingMethod[plan.billing_method] || plan.billing_method)}</ChainNode>
      </div>
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>{engagementKindLabel}อ้างอิง</h2>
      {!agreement ? <div style={warning}>ไม่พบรายการการว่าจ้างที่เชื่อมกับแผนนี้</div> : <div style={grid}>
        <Field label={engagementKindLabel} value={<Link href={`/finance/fee-agreements/${agreement.id}`}>{engagementReference}</Link>} />
        <Field label="สถานะ" value={<StatusBadge status={agreement.status} label={feeAgreementStatusLabel(agreement.status)} />} />
        <Field label="ลูกค้า" value={client} />
        <Field label="เรื่อง/คดี" value={agreement.case_id ? <Link href={`/cases/${agreement.case_id}`}>{matter}</Link> : agreement.advisory_matter_id ? <Link href={`/advisory/${agreement.advisory_matter_id}`}>{matter}</Link> : matter} />
      </div>}
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>ยอดรวมตามแผน</h2>
      {totalsMismatch ? <div style={warning}>ยอดรวมของงวดไม่ตรงกับยอดรวมแผน กรุณาตรวจสอบก่อนดำเนินการ</div> : null}
      <div className="billing-plan-totals-grid" style={totalsGrid}>
        <SummaryMetric label="มูลค่าก่อน VAT" value={money(plan.amount_before_tax, plan.currency)} />
        <SummaryMetric label="VAT" value={money(plan.vat_amount, plan.currency)} />
        <SummaryMetric label="ยอดรวม" value={money(plan.total_amount, plan.currency)} prominent />
        <SummaryMetric label="จำนวนงวด" value={String(plan.installment_count)} />
        <SummaryMetric label="วิธีเรียกเก็บเงิน" value={billingMethod[plan.billing_method] || plan.billing_method} />
      </div>
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>งวดเรียกเก็บเงิน</h2>
      {installments.length === 0 ? <div style={warning}>แผนเรียกเก็บเงินยังไม่มีงวด</div> : null}
      {installments.length !== plan.installment_count ? <div style={warning}>จำนวนงวดที่บันทึกไว้ไม่ตรงกับรายการงวดที่โหลดได้</div> : null}
      {duplicateInstallmentNo ? <div style={warning}>พบเลขงวดซ้ำ กรุณาตรวจสอบก่อนดำเนินการ</div> : null}
      {installments.map((installment) => {
        const installmentAllocations = allocationByInstallment.get(installment.id) || [];
        const draftInstallment = draft.installments.find((row) => row.id === installment.id);
        const customInstallmentTitle = billingInstallmentDisplayTitle(installment.title, installment.installment_no);
        const installmentInvoices = invoices.filter((invoice) => invoice.primary_billing_installment_id === installment.id);
        const activeInvoice = installmentInvoices.find((invoice) => !["cancelled", "voided"].includes(invoice.document_status));
        const historicalInvoices = installmentInvoices
          .filter((invoice) => ["cancelled", "voided"].includes(invoice.document_status))
          .sort((left, right) => right.created_at.localeCompare(left.created_at));
        return <article key={installment.id} style={installmentCard}>
          <div style={installmentHeader}><div style={installmentHeadingCopy}><span style={installmentEyebrow}>งวดเรียกเก็บเงิน</span><h3 style={installmentTitle}>งวดที่ {installment.installment_no}</h3>{customInstallmentTitle ? <p style={installmentCustomTitle}>{customInstallmentTitle}</p> : null}</div><StatusBadge status={installment.status} label={installmentStatus[installment.status] || installment.status} /></div>
          {plan.status === "draft" && canManage && draftInstallment ? <div className="billing-plan-installment-edit-grid" style={installmentEditGrid}>
            <label className="billing-plan-installment-title-field" style={label}>ชื่องวด<input style={input} value={draftInstallment.title} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { title: event.target.value })} /></label>
            <label style={label}>เงื่อนไขเรียกเก็บ<select style={input} value={draftInstallment.trigger_type} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { trigger_type: event.target.value })}><option value="agreement_effective">{acceptedQuotationBasis ? "เมื่อการว่าจ้างมีผล" : "เมื่อข้อตกลงมีผล"}</option><option value="date">ตามวันที่</option><option value="case_milestone">ตามเหตุการณ์สำคัญ</option><option value="manual">กำหนดด้วยตนเอง</option><option value="recurring_period">ตามรอบระยะเวลา</option></select></label>
            <label className="billing-plan-installment-description-field" style={label}>รายละเอียดเงื่อนไข<input style={input} value={draftInstallment.trigger_description} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { trigger_description: event.target.value })} /></label>
            <label style={label}>วันที่ครบกำหนด<input style={input} type="date" value={draftInstallment.due_date} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { due_date: event.target.value })} /></label>
            {draftInstallment.trigger_type === "case_milestone" ? <label style={label}>เหตุการณ์สำคัญ (ถ้ามี)<input style={input} value={draftInstallment.milestone_code} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { milestone_code: event.target.value })} /></label> : null}
            {draftInstallment.trigger_type === "recurring_period" ? <><label style={label}>เริ่มรอบ<input style={input} type="date" value={draftInstallment.recurring_period_start} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { recurring_period_start: event.target.value })} /></label><label style={label}>สิ้นสุดรอบ<input style={input} type="date" value={draftInstallment.recurring_period_end} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { recurring_period_end: event.target.value })} /></label></> : null}
          </div> : null}
          <div className="billing-plan-installment-financials" style={installmentFinancials}>
            <SummaryMetric label="มูลค่าก่อน VAT" value={money(installment.amount_before_tax, plan.currency)} compact />
            <SummaryMetric label="VAT" value={money(installment.vat_amount, plan.currency)} compact />
            <SummaryMetric label="ยอดรวมงวด" value={money(installment.total_amount, plan.currency)} prominent compact />
          </div>
          <div className="billing-plan-installment-meta" style={installmentMetaGrid}>
            <Field label="เงื่อนไขเรียกเก็บ" value={installment.trigger_type === "agreement_effective" && acceptedQuotationBasis ? "เมื่อการว่าจ้างมีผล" : triggerType[installment.trigger_type] || installment.trigger_type} />
            {installment.trigger_description ? <Field label="รายละเอียดเงื่อนไข" value={installment.trigger_description} /> : null}
            {installment.due_date ? <Field label="วันที่ครบกำหนด" value={date(installment.due_date)} /> : null}
            {installment.milestone_code ? <Field label="เหตุการณ์สำคัญ" value={installment.milestone_code} /> : null}
            {installment.recurring_period_start || installment.recurring_period_end ? <Field label="รอบระยะเวลา" value={`${date(installment.recurring_period_start)} / ${date(installment.recurring_period_end)}`} /> : null}
            {installment.readiness_event_date ? <Field label="วันที่เงื่อนไขเกิดขึ้นจริง" value={date(installment.readiness_event_date)} /> : null}
            {installment.ready_to_invoice_at ? <Field label="พร้อมออกใบแจ้งหนี้เมื่อ" value={dateTime(installment.ready_to_invoice_at)} /> : null}
            {installment.readiness_reference ? <Field label="หลักฐานอ้างอิง" value={installment.readiness_reference} /> : null}
            {installment.readiness_note ? <Field label="หมายเหตุความพร้อม" value={installment.readiness_note} /> : null}
            {installment.invoiced_at ? <Field label="ออกใบแจ้งหนี้เมื่อ" value={dateTime(installment.invoiced_at)} /> : null}
            {installment.cancelled_at ? <Field label="ยกเลิกเมื่อ" value={dateTime(installment.cancelled_at)} /> : null}
          </div>
          <div style={allocationHeading}><h4 style={allocationTitle}>รายการค่าบริการในงวดนี้</h4><span style={allocationCount}>{installmentAllocations.length} รายการ</span></div>
          {installmentAllocations.length === 0 ? <div style={warning}>งวดนี้ไม่มีรายการค่าบริการที่จัดสรรไว้</div> : <div style={scroll}><table className="billing-plan-allocation-table" style={allocationTable}><colgroup>{allocationColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead><tr>{allocationColumns.map((column) => <th key={column.key} className={column.numeric ? "billing-plan-numeric-column" : undefined}>{column.key === "description" && acceptedQuotationBasis ? "รายการตามใบเสนอราคา" : column.label}</th>)}</tr></thead><tbody>{installmentAllocations.map((allocation) => <tr key={allocation.id}>{allocationColumns.map((column) => <td key={column.key} className={column.numeric ? "billing-plan-numeric-column" : undefined}>{allocationCell(column.key, allocation, agreementItemById.get(allocation.fee_agreement_item_id), plan.currency)}</td>)}</tr>)}</tbody></table></div>}
          {canManage && plan.status === "active" && installment.status === "pending" ? <div style={installmentNextStep}>
            <div><span style={nextStepEyebrow}>ขั้นตอนถัดไป</span><strong style={nextStepTitle}>ยืนยันว่าพร้อมออกใบแจ้งหนี้</strong><p style={nextStepHelp}>ดำเนินการเมื่อเงื่อนไขการเรียกเก็บเงินของงวดนี้เกิดขึ้นจริงแล้วเท่านั้น</p></div>
            <button className="billing-installment-primary-action" type="button" style={primaryButton} disabled={Boolean(installmentActionId)} onClick={() => openReadinessPanel(installment)}>ยืนยันว่าพร้อมออกใบแจ้งหนี้</button>
          </div> : null}
          {readinessInstallmentId === installment.id ? <div ref={readinessPanelRef} style={readinessPanel}>
            <div style={readinessHeader}><div><span style={nextStepEyebrow}>การยืนยันโดยเจ้าหน้าที่</span><h4 style={readinessTitle}>ยืนยันความพร้อมออกใบแจ้งหนี้สำหรับงวดที่ {installment.installment_no}</h4></div><button type="button" style={closeButton} disabled={installmentActionId === installment.id} aria-label="ปิดแบบยืนยัน" onClick={closeReadinessPanel}>×</button></div>
            <div style={readinessContext}>
              <Field label="ชื่องวด" value={installment.title} />
              <Field label="เงื่อนไขเรียกเก็บ" value={installment.trigger_description || triggerType[installment.trigger_type] || installment.trigger_type} />
              <Field label="ยอดรวมงวด" value={money(installment.total_amount, plan.currency)} />
              {installment.due_date ? <Field label="วันที่ครบกำหนด" value={date(installment.due_date)} /> : null}
            </div>
            {readinessSummaryError ? <div role="alert" style={validationSummary}>{readinessSummaryError}</div> : null}
            <div className="billing-readiness-form-grid" style={readinessFormGrid}>
              <label style={label}>วันที่เงื่อนไขเกิดขึ้นจริง <span style={requiredMark}>*</span><input ref={readinessDateRef} style={{ ...input, ...(readinessErrors.eventDate ? invalidInput : {}) }} type="date" value={readinessForm.eventDate} disabled={installmentActionId === installment.id} aria-invalid={Boolean(readinessErrors.eventDate)} onChange={(event) => { setReadinessForm({ ...readinessForm, eventDate: event.target.value }); setReadinessErrors((current) => ({ ...current, eventDate: undefined })); setReadinessSummaryError(""); }} />{readinessErrors.eventDate ? <span style={fieldError}>{readinessErrors.eventDate}</span> : null}</label>
              <label style={label}>หลักฐาน/เลขอ้างอิง (ถ้ามี)<input style={input} value={readinessForm.reference} maxLength={500} disabled={installmentActionId === installment.id} onChange={(event) => setReadinessForm({ ...readinessForm, reference: event.target.value })} /></label>
              <label className="billing-readiness-note" style={{ ...label, gridColumn: "1 / -1" }}>หมายเหตุภายใน (ถ้ามี)<textarea style={{ ...input, minHeight: 76, resize: "vertical" }} value={readinessForm.note} maxLength={2000} disabled={installmentActionId === installment.id} onChange={(event) => setReadinessForm({ ...readinessForm, note: event.target.value })} /></label>
            </div>
            <label style={{ ...confirmationLabel, ...(readinessErrors.confirmed ? invalidConfirmation : {}) }}><input ref={readinessConfirmationRef} type="checkbox" checked={readinessForm.confirmed} disabled={installmentActionId === installment.id} aria-invalid={Boolean(readinessErrors.confirmed)} onChange={(event) => { setReadinessForm({ ...readinessForm, confirmed: event.target.checked }); setReadinessErrors((current) => ({ ...current, confirmed: undefined })); setReadinessSummaryError(""); }} /><span>ยืนยันว่าเงื่อนไขการเรียกเก็บเงินของงวดนี้เกิดขึ้นแล้ว และพร้อมจัดทำใบแจ้งหนี้</span></label>
            {readinessErrors.confirmed ? <span style={fieldError}>{readinessErrors.confirmed}</span> : null}
            <div style={readinessActions}><button type="button" style={secondaryButton} disabled={installmentActionId === installment.id} onClick={closeReadinessPanel}>ยกเลิก</button><button className="billing-installment-primary-action" type="button" style={primaryButton} disabled={Boolean(installmentActionId)} onClick={() => void confirmInstallmentReadiness(installment)}>{installmentActionId === installment.id ? "กำลังยืนยัน..." : "ยืนยันความพร้อม"}</button></div>
          </div> : null}
          {plan.status === "active" && installment.status === "ready_to_invoice" ? <div style={installmentNextStep}>
            <div><span style={nextStepEyebrow}>ขั้นตอนถัดไป</span><strong style={nextStepTitle}>{activeInvoice ? "เปิดร่างใบแจ้งหนี้" : "สร้างร่างใบแจ้งหนี้"}</strong><p style={nextStepHelp}>{activeInvoice ? `${invoiceStatus[activeInvoice.document_status] || activeInvoice.document_status} พร้อมให้ตรวจสอบ โดยยังไม่มีการออกเลขที่ใหม่` : "ระบบจะคัดลอกยอดและ VAT จากงวดนี้โดยตรง และยังไม่ออกเลขที่ใบแจ้งหนี้"}</p></div>
            <button className="billing-installment-primary-action" type="button" style={primaryButton} disabled={Boolean(installmentActionId)} onClick={() => void createOrOpenInvoiceDraft(installment, activeInvoice)}>{installmentActionId === installment.id ? "กำลังดำเนินการ..." : activeInvoice ? "เปิดร่างใบแจ้งหนี้" : "สร้างร่างใบแจ้งหนี้"}</button>
          </div> : null}
          {activeInvoice && installment.status === "invoiced" ? <div style={installmentNextStep}><div><span style={nextStepEyebrow}>ใบแจ้งหนี้</span><strong style={nextStepTitle}>{activeInvoice.invoice_no || "เอกสารใบแจ้งหนี้"}</strong></div><Link style={{ ...primaryButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }} href={`/finance/invoices/${activeInvoice.id}`}>เปิดใบแจ้งหนี้</Link></div> : null}
          {historicalInvoices.length ? <section style={invoiceHistorySection} aria-label={`ประวัติใบแจ้งหนี้ของงวดที่ ${installment.installment_no}`}>
            <div style={invoiceHistoryHeader}><div><span style={invoiceHistoryEyebrow}>ประวัติเอกสาร</span><h4 style={invoiceHistoryTitle}>ประวัติใบแจ้งหนี้</h4></div><span style={invoiceHistoryCount}>{historicalInvoices.length} รายการ</span></div>
            <div style={invoiceHistoryList}>{historicalInvoices.map((historicalInvoice) => <div className="billing-plan-invoice-history-item" key={historicalInvoice.id} style={invoiceHistoryItem}>
              <div style={invoiceHistoryIdentity}><strong style={invoiceHistoryNumber}>{historicalInvoice.invoice_no || "ร่างใบแจ้งหนี้ (ไม่มีเลขที่)"}</strong><div style={invoiceHistoryMeta}><StatusBadge status={historicalInvoice.document_status} label={invoiceStatus[historicalInvoice.document_status] || historicalInvoice.document_status} /><span>{invoiceHistoryTimestamp(historicalInvoice)}</span></div></div>
              <Link className="billing-plan-invoice-history-link" style={invoiceHistoryLink} href={`/finance/invoices/${historicalInvoice.id}`}>เปิดใบแจ้งหนี้</Link>
            </div>)}</div>
          </section> : null}
        </article>;
      })}
    </section>
    {canManage && plan.status === "draft" ? <section className="billing-plan-final-review" style={{ ...card, ...finalReviewCard }}>
      <div style={finalReviewHeader}>
        <span style={finalReviewEyebrow}>ขั้นตอนสุดท้าย</span>
        <h2 style={finalReviewTitle}>ตรวจสอบแผนเรียกเก็บเงิน</h2>
        <p style={finalReviewDescription}>ตรวจสอบงวด เงื่อนไข วันที่ครบกำหนด รายการค่าบริการ และยอดเงินทั้งหมดให้ครบถ้วนก่อนยืนยันแผนพร้อมดำเนินการ</p>
      </div>
      <div className="billing-plan-final-summary" style={finalSummaryGrid}>
        <SummaryMetric label="จำนวนงวด" value={String(plan.installment_count)} />
        <SummaryMetric label="มูลค่าก่อน VAT" value={money(plan.amount_before_tax, plan.currency)} />
        <SummaryMetric label="VAT" value={money(plan.vat_amount, plan.currency)} />
        <SummaryMetric label="ยอดรวม" value={money(plan.total_amount, plan.currency)} prominent />
      </div>
      <div style={{ ...finalReadinessNotice, ...(dirty ? finalReadinessPending : finalReadinessReady) }}>
        <strong>{dirty ? "กรุณาบันทึกการเปลี่ยนแปลงก่อนยืนยันแผน" : "ข้อมูลล่าสุดถูกบันทึกแล้ว พร้อมสำหรับการยืนยัน"}</strong>
        <span>{dirty ? "ปุ่มยืนยันจะพร้อมใช้งานเมื่อบันทึกข้อมูลล่าสุดสำเร็จ" : "การยืนยันจะเปลี่ยนแผนจากร่างเป็นพร้อมดำเนินการ"}</span>
      </div>
      <div className="billing-plan-workflow-controls" style={workflowControls}>
        <div className="billing-plan-normal-actions" style={actionButtons}>
          <button className="billing-plan-save-button" type="button" style={{ ...secondaryButton, ...(!dirty ? disabledSaveButton : {}) }} disabled={!dirty || saving || statusSaving} onClick={() => void saveDraft()}>{saving ? "กำลังบันทึก..." : dirty ? "บันทึกการเปลี่ยนแปลง" : "บันทึกแล้ว"}</button>
          <button className="billing-plan-primary-button" type="button" style={primaryButton} disabled={dirty || saving || statusSaving} onClick={() => void changePlanStatus("active")}>{statusSaving ? "กำลังดำเนินการ..." : "ยืนยันแผนพร้อมดำเนินการ"}</button>
        </div>
      </div>
      <div className="billing-plan-danger-actions" style={otherActions}>
        <div style={otherActionsCopy}>
          <strong>การดำเนินการอื่น</strong>
          <span>ใช้เมื่อไม่ต้องการดำเนินการตามแผนนี้ต่อ การยกเลิกไม่ใช่การยืนยันแผน</span>
        </div>
        <button className="billing-plan-cancel-button" type="button" style={cancelButton} disabled={saving || statusSaving} onClick={() => void changePlanStatus("cancelled")}>ยกเลิกแผน</button>
      </div>
    </section> : null}
    <style jsx global>{`
      .billing-plan-navigation-link { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .billing-plan-navigation-back:hover { background: #f8fafc !important; border-color: #94a3b8 !important; color: #172033 !important; }
      .billing-plan-navigation-source:hover { background: #e0e7ff !important; border-color: #a5b4fc !important; color: #312e81 !important; }
      .billing-plan-navigation-link:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .billing-plan-primary-button, .billing-plan-save-button, .billing-plan-cancel-button, .billing-installment-primary-action { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .billing-plan-primary-button:hover:not(:disabled), .billing-installment-primary-action:hover:not(:disabled) { background: #14532d !important; border-color: #14532d !important; }
      .billing-plan-save-button:hover:not(:disabled) { background: #f8fafc !important; border-color: #64748b !important; }
      .billing-plan-cancel-button:hover:not(:disabled) { background: #fef2f2 !important; border-color: #fca5a5 !important; }
      .billing-plan-primary-button:focus-visible, .billing-plan-save-button:focus-visible, .billing-plan-cancel-button:focus-visible, .billing-installment-primary-action:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .billing-plan-primary-button:disabled, .billing-plan-save-button:disabled, .billing-plan-cancel-button:disabled, .billing-installment-primary-action:disabled { cursor: not-allowed !important; opacity: .58; }
      .billing-plan-invoice-history-link { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .billing-plan-invoice-history-link:hover { background: #f8fafc !important; border-color: #94a3b8 !important; color: #172033 !important; }
      .billing-plan-invoice-history-link:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .billing-plan-allocation-table th, .billing-plan-allocation-table td { padding: 10px 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .billing-plan-allocation-table th { color: #475569; background: #f8fafc; font-size: 12px; font-weight: 750; text-align: left; white-space: nowrap; }
      .billing-plan-allocation-table td { color: #172033; font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
      .billing-plan-allocation-table tbody tr:last-child td { border-bottom: 0; }
      .billing-plan-allocation-table .billing-plan-numeric-column { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .billing-plan-metadata-grid > div { min-width: 0; padding: 0 12px; border-left: 1px solid #e2e8f0; }
      .billing-plan-metadata-grid > div:first-child { padding-left: 0; border-left: 0; }
      .billing-plan-summary-metric:first-child { padding-left: 0 !important; border-left: 0 !important; }
      @media (max-width: 900px) {
        .billing-plan-identity-header { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-status-panel { justify-items: start !important; min-width: 0 !important; border-left: 0 !important; border-top: 2px solid #bbf7d0; }
        .billing-plan-header-edit-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-metadata-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; row-gap: 14px !important; }
        .billing-plan-totals-grid, .billing-plan-final-summary { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .billing-plan-installment-edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .billing-readiness-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .billing-plan-installment-title-field, .billing-plan-installment-description-field { grid-column: 1 / -1; }
      }
      @media (max-width: 640px) {
        .billing-plan-page { padding: 14px !important; }
        .billing-plan-navigation-toolbar { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-navigation-link { width: 100%; justify-content: flex-start !important; white-space: normal !important; }
        .billing-plan-metadata-grid, .billing-plan-totals-grid, .billing-plan-final-summary, .billing-plan-installment-edit-grid, .billing-plan-installment-financials, .billing-plan-installment-meta { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-workflow-controls { width: 100%; align-items: stretch !important; }
        .billing-plan-normal-actions { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; width: 100%; }
        .billing-plan-danger-actions { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; width: 100%; align-items: stretch !important; }
        .billing-plan-primary-button, .billing-plan-save-button, .billing-plan-cancel-button, .billing-installment-primary-action { width: 100%; }
        .billing-plan-invoice-history-item { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-invoice-history-link { width: 100%; box-sizing: border-box; }
        .billing-readiness-form-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-readiness-note { grid-column: auto !important; }
        .billing-plan-metadata-grid > div, .billing-plan-summary-metric { padding: 9px 0 !important; border-left: 0 !important; border-top: 1px solid #e2e8f0; }
        .billing-plan-metadata-grid > div:first-child, .billing-plan-summary-metric:first-child { border-top: 0; }
        .billing-plan-source-chain-nodes { display: grid !important; grid-template-columns: minmax(0, 1fr); }
        .billing-plan-chain-arrow { display: none; }
      }
    `}</style>
  </main>;
}

function Field({ label, value }: { label: string; value: ReactNode }) { return <div><small style={{ color: "#64748b" }}>{label}</small><div>{value}</div></div>; }
function DiagnosticField({ label, value }: { label: string; value: string }) { return <div style={diagnosticField}><span style={diagnosticLabel}>{label}</span><code style={diagnosticValue}>{value}</code></div>; }
function StatusBadge({ status, label, prominent = false }: { status: string; label: string; prominent?: boolean }) { return <span style={{ ...statusBadge, ...statusColor[status], ...(prominent ? prominentStatusBadge : {}) }}>{label}</span>; }
function NavigationIcon({ name }: { name: "back" | "source" }) { const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; if (name === "back") return <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; return <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" /></svg>; }
function ChainNode({ title, status, statusText, current = false, children }: { title: string; status: string | null; statusText?: string; current?: boolean; children: ReactNode }) { return <div style={{ ...chainNode, ...(current ? chainCurrentNode : {}) }}><small style={{ color: "#64748b" }}>{title}</small>{status ? <StatusBadge status={status} label={statusText || planStatus[status] || status} /> : null}<div style={{ marginTop: 6, overflowWrap: "anywhere" }}>{children}</div></div>; }
function SummaryMetric({ label, value, prominent = false, compact = false }: { label: string; value: string; prominent?: boolean; compact?: boolean }) { return <div className="billing-plan-summary-metric" style={{ ...summaryMetric, ...(compact ? compactSummaryMetric : {}), ...(prominent ? prominentSummaryMetric : {}) }}><small style={{ ...summaryMetricLabel, ...(prominent ? prominentSummaryMetricLabel : {}) }}>{label}</small><strong style={{ ...summaryMetricValue, ...(prominent ? prominentSummaryMetricValue : {}) }}>{value}</strong></div>; }
function billingPlanDraft(plan: BillingPlan, installments: Installment[]): DraftForm { return { title: plan.title || "", description: plan.description || "", installments: installments.map((installment) => ({ id: installment.id, installment_no: installment.installment_no, sort_order: installment.sort_order, title: installment.title, trigger_description: installment.trigger_description || "", trigger_type: installment.trigger_type, due_date: installment.due_date || "", milestone_code: installment.milestone_code || "", recurring_period_start: installment.recurring_period_start || "", recurring_period_end: installment.recurring_period_end || "" })) }; }
function billingInstallmentDisplayTitle(title: string, installmentNo: number) { const value = title.trim(); const generated = new RegExp(`^(?:งวดที่\\s*${installmentNo}|Installment\\s*${installmentNo})(?:\\s*[/\\-—]\\s*(?:งวดที่\\s*${installmentNo}|Installment\\s*${installmentNo}))?$`, "i"); return generated.test(value) ? "" : value; }
function invoiceHistoryTimestamp(invoice: InvoiceSummary) { if (invoice.document_status === "voided") return `ยกเลิกเมื่อ ${dateTime(invoice.voided_at)}`; if (invoice.document_status === "cancelled") return `ยกเลิกร่างเมื่อ ${dateTime(invoice.cancelled_at)}`; return `สร้างเมื่อ ${dateTime(invoice.created_at)}`; }
function allocationCell(key: AllocationColumnKey, allocation: Allocation, description: string | undefined, currency: string): ReactNode { if (key === "description") return description || <span style={unavailable}>ไม่พบรายการค่าบริการต้นทาง</span>; if (key === "amount_before_tax") return money(allocation.amount_before_tax, currency); if (key === "vat_amount") return money(allocation.vat_amount, currency); if (key === "total_amount") return <strong>{money(allocation.total_amount, currency)}</strong>; return allocation.allocation_percent === null ? <span style={mutedValue}>ตามยอดจริง</span> : `${numberValue(allocation.allocation_percent).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`; }
function bangkokToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const value = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${value.year}-${value.month}-${value.day}`; }
function validateBillingPlanDraft(draft: DraftForm) { for (const installment of draft.installments) { if (!installment.title.trim()) return `กรุณาระบุชื่องวดที่ ${installment.installment_no}`; if (installment.trigger_type === "date" && !installment.due_date) return `กรุณาระบุวันที่ครบกำหนดของงวดที่ ${installment.installment_no}`; if (installment.trigger_type === "case_milestone" && !installment.milestone_code.trim() && !installment.trigger_description.trim()) return `กรุณาระบุเหตุการณ์สำคัญของงวดที่ ${installment.installment_no}`; if (installment.trigger_type === "recurring_period" && (!installment.recurring_period_start || !installment.recurring_period_end || installment.recurring_period_end < installment.recurring_period_start)) return `กรุณาตรวจสอบรอบระยะเวลาของงวดที่ ${installment.installment_no}`; } return ""; }
function billingReadinessErrorMessage(value: unknown) { const message = errorText(value); if (message.includes("Human readiness confirmation")) return "กรุณายืนยันว่าเงื่อนไขการเรียกเก็บเงินของงวดนี้เกิดขึ้นแล้ว"; if (message.includes("Actual readiness event date")) return "กรุณาระบุวันที่ที่เงื่อนไขการเรียกเก็บเงินเกิดขึ้นจริง"; if (message.includes("cannot be in the future")) return "วันที่ยืนยันความพร้อมต้องไม่เป็นวันที่ในอนาคต"; if (message.includes("active Billing Plan")) return "แผนเรียกเก็บเงินนี้ไม่ได้อยู่ในสถานะพร้อมดำเนินการ"; if (message.includes("Only a pending") || message.includes("readiness evidence is incomplete")) return "สถานะงวดเปลี่ยนไปแล้ว กรุณารีเฟรชและตรวจสอบอีกครั้ง"; if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์ยืนยันความพร้อมของงวดเรียกเก็บเงิน"; return "ยืนยันความพร้อมออกใบแจ้งหนี้ไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง"; }
function invoiceDraftErrorPresentation(value: unknown): { message: string; knownBusinessError: boolean } { const message = errorText(value); if (message.includes("ready to invoice") || message.includes("active Billing Plan")) return { message: "งวดนี้ยังไม่อยู่ในสถานะพร้อมออกใบแจ้งหนี้ กรุณารีเฟรชและตรวจสอบอีกครั้ง", knownBusinessError: true }; if (message.includes("active Invoice already exists")) return { message: "งวดนี้มีใบแจ้งหนี้อยู่แล้ว กรุณารีเฟรชเพื่อเปิดเอกสารเดิม", knownBusinessError: true }; if (message.includes("do not reconcile") || message.includes("exactly copy") || message.includes("exactly match")) return { message: "ยอดหรือรายการของงวดไม่ตรงกับหลักฐานต้นทาง จึงยังสร้างร่างใบแจ้งหนี้ไม่ได้", knownBusinessError: true }; if (message.includes("Not allowed")) return { message: "คุณไม่มีสิทธิ์สร้างร่างใบแจ้งหนี้", knownBusinessError: true }; return { message: "สร้างร่างใบแจ้งหนี้ไม่สำเร็จ", knownBusinessError: false }; }
function buildInvoiceDraftDiagnostic(value: unknown, billingPlanId: string, billingInstallmentId: string): InvoiceDraftDiagnostic { const error = value && typeof value === "object" ? value as Record<string, unknown> : {}; return { operation: "create_finance_invoice_draft_from_installment", timestamp: new Date().toISOString(), billing_plan_id: billingPlanId, billing_installment_id: billingInstallmentId, error_code: diagnosticText(error.code), error_message: diagnosticText(error.message) || diagnosticText(errorText(value)) || "Unknown RPC error", error_details: diagnosticText(error.details), error_hint: diagnosticText(error.hint) }; }
function diagnosticText(value: unknown) { if (typeof value !== "string") return null; const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim(); return normalized ? normalized.slice(0, 2000) : null; }
function errorText(value: unknown) { return value && typeof value === "object" && "message" in value ? String(value.message) : String(value || ""); }
function billingPlanErrorMessage(value: unknown) { const message = value && typeof value === "object" && "message" in value ? String(value.message) : String(value || ""); if (message.includes("eligible commercial engagement") || message.includes("signed, completed, or legacy active")) return "รายการการว่าจ้างไม่อยู่ในสถานะที่อนุญาตให้จัดการแผนเรียกเก็บเงิน"; if (message.includes("totals must match") || message.includes("allocations must exactly match") || message.includes("VAT allocations")) return "ยอดงวดหรือการจัดสรรไม่ตรงกับหลักฐานการว่าจ้าง กรุณารีเฟรชและตรวจสอบข้อมูล"; if (message.includes("Only draft billing plans")) return "แผนนี้ไม่ใช่ร่างแล้ว จึงไม่สามารถแก้ไขได้"; if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์จัดการแผนเรียกเก็บเงิน"; return "ไม่สามารถบันทึกแผนเรียกเก็บเงินได้ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง"; }

const page: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24 };
const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, marginBottom: 16 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 };
const navigationToolbar: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, max-content)", alignItems: "center", gap: 8, padding: 8, marginBottom: 18, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" };
const navigationLink: CSSProperties = { boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minWidth: 0, minHeight: 38, padding: "8px 11px", border: "1px solid", borderRadius: 6, fontSize: 14, fontWeight: 650, lineHeight: 1.25, textDecoration: "none", whiteSpace: "nowrap" };
const navigationBackLink: CSSProperties = { background: "#fff", borderColor: "#cbd5e1", color: "#475569" };
const navigationSourceLink: CSSProperties = { background: "#eef2ff", borderColor: "#c7d2fe", color: "#3730a3" };
const warning: CSSProperties = { background: "#fff7ed", color: "#9a3412", padding: 12, borderRadius: 6, marginBottom: 12 };
const success: CSSProperties = { background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 6, marginBottom: 12 };
const diagnosticPanel: CSSProperties = { margin: "-4px 0 12px", padding: "0 12px 12px", border: "1px solid #dbe3ee", borderRadius: 6, background: "#f8fafc", color: "#334155" };
const diagnosticSummary: CSSProperties = { padding: "11px 0", color: "#475569", fontSize: 13, fontWeight: 750, cursor: "pointer" };
const diagnosticGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 };
const diagnosticField: CSSProperties = { minWidth: 0, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 5, background: "#fff" };
const diagnosticLabel: CSSProperties = { display: "block", marginBottom: 4, color: "#64748b", fontSize: 11, fontWeight: 700 };
const diagnosticValue: CSSProperties = { display: "block", color: "#334155", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.45, overflowWrap: "anywhere", whiteSpace: "pre-wrap" };
const diagnosticActions: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 };
const diagnosticCopyButton: CSSProperties = { minHeight: 36, padding: "7px 11px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#334155", fontWeight: 700, cursor: "pointer" };
const diagnosticCopyStatusStyle: CSSProperties = { color: "#475569", fontSize: 12 };
const description: CSSProperties = { margin: "6px 0 0", color: "#64748b", lineHeight: 1.55, whiteSpace: "pre-wrap" };
const planHeaderCard: CSSProperties = { padding: 0, overflow: "hidden" };
const planIdentityHeader: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 24, alignItems: "start", padding: "20px 20px 16px" };
const planIdentityCopy: CSSProperties = { minWidth: 0 };
const planEyebrow: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 800 };
const planTitle: CSSProperties = { margin: "5px 0 3px", color: "#172033", fontSize: 28, lineHeight: 1.25, overflowWrap: "anywhere" };
const planReference: CSSProperties = { margin: 0, color: "#166534", fontSize: 14, fontWeight: 700 };
const planStatusPanel: CSSProperties = { display: "grid", justifyItems: "end", gap: 7, minWidth: 190, padding: "10px 12px", borderLeft: "2px solid #bbf7d0", background: "#f8fafc" };
const metaLabel: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 700 };
const planUpdated: CSSProperties = { color: "#64748b", fontSize: 12 };
const headerEditGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px,.8fr) minmax(300px,1.2fr)", gap: 14, padding: "16px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fbff" };
const planMetadataGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 0, padding: "14px 20px", borderTop: "1px solid #e2e8f0", background: "#fff" };
const sectionTitle: CSSProperties = { margin: "0 0 14px", color: "#172033", fontSize: 18 };
const sourceChain: CSSProperties = { borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: "12px 0", marginBottom: 16 };
const sourceChainTitle: CSSProperties = { margin: "0 0 10px", color: "#475569", fontSize: 14 };
const chainNodes: CSSProperties = { display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" };
const chainNode: CSSProperties = { flex: "1 1 210px", minWidth: 0, border: "1px solid #e5e7eb", borderRadius: 6, padding: 10, background: "#fff", fontSize: 13 };
const chainCurrentNode: CSSProperties = { borderColor: "#2563eb", background: "#eff6ff" };
const chainArrow: CSSProperties = { alignSelf: "center", color: "#64748b", fontSize: 20 };
const unavailable: CSSProperties = { color: "#9a3412" };
const mutedValue: CSSProperties = { color: "#64748b", fontWeight: 500 };
const installmentCard: CSSProperties = { border: "1px solid #dbe3ee", borderRadius: 8, padding: 16, marginTop: 14, background: "#fff" };
const installmentHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" };
const installmentHeadingCopy: CSSProperties = { minWidth: 0 };
const installmentEyebrow: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 750 };
const installmentTitle: CSSProperties = { margin: "3px 0 0", color: "#172033", fontSize: 19 };
const installmentCustomTitle: CSSProperties = { margin: "3px 0 0", color: "#475569", fontSize: 14 };
const installmentEditGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px,1.25fr) minmax(180px,.75fr) minmax(220px,1fr) minmax(170px,.7fr)", gap: 12, margin: "14px 0", padding: 14, border: "1px solid #dbeafe", borderRadius: 6, background: "#f8fbff" };
const installmentFinancials: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 0, marginTop: 14, padding: "12px 0", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" };
const installmentMetaGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "10px 16px", padding: "13px 0 2px", color: "#334155", fontSize: 13 };
const installmentNextStep: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 18, padding: 14, border: "1px solid #bbf7d0", borderRadius: 6, background: "#f7fff9" };
const nextStepEyebrow: CSSProperties = { display: "block", color: "#166534", fontSize: 11, fontWeight: 800 };
const nextStepTitle: CSSProperties = { display: "block", marginTop: 3, color: "#172033", fontSize: 15 };
const nextStepHelp: CSSProperties = { margin: "4px 0 0", color: "#475569", fontSize: 13, lineHeight: 1.45 };
const invoiceHistorySection: CSSProperties = { marginTop: 16, paddingTop: 14, borderTop: "1px solid #e2e8f0" };
const invoiceHistoryHeader: CSSProperties = { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 9 };
const invoiceHistoryEyebrow: CSSProperties = { display: "block", color: "#64748b", fontSize: 11, fontWeight: 750 };
const invoiceHistoryTitle: CSSProperties = { margin: "3px 0 0", color: "#334155", fontSize: 15 };
const invoiceHistoryCount: CSSProperties = { color: "#64748b", fontSize: 12 };
const invoiceHistoryList: CSSProperties = { display: "grid", gap: 8 };
const invoiceHistoryItem: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 12, padding: "10px 11px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc" };
const invoiceHistoryIdentity: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const invoiceHistoryNumber: CSSProperties = { color: "#334155", fontSize: 14, overflowWrap: "anywhere" };
const invoiceHistoryMeta: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, color: "#64748b", fontSize: 12 };
const invoiceHistoryLink: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 38, padding: "8px 11px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" };
const readinessPanel: CSSProperties = { scrollMarginTop: 96, marginTop: 12, padding: 16, border: "1px solid #93c5fd", borderRadius: 8, background: "#f8fbff" };
const readinessHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const readinessTitle: CSSProperties = { margin: "3px 0 0", color: "#172033", fontSize: 17 };
const closeButton: CSSProperties = { width: 34, height: 34, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", cursor: "pointer", fontSize: 22, lineHeight: 1 };
const readinessContext: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "14px 0", padding: 12, border: "1px solid #dbeafe", borderRadius: 6, background: "#fff", fontSize: 13 };
const readinessFormGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 };
const requiredMark: CSSProperties = { color: "#b91c1c" };
const invalidInput: CSSProperties = { borderColor: "#dc2626", boxShadow: "0 0 0 1px #dc2626" };
const validationSummary: CSSProperties = { marginBottom: 12, padding: "10px 12px", border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2", color: "#b91c1c", fontSize: 13, fontWeight: 700 };
const fieldError: CSSProperties = { color: "#b91c1c", fontSize: 12, lineHeight: 1.4 };
const confirmationLabel: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 9, marginTop: 14, padding: 12, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#172033", fontSize: 13, lineHeight: 1.5, cursor: "pointer" };
const invalidConfirmation: CSSProperties = { borderColor: "#dc2626", background: "#fef2f2" };
const readinessActions: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 14 };
const allocationHeading: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "18px 0 8px" };
const allocationTitle: CSSProperties = { margin: 0, color: "#334155", fontSize: 15 };
const allocationCount: CSSProperties = { color: "#64748b", fontSize: 12 };
const label: CSSProperties = { display: "grid", gap: 6, color: "#334155", fontSize: 13 };
const input: CSSProperties = { boxSizing: "border-box", width: "100%", minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px", background: "#fff", color: "#172033", font: "inherit" };
const saveStateNotice: CSSProperties = { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 10px", margin: "-2px 0 16px", padding: "10px 14px", border: "1px solid", borderRadius: 6, fontSize: 13 };
const dirtyStateNotice: CSSProperties = { borderColor: "#fed7aa", background: "#fff7ed", color: "#9a3412" };
const savedStateNotice: CSSProperties = { borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" };
const activeNotice: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, borderColor: "#bbf7d0", background: "#f7fff9" };
const actionHelp: CSSProperties = { margin: "4px 0 0", color: "#64748b", fontSize: 13 };
const actionButtons: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const workflowControls: CSSProperties = { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16, padding: "0 20px" };
const finalReviewCard: CSSProperties = { padding: 0, overflow: "hidden", borderColor: "#bbf7d0" };
const finalReviewHeader: CSSProperties = { padding: "20px 20px 16px", borderBottom: "1px solid #dcfce7", background: "#f7fff9" };
const finalReviewEyebrow: CSSProperties = { color: "#166534", fontSize: 11, fontWeight: 800 };
const finalReviewTitle: CSSProperties = { margin: "4px 0 5px", color: "#172033", fontSize: 20 };
const finalReviewDescription: CSSProperties = { maxWidth: 780, margin: 0, color: "#475569", fontSize: 14, lineHeight: 1.55 };
const finalSummaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: ".65fr 1fr .8fr 1.15fr", gap: 0, padding: "14px 20px", borderBottom: "1px solid #e2e8f0" };
const finalReadinessNotice: CSSProperties = { display: "grid", gap: 3, margin: "16px 20px 0", padding: "10px 12px", border: "1px solid", borderRadius: 6, fontSize: 13 };
const finalReadinessPending: CSSProperties = { borderColor: "#fed7aa", background: "#fff7ed", color: "#9a3412" };
const finalReadinessReady: CSSProperties = { borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" };
const otherActions: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 18, padding: "16px 20px", borderTop: "1px solid #fecaca", background: "#fffafa" };
const otherActionsCopy: CSSProperties = { display: "grid", gap: 3, color: "#7f1d1d", fontSize: 13 };
const secondaryButton: CSSProperties = { minHeight: 38, padding: "8px 12px", border: "1px solid #94a3b8", borderRadius: 6, background: "#fff", color: "#334155", cursor: "pointer", font: "inherit", fontWeight: 700 };
const disabledSaveButton: CSSProperties = { borderColor: "#cbd5e1", background: "#f8fafc", color: "#94a3b8" };
const primaryButton: CSSProperties = { minHeight: 38, padding: "8px 13px", border: "1px solid #166534", borderRadius: 6, background: "#166534", color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 700 };
const cancelButton: CSSProperties = { minHeight: 38, padding: "8px 12px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#b91c1c", cursor: "pointer", font: "inherit", fontWeight: 700 };
const totalsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr .8fr 1.15fr .65fr 1fr", gap: 0 };
const summaryMetric: CSSProperties = { display: "grid", alignContent: "center", gap: 5, minWidth: 0, padding: "9px 14px", borderLeft: "1px solid #e2e8f0" };
const compactSummaryMetric: CSSProperties = { padding: "5px 14px" };
const prominentSummaryMetric: CSSProperties = { background: "#f0fdf4", borderLeftColor: "#86efac" };
const summaryMetricLabel: CSSProperties = { color: "#64748b", fontSize: 12 };
const prominentSummaryMetricLabel: CSSProperties = { color: "#166534", fontWeight: 700 };
const summaryMetricValue: CSSProperties = { color: "#172033", fontSize: 16, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" };
const prominentSummaryMetricValue: CSSProperties = { color: "#166534", fontSize: 20 };
const scroll: CSSProperties = { overflowX: "auto" };
const allocationTable: CSSProperties = { width: "100%", minWidth: 760, border: "1px solid #e2e8f0", borderRadius: 6, borderSpacing: 0, tableLayout: "fixed" };
const statusBadge: CSSProperties = { display: "inline-block", padding: "3px 8px", borderRadius: 999, fontSize: 12 };
const prominentStatusBadge: CSSProperties = { padding: "5px 10px", fontSize: 13, fontWeight: 750 };
const statusColor: Record<string, CSSProperties> = { draft: { background: "#e5e7eb", color: "#374151" }, active: { background: "#dcfce7", color: "#166534" }, completed: { background: "#dbeafe", color: "#1d4ed8" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, voided: { background: "#fee2e2", color: "#b91c1c" }, pending: { background: "#e5e7eb", color: "#374151" }, ready_to_invoice: { background: "#fef3c7", color: "#92400e" }, invoiced: { background: "#dbeafe", color: "#1d4ed8" }, sent: { background: "#dbeafe", color: "#1d4ed8" }, accepted: { background: "#dcfce7", color: "#166534" } };
