"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "../../../../lib/i18n/provider";
import { translate } from "../../../../lib/i18n/catalog";
import { uiMessage, type UiMessage, type UiLocale } from "../../../../lib/i18n/core";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import FinanceSubNav from "../../FinanceSubNav";
import { FinanceDocumentNextAction } from "../../document-decision/next-action";
import { supabase } from "../../../../lib/supabase";
import { bangkokToday, displayText, money } from "../../invoices/shared";
import { calculateStructuredWht, invoiceTaxFacts, paymentTaxFingerprint, paymentWhtScope, savedPaymentWht, invoiceTaxVatLabel, type InvoiceTaxFacts, type WhtComponent, type WhtMode } from "../tax";
import { evaluateWhtLines, initialWhtLineChoices, restoreWhtLineChoices, whtLineFingerprint, whtLinePayload, whtLineRpcError, whtLineScope, type WhtLineChoice } from "../wht-line-review";
import { WhtLineReview } from "../wht-line-review-panel";
import { MoneyAllocationPanel } from "../money-allocation-panel";
import {
  hasValidCurrencyPrecision,
  normalizedAmount,
  paymentFingerprint,
  paymentForm,
  paymentUiLabels,
  paymentErrorMessage,
  paymentReallocationErrorMessage,
  type EffectivePaymentAllocation,
  type FinancePayment,
  type InvoiceSettlement,
  type PaymentAllocation,
  type PaymentAllocationReallocation,
  type PaymentForm,
  type PaymentWhtRateOption as WhtRateOption,
} from "../shared";

type PaymentAccess = {
  canManage: boolean;
  canConfirm: boolean;
  canReverse: boolean;
  canReallocate: boolean;
};
type InvoiceContext = { id: string; invoice_no: string | null; customer_name: string | null; client_id: string; case_id: number | null; advisory_matter_id: string | null; matter_snapshot_json: Record<string, unknown> | null; currency: string; amount_before_vat: number | string; vat_amount: number | string; total_amount: number | string; document_status: string; issued_snapshot_json: Record<string, unknown> | null };
type BankAccount = { id: string; short_name: string | null; bank_name: string | null; account_name: string | null; account_number: string | null; is_active: boolean };
type FormErrors = Partial<Record<"receivedOn" | "paymentMethod" | "bankAccount" | "settlementTarget" | "cashAmount" | "whtAmount" | "whtRate" | "whtLines" | "allocation" | "confirmation", UiMessage>>;
type ReallocationErrors = Partial<Record<"source" | "target" | "cash" | "wht" | "reason" | "acknowledgement", UiMessage>>;
type ReallocationMode = "full" | "partial";

const whtRatePresets = [1, 2, 3, 5, 10] as const;

const paymentSelect = "id,draft_origin_invoice_id,internal_reference,client_id,currency,status,cash_amount,wht_amount,settlement_amount,wht_calculation_mode,received_on,payment_method,receiving_bank_account_id,receiving_account_reference,external_transaction_reference,payer_name,note,created_at,updated_at,confirmed_at,cancelled_at,cancel_reason,reversed_at,reverse_reason";
const allocationSelect = "id,payment_id,invoice_id,cash_allocated,wht_credit_allocated,settlement_total";
const invoiceContextSelect = "id,invoice_no,customer_name,client_id,case_id,advisory_matter_id,matter_snapshot_json,currency,amount_before_vat,vat_amount,total_amount,document_status,issued_snapshot_json";
const effectiveAllocationSelect = "payment_id,invoice_id,effective_cash_allocated,effective_wht_credit_allocated,effective_settlement_total";
const reallocationSelect = "id,payment_id,source_invoice_id,target_invoice_id,cash_moved,wht_moved,settlement_moved,reason,created_at";

export default function PaymentDetailPage() {
  return <QuotationGuard canAccess={(access) => access.profile?.role === "partner" || access.permissions.canManageFinancePayments || access.permissions.canConfirmFinancePayments || access.permissions.canReverseFinancePayments || access.permissions.canReallocateFinancePayments}>{(access) => <><FinanceSubNav activePage="payments" permissions={access.permissions} /><PaymentWorkspace access={{ canManage: access.permissions.canManageFinancePayments, canConfirm: access.permissions.canConfirmFinancePayments, canReverse: access.permissions.canReverseFinancePayments, canReallocate: access.permissions.canReallocateFinancePayments }} /></>}</QuotationGuard>;
}

