"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";
import { feeAgreementStatusLabel } from "../../fee-agreements/lifecycle";

type Json = Record<string, unknown>;
type BillingPlan = { id: string; fee_agreement_id: string; status: string; billing_method: string; currency: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; title: string | null; description: string | null; installment_count: number; recurring_config_json: Json | null; created_at: string; updated_at: string };
type FeeAgreement = { id: string; agreement_no: string | null; title: string; client_id: string; case_id: number | null; advisory_matter_id: string | null; source_quotation_id: string | null; source_reference: string | null; status: string; client_snapshot_json: Json | null; matter_snapshot_json: Json | null; source_document_snapshot_json: Json | null };
type Installment = { id: string; installment_no: number; sort_order: number; title: string; trigger_description: string | null; trigger_type: string; due_date: string | null; milestone_code: string | null; recurring_period_start: string | null; recurring_period_end: string | null; status: string; ready_to_invoice_at: string | null; invoiced_at: string | null; cancelled_at: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; created_at: string };
type Allocation = { id: string; billing_installment_id: string; fee_agreement_item_id: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; allocation_percent: number | string | null; sort_order: number; allocation_snapshot_json: Json | null; created_at: string };
type AgreementItem = { id: string; description: string };
type DraftInstallment = { id: string; installment_no: number; sort_order: number; title: string; trigger_description: string; trigger_type: string; due_date: string; milestone_code: string; recurring_period_start: string; recurring_period_end: string };
type DraftForm = { title: string; description: string; installments: DraftInstallment[] };
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
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [agreement, setAgreement] = useState<FeeAgreement | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
  const [draft, setDraft] = useState<DraftForm>({ title: "", description: "", installments: [] });
  const [savedBaseline, setSavedBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saveLock = useRef(false);
  const statusLock = useRef(false);

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
        .select("id,agreement_no,title,client_id,case_id,advisory_matter_id,source_quotation_id,source_reference,status,client_snapshot_json,matter_snapshot_json,source_document_snapshot_json")
        .eq("id", planRow.fee_agreement_id)
        .maybeSingle(),
      supabase
        .from("finance_billing_installments")
        .select("id,installment_no,sort_order,title,trigger_description,trigger_type,due_date,milestone_code,recurring_period_start,recurring_period_end,status,ready_to_invoice_at,invoiced_at,cancelled_at,amount_before_tax,vat_amount,total_amount,created_at")
        .eq("billing_plan_id", id)
        .order("installment_no")
        .order("sort_order")
        .order("created_at")
        .order("id"),
    ]);

    const installmentRows = (installmentsResult.data || []) as Installment[];
    const installmentIds = installmentRows.map((installment) => installment.id);
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

    if (agreementResult.error || installmentsResult.error || allocationsResult.error || agreementItemsResult.error) {
      setError("โหลดรายละเอียดแผนเรียกเก็บเงินบางส่วนไม่สำเร็จ กรุณารีเฟรช");
    }
    setAgreement((agreementResult.data || null) as FeeAgreement | null);
    setInstallments(installmentRows);
    setAllocations(allocationRows);
    setAgreementItems((agreementItemsResult.data || []) as AgreementItem[]);
    const nextDraft = billingPlanDraft(planRow, installmentRows);
    setDraft(nextDraft);
    setSavedBaseline(JSON.stringify(nextDraft));
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

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
  const allocationByInstallment = new Map<string, Allocation[]>();
  allocations.forEach((allocation) => allocationByInstallment.set(allocation.billing_installment_id, [...(allocationByInstallment.get(allocation.billing_installment_id) || []), allocation]));
  const agreementItemById = new Map(agreementItems.map((item) => [item.id, item.description]));

  return <main className="billing-plan-page" style={page}>
    {agreement ? <nav className="billing-plan-navigation-toolbar" style={navigationToolbar} aria-label="การนำทางเอกสารที่เกี่ยวข้อง">
      <Link className="billing-plan-navigation-link billing-plan-navigation-back" style={{ ...navigationLink, ...navigationBackLink }} href={`/finance/fee-agreements/${agreement.id}`}><NavigationIcon name="back" /><span>กลับไปข้อตกลงค่าบริการ</span></Link>
      {agreement?.source_quotation_id ? <Link className="billing-plan-navigation-link billing-plan-navigation-source" style={{ ...navigationLink, ...navigationSourceLink }} href={`/finance/quotations/${agreement.source_quotation_id}`}><NavigationIcon name="source" /><span>เปิดใบเสนอราคาต้นทาง</span></Link> : null}
    </nav> : null}
    {error ? <div style={warning}>{error}</div> : null}
    {message ? <div style={success}>{message}</div> : null}

    <section style={{ ...card, ...planHeaderCard }}>
      <div className="billing-plan-identity-header" style={planIdentityHeader}>
        <div style={planIdentityCopy}><span style={planEyebrow}>BILLING PLAN</span><h1 style={planTitle}>{text(plan.status === "draft" ? draft.title : plan.title, "แผนเรียกเก็บเงิน")}</h1><p style={planReference}>{agreement ? `อ้างอิงข้อตกลง ${text(agreement.agreement_no, agreement.title)}` : "ไม่พบข้อตกลงค่าบริการอ้างอิง"}</p>{plan.status !== "draft" && plan.description ? <p style={description}>{plan.description}</p> : null}</div>
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
        <ChainNode title="ข้อตกลงค่าบริการ" status={agreement?.status || null} statusText={agreement ? feeAgreementStatusLabel(agreement.status) : undefined}>{agreement ? <Link href={`/finance/fee-agreements/${agreement.id}`}>{text(agreement.agreement_no, agreement.title)}</Link> : <span style={unavailable}>ไม่พบข้อตกลงค่าบริการที่เชื่อมไว้</span>}</ChainNode>
        <span className="billing-plan-chain-arrow" style={chainArrow} aria-hidden="true">→</span>
        <ChainNode title="แผนเรียกเก็บเงิน" status={plan.status} current>{text(plan.title, billingMethod[plan.billing_method] || plan.billing_method)}</ChainNode>
      </div>
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>ข้อตกลงค่าบริการอ้างอิง</h2>
      {!agreement ? <div style={warning}>ไม่พบข้อตกลงค่าบริการที่เชื่อมกับแผนนี้</div> : <div style={grid}>
        <Field label="ข้อตกลง" value={<Link href={`/finance/fee-agreements/${agreement.id}`}>{text(agreement.agreement_no, agreement.title)}</Link>} />
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
        return <article key={installment.id} style={installmentCard}>
          <div style={installmentHeader}><div style={installmentHeadingCopy}><span style={installmentEyebrow}>งวดเรียกเก็บเงิน</span><h3 style={installmentTitle}>งวดที่ {installment.installment_no}</h3>{customInstallmentTitle ? <p style={installmentCustomTitle}>{customInstallmentTitle}</p> : null}</div><StatusBadge status={installment.status} label={installmentStatus[installment.status] || installment.status} /></div>
          {plan.status === "draft" && canManage && draftInstallment ? <div className="billing-plan-installment-edit-grid" style={installmentEditGrid}>
            <label className="billing-plan-installment-title-field" style={label}>ชื่องวด<input style={input} value={draftInstallment.title} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { title: event.target.value })} /></label>
            <label style={label}>เงื่อนไขเรียกเก็บ<select style={input} value={draftInstallment.trigger_type} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { trigger_type: event.target.value })}><option value="agreement_effective">เมื่อข้อตกลงมีผล</option><option value="date">ตามวันที่</option><option value="case_milestone">ตามเหตุการณ์สำคัญ</option><option value="manual">กำหนดด้วยตนเอง</option><option value="recurring_period">ตามรอบระยะเวลา</option></select></label>
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
            <Field label="เงื่อนไขเรียกเก็บ" value={triggerType[installment.trigger_type] || installment.trigger_type} />
            {installment.trigger_description ? <Field label="รายละเอียดเงื่อนไข" value={installment.trigger_description} /> : null}
            {installment.due_date ? <Field label="วันที่ครบกำหนด" value={date(installment.due_date)} /> : null}
            {installment.milestone_code ? <Field label="เหตุการณ์สำคัญ" value={installment.milestone_code} /> : null}
            {installment.recurring_period_start || installment.recurring_period_end ? <Field label="รอบระยะเวลา" value={`${date(installment.recurring_period_start)} / ${date(installment.recurring_period_end)}`} /> : null}
            {installment.ready_to_invoice_at ? <Field label="พร้อมออกใบแจ้งหนี้เมื่อ" value={dateTime(installment.ready_to_invoice_at)} /> : null}
            {installment.invoiced_at ? <Field label="ออกใบแจ้งหนี้เมื่อ" value={dateTime(installment.invoiced_at)} /> : null}
            {installment.cancelled_at ? <Field label="ยกเลิกเมื่อ" value={dateTime(installment.cancelled_at)} /> : null}
          </div>
          <div style={allocationHeading}><h4 style={allocationTitle}>รายการค่าบริการในงวดนี้</h4><span style={allocationCount}>{installmentAllocations.length} รายการ</span></div>
          {installmentAllocations.length === 0 ? <div style={warning}>งวดนี้ไม่มีรายการค่าบริการที่จัดสรรไว้</div> : <div style={scroll}><table className="billing-plan-allocation-table" style={allocationTable}><colgroup>{allocationColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead><tr>{allocationColumns.map((column) => <th key={column.key} className={column.numeric ? "billing-plan-numeric-column" : undefined}>{column.label}</th>)}</tr></thead><tbody>{installmentAllocations.map((allocation) => <tr key={allocation.id}>{allocationColumns.map((column) => <td key={column.key} className={column.numeric ? "billing-plan-numeric-column" : undefined}>{allocationCell(column.key, allocation, agreementItemById.get(allocation.fee_agreement_item_id), plan.currency)}</td>)}</tr>)}</tbody></table></div>}
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
      .billing-plan-primary-button, .billing-plan-save-button, .billing-plan-cancel-button { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .billing-plan-primary-button:hover:not(:disabled) { background: #14532d !important; border-color: #14532d !important; }
      .billing-plan-save-button:hover:not(:disabled) { background: #f8fafc !important; border-color: #64748b !important; }
      .billing-plan-cancel-button:hover:not(:disabled) { background: #fef2f2 !important; border-color: #fca5a5 !important; }
      .billing-plan-primary-button:focus-visible, .billing-plan-save-button:focus-visible, .billing-plan-cancel-button:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .billing-plan-primary-button:disabled, .billing-plan-save-button:disabled, .billing-plan-cancel-button:disabled { cursor: not-allowed !important; opacity: .58; }
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
        .billing-plan-primary-button, .billing-plan-save-button, .billing-plan-cancel-button { width: 100%; }
        .billing-plan-metadata-grid > div, .billing-plan-summary-metric { padding: 9px 0 !important; border-left: 0 !important; border-top: 1px solid #e2e8f0; }
        .billing-plan-metadata-grid > div:first-child, .billing-plan-summary-metric:first-child { border-top: 0; }
        .billing-plan-source-chain-nodes { display: grid !important; grid-template-columns: minmax(0, 1fr); }
        .billing-plan-chain-arrow { display: none; }
      }
    `}</style>
  </main>;
}

function Field({ label, value }: { label: string; value: ReactNode }) { return <div><small style={{ color: "#64748b" }}>{label}</small><div>{value}</div></div>; }
function StatusBadge({ status, label, prominent = false }: { status: string; label: string; prominent?: boolean }) { return <span style={{ ...statusBadge, ...statusColor[status], ...(prominent ? prominentStatusBadge : {}) }}>{label}</span>; }
function NavigationIcon({ name }: { name: "back" | "source" }) { const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; if (name === "back") return <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; return <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" /></svg>; }
function ChainNode({ title, status, statusText, current = false, children }: { title: string; status: string | null; statusText?: string; current?: boolean; children: ReactNode }) { return <div style={{ ...chainNode, ...(current ? chainCurrentNode : {}) }}><small style={{ color: "#64748b" }}>{title}</small>{status ? <StatusBadge status={status} label={statusText || planStatus[status] || status} /> : null}<div style={{ marginTop: 6, overflowWrap: "anywhere" }}>{children}</div></div>; }
function SummaryMetric({ label, value, prominent = false, compact = false }: { label: string; value: string; prominent?: boolean; compact?: boolean }) { return <div className="billing-plan-summary-metric" style={{ ...summaryMetric, ...(compact ? compactSummaryMetric : {}), ...(prominent ? prominentSummaryMetric : {}) }}><small style={{ ...summaryMetricLabel, ...(prominent ? prominentSummaryMetricLabel : {}) }}>{label}</small><strong style={{ ...summaryMetricValue, ...(prominent ? prominentSummaryMetricValue : {}) }}>{value}</strong></div>; }
function billingPlanDraft(plan: BillingPlan, installments: Installment[]): DraftForm { return { title: plan.title || "", description: plan.description || "", installments: installments.map((installment) => ({ id: installment.id, installment_no: installment.installment_no, sort_order: installment.sort_order, title: installment.title, trigger_description: installment.trigger_description || "", trigger_type: installment.trigger_type, due_date: installment.due_date || "", milestone_code: installment.milestone_code || "", recurring_period_start: installment.recurring_period_start || "", recurring_period_end: installment.recurring_period_end || "" })) }; }
function billingInstallmentDisplayTitle(title: string, installmentNo: number) { const value = title.trim(); const generated = new RegExp(`^(?:งวดที่\\s*${installmentNo}|Installment\\s*${installmentNo})(?:\\s*[/\\-—]\\s*(?:งวดที่\\s*${installmentNo}|Installment\\s*${installmentNo}))?$`, "i"); return generated.test(value) ? "" : value; }
function allocationCell(key: AllocationColumnKey, allocation: Allocation, description: string | undefined, currency: string): ReactNode { if (key === "description") return description || <span style={unavailable}>ไม่พบรายการค่าบริการต้นทาง</span>; if (key === "amount_before_tax") return money(allocation.amount_before_tax, currency); if (key === "vat_amount") return money(allocation.vat_amount, currency); if (key === "total_amount") return <strong>{money(allocation.total_amount, currency)}</strong>; return allocation.allocation_percent === null ? <span style={mutedValue}>ตามยอดจริง</span> : `${numberValue(allocation.allocation_percent).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`; }
function validateBillingPlanDraft(draft: DraftForm) { for (const installment of draft.installments) { if (!installment.title.trim()) return `กรุณาระบุชื่องวดที่ ${installment.installment_no}`; if (installment.trigger_type === "date" && !installment.due_date) return `กรุณาระบุวันที่ครบกำหนดของงวดที่ ${installment.installment_no}`; if (installment.trigger_type === "case_milestone" && !installment.milestone_code.trim() && !installment.trigger_description.trim()) return `กรุณาระบุเหตุการณ์สำคัญของงวดที่ ${installment.installment_no}`; if (installment.trigger_type === "recurring_period" && (!installment.recurring_period_start || !installment.recurring_period_end || installment.recurring_period_end < installment.recurring_period_start)) return `กรุณาตรวจสอบรอบระยะเวลาของงวดที่ ${installment.installment_no}`; } return ""; }
function billingPlanErrorMessage(value: unknown) { const message = value && typeof value === "object" && "message" in value ? String(value.message) : String(value || ""); if (message.includes("signed, completed, or legacy active")) return "ข้อตกลงค่าบริการไม่อยู่ในสถานะที่อนุญาตให้จัดการแผนเรียกเก็บเงิน"; if (message.includes("totals must match") || message.includes("allocations must exactly match") || message.includes("VAT allocations")) return "ยอดงวดหรือการจัดสรรไม่ตรงกับข้อตกลงค่าบริการ กรุณารีเฟรชและตรวจสอบข้อมูล"; if (message.includes("Only draft billing plans")) return "แผนนี้ไม่ใช่ร่างแล้ว จึงไม่สามารถแก้ไขได้"; if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์จัดการแผนเรียกเก็บเงิน"; return "ไม่สามารถบันทึกแผนเรียกเก็บเงินได้ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง"; }

const page: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24 };
const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, marginBottom: 16 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 };
const navigationToolbar: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, max-content)", alignItems: "center", gap: 8, padding: 8, marginBottom: 18, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" };
const navigationLink: CSSProperties = { boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minWidth: 0, minHeight: 38, padding: "8px 11px", border: "1px solid", borderRadius: 6, fontSize: 14, fontWeight: 650, lineHeight: 1.25, textDecoration: "none", whiteSpace: "nowrap" };
const navigationBackLink: CSSProperties = { background: "#fff", borderColor: "#cbd5e1", color: "#475569" };
const navigationSourceLink: CSSProperties = { background: "#eef2ff", borderColor: "#c7d2fe", color: "#3730a3" };
const warning: CSSProperties = { background: "#fff7ed", color: "#9a3412", padding: 12, borderRadius: 6, marginBottom: 12 };
const success: CSSProperties = { background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 6, marginBottom: 12 };
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
const statusColor: Record<string, CSSProperties> = { draft: { background: "#e5e7eb", color: "#374151" }, active: { background: "#dcfce7", color: "#166534" }, completed: { background: "#dbeafe", color: "#1d4ed8" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, pending: { background: "#e5e7eb", color: "#374151" }, ready_to_invoice: { background: "#fef3c7", color: "#92400e" }, invoiced: { background: "#dbeafe", color: "#1d4ed8" }, sent: { background: "#dbeafe", color: "#1d4ed8" }, accepted: { background: "#dcfce7", color: "#166534" } };
