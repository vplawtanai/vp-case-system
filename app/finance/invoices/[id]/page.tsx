"use client";

import { useI18n } from "../../../../lib/i18n/provider";
import { uiMessage, type UiMessage, type UiLocale } from "../../../../lib/i18n/core";
import { translate } from "../../../../lib/i18n/catalog";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { feeAgreementStatusLabel } from "../../fee-agreements/lifecycle";
import { supabase } from "../../../../lib/supabase";
import { paymentUiLabels, paymentErrorMessage, type EffectivePaymentAllocation, type FinancePayment, type InvoiceSettlement, type PaymentAllocationReallocation } from "../../payments/shared";
import InvoiceCompositionEditor from "../invoice-composition-editor";
import { InvoiceDocumentReadiness } from "../../document-decision/invoice-readiness";
import { InvoicePostPaymentDocuments } from "../../document-decision/invoice-post-payment";
import type { UserPermissions } from "../../../../lib/permissions";
import { invoiceDraftDatesAreValid, resolveInvoicePaymentInstructions } from "../payment-instructions";
import {
  bangkokToday,
  bankAccountPaymentDestination,
  displayText,
  economicClassificationLabel,
  eligibleInvoicePaymentBankAccount,
  invoiceCompositionSourceLabel,
  invoiceDraftFingerprint,
  invoiceDraftForm,
  invoiceInstallmentContext,
  invoiceItemEconomicClassification,
  invoiceItemSourceType,
  invoiceItemUnit,
  invoiceUiLabels,
  money,
  invoiceErrorMessage,
  snapshotPaymentDestination,
  sourceQuotationNo,
  type FinanceBankAccount,
  type FinanceInvoice,
  type FinanceInvoiceItem,
  type InvoiceDraftForm,
  type Json,
} from "../shared";

type BillingPlan = { id: string; title: string | null; status: string; billing_method: string };
type Installment = { id: string; installment_no: number; title: string; trigger_type: string; trigger_description: string | null; due_date: string | null; status: string; readiness_event_date: string | null; readiness_confirmed_at: string | null; readiness_reference: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string };
type FeeAgreement = { id: string; agreement_no: string | null; title: string; status: string; engagement_basis: "formal_agreement" | "accepted_quotation" | null; source_reference: string | null };
type V2Bridge = { id: string; billing_installment_id: string; billing_plan_id: string; fee_agreement_id: string; source_snapshot_json: Json };
type FormErrors = Partial<Record<"issueDate" | "dueDate" | "bankAccount", UiMessage>>;
type VoidFormErrors = Partial<Record<"reason" | "acknowledgement", UiMessage>>;
type InvoicePaymentAllocation = { payment_id: string; cash_allocated: number | string; wht_credit_allocated: number | string; settlement_total: number | string };

const invoiceSelect = "id,billing_plan_id,primary_billing_installment_id,fee_agreement_id,source_quotation_id,client_id,case_id,advisory_matter_id,source_model,v2_bridge_id,v2_creation_request_id,invoice_no,document_status,issue_date,due_date,currency,language_code,customer_note,payment_terms_text,payment_destination_bank_account_id,payment_destination_snapshot_json,internal_note,amount_before_vat,vat_amount,total_amount,seller_name_th,seller_name_en,seller_tax_id,seller_branch,seller_address,seller_phone,seller_email,seller_website,customer_name,customer_tax_id,customer_branch,customer_billing_address,customer_phone,customer_email,seller_snapshot_json,customer_snapshot_json,matter_snapshot_json,source_snapshot_json,issued_snapshot_json,issued_at,voided_at,void_reason,cancelled_at,cancel_reason,created_at,updated_at";
const itemSelect = "id,source_billable_charge_id,source_state,source_snapshot_json,description,source_quantity,source_unit_price,allocation_percent,vat_applicable,vat_rate,tax_category,price_tax_mode,amount_before_vat,vat_amount,line_total,sort_order";

export default function InvoiceDetailPage() {
  return <QuotationGuard>{(access) => <InvoiceWorkspace canManagePayments={access.permissions.canManageFinancePayments} canManageComposition={access.permissions.canEditFinanceQuotation && access.permissions.canManageFinanceBillableCharges} documentPermissions={access.permissions} />}</QuotationGuard>;
}