function PaymentWorkspace({ access }: { access: PaymentAccess }) {
  const { locale, t, text, date } = useI18n();
  const { statuses: paymentStatusLabels, methods: paymentMethodLabels, settlement: paymentSettlementLabels, correction: paymentCorrectionCopy } = paymentUiLabels(locale);
  const { id } = useParams<{ id: string }>();
  const [payment, setPayment] = useState<FinancePayment | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [effectiveAllocations, setEffectiveAllocations] = useState<EffectivePaymentAllocation[]>([]);
  const [reallocations, setReallocations] = useState<PaymentAllocationReallocation[]>([]);
  const [invoices, setInvoices] = useState<InvoiceContext[]>([]);
  const [settlements, setSettlements] = useState<InvoiceSettlement[]>([]);
  const [candidateInvoices, setCandidateInvoices] = useState<InvoiceContext[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [form, setForm] = useState<PaymentForm>({ receivedOn: "", paymentMethod: "", receivingBankAccountId: "", receivingAccountReference: "", externalTransactionReference: "", payerName: "", note: "", cashAmount: "0.00", whtAmount: "0.00" });
  const [settlementTarget, setSettlementTarget] = useState("0.00");
  const [whtMode, setWhtMode] = useState<WhtMode>("none");
  const [whtRateOption, setWhtRateOption] = useState<WhtRateOption>("");
  const [customWhtRate, setCustomWhtRate] = useState("");
  const [whtComponents, setWhtComponents] = useState<WhtComponent[]>([]);
  const [whtLineChoices, setWhtLineChoices] = useState<WhtLineChoice[]>([]);
  const [lineErrorsVisible, setLineErrorsVisible] = useState(false);
  const [storedLineEvidenceValid, setStoredLineEvidenceValid] = useState(true);
  const [baseline, setBaseline] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationAcknowledged, setConfirmationAcknowledged] = useState(false);
  const [exceptionMode, setExceptionMode] = useState<"cancel" | "reverse" | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [processingException, setProcessingException] = useState(false);
  const [reallocationOpen, setReallocationOpen] = useState(false);
  const [reallocationSourceId, setReallocationSourceId] = useState("");
  const [reallocationTargetId, setReallocationTargetId] = useState("");
  const [reallocationMode, setReallocationMode] = useState<ReallocationMode>("full");
  const [reallocationCash, setReallocationCash] = useState("0.00");
  const [reallocationWht, setReallocationWht] = useState("0.00");
  const [reallocationReason, setReallocationReason] = useState("");
  const [reallocationAcknowledged, setReallocationAcknowledged] = useState(false);
  const [reallocationErrors, setReallocationErrors] = useState<ReallocationErrors>({});
  const [reallocating, setReallocating] = useState(false);
  const [reallocationRequestId, setReallocationRequestId] = useState("");
  const [reallocationAttempted, setReallocationAttempted] = useState(false);
  const [error, setError] = useState<UiMessage | string>("");
  const [message, setMessage] = useState<UiMessage | string>("");
  const actionLock = useRef(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const reallocationRef = useRef<HTMLElement | null>(null);
  const reallocationFirstInvalidRef = useRef<HTMLSelectElement | null>(null);
  const reallocationLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const paymentResult = await supabase.from("finance_payments").select(paymentSelect).eq("id", id).maybeSingle();
    if (paymentResult.error || !paymentResult.data) {
      console.error("Failed to load Payment", paymentResult.error);
      setError(paymentResult.error ? uiMessage("finance.payment.ui.loadFailed") : uiMessage("finance.payment.ui.notFound"));
      setLoading(false);
      return;
    }
    const paymentRow = paymentResult.data as FinancePayment;
    const [allocationsResult, effectiveResult, reallocationResult, candidateResult, bankResult, whtResult] = await Promise.all([
      supabase.from("finance_payment_invoice_allocations").select(allocationSelect).eq("payment_id", id).order("created_at"),
      supabase.from("finance_payment_effective_invoice_allocations").select(effectiveAllocationSelect).eq("payment_id", id),
      supabase.from("finance_payment_allocation_reallocations").select(reallocationSelect).eq("payment_id", id).order("created_at", { ascending: false }),
      supabase.from("finance_invoices").select(invoiceContextSelect).eq("client_id", paymentRow.client_id).eq("currency", paymentRow.currency).eq("document_status", "issued").order("issue_date", { ascending: false }),
      supabase.from("finance_bank_accounts").select("id,short_name,bank_name,account_name,account_number,is_active").order("short_name"),
      supabase.from("finance_payment_wht_components").select("id,payment_id,invoice_id,invoice_item_id,calculation_rule,base_amount,rate_percent,calculated_wht_amount,basis_snapshot_json").eq("payment_id", id),
    ]);
    if (allocationsResult.error || whtResult.error || !allocationsResult.data?.length) {
      console.error("Failed to load Payment allocation", allocationsResult.error);
      setError(uiMessage("finance.payment.ui.allocationLoadFailed"));
      setLoading(false);
      return;
    }
    if (effectiveResult.error || reallocationResult.error || candidateResult.error || bankResult.error) {
      console.error("Failed to load Payment allocation context", { effective: effectiveResult.error, history: reallocationResult.error, candidates: candidateResult.error, bank: bankResult.error });
      setError(uiMessage("finance.payment.ui.contextLoadFailed"));
    }
    const rawRows = (allocationsResult.data || []) as PaymentAllocation[];
    const effectiveRows = (effectiveResult.data || []) as EffectivePaymentAllocation[];
    const historyRows = (reallocationResult.data || []) as PaymentAllocationReallocation[];
    const candidateRows = (candidateResult.data || []) as InvoiceContext[];
    const invoiceIds = [...new Set([
      ...rawRows.map((row) => row.invoice_id),
      ...effectiveRows.map((row) => row.invoice_id),
      ...historyRows.flatMap((row) => [row.source_invoice_id, row.target_invoice_id]),
      ...candidateRows.map((row) => row.id),
    ])];
    const [invoiceResult, settlementResult] = await Promise.all([
      invoiceIds.length ? supabase.from("finance_invoices").select(invoiceContextSelect).in("id", invoiceIds) : Promise.resolve({ data: [], error: null }),
      invoiceIds.length ? supabase.from("finance_invoice_settlement_summary").select("*").in("invoice_id", invoiceIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (invoiceResult.error || settlementResult.error) {
      console.error("Failed to load Payment Invoice context", { invoice: invoiceResult.error, settlement: settlementResult.error });
      setError(uiMessage("finance.payment.ui.invoiceBankLoadFailed"));
    }
    const nextForm = paymentForm(paymentRow);
    const invoiceRows = (invoiceResult.data || []) as InvoiceContext[];
    const components = (whtResult.data || []) as WhtComponent[];
    const savedWht = savedPaymentWht(paymentRow, components);
    const facts = invoiceTaxFacts(invoiceRows.find(row => row.id === rawRows[0]?.invoice_id)?.issued_snapshot_json);
    const restoredLines = savedWht.mode === "line_review" ? restoreWhtLineChoices(facts, components, paymentRow.id) : null;
    const lineChoices = restoredLines?.choices || initialWhtLineChoices(facts);
    const storedTotals = restoredLines ? evaluateWhtLines(facts, lineChoices).totals : null;
    const lineEvidenceValid = !restoredLines || (restoredLines.valid && storedTotals?.cashAmount === nextForm.cashAmount && storedTotals?.whtAmount === nextForm.whtAmount);
    setWhtLineChoices(lineChoices);
    setStoredLineEvidenceValid(lineEvidenceValid);
    setLineErrorsVisible(false);
    if (!lineEvidenceValid) setError(uiMessage("finance.payment.wht.lines.evidenceChanged"));
    setPayment(paymentRow);
    setAllocations(rawRows);
    setEffectiveAllocations(effectiveRows);
    setReallocations(historyRows);
    setInvoices(invoiceRows);
    setSettlements((settlementResult.data || []) as InvoiceSettlement[]);
    setCandidateInvoices(candidateRows);
    setBankAccounts((bankResult.data || []) as BankAccount[]);
    setForm(nextForm);
    setSettlementTarget(Number(paymentRow.settlement_amount).toFixed(2));
    setWhtComponents(components);
    setWhtMode(savedWht.mode);
    const preset = whtRatePresets.some((rate) => String(rate) === savedWht.rate);
    setWhtRateOption(savedWht.rate ? preset ? savedWht.rate as WhtRateOption : "custom" : "");
    setCustomWhtRate(savedWht.rate && !preset ? savedWht.rate : "");
    setBaseline(paymentTaxFingerprint(paymentFingerprint(nextForm), savedWht.mode, savedWht.rate) + (savedWht.mode === "line_review" ? whtLineFingerprint(lineChoices) : ""));
    setErrors({});
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const rateText = whtRateOption === "custom" ? customWhtRate : whtRateOption;
  const fingerprint = useMemo(() => paymentTaxFingerprint(paymentFingerprint(form), whtMode, rateText) + (whtMode === "line_review" ? whtLineFingerprint(whtLineChoices) : ""), [form, whtMode, rateText, whtLineChoices]);
  const dirty = Boolean(baseline) && (fingerprint !== baseline || (whtMode === "line_review" && !storedLineEvidenceValid));
  const isDraft = payment?.status === "draft";
  const allocation = allocations[0] || null;
  const invoice = allocation ? invoices.find((row) => row.id === allocation.invoice_id) || null : null;
  const settlement = invoice ? settlements.find((row) => row.invoice_id === invoice.id) || null : null;
  const draftAllocationEditingLimited = isDraft && allocations.length > 1;
  const cash = normalizedAmount(form.cashAmount);
  const wht = normalizedAmount(form.whtAmount);
  const paymentSettlement = normalizedAmount(cash + wht);
  const currentAllocation = normalizedAmount(allocation?.settlement_total);
  const authoritativeOutstanding = normalizedAmount(settlement?.outstanding_amount);
  const outstandingBefore = payment?.status === "confirmed" ? authoritativeOutstanding + currentAllocation : authoritativeOutstanding;
  const expectedOutstanding = Math.max(0, outstandingBefore - paymentSettlement);
  const draftReceivingBankAccount = bankAccounts.find((account) => account.id === form.receivingBankAccountId) || null;
  const savedReceivingBankAccount = bankAccounts.find((account) => account.id === payment?.receiving_bank_account_id) || null;
  const taxFacts = invoiceTaxFacts(invoice?.issued_snapshot_json);
  const targetSettlement = normalizedAmount(settlementTarget);
  const selectedWhtRate = whtRateOption === "custom" ? Number(customWhtRate || 0) : Number(whtRateOption || 0);
  const currentWhtBase = paymentWhtScope(taxFacts, settlementTarget, outstandingBefore, allocations.length);
  const whtCalculation = calculateStructuredWht(currentWhtBase.base, rateText, settlementTarget);
  const lineReview = evaluateWhtLines(taxFacts, whtLineChoices);
  const lineSourceMismatch = taxFacts && (taxFacts.invoiceId !== invoice?.id || taxFacts.currency !== payment?.currency
    || taxFacts.beforeVat !== Number(invoice?.amount_before_vat) || taxFacts.vat !== Number(invoice?.vat_amount) || taxFacts.gross !== Number(invoice?.total_amount));
  const lineScopeError = lineSourceMismatch ? uiMessage("finance.payment.wht.snapshot") : whtLineScope(taxFacts, settlementTarget, outstandingBefore, allocations.length, Number(payment?.settlement_amount));
  const lineReviewPending = whtMode === "line_review" && Boolean(lineScopeError || !lineReview.totals);
  const currentEffectiveAllocations = effectiveAllocations.filter((row) => normalizedAmount(row.effective_settlement_total) > 0);
  const effectiveAllocationTotal = currentEffectiveAllocations.reduce((sum, row) => normalizedAmount(sum + normalizedAmount(row.effective_settlement_total)), 0);
  const selectedSourceAllocation = currentEffectiveAllocations.find((row) => row.invoice_id === reallocationSourceId) || null;
  const selectedTargetAllocation = currentEffectiveAllocations.find((row) => row.invoice_id === reallocationTargetId) || null;
  const selectedSourceInvoice = invoices.find((row) => row.id === reallocationSourceId) || null;
  const selectedTargetInvoice = invoices.find((row) => row.id === reallocationTargetId) || null;
  const currentAllocatedInvoice = currentEffectiveAllocations.length === 1
    ? invoices.find((row) => row.id === currentEffectiveAllocations[0].invoice_id) || null
    : null;
  const reallocationCashAmount = reallocationMode === "full"
    ? normalizedAmount(selectedSourceAllocation?.effective_cash_allocated)
    : normalizedAmount(reallocationCash);
  const reallocationWhtAmount = reallocationMode === "full"
    ? normalizedAmount(selectedSourceAllocation?.effective_wht_credit_allocated)
    : normalizedAmount(reallocationWht);
  const reallocationTotal = normalizedAmount(reallocationCashAmount + reallocationWhtAmount);
  const crossMatterReallocation = Boolean(selectedSourceInvoice && selectedTargetInvoice && !sameInvoiceMatter(selectedSourceInvoice, selectedTargetInvoice));

  const updateForm = <Key extends keyof PaymentForm>(key: Key, value: PaymentForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    const errorKey = key === "receivedOn" ? "receivedOn" : key === "paymentMethod" ? "paymentMethod" : key === "receivingBankAccountId" ? "bankAccount" : key === "cashAmount" ? "cashAmount" : key === "whtAmount" ? "whtAmount" : null;
    if (errorKey) setErrors((current) => ({ ...current, [errorKey]: undefined, allocation: undefined }));
    setMessage("");
  };

  const setStructuredAmounts = (targetValue: string, mode: WhtMode, rateOption = whtRateOption, customRate = customWhtRate) => {
    if (mode === "legacy") return;
    if (mode === "line_review") {
      const result = evaluateWhtLines(taxFacts, whtLineChoices);
      if (result.totals && !whtLineScope(taxFacts, targetValue, outstandingBefore, allocations.length, Number(payment?.settlement_amount))) setForm(current => ({ ...current, ...result.totals }));
      setErrors(current => ({ ...current, whtLines: undefined, allocation: undefined }));
      setMessage("");
      return;
    }
    const rate = rateOption === "custom" ? customRate : rateOption;
    const scope = paymentWhtScope(taxFacts, targetValue, outstandingBefore, allocations.length);
    const calculated = mode === "rate" ? calculateStructuredWht(scope.base, rate, targetValue) : null;
    const amounts = calculated || { cashAmount: normalizedAmount(targetValue).toFixed(2), whtAmount: "0.00" };
    setForm((current) => ({ ...current, ...amounts }));
    setErrors((current) => ({ ...current, settlementTarget: undefined, cashAmount: undefined, whtAmount: undefined, whtRate: undefined, allocation: undefined }));
    setMessage("");
  };

  const updateSettlementTarget = (value: string) => {
    setSettlementTarget(value);
    setStructuredAmounts(value, whtMode);
  };

  const selectWhtMode = (applies: boolean) => {
    if (applies && whtMode !== "none") return;
    setWhtRateOption("");
    setCustomWhtRate("");
    if (!applies) {
      setWhtMode("none");
      setStructuredAmounts(settlementTarget, "none");
      return;
    }
    const mode = taxFacts && taxFacts.lines.length > 1 ? "line_review" : "rate";
    setWhtMode(mode);
    setStructuredAmounts(settlementTarget, mode, "", "");
  };

  const recalculateLegacyWht = () => {
    const mode = taxFacts && taxFacts.lines.length > 1 ? "line_review" : "rate";
    setWhtMode(mode);
    setWhtRateOption("");
    setCustomWhtRate("");
    setStructuredAmounts(settlementTarget, mode, "", "");
    setErrors((current) => ({ ...current, whtRate: undefined }));
  };

  const selectWhtRate = (option: WhtRateOption) => {
    setWhtRateOption(option);
    setWhtMode("rate");
    setStructuredAmounts(settlementTarget, "rate", option, customWhtRate);
  };

  const updateCustomWhtRate = (value: string) => {
    setCustomWhtRate(value);
    setStructuredAmounts(settlementTarget, "rate", "custom", value);
  };

  const updateWhtLine = (choice: WhtLineChoice) => {
    const choices = whtLineChoices.map(current => current.invoiceItemId === choice.invoiceItemId ? choice : current);
    setWhtLineChoices(choices);
    const result = evaluateWhtLines(taxFacts, choices);
    if (result.totals && !lineScopeError) setForm(current => ({ ...current, ...result.totals }));
    setErrors(current => ({ ...current, whtLines: undefined, allocation: undefined }));
    setConfirmationOpen(false);
    setError(""); setMessage("");
  };

  const validate = (forConfirmation: boolean) => {
    const next: FormErrors = {};
    if (!hasValidCurrencyPrecision(settlementTarget) || targetSettlement <= 0) next.settlementTarget = uiMessage("finance.payment.ui.targetPrecision");
    if (!draftAllocationEditingLimited && targetSettlement > outstandingBefore) next.settlementTarget = uiMessage("finance.payment.ui.targetExceedsOutstanding");
    if (whtMode === "legacy") next.whtRate = uiMessage("finance.payment.wht.legacy");
    if (whtMode === "rate" && currentWhtBase.error) next.whtRate = uiMessage(currentWhtBase.errorKey);
    else if (whtMode === "rate" && !whtCalculation) next.whtRate = uiMessage("finance.payment.wht.rate");
    else if (whtMode === "rate" && (form.whtAmount !== whtCalculation?.whtAmount || form.cashAmount !== whtCalculation?.cashAmount)) next.whtRate = uiMessage("finance.payment.ui.whtCalculationChanged");
    if (whtMode === "line_review") {
      setLineErrorsVisible(true);
      if (lineScopeError) next.whtLines = lineScopeError;
      else if (!lineReview.totals) next.whtLines = lineReview.issues[0]?.message || uiMessage("finance.payment.wht.lines.resolveAll");
      else if (form.whtAmount !== lineReview.totals.whtAmount || form.cashAmount !== lineReview.totals.cashAmount) next.whtLines = uiMessage("finance.payment.ui.whtCalculationChanged");
    }
    if (wht > targetSettlement) next.whtAmount = uiMessage("finance.payment.ui.whtExceedsTarget");
    if (!hasValidCurrencyPrecision(form.cashAmount) || cash < 0) next.cashAmount = uiMessage("finance.payment.ui.receivedPrecision");
    if (!hasValidCurrencyPrecision(form.whtAmount) || wht < 0) next.whtAmount = uiMessage("finance.payment.ui.whtPrecision");
    if (Math.abs(paymentSettlement - targetSettlement) > 0.009) next.allocation = uiMessage("finance.payment.ui.allocationMismatch");
    if (paymentSettlement <= 0) next.allocation = uiMessage("finance.payment.ui.positiveSettlement");
    if (!draftAllocationEditingLimited && paymentSettlement > outstandingBefore) next.allocation = uiMessage("finance.payment.ui.allocationExceedsOutstanding");
    if (draftAllocationEditingLimited) {
      const rawCash = normalizedAmount(allocations.reduce((sum, row) => sum + normalizedAmount(row.cash_allocated), 0));
      const rawWht = normalizedAmount(allocations.reduce((sum, row) => sum + normalizedAmount(row.wht_credit_allocated), 0));
      if (rawCash !== cash || rawWht !== wht) next.allocation = uiMessage("finance.payment.ui.multiInvoiceMismatch");
    }
    if (forConfirmation && !form.receivedOn) next.receivedOn = uiMessage("finance.payment.ui.dateRequired");
    if (forConfirmation && form.receivedOn > bangkokToday()) next.receivedOn = uiMessage("finance.payment.ui.futureDate");
    if (forConfirmation && !form.paymentMethod) next.paymentMethod = uiMessage("finance.payment.ui.methodRequired");
    if (forConfirmation && form.paymentMethod === "bank_transfer" && !form.receivingBankAccountId) next.bankAccount = uiMessage("finance.payment.ui.bankRequired");
    setErrors(next);
    if (Object.keys(next).length) {
      setError(next.whtLines || next.whtRate || uiMessage("finance.payment.ui.validationSummary"));
      requestAnimationFrame(() => {
        const invalidLine = next.whtLines ? document.querySelector<HTMLElement>('[data-wht-editor] [aria-invalid="true"], [data-wht-editor] [role="alert"]') : null;
        if (invalidLine) { invalidLine.scrollIntoView({ behavior: "smooth", block: "center" }); invalidLine.closest('[data-wht-line]')?.querySelector<HTMLElement>('input,select')?.focus(); }
        else { firstInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); firstInputRef.current?.focus(); }
      });
    }
    return Object.keys(next).length === 0;
  };

  const allocationPayload = () => draftAllocationEditingLimited
    ? allocations.map((row) => ({ invoice_id: row.invoice_id, cash_allocated: normalizedAmount(row.cash_allocated), wht_credit_allocated: normalizedAmount(row.wht_credit_allocated) }))
    : [{ invoice_id: allocation?.invoice_id, cash_allocated: cash, wht_credit_allocated: wht }];

  const saveDraft = async () => {
    if (!payment || !allocation || !isDraft || !access.canManage || !dirty || saving || actionLock.current || !validate(false)) return;
    actionLock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = whtMode === "line_review" ? await supabase.rpc("save_finance_payment_wht_lines_draft", {
        p_payment_id: payment.id,
        p_received_on: form.receivedOn || null,
        p_payment_method: form.paymentMethod || null,
        p_receiving_bank_account_id: form.receivingBankAccountId || null,
        p_receiving_account_reference: form.receivingAccountReference,
        p_external_transaction_reference: form.externalTransactionReference,
        p_payer_name: form.payerName,
        p_note: form.note,
        p_line_choices_json: whtLinePayload(whtLineChoices),
      }) : await supabase.rpc("save_finance_payment_tax_draft", {
        p_payment_id: payment.id,
        p_received_on: form.receivedOn || null,
        p_payment_method: form.paymentMethod || null,
        p_receiving_bank_account_id: form.receivingBankAccountId || null,
        p_receiving_account_reference: form.receivingAccountReference,
        p_external_transaction_reference: form.externalTransactionReference,
        p_payer_name: form.payerName,
        p_note: form.note,
        p_cash_amount: cash,
        p_wht_amount: wht,
        p_allocations_json: allocationPayload(),
        p_wht_calculation_mode: whtMode,
        p_wht_rate_percent: whtMode === "rate" ? selectedWhtRate : null,
      });
      if (result.error) throw result.error;
      await load();
      setMessage(uiMessage("finance.payment.ui.saved"));
    } catch (saveError) {
      console.error("Failed to save Payment Draft", saveError);
      setError(whtLineRpcError(saveError, taxFacts) || paymentErrorMessage(saveError, uiMessage("finance.payment.ui.saveFailed")));
    } finally {
      actionLock.current = false; setSaving(false);
    }
  };

  const openConfirmation = () => {
    setError(""); setMessage("");
    if (dirty) { setError(uiMessage("finance.payment.ui.saveBeforeConfirm")); return; }
    if (!validate(true)) return;
    setConfirmationAcknowledged(false); setConfirmationOpen(true);
    requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const confirmPayment = async () => {
    if (!payment || !isDraft || !access.canConfirm || !confirmationAcknowledged || confirming || actionLock.current || dirty || !validate(true)) return;
    actionLock.current = true; setConfirming(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("confirm_finance_payment", { p_payment_id: payment.id, p_confirmation_acknowledged: true });
      if (result.error) throw result.error;
      setConfirmationOpen(false);
      await load();
      setMessage(uiMessage("finance.payment.ui.confirmedSuccess"));
    } catch (confirmError) {
      console.error("Failed to confirm Payment", confirmError);
      setError(whtLineRpcError(confirmError, taxFacts) || paymentErrorMessage(confirmError, uiMessage("finance.payment.ui.confirmFailed")));
    } finally {
      actionLock.current = false; setConfirming(false);
    }
  };

  const runException = async () => {
    if (!payment || !exceptionMode || !exceptionReason.trim() || processingException || actionLock.current) return;
    const allowed = exceptionMode === "cancel" ? payment.status === "draft" && access.canManage : payment.status === "confirmed" && access.canReverse;
    if (!allowed) return;
    actionLock.current = true; setProcessingException(true); setError(""); setMessage("");
    try {
      const result = exceptionMode === "cancel"
        ? await supabase.rpc("cancel_finance_payment_draft", { p_payment_id: payment.id, p_reason: exceptionReason })
        : await supabase.rpc("reverse_finance_payment", { p_payment_id: payment.id, p_reason: exceptionReason });
      if (result.error) throw result.error;
      const completedMode = exceptionMode;
      setExceptionMode(null); setExceptionReason("");
      await load();
      setMessage(completedMode === "cancel" ? uiMessage("finance.payment.ui.cancelledSuccess") : uiMessage("finance.payment.ui.reversedSuccess"));
    } catch (exceptionError) {
      console.error("Failed to change Payment state", exceptionError);
      setError(paymentErrorMessage(exceptionError, exceptionMode === "cancel" ? uiMessage("finance.payment.ui.cancelFailed") : uiMessage("finance.payment.ui.reverseFailed")));
    } finally {
      actionLock.current = false; setProcessingException(false);
    }
  };

  const openReallocation = () => {
    const firstSource = currentEffectiveAllocations[0]?.invoice_id || "";
    setReallocationSourceId(firstSource);
    setReallocationTargetId("");
    setReallocationMode("full");
    setReallocationCash("0.00");
    setReallocationWht("0.00");
    setReallocationReason("");
    setReallocationAcknowledged(false);
    setReallocationErrors({});
    setReallocationRequestId(crypto.randomUUID());
    setReallocationAttempted(false);
    setReallocationOpen(true);
    setError(""); setMessage("");
    requestAnimationFrame(() => reallocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const closeReallocation = () => {
    if (reallocating) return;
    setReallocationOpen(false);
    setReallocationErrors({});
    setReallocationRequestId("");
    setReallocationAttempted(false);
  };

  const beginChangedReallocationIntent = () => {
    if (reallocationAttempted) {
      setReallocationRequestId(crypto.randomUUID());
      setReallocationAttempted(false);
    }
  };

  const validateReallocation = () => {
    const next: ReallocationErrors = {};
    if (!selectedSourceAllocation) next.source = uiMessage("finance.payment.ui.sourceRequired");
    if (!selectedTargetInvoice) next.target = uiMessage("finance.payment.ui.targetRequired");
    if (reallocationSourceId && reallocationSourceId === reallocationTargetId) next.target = uiMessage("finance.payment.ui.differentInvoices");
    if (reallocationMode === "partial" && (!hasValidCurrencyPrecision(reallocationCash) || reallocationCashAmount < 0)) next.cash = uiMessage("finance.payment.ui.moveReceivedPrecision");
    if (reallocationMode === "partial" && (!hasValidCurrencyPrecision(reallocationWht) || reallocationWhtAmount < 0)) next.wht = uiMessage("finance.payment.ui.moveWhtPrecision");
    if (selectedSourceAllocation && reallocationCashAmount > normalizedAmount(selectedSourceAllocation.effective_cash_allocated)) next.cash = uiMessage("finance.payment.ui.moveReceivedExceeds");
    if (selectedSourceAllocation && reallocationWhtAmount > normalizedAmount(selectedSourceAllocation.effective_wht_credit_allocated)) next.wht = uiMessage("finance.payment.ui.moveWhtExceeds");
    if (reallocationTotal <= 0) next.cash = uiMessage("finance.payment.ui.positiveMove");
    const targetSettlementSummary = settlements.find((row) => row.invoice_id === reallocationTargetId);
    if (targetSettlementSummary && reallocationTotal > normalizedAmount(targetSettlementSummary.outstanding_amount)) next.target = uiMessage("finance.payment.ui.targetCapacity");
    if (!reallocationReason.trim()) next.reason = uiMessage("finance.payment.ui.moveReasonRequired");
    if (reallocationReason.trim().length > 2000) next.reason = uiMessage("finance.payment.ui.reasonLength");
    if (!reallocationAcknowledged) next.acknowledgement = uiMessage("finance.payment.ui.moveAckRequired");
    setReallocationErrors(next);
    if (Object.keys(next).length) requestAnimationFrame(() => { reallocationFirstInvalidRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); reallocationFirstInvalidRef.current?.focus(); });
    return Object.keys(next).length === 0;
  };

  const submitReallocation = async () => {
    if (!payment || payment.status !== "confirmed" || !access.canReallocate || reallocating || reallocationLock.current || !validateReallocation()) return;
    reallocationLock.current = true; setReallocating(true); setReallocationAttempted(true); setError(""); setMessage("");
    const requestId = reallocationRequestId || crypto.randomUUID();
    if (!reallocationRequestId) setReallocationRequestId(requestId);
    try {
      const result = await supabase.rpc("reallocate_finance_payment_allocation", {
        p_payment_id: payment.id,
        p_source_invoice_id: reallocationSourceId,
        p_target_invoice_id: reallocationTargetId,
        p_cash_amount: reallocationCashAmount,
        p_wht_amount: reallocationWhtAmount,
        p_reason: reallocationReason.trim(),
        p_acknowledged: true,
        p_request_id: requestId,
      });
      if (result.error) throw result.error;
      let successfulSourceId = reallocationSourceId;
      let successfulTargetId = reallocationTargetId;
      let successfulCash = reallocationCashAmount;
      let successfulWht = reallocationWhtAmount;
      let successfulSettlement = reallocationTotal;
      const reallocationId = typeof result.data === "string" ? result.data : "";
      if (reallocationId) {
        const authoritativeResult = await supabase.from("finance_payment_allocation_reallocations").select(reallocationSelect).eq("id", reallocationId).maybeSingle();
        if (authoritativeResult.error) {
          console.error("Failed to reload successful Payment reallocation event", authoritativeResult.error);
        } else if (authoritativeResult.data?.payment_id === payment.id) {
          const authoritative = authoritativeResult.data as PaymentAllocationReallocation;
          successfulSourceId = authoritative.source_invoice_id;
          successfulTargetId = authoritative.target_invoice_id;
          successfulCash = normalizedAmount(authoritative.cash_moved);
          successfulWht = normalizedAmount(authoritative.wht_moved);
          successfulSettlement = normalizedAmount(authoritative.settlement_moved);
        }
      }
      const successfulSourceInvoice = invoices.find((row) => row.id === successfulSourceId) || selectedSourceInvoice;
      const successfulTargetInvoice = invoices.find((row) => row.id === successfulTargetId) || selectedTargetInvoice;
      const successMessage = uiMessage("finance.payment.ui.moveSuccess", { settlement: money(successfulSettlement, payment.currency), source: displayText(successfulSourceInvoice?.invoice_no), target: displayText(successfulTargetInvoice?.invoice_no), received: money(successfulCash, payment.currency), wht: money(successfulWht, payment.currency) });
      setReallocationOpen(false);
      setReallocationRequestId("");
      setReallocationAttempted(false);
      await load();
      setMessage(successMessage);
    } catch (reallocationError) {
      console.error("Failed to reallocate Payment allocation", reallocationError);
      setError(paymentReallocationErrorMessage(reallocationError));
    } finally {
      reallocationLock.current = false; setReallocating(false);
    }
  };

  if (loading) return <main style={page}>{t("finance.payment.ui.loading")}</main>;
  if (!payment || !allocation || !invoice) return <main style={page}>{error ? text(error) : t("finance.payment.ui.notFound")}</main>;

  return <main className="payment-workspace" style={page}>
    <nav style={navigationToolbar}>{payment.status === "confirmed" ? currentAllocatedInvoice ? <Link style={navigationLink} href={`/finance/invoices/${currentAllocatedInvoice.id}`}>{t("finance.payment.ui.openCurrentInvoice")} {displayText(currentAllocatedInvoice.invoice_no)}</Link> : <a style={navigationLink} href="#current-payment-allocations">{t("finance.payment.ui.relatedInvoices")}</a> : <Link style={navigationLink} href={`/finance/invoices/${invoice.id}`}>{t("finance.payment.ui.backInvoice")} {displayText(invoice.invoice_no)}</Link>}</nav>
    {error ? <div role="alert" style={errorNotice}>{text(error)}</div> : null}
    {message ? <SuccessNotice message={text(message)} /> : null}

    <section style={{ ...surface, ...headerSurface }}>
      <div className="payment-header" style={identityHeader}>
        <div><span style={eyebrow}>{t("finance.receipt.payment")}</span><h1 style={title}>{payment.status === "draft" ? t("finance.payment.ui.draftTitle") : t("finance.payment.ui.details")}</h1><p style={reference}>{t("finance.payment.ui.reference")} {displayText(payment.internal_reference, payment.id.slice(0, 8).toUpperCase())}</p></div>
        <div style={statusPanel}><small style={fieldLabel}>{t("finance.payment.ui.status")}</small><StatusBadge status={payment.status}>{paymentStatusLabels[payment.status] || payment.status}</StatusBadge><span style={smallText}>{t("finance.payment.ui.updated")} {date(payment.updated_at, true)}</span></div>
      </div>
      {payment.status === "confirmed" ? <div style={confirmedNotice}><strong>{t("finance.payment.ui.confirmed")}</strong><span>{t("finance.payment.ui.readonly")}</span></div> : null}
      {payment.status === "cancelled" ? <div style={cancelledNotice}><strong>{t("finance.payment.ui.cancelled")}</strong><span>{displayText(payment.cancel_reason)}</span></div> : null}
      {payment.status === "reversed" ? <div style={cancelledNotice}><strong>{t("finance.payment.ui.reversed")}</strong><span>{displayText(payment.reverse_reason)}</span></div> : null}
    </section>

    <section style={surface}>
      <SectionHeading title={t("finance.payment.ui.context")} description={t("finance.payment.ui.contextHelp")} />
      <div style={contextGrid}><Field label={t("finance.payment.ui.client")} value={displayText(invoice.customer_name)} /><Field label={t("finance.payment.ui.allocatedInvoices")} value={t("finance.payment.ui.invoiceCount", { count: payment.status === "confirmed" ? currentEffectiveAllocations.length : allocations.length })} /><Field label={paymentSettlementLabels.settlementTotal} value={money(payment.settlement_amount, payment.currency)} /><Field label={t("finance.payment.ui.currency")} value={payment.currency} /></div>
    </section>

    {isDraft ? <>
      <section style={surface}>
        <SectionHeading title={t("finance.payment.ui.details")} description={t("finance.payment.ui.paymentHelp")} />
        {!access.canManage ? <div style={neutralNotice}>{t("finance.payment.ui.readonlyDraft")}</div> : null}
        <div style={formGrid}>
          <FormField label={t("finance.payment.ui.actualDate")} required error={errors.receivedOn}><input ref={firstInputRef} style={inputStyle(Boolean(errors.receivedOn))} type="date" value={form.receivedOn} disabled={!access.canManage || saving} onChange={(event) => updateForm("receivedOn", event.target.value)} /></FormField>
          <FormField label={t("finance.payment.ui.method")} required error={errors.paymentMethod}><select style={inputStyle(Boolean(errors.paymentMethod))} value={form.paymentMethod} disabled={!access.canManage || saving} onChange={(event) => updateForm("paymentMethod", event.target.value)}><option value="">{t("finance.payment.ui.chooseMethod")}</option>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
          <FormField label={t("finance.payment.ui.receivingBank")} required={form.paymentMethod === "bank_transfer"} error={errors.bankAccount}><select style={inputStyle(Boolean(errors.bankAccount))} value={form.receivingBankAccountId} disabled={!access.canManage || saving} onChange={(event) => updateForm("receivingBankAccountId", event.target.value)}><option value="">{t("finance.payment.ui.unspecified")}</option>{bankAccounts.filter((account) => account.is_active || account.id === form.receivingBankAccountId).map((account) => <option key={account.id} value={account.id}>{displayText(account.short_name, account.bank_name || t("finance.payment.ui.bankAccount"))}{account.is_active ? "" : t("finance.payment.ui.inactive")}</option>)}</select></FormField>
          <FormField label={t("finance.payment.ui.payer")}><input style={inputStyle(false)} value={form.payerName} disabled={!access.canManage || saving} onChange={(event) => updateForm("payerName", event.target.value)} /></FormField>
          <FormField label={t("finance.payment.ui.transactionReference")}><input style={inputStyle(false)} value={form.externalTransactionReference} disabled={!access.canManage || saving} onChange={(event) => updateForm("externalTransactionReference", event.target.value)} /></FormField>
          <FormField label={t("finance.payment.ui.channelDetails")}><input style={inputStyle(false)} value={form.receivingAccountReference} disabled={!access.canManage || saving} onChange={(event) => updateForm("receivingAccountReference", event.target.value)} /></FormField>
        </div>
        <FormField label={t("finance.payment.ui.note")}><textarea style={textareaStyle} rows={3} value={form.note} disabled={!access.canManage || saving} onChange={(event) => updateForm("note", event.target.value)} /></FormField>
      </section>

      <section style={surface}>
        <SectionHeading title={t("finance.payment.ui.settlementWht")} description={t("finance.payment.ui.settlementHelp")} />
        {allocations.map((row) => <InvoiceTaxSummary key={row.id} facts={invoiceTaxFacts(invoices.find((item) => item.id === row.invoice_id)?.issued_snapshot_json)} />)}
        {draftAllocationEditingLimited ? <div style={neutralNotice}>{t("finance.payment.ui.multiInvoiceReadonly")}</div> : null}
        <div className="payment-settlement-entry-grid" style={settlementEntryGrid}>
          <FormField label={t("finance.payment.ui.targetThisPayment")} helper={draftAllocationEditingLimited ? t("finance.payment.ui.allInvoiceAllocationTotal") : t("finance.payment.ui.outstandingValue", { amount: money(outstandingBefore, payment.currency) })} required error={errors.settlementTarget}><input style={inputStyle(Boolean(errors.settlementTarget))} type="number" min="0" step="0.01" value={settlementTarget} disabled={!access.canManage || saving || draftAllocationEditingLimited || whtMode === "legacy"} onChange={(event) => updateSettlementTarget(event.target.value)} /></FormField>
          <div style={whtChoiceField}><span style={formLabel}>{t("finance.payment.ui.wht")}</span><div style={whtToggleGroup} role="group" aria-label={t("finance.payment.ui.wht")}><button className="payment-wht-choice" type="button" aria-pressed={whtMode === "none"} style={{ ...whtToggleButton, ...(whtMode === "none" ? whtToggleButtonActive : {}) }} disabled={!access.canManage || saving || draftAllocationEditingLimited} onClick={() => selectWhtMode(false)}>{t("finance.payment.ui.noWhtChoice")}</button><button className="payment-wht-choice" type="button" aria-pressed={whtMode !== "none"} style={{ ...whtToggleButton, ...(whtMode !== "none" ? whtToggleButtonActive : {}) }} disabled={!access.canManage || saving || draftAllocationEditingLimited} onClick={() => selectWhtMode(true)}>{t("finance.payment.ui.whtChoice")}</button></div></div>
        </div>
        {whtMode === "rate" && !draftAllocationEditingLimited ? <div style={whtRateSection}>
          <Field label={t("finance.payment.ui.whtBase")} value={currentWhtBase.base !== null ? money(currentWhtBase.base, payment.currency) : t("finance.payment.ui.baseUnknown")} />
          {currentWhtBase.error ? <div role="alert" style={neutralNotice}>{t(currentWhtBase.errorKey)}</div> : <>
          <span style={formLabel}>{t("finance.payment.ui.whtRate")}</span>
          <p style={whtAssistanceHelp}>{t("finance.payment.wht.applicability")}</p>
          <div className="payment-wht-rate-grid" style={whtRateGrid}>{whtRatePresets.map((rate) => {
            const value = String(rate) as WhtRateOption;
            return <button className="payment-wht-rate" key={rate} type="button" aria-pressed={whtRateOption === value} style={{ ...whtRateButton, ...(whtRateOption === value ? whtRateButtonActive : {}) }} disabled={!access.canManage || saving} onClick={() => selectWhtRate(value)}>{rate}%</button>;
          })}<button className="payment-wht-rate" type="button" aria-pressed={whtRateOption === "custom"} style={{ ...whtRateButton, ...(whtRateOption === "custom" ? whtRateButtonActive : {}) }} disabled={!access.canManage || saving} onClick={() => selectWhtRate("custom")}>{t("finance.payment.ui.otherRate")}</button></div>
          {whtRateOption === "custom" ? <FormField label={t("finance.payment.ui.customRate")} helper={t("finance.payment.ui.rateRange")} error={errors.whtRate}><div style={percentInputWrap}><input style={inputStyle(Boolean(errors.whtRate))} type="number" min="0" max="100" step="0.01" value={customWhtRate} disabled={!access.canManage || saving} onChange={(event) => updateCustomWhtRate(event.target.value)} /><span>%</span></div></FormField> : errors.whtRate ? <div role="alert" style={inlineError}>{text(errors.whtRate)}</div> : null}
          <Field label={t("finance.payment.ui.calculatedWht")} value={whtCalculation ? money(wht, payment.currency) : t("finance.payment.ui.chooseRate")} />
          </>}
        </div> : null}
        {whtMode === "line_review" ? <div data-wht-editor>
          {lineScopeError ? <div role="alert" style={neutralNotice}>{text(lineScopeError)}</div> : null}
          {taxFacts ? <WhtLineReview facts={taxFacts} choices={whtLineChoices} onChange={updateWhtLine} disabled={!access.canManage || saving || confirming || Boolean(lineScopeError)} showErrors={lineErrorsVisible} /> : null}
        </div> : null}
        {whtMode === "legacy" ? <div style={neutralNotice}>
          <strong>{t("finance.payment.ui.legacyWht")} {money(payment.wht_amount, payment.currency)}</strong>
          <p>{t("finance.payment.wht.legacy")}</p>
          <button type="button" style={secondaryButton} disabled={!access.canManage || saving || draftAllocationEditingLimited} onClick={recalculateLegacyWht}>{t("finance.payment.ui.recalculateWht")}</button>
        </div> : null}
        {errors.whtRate || errors.whtAmount || errors.whtLines ? <div role="alert" style={inlineError}>{text(errors.whtLines || errors.whtRate || errors.whtAmount || "")}</div> : null}
        <div style={assistedAmountSummary}>
          <Metric label={t("finance.payment.ui.targetSettlement")} value={money(targetSettlement, payment.currency)} prominent />
          <Metric label={paymentSettlementLabels.whtCredit} value={lineReviewPending ? t("finance.payment.wht.lines.pending") : money(wht, payment.currency)} />
          <Metric label={paymentSettlementLabels.receivedFull} value={lineReviewPending ? t("finance.payment.wht.lines.pending") : money(cash, payment.currency)} />
          <Metric label={paymentSettlementLabels.settlementTotal} value={lineReviewPending ? t("finance.payment.wht.lines.pending") : money(paymentSettlement, payment.currency)} />
        </div>
        {!lineReviewPending ? <div style={allocationList}>{allocations.map((row) => {
          const rowInvoice = invoices.find((item) => item.id === row.invoice_id);
          const rowCash = draftAllocationEditingLimited ? row.cash_allocated : cash;
          const rowWht = draftAllocationEditingLimited ? row.wht_credit_allocated : wht;
          const rowTotal = draftAllocationEditingLimited ? row.settlement_total : paymentSettlement;
          return <AllocationSummaryCard key={row.id} invoice={rowInvoice || null} cash={rowCash} wht={rowWht} total={rowTotal} currency={payment.currency} />;
        })}</div> : null}
        {errors.allocation ? <div role="alert" style={inlineError}>{text(errors.allocation)}</div> : null}
        {access.canManage ? <div style={saveRow}><span style={dirty ? unsavedState : savedState}>{dirty ? t("finance.payment.ui.unsaved") : t("finance.payment.ui.savedState")}</span><button type="button" style={{ ...secondaryButton, ...(!dirty ? disabledButton : {}) }} disabled={!dirty || saving} onClick={() => void saveDraft()}>{saving ? t("finance.payment.ui.saving") : dirty ? t("finance.payment.ui.saveChanges") : t("finance.payment.ui.savedState")}</button></div> : null}
      </section>

      <section ref={reviewRef} style={reviewZone}>
        <span style={eyebrow}>{t("finance.payment.ui.finalReview")}</span><h2 style={reviewTitle}>{t("finance.payment.ui.confirmReview")}</h2><p style={sectionDescription}>{t("finance.payment.ui.confirmReviewHelp")}</p>
        <div style={reviewGroups}>
          <div style={reviewGroup}>{allocations.map((row) => <InvoiceTaxSummary key={row.id} facts={invoiceTaxFacts(invoices.find((item) => item.id === row.invoice_id)?.issued_snapshot_json)} />)}</div>
          <div style={reviewGroup}><h3 style={reviewGroupTitle}>{t("finance.payment.ui.recordDetails")}</h3><div style={reviewGrid}><Field label={t("finance.payment.ui.invoice")} value={displayText(invoice.invoice_no)} /><Field label={t("finance.payment.ui.actualDate")} value={form.receivedOn ? date(form.receivedOn) : t("finance.payment.ui.notEntered")} /><Field label={t("finance.payment.ui.method")} value={paymentMethodLabels[form.paymentMethod] || t("finance.payment.ui.notEntered")} /><Field label={t("finance.payment.ui.actualReceivingAccount")} value={<BankAccountIdentity account={draftReceivingBankAccount} paymentMethod={form.paymentMethod} />} />{form.payerName.trim() ? <Field label={t("finance.payment.ui.payer")} value={form.payerName.trim()} /> : null}{form.externalTransactionReference.trim() ? <Field label={t("finance.payment.ui.transactionReference")} value={form.externalTransactionReference.trim()} /> : null}{form.receivingAccountReference.trim() ? <Field label={t("finance.payment.ui.channelDetails")} value={form.receivingAccountReference.trim()} /> : null}{form.note.trim() ? <Field label={t("finance.payment.ui.note")} value={form.note.trim()} /> : null}</div></div>
          <div style={reviewGroup}><h3 style={reviewGroupTitle}>{t("finance.payment.ui.amountsWht")}</h3><div style={reviewGrid}>
            <Field label={t("finance.payment.ui.targetSettlement")} value={<strong>{money(targetSettlement, payment.currency)}</strong>} />
            {whtMode !== "line_review" ? <><Field label={t("finance.payment.ui.whtBaseShort")} value={whtMode === "rate" && currentWhtBase.base !== null ? money(currentWhtBase.base, payment.currency) : whtMode === "none" ? t("finance.payment.ui.whtNotUsed") : t("finance.payment.ui.notEntered")} /><Field label={t("finance.payment.ui.whtRate")} value={whtMode === "none" ? t("finance.payment.ui.noWht") : whtMode === "legacy" ? t("finance.payment.ui.legacyNoRate") : selectedWhtRate > 0 ? `${selectedWhtRate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%` : t("finance.payment.ui.rateNotSelected")} /></> : null}
            <Field label={paymentSettlementLabels.receivedFull} value={lineReviewPending ? t("finance.payment.wht.lines.pending") : money(cash, payment.currency)} />
            <Field label={paymentSettlementLabels.whtCredit} value={lineReviewPending ? t("finance.payment.wht.lines.pending") : money(wht, payment.currency)} />
            <Field label={paymentSettlementLabels.settlementTotal} value={<strong>{lineReviewPending ? t("finance.payment.wht.lines.pending") : money(paymentSettlement, payment.currency)}</strong>} />
          </div>{whtMode === "line_review" && taxFacts ? <WhtLineReview facts={taxFacts} choices={whtLineChoices} readOnly /> : null}</div>
          {!lineReviewPending ? <div style={reviewGroup}><h3 style={reviewGroupTitle}>{t("finance.payment.ui.allocations")}</h3><div style={allocationList}>{allocations.map((row) => { const rowInvoice = invoices.find((item) => item.id === row.invoice_id); return <AllocationSummaryCard key={row.id} invoice={rowInvoice || null} cash={draftAllocationEditingLimited ? row.cash_allocated : cash} wht={draftAllocationEditingLimited ? row.wht_credit_allocated : wht} total={draftAllocationEditingLimited ? row.settlement_total : paymentSettlement} currency={payment.currency} />; })}</div>{!draftAllocationEditingLimited ? <div style={{ marginTop: 12 }}><Field label={t("finance.payment.ui.expectedOutstanding")} value={<strong>{money(expectedOutstanding, payment.currency)}</strong>} /></div> : null}</div> : null}
        </div>
        {dirty ? <div style={neutralNotice}>{t("finance.payment.ui.saveBeforeConfirm")}</div> : null}
        {!access.canConfirm ? <div style={neutralNotice}>{t("finance.payment.ui.noConfirmPermission")}</div> : null}
        {access.canConfirm && !confirmationOpen ? <button type="button" style={{ ...primaryButton, ...(dirty ? disabledButton : {}) }} disabled={dirty} onClick={openConfirmation}>{t("finance.payment.ui.confirm")}</button> : null}
        {confirmationOpen ? <div style={confirmationPanel}>
          <label style={{ ...confirmationCheck, ...(errors.confirmation ? invalidConfirmation : {}) }}><input type="checkbox" checked={confirmationAcknowledged} onChange={(event) => { setConfirmationAcknowledged(event.target.checked); setErrors((current) => ({ ...current, confirmation: undefined })); }} />{t("finance.payment.ui.confirmAck")}</label>
          <p style={sectionDescription}>{t("finance.payment.ui.confirmScope")}</p>
          <div style={actionRow}><button type="button" style={secondaryButton} disabled={confirming} onClick={() => setConfirmationOpen(false)}>{t("finance.payment.ui.backReview")}</button><button type="button" style={{ ...primaryButton, ...(!confirmationAcknowledged ? disabledButton : {}) }} disabled={!confirmationAcknowledged || confirming} onClick={() => void confirmPayment()}>{confirming ? t("finance.payment.ui.confirming") : t("finance.payment.ui.confirm")}</button></div>
        </div> : null}
      </section>
    </> : <>
      <section style={surface}>
        <SectionHeading title={t("finance.payment.ui.details")} description={t("finance.payment.ui.confirmedReadonlyHelp")} />
        {allocations.map((row) => <InvoiceTaxSummary key={row.id} facts={invoiceTaxFacts(invoices.find((item) => item.id === row.invoice_id)?.issued_snapshot_json)} />)}
        {payment.wht_calculation_mode === "line_review" && taxFacts ? <WhtLineReview facts={taxFacts} choices={whtLineChoices} readOnly showErrors /> : whtComponents.length ? <div style={contextGrid}>{whtComponents.map((component) => <div key={component.id}><Field label={t("finance.payment.ui.storedWhtBase")} value={money(component.base_amount, payment.currency)} /><Field label={t("finance.payment.ui.storedWhtRate")} value={`${Number(component.rate_percent)}%`} /></div>)}</div> : Number(payment.wht_amount) > 0 ? <p style={sectionDescription}>{t("finance.payment.ui.legacyWht")} {money(payment.wht_amount, payment.currency)} {t("finance.payment.ui.noStoredBasis")}</p> : null}
        <div style={readOnlyGroups}>
          <div style={readOnlyGroup}><h3 style={readOnlyGroupTitle}>{t("finance.payment.ui.recordDetails")}</h3><div style={readOnlyGrid}><Field label={t("finance.payment.ui.status")} value={<StatusBadge status={payment.status}>{paymentStatusLabels[payment.status] || payment.status}</StatusBadge>} /><Field label={t("finance.payment.ui.actualDate")} value={payment.received_on ? date(payment.received_on) : t("finance.payment.ui.unspecified")} /><Field label={t("finance.payment.ui.method")} value={paymentMethodLabels[payment.payment_method || ""] || t("finance.payment.ui.unspecified")} /><Field label={t("finance.payment.ui.actualReceivingAccount")} value={<BankAccountIdentity account={savedReceivingBankAccount} paymentMethod={payment.payment_method || ""} />} />{payment.payer_name?.trim() ? <Field label={t("finance.payment.ui.payer")} value={payment.payer_name.trim()} /> : null}{payment.external_transaction_reference?.trim() ? <Field label={t("finance.payment.ui.transactionReference")} value={payment.external_transaction_reference.trim()} /> : null}{payment.receiving_account_reference?.trim() ? <Field label={t("finance.payment.ui.channelDetails")} value={payment.receiving_account_reference.trim()} /> : null}{payment.note?.trim() ? <Field label={t("finance.payment.ui.note")} value={payment.note.trim()} /> : null}</div></div>
          <div style={readOnlyGroup}><h3 style={readOnlyGroupTitle}>{t("finance.payment.ui.amounts")}</h3><div style={summaryGrid}><Metric label={t("finance.payment.ui.settledAmount")} value={money(payment.settlement_amount, payment.currency)} prominent /><Metric label={paymentSettlementLabels.receivedFull} value={money(payment.cash_amount, payment.currency)} /><Metric label={paymentSettlementLabels.whtCredit} value={money(payment.wht_amount, payment.currency)} /><Metric label={paymentSettlementLabels.settlementTotal} value={money(payment.settlement_amount, payment.currency)} />{payment.status === "confirmed" ? <Metric label={t("finance.payment.ui.currentlyAllocated")} value={money(effectiveAllocationTotal, payment.currency)} /> : null}</div></div>
        </div>
        {payment.status === "confirmed" ? <FinanceDocumentNextAction key={payment.id} paymentId={payment.id} /> : null}
        {payment.status === "confirmed" || payment.status === "reversed" ? <MoneyAllocationPanel key={`money-${payment.id}-${payment.status}`} paymentId={payment.id} /> : null}
      </section>

      {payment.status === "confirmed" ? <section id="current-payment-allocations" style={{ ...surface, scrollMarginTop: 84 }}>
        <SectionHeading title={t("finance.payment.ui.currentAllocation")} description={t("finance.payment.ui.currentAllocationHelp")} />
        <div className="payment-effective-allocation-grid" style={effectiveAllocationGrid}>{currentEffectiveAllocations.map((row) => {
          const rowInvoice = invoices.find((item) => item.id === row.invoice_id) || null;
          const rowSettlement = settlements.find((item) => item.invoice_id === row.invoice_id) || null;
          return <EffectiveAllocationCard key={row.invoice_id} allocation={row} invoice={rowInvoice} settlement={rowSettlement} currency={payment.currency} />;
        })}</div>
        {!currentEffectiveAllocations.length ? <div style={neutralNotice}>{t("finance.payment.ui.noCurrentAllocations")}</div> : null}
      </section> : <section style={surface}><SectionHeading title={t("finance.payment.ui.originalAllocation")} description={t("finance.payment.ui.originalAllocationHelp")} /><div style={allocationList}>{allocations.map((row) => <AllocationSummaryCard key={row.id} invoice={invoices.find((item) => item.id === row.invoice_id) || null} cash={row.cash_allocated} wht={row.wht_credit_allocated} total={row.settlement_total} currency={payment.currency} />)}</div></section>}

      <section style={surface}>
        <details>
          <summary style={historySummary}>{paymentCorrectionCopy.allocationHistory} {reallocations.length ? `(${reallocations.length})` : ""}</summary>
          <p style={sectionDescription}>{t("finance.payment.ui.historyHelp")}</p>
          <div style={historyList}>
            {allocations.map((row) => <HistoryRow key={`original-${row.id}`} title={t("finance.payment.ui.initialAllocation")} source={null} target={invoices.find((item) => item.id === row.invoice_id) || null} cash={row.cash_allocated} wht={row.wht_credit_allocated} total={row.settlement_total} reason={null} createdAt={null} currency={payment.currency} />)}
            {reallocations.map((row) => <HistoryRow key={row.id} title={t("finance.payment.ui.changeInvoice")} source={invoices.find((item) => item.id === row.source_invoice_id) || null} target={invoices.find((item) => item.id === row.target_invoice_id) || null} cash={row.cash_moved} wht={row.wht_moved} total={row.settlement_moved} reason={row.reason} createdAt={row.created_at} currency={payment.currency} />)}
          </div>
        </details>
      </section>
    </>}

    {payment.status === "confirmed" && (access.canReallocate || access.canReverse) ? <section ref={reallocationRef} style={financialActionSection}>
      <h2 style={financialActionTitle}>{paymentCorrectionCopy.sectionTitle}</h2>
      <p style={sectionDescription}>{t("finance.payment.ui.correctionHelp")}</p>
      {access.canReallocate ? <div style={correctionFlow}>
        <h3 style={correctionFlowTitle}>1. {paymentCorrectionCopy.wrongInvoiceTitle}</h3>
        <p style={sectionDescription}>{paymentCorrectionCopy.wrongInvoiceDescription}</p>
        {whtComponents.length ? <div style={neutralNotice}>{t("finance.payment.ui.whtReallocationBlocked")}</div> : !reallocationOpen ? <button type="button" style={reallocationButton} onClick={openReallocation}>{paymentCorrectionCopy.allocationAction}</button> : <div style={reallocationPanel}>
        <h3 style={reallocationPanelTitle}>{paymentCorrectionCopy.allocationHeading}</h3>
        <div style={coreWarning}><strong>{paymentCorrectionCopy.allocationHelper}</strong><span>{t("finance.payment.ui.reallocationScope")}</span></div>
        {Object.keys(reallocationErrors).length ? <div role="alert" style={validationSummary}>{t("finance.payment.ui.reallocationValidation")}</div> : null}
        <div className="payment-reallocation-form-grid" style={reallocationFormGrid}>
          <FormField label={t("finance.payment.ui.sourceStep")} required error={reallocationErrors.source}><select ref={reallocationFirstInvalidRef} style={inputStyle(Boolean(reallocationErrors.source))} value={reallocationSourceId} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationSourceId(event.target.value); if (event.target.value === reallocationTargetId) setReallocationTargetId(""); setReallocationErrors((current) => ({ ...current, source: undefined, target: undefined, cash: undefined, wht: undefined })); }}><option value="">{t("finance.payment.ui.chooseSource")}</option>{currentEffectiveAllocations.map((row) => { const rowInvoice = invoices.find((item) => item.id === row.invoice_id); return <option key={row.invoice_id} value={row.invoice_id}>{displayText(rowInvoice?.invoice_no)} · {money(row.effective_settlement_total, payment.currency)}</option>; })}</select></FormField>
          <FormField label={t("finance.payment.ui.targetStep")} required error={reallocationErrors.target}><select style={inputStyle(Boolean(reallocationErrors.target))} value={reallocationTargetId} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationTargetId(event.target.value); setReallocationErrors((current) => ({ ...current, target: undefined })); }}><option value="">{t("finance.payment.ui.chooseTarget")}</option>{candidateInvoices.filter((row) => row.id !== reallocationSourceId && normalizedAmount(settlements.find((item) => item.invoice_id === row.id)?.outstanding_amount) > 0).map((row) => { const rowSettlement = settlements.find((item) => item.invoice_id === row.id); return <option key={row.id} value={row.id}>{displayText(row.invoice_no)} {t("finance.payment.ui.outstandingOption")} {money(rowSettlement?.outstanding_amount, row.currency)}</option>; })}</select></FormField>
        </div>
        <div className="payment-reallocation-context-grid" style={reallocationContextGrid}>
          {selectedSourceAllocation ? <InvoiceMoveContext title={t("finance.payment.ui.currentInvoice")} invoice={selectedSourceInvoice} tone="neutral"><small style={contextSectionLabel}>{t("finance.payment.ui.currentAllocation")}</small><div style={contextAmounts}><span>{paymentSettlementLabels.receivedCompact} {money(selectedSourceAllocation.effective_cash_allocated, payment.currency)}</span><span>WHT {money(selectedSourceAllocation.effective_wht_credit_allocated, payment.currency)}</span><strong>{t("finance.payment.ui.total")} {money(selectedSourceAllocation.effective_settlement_total, payment.currency)}</strong></div></InvoiceMoveContext> : null}
          {selectedTargetInvoice ? <InvoiceMoveContext title={t("finance.payment.ui.newInvoice")} invoice={selectedTargetInvoice} tone="accent"><div style={contextAmounts}><span>{t("finance.payment.ui.invoiceAmount")} {money(selectedTargetInvoice.total_amount, payment.currency)}</span><strong>{t("finance.payment.ui.outstanding")} {money(settlements.find((row) => row.invoice_id === selectedTargetInvoice.id)?.outstanding_amount, payment.currency)}</strong></div></InvoiceMoveContext> : null}
        </div>
        {crossMatterReallocation ? <div style={crossMatterWarning}>{t("finance.payment.ui.crossMatter")}</div> : null}
        <div><h3 style={moveTitle}>{t("finance.payment.ui.moveAmountStep")}</h3><div className="payment-reallocation-mode-grid" style={reallocationModeGrid}>{([{
          value: "full" as const,
          title: t("finance.payment.ui.full"),
          description: t("finance.payment.ui.fullHelp"),
        }, {
          value: "partial" as const,
          title: t("finance.payment.ui.partial"),
          description: t("finance.payment.ui.partialHelp"),
        }]).map((option) => <label key={option.value} className="payment-reallocation-mode" style={{ ...reallocationModeOption, ...(reallocationMode === option.value ? selectedReallocationModeOption : {}) }}><input type="radio" name="reallocation-mode" value={option.value} checked={reallocationMode === option.value} disabled={reallocating} onChange={() => { beginChangedReallocationIntent(); setReallocationMode(option.value); if (option.value === "partial") { setReallocationCash("0.00"); setReallocationWht("0.00"); } setReallocationErrors((current) => ({ ...current, cash: undefined, wht: undefined })); }} /><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}</div></div>
        {reallocationMode === "full" ? <div style={fullMoveSummary}><span>{t("finance.payment.ui.movingSettlement")}</span><div className="payment-full-move-grid" style={fullMoveGrid}><Metric label={paymentSettlementLabels.receivedCompact} value={money(reallocationCashAmount, payment.currency)} /><Metric label={t("finance.payment.ui.whtCredit")} value={money(reallocationWhtAmount, payment.currency)} /><Metric label={paymentSettlementLabels.settlementTotal} value={money(reallocationTotal, payment.currency)} prominent /></div></div> : <div className="payment-reallocation-form-grid" style={reallocationFormGrid}><FormField label={t("finance.payment.ui.movingReceived")} required error={reallocationErrors.cash}><input style={inputStyle(Boolean(reallocationErrors.cash))} type="number" min="0" step="0.01" value={reallocationCash} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationCash(event.target.value); setReallocationErrors((current) => ({ ...current, cash: undefined })); }} /></FormField><FormField label={t("finance.payment.ui.movingWht")} required error={reallocationErrors.wht}><input style={inputStyle(Boolean(reallocationErrors.wht))} type="number" min="0" step="0.01" value={reallocationWht} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationWht(event.target.value); setReallocationErrors((current) => ({ ...current, wht: undefined })); }} /></FormField></div>}
        {selectedSourceAllocation && selectedTargetInvoice ? <ReallocationReview sourceInvoice={selectedSourceInvoice} targetInvoice={selectedTargetInvoice} source={selectedSourceAllocation} target={selectedTargetAllocation} cashMoved={reallocationCashAmount} whtMoved={reallocationWhtAmount} currency={payment.currency} /> : null}
        <div style={unchangedSummary}><strong>{t("finance.payment.ui.moneyUnchanged")}</strong><div style={unchangedTotals}><Metric label={paymentSettlementLabels.settlementTotal} value={money(payment.settlement_amount, payment.currency)} prominent /><Metric label={paymentSettlementLabels.receivedCompact} value={money(payment.cash_amount, payment.currency)} /><Metric label={t("finance.payment.ui.whtCredit")} value={money(payment.wht_amount, payment.currency)} /></div></div>
        <FormField label={t("finance.payment.ui.reasonStep")} required error={reallocationErrors.reason}><textarea style={{ ...textareaStyle, ...(reallocationErrors.reason ? invalidInput : {}) }} rows={3} value={reallocationReason} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationReason(event.target.value); setReallocationErrors((current) => ({ ...current, reason: undefined })); }} /></FormField>
        <label style={{ ...reallocationAcknowledgement, ...(reallocationErrors.acknowledgement ? invalidConfirmation : {}) }}><input type="checkbox" checked={reallocationAcknowledged} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationAcknowledged(event.target.checked); setReallocationErrors((current) => ({ ...current, acknowledgement: undefined })); }} /><span>{t("finance.payment.ui.moveAck")}{reallocationErrors.acknowledgement ? <small style={formError}>{text(reallocationErrors.acknowledgement)}</small> : null}</span></label>
        <div style={actionRow}><button type="button" style={secondaryButton} disabled={reallocating} onClick={closeReallocation}>{t("finance.payment.ui.cancel")}</button><button type="button" style={primaryButton} disabled={reallocating} onClick={() => void submitReallocation()}>{reallocating ? t("finance.payment.ui.moving") : t("finance.payment.ui.confirmMove")}</button></div>
      </div>}
      </div> : null}
      {access.canReverse ? <div style={{ ...correctionFlow, ...(access.canReallocate ? correctionFlowDivider : {}) }}>
        <h3 style={correctionFlowTitle}>{access.canReallocate ? "2. " : ""}{paymentCorrectionCopy.wrongPaymentTitle}</h3>
        <p style={sectionDescription}>{paymentCorrectionCopy.wrongPaymentDescription}</p>
        {!exceptionMode ? <button type="button" style={dangerOutlineButton} onClick={() => setExceptionMode("reverse")}>{paymentCorrectionCopy.paymentCorrectionAction}</button> : <div style={exceptionPanel}><FormField label={t("finance.payment.ui.correctionReason")} required><textarea style={textareaStyle} rows={3} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} /></FormField><div style={actionRow}><button type="button" style={secondaryButton} disabled={processingException} onClick={() => { setExceptionMode(null); setExceptionReason(""); }}>{t("finance.payment.ui.doNotProceed")}</button><button type="button" style={{ ...dangerButton, ...(!exceptionReason.trim() ? disabledButton : {}) }} disabled={!exceptionReason.trim() || processingException} onClick={() => void runException()}>{processingException ? t("finance.payment.ui.processing") : t("finance.payment.ui.confirmCorrection")}</button></div></div>}
      </div> : null}
    </section> : null}

    {payment.status === "draft" && access.canManage ? <section style={otherActions}>
      <h2 style={otherTitle}>{t("finance.payment.ui.otherActions")}</h2><p style={sectionDescription}>{t("finance.payment.ui.cancelHelp")}</p>
      {!exceptionMode ? <button type="button" style={dangerOutlineButton} onClick={() => setExceptionMode("cancel")}>{t("finance.payment.ui.cancelDraft")}</button> : <div style={exceptionPanel}><FormField label={t("finance.payment.ui.cancelReason")} required><textarea style={textareaStyle} rows={3} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} /></FormField><div style={actionRow}><button type="button" style={secondaryButton} disabled={processingException} onClick={() => { setExceptionMode(null); setExceptionReason(""); }}>{t("finance.payment.ui.doNotProceed")}</button><button type="button" style={{ ...dangerButton, ...(!exceptionReason.trim() ? disabledButton : {}) }} disabled={!exceptionReason.trim() || processingException} onClick={() => void runException()}>{processingException ? t("finance.payment.ui.processing") : t("finance.payment.ui.confirmCancel")}</button></div></div>}
    </section> : null}

    <style jsx global>{`
      @media (max-width: 720px) {
        .payment-workspace { padding: 14px !important; }
        .payment-header { grid-template-columns: minmax(0, 1fr) !important; }
        .payment-allocation-card { grid-template-columns: minmax(0, 1fr) !important; gap: 7px !important; }
        .payment-effective-allocation-grid, .payment-reallocation-form-grid, .payment-reallocation-context-grid, .payment-reallocation-mode-grid, .payment-review-invoice-grid, .payment-full-move-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .payment-settlement-entry-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .payment-wht-rate-grid { grid-template-columns: repeat(3,minmax(0,1fr)) !important; }
      }
      .payment-wht-choice, .payment-wht-rate { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .payment-reallocation-mode { transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
      .payment-reallocation-mode > span { display: grid; min-width: 0; gap: 3px; }
      .payment-reallocation-mode small { color: #64748b; line-height: 1.45; }
      .payment-reallocation-mode:hover { border-color: #93c5fd !important; }
      .payment-reallocation-mode:focus-within { outline: 3px solid rgba(37, 99, 235, .2); outline-offset: 2px; }
      .payment-wht-choice:hover:not(:disabled), .payment-wht-rate:hover:not(:disabled), .payment-wht-assistance:hover:not(:disabled) { border-color: #64748b !important; }
      .payment-wht-choice:focus-visible, .payment-wht-rate:focus-visible, .payment-wht-assistance:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .payment-wht-choice:disabled, .payment-wht-rate:disabled, .payment-wht-assistance:disabled { cursor: not-allowed !important; opacity: .58; }
    `}</style>
  </main>;
}

