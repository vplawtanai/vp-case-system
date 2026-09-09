"use client";
import { useI18n } from "../../../../lib/i18n/provider";
import { translate } from "../../../../lib/i18n/catalog";
import { uiMessage, uiDate, type UiMessage, type UiLocale } from "../../../../lib/i18n/core";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import DetailModal from "../../../components/DetailModal";
import BillableChargeCreateWorkflow, { type BillableChargeContext } from "../../billable-charges/BillableChargeCreateWorkflow";
import { billableChargeNatureLabel, clientCostFundingModeLabel, type ClientCostFundingMode } from "../../billable-charges/funding-semantics";
import { billingPlanReadyChargeCompletionState, canAddChargeFromInstallment, currentChargeOverviewRows, filterChargesForBillingContext, filterSelectableReadyCharges, partitionChargesByWorkflow, summarizeReadyCharges, type BillingChargeContext } from "../charge-context";
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
type RelatedCharge = { id: string; client_id: string; case_id: number | null; advisory_matter_id: string | null; source_type: string; client_cost_funding_mode: ClientCostFundingMode | null; description: string | null; service_date: string | null; economic_classification: string | null; price_tax_mode: string; vat_rate: number | string; amount_before_vat: number | string; vat_amount: number | string; total_amount: number | string; currency: string; status: string; source_reference: string | null; created_at: string; ready_to_invoice_at: string | null };
type ChargeInvoiceLink = { invoiceId: string; invoiceNo: string | null; allocationStatus: string };
type DraftInstallment = { id: string; installment_no: number; sort_order: number; title: string; trigger_description: string; trigger_type: string; due_date: string; milestone_code: string; recurring_period_start: string; recurring_period_end: string };
type DraftForm = { title: string; description: string; installments: DraftInstallment[] };
type ReadinessForm = { eventDate: string; confirmed: boolean; note: string; reference: string };
type ReadinessErrors = Partial<Record<"eventDate" | "confirmed", UiMessage>>;
type AllocationColumnKey = "description" | "amount_before_tax" | "vat_amount" | "total_amount" | "allocation_percent";

