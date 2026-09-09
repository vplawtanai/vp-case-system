"use client";

import { useI18n } from "../../../../lib/i18n/provider";
import { uiMessage, type UiLocale, type UiMessage } from "../../../../lib/i18n/core";
import { translate } from "../../../../lib/i18n/catalog";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DetailModal from "../../../components/DetailModal";
import { QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";
import type { UserPermissions } from "../../../../lib/permissions";
import FinanceSubNav from "../../FinanceSubNav";
import { displayText, eligibleInvoicePaymentBankAccount, money, invoiceErrorMessage, type FinanceBankAccount, type Json } from "../shared";
import { guidedInvoiceDocumentDefaults } from "../payment-instructions";
import InvoiceWorkspaceNav from "../InvoiceWorkspaceNav";
import { billableChargeNatureLabel, clientCostFundingModeLabel, type ClientCostFundingMode } from "../../billable-charges/funding-semantics";
import { billingPlanInvoiceSelectionResumeHref, guidedInvoiceSourceSummary, historicalInstallmentClassificationItems, invoiceCompositionMode, updateHistoricalClassification, type HistoricalClassificationValue } from "../../billing-plans/charge-context";
import BillableChargeCreateModal from "../../billable-charges/BillableChargeCreateModal";
import { ChargeVatSummary } from "../../billable-charges/ChargeVatControl";
import { savedChargeVat, validateChargeVat } from "../../billable-charges/vat-workflow";
import type { VatEvidence } from "../../document-decision/shared";
import styles from "../invoice-workspace.module.css";

type Client = { id: string; name: string | null; client_type: string | null };
type CaseRow = { client_id: string | null; id: number; file_no: string | null; title: string | null };
type Advisory = { client_id: string | null; id: string; matter_no: string | null; title: string | null };
type Charge = {
  id: string; client_id: string; case_id: number | null; advisory_matter_id: string | null;
  source_type: string; client_cost_funding_mode: ClientCostFundingMode | null; description: string | null; quantity: number | string; unit: string | null;
  currency: string; service_date: string | null; economic_classification: string | null;
  vat_treatment_json?: VatEvidence | null;
  price_tax_mode: string; vat_rate: number | string; amount_before_vat: number | string;
  vat_amount: number | string; total_amount: number | string; status: string; source_reference: string | null;
};
type Plan = { id: string; fee_agreement_id: string; title: string | null; status: string; currency: string };
type Agreement = { id: string; client_id: string; case_id: number | null; advisory_matter_id: string | null; title: string; agreement_no: string | null; status: string; engagement_basis: string | null; source_reference: string | null; language_code: string | null };
type Installment = {
  id: string; billing_plan_id: string; installment_no: number; title: string; status: string;
  readiness_event_date: string | null; ready_to_invoice_at: string | null; readiness_confirmed_at: string | null;
  readiness_confirmed_by_user_id: string | null; readiness_evidence_json: Json | null;
  trigger_description: string | null; due_date: string | null;
  amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string;
};
type InstallmentItem = { id: string; billing_installment_id: string; fee_agreement_item_id: string; economic_classification: string | null; unit: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; sort_order: number };
type AgreementItem = { id: string; description: string; item_snapshot_json: Json | null };
type Bridge = { billing_installment_id: string };
type ExistingInvoice = { primary_billing_installment_id: string | null };
type AuditEvent = { id: string; event_type: string; actor_name: string | null; actor_email: string | null; created_at: string };
type AdapterValue = HistoricalClassificationValue;
type CreateAttempt = { fingerprint: string; requestId: string };

const classifications = ["professional_fee", "additional_service", "reimbursable_expense", "government_or_court_fee", "other"] as const;

export default function InvoiceComposerPage() {
  const { t } = useI18n();
  return <Suspense fallback={<div className={styles.loading}>{t("finance.invoice.composer.loading")}</div>}><QuotationGuard canAccess={(access) => access.permissions.canEditFinanceQuotation && access.permissions.canManageFinanceBillableCharges}>{(access) => <InvoiceComposer permissions={access.permissions} />}</QuotationGuard></Suspense>;
}

function InvoiceComposer({ permissions }: { permissions: UserPermissions }) {
  const { locale, t, text, date } = useI18n();
  const canApproveInstallment = permissions.canApproveFinanceBillableCharges;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentItems, setInstallmentItems] = useState<InstallmentItem[]>([]);
  const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [invoiceHistory, setInvoiceHistory] = useState<ExistingInvoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<FinanceBankAccount[]>([]);
  const [clientId, setClientId] = useState("");
  const [installmentId, setInstallmentId] = useState("");
  const [chargeIds, setChargeIds] = useState<string[]>([]);
  const [adapter, setAdapter] = useState<Record<string, AdapterValue>>({});
  const [activeAdapterItemId, setActiveAdapterItemId] = useState("");
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);
  const [createChargeOpen, setCreateChargeOpen] = useState(false);
  const [languageCode, setLanguageCode] = useState<"th" | "en">("th");
  const [dueDate, setDueDate] = useState("");
  const [paymentTermsText, setPaymentTermsText] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [detailChargeId, setDetailChargeId] = useState("");
  const [detailAudits, setDetailAudits] = useState<AuditEvent[]>([]);
  const [detailAuditLoading, setDetailAuditLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<UiMessage | string>("");
  const [fieldError, setFieldError] = useState<UiMessage | string>("");
  const [sourceNotice, setSourceNotice] = useState<UiMessage | string>("");
  const [sourceError, setSourceError] = useState<UiMessage | string>("");
  const requestRef = useRef<CreateAttempt | null>(null);
  const submitLock = useRef(false);
  const reviewRef = useRef<HTMLElement | null>(null);
  const prefillHandled = useRef(false);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    const [clientResult, caseResult, advisoryResult, chargeResult, planResult, agreementResult, installmentResult, installmentItemResult, agreementItemResult, bridgeResult, invoiceResult, bankResult] = await Promise.all([
      supabase.from("clients").select("id,name,client_type").order("name"),
      supabase.from("cases").select("id,client_id,file_no,title"),
      supabase.from("advisory_matters").select("id,client_id,matter_no,title"),
      supabase.from("finance_billable_charges").select("id,client_id,case_id,advisory_matter_id,source_type,client_cost_funding_mode,description,quantity,unit,currency,service_date,economic_classification,price_tax_mode,vat_rate,vat_treatment_json,amount_before_vat,vat_amount,total_amount,status,source_reference").eq("status", "ready_to_invoice").neq("source_type", "billing_installment_item").order("service_date"),
      supabase.from("finance_billing_plans").select("id,fee_agreement_id,title,status,currency").eq("status", "active"),
      supabase.from("finance_fee_agreements").select("id,client_id,case_id,advisory_matter_id,title,agreement_no,status,engagement_basis,source_reference,language_code"),
      supabase.from("finance_billing_installments").select("id,billing_plan_id,installment_no,title,status,trigger_description,due_date,readiness_event_date,ready_to_invoice_at,readiness_confirmed_at,readiness_confirmed_by_user_id,readiness_evidence_json,amount_before_tax,vat_amount,total_amount").eq("status", "ready_to_invoice"),
      supabase.from("finance_billing_installment_items").select("id,billing_installment_id,fee_agreement_item_id,economic_classification,unit,amount_before_tax,vat_amount,total_amount,sort_order").order("billing_installment_id").order("sort_order"),
      supabase.from("finance_fee_agreement_items").select("id,description,item_snapshot_json"),
      supabase.from("finance_billing_installment_charge_bridges").select("billing_installment_id"),
      supabase.from("finance_invoices").select("primary_billing_installment_id").not("primary_billing_installment_id", "is", null),
      supabase.from("finance_bank_accounts").select("id,short_name,bank_name,account_name,account_number,is_active").order("short_name"),
    ]);
    const results = [clientResult, caseResult, advisoryResult, chargeResult, planResult, agreementResult, installmentResult, installmentItemResult, agreementItemResult, bridgeResult, invoiceResult, bankResult];
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      console.error("LOAD INVOICE COMPOSER FAILED", firstError);
      setError(uiMessage("finance.invoice.composer.loadFailed"));
    } else {
      setClients((clientResult.data || []) as Client[]); setCases((caseResult.data || []) as CaseRow[]); setAdvisories((advisoryResult.data || []) as Advisory[]);
      setCharges((chargeResult.data || []) as Charge[]); setPlans((planResult.data || []) as Plan[]); setAgreements((agreementResult.data || []) as Agreement[]);
      setInstallments((installmentResult.data || []) as Installment[]); setInstallmentItems((installmentItemResult.data || []) as InstallmentItem[]);
      setAgreementItems((agreementItemResult.data || []) as AgreementItem[]); setBridges((bridgeResult.data || []) as Bridge[]);
      setInvoiceHistory((invoiceResult.data || []) as ExistingInvoice[]); setBankAccounts((bankResult.data || []) as FinanceBankAccount[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const planMap = useMemo(() => new Map(plans.map((row) => [row.id, row])), [plans]);
  const agreementMap = useMemo(() => new Map(agreements.map((row) => [row.id, row])), [agreements]);
  const agreementItemMap = useMemo(() => new Map(agreementItems.map((row) => [row.id, row])), [agreementItems]);
  const historyIds = useMemo(() => new Set(invoiceHistory.map((row) => row.primary_billing_installment_id).filter(Boolean)), [invoiceHistory]);
  const bridgeIds = useMemo(() => new Set(bridges.map((row) => row.billing_installment_id)), [bridges]);
  const eligibleInstallments = useMemo(() => installments.filter((row) => {
    const plan = planMap.get(row.billing_plan_id); const agreement = plan ? agreementMap.get(plan.fee_agreement_id) : null;
    return Boolean(plan && agreement && !historyIds.has(row.id) && completeReadiness(row));
  }), [agreementMap, historyIds, installments, planMap]);
  const clientInstallments = useMemo(() => eligibleInstallments.filter((row) => {
    const plan = planMap.get(row.billing_plan_id); const agreement = plan ? agreementMap.get(plan.fee_agreement_id) : null;
    return Boolean(clientId && agreement?.client_id === clientId);
  }), [agreementMap, clientId, eligibleInstallments, planMap]);
  const selectedInstallment = useMemo(() => clientInstallments.find((row) => row.id === installmentId) || null, [clientInstallments, installmentId]);
  const selectedPlan = selectedInstallment ? planMap.get(selectedInstallment.billing_plan_id) || null : null;
  const selectedAgreement = selectedPlan ? agreementMap.get(selectedPlan.fee_agreement_id) || null : null;
  const selectedCharges = useMemo(() => charges.filter((row) => chargeIds.includes(row.id)), [chargeIds, charges]);
  const missingVatCharges = selectedCharges.filter(row => Object.keys(validateChargeVat(savedChargeVat(row))).length);
  const anchor = selectedInstallment && selectedAgreement && selectedPlan
    ? { clientId: selectedAgreement.client_id, currency: selectedPlan.currency, caseId: selectedAgreement.case_id, advisoryId: selectedAgreement.advisory_matter_id }
    : selectedCharges[0] ? chargeContext(selectedCharges[0]) : null;
  const visibleCharges = useMemo(() => charges.filter((row) => row.client_id === clientId), [charges, clientId]);
  const selectedInstallmentItems = useMemo(() => installmentItems.filter((row) => row.billing_installment_id === installmentId), [installmentId, installmentItems]);
  const missingAdapterItems = useMemo(() => historicalInstallmentClassificationItems(selectedInstallmentItems, bridgeIds.has(installmentId)), [bridgeIds, installmentId, selectedInstallmentItems]);
  const missingAdapterItemIds = useMemo(() => new Set(missingAdapterItems.map((item) => item.id)), [missingAdapterItems]);
  const detailCharge = visibleCharges.find((row) => row.id === detailChargeId) || null;
  const eligibleAccounts = bankAccounts.filter(eligibleInvoicePaymentBankAccount);
  const requestedInstallmentId = searchParams.get("installment") || "";
  const requestedChargeIdsKey = [...new Set(searchParams.getAll("charge"))].join(",");
  const requestedChargeIds = useMemo(() => requestedChargeIdsKey ? requestedChargeIdsKey.split(",") : [], [requestedChargeIdsKey]);
  const requestedClientId = searchParams.get("client") || "";
  const guidedMode = invoiceCompositionMode(requestedInstallmentId) === "billing_plan_guided";
  const openedFromSource = Boolean(requestedInstallmentId || requestedChargeIds.length);
  const requestedInstallment = installments.find((row) => row.id === requestedInstallmentId) || null;
  const requestedPlan = requestedInstallment ? planMap.get(requestedInstallment.billing_plan_id) || null : null;
  const sourceBackHref = requestedInstallmentId ? requestedPlan ? `/finance/billing-plans/${requestedPlan.id}` : "/finance/billing-plans" : "/finance/billable-charges";
  const sourceBackLabel = requestedInstallmentId ? t("finance.invoice.ui.backToPlan") : t("finance.invoice.composer.backToCharges");
  const editCompositionHref = requestedPlan && requestedInstallmentId
    ? billingPlanInvoiceSelectionResumeHref(requestedPlan.id, requestedInstallmentId, requestedChargeIds)
    : sourceBackHref;
  const totals = useMemo(() => {
    const rows = selectedCharges.reduce((sum, row) => ({ before: sum.before + Number(row.amount_before_vat), vat: sum.vat + Number(row.vat_amount), total: sum.total + Number(row.total_amount) }), { before: 0, vat: 0, total: 0 });
    return selectedInstallment ? { before: rows.before + Number(selectedInstallment.amount_before_tax), vat: rows.vat + Number(selectedInstallment.vat_amount), total: rows.total + Number(selectedInstallment.total_amount) } : rows;
  }, [selectedCharges, selectedInstallment]);
  const sourceSummary = guidedInvoiceSourceSummary({
    client: clients.find((row) => row.id === clientId)?.name,
    matter: selectedAgreement ? matterLabel(selectedAgreement.case_id, selectedAgreement.advisory_matter_id, cases, advisories, locale) : t("finance.invoice.composer.generalContext"),
    quotationReference: selectedAgreement?.source_reference,
    installmentNo: selectedInstallment?.installment_no,
  }, locale);

  useEffect(() => {
    if (loading || prefillHandled.current) return;
    prefillHandled.current = true;
    setSourceError("");
    setSourceNotice("");

    if ((requestedInstallmentId && !isUuid(requestedInstallmentId)) || requestedChargeIds.some((id) => !isUuid(id))) {
      setSourceError(uiMessage("finance.invoice.composer.invalidSourceLink"));
      return;
    }

    if (requestedInstallmentId) {
      const installment = eligibleInstallments.find((row) => row.id === requestedInstallmentId);
      if (!installment) {
        setSourceError(uiMessage("finance.invoice.composer.installmentIneligible"));
        return;
      }
      if (!canApproveInstallment) {
        setSourceError(uiMessage("finance.invoice.composer.installmentPermission"));
        return;
      }
      const plan = planMap.get(installment.billing_plan_id);
      const agreement = plan ? agreementMap.get(plan.fee_agreement_id) : null;
      if (!plan || !agreement) {
        setSourceError(uiMessage("finance.invoice.composer.planMissing"));
        return;
      }
      if (requestedClientId && requestedClientId !== agreement.client_id) {
        setSourceError(uiMessage("finance.invoice.composer.planClientMismatch"));
        return;
      }
      const requestedCharges = requestedChargeIds.map((id) => charges.find((row) => row.id === id)).filter((row): row is Charge => Boolean(row));
      const installmentContext = { clientId: agreement.client_id, currency: plan.currency, caseId: agreement.case_id, advisoryId: agreement.advisory_matter_id };
      if (requestedCharges.length !== requestedChargeIds.length || requestedCharges.some((charge) => incompatibilityReason(charge, installmentContext))) {
        setSourceError(uiMessage("finance.invoice.composer.chargeContextMismatch"));
        return;
      }
      const nextItems = historicalInstallmentClassificationItems(
        installmentItems.filter((row) => row.billing_installment_id === installment.id),
        bridgeIds.has(installment.id),
      );
      setClientId(agreement.client_id);
      setInstallmentId(installment.id);
      setChargeIds(requestedCharges.map((charge) => charge.id));
      setAdapter(Object.fromEntries(nextItems.map((row) => [row.id, { economicClassification: "", unit: row.unit || "", confirmed: false }])));
      setLanguageCode(agreement.language_code === "en" ? "en" : "th");
      const documentDefaults = guidedInvoiceDocumentDefaults({
        dueDate: installment.due_date,
        billingTrigger: installment.trigger_description,
      });
      setDueDate(documentDefaults.dueDate);
      setPaymentTermsText(documentDefaults.paymentInstructions);
      setSourceNotice(uiMessage(requestedCharges.length ? "finance.invoice.composer.selectedMixed" : "finance.invoice.composer.selectedInstallment", { number: installment.installment_no, count: requestedCharges.length }));
      return;
    }

    if (requestedChargeIds.length) {
      const requestedCharges = requestedChargeIds.map((id) => charges.find((row) => row.id === id)).filter((row): row is Charge => Boolean(row));
      const firstCharge = requestedCharges[0];
      if (requestedCharges.length !== requestedChargeIds.length || !firstCharge || requestedCharges.some((charge) => incompatibilityReason(charge, chargeContext(firstCharge)))) {
        setSourceError(uiMessage("finance.invoice.composer.sourceUnavailable"));
        return;
      }
      if (requestedClientId && requestedClientId !== firstCharge.client_id) {
        setSourceError(uiMessage("finance.invoice.composer.chargeClientMismatch"));
        return;
      }
      setClientId(firstCharge.client_id);
      setInstallmentId("");
      setChargeIds(requestedCharges.map((charge) => charge.id));
      setAdapter({});
      setSourceNotice(uiMessage("finance.invoice.composer.selectedCharges", { count: requestedCharges.length }));
      return;
    }

    if (requestedClientId && clients.some((client) => client.id === requestedClientId)) setClientId(requestedClientId);
  }, [agreementMap, bridgeIds, canApproveInstallment, charges, clients, eligibleInstallments, installmentItems, loading, planMap, requestedChargeIds, requestedClientId, requestedInstallmentId]);

  const resetReview = () => { if (!guidedMode) setReviewing(false); setAcknowledged(false); setFieldError(""); };
  const selectClient = (value: string) => { setClientId(value); setInstallmentId(""); setChargeIds([]); setAdapter({}); setActiveAdapterItemId(""); requestRef.current = null; resetReview(); };
  const selectInstallment = (value: string) => {
    setInstallmentId(value); setChargeIds([]); setActiveAdapterItemId(""); resetReview(); requestRef.current = null;
    const nextItems = historicalInstallmentClassificationItems(
      installmentItems.filter((row) => row.billing_installment_id === value),
      bridgeIds.has(value),
    );
    setAdapter(Object.fromEntries(nextItems.map((row) => [row.id, { economicClassification: "", unit: row.unit || "", confirmed: false }])));
  };
  const toggleCharge = (charge: Charge) => {
    const reason = incompatibilityReason(charge, anchor);
    if (reason && !chargeIds.includes(charge.id)) return;
    setChargeIds((current) => current.includes(charge.id) ? current.filter((id) => id !== charge.id) : [...current, charge.id]);
    requestRef.current = null; resetReview();
  };
  const openChargeDetail = async (id: string) => {
    setDetailChargeId(id); setDetailAudits([]); setDetailAuditLoading(true);
    const result = await supabase.from("finance_billable_charge_audit_events").select("id,event_type,actor_name,actor_email,created_at").eq("charge_id", id).order("created_at");
    if (result.error) console.error("LOAD INVOICE COMPOSER CHARGE AUDIT FAILED", result.error);
    setDetailAudits((result.data || []) as AuditEvent[]); setDetailAuditLoading(false);
  };
  const closeChargeDetail = () => { setDetailChargeId(""); setDetailAudits([]); setDetailAuditLoading(false); };

  const openReview = () => {
    if (!clientId) return setFieldError(uiMessage("finance.invoice.composer.clientRequired"));
    if (!installmentId && chargeIds.length === 0) return setFieldError(uiMessage("finance.invoice.composer.sourceRequired"));
    if (missingVatCharges.length) return setFieldError(uiMessage("finance.charge.vat.sourceBlocker", { description: missingVatCharges[0].description || t("finance.invoice.ui.item") }));
    const firstMissingClassification = missingAdapterItems.find((item) => !adapter[item.id]?.economicClassification || !adapter[item.id]?.confirmed);
    if (firstMissingClassification) {
      setActiveAdapterItemId(firstMissingClassification.id);
      requestAnimationFrame(() => document.getElementById(`classification-${firstMissingClassification.id}`)?.focus());
      return setFieldError(uiMessage("finance.invoice.composer.classificationRequired"));
    }
    setFieldError(""); setReviewing(true);
    requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const createDraft = async () => {
    if ((!guidedMode && !reviewing) || !acknowledged || submitLock.current || submitting) return;
    if (missingVatCharges.length) return setFieldError(uiMessage("finance.charge.vat.sourceBlocker", { description: missingVatCharges[0].description || t("finance.invoice.ui.item") }));
    const adapterPayload = missingAdapterItems.length ? {
      schema_version: "1", human_confirmed: true,
      items: Object.fromEntries(missingAdapterItems.map((item) => [item.id, { economic_classification: adapter[item.id]?.economicClassification, unit: adapter[item.id]?.unit || null, human_confirmed: true }])),
    } : {};
    const payloadFingerprint = JSON.stringify({ installmentId: installmentId || null, chargeIds: [...chargeIds].sort(), adapterPayload, languageCode, dueDate, paymentTermsText: paymentTermsText.trim(), customerNote: customerNote.trim(), internalNote: internalNote.trim(), bankAccountId: bankAccountId || null });
    if (!requestRef.current || requestRef.current.fingerprint !== payloadFingerprint) requestRef.current = { fingerprint: payloadFingerprint, requestId: crypto.randomUUID() };
    submitLock.current = true; setSubmitting(true); setError("");
    try {
      const result = await supabase.rpc("create_finance_invoice_v2_draft", {
        p_request_id: requestRef.current.requestId,
        p_billing_installment_id: installmentId || null,
        p_charge_ids: chargeIds,
        p_adapter_certification_json: adapterPayload,
        p_human_confirmed: true,
        p_language_code: languageCode,
        p_due_date: dueDate || null,
        p_customer_note: customerNote || null,
        p_payment_terms_text: paymentTermsText || null,
        p_internal_note: internalNote || null,
        p_payment_destination_bank_account_id: bankAccountId || null,
      });
      if (result.error) throw result.error;
      router.push(`/finance/invoices/${String(result.data)}`);
    } catch (createError) {
      console.error("CREATE INVOICE COMPOSITION FAILED", createError);
      setError(invoiceErrorMessage(createError, uiMessage("finance.invoice.composer.createFailed")));
      await load();
    } finally {
      submitLock.current = false; setSubmitting(false);
    }
  };

  if (loading) return <div className={styles.loading}>{t("finance.invoice.composer.loading")}</div>;
  return <div className={styles.page}>
    {createChargeOpen ? <BillableChargeCreateModal
      clients={clients} cases={cases} advisories={advisories} lockClient={Boolean(clientId)}
      initialSelection={{ clientId, matterMode: "unlinked", caseId: "", advisoryMatterId: "" }}
      context={anchor ? { clientId: anchor.clientId, clientName: clients.find(row => row.id === anchor.clientId)?.name || t("finance.invoice.composer.unnamedClient"), caseId: anchor.caseId, advisoryMatterId: anchor.advisoryId, matterLabel: matterLabel(anchor.caseId, anchor.advisoryId, cases, advisories, locale) } : undefined}
      canManage={permissions.canManageFinanceBillableCharges} canApprove={permissions.canApproveFinanceBillableCharges}
      continueToReady onClose={() => setCreateChargeOpen(false)}
      onSaved={async () => { await load(true); setSourceNotice(uiMessage("finance.charge.modal.composerDraftSaved")); }}
      onReady={async () => { await load(true); setSourceNotice(uiMessage("finance.charge.modal.composerReady")); }}
    /> : null}
    <FinanceSubNav activePage="invoices" permissions={permissions} />
    <InvoiceWorkspaceNav activePage={guidedMode ? undefined : "invoices"} quiet={guidedMode} showAdditionalCharges={permissions.canViewFinanceBillableCharges} />
    {openedFromSource ? <div className={styles.contextNavigation}><Link className={styles.contextBackLink} href={sourceBackHref}>← {guidedMode ? t("finance.invoice.composer.backPlan") : sourceBackLabel}</Link></div> : null}
    <header className={styles.header}><div><span className={styles.eyebrow}>{guidedMode ? t("finance.invoice.composer.billing") : t("finance.invoice.composer.compose")}</span><h1>{guidedMode ? t("finance.invoice.composer.review") : t("finance.invoice.composer.compose")}</h1><p>{guidedMode ? t("finance.invoice.composer.guidedReviewHelp") : t("finance.invoice.composer.reviewHelp")}</p></div></header>
    {openedFromSource ? <div className={styles.sourceSafety}><strong>{t("finance.invoice.composer.noDataCreated")}</strong><span>{t("finance.invoice.composer.noDataCreatedHelp")}</span></div> : null}
    {sourceError ? <div role="alert" className={styles.error}>{text(sourceError)}</div> : null}
    {sourceNotice && !guidedMode ? <div role="status" className={styles.notice}>{text(sourceNotice)}</div> : null}
    {error ? <div role="alert" className={styles.error}>{text(error)}</div> : null}

    {guidedMode ? <>
      <section className={`${styles.surface} ${styles.compactSource}`}>
        <div className={styles.sourceSummary}><div><span className={styles.sourceLabel}>{t("finance.invoice.composer.source")}</span><strong>{sourceSummary.client}</strong><span>{sourceSummary.matter}</span><span>{sourceSummary.trail}</span></div><button className={styles.detailButton} type="button" onClick={() => setSourceDetailsOpen(true)}>{t("finance.invoice.composer.sourceDetailsAction")}</button></div>
      </section>
      <section className={styles.surface}><SectionHeader title={t("finance.invoice.composer.charges")} text={t("finance.invoice.composer.guidedCompositionHelp")} action={<Link className={styles.secondaryButton} href={editCompositionHref}>{t("finance.invoice.composer.editComposition")}</Link>} />
        <div className={styles.sourceLineList}>
          {selectedInstallment ? selectedInstallmentItems.length ? selectedInstallmentItems.map((item) => <InstallmentSourceLine key={item.id} item={item} itemCount={selectedInstallmentItems.length} installment={selectedInstallment} agreementItem={agreementItemMap.get(item.fee_agreement_item_id)} currency={selectedPlan?.currency || "THB"} requiresClassification={missingAdapterItemIds.has(item.id)} adapterValue={adapter[item.id]} editorOpen={activeAdapterItemId === item.id} onToggleEditor={() => setActiveAdapterItemId((current) => current === item.id ? "" : item.id)} onClassificationChange={(economicClassification) => { setAdapter((current) => updateHistoricalClassification(current, item.id, economicClassification, item.unit || "")); setActiveAdapterItemId(economicClassification ? "" : item.id); requestRef.current = null; resetReview(); }} />) : <div className={styles.sourceLine}><div className={styles.sourceLineMain}><div><strong>{t("finance.invoice.composer.plannedInstallmentPrefix")} {selectedInstallment.installment_no}</strong><small>{selectedInstallment.title}</small></div><strong>{money(selectedInstallment.total_amount, selectedPlan?.currency || "THB")}</strong></div></div> : null}
          {selectedCharges.map((charge) => <div className={styles.sourceLine} key={charge.id}><div className={styles.sourceLineMain}><div><strong>{charge.description || t("finance.invoice.ui.additionalCharges")}</strong><div className={styles.lineMetadata}><span className={styles.classificationChip}>{classificationLabel(charge.economic_classification, locale)}</span><ChargeVatSummary value={savedChargeVat(charge)} /></div></div><strong>{money(charge.total_amount, charge.currency)}</strong></div></div>)}
        </div>
      </section>
    </> : <>
    <section className={styles.surface}><SectionHeader title={t("finance.invoice.composer.clientContextStep")} text={t("finance.invoice.composer.clientContextHelp")} />
      <div className={styles.contextGrid}><Field label={t("finance.invoice.ui.customer")}><select value={clientId} onChange={(event) => selectClient(event.target.value)}><option value="">{t("finance.invoice.composer.selectClient")}</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || t("finance.invoice.composer.unnamedClient")}</option>)}</select></Field></div>
    </section>

    <section className={styles.surface}><SectionHeader title={t("finance.invoice.composer.planStep")} text={t("finance.invoice.composer.planSelectionHelp")} />
      {!clientId ? <div className={styles.notice}>{t("finance.invoice.composer.selectClientForInstallments")}</div> : <div className={styles.choiceList}>
        <label className={`${styles.installmentChoice} ${!installmentId ? styles.choiceSelected : ""}`}><input type="radio" name="installment" value="" checked={!installmentId} onChange={() => selectInstallment("")} /><span className={styles.choiceBody}><strong>{t("finance.invoice.composer.noInstallment")}</strong><small>{t("finance.invoice.composer.chargeOnly")}</small></span></label>
        {clientInstallments.map((row) => { const plan = planMap.get(row.billing_plan_id); const agreement = plan ? agreementMap.get(plan.fee_agreement_id) : null; return <label key={row.id} className={`${styles.installmentChoice} ${installmentId === row.id ? styles.choiceSelected : ""} ${!canApproveInstallment ? styles.choiceDisabled : ""}`}><input type="radio" name="installment" disabled={!canApproveInstallment} value={row.id} checked={installmentId === row.id} onChange={() => selectInstallment(row.id)} /><span className={styles.choiceBody}><strong>{t("finance.invoice.composer.installmentPrefix")} {row.installment_no} · {row.title || t("finance.invoice.ui.installment")}</strong><span>{agreement?.agreement_no || agreement?.title || t("finance.invoice.ui.engagement")} · {matterLabel(agreement?.case_id || null, agreement?.advisory_matter_id || null, cases, advisories, locale)}</span><small>{bridgeIds.has(row.id) ? t("finance.invoice.composer.certifiedStructure") : t("finance.invoice.composer.fixedAmounts")}</small></span><strong className={styles.choiceAmount}>{money(row.total_amount, plan?.currency || "THB")}</strong></label>; })}
        {!clientInstallments.length ? <div className={styles.notice}>{t("finance.invoice.composer.noEligibleInstallments")}</div> : null}
        {!canApproveInstallment && clientInstallments.length ? <p className={styles.fieldError}>{t("finance.invoice.composer.chargeOnlyPermission")}</p> : null}
      </div>}
      {missingAdapterItems.length ? <AdapterFields items={missingAdapterItems} adapter={adapter} agreementItemMap={agreementItemMap} currency={selectedPlan?.currency || "THB"} onChange={(itemId, value) => { setAdapter((current) => ({ ...current, [itemId]: value })); resetReview(); }} /> : null}
    </section>

    <section className={styles.surface}><SectionHeader title={t("finance.invoice.composer.chargesStep")} text={t("finance.invoice.composer.chargesSelectionHelp")} />
      {!clientId ? <div className={styles.notice}>{t("finance.invoice.composer.selectClientForCharges")}</div> : !visibleCharges.length ? <div className={styles.empty}>
        <p>{t("finance.invoice.composer.noReadyCharges")}</p>
        {permissions.canManageFinanceBillableCharges ? <button className={styles.primaryButton} type="button" onClick={() => setCreateChargeOpen(true)}>{t("finance.charge.ui.create")}</button> : null}
      </div> : <div className={styles.choiceList}>{visibleCharges.map((charge) => { const reason = incompatibilityReason(charge, anchor); const selected = chargeIds.includes(charge.id); return <div key={charge.id} className={`${styles.chargeChoice} ${selected ? styles.choiceSelected : ""} ${reason && !selected ? styles.choiceDisabled : ""}`}><input aria-label={t("finance.invoice.composer.selectCharge", { description: charge.description || t("finance.invoice.ui.item") })} type="checkbox" disabled={Boolean(reason && !selected)} checked={selected} onChange={() => toggleCharge(charge)} /><div className={styles.choiceBody}><strong>{charge.description || t("finance.invoice.ui.additionalCharges")}</strong><div className={styles.chargeMeta}><span>{date(charge.service_date)}</span><span>{classificationLabel(charge.economic_classification, locale)}</span><ChargeVatSummary value={savedChargeVat(charge)} /><span>{matterLabel(charge.case_id, charge.advisory_matter_id, cases, advisories, locale)}</span></div><div className={styles.chargeMeta}><span>{t("finance.invoice.ui.beforeVatShort")} {money(charge.amount_before_vat, charge.currency)}</span><span>VAT {money(charge.vat_amount, charge.currency)}</span><span className={styles.readyText}>{t("finance.invoice.ui.readyToInvoice")}</span></div>{reason && !selected ? <small className={styles.fieldError}>{text(reason)}</small> : null}<button className={styles.detailButton} type="button" onClick={() => void openChargeDetail(charge.id)}>{t("finance.invoice.ui.details")}</button></div><strong className={styles.choiceAmount}>{money(charge.total_amount, charge.currency)}</strong></div>; })}</div>}
    </section>
    </>}

    <section className={styles.surface}><SectionHeader title={guidedMode ? t("finance.invoice.composer.information") : t("finance.invoice.composer.informationStep")} text={guidedMode ? t("finance.invoice.composer.guidedInformationHelp") : t("finance.invoice.composer.informationHelp")} />
      <div className={`${styles.contextGrid} ${guidedMode ? styles.invoiceInfoGrid : ""}`}><Field label={t("finance.invoice.ui.dueDate")} helper={guidedMode ? t("finance.invoice.composer.dueDateHelp") : t("finance.invoice.composer.optional")}><input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); requestRef.current = null; resetReview(); }} /></Field>{!guidedMode ? <Field label={t("finance.invoice.ui.documentLanguage")}><select value={languageCode} onChange={(event) => { setLanguageCode(event.target.value === "en" ? "en" : "th"); requestRef.current = null; resetReview(); }}><option value="th">{t("finance.invoice.ui.thai")}</option><option value="en">{t("finance.invoice.ui.english")}</option></select></Field> : null}<Field label={t("finance.invoice.ui.bankAccount")} helper={t("finance.invoice.composer.bankHelp")}><select value={bankAccountId} onChange={(event) => { setBankAccountId(event.target.value); requestRef.current = null; resetReview(); }}><option value="">{t("finance.invoice.composer.notSelected")}</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{displayText(account.short_name)} — {displayText(account.bank_name)} · {displayText(account.account_number)}</option>)}</select></Field><Field label={t("finance.invoice.ui.paymentInstructions")} helper={t("finance.invoice.ui.instructionsOptional")} wide><textarea rows={3} value={paymentTermsText} onChange={(event) => { setPaymentTermsText(event.target.value); requestRef.current = null; resetReview(); }} /></Field><Field label={t("finance.invoice.ui.customerNote")}><textarea rows={3} value={customerNote} onChange={(event) => { setCustomerNote(event.target.value); requestRef.current = null; resetReview(); }} /></Field><Field label={t("finance.invoice.ui.internalNote")}><textarea rows={3} value={internalNote} onChange={(event) => { setInternalNote(event.target.value); requestRef.current = null; resetReview(); }} /></Field></div>
    </section>

    <section className={`${styles.surface} ${styles.summary}`}><SectionHeader title={t("finance.invoice.composer.selectionSummary")} text={t("finance.invoice.composer.summaryHelp")} />
      {selectedInstallment ? <div className={styles.summaryLine}><span>{t("finance.invoice.composer.plannedInstallmentPrefix")} {selectedInstallment.installment_no}</span><strong>{money(selectedInstallment.total_amount, selectedPlan?.currency || "THB")}</strong></div> : null}
      {missingVatCharges.map(charge => <div className={styles.notice} role="alert" key={charge.id}>
        <strong>{t("finance.charge.vat.sourceBlocker", { description: charge.description || t("finance.invoice.ui.item") })}</strong>
        <ul>{Object.entries(validateChargeVat(savedChargeVat(charge))).map(([key, message]) => <li key={key}>{text(message)}</li>)}</ul>
        <p>{t("finance.charge.vat.readyCorrection")}</p>
        <Link className={styles.secondaryButton} href={`/finance/billable-charges?charge=${encodeURIComponent(charge.id)}`}>{t("finance.charge.vat.reviewSource")}</Link>
      </div>)}
      {selectedCharges.map((charge) => <div key={charge.id} className={styles.summaryLine}><span>{charge.description || t("finance.invoice.ui.additionalCharges")}</span><strong>{money(charge.total_amount, charge.currency)}</strong></div>)}
      {!selectedInstallment && !selectedCharges.length ? <div className={styles.notice}>{t("finance.invoice.composer.emptySelection")}</div> : <dl className={styles.summaryTotals}><div><dt>{t("finance.invoice.ui.netAmount")}</dt><dd>{money(totals.before, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")}</dd></div><div><dt>VAT</dt><dd>{money(totals.vat, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")}</dd></div><div className={styles.grandTotal}><dt>{t("finance.invoice.composer.invoiceTotal")}</dt><dd>{money(totals.total, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")}</dd></div></dl>}
      {fieldError ? <p role="alert" className={styles.fieldError}>{text(fieldError)}</p> : null}{!guidedMode ? <div className={styles.reviewActions}><button className={styles.primaryButton} type="button" onClick={openReview}>{t("finance.invoice.composer.reviewBeforeCreate")}</button></div> : null}
    </section>

    {guidedMode || reviewing ? <section ref={reviewRef} className={`${styles.surface} ${styles.reviewSection}`}><SectionHeader title={t("finance.invoice.composer.confirmCreate")} text={t("finance.invoice.composer.confirmHelp")} />
      <dl className={styles.reviewGrid}><Review label={t("finance.invoice.ui.customer")} value={clients.find((row) => row.id === clientId)?.name || "-"} /><Review label={t("finance.invoice.ui.caseMatter")} value={anchor ? matterLabel(anchor.caseId, anchor.advisoryId, cases, advisories, locale) : t("finance.invoice.composer.generalContext")} /><Review label={t("finance.invoice.ui.planSource")} value={selectedInstallment ? t("finance.invoice.composer.installmentTitle", { number: selectedInstallment.installment_no, title: selectedInstallment.title }) : t("finance.invoice.composer.none")} /><Review label={t("finance.invoice.ui.additionalCharges")} value={t("finance.invoice.ui.itemsCount", { count: selectedCharges.length })} /><Review label="VAT" value={money(totals.vat, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")} /><Review label={t("finance.invoice.ui.total")} value={money(totals.total, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")} /><Review label={t("finance.invoice.composer.receivingAccount")} value={bankAccounts.find((row) => row.id === bankAccountId)?.short_name || t("finance.invoice.composer.notSelected")} /><Review label={t("finance.invoice.ui.dueDate")} value={dueDate || t("finance.invoice.ui.unspecified")} /></dl>
      <div className={styles.reservationNote}>{t("finance.invoice.composer.reservationHelp")}</div>
      <label className={styles.checkRow}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>{t("finance.invoice.composer.createAcknowledgement")}</span></label>
      <div className={styles.reviewActions}>{!guidedMode ? <button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => setReviewing(false)}>{t("finance.invoice.composer.backToEdit")}</button> : null}<button className={styles.primaryButton} type="button" disabled={!acknowledged || submitting} onClick={() => { if (missingAdapterItems.some((item) => !adapter[item.id]?.economicClassification || !adapter[item.id]?.confirmed)) { openReview(); return; } void createDraft(); }}>{submitting ? t("finance.invoice.composer.creating") : t("finance.invoice.composer.create")}</button></div>
    </section> : null}

    {detailCharge ? <DetailModal open title={detailCharge.description || t("finance.invoice.ui.additionalCharges")} subtitle={matterLabel(detailCharge.case_id, detailCharge.advisory_matter_id, cases, advisories, locale)} prominentValue={money(detailCharge.total_amount, detailCharge.currency)} onClose={closeChargeDetail}><div className={styles.modalContent}><dl className={styles.modalGrid}><Review label={t("finance.invoice.ui.date")} value={date(detailCharge.service_date)} /><Review label={t("finance.invoice.ui.status")} value={t("finance.invoice.ui.readyToInvoice")} /><Review label={t("finance.invoice.ui.chargeNature")} value={billableChargeNatureLabel(detailCharge.source_type, locale)} />{detailCharge.source_type === "recoverable_cost" ? <Review label={t("finance.invoice.ui.funding")} value={clientCostFundingModeLabel(detailCharge.client_cost_funding_mode, locale)} /> : null}<Review label={t("finance.invoice.ui.classification")} value={classificationLabel(detailCharge.economic_classification, locale)} /><Review label="VAT" value={taxLabel(detailCharge, locale)} /><Review label={t("finance.invoice.ui.netAmount")} value={money(detailCharge.amount_before_vat, detailCharge.currency)} /><Review label="VAT" value={money(detailCharge.vat_amount, detailCharge.currency)} /><Review label={t("finance.invoice.ui.total")} value={money(detailCharge.total_amount, detailCharge.currency)} /><Review label={t("finance.invoice.ui.quantityUnit")} value={`${detailCharge.quantity} ${detailCharge.unit || t("finance.invoice.ui.unit")}`} /><Review label={t("finance.invoice.composer.reference")} value={detailCharge.source_reference || "-"} /></dl><ChargeAuditHistory audits={detailAudits} loading={detailAuditLoading} /></div></DetailModal> : null}
    {guidedMode && sourceDetailsOpen ? <DetailModal open title={t("finance.invoice.composer.sourceDetails")} subtitle={sourceSummary.client} onClose={() => setSourceDetailsOpen(false)}><dl className={styles.modalGrid}><Review label={t("finance.invoice.ui.customer")} value={sourceSummary.client} /><Review label={t("finance.invoice.composer.matter")} value={sourceSummary.matter} /><Review label={t("finance.invoice.ui.quotation")} value={selectedAgreement?.source_reference || t("finance.invoice.composer.noReference")} /><Review label={t("finance.invoice.ui.feeAgreement")} value={selectedAgreement?.agreement_no || selectedAgreement?.title || "-"} /><Review label={t("finance.invoice.ui.billingPlan")} value={selectedPlan?.title || "-"} /><Review label={t("finance.invoice.composer.billingInstallment")} value={selectedInstallment ? t("finance.invoice.composer.installmentTitle", { number: selectedInstallment.installment_no, title: selectedInstallment.title }) : "-"} /><Review label={t("finance.invoice.ui.currency")} value={selectedPlan?.currency || "THB"} /><Review label={t("finance.invoice.ui.documentLanguage")} value={languageCode === "en" ? t("finance.invoice.ui.english") : t("finance.invoice.ui.thai")} /></dl></DetailModal> : null}
  </div>;
}

function SectionHeader({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className={styles.sectionHeader}><div><h2>{title}</h2><p>{text}</p></div>{action}</div>; }
function Field({ label, helper, wide, children }: { label: string; helper?: string; wide?: boolean; children: ReactNode }) { return <label className={`${styles.field} ${wide ? styles.wide : ""}`}><span>{label}</span>{children}{helper ? <small>{helper}</small> : null}</label>; }
function Review({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function InstallmentSourceLine({ item, itemCount, installment, agreementItem, currency, requiresClassification, adapterValue, editorOpen, onToggleEditor, onClassificationChange }: { item: InstallmentItem; itemCount: number; installment: Installment; agreementItem?: AgreementItem; currency: string; requiresClassification: boolean; adapterValue?: AdapterValue; editorOpen: boolean; onToggleEditor: () => void; onClassificationChange: (value: string) => void }) {
  const { locale, t } = useI18n();
  const selectedClassification = item.economic_classification || adapterValue?.economicClassification || "";
  const sourceLabel = t("finance.invoice.composer.plannedInstallment", { number: installment.installment_no });
  const lineDescription = agreementItem?.description || installment.title || t("finance.invoice.composer.installmentItem");

  return <div className={`${styles.sourceLine} ${requiresClassification && !selectedClassification ? styles.sourceLineWarning : ""}`}>
    <div className={styles.sourceLineMain}><div><strong>{itemCount === 1 ? sourceLabel : lineDescription}</strong><small>{itemCount === 1 ? lineDescription : sourceLabel}</small></div><strong>{money(item.total_amount, currency)}</strong></div>
    <div className={styles.lineMetadata}>
      {selectedClassification ? <span className={styles.classificationChip}>{classificationLabel(selectedClassification, locale)}</span> : requiresClassification ? <span className={styles.missingClassification}>{t("finance.invoice.composer.classificationMissing")}</span> : <span className={styles.classificationChip}>{t("finance.invoice.composer.certifiedClassification")}</span>}
      <span>VAT {money(item.vat_amount, currency)}</span>
      {requiresClassification ? <button className={styles.lineAction} type="button" aria-expanded={editorOpen} aria-controls={`classification-editor-${item.id}`} onClick={onToggleEditor}>{selectedClassification ? t("finance.invoice.composer.changeClassification") : t("finance.invoice.composer.setClassification")}</button> : null}
    </div>
    {requiresClassification && editorOpen ? <div id={`classification-editor-${item.id}`} className={styles.lineEditor}><div><strong>{t("finance.invoice.ui.classification")}</strong><p>{lineDescription}  {t("finance.invoice.composer.totalSeparator")} {money(item.total_amount, currency)} · VAT {money(item.vat_amount, currency)}</p></div><select id={`classification-${item.id}`} aria-label={t("finance.invoice.composer.classificationFor", { description: lineDescription })} value={selectedClassification} onChange={(event) => onClassificationChange(event.target.value)}><option value="">{t("finance.invoice.composer.selectClassification")}</option>{classifications.map((id) => <option key={id} value={id}>{classificationLabel(id, locale)}</option>)}</select></div> : null}
  </div>;
}
function AdapterFields({ items, adapter, agreementItemMap, currency, onChange }: { items: InstallmentItem[]; adapter: Record<string, AdapterValue>; agreementItemMap: Map<string, AgreementItem>; currency: string; onChange: (id: string, value: AdapterValue) => void }) {
  const { locale, t } = useI18n();
  return <div className={styles.adapterPanel}><h3>{t("finance.invoice.composer.classificationHeading")}</h3><p>{t("finance.invoice.composer.classificationHelp")}</p><div className={styles.adapterRows}>{items.map((item) => { const agreementItem = agreementItemMap.get(item.fee_agreement_item_id); const value = adapter[item.id] || { economicClassification: "", unit: item.unit || "", confirmed: false }; return <div key={item.id} className={styles.adapterRow}><div><strong>{agreementItem?.description || t("finance.invoice.composer.installmentItem")}</strong><div className={styles.muted}>{t("finance.invoice.ui.total")} {money(item.total_amount, currency)} · VAT {money(item.vat_amount, currency)}</div></div><Field label={t("finance.invoice.ui.classification")}><select value={value.economicClassification} onChange={(event) => { const economicClassification = event.target.value; onChange(item.id, { ...value, economicClassification, confirmed: Boolean(economicClassification) }); }}><option value="">{t("finance.invoice.composer.selectClassification")}</option>{classifications.map((id) => <option key={id} value={id}>{classificationLabel(id, locale)}</option>)}</select></Field></div>; })}</div></div>;
}
function ChargeAuditHistory({ audits, loading }: { audits: AuditEvent[]; loading: boolean }) {
  const { locale, t, date } = useI18n(); return <details className={styles.auditDetails}><summary>{t("finance.invoice.ui.chargeHistory")}</summary>{loading ? <p>{t("finance.invoice.ui.historyLoading")}</p> : audits.length ? <ol>{audits.map((event) => <li key={event.id}><div><strong>{auditLabel(event.event_type, locale)}</strong><span>{event.actor_name || event.actor_email || t("finance.invoice.ui.systemUser")}</span></div><time>{date(event.created_at, true)}</time></li>)}</ol> : <p>{t("finance.invoice.ui.noHistory")}</p>}</details>; }
function completeReadiness(row: Installment) { return Boolean(row.readiness_event_date && row.ready_to_invoice_at && row.readiness_confirmed_at && row.readiness_confirmed_by_user_id && row.readiness_evidence_json && Object.keys(row.readiness_evidence_json).length); }
function chargeContext(charge: Charge) { return { clientId: charge.client_id, currency: charge.currency, caseId: charge.case_id, advisoryId: charge.advisory_matter_id }; }
function incompatibilityReason(charge: Charge, anchor: ReturnType<typeof chargeContext> | null) {
  if (!anchor) return "";
  if (charge.client_id !== anchor.clientId) return uiMessage("finance.invoice.composer.otherClient");
  if (charge.currency !== anchor.currency) return uiMessage("finance.invoice.composer.otherCurrency");
  if (charge.case_id !== anchor.caseId || charge.advisory_matter_id !== anchor.advisoryId) return charge.case_id || charge.advisory_matter_id ? uiMessage("finance.invoice.composer.otherMatter") : uiMessage("finance.invoice.composer.unlinkedMatterMismatch");
  return "";
}
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function matterLabel(caseId: number | null, advisoryId: string | null, cases: CaseRow[], advisories: Advisory[], locale: UiLocale) { const t = (key: string) => translate(locale, key); if (caseId) { const row = cases.find((item) => item.id === caseId); return row ? [row.file_no, row.title].filter(Boolean).join(" · ") : t("finance.invoice.composer.linkedCase"); } if (advisoryId) { const row = advisories.find((item) => item.id === advisoryId); return row ? [row.matter_no, row.title].filter(Boolean).join(" · ") : t("finance.invoice.composer.linkedAdvisory"); } return t("finance.invoice.composer.generalContext"); }
function classificationLabel(value: string | null, locale: UiLocale) { return value && classifications.some(id => id === value) ? translate(locale, `finance.invoice.classification.${value}`) : translate(locale, "finance.invoice.classification.unspecified"); }
function taxLabel(charge: Charge, locale: UiLocale) { const t = (key: string) => translate(locale, key); return charge.price_tax_mode === "non_vat" ? t("finance.invoice.ui.noVat") : charge.price_tax_mode === "vat_inclusive" ? translate(locale, "finance.invoice.ui.vatIncluded", { rate: Number(charge.vat_rate) }) : `VAT ${Number(charge.vat_rate)}%`; }
function auditLabel(value: string, locale: UiLocale) { const t = (key: string) => translate(locale, key); return value === "created" ? t("finance.invoice.ui.audit.created") : value === "draft_saved" ? t("finance.invoice.ui.audit.draftSaved") : value === "marked_ready" ? t("finance.invoice.ui.audit.ready") : value === "cancelled" ? t("finance.invoice.ui.audit.cancelled") : value; }