function SectionHeading({ title, description }: { title: string; description: string }) { return <div style={{ marginBottom: 16 }}><h2 style={sectionTitle}>{title}</h2><p style={sectionDescription}>{description}</p></div>; }
function SuccessNotice({ message }: { message: string }) { const [titleLine, ...detailLines] = message.split("\n"); return <div role="status" style={successNotice}><strong>{titleLine}</strong>{detailLines.map((line) => <span key={line}>{line}</span>)}</div>; }
function Field({ label, value }: { label: string; value: ReactNode }) { return <div style={{ minWidth: 0 }}><small style={fieldLabel}>{label}</small><div style={fieldValue}>{value}</div></div>; }
function InvoiceTaxSummary({ facts }: { facts: InvoiceTaxFacts | null }) { const { locale, t } = useI18n();
  return <div style={taxSummary}><h3 style={reviewGroupTitle}>{t("finance.payment.ui.invoiceInfo")}</h3>{facts ? <div style={contextGrid}>
    <Field label={t("finance.payment.ui.invoiceGross")} value={money(facts.gross, facts.currency)} />
    <Field label={t("finance.payment.ui.beforeVat")} value={money(facts.beforeVat, facts.currency)} />
    <Field label="VAT" value={money(facts.vat, facts.currency)} />
    <Field label={t("finance.payment.ui.vatStatus")} value={invoiceTaxVatLabel(facts, locale)} />
  </div> : <p style={sectionDescription}>{t("finance.payment.ui.taxEvidenceMissing")}</p>}</div>;
}
function FormField({ label, helper, required = false, error, children }: { label: string; helper?: string; required?: boolean; error?: UiMessage; children: ReactNode }) { const { text } = useI18n(); return <label style={formField}><span style={formLabel}>{label}{required ? <strong style={{ color: "#b91c1c" }}> *</strong> : null}</span>{children}{helper ? <small style={helperText}>{helper}</small> : null}{error ? <small style={formError}>{text(error)}</small> : null}</label>; }
function Metric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...metric, ...(prominent ? prominentMetric : {}) }}><small>{label}</small><strong style={metricValue}>{value}</strong></div>; }
function StatusBadge({ status, children }: { status: string; children: ReactNode }) { return <span style={{ ...badge, ...(status === "draft" ? amberBadge : status === "confirmed" ? greenBadge : redBadge) }}>{children}</span>; }
function BankAccountIdentity({ account, paymentMethod }: { account: BankAccount | null; paymentMethod: string }) { const { t } = useI18n(); if (!account) return <span>{paymentMethod === "bank_transfer" ? t("finance.payment.ui.notEntered") : t("finance.payment.ui.bankNotUsed")}</span>; return <div style={bankAccountIdentity}><strong>{displayText(account.short_name)} — {displayText(account.bank_name)}</strong>{account.account_number ? <span style={bankAccountDetail}>{account.account_number}{account.account_name ? ` · ${account.account_name}` : ""}</span> : null}</div>; }

