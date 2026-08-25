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

const numberValue = (value: number | string | null | undefined) => Number(value || 0);
const money = (value: number | string | null | undefined, currency = "THB") => `${numberValue(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const date = (value: string | null | undefined) => value ? value.slice(0, 10) : "-";
const dateTime = (value: string | null | undefined) => value ? value.replace("T", " ").slice(0, 16) : "-";
const text = (value: unknown, fallback = "-") => typeof value === "string" && value.trim() ? value : fallback;
const planStatus: Record<string, string> = { draft: "ร่างแผนเรียกเก็บเงิน", active: "พร้อมดำเนินการเรียกเก็บเงิน", completed: "ดำเนินการครบแล้ว", cancelled: "ยกเลิก" };
const installmentStatus: Record<string, string> = { pending: "รอดำเนินการ", ready_to_invoice: "พร้อมออกใบแจ้งหนี้", invoiced: "ออกใบแจ้งหนี้แล้ว", cancelled: "ยกเลิก" };
const billingMethod: Record<string, string> = { single: "งวดเดียว", installments: "หลายงวด", milestone: "ตามเหตุการณ์สำคัญ", recurring: "เรียกเก็บเป็นรอบ", manual: "กำหนดเอง" };
const triggerType: Record<string, string> = { agreement_effective: "เมื่อข้อตกลงมีผล", date: "ตามวันที่", case_milestone: "ตามเหตุการณ์สำคัญ", manual: "กำหนดด้วยตนเอง", recurring_period: "ตามรอบระยะเวลา" };

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

  return <main style={page}>
    <div style={actions}>
      {agreement ? <Link href={`/finance/fee-agreements/${agreement.id}`}>กลับไปข้อตกลงค่าบริการ</Link> : null}
      {agreement?.source_quotation_id ? <Link href={`/finance/quotations/${agreement.source_quotation_id}`}>เปิดใบเสนอราคาต้นทาง</Link> : null}
    </div>
    {error ? <div style={warning}>{error}</div> : null}
    {message ? <div style={success}>{message}</div> : null}

    <section style={card}>
      <h1>{text(plan.title, "แผนเรียกเก็บเงิน")}</h1>
      {plan.description ? <p style={description}>{plan.description}</p> : null}
      {plan.status === "draft" && canManage ? <div style={editGrid}>
        <label style={label}>ชื่อแผน<input style={input} value={draft.title} disabled={saving || statusSaving} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label style={label}>หมายเหตุแผน<textarea style={{ ...input, minHeight: 76, resize: "vertical" }} value={draft.description} disabled={saving || statusSaving} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      </div> : null}
      <div style={grid}>
        <Field label="สถานะ" value={<StatusBadge status={plan.status} label={planStatus[plan.status] || plan.status} />} />
        <Field label="รูปแบบการเรียกเก็บ" value={billingMethod[plan.billing_method] || plan.billing_method} />
        <Field label="สกุลเงิน" value={plan.currency} />
        <Field label="จำนวนงวด" value={plan.installment_count} />
        <Field label="สร้างเมื่อ" value={date(plan.created_at)} />
        <Field label="แก้ไขล่าสุด" value={date(plan.updated_at)} />
      </div>
    </section>

    {canManage && plan.status === "draft" ? <section style={{ ...card, ...draftActions }}>
      <div><strong>{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "ข้อมูลล่าสุดถูกบันทึกแล้ว"}</strong><p style={actionHelp}>ตรวจสอบกำหนดงวดและยอดจัดสรรให้ครบก่อนยืนยันว่าแผนพร้อมดำเนินการ</p></div>
      <div style={actionButtons}><button type="button" style={secondaryButton} disabled={!dirty || saving || statusSaving} onClick={() => void saveDraft()}>{saving ? "กำลังบันทึก..." : dirty ? "บันทึกการเปลี่ยนแปลง" : "บันทึกแล้ว"}</button><button type="button" style={primaryButton} disabled={dirty || saving || statusSaving} onClick={() => void changePlanStatus("active")}>{statusSaving ? "กำลังดำเนินการ..." : "ยืนยันแผนพร้อมดำเนินการ"}</button><button type="button" style={cancelButton} disabled={saving || statusSaving} onClick={() => void changePlanStatus("cancelled")}>ยกเลิกแผน</button></div>
    </section> : null}
    {canManage && plan.status === "active" ? <section style={{ ...card, ...activeNotice }}><div><strong>แผนพร้อมดำเนินการเรียกเก็บเงิน</strong><p style={actionHelp}>งวดต่าง ๆ ยังไม่ถือว่าออกใบแจ้งหนี้จนกว่าจะดำเนินการในขั้นตอน Invoice</p></div><button type="button" style={cancelButton} disabled={statusSaving} onClick={() => void changePlanStatus("cancelled")}>{statusSaving ? "กำลังดำเนินการ..." : "ยกเลิกแผน"}</button></section> : null}

    <section style={sourceChain}>
      <h2>เส้นทางเอกสารต้นทาง</h2>
      <div style={chainNodes}>
        {agreement?.source_quotation_id ? <><ChainNode title="ใบเสนอราคา" status={text(agreement.source_document_snapshot_json?.status, "")}><Link href={`/finance/quotations/${agreement.source_quotation_id}`}>{quotationNo}</Link></ChainNode><span style={chainArrow} aria-hidden="true">→</span></> : null}
        <ChainNode title="ข้อตกลงค่าบริการ" status={agreement?.status || null} statusText={agreement ? feeAgreementStatusLabel(agreement.status) : undefined}>{agreement ? <Link href={`/finance/fee-agreements/${agreement.id}`}>{text(agreement.agreement_no, agreement.title)}</Link> : <span style={unavailable}>ไม่พบข้อตกลงค่าบริการที่เชื่อมไว้</span>}</ChainNode>
        <span style={chainArrow} aria-hidden="true">→</span>
        <ChainNode title="แผนเรียกเก็บเงิน" status={plan.status} current>{text(plan.title, billingMethod[plan.billing_method] || plan.billing_method)}</ChainNode>
      </div>
    </section>

    <section style={card}>
      <h2>ข้อตกลงค่าบริการอ้างอิง</h2>
      {!agreement ? <div style={warning}>ไม่พบข้อตกลงค่าบริการที่เชื่อมกับแผนนี้</div> : <div style={grid}>
        <Field label="ข้อตกลง" value={<Link href={`/finance/fee-agreements/${agreement.id}`}>{text(agreement.agreement_no, agreement.title)}</Link>} />
        <Field label="สถานะ" value={<StatusBadge status={agreement.status} label={feeAgreementStatusLabel(agreement.status)} />} />
        <Field label="ลูกค้า" value={client} />
        <Field label="เรื่อง/คดี" value={agreement.case_id ? <Link href={`/cases/${agreement.case_id}`}>{matter}</Link> : agreement.advisory_matter_id ? <Link href={`/advisory/${agreement.advisory_matter_id}`}>{matter}</Link> : matter} />
      </div>}
    </section>

    <section style={card}>
      <h2>ยอดรวมตามแผน</h2>
      {totalsMismatch ? <div style={warning}>ยอดรวมของงวดไม่ตรงกับยอดรวมแผน กรุณาตรวจสอบก่อนดำเนินการ</div> : null}
      <div style={grid}>
        <Field label="มูลค่าก่อน VAT" value={money(plan.amount_before_tax, plan.currency)} />
        <Field label="VAT" value={money(plan.vat_amount, plan.currency)} />
        <Field label="ยอดรวม" value={money(plan.total_amount, plan.currency)} />
        <Field label="จำนวนงวด" value={plan.installment_count} />
        <Field label="รูปแบบการเรียกเก็บ" value={billingMethod[plan.billing_method] || plan.billing_method} />
      </div>
    </section>

    <section style={card}>
      <h2>งวดเรียกเก็บเงิน</h2>
      {installments.length === 0 ? <div style={warning}>แผนเรียกเก็บเงินยังไม่มีงวด</div> : null}
      {installments.length !== plan.installment_count ? <div style={warning}>จำนวนงวดที่บันทึกไว้ไม่ตรงกับรายการงวดที่โหลดได้</div> : null}
      {duplicateInstallmentNo ? <div style={warning}>พบเลขงวดซ้ำ กรุณาตรวจสอบก่อนดำเนินการ</div> : null}
      {installments.map((installment) => {
        const installmentAllocations = allocationByInstallment.get(installment.id) || [];
        const draftInstallment = draft.installments.find((row) => row.id === installment.id);
        return <article key={installment.id} style={installmentCard}>
          <div style={installmentHeader}><div><h3>งวดที่ {installment.installment_no}: {installment.title}</h3><p style={description}>{triggerType[installment.trigger_type] || installment.trigger_type}{installment.trigger_description ? ` - ${installment.trigger_description}` : ""}</p></div><StatusBadge status={installment.status} label={installmentStatus[installment.status] || installment.status} /></div>
          {plan.status === "draft" && canManage && draftInstallment ? <div style={installmentEditGrid}>
            <label style={label}>ชื่องวด<input style={input} value={draftInstallment.title} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { title: event.target.value })} /></label>
            <label style={label}>เงื่อนไขเรียกเก็บ<select style={input} value={draftInstallment.trigger_type} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { trigger_type: event.target.value })}><option value="agreement_effective">เมื่อข้อตกลงมีผล</option><option value="date">ตามวันที่</option><option value="case_milestone">ตามเหตุการณ์สำคัญ</option><option value="manual">กำหนดด้วยตนเอง</option><option value="recurring_period">ตามรอบระยะเวลา</option></select></label>
            <label style={label}>รายละเอียดเงื่อนไข<input style={input} value={draftInstallment.trigger_description} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { trigger_description: event.target.value })} /></label>
            <label style={label}>วันที่ครบกำหนด<input style={input} type="date" value={draftInstallment.due_date} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { due_date: event.target.value })} /></label>
            {draftInstallment.trigger_type === "case_milestone" ? <label style={label}>รหัสเหตุการณ์ (ถ้ามี)<input style={input} value={draftInstallment.milestone_code} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { milestone_code: event.target.value })} /></label> : null}
            {draftInstallment.trigger_type === "recurring_period" ? <><label style={label}>เริ่มรอบ<input style={input} type="date" value={draftInstallment.recurring_period_start} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { recurring_period_start: event.target.value })} /></label><label style={label}>สิ้นสุดรอบ<input style={input} type="date" value={draftInstallment.recurring_period_end} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { recurring_period_end: event.target.value })} /></label></> : null}
          </div> : null}
          <div style={grid}>
            <Field label="วันที่ครบกำหนด" value={date(installment.due_date)} />
            <Field label="รหัสเหตุการณ์" value={text(installment.milestone_code)} />
            <Field label="รอบระยะเวลา" value={`${date(installment.recurring_period_start)} / ${date(installment.recurring_period_end)}`} />
            <Field label="มูลค่าก่อน VAT" value={money(installment.amount_before_tax, plan.currency)} />
            <Field label="VAT" value={money(installment.vat_amount, plan.currency)} />
            <Field label="ยอดรวม" value={money(installment.total_amount, plan.currency)} />
            <Field label="พร้อมออกใบแจ้งหนี้เมื่อ" value={dateTime(installment.ready_to_invoice_at)} />
            <Field label="ออกใบแจ้งหนี้เมื่อ" value={dateTime(installment.invoiced_at)} />
            <Field label="ยกเลิกเมื่อ" value={dateTime(installment.cancelled_at)} />
          </div>
          <h4>การจัดสรรรายการค่าบริการ</h4>
          {installmentAllocations.length === 0 ? <div style={warning}>งวดนี้ไม่มีรายการค่าบริการที่จัดสรรไว้</div> : <div style={scroll}><table style={table}><thead><tr><th>รายการตามข้อตกลง</th><th>ก่อน VAT</th><th>VAT</th><th>ยอดรวม</th><th>สัดส่วน</th><th>ลำดับ</th></tr></thead><tbody>{installmentAllocations.map((allocation) => <tr key={allocation.id}><td>{agreementItemById.get(allocation.fee_agreement_item_id) || <span style={unavailable}>ไม่พบรายการค่าบริการต้นทาง</span>}</td><td>{money(allocation.amount_before_tax, plan.currency)}</td><td>{money(allocation.vat_amount, plan.currency)}</td><td>{money(allocation.total_amount, plan.currency)}</td><td>{allocation.allocation_percent === null ? "-" : `${allocation.allocation_percent}%`}</td><td>{allocation.sort_order}</td></tr>)}</tbody></table></div>}
        </article>;
      })}
    </section>
  </main>;
}

function Field({ label, value }: { label: string; value: ReactNode }) { return <div><small style={{ color: "#64748b" }}>{label}</small><div>{value}</div></div>; }
function StatusBadge({ status, label }: { status: string; label: string }) { return <span style={{ ...statusBadge, ...statusColor[status] }}>{label}</span>; }
function ChainNode({ title, status, statusText, current = false, children }: { title: string; status: string | null; statusText?: string; current?: boolean; children: ReactNode }) { return <div style={{ ...chainNode, ...(current ? chainCurrentNode : {}) }}><small style={{ color: "#64748b" }}>{title}</small>{status ? <StatusBadge status={status} label={statusText || planStatus[status] || status} /> : null}<div style={{ marginTop: 6, overflowWrap: "anywhere" }}>{children}</div></div>; }
function billingPlanDraft(plan: BillingPlan, installments: Installment[]): DraftForm { return { title: plan.title || "", description: plan.description || "", installments: installments.map((installment) => ({ id: installment.id, installment_no: installment.installment_no, sort_order: installment.sort_order, title: installment.title, trigger_description: installment.trigger_description || "", trigger_type: installment.trigger_type, due_date: installment.due_date || "", milestone_code: installment.milestone_code || "", recurring_period_start: installment.recurring_period_start || "", recurring_period_end: installment.recurring_period_end || "" })) }; }
function validateBillingPlanDraft(draft: DraftForm) { for (const installment of draft.installments) { if (!installment.title.trim()) return `กรุณาระบุชื่องวดที่ ${installment.installment_no}`; if (installment.trigger_type === "date" && !installment.due_date) return `กรุณาระบุวันที่ครบกำหนดของงวดที่ ${installment.installment_no}`; if (installment.trigger_type === "case_milestone" && !installment.milestone_code.trim() && !installment.trigger_description.trim()) return `กรุณาระบุเหตุการณ์สำคัญของงวดที่ ${installment.installment_no}`; if (installment.trigger_type === "recurring_period" && (!installment.recurring_period_start || !installment.recurring_period_end || installment.recurring_period_end < installment.recurring_period_start)) return `กรุณาตรวจสอบรอบระยะเวลาของงวดที่ ${installment.installment_no}`; } return ""; }
function billingPlanErrorMessage(value: unknown) { const message = value && typeof value === "object" && "message" in value ? String(value.message) : String(value || ""); if (message.includes("signed, completed, or legacy active")) return "ข้อตกลงค่าบริการไม่อยู่ในสถานะที่อนุญาตให้จัดการแผนเรียกเก็บเงิน"; if (message.includes("totals must match") || message.includes("allocations must exactly match") || message.includes("VAT allocations")) return "ยอดงวดหรือการจัดสรรไม่ตรงกับข้อตกลงค่าบริการ กรุณารีเฟรชและตรวจสอบข้อมูล"; if (message.includes("Only draft billing plans")) return "แผนนี้ไม่ใช่ร่างแล้ว จึงไม่สามารถแก้ไขได้"; if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์จัดการแผนเรียกเก็บเงิน"; return "ไม่สามารถบันทึกแผนเรียกเก็บเงินได้ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง"; }

const page: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24 };
const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, marginBottom: 16 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 };
const actions: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 };
const warning: CSSProperties = { background: "#fff7ed", color: "#9a3412", padding: 12, borderRadius: 6, marginBottom: 12 };
const success: CSSProperties = { background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 6, marginBottom: 12 };
const description: CSSProperties = { color: "#64748b", whiteSpace: "pre-wrap" };
const sourceChain: CSSProperties = { borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: "16px 0", marginBottom: 16 };
const chainNodes: CSSProperties = { display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" };
const chainNode: CSSProperties = { flex: "1 1 210px", minWidth: 0, border: "1px solid #e5e7eb", borderRadius: 6, padding: 12, background: "#fff" };
const chainCurrentNode: CSSProperties = { borderColor: "#2563eb", background: "#eff6ff" };
const chainArrow: CSSProperties = { alignSelf: "center", color: "#64748b", fontSize: 20 };
const unavailable: CSSProperties = { color: "#9a3412" };
const installmentCard: CSSProperties = { borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 16 };
const installmentHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" };
const editGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, margin: "16px 0" };
const installmentEditGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, margin: "12px 0 16px", padding: 14, border: "1px solid #dbeafe", borderRadius: 6, background: "#f8fbff" };
const label: CSSProperties = { display: "grid", gap: 6, color: "#334155", fontSize: 13 };
const input: CSSProperties = { boxSizing: "border-box", width: "100%", minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px", background: "#fff", color: "#172033", font: "inherit" };
const draftActions: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, borderColor: "#bfdbfe", background: "#f8fbff" };
const activeNotice: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, borderColor: "#bbf7d0", background: "#f7fff9" };
const actionHelp: CSSProperties = { margin: "4px 0 0", color: "#64748b", fontSize: 13 };
const actionButtons: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const secondaryButton: CSSProperties = { minHeight: 38, padding: "8px 12px", border: "1px solid #94a3b8", borderRadius: 6, background: "#fff", color: "#334155", cursor: "pointer", font: "inherit", fontWeight: 700 };
const primaryButton: CSSProperties = { minHeight: 38, padding: "8px 13px", border: "1px solid #166534", borderRadius: 6, background: "#166534", color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 700 };
const cancelButton: CSSProperties = { minHeight: 38, padding: "8px 12px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#b91c1c", cursor: "pointer", font: "inherit", fontWeight: 700 };
const scroll: CSSProperties = { overflowX: "auto" };
const table: CSSProperties = { width: "100%", minWidth: 760, borderCollapse: "collapse" };
const statusBadge: CSSProperties = { display: "inline-block", marginLeft: 8, padding: "2px 7px", borderRadius: 999, fontSize: 12 };
const statusColor: Record<string, CSSProperties> = { draft: { background: "#e5e7eb", color: "#374151" }, active: { background: "#dcfce7", color: "#166534" }, completed: { background: "#dbeafe", color: "#1d4ed8" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, pending: { background: "#e5e7eb", color: "#374151" }, ready_to_invoice: { background: "#fef3c7", color: "#92400e" }, invoiced: { background: "#dbeafe", color: "#1d4ed8" }, sent: { background: "#dbeafe", color: "#1d4ed8" }, accepted: { background: "#dcfce7", color: "#166534" } };