const numberValue = (value: number | string | null | undefined) => Number(value || 0);
const money = (value: number | string | null | undefined, currency = "THB") => `${numberValue(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const date = (value: string | null | undefined, locale: UiLocale = "th") => uiDate(value, locale);
const dateTime = (value: string | null | undefined, locale: UiLocale = "th") => uiDate(value, locale, true);
const text = (value: unknown, fallback = "-") => typeof value === "string" && value.trim() ? value : fallback;
function billingPlanUiLabels(locale: UiLocale) {
const planStatus: Record<string, string> = { draft: translate(locale, "finance.billingPlan.status.draft"), active: translate(locale, "finance.billingPlan.status.active"), completed: translate(locale, "finance.billingPlan.status.completed"), cancelled: translate(locale, "finance.payment.ui.cancel") };
const installmentStatus: Record<string, string> = { pending: translate(locale, "finance.invoice.installment.pending"), ready_to_invoice: translate(locale, "finance.invoice.ui.readyToInvoice"), invoiced: translate(locale, "finance.payment.ui.invoiceIssued"), cancelled: translate(locale, "finance.payment.ui.cancel") };
const billingMethod: Record<string, string> = { single: translate(locale, "finance.billingPlan.method.single"), installments: translate(locale, "finance.billingPlan.method.installments"), milestone: translate(locale, "finance.invoice.trigger.case_milestone"), recurring: translate(locale, "finance.billingPlan.method.recurring"), manual: translate(locale, "finance.billingPlan.method.manual") };
const triggerType: Record<string, string> = { agreement_effective: translate(locale, "finance.billingPlan.trigger.agreementEffective"), date: translate(locale, "finance.invoice.trigger.date"), case_milestone: translate(locale, "finance.invoice.trigger.case_milestone"), manual: translate(locale, "finance.invoice.trigger.manual"), recurring_period: translate(locale, "finance.invoice.trigger.recurring_period") };
const invoiceStatus: Record<string, string> = { draft: translate(locale, "finance.invoice.ui.draftTitle"), issued: translate(locale, "finance.payment.ui.invoiceIssued"), cancelled: translate(locale, "finance.taxInvoice.ui.statusCancelled"), voided: translate(locale, "finance.payment.ui.invoiceVoided") };
const allocationColumns: Array<{ key: AllocationColumnKey; label: string; width: string; numeric?: boolean }> = [
  { key: "description", label: translate(locale, "finance.billingPlan.allocation.item"), width: "40%" },
  { key: "amount_before_tax", label: translate(locale, "finance.taxInvoice.ui.beforeVat"), width: "17%", numeric: true },
  { key: "vat_amount", label: "VAT", width: "13%", numeric: true },
  { key: "total_amount", label: translate(locale, "finance.invoice.ui.total"), width: "17%", numeric: true },
  { key: "allocation_percent", label: translate(locale, "finance.billingPlan.allocation.share"), width: "13%", numeric: true },
];
return { planStatus, installmentStatus, billingMethod, triggerType, invoiceStatus, allocationColumns };
}

export default function BillingPlanDetailPage() {
  const { t } = useI18n();
  return <Suspense fallback={<main style={page}>{t("finance.billingPlan.loading")}</main>}><QuotationGuard>{(access) => <BillingPlanDetail
    canManage={access.permissions.canEditFinanceQuotation}
    canComposeInstallment={access.permissions.canEditFinanceQuotation && access.permissions.canManageFinanceBillableCharges && access.permissions.canApproveFinanceBillableCharges}
    canViewCharges={access.permissions.canViewFinanceBillableCharges}
    canManageCharges={access.permissions.canManageFinanceBillableCharges}
  />}</QuotationGuard></Suspense>;
}

function BillingPlanDetail({ canManage, canComposeInstallment, canViewCharges, canManageCharges }: { canManage: boolean; canComposeInstallment: boolean; canViewCharges: boolean; canManageCharges: boolean }) {
  const { t, text: uiText, locale } = useI18n();
  const { planStatus, installmentStatus, billingMethod, triggerType, invoiceStatus, allocationColumns } = billingPlanUiLabels(locale);
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [agreement, setAgreement] = useState<FeeAgreement | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [relatedChargeCandidates, setRelatedChargeCandidates] = useState<RelatedCharge[]>([]);
  const [chargeInvoiceLinks, setChargeInvoiceLinks] = useState<Record<string, ChargeInvoiceLink>>({});
  const [relatedChargeId, setRelatedChargeId] = useState("");
  const [readyChargeListInstallmentId, setReadyChargeListInstallmentId] = useState("");
  const [invoiceSelectionInstallmentId, setInvoiceSelectionInstallmentId] = useState("");
  const [selectedInvoiceChargeIds, setSelectedInvoiceChargeIds] = useState<string[]>([]);
  const [selectionDetailChargeId, setSelectionDetailChargeId] = useState("");
  const [chargeCreateInstallmentId, setChargeCreateInstallmentId] = useState("");
  const [expandCurrentCharges, setExpandCurrentCharges] = useState(false);
  const [draft, setDraft] = useState<DraftForm>({ title: "", description: "", installments: [] });
  const [savedBaseline, setSavedBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [installmentActionId, setInstallmentActionId] = useState<string | null>(null);
  const [readinessInstallmentId, setReadinessInstallmentId] = useState<string | null>(null);
  const [readinessForm, setReadinessForm] = useState<ReadinessForm>({ eventDate: "", confirmed: false, note: "", reference: "" });
  const [readinessErrors, setReadinessErrors] = useState<ReadinessErrors>({});
  const [readinessSummaryError, setReadinessSummaryError] = useState<UiMessage | string>("");
  const [message, setMessage] = useState<UiMessage | string>("");
  const [error, setError] = useState<UiMessage | string>("");
  const saveLock = useRef(false);
  const statusLock = useRef(false);
  const installmentActionLock = useRef(false);
  const readinessPanelRef = useRef<HTMLDivElement>(null);
  const readinessDateRef = useRef<HTMLInputElement>(null);
  const readinessConfirmationRef = useRef<HTMLInputElement>(null);
  const resumeHandledRef = useRef(false);

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
      setError(uiMessage("finance.billingPlan.loadFailed"));
      setLoading(false);
      return;
    }
    if (!planResult.data) {
      setError(uiMessage("finance.billingPlan.notFound"));
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

    const agreementRow = (agreementResult.data || null) as FeeAgreement | null;
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

    let relatedChargesResult: { data: unknown[] | null; error: unknown } = { data: [], error: null };
    if (canViewCharges && agreementRow) {
      relatedChargesResult = await supabase
        .from("finance_billable_charges")
        .select("id,client_id,case_id,advisory_matter_id,source_type,client_cost_funding_mode,description,service_date,economic_classification,price_tax_mode,vat_rate,amount_before_vat,vat_amount,total_amount,currency,status,source_reference,created_at,ready_to_invoice_at")
        .eq("client_id", agreementRow.client_id)
        .eq("currency", planRow.currency)
        .neq("source_type", "billing_installment_item")
        .in("status", ["draft", "ready_to_invoice", "reserved", "invoiced", "cancelled"])
        .order("service_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    }

    const loadedRelatedCharges = (relatedChargesResult.data || []) as RelatedCharge[];
    const relatedChargeIds = loadedRelatedCharges.map((charge) => charge.id);
    const chargeAllocationsResult = relatedChargeIds.length
      ? await supabase
        .from("finance_invoice_charge_allocations")
        .select("id,billable_charge_id,invoice_id,status,created_at")
        .in("billable_charge_id", relatedChargeIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
      : { data: [], error: null };
    const chargeAllocationRows = (chargeAllocationsResult.data || []) as Array<{ id: string; billable_charge_id: string; invoice_id: string; status: string; created_at: string }>;
    const chargeInvoiceIds = [...new Set(chargeAllocationRows.map((allocation) => allocation.invoice_id))];
    const chargeInvoicesResult = chargeInvoiceIds.length
      ? await supabase
        .from("finance_invoices")
        .select("id,invoice_no")
        .in("id", chargeInvoiceIds)
      : { data: [], error: null };

    if (agreementResult.error || installmentsResult.error || allocationsResult.error || agreementItemsResult.error || invoicesResult.error || relatedChargesResult.error || chargeAllocationsResult.error || chargeInvoicesResult.error) {
      setError(uiMessage("finance.billingPlan.partialLoad"));
    }
    setAgreement(agreementRow);
    setInstallments(installmentRows);
    setAllocations(allocationRows);
    setAgreementItems((agreementItemsResult.data || []) as AgreementItem[]);
    setInvoices((invoicesResult.data || []) as InvoiceSummary[]);
    setRelatedChargeCandidates(loadedRelatedCharges);
    const chargeInvoiceRows = (chargeInvoicesResult.data || []) as Array<{ id: string; invoice_no: string | null }>;
    const chargeInvoicesById = new Map(chargeInvoiceRows.map((invoice) => [invoice.id, invoice]));
    setChargeInvoiceLinks(chargeAllocationRows.reduce<Record<string, ChargeInvoiceLink>>((links, allocation) => {
      if (links[allocation.billable_charge_id]) return links;
      const invoice = chargeInvoicesById.get(allocation.invoice_id);
      if (!invoice) return links;
      links[allocation.billable_charge_id] = {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoice_no,
        allocationStatus: allocation.status,
      };
      return links;
    }, {}));
    setRelatedChargeId("");
    setReadyChargeListInstallmentId("");
    setSelectionDetailChargeId("");
    const nextDraft = billingPlanDraft(planRow, installmentRows);
    setDraft(nextDraft);
    setSavedBaseline(JSON.stringify(nextDraft));
    setLoading(false);
  }, [canViewCharges, id]);

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
      setMessage(uiMessage("finance.billingPlan.saved"));
    } catch (saveError) {
      console.error("Failed to save Billing Plan draft", saveError);
      setError(billingPlanErrorMessage(saveError));
    } finally {
      saveLock.current = false; setSaving(false);
    }
  };
  const changePlanStatus = async (nextStatus: "active" | "cancelled") => {
    if (!plan || !canManage || statusLock.current) return;
    if (dirty) { setError(uiMessage("finance.billingPlan.saveBeforeStatus")); return; }
    const confirmation = nextStatus === "active"
      ? t("finance.billingPlan.activateConfirm")
      : t("finance.billingPlan.cancelConfirm");
    if (!window.confirm(confirmation)) return;
    statusLock.current = true; setStatusSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("set_finance_billing_plan_status", { p_billing_plan_id: plan.id, p_next_status: nextStatus });
      if (result.error) throw result.error;
      await load();
      setMessage(nextStatus === "active" ? uiMessage("finance.billingPlan.activated") : uiMessage("finance.billingPlan.cancelled"));
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
    if (!readinessForm.eventDate) nextErrors.eventDate = uiMessage("finance.billingPlan.error.readinessDate");
    else if (readinessForm.eventDate > bangkokToday()) nextErrors.eventDate = uiMessage("finance.billingPlan.error.futureDate");
    if (!readinessForm.confirmed) nextErrors.confirmed = uiMessage("finance.billingPlan.error.readinessConfirmed");
    if (Object.keys(nextErrors).length) {
      setReadinessErrors(nextErrors);
      setReadinessSummaryError(uiMessage("finance.billingPlan.error.readinessSummary"));
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
      setMessage(uiMessage("finance.billingPlan.installmentReady", { number: installment.installment_no }));
    } catch (readinessError) {
      console.error("Failed to confirm Billing Installment readiness", readinessError);
      setReadinessSummaryError(billingReadinessErrorMessage(readinessError));
    } finally {
      installmentActionLock.current = false; setInstallmentActionId(null);
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
  const relatedChargeContext = useMemo<BillingChargeContext | null>(() => agreement ? {
    clientId: agreement.client_id,
    currency: plan?.currency || "",
    caseId: agreement.case_id,
    advisoryMatterId: agreement.advisory_matter_id,
  } : null, [agreement, plan?.currency]);
  const relatedCharges = useMemo(() => filterChargesForBillingContext(relatedChargeCandidates, relatedChargeContext), [relatedChargeCandidates, relatedChargeContext]);
  const chargeWorkflow = useMemo(() => partitionChargesByWorkflow(relatedCharges), [relatedCharges]);
  const relatedCharge = useMemo(() => relatedCharges.find((charge) => charge.id === relatedChargeId) || null, [relatedChargeId, relatedCharges]);
  const compatibleReadyCharges = useMemo(() => filterSelectableReadyCharges(chargeWorkflow.current), [chargeWorkflow]);
  const hasReadyChargePreview = useMemo(() => compatibleReadyCharges.length > 0 && plan?.status === "active" && installments.some((installment) => installment.status === "ready_to_invoice" && !invoices.some((invoice) => invoice.primary_billing_installment_id === installment.id)), [compatibleReadyCharges.length, installments, invoices, plan?.status]);
  const currentChargesForOverview = useMemo(() => currentChargeOverviewRows(chargeWorkflow.current, hasReadyChargePreview), [chargeWorkflow, hasReadyChargePreview]);
  const invoiceSelectionInstallment = useMemo(() => installments.find((installment) => installment.id === invoiceSelectionInstallmentId) || null, [installments, invoiceSelectionInstallmentId]);
  const readyChargeListInstallment = useMemo(() => installments.find((installment) => installment.id === readyChargeListInstallmentId) || null, [installments, readyChargeListInstallmentId]);
  const selectedInvoiceCharges = useMemo(() => compatibleReadyCharges.filter((charge) => selectedInvoiceChargeIds.includes(charge.id)), [compatibleReadyCharges, selectedInvoiceChargeIds]);
  const selectionDetailCharge = useMemo(() => compatibleReadyCharges.find((charge) => charge.id === selectionDetailChargeId) || null, [compatibleReadyCharges, selectionDetailChargeId]);
  const selectionTotals = useMemo(() => selectedInvoiceCharges.reduce((sum, charge) => ({ before: sum.before + numberValue(charge.amount_before_vat), vat: sum.vat + numberValue(charge.vat_amount), total: sum.total + numberValue(charge.total_amount) }), { before: numberValue(invoiceSelectionInstallment?.amount_before_tax), vat: numberValue(invoiceSelectionInstallment?.vat_amount), total: numberValue(invoiceSelectionInstallment?.total_amount) }), [invoiceSelectionInstallment, selectedInvoiceCharges]);
  const openInvoiceSelection = useCallback((installment: Installment) => {
    if (!canComposeInstallment || plan?.status !== "active" || installment.status !== "ready_to_invoice") return;
    const installmentInvoices = invoices.filter((invoice) => invoice.primary_billing_installment_id === installment.id);
    if (installmentInvoices.length) return;
    setInvoiceSelectionInstallmentId(installment.id);
    setReadyChargeListInstallmentId("");
    setSelectedInvoiceChargeIds([]);
    setSelectionDetailChargeId("");
  }, [canComposeInstallment, invoices, plan?.status]);
  const closeInvoiceSelection = useCallback(() => {
    setInvoiceSelectionInstallmentId("");
    setSelectedInvoiceChargeIds([]);
    setSelectionDetailChargeId("");
  }, []);
  const openChargeCreate = useCallback((installment: Installment) => {
    const hasActiveInvoice = invoices.some((invoice) => invoice.primary_billing_installment_id === installment.id && !["cancelled", "voided"].includes(invoice.document_status));
    if (!agreement || !canAddChargeFromInstallment({ canManageCharges, planStatus: plan?.status || "", installmentStatus: installment.status, hasActiveInvoice })) return;
    setInvoiceSelectionInstallmentId("");
    setSelectedInvoiceChargeIds([]);
    setSelectionDetailChargeId("");
    setChargeCreateInstallmentId(installment.id);
  }, [agreement, canManageCharges, invoices, plan?.status]);
  const closeChargeCreate = useCallback(() => {
    setChargeCreateInstallmentId("");
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || resumeHandledRef.current) return;
    const requestedInstallmentId = searchParams.get("resumeInvoiceForInstallment") || "";
    const requestedChargeIds = [...new Set(searchParams.getAll("resumeCharge"))];
    if (!requestedInstallmentId) return;
    resumeHandledRef.current = true;
    if (!isUuid(requestedInstallmentId)) {
      setError(uiMessage("finance.billingPlan.error.resumeLink"));
      return;
    }
    const installment = installments.find((row) => row.id === requestedInstallmentId);
    if (!installment || plan?.status !== "active" || installment.status !== "ready_to_invoice" || invoices.some((invoice) => invoice.primary_billing_installment_id === installment.id)) {
      setError(uiMessage("finance.billingPlan.error.resumeStatus"));
      return;
    }
    if (!canComposeInstallment) {
      setError(uiMessage("finance.billingPlan.error.composePermission"));
      return;
    }
    openInvoiceSelection(installment);
    setSelectedInvoiceChargeIds(requestedChargeIds.filter((chargeId) => compatibleReadyCharges.some((charge) => charge.id === chargeId)));
  }, [canComposeInstallment, compatibleReadyCharges, installments, invoices, loading, openInvoiceSelection, plan?.status, searchParams]);
  if (loading) return <main style={page}>{t("finance.billingPlan.loading")}</main>;
  if (!plan) return <main style={page}>{error ? uiText(error) : t("finance.billingPlan.notFound")}</main>;

  const client = text(agreement?.client_snapshot_json?.name, text(agreement?.client_snapshot_json?.display_name, "-"));
  const matter = text(agreement?.matter_snapshot_json?.title, text(agreement?.matter_snapshot_json?.file_no, agreement?.case_id || agreement?.advisory_matter_id ? "-" : t("finance.billingPlan.clientEngagement")));
  const chargeCreateInstallment = installments.find((installment) => installment.id === chargeCreateInstallmentId) || null;
  const billableChargeContext: BillableChargeContext | null = agreement ? {
    clientId: agreement.client_id,
    clientName: client,
    caseId: agreement.case_id,
    advisoryMatterId: agreement.advisory_matter_id,
    matterLabel: agreement.case_id ? t("finance.billingPlan.caseContext", { label: matter }) : agreement.advisory_matter_id ? t("finance.billingPlan.advisoryContext", { label: matter }) : t("finance.invoice.composer.generalContext"),
    entryPointLabel: chargeCreateInstallment ? t("finance.billingPlan.fromInstallment", { number: chargeCreateInstallment.installment_no }) : undefined,
  } : null;
  const quotationNo = text(agreement?.source_document_snapshot_json?.quotation_no, text(agreement?.source_reference, t("finance.invoice.sourceQuotation")));
  const acceptedQuotationBasis = agreement?.engagement_basis === "accepted_quotation";
  const engagementKindLabel = acceptedQuotationBasis ? t("finance.invoice.ui.quotationEngagement") : t("finance.invoice.ui.feeAgreement");
  const engagementReference = agreement ? acceptedQuotationBasis ? quotationNo : text(agreement.agreement_no, agreement.title) : "-";
  const allocationByInstallment = new Map<string, Allocation[]>();
  allocations.forEach((allocation) => allocationByInstallment.set(allocation.billing_installment_id, [...(allocationByInstallment.get(allocation.billing_installment_id) || []), allocation]));
  const agreementItemById = new Map(agreementItems.map((item) => [item.id, item.description]));
  return <main className="billing-plan-page" style={page}>
    {agreement ? <nav className="billing-plan-navigation-toolbar" style={navigationToolbar} aria-label={t("finance.invoice.ui.relatedNavigation")}>
      <Link className="billing-plan-navigation-link billing-plan-navigation-back" style={{ ...navigationLink, ...navigationBackLink }} href={`/finance/fee-agreements/${agreement.id}`}><NavigationIcon name="back" /><span>{acceptedQuotationBasis ? t("finance.billingPlan.backToEngagement") : t("finance.billingPlan.backToAgreement")}</span></Link>
      {agreement?.source_quotation_id ? <Link className="billing-plan-navigation-link billing-plan-navigation-source" style={{ ...navigationLink, ...navigationSourceLink }} href={`/finance/quotations/${agreement.source_quotation_id}`}><NavigationIcon name="source" /><span>{t("finance.invoice.ui.openQuotation")}</span></Link> : null}
    </nav> : null}
    {error ? <div style={warning}>{uiText(error)}</div> : null}
    {message ? <div style={success}>{uiText(message)}</div> : null}

    <section style={{ ...card, ...planHeaderCard }}>
      <div className="billing-plan-identity-header" style={planIdentityHeader}>
        <div style={planIdentityCopy}><span style={planEyebrow}>{t("finance.billingPlan.identity")}</span><h1 style={planTitle}>{text(plan.status === "draft" ? draft.title : plan.title, t("finance.invoice.ui.billingPlan"))}</h1><p style={planReference}>{agreement ? t("finance.billingPlan.engagementReference", { kind: engagementKindLabel, reference: engagementReference }) : t("finance.billingPlan.engagementReferenceMissing")}</p>{plan.status !== "draft" && plan.description ? <p style={description}>{plan.description}</p> : null}</div>
        <div className="billing-plan-status-panel" style={planStatusPanel}><span style={metaLabel}>{t("finance.billingPlan.planStatus")}</span><StatusBadge status={plan.status} label={planStatus[plan.status] || plan.status} prominent /><span style={planUpdated}>{t("finance.payment.ui.updated")} {date(plan.updated_at, locale)}</span></div>
      </div>
      {plan.status === "draft" && canManage ? <div className="billing-plan-header-edit-grid" style={headerEditGrid}>
        <label style={label}>{t("finance.billingPlan.planTitle")}<input style={input} value={draft.title} disabled={saving || statusSaving} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label style={label}>{t("finance.billingPlan.planNote")}<textarea style={{ ...input, minHeight: 72, resize: "vertical" }} value={draft.description} disabled={saving || statusSaving} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      </div> : null}
      <div className="billing-plan-metadata-grid" style={planMetadataGrid}>
        <Field label={t("finance.billingPlan.billingMethod")} value={billingMethod[plan.billing_method] || plan.billing_method} />
        <Field label={t("finance.payment.ui.currency")} value={plan.currency} />
        <Field label={t("finance.billingPlan.installmentCount")} value={plan.installment_count} />
        <Field label={t("finance.charge.ui.createdAt")} value={date(plan.created_at, locale)} />
        <Field label={t("finance.payment.ui.updated")} value={date(plan.updated_at, locale)} />
      </div>
    </section>

    {canManage && plan.status === "draft" ? <section aria-live="polite" style={{ ...saveStateNotice, ...(dirty ? dirtyStateNotice : savedStateNotice) }}>
      <strong>{dirty ? t("finance.payment.ui.unsaved") : t("finance.taxInvoice.ui.latestSaved")}</strong>
      <span>{dirty ? t("finance.billingPlan.saveAtReviewHelp") : t("finance.billingPlan.reviewBeforeActivate")}</span>
    </section> : null}
    {canManage && plan.status === "active" ? <section style={{ ...card, ...activeNotice }}><div><strong>{t("finance.billingPlan.activeTitle")}</strong><p style={actionHelp}>{t("finance.billingPlan.activeHelp")}</p></div><button className="billing-plan-cancel-button" type="button" style={cancelButton} disabled={statusSaving} onClick={() => void changePlanStatus("cancelled")}>{statusSaving ? t("finance.taxInvoice.ui.processing") : t("finance.billingPlan.cancelPlan")}</button></section> : null}

    <section style={sourceChain}>
      <h2 style={sourceChainTitle}>{t("finance.invoice.ui.lineage")}</h2>
      <div className="billing-plan-source-chain-nodes" style={chainNodes}>
        {agreement?.source_quotation_id ? <><ChainNode title={t("finance.invoice.ui.quotation")} status={text(agreement.source_document_snapshot_json?.status, "")}><Link href={`/finance/quotations/${agreement.source_quotation_id}`}>{quotationNo}</Link></ChainNode><span className="billing-plan-chain-arrow" style={chainArrow} aria-hidden="true">→</span></> : null}
        <ChainNode title={engagementKindLabel} status={agreement?.status || null} statusText={agreement ? feeAgreementStatusLabel(agreement.status, locale) : undefined}>{agreement ? <Link href={`/finance/fee-agreements/${agreement.id}`}>{engagementReference}</Link> : <span style={unavailable}>{t("finance.billingPlan.linkedEngagementMissing")}</span>}</ChainNode>
        <span className="billing-plan-chain-arrow" style={chainArrow} aria-hidden="true">→</span>
        <ChainNode title={t("finance.invoice.ui.billingPlan")} status={plan.status} current>{text(plan.title, billingMethod[plan.billing_method] || plan.billing_method)}</ChainNode>
      </div>
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>{engagementKindLabel}{t("finance.invoice.composer.reference")}</h2>
      {!agreement ? <div style={warning}>{t("finance.billingPlan.planEngagementMissing")}</div> : <div style={grid}>
        <Field label={engagementKindLabel} value={<Link href={`/finance/fee-agreements/${agreement.id}`}>{engagementReference}</Link>} />
        <Field label={t("finance.taxInvoice.ui.status")} value={<StatusBadge status={agreement.status} label={feeAgreementStatusLabel(agreement.status, locale)} />} />
        <Field label={t("finance.payment.ui.client")} value={client} />
        <Field label={t("finance.billingPlan.matter")} value={agreement.case_id ? <Link href={`/cases/${agreement.case_id}`}>{matter}</Link> : agreement.advisory_matter_id ? <Link href={`/advisory/${agreement.advisory_matter_id}`}>{matter}</Link> : matter} />
      </div>}
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>{t("finance.billingPlan.planTotal")}</h2>
      {totalsMismatch ? <div style={warning}>{t("finance.billingPlan.totalsMismatch")}</div> : null}
      <div className="billing-plan-totals-grid" style={totalsGrid}>
        <SummaryMetric label={t("finance.taxInvoice.vatSummary.beforeVat")} value={money(plan.amount_before_tax, plan.currency)} />
        <SummaryMetric label="VAT" value={money(plan.vat_amount, plan.currency)} />
        <SummaryMetric label={t("finance.invoice.ui.total")} value={money(plan.total_amount, plan.currency)} prominent />
        <SummaryMetric label={t("finance.billingPlan.installmentCount")} value={String(plan.installment_count)} />
        <SummaryMetric label={t("finance.billingPlan.billingMethod")} value={billingMethod[plan.billing_method] || plan.billing_method} />
      </div>
    </section>

    <section style={card}>
      <h2 style={sectionTitle}>{t("finance.invoice.ui.installment")}</h2>
      {installments.length === 0 ? <div style={warning}>{t("finance.billingPlan.noInstallments")}</div> : null}
      {installments.length !== plan.installment_count ? <div style={warning}>{t("finance.billingPlan.installmentCountMismatch")}</div> : null}
      {duplicateInstallmentNo ? <div style={warning}>{t("finance.billingPlan.duplicateInstallments")}</div> : null}
      {installments.map((installment) => {
        const installmentAllocations = allocationByInstallment.get(installment.id) || [];
        const draftInstallment = draft.installments.find((row) => row.id === installment.id);
        const customInstallmentTitle = billingInstallmentDisplayTitle(installment.title, installment.installment_no);
        const installmentInvoices = invoices.filter((invoice) => invoice.primary_billing_installment_id === installment.id);
        const activeInvoice = installmentInvoices.find((invoice) => !["cancelled", "voided"].includes(invoice.document_status));
        const historicalInvoices = installmentInvoices
          .filter((invoice) => ["cancelled", "voided"].includes(invoice.document_status))
          .sort((left, right) => right.created_at.localeCompare(left.created_at));
        const canAddCharge = canAddChargeFromInstallment({ canManageCharges, planStatus: plan.status, installmentStatus: installment.status, hasActiveInvoice: Boolean(activeInvoice) });
        const showReadyChargePreview = canViewCharges && plan.status === "active" && installment.status === "ready_to_invoice" && installmentInvoices.length === 0 && compatibleReadyCharges.length > 0;
        return <article key={installment.id} style={installmentCard}>
          <div style={installmentHeader}><div style={installmentHeadingCopy}><span style={installmentEyebrow}>{t("finance.invoice.ui.installment")}</span><h3 style={installmentTitle}>{t("finance.invoice.composer.installmentPrefix")} {installment.installment_no}</h3>{customInstallmentTitle ? <p style={installmentCustomTitle}>{customInstallmentTitle}</p> : null}</div><StatusBadge status={installment.status} label={installmentStatus[installment.status] || installment.status} /></div>
          {plan.status === "draft" && canManage && draftInstallment ? <div className="billing-plan-installment-edit-grid" style={installmentEditGrid}>
            <label className="billing-plan-installment-title-field" style={label}>{t("finance.billingPlan.installmentTitle")}<input style={input} value={draftInstallment.title} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { title: event.target.value })} /></label>
            <label style={label}>{t("finance.invoice.ui.trigger")}<select style={input} value={draftInstallment.trigger_type} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { trigger_type: event.target.value })}><option value="agreement_effective">{acceptedQuotationBasis ? t("finance.invoice.trigger.agreement_effective") : t("finance.billingPlan.trigger.agreementEffective")}</option><option value="date">{t("finance.invoice.trigger.date")}</option><option value="case_milestone">{t("finance.invoice.trigger.case_milestone")}</option><option value="manual">{t("finance.invoice.trigger.manual")}</option><option value="recurring_period">{t("finance.invoice.trigger.recurring_period")}</option></select></label>
            <label className="billing-plan-installment-description-field" style={label}>{t("finance.billingPlan.conditionDetail")}<input style={input} value={draftInstallment.trigger_description} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { trigger_description: event.target.value })} /></label>
            <label style={label}>{t("finance.invoice.ui.dueDate")}<input style={input} type="date" value={draftInstallment.due_date} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { due_date: event.target.value })} /></label>
            {draftInstallment.trigger_type === "case_milestone" ? <label style={label}>{t("finance.billingPlan.milestoneOptional")}<input style={input} value={draftInstallment.milestone_code} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { milestone_code: event.target.value })} /></label> : null}
            {draftInstallment.trigger_type === "recurring_period" ? <><label style={label}>{t("finance.billingPlan.periodStart")}<input style={input} type="date" value={draftInstallment.recurring_period_start} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { recurring_period_start: event.target.value })} /></label><label style={label}>{t("finance.billingPlan.periodEnd")}<input style={input} type="date" value={draftInstallment.recurring_period_end} disabled={saving || statusSaving} onChange={(event) => updateDraftInstallment(installment.id, { recurring_period_end: event.target.value })} /></label></> : null}
          </div> : null}
          <div className="billing-plan-installment-financials" style={installmentFinancials}>
            <SummaryMetric label={t("finance.taxInvoice.vatSummary.beforeVat")} value={money(installment.amount_before_tax, plan.currency)} compact />
            <SummaryMetric label="VAT" value={money(installment.vat_amount, plan.currency)} compact />
            <SummaryMetric label={t("finance.billingPlan.installmentTotal")} value={money(installment.total_amount, plan.currency)} prominent compact />
          </div>
          <div className="billing-plan-installment-meta" style={installmentMetaGrid}>
            <Field label={t("finance.invoice.ui.trigger")} value={installment.trigger_type === "agreement_effective" && acceptedQuotationBasis ? t("finance.invoice.trigger.agreement_effective") : triggerType[installment.trigger_type] || installment.trigger_type} />
            {installment.trigger_description ? <Field label={t("finance.billingPlan.conditionDetail")} value={installment.trigger_description} /> : null}
            {installment.due_date ? <Field label={t("finance.invoice.ui.dueDate")} value={date(installment.due_date, locale)} /> : null}
            {installment.milestone_code ? <Field label={t("finance.billingPlan.milestone")} value={installment.milestone_code} /> : null}
            {installment.recurring_period_start || installment.recurring_period_end ? <Field label={t("finance.billingPlan.period")} value={`${date(installment.recurring_period_start, locale)} / ${date(installment.recurring_period_end, locale)}`} /> : null}
            {installment.readiness_event_date ? <Field label={t("finance.invoice.ui.triggerDate")} value={date(installment.readiness_event_date, locale)} /> : null}
            {installment.ready_to_invoice_at ? <Field label={t("finance.billingPlan.readyAt")} value={dateTime(installment.ready_to_invoice_at, locale)} /> : null}
            {installment.readiness_reference ? <Field label={t("finance.billingPlan.readinessReference")} value={installment.readiness_reference} /> : null}
            {installment.readiness_note ? <Field label={t("finance.billingPlan.readinessNote")} value={installment.readiness_note} /> : null}
            {installment.invoiced_at ? <Field label={t("finance.billingPlan.invoicedAt")} value={dateTime(installment.invoiced_at, locale)} /> : null}
            {installment.cancelled_at ? <Field label={t("finance.invoice.ui.voidedAt")} value={dateTime(installment.cancelled_at, locale)} /> : null}
          </div>
          <div style={allocationHeading}><h4 style={allocationTitle}>{t("finance.billingPlan.installmentItems")}</h4><span style={allocationCount}>{installmentAllocations.length}  {t("finance.taxInvoice.vatSummary.item")}</span></div>
          {installmentAllocations.length === 0 ? <div style={warning}>{t("finance.billingPlan.noAllocations")}</div> : <div style={scroll}><table className="billing-plan-allocation-table" style={allocationTable}><colgroup>{allocationColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead><tr>{allocationColumns.map((column) => <th key={column.key} className={column.numeric ? "billing-plan-numeric-column" : undefined}>{column.key === "description" && acceptedQuotationBasis ? t("finance.billingPlan.quotationItem") : column.label}</th>)}</tr></thead><tbody>{installmentAllocations.map((allocation) => <tr key={allocation.id}>{allocationColumns.map((column) => <td key={column.key} className={column.numeric ? "billing-plan-numeric-column" : undefined}>{allocationCell(column.key, allocation, agreementItemById.get(allocation.fee_agreement_item_id), plan.currency, locale)}</td>)}</tr>)}</tbody></table></div>}
          {canManage && plan.status === "active" && installment.status === "pending" ? <div style={installmentNextStep}>
            <div><span style={nextStepEyebrow}>{t("finance.billingPlan.nextStep")}</span><strong style={nextStepTitle}>{t("finance.billingPlan.confirmReady")}</strong><p style={nextStepHelp}>{t("finance.billingPlan.readinessHelp")}</p></div>
            <div className="billing-installment-action-group" style={installmentActionGroup}>{canAddCharge ? <button type="button" style={installmentAddButton} onClick={() => openChargeCreate(installment)}><NavigationIcon name="plus" />{t("finance.charge.ui.add")}</button> : null}<button className="billing-installment-primary-action" type="button" style={primaryButton} disabled={Boolean(installmentActionId)} onClick={() => openReadinessPanel(installment)}>{t("finance.billingPlan.confirmReady")}</button></div>
          </div> : null}
          {readinessInstallmentId === installment.id ? <div ref={readinessPanelRef} style={readinessPanel}>
            <div style={readinessHeader}><div><span style={nextStepEyebrow}>{t("finance.billingPlan.staffConfirmation")}</span><h4 style={readinessTitle}>{t("finance.billingPlan.readinessTitle", { number: installment.installment_no })}</h4></div><button type="button" style={closeButton} disabled={installmentActionId === installment.id} aria-label={t("finance.billingPlan.closeReadiness")} onClick={closeReadinessPanel}>×</button></div>
            <div style={readinessContext}>
              <Field label={t("finance.billingPlan.installmentTitle")} value={installment.title} />
              <Field label={t("finance.invoice.ui.trigger")} value={installment.trigger_description || triggerType[installment.trigger_type] || installment.trigger_type} />
              <Field label={t("finance.billingPlan.installmentTotal")} value={money(installment.total_amount, plan.currency)} />
              {installment.due_date ? <Field label={t("finance.invoice.ui.dueDate")} value={date(installment.due_date, locale)} /> : null}
            </div>
            {readinessSummaryError ? <div role="alert" style={validationSummary}>{uiText(readinessSummaryError)}</div> : null}
            <div className="billing-readiness-form-grid" style={readinessFormGrid}>
              <label style={label}>{t("finance.invoice.ui.triggerDate")} <span style={requiredMark}>*</span><input ref={readinessDateRef} style={{ ...input, ...(readinessErrors.eventDate ? invalidInput : {}) }} type="date" value={readinessForm.eventDate} disabled={installmentActionId === installment.id} aria-invalid={Boolean(readinessErrors.eventDate)} onChange={(event) => { setReadinessForm({ ...readinessForm, eventDate: event.target.value }); setReadinessErrors((current) => ({ ...current, eventDate: undefined })); setReadinessSummaryError(""); }} />{readinessErrors.eventDate ? <span style={fieldError}>{uiText(readinessErrors.eventDate)}</span> : null}</label>
              <label style={label}>{t("finance.billingPlan.referenceOptional")}<input style={input} value={readinessForm.reference} maxLength={500} disabled={installmentActionId === installment.id} onChange={(event) => setReadinessForm({ ...readinessForm, reference: event.target.value })} /></label>
              <label className="billing-readiness-note" style={{ ...label, gridColumn: "1 / -1" }}>{t("finance.billingPlan.internalNoteOptional")}<textarea style={{ ...input, minHeight: 76, resize: "vertical" }} value={readinessForm.note} maxLength={2000} disabled={installmentActionId === installment.id} onChange={(event) => setReadinessForm({ ...readinessForm, note: event.target.value })} /></label>
            </div>
            <label style={{ ...confirmationLabel, ...(readinessErrors.confirmed ? invalidConfirmation : {}) }}><input ref={readinessConfirmationRef} type="checkbox" checked={readinessForm.confirmed} disabled={installmentActionId === installment.id} aria-invalid={Boolean(readinessErrors.confirmed)} onChange={(event) => { setReadinessForm({ ...readinessForm, confirmed: event.target.checked }); setReadinessErrors((current) => ({ ...current, confirmed: undefined })); setReadinessSummaryError(""); }} /><span>{t("finance.billingPlan.readinessAcknowledgement")}</span></label>
            {readinessErrors.confirmed ? <span style={fieldError}>{uiText(readinessErrors.confirmed)}</span> : null}
            <div style={readinessActions}><button type="button" style={secondaryButton} disabled={installmentActionId === installment.id} onClick={closeReadinessPanel}>{t("finance.payment.ui.cancel")}</button><button className="billing-installment-primary-action" type="button" style={primaryButton} disabled={Boolean(installmentActionId)} onClick={() => void confirmInstallmentReadiness(installment)}>{installmentActionId === installment.id ? t("finance.payment.ui.confirming") : t("finance.billingPlan.confirmReadiness")}</button></div>
          </div> : null}
          {showReadyChargePreview ? <ReadyChargePreview charges={compatibleReadyCharges} installmentTotal={installment.total_amount} currency={plan.currency} onViewAll={() => setReadyChargeListInstallmentId(installment.id)} /> : null}
          {plan.status === "active" && installment.status === "ready_to_invoice" ? <div style={installmentNextStep}>
            <div><span style={nextStepEyebrow}>{t("finance.billingPlan.nextStep")}</span><strong style={nextStepTitle}>{activeInvoice ? t("finance.billingPlan.openDraftInvoice") : installmentInvoices.length ? t("finance.billingPlan.reviewInvoiceHistory") : t("finance.invoice.composer.compose")}</strong><p style={nextStepHelp}>{activeInvoice ? t("finance.billingPlan.draftStatusHelp", { status: invoiceStatus[activeInvoice.document_status] || activeInvoice.document_status }) : installmentInvoices.length ? t("finance.billingPlan.v1HistoryHelp") : t("finance.billingPlan.openComposerHelp")}</p></div>
            <div className="billing-installment-action-group" style={installmentActionGroup}>{canAddCharge ? <button type="button" style={installmentAddButton} onClick={() => openChargeCreate(installment)}><NavigationIcon name="plus" />{t("finance.charge.ui.add")}</button> : null}{activeInvoice ? <Link className="billing-installment-primary-action" style={{ ...primaryButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }} href={`/finance/invoices/${activeInvoice.id}`}>{t("finance.billingPlan.openDraftInvoice")}</Link> : installmentInvoices.length ? <span style={permissionNote}>{t("finance.billingPlan.historyHelp")}</span> : canComposeInstallment ? <button className="billing-installment-primary-action" type="button" style={primaryButton} onClick={() => openInvoiceSelection(installment)}>{t("finance.invoice.composer.compose")}</button> : <span style={permissionNote}>{t("finance.billingPlan.v2PermissionHelp")}</span>}</div>
          </div> : null}
          {plan.status === "draft" && canAddCharge ? <div style={installmentDraftAction}><button type="button" style={installmentAddButton} onClick={() => openChargeCreate(installment)}><NavigationIcon name="plus" />{t("finance.charge.ui.add")}</button></div> : null}
          {activeInvoice && installment.status === "invoiced" ? <div style={installmentNextStep}><div><span style={nextStepEyebrow}>{t("finance.payment.ui.invoice")}</span><strong style={nextStepTitle}>{activeInvoice.invoice_no || t("finance.billingPlan.invoiceDocument")}</strong></div><Link style={{ ...primaryButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }} href={`/finance/invoices/${activeInvoice.id}`}>{t("finance.invoice.ui.open")}</Link></div> : null}
          {historicalInvoices.length ? <section style={invoiceHistorySection} aria-label={t("finance.billingPlan.invoiceHistoryTitle", { number: installment.installment_no })}>
            <div style={invoiceHistoryHeader}><div><span style={invoiceHistoryEyebrow}>{t("finance.taxInvoice.ui.history")}</span><h4 style={invoiceHistoryTitle}>{t("finance.invoice.ui.history")}</h4></div><span style={invoiceHistoryCount}>{historicalInvoices.length}  {t("finance.taxInvoice.vatSummary.item")}</span></div>
            <div style={invoiceHistoryList}>{historicalInvoices.map((historicalInvoice) => <div className="billing-plan-invoice-history-item" key={historicalInvoice.id} style={invoiceHistoryItem}>
              <div style={invoiceHistoryIdentity}><strong style={invoiceHistoryNumber}>{historicalInvoice.invoice_no || t("finance.billingPlan.unnumberedInvoiceDraft")}</strong><div style={invoiceHistoryMeta}><StatusBadge status={historicalInvoice.document_status} label={invoiceStatus[historicalInvoice.document_status] || historicalInvoice.document_status} /><span>{invoiceHistoryTimestamp(historicalInvoice, locale)}</span></div></div>
              <Link className="billing-plan-invoice-history-link" style={invoiceHistoryLink} href={`/finance/invoices/${historicalInvoice.id}`}>{t("finance.invoice.ui.open")}</Link>
            </div>)}</div>
          </section> : null}
        </article>;
      })}
    </section>
    {currentChargesForOverview.length > 0 ? <ChargeOverview
      sectionId="billing-plan-current-charges"
      open={expandCurrentCharges}
      onOpenChange={setExpandCurrentCharges}
      charges={currentChargesForOverview}
      invoiceLinks={chargeInvoiceLinks}
      canManageCharges={canManageCharges}
      title={t("finance.billingPlan.currentCharges")}
      helper={hasReadyChargePreview ? t("finance.billingPlan.draftReservedCharges") : t("finance.billingPlan.currentChargesHelp")}
      onDetail={setRelatedChargeId}
    /> : null}
    {chargeWorkflow.history.length > 0 ? <ChargeOverview
      charges={chargeWorkflow.history}
      invoiceLinks={chargeInvoiceLinks}
      canManageCharges={canManageCharges}
      title={t("finance.billingPlan.chargeHistory")}
      helper={t("finance.billingPlan.chargeHistoryHelp")}
      historical
      onDetail={setRelatedChargeId}
    /> : null}
    {relatedCharge ? <DetailModal open title={text(relatedCharge.description, t("finance.charge.ui.draftCharge"))} subtitle={<>{client} · {matter}</>} status={<StatusBadge status={relatedCharge.status} label={chargeStatusLabel(relatedCharge.status, locale)} />} prominentValue={money(relatedCharge.total_amount, relatedCharge.currency)} onClose={() => setRelatedChargeId("")}>
      <dl className="billing-plan-related-charge-detail-grid" style={relatedChargeDetailGrid}>
        <Field label={t("finance.charge.ui.transactionDate")} value={date(relatedCharge.service_date || relatedCharge.created_at, locale)} />
        <Field label={t("finance.taxInvoice.ui.status")} value={chargeStatusLabel(relatedCharge.status, locale)} />
        <Field label={t("finance.invoice.ui.chargeNature")} value={billableChargeNatureLabel(relatedCharge.source_type, locale)} />
        {relatedCharge.source_type === "recoverable_cost" ? <Field label={t("finance.invoice.ui.funding")} value={clientCostFundingModeLabel(relatedCharge.client_cost_funding_mode, locale)} /> : null}
        <Field label={t("finance.invoice.ui.classification")} value={chargeClassificationLabel(relatedCharge.economic_classification, locale)} />
        <Field label={t("finance.charge.ui.vatMode")} value={chargeTaxLabel(relatedCharge.price_tax_mode, relatedCharge.vat_rate, locale)} />
        <Field label={t("finance.taxInvoice.vatSummary.beforeVat")} value={money(relatedCharge.amount_before_vat, relatedCharge.currency)} />
        <Field label="VAT" value={money(relatedCharge.vat_amount, relatedCharge.currency)} />
        <Field label={t("finance.charge.ui.chargeAmount")} value={<strong>{money(relatedCharge.total_amount, relatedCharge.currency)}</strong>} />
        <Field label={t("finance.charge.ui.referenceEvidenceNumber")} value={text(relatedCharge.source_reference)} />
        {relatedCharge.ready_to_invoice_at ? <Field label={t("finance.billingPlan.readyAt")} value={dateTime(relatedCharge.ready_to_invoice_at, locale)} /> : null}
      </dl>
    </DetailModal> : null}
    {readyChargeListInstallment ? <DetailModal open title={t("finance.billingPlan.readyAdditionalCharges")} subtitle={<>{t("finance.billingPlan.availableForInstallment", { number: readyChargeListInstallment.installment_no })}</>} prominentValue={money(summarizeReadyCharges(compatibleReadyCharges, readyChargeListInstallment.total_amount).total, plan.currency)} onClose={() => setReadyChargeListInstallmentId("")}>
      <ReadyChargeRows charges={compatibleReadyCharges} />
      <p style={readyChargeDisclaimer}>{t("finance.billingPlan.availableChargesHelp")}</p>
    </DetailModal> : null}
    {invoiceSelectionInstallment ? <DetailModal
      open
      title={t("finance.billingPlan.composeTitle", { number: invoiceSelectionInstallment.installment_no })}
      subtitle={<>{billingInstallmentDisplayTitle(invoiceSelectionInstallment.title, invoiceSelectionInstallment.installment_no) || engagementReference} · {matter}</>}
      prominentValue={<>{t("finance.billingPlan.installmentAmount")} {money(invoiceSelectionInstallment.total_amount, plan.currency)}</>}
      closeLabel={t("finance.billingPlan.closeSelection")}
      onClose={closeInvoiceSelection}
      footer={<div className="billing-invoice-selection-footer" style={invoiceSelectionFooter}><button type="button" style={secondaryButton} onClick={closeInvoiceSelection}>{t("finance.payment.ui.cancel")}</button><Link className="billing-plan-primary-button" style={{ ...primaryButton, ...invoiceSelectionContinue, textDecoration: "none" }} href={invoiceComposerHref(invoiceSelectionInstallment.id, selectedInvoiceChargeIds, agreement?.client_id || "")}>{t("finance.billingPlan.continue")}</Link></div>}
    >
      <div className="billing-invoice-selection" style={invoiceSelectionBody}>
        <section style={invoiceSelectionSection} aria-labelledby="billing-invoice-installment-source">
          <div style={invoiceSelectionHeading}><div><span style={nextStepEyebrow}>{t("finance.billingPlan.primaryAmount")}</span><h3 id="billing-invoice-installment-source" style={invoiceSelectionTitle}>{t("finance.billingPlan.plannedAmount")}</h3></div><span style={lockedBadge}>{t("finance.billingPlan.selected")}</span></div>
          <div className="billing-invoice-source-choice" style={{ ...invoiceSourceChoice, ...invoiceSourceLocked }}><span aria-hidden="true" style={selectedMark}>✓</span><div style={invoiceChoiceCopy}><strong>{t("finance.invoice.composer.installmentPrefix")} {invoiceSelectionInstallment.installment_no} {billingInstallmentDisplayTitle(invoiceSelectionInstallment.title, invoiceSelectionInstallment.installment_no) ? `— ${billingInstallmentDisplayTitle(invoiceSelectionInstallment.title, invoiceSelectionInstallment.installment_no)}` : ""}</strong><small>{t("finance.billingPlan.sourceLockedHelp")}</small></div><strong className="billing-invoice-choice-amount" style={invoiceChoiceAmount}>{money(invoiceSelectionInstallment.total_amount, plan.currency)}</strong></div>
        </section>
        <section style={invoiceSelectionSection} aria-labelledby="billing-invoice-extra-charges">
          <div style={invoiceSelectionHeading}><div><span style={nextStepEyebrow}>{t("finance.billingPlan.optionalSelection")}</span><h3 id="billing-invoice-extra-charges" style={invoiceSelectionTitle}>{t("finance.billingPlan.availableAdditionalCharges")}</h3><p style={invoiceSelectionHelp}>{t("finance.billingPlan.selectAdditionalHelp")}</p></div></div>
          {!canViewCharges ? <div style={relatedChargeNotice}>{t("finance.billingPlan.chargeAccessHelp")}</div> : compatibleReadyCharges.length === 0 ? <div style={invoiceSelectionEmpty}><strong>{t("finance.billingPlan.noReadyAdditional")}</strong><span>{t("finance.billingPlan.continueWithoutCharges")}</span>{canManageCharges && agreement ? <button className="billing-invoice-add-charge" type="button" style={invoiceAddChargeLink} onClick={() => openChargeCreate(invoiceSelectionInstallment)}><NavigationIcon name="plus" />{t("finance.charge.ui.addCharge")}</button> : null}</div> : <div style={invoiceChoiceList}>{compatibleReadyCharges.map((charge) => {
            const selected = selectedInvoiceChargeIds.includes(charge.id);
            const detailOpen = selectionDetailCharge?.id === charge.id;
            return <article key={charge.id} style={{ ...invoiceChargeChoice, ...(selected ? invoiceChargeChoiceSelected : {}) }}>
              <label className="billing-invoice-charge-label" style={invoiceChargeLabel}><input type="checkbox" checked={selected} onChange={() => { setSelectedInvoiceChargeIds((current) => current.includes(charge.id) ? current.filter((id) => id !== charge.id) : [...current, charge.id]); setSelectionDetailChargeId(""); }} /><span style={invoiceChoiceCopy}><strong>{text(charge.description, t("finance.billingPlan.unbilledCharges"))}</strong><small>{date(charge.service_date || charge.created_at, locale)} · {chargeClassificationLabel(charge.economic_classification, locale)} · {chargeTaxLabel(charge.price_tax_mode, charge.vat_rate, locale)}</small></span><strong className="billing-invoice-choice-amount" style={invoiceChoiceAmount}>{money(charge.total_amount, charge.currency)}</strong></label>
              <button className="billing-invoice-detail-toggle" type="button" style={invoiceDetailToggle} aria-expanded={detailOpen} onClick={() => setSelectionDetailChargeId(detailOpen ? "" : charge.id)}>{detailOpen ? t("finance.billingPlan.hideDetails") : t("finance.invoice.ui.details")}</button>
              {detailOpen ? <dl className="billing-invoice-charge-detail" style={invoiceInlineDetail}><Field label={t("finance.charge.ui.transactionDate")} value={date(charge.service_date || charge.created_at, locale)} /><Field label={t("finance.invoice.ui.chargeNature")} value={billableChargeNatureLabel(charge.source_type, locale)} />{charge.source_type === "recoverable_cost" ? <Field label={t("finance.invoice.ui.funding")} value={clientCostFundingModeLabel(charge.client_cost_funding_mode, locale)} /> : null}<Field label={t("finance.invoice.ui.classification")} value={chargeClassificationLabel(charge.economic_classification, locale)} /><Field label={t("finance.charge.ui.vatMode")} value={chargeTaxLabel(charge.price_tax_mode, charge.vat_rate, locale)} /><Field label={t("finance.taxInvoice.vatSummary.beforeVat")} value={money(charge.amount_before_vat, charge.currency)} /><Field label="VAT" value={money(charge.vat_amount, charge.currency)} /><Field label={t("finance.invoice.ui.total")} value={money(charge.total_amount, charge.currency)} /><Field label={t("finance.charge.ui.referenceEvidence")} value={text(charge.source_reference)} /></dl> : null}
            </article>;
          })}</div>}
          {compatibleReadyCharges.length > 0 && canManageCharges && agreement ? <button className="billing-invoice-add-charge" type="button" style={invoiceSecondaryAddLink} onClick={() => openChargeCreate(invoiceSelectionInstallment)}><NavigationIcon name="plus" />{t("finance.charge.ui.addCharge")}</button> : null}
        </section>
        <section style={invoiceSelectionSummary} aria-live="polite"><div style={invoiceSelectionHeading}><div><span style={nextStepEyebrow}>{t("finance.billingPlan.selectionSummary")}</span><h3 style={invoiceSelectionTitle}>{t("finance.billingPlan.composerTotal")}</h3></div><strong style={invoiceSelectionGrandTotal}>{money(selectionTotals.total, plan.currency)}</strong></div><dl className="billing-invoice-selection-totals" style={invoiceSelectionTotals}><Field label={t("finance.billingPlan.planAmount")} value={money(invoiceSelectionInstallment.total_amount, plan.currency)} /><Field label={t("finance.billingPlan.additionalCount", { count: selectedInvoiceCharges.length })} value={money(selectedInvoiceCharges.reduce((sum, charge) => sum + numberValue(charge.total_amount), 0), plan.currency)} /><Field label={t("finance.taxInvoice.vatSummary.beforeVat")} value={money(selectionTotals.before, plan.currency)} /><Field label="VAT" value={money(selectionTotals.vat, plan.currency)} /></dl><p style={invoiceSelectionDisclaimer}>{t("finance.billingPlan.selectionHelp")}</p></section>
      </div>
    </DetailModal> : null}
    {chargeCreateInstallment && billableChargeContext ? <DetailModal
      open
      title={t("finance.charge.ui.addCharge")}
      subtitle={<>{billableChargeContext.clientName} · {billableChargeContext.matterLabel}</>}
      closeLabel={t("finance.billingPlan.closeChargeForm")}
      closeOnBackdrop={false}
      onClose={closeChargeCreate}
    ><BillableChargeCreateWorkflow
      key={chargeCreateInstallment.id}
      context={billableChargeContext}
      canManage={canManageCharges}
      canApprove={canComposeInstallment}
      onReady={async () => {
        const completion = billingPlanReadyChargeCompletionState();
        setChargeCreateInstallmentId(completion.chargeCreateInstallmentId);
        setInvoiceSelectionInstallmentId(completion.invoiceSelectionInstallmentId);
        setSelectedInvoiceChargeIds(completion.selectedInvoiceChargeIds);
        setSelectionDetailChargeId(completion.selectionDetailChargeId);
        setExpandCurrentCharges(completion.expandCurrentCharges);
        await load();
        setMessage(uiMessage("finance.billingPlan.chargeReadySuccess"));
        window.requestAnimationFrame(() => {
          const target = document.getElementById("billing-plan-current-charges");
          target?.focus({ preventScroll: true });
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }}
    /></DetailModal> : null}
    {canManage && plan.status === "draft" ? <section className="billing-plan-final-review" style={{ ...card, ...finalReviewCard }}>
      <div style={finalReviewHeader}>
        <span style={finalReviewEyebrow}>{t("finance.invoice.ui.finalStep")}</span>
        <h2 style={finalReviewTitle}>{t("finance.billingPlan.reviewTitle")}</h2>
        <p style={finalReviewDescription}>{t("finance.billingPlan.reviewHelp")}</p>
      </div>
      <div className="billing-plan-final-summary" style={finalSummaryGrid}>
        <SummaryMetric label={t("finance.billingPlan.installmentCount")} value={String(plan.installment_count)} />
        <SummaryMetric label={t("finance.taxInvoice.vatSummary.beforeVat")} value={money(plan.amount_before_tax, plan.currency)} />
        <SummaryMetric label="VAT" value={money(plan.vat_amount, plan.currency)} />
        <SummaryMetric label={t("finance.invoice.ui.total")} value={money(plan.total_amount, plan.currency)} prominent />
      </div>
      <div style={{ ...finalReadinessNotice, ...(dirty ? finalReadinessPending : finalReadinessReady) }}>
        <strong>{dirty ? t("finance.billingPlan.saveBeforeActivate") : t("finance.billingPlan.readyToActivate")}</strong>
        <span>{dirty ? t("finance.billingPlan.activateAfterSave") : t("finance.billingPlan.activateHelp")}</span>
      </div>
      <div className="billing-plan-workflow-controls" style={workflowControls}>
        <div className="billing-plan-normal-actions" style={actionButtons}>
          <button className="billing-plan-save-button" type="button" style={{ ...secondaryButton, ...(!dirty ? disabledSaveButton : {}) }} disabled={!dirty || saving || statusSaving} onClick={() => void saveDraft()}>{saving ? t("finance.payment.ui.saving") : dirty ? t("finance.payment.ui.saveChanges") : t("finance.payment.ui.savedState")}</button>
          <button className="billing-plan-primary-button" type="button" style={primaryButton} disabled={dirty || saving || statusSaving} onClick={() => void changePlanStatus("active")}>{statusSaving ? t("finance.taxInvoice.ui.processing") : t("finance.billingPlan.activate")}</button>
        </div>
      </div>
      <div className="billing-plan-danger-actions" style={otherActions}>
        <div style={otherActionsCopy}>
          <strong>{t("finance.taxInvoice.ui.otherActions")}</strong>
          <span>{t("finance.billingPlan.cancelHelp")}</span>
        </div>
        <button className="billing-plan-cancel-button" type="button" style={cancelButton} disabled={saving || statusSaving} onClick={() => void changePlanStatus("cancelled")}>{t("finance.billingPlan.cancelPlan")}</button>
      </div>
    </section> : null}
    <style jsx global>{`
      .billing-plan-navigation-link { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .billing-plan-navigation-back:hover { background: #f8fafc !important; border-color: #94a3b8 !important; color: #172033 !important; }
      .billing-plan-navigation-source:hover { background: #e0e7ff !important; border-color: #a5b4fc !important; color: #312e81 !important; }
      .billing-plan-navigation-link:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .billing-plan-primary-button, .billing-plan-save-button, .billing-plan-cancel-button, .billing-installment-primary-action, .billing-installment-action-group button, .billing-plan-related-charge-detail, .billing-plan-ready-charge-view-all { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .billing-plan-primary-button:hover:not(:disabled), .billing-installment-primary-action:hover:not(:disabled) { background: #14532d !important; border-color: #14532d !important; }
      .billing-plan-save-button:hover:not(:disabled) { background: #f8fafc !important; border-color: #64748b !important; }
      .billing-plan-cancel-button:hover:not(:disabled) { background: #fef2f2 !important; border-color: #fca5a5 !important; }
      .billing-plan-primary-button:focus-visible, .billing-plan-save-button:focus-visible, .billing-plan-cancel-button:focus-visible, .billing-installment-primary-action:focus-visible, .billing-installment-action-group button:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .billing-plan-primary-button:disabled, .billing-plan-save-button:disabled, .billing-plan-cancel-button:disabled, .billing-installment-primary-action:disabled { cursor: not-allowed !important; opacity: .58; }
      .billing-plan-invoice-history-link, .billing-plan-related-charge-invoice { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .billing-plan-invoice-history-link:hover, .billing-plan-related-charge-invoice:hover { background: #f8fafc !important; border-color: #94a3b8 !important; color: #172033 !important; }
      .billing-plan-invoice-history-link:focus-visible, .billing-plan-related-charge-invoice:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .billing-plan-add-charge-link:hover { background: #14532d !important; border-color: #14532d !important; }
      .billing-plan-add-charge-link:focus-visible, .billing-plan-related-charge-detail:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .billing-plan-related-charge-detail:hover { background: #f8fafc !important; border-color: #64748b !important; }
      .billing-plan-ready-charge-view-all:hover { background: #ecfdf3 !important; border-color: #6fb889 !important; color: #234535 !important; }
      .billing-plan-ready-charge-view-all:focus-visible { outline: 3px solid rgba(22, 101, 52, .2); outline-offset: 2px; }
      .billing-plan-related-charge-overview > summary { list-style-position: outside; }
      .billing-plan-related-charge-overview > summary span:first-child { display: grid; gap: 3px; }
      .billing-plan-related-charge-overview > summary small { color: #64748b; font-size: 12px; font-weight: 500; }
      .billing-invoice-selection input[type="checkbox"] { width: 18px; height: 18px; accent-color: #166534; }
      .billing-invoice-detail-toggle:focus-visible, .billing-invoice-add-charge:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
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
        .billing-plan-related-charge-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .billing-invoice-selection-totals { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      }
      @media (max-width: 640px) {
        .billing-plan-page { padding: 14px !important; }
        .billing-plan-navigation-toolbar { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-navigation-link { width: 100%; justify-content: flex-start !important; white-space: normal !important; }
        .billing-plan-metadata-grid, .billing-plan-totals-grid, .billing-plan-final-summary, .billing-plan-installment-edit-grid, .billing-plan-installment-financials, .billing-plan-installment-meta { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-ready-charge-totals { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-workflow-controls { width: 100%; align-items: stretch !important; }
        .billing-plan-normal-actions { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; width: 100%; }
        .billing-plan-danger-actions { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; width: 100%; align-items: stretch !important; }
        .billing-plan-primary-button, .billing-plan-save-button, .billing-plan-cancel-button, .billing-installment-primary-action { width: 100%; }
        .billing-installment-action-group { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; width: 100%; }
        .billing-installment-action-group > * { width: 100%; box-sizing: border-box; }
        .billing-plan-invoice-history-item { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-invoice-history-link { width: 100%; box-sizing: border-box; }
        .billing-plan-related-charge-header { align-items: stretch !important; }
        .billing-plan-add-charge-link { width: 100%; box-sizing: border-box; }
        .billing-plan-related-charge-grid, .billing-plan-related-charge-detail-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-plan-related-charge-invoice { width: 100%; box-sizing: border-box; white-space: normal !important; }
        .billing-invoice-charge-detail, .billing-invoice-selection-totals { grid-template-columns: minmax(0, 1fr) !important; }
        .billing-invoice-source-choice, .billing-invoice-charge-label { grid-template-columns: auto minmax(0, 1fr) !important; align-items: start !important; }
        .billing-invoice-choice-amount { grid-column: 2; justify-self: start; white-space: normal !important; }
        .billing-invoice-selection-footer { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; }
        .billing-invoice-selection-footer > * { width: 100%; box-sizing: border-box; }
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

function ReadyChargePreview({ charges, installmentTotal, currency, onViewAll }: { charges: RelatedCharge[]; installmentTotal: number | string; currency: string; onViewAll: () => void }) {
  const { t } = useI18n();
  const summary = summarizeReadyCharges(charges, installmentTotal);

  return <section className="billing-plan-ready-charge-preview" style={readyChargePreview} aria-label={t("finance.billingPlan.readyChargeCount", { count: summary.count })}>
    <div style={readyChargeHeader}>
      <div><span style={readyChargeEyebrow}>{t("finance.billingPlan.beforeComposition")}</span><h4 style={readyChargeTitle}>{t("finance.billingPlan.readyAdditionalCharges")}</h4></div>
      <strong style={readyChargeSummary}>{t("finance.billingPlan.readyChargeSummary", { count: summary.count, total: money(summary.total, currency) })}</strong>
    </div>
    <ReadyChargeRows charges={summary.visibleCharges} />
    {summary.hiddenCount > 0 ? <button className="billing-plan-ready-charge-view-all" type="button" style={readyChargeViewAllButton} onClick={onViewAll}>{t("finance.billingPlan.viewAll", { count: summary.count })}</button> : null}
    <div className="billing-plan-ready-charge-totals" style={readyChargeTotals}>
      <span>{t("finance.billingPlan.installmentAmount")} <strong>{money(installmentTotal, currency)}</strong></span>
      <span>{t("finance.billingPlan.includeAll")} <strong>{money(summary.allInTotal, currency)}</strong></span>
    </div>
    <p style={readyChargeDisclaimer}>{t("finance.billingPlan.availableChargesHelp")}</p>
  </section>;
}

function ReadyChargeRows({ charges }: { charges: RelatedCharge[] }) {
  const { t } = useI18n();
  return <div style={readyChargeList}>{charges.map((charge) => <div className="billing-plan-ready-charge-row" key={charge.id} style={readyChargeRow}>
    <span style={readyChargeDescription}>{text(charge.description, t("finance.billingPlan.additionalCharges"))}</span>
    <strong style={readyChargeAmount}>{money(charge.total_amount, charge.currency)}</strong>
  </div>)}</div>;
}

function ChargeOverview({ sectionId, open, onOpenChange, charges, invoiceLinks, canManageCharges, title, helper, historical = false, onDetail }: {
  sectionId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  charges: RelatedCharge[];
  invoiceLinks: Record<string, ChargeInvoiceLink>;
  canManageCharges: boolean;
  title: string;
  helper: string;
  historical?: boolean;
  onDetail: (chargeId: string) => void;
}) {
  const { t, locale } = useI18n();
  return <section id={sectionId} tabIndex={sectionId ? -1 : undefined} style={{ ...card, ...relatedChargeSection, ...(historical ? relatedChargeHistorySection : {}) }} aria-label={t("finance.billingPlan.sectionCount", { title: title, count: charges.length })}>
    <details className="billing-plan-related-charge-overview" open={open} onToggle={onOpenChange ? (event) => onOpenChange(event.currentTarget.open) : undefined}>
      <summary style={relatedChargeSummary}>
        <span><strong>{title} ({charges.length})</strong><small>{helper}</small></span>
        <span style={relatedChargeCount}>{t("finance.billingPlan.viewCharge")}</span>
      </summary>
      {!historical && !canManageCharges ? <p style={relatedChargePermission}>{t("finance.billingPlan.chargeReadOnlyPermission")}</p> : null}
      <div className="billing-plan-related-charge-grid" style={relatedChargeGrid}>{charges.map((charge) => {
        const invoiceLink = invoiceLinks[charge.id];
        const showInvoiceLink = invoiceLink && (historical || ["reserved", "invoiced"].includes(invoiceLink.allocationStatus));
        return <article key={charge.id} style={relatedChargeCard}>
          <div style={relatedChargeCardHeader}><div style={relatedChargeCardCopy}><span style={relatedChargeDate}>{date(charge.service_date || charge.created_at, locale)}</span><h3 style={relatedChargeCardTitle}>{text(charge.description, t("finance.charge.ui.draftCharge"))}</h3></div><StatusBadge status={charge.status} label={chargeStatusLabel(charge.status, locale)} /></div>
          <dl style={relatedChargeMetrics}><div><dt style={relatedChargeMetricLabel}>{t("finance.invoice.ui.classification")}</dt><dd style={relatedChargeMetricValue}>{chargeClassificationLabel(charge.economic_classification, locale)}</dd></div><div><dt style={relatedChargeMetricLabel}>VAT</dt><dd style={relatedChargeMetricValue}>{chargeTaxLabel(charge.price_tax_mode, charge.vat_rate, locale)}</dd></div></dl>
          {showInvoiceLink ? <div style={relatedChargeInvoice}><span>{t("finance.billingPlan.relatedInvoice")}</span><Link className="billing-plan-related-charge-invoice" style={relatedChargeInvoiceLink} href={`/finance/invoices/${invoiceLink.invoiceId}`}>{invoiceLink.invoiceNo || t("finance.billingPlan.unnumberedInvoiceDraft")}</Link></div> : null}
          <div style={relatedChargeCardFooter}><strong style={relatedChargeAmount}>{money(charge.total_amount, charge.currency)}</strong><button className="billing-plan-related-charge-detail" type="button" style={relatedChargeDetailButton} onClick={() => onDetail(charge.id)}>{t("finance.invoice.ui.details")}</button></div>
        </article>;
      })}</div>
    </details>
  </section>;
}

function Field({ label, value }: { label: string; value: ReactNode }) { return <div><small style={{ color: "#64748b" }}>{label}</small><div>{value}</div></div>; }
function StatusBadge({ status, label, prominent = false }: { status: string; label: string; prominent?: boolean }) { return <span style={{ ...statusBadge, ...statusColor[status], ...(prominent ? prominentStatusBadge : {}) }}>{label}</span>; }
function NavigationIcon({ name }: { name: "back" | "source" | "plus" }) { const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; if (name === "back") return <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>; return <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" /></svg>; }
function ChainNode({ title, status, statusText, current = false, children }: { title: string; status: string | null; statusText?: string; current?: boolean; children: ReactNode }) {
  const { locale } = useI18n();
  const { planStatus } = billingPlanUiLabels(locale); return <div style={{ ...chainNode, ...(current ? chainCurrentNode : {}) }}><small style={{ color: "#64748b" }}>{title}</small>{status ? <StatusBadge status={status} label={statusText || planStatus[status] || status} /> : null}<div style={{ marginTop: 6, overflowWrap: "anywhere" }}>{children}</div></div>; }
function SummaryMetric({ label, value, prominent = false, compact = false }: { label: string; value: string; prominent?: boolean; compact?: boolean }) { return <div className="billing-plan-summary-metric" style={{ ...summaryMetric, ...(compact ? compactSummaryMetric : {}), ...(prominent ? prominentSummaryMetric : {}) }}><small style={{ ...summaryMetricLabel, ...(prominent ? prominentSummaryMetricLabel : {}) }}>{label}</small><strong style={{ ...summaryMetricValue, ...(prominent ? prominentSummaryMetricValue : {}) }}>{value}</strong></div>; }
function billingPlanDraft(plan: BillingPlan, installments: Installment[]): DraftForm { return { title: plan.title || "", description: plan.description || "", installments: installments.map((installment) => ({ id: installment.id, installment_no: installment.installment_no, sort_order: installment.sort_order, title: installment.title, trigger_description: installment.trigger_description || "", trigger_type: installment.trigger_type, due_date: installment.due_date || "", milestone_code: installment.milestone_code || "", recurring_period_start: installment.recurring_period_start || "", recurring_period_end: installment.recurring_period_end || "" })) }; }
function billingInstallmentDisplayTitle(title: string, installmentNo: number) { const value = title.trim(); const generated = new RegExp(`^(?:งวดที่\\s*${installmentNo}|Installment\\s*${installmentNo})(?:\\s*[/\\-—]\\s*(?:งวดที่\\s*${installmentNo}|Installment\\s*${installmentNo}))?$`, "i"); return generated.test(value) ? "" : value; }
function invoiceHistoryTimestamp(invoice: InvoiceSummary, locale: UiLocale = "th") { if (invoice.document_status === "voided") return translate(locale, "finance.billingPlan.voidedOn", { date: dateTime(invoice.voided_at, locale) }); if (invoice.document_status === "cancelled") return translate(locale, "finance.billingPlan.cancelledDraftOn", { date: dateTime(invoice.cancelled_at, locale) }); return translate(locale, "finance.billingPlan.createdOn", { date: dateTime(invoice.created_at, locale) }); }
function invoiceComposerHref(installmentId: string, chargeIds: string[], clientId: string) { const params = new URLSearchParams({ installment: installmentId }); if (clientId) params.set("client", clientId); chargeIds.forEach((chargeId) => params.append("charge", chargeId)); return `/finance/invoices/compose?${params.toString()}`; }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function chargeStatusLabel(status: string, locale: UiLocale = "th") { return ({ draft: translate(locale, "finance.feeAgreement.status.draft"), ready_to_invoice: translate(locale, "finance.invoice.ui.readyToInvoice"), reserved: translate(locale, "finance.charge.ui.reserved"), invoiced: translate(locale, "finance.payment.ui.invoiceIssued"), cancelled: translate(locale, "finance.payment.ui.cancel") } as Record<string, string>)[status] || status; }
function chargeClassificationLabel(value: string | null, locale: UiLocale = "th") { return ({ professional_fee: translate(locale, "finance.invoice.classification.professional_fee"), additional_service: translate(locale, "finance.invoice.classification.additional_service"), reimbursable_expense: translate(locale, "finance.invoice.classification.reimbursable_expense"), government_or_court_fee: translate(locale, "finance.invoice.classification.government_or_court_fee"), other: translate(locale, "finance.invoice.classification.other") } as Record<string, string>)[value || ""] || translate(locale, "finance.taxInvoice.ui.unspecified"); }
function chargeTaxLabel(mode: string, vatRate: number | string, locale: UiLocale = "th") { if (mode === "non_vat") return translate(locale, "finance.payment.vat.none"); return `${mode === "vat_inclusive" ? translate(locale, "finance.charge.ui.vatInclusive") : translate(locale, "finance.charge.ui.vatExclusive")} · ${numberValue(vatRate).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`; }
function allocationCell(key: AllocationColumnKey, allocation: Allocation, description: string | undefined, currency: string, locale: UiLocale = "th"): ReactNode { if (key === "description") return description || <span style={unavailable}>{translate(locale, "finance.billingPlan.sourceItemMissing")}</span>; if (key === "amount_before_tax") return money(allocation.amount_before_tax, currency); if (key === "vat_amount") return money(allocation.vat_amount, currency); if (key === "total_amount") return <strong>{money(allocation.total_amount, currency)}</strong>; return allocation.allocation_percent === null ? <span style={mutedValue}>{translate(locale, "finance.billingPlan.actualAllocation")}</span> : `${numberValue(allocation.allocation_percent).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`; }
function bangkokToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const value = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${value.year}-${value.month}-${value.day}`; }
function validateBillingPlanDraft(draft: DraftForm) { for (const installment of draft.installments) { if (!installment.title.trim()) return uiMessage("finance.billingPlan.error.installmentTitle", { number: installment.installment_no }); if (installment.trigger_type === "date" && !installment.due_date) return uiMessage("finance.billingPlan.error.dueDate", { number: installment.installment_no }); if (installment.trigger_type === "case_milestone" && !installment.milestone_code.trim() && !installment.trigger_description.trim()) return uiMessage("finance.billingPlan.error.milestone", { number: installment.installment_no }); if (installment.trigger_type === "recurring_period" && (!installment.recurring_period_start || !installment.recurring_period_end || installment.recurring_period_end < installment.recurring_period_start)) return uiMessage("finance.billingPlan.error.period", { number: installment.installment_no }); } return ""; }
function billingReadinessErrorMessage(value: unknown) { const message = errorText(value); if (message.includes("Human readiness confirmation")) return uiMessage("finance.billingPlan.error.readinessConfirmed"); if (message.includes("Actual readiness event date")) return uiMessage("finance.billingPlan.error.readinessDate"); if (message.includes("cannot be in the future")) return uiMessage("finance.billingPlan.error.futureDate"); if (message.includes("active Billing Plan")) return uiMessage("finance.billingPlan.error.planNotActive"); if (message.includes("Only a pending") || message.includes("readiness evidence is incomplete")) return uiMessage("finance.billingPlan.error.installmentChanged"); if (message.includes("Not allowed")) return uiMessage("finance.billingPlan.error.readinessPermission"); return uiMessage("finance.billingPlan.error.readinessFailed"); }
function errorText(value: unknown) { return value && typeof value === "object" && "message" in value ? String(value.message) : String(value || ""); }
function billingPlanErrorMessage(value: unknown) { const message = value && typeof value === "object" && "message" in value ? String(value.message) : String(value || ""); if (message.includes("eligible commercial engagement") || message.includes("signed, completed, or legacy active")) return uiMessage("finance.billingPlan.error.engagementStatus"); if (message.includes("totals must match") || message.includes("allocations must exactly match") || message.includes("VAT allocations")) return uiMessage("finance.billingPlan.error.allocations"); if (message.includes("Only draft billing plans")) return uiMessage("finance.billingPlan.error.notDraft"); if (message.includes("Not allowed")) return uiMessage("finance.billingPlan.error.managePermission"); return uiMessage("finance.billingPlan.error.saveFailed"); }

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
const readyChargePreview: CSSProperties = { display: "grid", gap: 10, marginTop: 16, padding: 14, border: "1px solid #bbf7d0", borderRadius: 7, background: "#f7fff9" };
const readyChargeHeader: CSSProperties = { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const readyChargeEyebrow: CSSProperties = { display: "block", color: "#4b755d", fontSize: 10, fontWeight: 750 };
const readyChargeTitle: CSSProperties = { margin: "3px 0 0", color: "#234535", fontSize: 15 };
const readyChargeSummary: CSSProperties = { color: "#356348", fontSize: 12, fontVariantNumeric: "tabular-nums" };
const readyChargeList: CSSProperties = { display: "grid", borderTop: "1px solid #dcfce7" };
const readyChargeRow: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "baseline", gap: 12, padding: "8px 0", borderBottom: "1px solid #dcfce7" };
const readyChargeDescription: CSSProperties = { minWidth: 0, color: "#334155", fontSize: 13, lineHeight: 1.4, overflowWrap: "anywhere" };
const readyChargeAmount: CSSProperties = { color: "#234535", fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const readyChargeViewAllButton: CSSProperties = { justifySelf: "start", minHeight: 32, padding: "5px 9px", border: "1px solid #a7d7b7", borderRadius: 6, background: "#fff", color: "#356348", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 750 };
const readyChargeTotals: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, color: "#475569", fontSize: 12, fontVariantNumeric: "tabular-nums" };
const readyChargeDisclaimer: CSSProperties = { margin: 0, color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const installmentNextStep: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 18, padding: 14, border: "1px solid #bbf7d0", borderRadius: 6, background: "#f7fff9" };
const installmentActionGroup: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" };
const installmentAddButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, padding: "8px 12px", border: "1px solid #94a3b8", borderRadius: 6, background: "#fff", color: "#334155", cursor: "pointer", font: "inherit", fontWeight: 750 };
const installmentDraftAction: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: 14, paddingTop: 12, borderTop: "1px solid #e2e8f0" };
const nextStepEyebrow: CSSProperties = { display: "block", color: "#166534", fontSize: 11, fontWeight: 800 };
const nextStepTitle: CSSProperties = { display: "block", marginTop: 3, color: "#172033", fontSize: 15 };
const nextStepHelp: CSSProperties = { margin: "4px 0 0", color: "#475569", fontSize: 13, lineHeight: 1.45 };
const permissionNote: CSSProperties = { maxWidth: 280, color: "#7c5b18", fontSize: 12, fontWeight: 700, lineHeight: 1.5 };
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
const relatedChargeSection: CSSProperties = { borderColor: "#cbd5e1", background: "#fbfcfd" };
const relatedChargeHistorySection: CSSProperties = { borderColor: "#e2e8f0", background: "#f8fafc" };
const relatedChargeSummary: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", cursor: "pointer", color: "#334155" };
const relatedChargeCount: CSSProperties = { flex: "0 0 auto", color: "#64748b", fontSize: 12, fontWeight: 700 };
const relatedChargeNotice: CSSProperties = { marginTop: 14, padding: "11px 12px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", color: "#64748b", fontSize: 13, lineHeight: 1.5 };
const relatedChargePermission: CSSProperties = { margin: "13px 0 0", color: "#7c5b18", fontSize: 12, fontWeight: 700 };
const relatedChargeGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 14 };
const relatedChargeCard: CSSProperties = { display: "grid", gap: 12, minWidth: 0, padding: 14, border: "1px solid #dbe3ee", borderRadius: 7, background: "#fff" };
const relatedChargeCardHeader: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 };
const relatedChargeCardCopy: CSSProperties = { minWidth: 0 };
const relatedChargeDate: CSSProperties = { color: "#64748b", fontSize: 11 };
const relatedChargeCardTitle: CSSProperties = { margin: "4px 0 0", color: "#172033", fontSize: 15, lineHeight: 1.45, overflowWrap: "anywhere" };
const relatedChargeMetrics: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, margin: 0, padding: "10px 0", borderTop: "1px solid #edf0f3", borderBottom: "1px solid #edf0f3" };
const relatedChargeMetricLabel: CSSProperties = { color: "#64748b", fontSize: 11 };
const relatedChargeMetricValue: CSSProperties = { margin: "4px 0 0", color: "#334155", fontSize: 12, fontWeight: 750, overflowWrap: "anywhere" };
const relatedChargeInvoice: CSSProperties = { display: "grid", justifyItems: "start", gap: 5, color: "#64748b", fontSize: 11 };
const relatedChargeInvoiceLink: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 34, maxWidth: "100%", padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#334155", fontSize: 12, fontWeight: 750, textDecoration: "none", overflowWrap: "anywhere" };
const relatedChargeCardFooter: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" };
const relatedChargeAmount: CSSProperties = { color: "#166534", fontSize: 16, fontVariantNumeric: "tabular-nums" };
const relatedChargeDetailButton: CSSProperties = { minHeight: 36, padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#334155", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 750 };
const relatedChargeDetailGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, margin: 0 };
const invoiceSelectionBody: CSSProperties = { display: "grid", gap: 18 };
const invoiceSelectionSection: CSSProperties = { display: "grid", gap: 11 };
const invoiceSelectionHeading: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const invoiceSelectionTitle: CSSProperties = { margin: "3px 0 0", color: "#172033", fontSize: 17 };
const invoiceSelectionHelp: CSSProperties = { margin: "4px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.5 };
const lockedBadge: CSSProperties = { padding: "4px 8px", borderRadius: 999, background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 800 };
const invoiceSourceChoice: CSSProperties = { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 11, padding: 13, border: "1px solid #bbf7d0", borderRadius: 7 };
const invoiceSourceLocked: CSSProperties = { background: "#f7fff9" };
const selectedMark: CSSProperties = { display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 999, background: "#166534", color: "#fff", fontWeight: 900 };
const invoiceChoiceCopy: CSSProperties = { display: "grid", gap: 3, minWidth: 0, color: "#172033", lineHeight: 1.4 };
const invoiceChoiceAmount: CSSProperties = { color: "#166534", fontSize: 15, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const invoiceChoiceList: CSSProperties = { display: "grid", gap: 9 };
const invoiceChargeChoice: CSSProperties = { display: "grid", padding: 12, border: "1px solid #dbe3ee", borderRadius: 7, background: "#fff" };
const invoiceChargeChoiceSelected: CSSProperties = { borderColor: "#86efac", background: "#f7fff9" };
const invoiceChargeLabel: CSSProperties = { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 10, cursor: "pointer" };
const invoiceDetailToggle: CSSProperties = { justifySelf: "start", minHeight: 32, margin: "8px 0 0 28px", padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#fff", color: "#475569", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700 };
const invoiceInlineDetail: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, margin: "10px 0 0 28px", padding: 11, borderTop: "1px solid #e2e8f0" };
const invoiceSelectionEmpty: CSSProperties = { display: "grid", justifyItems: "start", gap: 5, padding: 14, border: "1px dashed #cbd5e1", borderRadius: 7, background: "#f8fafc", color: "#64748b", fontSize: 13 };
const invoiceAddChargeLink: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38, marginTop: 7, padding: "7px 11px", border: "1px solid #166534", borderRadius: 6, background: "#166534", color: "#fff", textDecoration: "none", fontWeight: 750 };
const invoiceSecondaryAddLink: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, justifySelf: "start", minHeight: 36, padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", textDecoration: "none", fontSize: 12, fontWeight: 750 };
const invoiceSelectionSummary: CSSProperties = { display: "grid", gap: 11, padding: 14, border: "1px solid #bbf7d0", borderRadius: 7, background: "#f7fff9" };
const invoiceSelectionGrandTotal: CSSProperties = { color: "#166534", fontSize: 20, fontVariantNumeric: "tabular-nums" };
const invoiceSelectionTotals: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, margin: 0 };
const invoiceSelectionDisclaimer: CSSProperties = { margin: 0, color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const invoiceSelectionFooter: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" };
const invoiceSelectionContinue: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center" };
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
const statusColor: Record<string, CSSProperties> = { draft: { background: "#e5e7eb", color: "#374151" }, active: { background: "#dcfce7", color: "#166534" }, completed: { background: "#dbeafe", color: "#1d4ed8" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, voided: { background: "#fee2e2", color: "#b91c1c" }, pending: { background: "#e5e7eb", color: "#374151" }, ready_to_invoice: { background: "#fef3c7", color: "#92400e" }, reserved: { background: "#e0f2fe", color: "#075985" }, invoiced: { background: "#dbeafe", color: "#1d4ed8" }, sent: { background: "#dbeafe", color: "#1d4ed8" }, accepted: { background: "#dcfce7", color: "#166534" } };