function AllocationSummaryCard({ invoice, cash, wht, total, currency }: { invoice: InvoiceContext | null; cash: number | string; wht: number | string; total: number | string; currency: string }) { const { locale, t } = useI18n(); const { settlement: paymentSettlementLabels } = paymentUiLabels(locale);
  return <div className="payment-allocation-card" style={allocationCard}><div><small style={fieldLabel}>{t("finance.payment.ui.allocatedTo")}</small><strong>{displayText(invoice?.invoice_no)}</strong><span style={matterText}>{invoiceMatterLabel(invoice, locale)}</span></div><span>{paymentSettlementLabels.receivedCompact} {money(cash, currency)}</span><span>WHT {money(wht, currency)}</span><strong>{t("finance.payment.ui.total")} {money(total, currency)}</strong></div>;
}

function EffectiveAllocationCard({ allocation, invoice, settlement, currency }: { allocation: EffectivePaymentAllocation; invoice: InvoiceContext | null; settlement: InvoiceSettlement | null; currency: string }) { const { locale, t } = useI18n(); const { settlement: paymentSettlementLabels } = paymentUiLabels(locale);
  return <article style={effectiveAllocationCard}><div style={effectiveAllocationHeader}><div><Link style={invoiceLink} href={`/finance/invoices/${allocation.invoice_id}`}>{displayText(invoice?.invoice_no)}</Link><p style={matterText}>{invoiceMatterLabel(invoice, locale)}</p></div><span style={invoiceStatusBadge}>{invoiceStatusLabel(invoice?.document_status, locale)}</span></div><div style={allocationMetrics}><Field label={t("finance.payment.ui.client")} value={displayText(invoice?.customer_name)} /><Field label={paymentSettlementLabels.receivedCompact} value={money(allocation.effective_cash_allocated, currency)} /><Field label={t("finance.payment.ui.whtCredit")} value={money(allocation.effective_wht_credit_allocated, currency)} /><Field label={paymentSettlementLabels.settlementTotal} value={<strong>{money(allocation.effective_settlement_total, currency)}</strong>} /><Field label={t("finance.payment.ui.invoiceAmount")} value={money(invoice?.total_amount, currency)} /><Field label={t("finance.payment.ui.currentOutstanding")} value={money(settlement?.outstanding_amount, currency)} /></div></article>;
}

