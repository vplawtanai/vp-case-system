"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";

type Json = Record<string, unknown>;
type BillingPlan = { id: string; fee_agreement_id: string; status: string; billing_method: string; currency: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; title: string | null; description: string | null; installment_count: number; created_at: string; updated_at: string };
type FeeAgreement = { id: string; agreement_no: string | null; title: string; client_id: string; case_id: number | null; advisory_matter_id: string | null; source_quotation_id: string | null; source_reference: string | null; status: string; client_snapshot_json: Json | null; matter_snapshot_json: Json | null; source_document_snapshot_json: Json | null };
type Installment = { id: string; installment_no: number; sort_order: number; title: string; trigger_description: string | null; trigger_type: string; due_date: string | null; milestone_code: string | null; recurring_period_start: string | null; recurring_period_end: string | null; status: string; ready_to_invoice_at: string | null; invoiced_at: string | null; cancelled_at: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; created_at: string };
type Allocation = { id: string; billing_installment_id: string; fee_agreement_item_id: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; allocation_percent: number | string | null; sort_order: number; created_at: string };
type AgreementItem = { id: string; description: string };

const numberValue = (value: number | string | null | undefined) => Number(value || 0);
const money = (value: number | string | null | undefined, currency = "THB") => `${numberValue(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const date = (value: string | null | undefined) => value ? value.slice(0, 10) : "-";
const dateTime = (value: string | null | undefined) => value ? value.replace("T", " ").slice(0, 16) : "-";
const text = (value: unknown, fallback = "-") => typeof value === "string" && value.trim() ? value : fallback;
const planStatus: Record<string, string> = { draft: "Draft / ร่าง", active: "Active / มีผลใช้งาน", completed: "Completed / เสร็จสมบูรณ์", cancelled: "Cancelled / ยกเลิก" };
const installmentStatus: Record<string, string> = { pending: "Pending / รอดำเนินการ", ready_to_invoice: "Ready to Invoice / พร้อมออกใบแจ้งหนี้", invoiced: "Invoiced / ออกใบแจ้งหนี้แล้ว", cancelled: "Cancelled / ยกเลิก" };
const billingMethod: Record<string, string> = { single: "งวดเดียว", installments: "หลายงวด", milestone: "ตามเหตุการณ์สำคัญ", recurring: "เรียกเก็บเป็นรอบ", manual: "กำหนดเอง" };
const triggerType: Record<string, string> = { agreement_effective: "เมื่อข้อตกลงมีผล", date: "ตามวันที่", case_milestone: "ตามเหตุการณ์สำคัญ", manual: "กำหนดด้วยตนเอง", recurring_period: "ตามรอบระยะเวลา" };

export default function BillingPlanDetailPage() {
  return <QuotationGuard>{() => <BillingPlanDetail />}</QuotationGuard>;
}

function BillingPlanDetail() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [agreement, setAgreement] = useState<FeeAgreement | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const planResult = await supabase
      .from("finance_billing_plans")
      .select("id,fee_agreement_id,status,billing_method,currency,amount_before_tax,vat_amount,total_amount,title,description,installment_count,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();

    if (planResult.error) {
      setError("Unable to load Billing Plan.");
      setLoading(false);
      return;
    }
    if (!planResult.data) {
      setError("Billing Plan not found.");
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
        .select("id,billing_installment_id,fee_agreement_item_id,amount_before_tax,vat_amount,total_amount,allocation_percent,sort_order,created_at")
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
      setError("Some Billing Plan details could not be loaded.");
    }
    setAgreement((agreementResult.data || null) as FeeAgreement | null);
    setInstallments(installmentRows);
    setAllocations(allocationRows);
    setAgreementItems((agreementItemsResult.data || []) as AgreementItem[]);
    setLoading(false);
  }, [id]);

  // This effect initializes local read-only state from the remote Supabase queries.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

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
  if (loading) return <main style={page}>Loading Billing Plan...</main>;
  if (!plan) return <main style={page}>{error || "Billing Plan not found."}</main>;

  const client = text(agreement?.client_snapshot_json?.name, text(agreement?.client_snapshot_json?.display_name, "-"));
  const matter = text(agreement?.matter_snapshot_json?.title, text(agreement?.matter_snapshot_json?.file_no, agreement?.case_id || agreement?.advisory_matter_id ? "-" : "Client-level agreement"));
  const quotationNo = text(agreement?.source_document_snapshot_json?.quotation_no, text(agreement?.source_reference, "Source quotation"));
  const allocationByInstallment = new Map<string, Allocation[]>();
  allocations.forEach((allocation) => allocationByInstallment.set(allocation.billing_installment_id, [...(allocationByInstallment.get(allocation.billing_installment_id) || []), allocation]));
  const agreementItemById = new Map(agreementItems.map((item) => [item.id, item.description]));

  return <main style={page}>
    <div style={actions}>
      {agreement ? <Link href={`/finance/fee-agreements/${agreement.id}`}>Back to Fee Agreement</Link> : null}
      {agreement?.source_quotation_id ? <Link href={`/finance/quotations/${agreement.source_quotation_id}`}>Open Source Quotation</Link> : null}
    </div>
    {error ? <div style={warning}>{error}</div> : null}

    <section style={card}>
      <h1>{text(plan.title, "Billing Plan")}</h1>
      {plan.description ? <p style={description}>{plan.description}</p> : null}
      <div style={grid}>
        <Field label="Status" value={<StatusBadge status={plan.status} label={planStatus[plan.status] || plan.status} />} />
        <Field label="Billing Method" value={billingMethod[plan.billing_method] || plan.billing_method} />
        <Field label="Currency" value={plan.currency} />
        <Field label="Installment Count" value={plan.installment_count} />
        <Field label="Created" value={date(plan.created_at)} />
        <Field label="Updated" value={date(plan.updated_at)} />
      </div>
    </section>

    <section style={sourceChain}>
      <h2>Source Chain</h2>
      <div style={chainNodes}>
        {agreement?.source_quotation_id ? <><ChainNode title="Quotation" status={text(agreement.source_document_snapshot_json?.status, "")}><Link href={`/finance/quotations/${agreement.source_quotation_id}`}>{quotationNo}</Link></ChainNode><span style={chainArrow} aria-hidden="true">→</span></> : null}
        <ChainNode title="Fee Agreement" status={agreement?.status || null}>{agreement ? <Link href={`/finance/fee-agreements/${agreement.id}`}>{text(agreement.agreement_no, agreement.title)}</Link> : <span style={unavailable}>Linked Fee Agreement unavailable</span>}</ChainNode>
        <span style={chainArrow} aria-hidden="true">→</span>
        <ChainNode title="Billing Plan" status={plan.status} current>{text(plan.title, billingMethod[plan.billing_method] || plan.billing_method)}</ChainNode>
      </div>
    </section>

    <section style={card}>
      <h2>Fee Agreement Reference</h2>
      {!agreement ? <div style={warning}>Integrity warning: linked Fee Agreement is unavailable.</div> : <div style={grid}>
        <Field label="Agreement" value={<Link href={`/finance/fee-agreements/${agreement.id}`}>{text(agreement.agreement_no, agreement.title)}</Link>} />
        <Field label="Status" value={<StatusBadge status={agreement.status} label={planStatus[agreement.status] || agreement.status} />} />
        <Field label="Client" value={client} />
        <Field label="Matter" value={agreement.case_id ? <Link href={`/cases/${agreement.case_id}`}>{matter}</Link> : agreement.advisory_matter_id ? <Link href={`/advisory/${agreement.advisory_matter_id}`}>{matter}</Link> : matter} />
      </div>}
    </section>

    <section style={card}>
      <h2>Plan Totals</h2>
      {totalsMismatch ? <div style={warning}>Integrity warning: installment sums do not match stored Billing Plan totals.</div> : null}
      <div style={grid}>
        <Field label="Amount before VAT" value={money(plan.amount_before_tax, plan.currency)} />
        <Field label="VAT" value={money(plan.vat_amount, plan.currency)} />
        <Field label="Total" value={money(plan.total_amount, plan.currency)} />
        <Field label="Installment Count" value={plan.installment_count} />
        <Field label="Billing Method" value={billingMethod[plan.billing_method] || plan.billing_method} />
      </div>
    </section>

    <section style={card}>
      <h2>Installments</h2>
      {installments.length === 0 ? <div style={warning}>Integrity warning: Billing Plan has no installments.</div> : null}
      {installments.length !== plan.installment_count ? <div style={warning}>Integrity warning: stored installment count does not match the loaded installments.</div> : null}
      {duplicateInstallmentNo ? <div style={warning}>Integrity warning: duplicate installment numbers detected.</div> : null}
      {installments.map((installment) => {
        const installmentAllocations = allocationByInstallment.get(installment.id) || [];
        return <article key={installment.id} style={installmentCard}>
          <div style={installmentHeader}><div><h3>Installment {installment.installment_no}: {installment.title}</h3><p style={description}>{triggerType[installment.trigger_type] || installment.trigger_type}{installment.trigger_description ? ` - ${installment.trigger_description}` : ""}</p></div><StatusBadge status={installment.status} label={installmentStatus[installment.status] || installment.status} /></div>
          <div style={grid}>
            <Field label="Due Date" value={date(installment.due_date)} />
            <Field label="Milestone Code" value={text(installment.milestone_code)} />
            <Field label="Recurring Period" value={`${date(installment.recurring_period_start)} / ${date(installment.recurring_period_end)}`} />
            <Field label="Amount before VAT" value={money(installment.amount_before_tax, plan.currency)} />
            <Field label="VAT" value={money(installment.vat_amount, plan.currency)} />
            <Field label="Total" value={money(installment.total_amount, plan.currency)} />
            <Field label="Ready to Invoice" value={dateTime(installment.ready_to_invoice_at)} />
            <Field label="Invoiced" value={dateTime(installment.invoiced_at)} />
            <Field label="Cancelled" value={dateTime(installment.cancelled_at)} />
          </div>
          <h4>Item Allocations</h4>
          {installmentAllocations.length === 0 ? <div style={warning}>Integrity warning: installment has no allocation items.</div> : <div style={scroll}><table style={table}><thead><tr><th>Source Fee Agreement Item</th><th>Before VAT</th><th>VAT</th><th>Total</th><th>Allocation %</th><th>Sort Order</th></tr></thead><tbody>{installmentAllocations.map((allocation) => <tr key={allocation.id}><td>{agreementItemById.get(allocation.fee_agreement_item_id) || <span style={unavailable}>Source agreement item unavailable</span>}</td><td>{money(allocation.amount_before_tax, plan.currency)}</td><td>{money(allocation.vat_amount, plan.currency)}</td><td>{money(allocation.total_amount, plan.currency)}</td><td>{allocation.allocation_percent === null ? "-" : `${allocation.allocation_percent}%`}</td><td>{allocation.sort_order}</td></tr>)}</tbody></table></div>}
        </article>;
      })}
    </section>
  </main>;
}

function Field({ label, value }: { label: string; value: ReactNode }) { return <div><small style={{ color: "#64748b" }}>{label}</small><div>{value}</div></div>; }
function StatusBadge({ status, label }: { status: string; label: string }) { return <span style={{ ...statusBadge, ...statusColor[status] }}>{label}</span>; }
function ChainNode({ title, status, current = false, children }: { title: string; status: string | null; current?: boolean; children: ReactNode }) { return <div style={{ ...chainNode, ...(current ? chainCurrentNode : {}) }}><small style={{ color: "#64748b" }}>{title}</small>{status ? <StatusBadge status={status} label={planStatus[status] || status} /> : null}<div style={{ marginTop: 6, overflowWrap: "anywhere" }}>{children}</div></div>; }

const page: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24 };
const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, marginBottom: 16 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 };
const actions: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 };
const warning: CSSProperties = { background: "#fff7ed", color: "#9a3412", padding: 12, borderRadius: 6, marginBottom: 12 };
const description: CSSProperties = { color: "#64748b", whiteSpace: "pre-wrap" };
const sourceChain: CSSProperties = { borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: "16px 0", marginBottom: 16 };
const chainNodes: CSSProperties = { display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" };
const chainNode: CSSProperties = { flex: "1 1 210px", minWidth: 0, border: "1px solid #e5e7eb", borderRadius: 6, padding: 12, background: "#fff" };
const chainCurrentNode: CSSProperties = { borderColor: "#2563eb", background: "#eff6ff" };
const chainArrow: CSSProperties = { alignSelf: "center", color: "#64748b", fontSize: 20 };
const unavailable: CSSProperties = { color: "#9a3412" };
const installmentCard: CSSProperties = { borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 16 };
const installmentHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" };
const scroll: CSSProperties = { overflowX: "auto" };
const table: CSSProperties = { width: "100%", minWidth: 760, borderCollapse: "collapse" };
const statusBadge: CSSProperties = { display: "inline-block", marginLeft: 8, padding: "2px 7px", borderRadius: 999, fontSize: 12 };
const statusColor: Record<string, CSSProperties> = { draft: { background: "#e5e7eb", color: "#374151" }, active: { background: "#dcfce7", color: "#166534" }, completed: { background: "#dbeafe", color: "#1d4ed8" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, pending: { background: "#e5e7eb", color: "#374151" }, ready_to_invoice: { background: "#fef3c7", color: "#92400e" }, invoiced: { background: "#dbeafe", color: "#1d4ed8" }, sent: { background: "#dbeafe", color: "#1d4ed8" }, accepted: { background: "#dcfce7", color: "#166534" } };