function InvoiceWorkspace({ canManagePayments, canManageComposition, documentPermissions }: { canManagePayments: boolean; canManageComposition: boolean; documentPermissions: UserPermissions }) {
  const { locale, t, text, date } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { statuses: invoiceStatusLabels, installments: installmentStatusLabels, triggers: triggerLabels } = invoiceUiLabels(locale);
  const { settlement: paymentSettlementLabels, settlementStatuses: settlementStatusLabels } = paymentUiLabels(locale);
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [installment, setInstallment] = useState<Installment | null>(null);
  const [agreement, setAgreement] = useState<FeeAgreement | null>(null);
  const [v2Bridge, setV2Bridge] = useState<V2Bridge | null>(null);
  const [settlement, setSettlement] = useState<InvoiceSettlement | null>(null);
  const [linkedPayments, setLinkedPayments] = useState<FinancePayment[]>([]);
  const [rawPaymentAllocations, setRawPaymentAllocations] = useState<InvoicePaymentAllocation[]>([]);
  const [effectivePaymentAllocations, setEffectivePaymentAllocations] = useState<EffectivePaymentAllocation[]>([]);
  const [paymentReallocations, setPaymentReallocations] = useState<PaymentAllocationReallocation[]>([]);
  const [bankAccounts, setBankAccounts] = useState<FinanceBankAccount[]>([]);
  const [form, setForm] = useState<InvoiceDraftForm>({ issueDate: "", dueDate: "", customerNote: "", paymentTermsText: "", paymentDestinationBankAccountId: "", internalNote: "", languageCode: "th" });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issueConfirmed, setIssueConfirmed] = useState(false);
  const [cancelPanelOpen, setCancelPanelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [voidPanelOpen, setVoidPanelOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidAcknowledged, setVoidAcknowledged] = useState(false);
  const [voidFormErrors, setVoidFormErrors] = useState<VoidFormErrors>({});
  const [error, setError] = useState<UiMessage | string>("");
  const [message, setMessage] = useState<UiMessage | string>("");
  const actionLock = useRef(false);
  const settingsRef = useRef<HTMLElement | null>(null);
  const issueDateRef = useRef<HTMLInputElement | null>(null);
  const dueDateRef = useRef<HTMLInputElement | null>(null);
  const bankAccountRef = useRef<HTMLSelectElement | null>(null);
  const voidPanelRef = useRef<HTMLDivElement | null>(null);
  const voidReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const voidAcknowledgementRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const invoiceResult = await supabase.from("finance_invoices").select(invoiceSelect).eq("id", id).maybeSingle();
    if (invoiceResult.error) {
      console.error("Failed to load Invoice", invoiceResult.error);
      setError(uiMessage("finance.invoice.ui.loadFailed")); setLoading(false); return;
    }
    if (!invoiceResult.data) { setError(uiMessage("finance.invoice.ui.notFound")); setLoading(false); return; }
    const invoiceRow = invoiceResult.data as FinanceInvoice;
    const bridgeResult = invoiceRow.v2_bridge_id
      ? await supabase.from("finance_billing_installment_charge_bridges").select("id,billing_installment_id,billing_plan_id,fee_agreement_id,source_snapshot_json").eq("id", invoiceRow.v2_bridge_id).maybeSingle()
      : { data: null, error: null };
    const bridge = (bridgeResult.data || null) as V2Bridge | null;
    const sourcePlanId = invoiceRow.billing_plan_id || bridge?.billing_plan_id || null;
    const sourceInstallmentId = invoiceRow.primary_billing_installment_id || bridge?.billing_installment_id || null;
    const sourceAgreementId = invoiceRow.fee_agreement_id || bridge?.fee_agreement_id || null;
    const [itemsResult, planResult, installmentResult, agreementResult, settlementResult, paymentAllocationsResult, effectiveAllocationsResult, paymentReallocationsResult, bankAccountsResult] = await Promise.all([
      supabase.from("finance_invoice_items").select(itemSelect).eq("invoice_id", id).order("sort_order").order("id"),
      sourcePlanId ? supabase.from("finance_billing_plans").select("id,title,status,billing_method").eq("id", sourcePlanId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      sourceInstallmentId ? supabase.from("finance_billing_installments").select("id,installment_no,title,trigger_type,trigger_description,due_date,status,readiness_event_date,readiness_confirmed_at,readiness_reference,amount_before_tax,vat_amount,total_amount").eq("id", sourceInstallmentId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      sourceAgreementId ? supabase.from("finance_fee_agreements").select("id,agreement_no,title,status,engagement_basis,source_reference").eq("id", sourceAgreementId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("finance_invoice_settlement_summary").select("*").eq("invoice_id", id).maybeSingle(),
      supabase.from("finance_payment_invoice_allocations").select("payment_id,cash_allocated,wht_credit_allocated,settlement_total").eq("invoice_id", id),
      supabase.from("finance_payment_effective_invoice_allocations").select("payment_id,invoice_id,effective_cash_allocated,effective_wht_credit_allocated,effective_settlement_total").eq("invoice_id", id),
      supabase.from("finance_payment_allocation_reallocations").select("id,payment_id,source_invoice_id,target_invoice_id,cash_moved,wht_moved,settlement_moved,reason,created_at").or(`source_invoice_id.eq.${id},target_invoice_id.eq.${id}`).order("created_at", { ascending: false }),
      supabase.from("finance_bank_accounts").select("id,short_name,bank_name,account_name,account_number,is_active").order("short_name"),
    ]);
    if (bridgeResult.error || itemsResult.error || planResult.error || installmentResult.error || agreementResult.error || settlementResult.error || paymentAllocationsResult.error || effectiveAllocationsResult.error || paymentReallocationsResult.error || bankAccountsResult.error) {
      console.error("Failed to load Invoice source context", { items: itemsResult.error, plan: planResult.error, installment: installmentResult.error, agreement: agreementResult.error, settlement: settlementResult.error, payments: paymentAllocationsResult.error, effectivePayments: effectiveAllocationsResult.error, paymentHistory: paymentReallocationsResult.error, bankAccounts: bankAccountsResult.error });
      setError(uiMessage("finance.invoice.ui.sourceLoadFailed"));
    }
    const rawAllocationRows = (paymentAllocationsResult.data || []) as InvoicePaymentAllocation[];
    const effectiveAllocationRows = (effectiveAllocationsResult.data || []) as EffectivePaymentAllocation[];
    const paymentReallocationRows = (paymentReallocationsResult.data || []) as PaymentAllocationReallocation[];
    const paymentIds = [...new Set([
      ...rawAllocationRows.map((row) => row.payment_id),
      ...effectiveAllocationRows.map((row) => row.payment_id),
      ...paymentReallocationRows.map((row) => row.payment_id),
    ])];
    const paymentsResult = paymentIds.length
      ? await supabase.from("finance_payments").select("id,draft_origin_invoice_id,internal_reference,client_id,currency,status,cash_amount,wht_amount,settlement_amount,received_on,payment_method,receiving_bank_account_id,receiving_account_reference,external_transaction_reference,payer_name,note,created_at,updated_at,confirmed_at,cancelled_at,cancel_reason,reversed_at,reverse_reason").in("id", paymentIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (paymentsResult.error) console.error("Failed to load linked Payments", paymentsResult.error);
    const sourceInstallment = (installmentResult.data || null) as Installment | null;
    const paymentInstructionState = resolveInvoicePaymentInstructions({
      documentStatus: invoiceRow.document_status,
      sourceModel: invoiceRow.source_model,
      v2BridgeId: invoiceRow.v2_bridge_id,
      createdAt: invoiceRow.created_at,
      paymentInstructions: invoiceRow.payment_terms_text,
      billingTrigger: sourceInstallment?.trigger_description,
    });
    const nextForm = {
      ...invoiceDraftForm(invoiceRow),
      paymentTermsText: paymentInstructionState.paymentInstructions,
    };
    setInvoice(invoiceRow);
    setItems((itemsResult.data || []) as FinanceInvoiceItem[]);
    setPlan((planResult.data || null) as BillingPlan | null);
    setInstallment(sourceInstallment);
    setAgreement((agreementResult.data || null) as FeeAgreement | null);
    setV2Bridge(bridge);
    setSettlement((settlementResult.data || null) as InvoiceSettlement | null);
    setLinkedPayments((paymentsResult.data || []) as FinancePayment[]);
    setRawPaymentAllocations(rawAllocationRows);
    setEffectivePaymentAllocations(effectiveAllocationRows);
    setPaymentReallocations(paymentReallocationRows);
    setBankAccounts((bankAccountsResult.data || []) as FinanceBankAccount[]);
    setForm(nextForm);
    setFormErrors({});
    setVoidFormErrors({});
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const fingerprint = useMemo(() => invoiceDraftFingerprint(form), [form]);
  const savedFingerprint = useMemo(
    () => invoice ? invoiceDraftFingerprint(invoiceDraftForm(invoice)) : "",
    [invoice],
  );
  const dirty = Boolean(invoice) && fingerprint !== savedFingerprint;
  const isDraft = invoice?.document_status === "draft";
  const isV2 = invoice?.source_model === "billable_charge_v2";
  const isIssued = invoice?.document_status === "issued";
  const isVoided = invoice?.document_status === "voided";
  const currentPaymentIds = useMemo(() => new Set(effectivePaymentAllocations.map((row) => row.payment_id)), [effectivePaymentAllocations]);
  const currentLinkedPayments = useMemo(() => linkedPayments.filter((payment) => currentPaymentIds.has(payment.id) && (payment.status === "draft" || payment.status === "confirmed")), [currentPaymentIds, linkedPayments]);
  const historicalLinkedPayments = useMemo(() => linkedPayments.filter((payment) => !currentPaymentIds.has(payment.id)), [currentPaymentIds, linkedPayments]);
  const activePaymentDraft = currentLinkedPayments.find((payment) => payment.status === "draft") || null;
  const effectiveConfirmedPayment = currentLinkedPayments.find((payment) => payment.status === "confirmed") || null;
  const hasEffectiveSettlement = Number(settlement?.economically_settled_amount || 0) > 0;
  const voidBlockedByPayment = Boolean(activePaymentDraft || effectiveConfirmedPayment || hasEffectiveSettlement);
  const eligibleBankAccounts = useMemo(() => bankAccounts.filter(eligibleInvoicePaymentBankAccount), [bankAccounts]);
  const selectedBankAccount = useMemo(
    () => bankAccounts.find((account) => account.id === form.paymentDestinationBankAccountId) || null,
    [bankAccounts, form.paymentDestinationBankAccountId],
  );
  const paymentInstructionState = useMemo(() => invoice ? resolveInvoicePaymentInstructions({
    documentStatus: invoice.document_status,
    sourceModel: invoice.source_model,
    v2BridgeId: invoice.v2_bridge_id,
    createdAt: invoice.created_at,
    paymentInstructions: invoice.payment_terms_text,
    billingTrigger: installment?.trigger_description,
  }) : null, [installment?.trigger_description, invoice]);

  const updateForm = <Key extends keyof InvoiceDraftForm>(key: Key, value: InvoiceDraftForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "issueDate" || key === "dueDate") setFormErrors((current) => ({ ...current, [key]: undefined }));
    if (key === "paymentDestinationBankAccountId") setFormErrors((current) => ({ ...current, bankAccount: undefined }));
    setMessage("");
  };

  const validateDraft = (requireIssueDate: boolean, requireBankAccount: boolean) => {
    const nextErrors: FormErrors = {};
    if (requireIssueDate && !form.issueDate) nextErrors.issueDate = uiMessage("finance.invoice.ui.issueDateRequired");
    if (!invoiceDraftDatesAreValid(form.issueDate, form.dueDate)) nextErrors.dueDate = uiMessage("finance.invoice.ui.dueDateInvalid");
    if (requireIssueDate && form.issueDate && form.issueDate > bangkokToday()) nextErrors.issueDate = uiMessage("finance.invoice.ui.futureIssueDate");
    if (requireBankAccount && !form.paymentDestinationBankAccountId) nextErrors.bankAccount = uiMessage("finance.invoice.ui.bankRequired");
    if (form.paymentDestinationBankAccountId && (!selectedBankAccount || !eligibleInvoicePaymentBankAccount(selectedBankAccount))) nextErrors.bankAccount = uiMessage("finance.invoice.ui.bankUnavailable");
    setFormErrors(nextErrors);
    const first = nextErrors.issueDate ? issueDateRef.current : nextErrors.dueDate ? dueDateRef.current : nextErrors.bankAccount ? bankAccountRef.current : null;
    if (first) requestAnimationFrame(() => { first.scrollIntoView({ behavior: "smooth", block: "center" }); first.focus(); });
    return Object.keys(nextErrors).length === 0;
  };

  const saveDraft = async () => {
    if (!invoice || !isDraft || !dirty || saving || actionLock.current || !validateDraft(false, false)) return;
    actionLock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("save_finance_invoice_draft", {
        p_invoice_id: invoice.id,
        p_issue_date: form.issueDate || null,
        p_due_date: form.dueDate || null,
        p_customer_note: form.customerNote,
        p_payment_terms_text: form.paymentTermsText,
        p_payment_destination_bank_account_id: form.paymentDestinationBankAccountId || null,
        p_internal_note: form.internalNote,
        p_language_code: form.languageCode,
      });
      if (result.error) throw result.error;
      await load();
      setMessage(uiMessage("finance.invoice.ui.saved"));
    } catch (saveError) {
      setError(invoiceErrorMessage(saveError, uiMessage("finance.invoice.ui.saveFailed")));
    } finally {
      actionLock.current = false; setSaving(false);
    }
  };

  const openIssueReview = () => {
    setError(""); setMessage("");
    if (!validateDraft(true, true)) return;
    if (dirty) {
      setError(uiMessage("finance.invoice.ui.saveBeforeIssue"));
      settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setIssueConfirmed(false); setIssuePanelOpen(true);
    requestAnimationFrame(() => document.getElementById("invoice-issue-confirmation")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const issueInvoice = async () => {
    if (!invoice || !isDraft || !issueConfirmed || issuing || actionLock.current) return;
    if (!validateDraft(true, true) || dirty) return;
    actionLock.current = true; setIssuing(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("issue_finance_invoice", { p_invoice_id: invoice.id, p_human_confirmed: true });
      if (result.error) throw result.error;
      setIssuePanelOpen(false);
      await load();
      setMessage(uiMessage("finance.invoice.ui.issued"));
    } catch (issueError) {
      setError(invoiceErrorMessage(issueError, uiMessage("finance.invoice.ui.issueFailed")));
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
      setMessage(invoice.source_model === "billable_charge_v2" ? uiMessage("finance.invoice.ui.compositionCancelled") : uiMessage("finance.invoice.ui.draftCancelled"));
    } catch (cancelError) {
      setError(invoiceErrorMessage(cancelError, uiMessage("finance.invoice.ui.cancelFailed")));
    } finally {
      actionLock.current = false; setCancelling(false);
    }
  };

  const openVoidPanel = () => {
    if (!invoice || !isIssued || voidBlockedByPayment) return;
    setError(""); setMessage(""); setVoidReason(""); setVoidAcknowledged(false); setVoidFormErrors({}); setVoidPanelOpen(true);
    requestAnimationFrame(() => voidPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const closeVoidPanel = () => {
    if (voiding) return;
    setVoidPanelOpen(false); setVoidReason(""); setVoidAcknowledged(false); setVoidFormErrors({});
  };

  const validateVoid = () => {
    const nextErrors: VoidFormErrors = {};
    if (!voidReason.trim()) nextErrors.reason = uiMessage("finance.invoice.ui.voidReasonRequired");
    if (voidReason.trim().length > 2000) nextErrors.reason = uiMessage("finance.invoice.ui.voidReasonLength");
    if (!voidAcknowledged) nextErrors.acknowledgement = uiMessage("finance.invoice.ui.voidAcknowledgementRequired");
    setVoidFormErrors(nextErrors);
    const first = nextErrors.reason ? voidReasonRef.current : nextErrors.acknowledgement ? voidAcknowledgementRef.current : null;
    if (first) requestAnimationFrame(() => { first.scrollIntoView({ behavior: "smooth", block: "center" }); first.focus(); });
    return Object.keys(nextErrors).length === 0;
  };

  const voidInvoice = async () => {
    if (!invoice || !isIssued || voiding || actionLock.current || voidBlockedByPayment || !validateVoid()) return;
    actionLock.current = true; setVoiding(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("void_finance_invoice", {
        p_invoice_id: invoice.id,
        p_reason: voidReason.trim(),
        p_acknowledged: voidAcknowledged,
      });
      if (result.error) throw result.error;
      setVoidPanelOpen(false); setVoidReason(""); setVoidAcknowledged(false); setVoidFormErrors({});
      await load();
      setMessage(invoice.source_model === "billable_charge_v2" ? uiMessage("finance.invoice.ui.compositionVoided") : uiMessage("finance.invoice.ui.installmentVoided"));
    } catch (voidError) {
      console.error("Failed to void Invoice", voidError);
      setError(invoiceErrorMessage(voidError, uiMessage("finance.invoice.ui.voidFailed")));
    } finally {
      actionLock.current = false; setVoiding(false);
    }
  };

  const createPaymentDraft = async () => {
    if (!invoice || invoice.document_status !== "issued" || !canManagePayments || creatingPayment || actionLock.current || Number(settlement?.outstanding_amount || 0) <= 0) return;
    actionLock.current = true; setCreatingPayment(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("create_finance_payment_draft_from_invoice", { p_invoice_id: invoice.id });
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Payment Draft ID was not returned");
      router.push(`/finance/payments/${String(result.data)}`);
    } catch (paymentError) {
      console.error("Failed to create Payment Draft", paymentError);
      setError(paymentErrorMessage(paymentError, uiMessage("finance.invoice.ui.paymentCreateFailed")));
    } finally {
      actionLock.current = false; setCreatingPayment(false);
    }
  };

  if (loading) return <main style={page}>{t("finance.invoice.ui.loading")}</main>;
  if (!invoice) return <main style={page}>{text(error) || t("finance.invoice.ui.notFound")}</main>;

  const matter = displayText(invoice.matter_snapshot_json?.title, displayText(invoice.matter_snapshot_json?.file_no, invoice.case_id || invoice.advisory_matter_id ? t("finance.invoice.ui.linkedMatter") : t("finance.invoice.ui.unlinkedMatter")));
  const engagementReference = agreement ? agreement.engagement_basis === "accepted_quotation" ? displayText(agreement.source_reference, agreement.title) : displayText(agreement.agreement_no, agreement.title) : "-";
  const installmentLabel = installment ? `${t("finance.invoice.ui.installmentNumber", { number: installment.installment_no })}${installment.title ? ` · ${installment.title}` : ""}` : "-";
  const invoiceSourceLabel = invoiceCompositionSourceLabel(invoice.source_model, items, engagementReference, locale);
  const issueInstallmentContext = isDraft && isV2
    ? invoiceInstallmentContext(invoice, items, v2Bridge, locale)
    : null;
  const paymentDestination = isDraft
    ? bankAccountPaymentDestination(selectedBankAccount)
    : snapshotPaymentDestination(invoice.issued_snapshot_json?.payment_destination);
  const activeItems = items.filter((item) => item.source_state === "active");

  return <main className="invoice-workspace" style={page}>
    <nav className="invoice-navigation-toolbar" style={navigationToolbar} aria-label={t("finance.invoice.ui.relatedNavigation")}>
      <NavigationLink href={isV2 ? "/finance/invoices" : `/finance/billing-plans/${invoice.billing_plan_id}`} icon="back" variant="back">{isV2 ? t("finance.invoice.ui.backToList") : t("finance.invoice.ui.backToPlan")}</NavigationLink>
      {invoice.fee_agreement_id ? <NavigationLink href={`/finance/fee-agreements/${invoice.fee_agreement_id}`} icon="document" variant="source">{t("finance.invoice.ui.openEngagement")}</NavigationLink> : null}
      {isV2 ? <NavigationLink href="/finance/billable-charges" icon="document" variant="source">{t("finance.invoice.ui.openCharges")}</NavigationLink> : null}
      {invoice.source_quotation_id ? <NavigationLink href={`/finance/quotations/${invoice.source_quotation_id}`} icon="document" variant="source">{t("finance.invoice.ui.openQuotation")}</NavigationLink> : null}
    </nav>

    {error ? <div role="alert" style={errorNotice}>{text(error)}</div> : null}
    {message ? <div role="status" style={successNotice}>{text(message)}</div> : null}

    <section style={{ ...surface, ...headerSurface }}>
      <div className="invoice-identity-header" style={identityHeader}>
        <div><span style={eyebrow}>{isDraft ? t("finance.invoice.ui.draftTitle") : "INVOICE"}</span><h1 style={title}>{isDraft ? t("finance.invoice.ui.draftTitle") : t("finance.invoice.ui.title")}</h1>{isDraft ? <p style={draftReference}>{t("finance.invoice.ui.draftReference")} {invoice.id.slice(0, 8).toUpperCase()}</p> : <div style={officialNumber}><small>{t("finance.invoice.ui.number")}</small><strong style={officialNumberValue}>{displayText(invoice.invoice_no)}</strong></div>}</div>
        <div className={`invoice-status-panel${isVoided ? " invoice-status-voided" : ""}`} style={{ ...statusPanel, ...(isIssued ? issuedStatusPanel : {}), ...(isVoided ? voidedStatusPanel : {}) }}><span style={metaLabel}>{t("finance.invoice.ui.documentStatus")}</span><StatusBadge status={invoice.document_status} label={invoiceStatusLabels[invoice.document_status] || invoice.document_status} />{invoice.issued_at ? <span style={updatedText}>{t("finance.invoice.ui.issuedAt")} {date(invoice.issued_at, true)}</span> : null}{invoice.voided_at ? <span style={voidedUpdatedText}>{t("finance.invoice.ui.voidedAt")} {date(invoice.voided_at, true)}</span> : null}<span style={updatedText}>{t("finance.invoice.ui.createdAt")} {date(invoice.created_at, true)}</span><span style={updatedText}>{t("finance.invoice.ui.updatedAt")} {date(invoice.updated_at, true)}</span></div>
      </div>
      {isDraft ? <div style={numberNotice}><strong>{t("finance.invoice.ui.unnumbered")}</strong><span>{t("finance.invoice.ui.numberOnIssue")}</span></div> : null}
      {invoice.document_status === "issued" ? <div style={issuedNotice}><strong>{t("finance.invoice.ui.issuedReadOnly")}</strong><span>{t("finance.invoice.ui.awaitPayment")}</span><span>{t("finance.invoice.ui.issueNotReceipt")}</span></div> : null}
      {isVoided ? <div style={voidedNotice}><strong>{t("finance.invoice.ui.voidedStatus")}</strong><span>{t("finance.invoice.ui.numberPrefix")} {displayText(invoice.invoice_no)}  {t("finance.invoice.ui.historicalNoPayment")}</span></div> : null}
      {invoice.document_status === "cancelled" ? <div style={cancelledNotice}><strong>{t("finance.invoice.ui.cancelledReadOnly")}</strong><span>{displayText(invoice.cancel_reason)}</span></div> : null}
    </section>

    <section style={sourceTrail}>
      <h2 style={compactHeading}>{t("finance.invoice.ui.lineage")}</h2>
      <div className="invoice-source-nodes" style={sourceNodes}>
        {!isV2 && invoice.source_quotation_id ? <><SourceNode label={t("finance.invoice.ui.quotation")}><Link href={`/finance/quotations/${invoice.source_quotation_id}`}>{sourceQuotationNo(invoice.source_snapshot_json, locale)}</Link></SourceNode><Arrow /></> : null}
        {!isV2 && invoice.fee_agreement_id ? <><SourceNode label={agreement?.engagement_basis === "accepted_quotation" ? t("finance.invoice.ui.quotationEngagement") : t("finance.invoice.ui.feeAgreement")}><Link href={`/finance/fee-agreements/${invoice.fee_agreement_id}`}>{engagementReference}</Link>{agreement ? <StatusBadge status={agreement.status} label={feeAgreementStatusLabel(agreement.status, locale)} /> : null}</SourceNode><Arrow /></> : null}
        {!isV2 && invoice.billing_plan_id ? <><SourceNode label={t("finance.invoice.ui.billingPlan")}><Link href={`/finance/billing-plans/${invoice.billing_plan_id}`}>{displayText(plan?.title, t("finance.invoice.ui.billingPlan"))}</Link></SourceNode><Arrow /></> : null}
        {!isV2 ? <><SourceNode label={t("finance.invoice.ui.installmentNumber", { number: installment?.installment_no || "-" })}>{displayText(installment?.title, t("finance.invoice.ui.installment"))}{installment ? <StatusBadge status={installment.status} label={installmentStatusLabels[installment.status] || installment.status} /> : null}</SourceNode><Arrow /></> : null}
        {isV2 && agreement && invoice.fee_agreement_id ? <><SourceNode label={t("finance.invoice.ui.engagement")}><Link href={`/finance/fee-agreements/${invoice.fee_agreement_id}`}>{engagementReference}</Link></SourceNode><Arrow /></> : null}
        {isV2 && plan && invoice.billing_plan_id ? <><SourceNode label={t("finance.invoice.ui.billingPlan")}><Link href={`/finance/billing-plans/${invoice.billing_plan_id}`}>{displayText(plan.title, t("finance.invoice.ui.billingPlan"))}</Link></SourceNode><Arrow /></> : null}
        {isV2 ? <><SourceNode label={t("finance.invoice.ui.billingSource")}>{invoiceSourceLabel}</SourceNode><Arrow /></> : null}
        <SourceNode label={isDraft ? t("finance.invoice.ui.draftTitle") : isVoided ? t("finance.invoice.ui.voidedTitle") : t("finance.invoice.ui.title")} current>{invoice.invoice_no || invoice.id.slice(0, 8).toUpperCase()}</SourceNode>
      </div>
    </section>

    <section style={surface}>
      <SectionHeading title={t("finance.invoice.ui.customerBilling")} description={t("finance.invoice.ui.customerSourceReadOnly")} />
      <div style={detailGrid}>
        <Field label={t("finance.invoice.ui.customer")} value={displayText(invoice.customer_name)} />
        <Field label={t("finance.invoice.ui.taxId")} value={displayText(invoice.customer_tax_id)} />
        <Field label={t("finance.invoice.ui.branch")} value={displayText(invoice.customer_branch)} />
        <Field label={t("finance.invoice.ui.matter")} value={matter} />
        <Field label={t("finance.invoice.ui.currency")} value={invoice.currency} />
        <Field label={t("finance.invoice.ui.dataSource")} value={invoiceSourceLabel} />
      </div>
      <div style={addressBlock}><span style={fieldLabel}>{t("finance.invoice.ui.billingAddress")}</span><strong>{displayText(invoice.customer_billing_address)}</strong>{invoice.customer_phone || invoice.customer_email ? <span>{[invoice.customer_phone, invoice.customer_email].filter(Boolean).join(" · ")}</span> : null}</div>
      {!invoice.customer_tax_id ? <div style={neutralWarning}>{t("finance.invoice.ui.customerTaxMissing")}</div> : null}
    </section>

    {!isV2 ? <section style={surface}>
      <SectionHeading title={t("finance.invoice.ui.readinessEvidence")} description={t("finance.invoice.ui.readinessDescription")} />
      <div style={detailGrid}>
        <Field label={t("finance.invoice.ui.installment")} value={installmentLabel} />
        <Field label={t("finance.invoice.ui.trigger")} value={displayText(installment?.trigger_description, triggerLabels[installment?.trigger_type || ""] || "-")} />
        <Field label={t("finance.invoice.ui.triggerDate")} value={installment?.readiness_event_date || "-"} />
        <Field label={t("finance.invoice.ui.readinessConfirmedAt")} value={date(installment?.readiness_confirmed_at, true)} />
        <Field label={t("finance.invoice.ui.evidenceReference")} value={displayText(installment?.readiness_reference)} />
        <Field label={t("finance.invoice.ui.installmentAmount")} value={money(installment?.total_amount, invoice.currency)} />
      </div>
    </section> : <section style={surface}><SectionHeading title={t("finance.invoice.ui.billingSource")} description={t("finance.invoice.ui.lineageReadOnly")} /><div style={detailGrid}><Field label={t("finance.invoice.ui.compositionType")} value={invoiceSourceLabel} /><Field label={t("finance.invoice.ui.plannedInstallment")} value={v2Bridge ? installmentLabel : t("finance.invoice.ui.notApplicable")} /><Field label={t("finance.invoice.ui.itemCount")} value={t("finance.invoice.ui.itemsCount", { count: activeItems.length })} /></div></section>}

    <section style={surface}>
      <SectionHeading title={t("finance.invoice.ui.feeItems")} description={isV2 ? t("finance.invoice.ui.selectedSourceReadOnly") : t("finance.invoice.ui.installmentItemsReadOnly")} />
      {activeItems.length === 0 ? <div style={neutralWarning}>{isDraft ? t("finance.invoice.ui.noDraftItems") : t("finance.invoice.ui.noItems")}</div> : <div style={tableScroll}><table className="invoice-item-table" style={table}><colgroup><col style={{ width: "42%" }} /><col style={{ width: "13%" }} /><col style={{ width: "15%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /></colgroup><thead><tr><th>{t("finance.invoice.ui.item")}</th><th>VAT</th><th>{t("finance.invoice.ui.beforeVat")}</th><th>VAT</th><th>{t("finance.invoice.ui.total")}</th></tr></thead><tbody>{activeItems.map((item) => { const quantityLabel = invoiceItemQuantityLabel(item, invoice.currency, locale); return <tr key={item.id}><td><strong>{item.description}</strong>{item.allocation_percent !== null ? <small style={itemMeta}>{t("finance.invoice.ui.sourceProportion")} {Number(item.allocation_percent).toLocaleString("en-US", { maximumFractionDigits: 4 })}%</small> : null}{isV2 ? <>{quantityLabel ? <small style={itemMeta}>{quantityLabel}</small> : null}<small style={itemMeta}>{invoiceItemClassificationLabel(item, locale)}</small><small style={itemMeta}>{invoiceItemSourceLabel(item, locale)}</small></> : null}</td><td>{item.vat_applicable ? `${Number(item.vat_rate)}%` : t("finance.invoice.ui.noVat")}</td><td>{money(item.amount_before_vat, invoice.currency)}</td><td>{money(item.vat_amount, invoice.currency)}</td><td><strong>{money(item.line_total, invoice.currency)}</strong></td></tr>; })}</tbody></table></div>}
      <div className="invoice-total-grid" style={totalsGrid}><Metric label={t("finance.invoice.ui.beforeVat")} value={money(invoice.amount_before_vat, invoice.currency)} /><Metric label="VAT" value={money(invoice.vat_amount, invoice.currency)} /><Metric label={t("finance.invoice.ui.total")} value={money(invoice.total_amount, invoice.currency)} prominent /></div>
    </section>

    {isV2 && isDraft ? <InvoiceCompositionEditor invoice={invoice} canManage={canManageComposition} onChanged={load} /> : null}

    {isDraft ? <section ref={settingsRef} id="invoice-draft-settings" style={surface} className="invoice-draft-settings">
      <SectionHeading title={t("finance.invoice.ui.documentInformation")} description={t("finance.invoice.ui.presentationOnly")} />
      <div style={formGrid}>
        <FormField label={t("finance.invoice.ui.issueDate")} required error={formErrors.issueDate}><input ref={issueDateRef} style={inputStyle(Boolean(formErrors.issueDate))} type="date" value={form.issueDate} disabled={saving} onChange={(event) => updateForm("issueDate", event.target.value)} /></FormField>
        <FormField label={t("finance.invoice.ui.dueDate")} helper={t("finance.invoice.ui.dueDateOptional")} error={formErrors.dueDate}><input ref={dueDateRef} style={inputStyle(Boolean(formErrors.dueDate))} type="date" value={form.dueDate} disabled={saving} onChange={(event) => updateForm("dueDate", event.target.value)} /></FormField>
        <FormField label={t("finance.invoice.ui.documentLanguage")}><select style={inputStyle(false)} value={form.languageCode} disabled={saving} onChange={(event) => updateForm("languageCode", event.target.value === "en" ? "en" : "th")}><option value="th">{t("finance.invoice.ui.thai")}</option><option value="en">{t("finance.invoice.ui.english")}</option></select></FormField>
      </div>
      <div className="invoice-bank-destination" style={bankDestinationPanel}>
        <FormField label={t("finance.invoice.ui.bankAccount")} required helper={t("finance.invoice.ui.bankPurpose")} error={formErrors.bankAccount}>
          <select ref={bankAccountRef} style={inputStyle(Boolean(formErrors.bankAccount))} value={form.paymentDestinationBankAccountId} disabled={saving} onChange={(event) => updateForm("paymentDestinationBankAccountId", event.target.value)}>
            <option value="">{t("finance.invoice.ui.bankSelect")}</option>
            {form.paymentDestinationBankAccountId && selectedBankAccount && !eligibleInvoicePaymentBankAccount(selectedBankAccount) ? <option value={selectedBankAccount.id} disabled>{displayText(selectedBankAccount.short_name)}  {t("finance.invoice.ui.bankInactive")}</option> : null}
            {eligibleBankAccounts.map((account) => <option key={account.id} value={account.id}>{displayText(account.short_name)} — {displayText(account.bank_name)} · {displayText(account.account_number)}</option>)}
          </select>
        </FormField>
        {paymentDestination ? <div style={bankDestinationSummary}><strong>{displayText(paymentDestination.bankName, displayText(paymentDestination.shortName))}</strong><span>{t("finance.invoice.ui.accountName")} {displayText(paymentDestination.accountName)}</span><span>{t("finance.invoice.ui.accountNumber")} {displayText(paymentDestination.accountNumber)}</span></div> : eligibleBankAccounts.length === 0 ? <div style={neutralWarning}>{t("finance.invoice.ui.noEligibleBank")}</div> : null}
      </div>
      <div style={notesGrid}>
        <FormField label={t("finance.invoice.ui.paymentInstructions")} helper={paymentInstructionState?.isLegacyAutoInheritedBillingTrigger ? t("finance.invoice.ui.triggerNotInstructions") : t("finance.invoice.ui.instructionsOptional")}><textarea style={textareaStyle} rows={4} value={form.paymentTermsText} disabled={saving} onChange={(event) => updateForm("paymentTermsText", event.target.value)} /></FormField>
        <FormField label={t("finance.invoice.ui.customerNote")} helper={t("finance.invoice.ui.customerNoteHelp")}><textarea style={textareaStyle} rows={4} value={form.customerNote} disabled={saving} onChange={(event) => updateForm("customerNote", event.target.value)} /></FormField>
        <FormField label={t("finance.invoice.ui.internalNote")} helper={t("finance.invoice.ui.internalNoteHelp")}><textarea style={textareaStyle} rows={4} value={form.internalNote} disabled={saving} onChange={(event) => updateForm("internalNote", event.target.value)} /></FormField>
      </div>
      <div style={saveRow}><span style={dirty ? unsavedState : savedState}>{dirty ? t("finance.invoice.ui.unsaved") : t("finance.invoice.ui.clean")}</span><button type="button" style={{ ...secondaryButton, ...(!dirty ? disabledButton : {}) }} disabled={!dirty || saving} onClick={() => void saveDraft()}>{saving ? t("finance.invoice.ui.saving") : dirty ? t("finance.invoice.ui.save") : t("finance.invoice.ui.clean")}</button></div>
    </section> : <section style={surface}>
      <SectionHeading title={t("finance.invoice.ui.documentInformation")} description={t("finance.invoice.ui.lockedInformation")} />
      <div style={readOnlyGrid}>
        <ReadOnlyValue label={t("finance.invoice.ui.issueDate")} value={date(invoice.issue_date)} />
        <ReadOnlyValue label={t("finance.invoice.ui.dueDate")} value={invoice.due_date ? date(invoice.due_date) : t("finance.invoice.ui.unspecified")} />
        <ReadOnlyValue label={t("finance.invoice.ui.language")} value={invoice.language_code === "en" ? t("finance.invoice.ui.english") : t("finance.invoice.ui.thai")} />
        <ReadOnlyValue label={t("finance.invoice.ui.bankAccount")} value={paymentDestination ? t("finance.invoice.ui.destinationSummary", { bank: displayText(paymentDestination.bankName, displayText(paymentDestination.shortName)), name: displayText(paymentDestination.accountName), number: displayText(paymentDestination.accountNumber) }) : t("finance.invoice.ui.noFrozenDestination")} multiline />
      </div>
      <div style={readOnlyNotesGrid}>
        <ReadOnlyValue label={t("finance.invoice.ui.paymentInstructions")} value={displayText(invoice.payment_terms_text, t("finance.invoice.ui.unspecified"))} multiline />
        <ReadOnlyValue label={t("finance.invoice.ui.customerNote")} value={displayText(invoice.customer_note, t("finance.invoice.ui.unspecified"))} multiline />
        <div style={internalNoteBlock}><ReadOnlyValue label={t("finance.invoice.ui.internalNote")} value={displayText(invoice.internal_note, t("finance.invoice.ui.unspecified"))} multiline /><small style={internalNoteHelper}>{t("finance.invoice.ui.internalOnly")}</small></div>
      </div>
    </section>}

    <section style={previewBand}>
      <div><span style={eyebrow}>{t("finance.invoice.ui.previewPrint")}</span><h2 style={previewTitle}>{isVoided ? t("finance.invoice.ui.viewHistorical") : t("finance.invoice.ui.reviewCustomerDocument")}</h2><p style={sectionDescription}>{isDraft ? t("finance.invoice.ui.draftPreviewHelp") : isVoided ? t("finance.invoice.ui.voidedPreviewHelp") : t("finance.invoice.ui.issuedPreviewHelp")}</p></div>
      <div style={previewActions}>{isDraft && dirty ? <><span style={{ ...secondaryButton, ...disabledButton }} aria-disabled="true">{t("finance.invoice.ui.preview")}</span><span style={{ ...primaryDarkButton, ...disabledButton }} aria-disabled="true">{t("finance.invoice.ui.print")}</span></> : <><Link style={secondaryButton} href={`/finance/invoices/${invoice.id}/preview`}>{t("finance.invoice.ui.preview")}</Link><Link style={primaryDarkButton} href={`/finance/invoices/${invoice.id}/preview?print=1`} target="_blank">{t("finance.invoice.ui.print")}</Link></>}</div>
      {isDraft && dirty ? <div style={{ ...neutralWarning, flexBasis: "100%", marginTop: 0 }}>{t("finance.invoice.ui.saveBeforePreview")}</div> : null}
    </section>

    {isVoided ? <section style={voidedHistorySection}>
      <span style={voidedHistoryEyebrow}>{t("finance.invoice.ui.history")}</span>
      <h2 style={voidedHistoryTitle}>{t("finance.invoice.ui.voidedNotice")}</h2>
      <p style={voidedHistoryDescription}>{t("finance.invoice.ui.numberRetained")}</p>
      <div className="invoice-voided-summary" style={voidedSummaryGrid}>
        <Field label={t("finance.invoice.ui.originalNumber")} value={displayText(invoice.invoice_no)} />
        <Field label={t("finance.invoice.ui.originalIssueDate")} value={date(invoice.issue_date)} />
        <Field label={t("finance.invoice.ui.voidedAt")} value={date(invoice.voided_at, true)} />
        <Field label={t("finance.invoice.ui.originalTotal")} value={money(invoice.total_amount, invoice.currency)} />
      </div>
      <div style={voidReasonBlock}><small style={fieldLabel}>{t("finance.invoice.ui.voidInternalReason")}</small><p>{displayText(invoice.void_reason)}</p></div>
      {linkedPayments.length ? <PaymentLinks title={t("finance.invoice.ui.paymentHistory")} payments={linkedPayments} effectiveAllocations={effectivePaymentAllocations} rawAllocations={rawPaymentAllocations} reallocations={paymentReallocations} invoiceId={invoice.id} historical /> : null}
      <div style={replacementNextStep}><strong>{isV2 ? t("finance.invoice.ui.replacementFromCharges") : t("finance.invoice.ui.replacementFromInstallment")}</strong><span>{isV2 ? t("finance.invoice.ui.replacementChargesHelp") : t("finance.invoice.ui.replacementInstallmentHelp")}</span><Link style={replacementButton} href={isV2 ? `/finance/invoices/compose?client=${invoice.client_id}` : `/finance/billing-plans/${invoice.billing_plan_id}`}>{t("finance.invoice.ui.createReplacement")}</Link></div>
    </section> : null}

    {invoice.document_status === "issued" ? <section style={nextStepZone}>
      <span style={nextStepEyebrow}>{t("finance.invoice.ui.payment")}</span><h2 style={nextStepTitle}>{t("finance.invoice.ui.settlementHeading")}</h2><p style={nextStepDescription}>{t("finance.invoice.ui.settlementAuthority")}</p>
      <div className="invoice-settlement-summary" style={settlementGrid}>
        <Metric label={t("finance.invoice.ui.invoiceAmount")} value={money(settlement?.invoice_gross_amount ?? invoice.total_amount, invoice.currency)} />
        <Metric label={paymentSettlementLabels.receivedFull} value={money(settlement?.confirmed_cash_allocated, invoice.currency)} />
        <Metric label={t("finance.invoice.ui.whtCredit")} value={money(settlement?.confirmed_wht_credit_allocated, invoice.currency)} />
        <Metric label={paymentSettlementLabels.settlementTotal} value={money(settlement?.economically_settled_amount, invoice.currency)} />
        <Metric label={t("finance.invoice.ui.outstanding")} value={money(settlement?.outstanding_amount, invoice.currency)} prominent />
        <div style={metric}><small>{t("finance.invoice.ui.settlementStatus")}</small><StatusBadge status={settlement?.payment_status || "unpaid"} label={settlementStatusLabels[settlement?.payment_status || "unpaid"] || t("finance.invoice.ui.unpaid")} /></div>
      </div>
      {currentLinkedPayments.length ? <PaymentLinks title={t("finance.invoice.ui.currentAllocations")} payments={currentLinkedPayments} effectiveAllocations={effectivePaymentAllocations} rawAllocations={rawPaymentAllocations} reallocations={paymentReallocations} invoiceId={invoice.id} /> : null}
      {historicalLinkedPayments.length ? <PaymentLinks title={t("finance.invoice.ui.previousAllocations")} payments={historicalLinkedPayments} effectiveAllocations={effectivePaymentAllocations} rawAllocations={rawPaymentAllocations} reallocations={paymentReallocations} invoiceId={invoice.id} historical /> : null}
      {Number(settlement?.outstanding_amount || 0) > 0 && canManagePayments ? <button type="button" style={paymentButton} disabled={creatingPayment} onClick={() => void createPaymentDraft()}>{creatingPayment ? t("finance.invoice.ui.openingPayment") : currentLinkedPayments.some((payment) => payment.status === "draft") ? t("finance.invoice.ui.openPaymentDraft") : t("finance.invoice.ui.recordPayment")}</button> : null}
      {Number(settlement?.outstanding_amount || 0) > 0 && !canManagePayments ? <p style={nextStepNote}>{t("finance.invoice.ui.paymentReadOnly")}</p> : null}
      {Number(settlement?.outstanding_amount || 0) <= 0 ? <p style={settledNote}>{t("finance.invoice.ui.fullySettled")}</p> : null}
    </section> : null}

    {invoice.document_status === "issued" ? <InvoicePostPaymentDocuments invoiceId={invoice.id} permissions={documentPermissions} /> : null}

    {isDraft ? <>
      <InvoiceDocumentReadiness invoiceId={invoice.id} revision={invoice.updated_at} />
      <section style={finalActionZone}>
        <span style={finalEyebrow}>{t("finance.invoice.ui.finalStep")}</span><h2 style={finalTitle}>{t("finance.invoice.ui.reviewIssue")}</h2><p style={finalDescription}>{t("finance.invoice.ui.issueExplanation")}</p>
        <div className="invoice-final-summary" style={finalSummary}><Metric label={t("finance.invoice.ui.customer")} value={displayText(invoice.customer_name)} /><Metric label={isV2 ? t("finance.invoice.ui.amountSource") : t("finance.invoice.ui.installmentShort")} value={isV2 ? invoiceSourceLabel : t("finance.invoice.ui.installmentNumber", { number: installment?.installment_no || "-" })} /><Metric label={t("finance.invoice.ui.total")} value={money(invoice.total_amount, invoice.currency)} prominent /></div>
        {dirty ? <div style={neutralWarning}>{t("finance.invoice.ui.dirtyBeforeIssue")}</div> : null}
        <button type="button" style={{ ...issueButton, ...(dirty ? disabledButton : {}) }} disabled={dirty || issuing} onClick={openIssueReview}>{t("finance.invoice.ui.issue")}</button>

        {issuePanelOpen ? <div id="invoice-issue-confirmation" style={confirmationPanel}>
          <h3 style={confirmationTitle}>{t("finance.invoice.ui.confirmIssueHeading")}</h3>
          <div style={confirmationGrid}><Field label={t("finance.invoice.ui.customer")} value={displayText(invoice.customer_name)} /><Field label={t("finance.invoice.ui.caseMatter")} value={matter} /><Field label={isV2 ? t("finance.invoice.ui.amountSource") : t("finance.invoice.ui.installmentShort")} value={<>
            {isV2 ? invoiceSourceLabel : installmentLabel}
            {issueInstallmentContext ? <small style={issueInstallmentNote}>{issueInstallmentContext.value}</small> : null}
          </>} /><Field label={t("finance.invoice.ui.beforeVat")} value={money(invoice.amount_before_vat, invoice.currency)} /><Field label="VAT" value={money(invoice.vat_amount, invoice.currency)} /><Field label={t("finance.invoice.ui.total")} value={money(invoice.total_amount, invoice.currency)} /><Field label={t("finance.invoice.ui.issueDate")} value={form.issueDate || "-"} /><Field label={t("finance.invoice.ui.dueDate")} value={form.dueDate || "-"} /><Field label={t("finance.invoice.ui.bankAccount")} value={paymentDestination ? `${displayText(paymentDestination.shortName)} · ${displayText(paymentDestination.accountNumber)}` : "-"} /></div>
          <div style={issueItemsReview}><small style={fieldLabel}>{t("finance.invoice.ui.invoiceItems")}</small>{activeItems.map((item) => <div key={item.id} style={issueItemRow}><span>{item.description}{isV2 ? <small style={itemMeta}>{invoiceItemClassificationLabel(item, locale)}</small> : null}</span><strong>{money(item.line_total, invoice.currency)}</strong></div>)}</div>
          <label style={confirmCheck}><input type="checkbox" checked={issueConfirmed} onChange={(event) => setIssueConfirmed(event.target.checked)} />{t("finance.invoice.ui.issueAcknowledgement")}</label>
          <p style={confirmationHelp}>{t("finance.invoice.ui.irreversibleIssue")}</p>
          <div style={confirmationActions}><button type="button" style={secondaryButton} disabled={issuing} onClick={() => setIssuePanelOpen(false)}>{t("finance.invoice.ui.backToReview")}</button><button type="button" style={{ ...issueButton, ...(!issueConfirmed ? disabledButton : {}) }} disabled={!issueConfirmed || issuing} onClick={() => void issueInvoice()}>{issuing ? t("finance.invoice.ui.issuing") : t("finance.invoice.ui.confirmIssue")}</button></div>
        </div> : null}
      </section>

      <section style={otherActions}><h2 style={otherActionsTitle}>{t("finance.invoice.ui.otherActions")}</h2><p style={sectionDescription}>{isV2 ? t("finance.invoice.ui.cancelCompositionHelp") : t("finance.invoice.ui.cancelInstallmentHelp")}</p>{!cancelPanelOpen ? <button type="button" style={dangerOutlineButton} onClick={() => setCancelPanelOpen(true)}>{t("finance.invoice.ui.cancelDraft")}</button> : <div style={cancelPanel}><FormField label={t("finance.invoice.ui.cancelReason")} required><textarea style={textareaStyle} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></FormField><div style={confirmationActions}><button type="button" style={secondaryButton} disabled={cancelling} onClick={() => { setCancelPanelOpen(false); setCancelReason(""); }}>{t("finance.invoice.ui.keepDraft")}</button><button type="button" style={{ ...dangerButton, ...(!cancelReason.trim() ? disabledButton : {}) }} disabled={!cancelReason.trim() || cancelling} onClick={() => void cancelDraft()}>{cancelling ? t("finance.invoice.ui.cancelling") : t("finance.invoice.ui.confirmCancel")}</button></div></div>}</section>
    </> : null}

    {isIssued ? <section style={otherActions}>
      <h2 style={otherActionsTitle}>{t("finance.invoice.ui.otherActions")}</h2>
      <p style={sectionDescription}>{t("finance.invoice.ui.voidExplanation", { source: isV2 ? t("finance.invoice.ui.sourceItems") : t("finance.invoice.ui.sourceInstallment") })}</p>
      {activePaymentDraft ? <div style={voidBlockerNotice}><strong>{t("finance.invoice.ui.voidBlocked")}</strong><span>{t("finance.invoice.ui.paymentDraftBlocker")}</span><Link style={blockerLink} href={`/finance/payments/${activePaymentDraft.id}`}>{t("finance.invoice.ui.openPaymentDraft")}</Link></div> : effectiveConfirmedPayment || hasEffectiveSettlement ? <div style={voidBlockerNotice}><strong>{t("finance.invoice.ui.voidBlocked")}</strong><span>{t("finance.invoice.ui.confirmedPaymentBlocker")}</span>{effectiveConfirmedPayment ? <Link style={blockerLink} href={`/finance/payments/${effectiveConfirmedPayment.id}`}>{t("finance.invoice.ui.openPayment")}</Link> : null}</div> : null}
      {!voidPanelOpen ? <button type="button" style={{ ...dangerOutlineButton, ...(voidBlockedByPayment ? disabledButton : {}) }} disabled={voidBlockedByPayment} onClick={openVoidPanel}>{t("finance.invoice.ui.void")}</button> : <div ref={voidPanelRef} style={voidPanel}>
        <h3 style={voidPanelTitle}>{t("finance.invoice.ui.confirmVoidHeading")}</h3>
        <p style={voidPanelDescription}>{t("finance.invoice.ui.voidReview")}</p>
        {Object.keys(voidFormErrors).length ? <div role="alert" style={voidValidationSummary}>{t("finance.invoice.ui.voidIncomplete")}</div> : null}
        <FormField label={t("finance.invoice.ui.voidReason")} required error={voidFormErrors.reason}>
          <textarea ref={voidReasonRef} style={{ ...textareaStyle, ...(voidFormErrors.reason ? invalidInputStyle : {}) }} rows={4} maxLength={2000} value={voidReason} disabled={voiding} onChange={(event) => { setVoidReason(event.target.value); setVoidFormErrors((current) => ({ ...current, reason: undefined })); }} />
        </FormField>
        <div style={voidConsequences}>
          <strong>{t("finance.invoice.ui.voidConsequences")}</strong>
          <ul><li>{t("finance.invoice.ui.numberNeverReused")}</li><li>{t("finance.invoice.ui.originalRetained")}</li><li>{t("finance.invoice.ui.replacementRequired")}</li><li>{t("finance.invoice.ui.effectivePaymentPreventsVoid")}</li></ul>
        </div>
        <label style={{ ...voidAcknowledgement, ...(voidFormErrors.acknowledgement ? invalidAcknowledgement : {}) }}><input ref={voidAcknowledgementRef} type="checkbox" checked={voidAcknowledged} disabled={voiding} onChange={(event) => { setVoidAcknowledged(event.target.checked); setVoidFormErrors((current) => ({ ...current, acknowledgement: undefined })); }} /><span>{t("finance.invoice.ui.voidAcknowledgement")}</span></label>
        {voidFormErrors.acknowledgement ? <small style={formError}>{text(voidFormErrors.acknowledgement)}</small> : null}
        <div style={confirmationActions}><button type="button" style={secondaryButton} disabled={voiding} onClick={closeVoidPanel}>{t("finance.invoice.ui.back")}</button><button type="button" style={dangerButton} disabled={voiding} onClick={() => void voidInvoice()}>{voiding ? t("finance.invoice.ui.voiding") : t("finance.invoice.ui.confirmVoid")}</button></div>
      </div>}
    </section> : null}

    <style jsx global>{`
      .invoice-item-table th, .invoice-item-table td { padding: 11px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .invoice-item-table th { background: #f8fafc; color: #475569; font-size: 12px; text-align: left; white-space: nowrap; }
      .invoice-item-table th:nth-child(n+3), .invoice-item-table td:nth-child(n+3) { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .invoice-item-table th:nth-child(2), .invoice-item-table td:nth-child(2) { text-align: center; }
      .invoice-item-table tbody tr:last-child td { border-bottom: 0; }
      .invoice-draft-settings { scroll-margin-top: 84px; }
      @media (max-width: 760px) {
        .invoice-workspace { padding: 14px !important; }
        .invoice-navigation-toolbar, .invoice-identity-header, .invoice-total-grid, .invoice-final-summary, .invoice-settlement-summary, .invoice-bank-destination, .invoice-voided-summary { grid-template-columns: minmax(0, 1fr) !important; }
        .invoice-navigation-toolbar a { width: 100%; box-sizing: border-box; white-space: normal !important; }
        .invoice-source-nodes { display: grid !important; grid-template-columns: minmax(0, 1fr); }
        .invoice-source-arrow { display: none; }
        .invoice-status-panel { min-width: 0 !important; justify-items: start !important; border-left: 0 !important; border-top: 2px solid #86efac; }
        .invoice-status-panel.invoice-status-voided { border-top-color: #dc2626 !important; }
      }
    `}</style>
  </main>;
}

function SectionHeading({ title, description }: { title: string; description: string }) { return <div style={sectionHeading}><h2 style={sectionTitle}>{title}</h2><p style={sectionDescription}>{description}</p></div>; }
function Field({ label, value }: { label: string; value: ReactNode }) { return <div style={{ minWidth: 0 }}><small style={fieldLabel}>{label}</small><div style={fieldValue}>{value}</div></div>; }
function ReadOnlyValue({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) { return <div style={readOnlyValue}><small style={fieldLabel}>{label}</small><div style={{ ...readOnlyText, ...(multiline ? readOnlyMultiline : {}) }}>{value}</div></div>; }
function FormField({ label, helper, required = false, error, children }: { label: string; helper?: string; required?: boolean; error?: UiMessage; children: ReactNode }) { const { text } = useI18n(); return <label style={formField}><span style={formLabel}>{label}{required ? <strong style={requiredMark}> *</strong> : null}</span>{children}{helper ? <small style={formHelper}>{helper}</small> : null}{error ? <small style={formError}>{text(error)}</small> : null}</label>; }
function StatusBadge({ status, label }: { status: string; label: string }) { return <span style={{ ...badge, ...(status === "draft" || status === "ready_to_invoice" || status === "partially_settled" ? amberBadge : status === "cancelled" || status === "voided" || status === "unpaid" ? redBadge : greenBadge) }}>{label}</span>; }
function SourceNode({ label, current = false, children }: { label: string; current?: boolean; children: ReactNode }) { return <div style={{ ...sourceNode, ...(current ? currentNode : {}) }}><small style={fieldLabel}>{label}</small><div style={sourceNodeContent}>{children}</div></div>; }
function Arrow() { return <span className="invoice-source-arrow" style={sourceArrow} aria-hidden="true">→</span>; }
function Metric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...metric, ...(prominent ? prominentMetric : {}) }}><small>{label}</small><strong style={metricValue}>{value}</strong></div>; }
function PaymentLinks({ title, payments, effectiveAllocations, rawAllocations, reallocations, invoiceId, historical = false }: { title: string; payments: FinancePayment[]; effectiveAllocations: EffectivePaymentAllocation[]; rawAllocations: InvoicePaymentAllocation[]; reallocations: PaymentAllocationReallocation[]; invoiceId: string; historical?: boolean }) {
  const { locale, t } = useI18n();
  const { statuses: paymentStatusLabels } = paymentUiLabels(locale);
  return <div style={{ ...paymentHistory, ...(historical ? historicalPaymentHistory : {}) }}><small style={fieldLabel}>{title}</small>{payments.map((payment) => {
    const effective = effectiveAllocations.find((row) => row.payment_id === payment.id);
    const original = rawAllocations.find((row) => row.payment_id === payment.id);
    const latestMovement = reallocations.find((row) => row.payment_id === payment.id && (row.source_invoice_id === invoiceId || row.target_invoice_id === invoiceId));
    const displayedAmount = effective?.effective_settlement_total ?? original?.settlement_total ?? latestMovement?.settlement_moved ?? 0;
    const amountLabel = effective ? t("finance.invoice.ui.currentSettlement") : original ? t("finance.invoice.ui.originalAllocation") : t("finance.invoice.ui.latestReallocation");
    return <Link key={payment.id} style={{ ...paymentHistoryLink, ...(historical ? historicalPaymentLink : {}) }} href={`/finance/payments/${payment.id}`}><span style={paymentHistoryIdentity}><strong>{paymentStatusLabels[payment.status] || payment.status}</strong><small>{amountLabel}</small></span><strong>{money(displayedAmount, payment.currency)}</strong></Link>;
  })}</div>;
}
function invoiceItemSourceLabel(item: FinanceInvoiceItem, locale: UiLocale) {
  const t = (key: string) => translate(locale, key);
  const sourceType = invoiceItemSourceType(item);
  return sourceType === "billing_installment_item" ? t("finance.invoice.ui.planSource") : t("finance.invoice.ui.additionalCharges");
}
function invoiceItemQuantityLabel(item: FinanceInvoiceItem, currency: string, locale: UiLocale) { const t = (key: string) => translate(locale, key); if (item.source_quantity === null) return ""; const unit = invoiceItemUnit(item) || t("finance.invoice.ui.unit"); const price = item.source_unit_price === null ? "" : ` × ${money(item.source_unit_price, currency)}`; return translate(locale, "finance.invoice.ui.quantityValue", { quantity: Number(item.source_quantity).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { maximumFractionDigits: 4 }), unit, price }); }
function invoiceItemClassificationLabel(item: FinanceInvoiceItem, locale: UiLocale) { return translate(locale, "finance.invoice.ui.classificationValue", { classification: economicClassificationLabel(invoiceItemEconomicClassification(item), locale) }); }
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
const voidedStatusPanel: CSSProperties = { borderLeftColor: "#dc2626", background: "#fef2f2" };
const statusPanel: CSSProperties = { display: "grid", alignContent: "start", justifyItems: "end", gap: 7, minWidth: 210, padding: "8px 12px", borderLeft: "2px solid #fbbf24", background: "#fffbeb" };
const metaLabel: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 700 };
const updatedText: CSSProperties = { color: "#64748b", fontSize: 12 };
const voidedUpdatedText: CSSProperties = { color: "#b91c1c", fontSize: 12, fontWeight: 700 };
const numberNotice: CSSProperties = { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px", padding: "12px 22px", borderTop: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", fontSize: 13 };
const issuedNotice: CSSProperties = { ...numberNotice, borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" };
const cancelledNotice: CSSProperties = { ...numberNotice, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" };
const voidedNotice: CSSProperties = { ...cancelledNotice, alignItems: "center" };
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
const bankDestinationPanel: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(240px,1.2fr) minmax(220px,1fr)", gap: 14, marginTop: 16, padding: 14, border: "1px solid #dbeafe", borderRadius: 6, background: "#f8fbff" };
const bankDestinationSummary: CSSProperties = { display: "grid", alignContent: "center", gap: 4, minWidth: 0, padding: "10px 12px", borderLeft: "3px solid #2563eb", background: "#fff", color: "#475569", fontSize: 13, lineHeight: 1.45, overflowWrap: "anywhere" };
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
const invalidInputStyle: CSSProperties = { borderColor: "#dc2626", boxShadow: "0 0 0 1px #dc2626" };
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
const settlementGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 16 };
const paymentHistory: CSSProperties = { display: "grid", gap: 7, marginTop: 16, paddingTop: 14, borderTop: "1px solid #dbeafe" };
const paymentHistoryLink: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 11px", border: "1px solid #dbeafe", borderRadius: 6, background: "#fff", color: "#1d4ed8", textDecoration: "none" };
const historicalPaymentHistory: CSSProperties = { borderTopColor: "#e2e8f0" };
const historicalPaymentLink: CSSProperties = { borderColor: "#e2e8f0", background: "#f8fafc", color: "#475569" };
const paymentHistoryIdentity: CSSProperties = { display: "grid", gap: 2, minWidth: 0 };
const paymentButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 16, padding: "10px 18px", border: "1px solid #166534", borderRadius: 6, background: "#166534", color: "#fff", font: "inherit", fontWeight: 800, cursor: "pointer" };
const settledNote: CSSProperties = { margin: "14px 0 0", color: "#166534", fontWeight: 700 };
const voidedHistorySection: CSSProperties = { marginBottom: 18, padding: 22, border: "1px solid #fecaca", borderRadius: 8, background: "#fffafa" };
const voidedHistoryEyebrow: CSSProperties = { color: "#b91c1c", fontSize: 11, fontWeight: 900 };
const voidedHistoryTitle: CSSProperties = { margin: "5px 0", color: "#7f1d1d", fontSize: 22 };
const voidedHistoryDescription: CSSProperties = { margin: "0 0 16px", color: "#475569", lineHeight: 1.6 };
const voidedSummaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 1, overflow: "hidden", border: "1px solid #fecaca", borderRadius: 6, background: "#fff" };
const voidReasonBlock: CSSProperties = { marginTop: 14, padding: 13, borderLeft: "3px solid #dc2626", background: "#fff", color: "#475569" };
const replacementNextStep: CSSProperties = { display: "grid", gap: 7, marginTop: 16, padding: 14, border: "1px solid #bfdbfe", borderRadius: 6, background: "#f8fbff", color: "#334155", lineHeight: 1.55 };
const replacementButton: CSSProperties = { ...secondaryButton, width: "fit-content", marginTop: 4, borderColor: "#2563eb", color: "#1d4ed8" };
const finalActionZone: CSSProperties = { marginBottom: 18, padding: 22, border: "1px solid #86efac", borderRadius: 8, background: "#f7fff9" };
const finalEyebrow: CSSProperties = { color: "#15803d", fontSize: 11, fontWeight: 900 };
const finalTitle: CSSProperties = { margin: "5px 0", color: "#14532d", fontSize: 22 };
const finalDescription: CSSProperties = { margin: "0 0 16px", color: "#3f6212", lineHeight: 1.55 };
const finalSummary: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginBottom: 16, border: "1px solid #bbf7d0", borderRadius: 6, overflow: "hidden", background: "#fff" };
const issueButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "10px 18px", border: "1px solid #166534", borderRadius: 6, background: "#166534", color: "#fff", font: "inherit", fontWeight: 800, cursor: "pointer" };
const confirmationPanel: CSSProperties = { marginTop: 18, padding: 18, border: "1px solid #86efac", borderRadius: 6, background: "#fff", scrollMarginTop: 84 };
const confirmationTitle: CSSProperties = { margin: "0 0 14px", color: "#14532d", fontSize: 17 };
const confirmationGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 13 };
const issueInstallmentNote: CSSProperties = { display: "block", marginTop: 3, color: "#64748b", fontSize: 13, lineHeight: 1.5 };
const issueItemsReview: CSSProperties = { display: "grid", gap: 7, marginTop: 14, paddingTop: 12, borderTop: "1px solid #dce7df" };
const issueItemRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, color: "#334155", lineHeight: 1.45 };
const confirmCheck: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 9, marginTop: 16, padding: 12, border: "1px solid #cbd5e1", borderRadius: 6, color: "#334155", fontWeight: 700, lineHeight: 1.5 };
const confirmationHelp: CSSProperties = { margin: "10px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const confirmationActions: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 14 };
const otherActions: CSSProperties = { marginBottom: 18, padding: "18px 20px", border: "1px solid #fecaca", borderRadius: 8, background: "#fff" };
const otherActionsTitle: CSSProperties = { margin: 0, color: "#7f1d1d", fontSize: 16 };
const dangerOutlineButton: CSSProperties = { ...secondaryButton, marginTop: 12, borderColor: "#fca5a5", color: "#b91c1c" };
const dangerButton: CSSProperties = { ...issueButton, borderColor: "#b91c1c", background: "#b91c1c" };
const cancelPanel: CSSProperties = { marginTop: 14, padding: 14, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2" };
const voidBlockerNotice: CSSProperties = { display: "grid", gap: 5, marginTop: 14, padding: 13, borderLeft: "3px solid #dc2626", background: "#fef2f2", color: "#991b1b", lineHeight: 1.5 };
const blockerLink: CSSProperties = { width: "fit-content", color: "#991b1b", fontWeight: 800 };
const voidPanel: CSSProperties = { marginTop: 14, padding: 16, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2", scrollMarginTop: 84 };
const voidPanelTitle: CSSProperties = { margin: 0, color: "#7f1d1d", fontSize: 18 };
const voidPanelDescription: CSSProperties = { margin: "5px 0 14px", color: "#7f1d1d", fontSize: 13, lineHeight: 1.55 };
const voidValidationSummary: CSSProperties = { marginBottom: 14, padding: 11, border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#b91c1c", fontSize: 13, fontWeight: 700 };
const voidConsequences: CSSProperties = { marginTop: 14, padding: "12px 14px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#475569", fontSize: 13, lineHeight: 1.6 };
const voidAcknowledgement: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 9, marginTop: 14, padding: 12, border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#7f1d1d", fontWeight: 700, lineHeight: 1.5 };
const invalidAcknowledgement: CSSProperties = { borderColor: "#dc2626", boxShadow: "0 0 0 1px #dc2626" };
const badge: CSSProperties = { display: "inline-block", width: "fit-content", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
const amberBadge: CSSProperties = { background: "#fef3c7", color: "#92400e" };
const greenBadge: CSSProperties = { background: "#dcfce7", color: "#166534" };
const redBadge: CSSProperties = { background: "#fee2e2", color: "#b91c1c" };