function HistoryRow({ title, source, target, cash, wht, total, reason, createdAt, currency }: { title: string; source: InvoiceContext | null; target: InvoiceContext | null; cash: number | string; wht: number | string; total: number | string; reason: string | null; createdAt: string | null; currency: string }) { const { locale, t, date } = useI18n(); const { settlement: paymentSettlementLabels } = paymentUiLabels(locale);
  return <div style={historyRow}><div style={historyRowHeader}><strong>{title}</strong>{createdAt ? <span>{date(createdAt, true)}</span> : null}</div><div style={historyRoute}>{source ? <span>{t("finance.payment.ui.from")} <Link href={`/finance/invoices/${source.id}`}>{displayText(source.invoice_no)}</Link></span> : null}<span>{source ? t("finance.payment.ui.to") : t("finance.payment.ui.invoice")} {target ? <Link href={`/finance/invoices/${target.id}`}>{displayText(target.invoice_no)}</Link> : t("finance.payment.ui.noData")}</span></div><div style={historyAmounts}><span>{paymentSettlementLabels.receivedCompact} {money(cash, currency)}</span><span>WHT {money(wht, currency)}</span><strong>{t("finance.payment.ui.total")} {money(total, currency)}</strong></div>{reason ? <p style={historyReason}>{t("finance.payment.ui.reasonLabel")} {reason}</p> : null}</div>;
}

function InvoiceMoveContext({ title, invoice, tone, children }: { title: string; invoice: InvoiceContext | null; tone: "neutral" | "accent"; children: ReactNode }) { const { locale } = useI18n();
  return <article style={{ ...invoiceMoveContext, ...(tone === "accent" ? accentInvoiceMoveContext : {}) }}><small style={contextLabel}>{title}</small><strong style={contextInvoiceNo}>{displayText(invoice?.invoice_no)}</strong><span style={matterText}>{invoiceMatterLabel(invoice, locale)}</span>{children}</article>;
}

function ReallocationReview({ sourceInvoice, targetInvoice, source, target, cashMoved, whtMoved, currency }: { sourceInvoice: InvoiceContext | null; targetInvoice: InvoiceContext; source: EffectivePaymentAllocation; target: EffectivePaymentAllocation | null; cashMoved: number; whtMoved: number; currency: string }) { const { locale, t } = useI18n(); const { settlement: paymentSettlementLabels } = paymentUiLabels(locale);
  const sourceCashAfter = normalizedAmount(normalizedAmount(source.effective_cash_allocated) - cashMoved);
  const sourceWhtAfter = normalizedAmount(normalizedAmount(source.effective_wht_credit_allocated) - whtMoved);
  const targetCashAfter = normalizedAmount(normalizedAmount(target?.effective_cash_allocated) + cashMoved);
  const targetWhtAfter = normalizedAmount(normalizedAmount(target?.effective_wht_credit_allocated) + whtMoved);
  return <section style={reviewComparison}><h3 style={comparisonTitle}>{t("finance.payment.ui.reviewMoveStep")}</h3><div><h4 style={reviewStageTitle}>{t("finance.payment.ui.beforeChange")}</h4><div className="payment-review-invoice-grid" style={reviewInvoiceGrid}><AllocationReviewCard invoice={sourceInvoice} total={source.effective_settlement_total} currency={currency} /><AllocationReviewCard invoice={targetInvoice} total={normalizedAmount(target?.effective_settlement_total)} currency={currency} /></div></div><div style={movingSummary}><small>{t("finance.payment.ui.movedSettlement")}</small><strong>{money(cashMoved + whtMoved, currency)}</strong><span>{paymentSettlementLabels.receivedCompact} {money(cashMoved, currency)}</span><span>{t("finance.payment.ui.whtCredit")} {money(whtMoved, currency)}</span></div><div><h4 style={reviewStageTitle}>{t("finance.payment.ui.afterChange")}</h4><div className="payment-review-invoice-grid" style={reviewInvoiceGrid}><AllocationReviewCard invoice={sourceInvoice} total={normalizedAmount(sourceCashAfter + sourceWhtAfter)} currency={currency} /><AllocationReviewCard invoice={targetInvoice} total={normalizedAmount(targetCashAfter + targetWhtAfter)} currency={currency} /></div></div></section>;
}

function AllocationReviewCard({ invoice, total, currency }: { invoice: InvoiceContext | null; total: number | string; currency: string }) { const { locale, t } = useI18n();
  return <div style={allocationReviewCard}><strong>{displayText(invoice?.invoice_no)}</strong><span style={matterText}>{invoiceMatterLabel(invoice, locale)}</span><div style={allocationReviewTotal}><small>{t("finance.payment.ui.settlement")}</small><strong>{money(total, currency)}</strong></div></div>;
}

function invoiceMatterLabel(invoice: InvoiceContext | null | undefined, locale: UiLocale = "th") {
  if (!invoice) return translate(locale, "finance.payment.ui.matterMissing");
  const snapshot = invoice.matter_snapshot_json || {};
  const references = [snapshot.file_no, snapshot.matter_no, snapshot.title, snapshot.name].filter((value, index, values) => typeof value === "string" && value.trim() && values.indexOf(value) === index) as string[];
  if (references.length) return references.join(" - ");
  if (invoice.case_id != null) return `${translate(locale, "common.nav.cases")} ${invoice.case_id}`;
  if (invoice.advisory_matter_id) return translate(locale, "common.nav.advisory");
  return translate(locale, "finance.payment.ui.matterUnlinked");
}

function sameInvoiceMatter(left: InvoiceContext, right: InvoiceContext) {
  return left.case_id === right.case_id && left.advisory_matter_id === right.advisory_matter_id;
}

function invoiceStatusLabel(status?: string, locale: UiLocale = "th") {
  if (status === "issued") return translate(locale, "finance.payment.ui.invoiceIssued");
  if (status === "voided") return translate(locale, "finance.payment.ui.invoiceVoided");
  if (status === "cancelled") return translate(locale, "finance.payment.ui.draftCancelled");
  return status || translate(locale, "finance.payment.ui.unspecified");
}

const page: CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: 24, color: "#172033" };
const surface: CSSProperties = { marginBottom: 18, padding: 20, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" };
const headerSurface: CSSProperties = { padding: 0, overflow: "hidden" };
const identityHeader: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 24, padding: 22 };
const navigationToolbar: CSSProperties = { display: "flex", flexWrap: "wrap", marginBottom: 18, padding: 8, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" };
const navigationLink: CSSProperties = { display: "inline-flex", minWidth: 0, minHeight: 38, alignItems: "center", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", fontWeight: 700, textDecoration: "none", overflowWrap: "anywhere" };
const eyebrow: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 900 };
const title: CSSProperties = { margin: "4px 0", fontSize: 28 };
const reference: CSSProperties = { margin: 0, color: "#64748b", fontSize: 13 };
const statusPanel: CSSProperties = { display: "grid", alignContent: "start", justifyItems: "end", gap: 7, minWidth: 190, padding: 12, borderLeft: "2px solid #86efac", background: "#f0fdf4" };
const smallText: CSSProperties = { color: "#64748b", fontSize: 12 };
const confirmedNotice: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "12px 22px", borderTop: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", fontSize: 13 };
const cancelledNotice: CSSProperties = { ...confirmedNotice, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 18 };
const sectionDescription: CSSProperties = { margin: "5px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.55 };
const contextGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 };
const fieldLabel: CSSProperties = { color: "#64748b", fontSize: 12 };
const fieldValue: CSSProperties = { marginTop: 4, lineHeight: 1.5, overflowWrap: "anywhere" };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 14 };
const formField: CSSProperties = { display: "grid", alignContent: "start", gap: 6, minWidth: 0 };
const formLabel: CSSProperties = { color: "#334155", fontSize: 13, fontWeight: 700 };
const helperText: CSSProperties = { color: "#64748b", fontSize: 11, lineHeight: 1.4 };
const formError: CSSProperties = { color: "#b91c1c", fontSize: 12 };
const inputStyle = (invalid: boolean): CSSProperties => ({ width: "100%", minHeight: 40, boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${invalid ? "#dc2626" : "#cbd5e1"}`, borderRadius: 6, background: "#fff", color: "#172033", font: "inherit" });
const invalidInput: CSSProperties = { borderColor: "#dc2626", boxShadow: "0 0 0 1px #dc2626" };
const textareaStyle: CSSProperties = { ...inputStyle(false), minHeight: 90, resize: "vertical" };
const settlementEntryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 0.8fr) minmax(300px, 1.2fr)", gap: 18, alignItems: "start" };
const whtChoiceField: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const whtToggleGroup: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 };
const whtToggleButton: CSSProperties = { minHeight: 42, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", font: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const whtToggleButtonActive: CSSProperties = { borderColor: "#166534", background: "#f0fdf4", color: "#166534", boxShadow: "inset 0 0 0 1px #166534" };
const whtRateSection: CSSProperties = { display: "grid", gap: 10, marginTop: 16, padding: "15px 0", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" };
const whtRateGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(6,minmax(64px,1fr))", gap: 7 };
const whtRateButton: CSSProperties = { minHeight: 40, padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", font: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const whtRateButtonActive: CSSProperties = { borderColor: "#2563eb", background: "#eff6ff", color: "#1d4ed8", boxShadow: "inset 0 0 0 1px #2563eb" };
const percentInputWrap: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,180px) auto", alignItems: "center", gap: 8 };
const whtAssistanceHelp: CSSProperties = { margin: 0, color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const taxSummary: CSSProperties = { padding: "12px 0", marginBottom: 14, borderBottom: "1px solid #e2e8f0" };
const assistedAmountSummary: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10, marginTop: 16 };
const metric: CSSProperties = { display: "grid", gap: 5, minWidth: 0, padding: 13, border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b" };
const prominentMetric: CSSProperties = { borderColor: "#86efac", background: "#f0fdf4", color: "#166534" };
const metricValue: CSSProperties = { color: "#172033", fontSize: 17, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" };
const allocationCard: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", alignItems: "center", gap: 18, minWidth: 0, marginTop: 16, padding: 14, border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", fontVariantNumeric: "tabular-nums" };
const allocationList: CSSProperties = { display: "grid", gap: 10 };
const matterText: CSSProperties = { display: "block", margin: "3px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.45 };
const inlineError: CSSProperties = { marginTop: 10, color: "#b91c1c", fontSize: 12 };
const saveRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 18, paddingTop: 16, borderTop: "1px solid #e2e8f0" };
const savedState: CSSProperties = { color: "#166534", fontSize: 13, fontWeight: 700 };
const unsavedState: CSSProperties = { color: "#92400e", fontSize: 13, fontWeight: 700 };
const secondaryButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 40, padding: "9px 14px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#334155", font: "inherit", fontWeight: 700, cursor: "pointer" };
const primaryButton: CSSProperties = { ...secondaryButton, minHeight: 44, borderColor: "#166534", background: "#166534", color: "#fff" };
const disabledButton: CSSProperties = { opacity: 0.55, cursor: "not-allowed" };
const reviewZone: CSSProperties = { ...surface, borderColor: "#86efac", background: "#f7fff9", scrollMarginTop: 84 };
const reviewTitle: CSSProperties = { margin: "5px 0", color: "#14532d", fontSize: 22 };
const reviewGroups: CSSProperties = { display: "grid", gap: 18, margin: "18px 0" };
const reviewGroup: CSSProperties = { paddingTop: 15, borderTop: "1px solid #bbf7d0" };
const reviewGroupTitle: CSSProperties = { margin: "0 0 12px", color: "#166534", fontSize: 14 };
const reviewGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 16 };
const confirmationPanel: CSSProperties = { marginTop: 16, padding: 16, border: "1px solid #86efac", borderRadius: 6, background: "#fff" };
const confirmationCheck: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 9, padding: 12, border: "1px solid #cbd5e1", borderRadius: 6, fontWeight: 700, lineHeight: 1.5 };
const invalidConfirmation: CSSProperties = { borderColor: "#dc2626", background: "#fef2f2" };
const actionRow: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 14 };
const neutralNotice: CSSProperties = { margin: "12px 0", padding: 11, borderLeft: "3px solid #f59e0b", background: "#fffbeb", color: "#92400e", fontSize: 13 };
const readOnlyGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, padding: 14, border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc" };
const readOnlyGroups: CSSProperties = { display: "grid", gap: 18 };
const readOnlyGroup: CSSProperties = { minWidth: 0 };
const readOnlyGroupTitle: CSSProperties = { margin: "0 0 9px", color: "#334155", fontSize: 14 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginTop: 16 };
const effectiveAllocationGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 12 };
const effectiveAllocationCard: CSSProperties = { minWidth: 0, padding: 16, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" };
const effectiveAllocationHeader: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingBottom: 12, borderBottom: "1px solid #e2e8f0" };
const invoiceLink: CSSProperties = { color: "#166534", fontSize: 17, fontWeight: 800 };
const invoiceStatusBadge: CSSProperties = { flexShrink: 0, padding: "4px 7px", borderRadius: 999, background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 700 };
const allocationMetrics: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginTop: 13 };
const historySummary: CSSProperties = { cursor: "pointer", color: "#334155", fontSize: 15, fontWeight: 800 };
const historyList: CSSProperties = { display: "grid", gap: 10, marginTop: 14 };
const historyRow: CSSProperties = { padding: 13, border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc" };
const historyRowHeader: CSSProperties = { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, color: "#475569", fontSize: 12 };
const historyRoute: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 7, color: "#334155", fontSize: 13 };
const historyAmounts: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "5px 14px", marginTop: 8, fontSize: 13, fontVariantNumeric: "tabular-nums" };
const historyReason: CSSProperties = { margin: "7px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const bankAccountIdentity: CSSProperties = { display: "grid", gap: 3, minWidth: 0 };
const bankAccountDetail: CSSProperties = { color: "#64748b", fontSize: 12 };
const financialActionSection: CSSProperties = { ...surface, borderColor: "#bfdbfe", background: "#f8fbff", scrollMarginTop: 84 };
const financialActionTitle: CSSProperties = { margin: 0, color: "#1e3a8a", fontSize: 17 };
const correctionFlow: CSSProperties = { marginTop: 18, paddingTop: 2 };
const correctionFlowDivider: CSSProperties = { marginTop: 22, paddingTop: 20, borderTop: "1px solid #cbd5e1" };
const correctionFlowTitle: CSSProperties = { margin: 0, color: "#334155", fontSize: 16 };
const reallocationButton: CSSProperties = { ...secondaryButton, marginTop: 14, borderColor: "#93c5fd", color: "#1d4ed8" };
const reallocationPanel: CSSProperties = { display: "grid", minWidth: 0, gap: 16, marginTop: 16, padding: 16, border: "1px solid #bfdbfe", borderRadius: 6, background: "#fff" };
const reallocationPanelTitle: CSSProperties = { margin: 0, color: "#1e3a8a", fontSize: 16 };
const coreWarning: CSSProperties = { display: "grid", gap: 3, padding: 13, borderLeft: "4px solid #2563eb", background: "#eff6ff", color: "#1e40af", fontSize: 13, lineHeight: 1.5 };
const validationSummary: CSSProperties = { padding: 11, border: "1px solid #fca5a5", borderRadius: 6, background: "#fef2f2", color: "#b91c1c", fontSize: 13, fontWeight: 700 };
const reallocationFormGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 };
const reallocationContextGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 };
const invoiceMoveContext: CSSProperties = { display: "grid", minWidth: 0, gap: 5, padding: 14, border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", color: "#334155" };
const accentInvoiceMoveContext: CSSProperties = { borderColor: "#bfdbfe", background: "#eff6ff", color: "#1e40af" };
const contextLabel: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 800 };
const contextSectionLabel: CSSProperties = { marginTop: 5, color: "#64748b", fontSize: 11, fontWeight: 700 };
const contextInvoiceNo: CSSProperties = { overflowWrap: "anywhere", fontSize: 16 };
const contextAmounts: CSSProperties = { display: "flex", minWidth: 0, flexWrap: "wrap", gap: "5px 12px", marginTop: 5, fontSize: 12, fontVariantNumeric: "tabular-nums" };
const crossMatterWarning: CSSProperties = { padding: 12, borderLeft: "4px solid #f59e0b", background: "#fffbeb", color: "#92400e", fontSize: 13, fontWeight: 700, lineHeight: 1.5 };
const moveTitle: CSSProperties = { margin: 0, color: "#334155", fontSize: 15 };
const reallocationModeGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 10 };
const reallocationModeOption: CSSProperties = { display: "flex", minWidth: 0, alignItems: "flex-start", gap: 9, padding: 13, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#334155", cursor: "pointer" };
const selectedReallocationModeOption: CSSProperties = { borderColor: "#2563eb", background: "#eff6ff", boxShadow: "inset 0 0 0 1px #2563eb" };
const fullMoveSummary: CSSProperties = { display: "grid", minWidth: 0, gap: 10, padding: 14, border: "1px solid #bfdbfe", borderRadius: 6, background: "#f8fbff", color: "#334155", fontSize: 13 };
const fullMoveGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 };
const reviewComparison: CSSProperties = { display: "grid", minWidth: 0, gap: 14, padding: 14, border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc" };
const comparisonTitle: CSSProperties = { margin: 0, color: "#334155", fontSize: 15 };
const reviewStageTitle: CSSProperties = { margin: "0 0 8px", color: "#64748b", fontSize: 12 };
const reviewInvoiceGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 };
const allocationReviewCard: CSSProperties = { display: "grid", minWidth: 0, gap: 4, padding: 11, border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", overflowWrap: "anywhere" };
const allocationReviewTotal: CSSProperties = { display: "flex", minWidth: 0, justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginTop: 5, color: "#334155", fontVariantNumeric: "tabular-nums" };
const movingSummary: CSSProperties = { display: "grid", justifyItems: "center", gap: 4, minWidth: 0, padding: 13, border: "1px solid #93c5fd", borderRadius: 6, background: "#eff6ff", color: "#1e40af", fontSize: 12, textAlign: "center", fontVariantNumeric: "tabular-nums" };
const unchangedSummary: CSSProperties = { display: "grid", minWidth: 0, gap: 10, padding: 14, borderLeft: "4px solid #16a34a", background: "#f0fdf4", color: "#166534" };
const unchangedTotals: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 };
const reallocationAcknowledgement: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 9, padding: 12, border: "1px solid #cbd5e1", borderRadius: 6, color: "#334155", fontSize: 13, fontWeight: 700, lineHeight: 1.5 };
const otherActions: CSSProperties = { marginBottom: 18, padding: 20, border: "1px solid #fecaca", borderRadius: 8, background: "#fff" };
const otherTitle: CSSProperties = { margin: 0, color: "#7f1d1d", fontSize: 16 };
const dangerOutlineButton: CSSProperties = { ...secondaryButton, marginTop: 12, borderColor: "#fca5a5", color: "#b91c1c" };
const dangerButton: CSSProperties = { ...primaryButton, borderColor: "#b91c1c", background: "#b91c1c" };
const exceptionPanel: CSSProperties = { marginTop: 14, padding: 14, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2" };
const errorNotice: CSSProperties = { marginBottom: 14, padding: 13, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2", color: "#b91c1c" };
const successNotice: CSSProperties = { display: "grid", minWidth: 0, gap: 3, marginBottom: 14, padding: 13, border: "1px solid #bbf7d0", borderRadius: 6, background: "#f0fdf4", color: "#166534", lineHeight: 1.55, overflowWrap: "anywhere" };
const badge: CSSProperties = { display: "inline-block", width: "fit-content", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
const amberBadge: CSSProperties = { background: "#fef3c7", color: "#92400e" };
const greenBadge: CSSProperties = { background: "#dcfce7", color: "#166534" };
const redBadge: CSSProperties = { background: "#fee2e2", color: "#b91c1c" };
