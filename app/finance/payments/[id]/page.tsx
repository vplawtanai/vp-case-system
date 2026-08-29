"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";
import { bangkokToday, displayText, formatBangkokDateTime, formatDocumentDate, money } from "../../invoices/shared";
import {
  calculateAssistedPaymentAmounts,
  derivePaymentWhtBase,
  hasValidCurrencyPrecision,
  inferPaymentWhtPreset,
  normalizedAmount,
  paymentFingerprint,
  paymentForm,
  paymentMethodLabels,
  paymentStatusLabels,
  safePaymentError,
  safePaymentReallocationError,
  type EffectivePaymentAllocation,
  type FinancePayment,
  type InvoiceSettlement,
  type PaymentAllocation,
  type PaymentAllocationReallocation,
  type PaymentForm,
} from "../shared";

type PaymentAccess = {
  canManage: boolean;
  canConfirm: boolean;
  canReverse: boolean;
  canReallocate: boolean;
};
type InvoiceContext = { id: string; invoice_no: string | null; customer_name: string | null; client_id: string; case_id: number | null; advisory_matter_id: string | null; matter_snapshot_json: Record<string, unknown> | null; currency: string; amount_before_vat: number | string; vat_amount: number | string; total_amount: number | string; document_status: string };
type BankAccount = { id: string; short_name: string | null; bank_name: string | null; account_name: string | null; account_number: string | null; is_active: boolean };
type FormErrors = Partial<Record<"receivedOn" | "paymentMethod" | "bankAccount" | "settlementTarget" | "cashAmount" | "whtAmount" | "whtRate" | "allocation" | "confirmation", string>>;
type ReallocationErrors = Partial<Record<"source" | "target" | "cash" | "wht" | "reason" | "acknowledgement", string>>;
type ReallocationMode = "full" | "partial";
type WhtMode = "none" | "calculated" | "manual";
type WhtRateOption = "" | "1" | "2" | "3" | "5" | "10" | "custom";

const whtRatePresets = [1, 2, 3, 5, 10] as const;

const paymentSelect = "id,draft_origin_invoice_id,internal_reference,client_id,currency,status,cash_amount,wht_amount,settlement_amount,received_on,payment_method,receiving_bank_account_id,receiving_account_reference,external_transaction_reference,payer_name,note,created_at,updated_at,confirmed_at,cancelled_at,cancel_reason,reversed_at,reverse_reason";
const allocationSelect = "id,payment_id,invoice_id,cash_allocated,wht_credit_allocated,settlement_total";
const invoiceContextSelect = "id,invoice_no,customer_name,client_id,case_id,advisory_matter_id,matter_snapshot_json,currency,amount_before_vat,vat_amount,total_amount,document_status";
const effectiveAllocationSelect = "payment_id,invoice_id,effective_cash_allocated,effective_wht_credit_allocated,effective_settlement_total";
const reallocationSelect = "id,payment_id,source_invoice_id,target_invoice_id,cash_moved,wht_moved,settlement_moved,reason,created_at";

export default function PaymentDetailPage() {
  return <QuotationGuard canAccess={(access) => access.permissions.canManageFinancePayments || access.permissions.canConfirmFinancePayments || access.permissions.canReverseFinancePayments || access.permissions.canReallocateFinancePayments}>{(access) => <PaymentWorkspace access={{ canManage: access.permissions.canManageFinancePayments, canConfirm: access.permissions.canConfirmFinancePayments, canReverse: access.permissions.canReverseFinancePayments, canReallocate: access.permissions.canReallocateFinancePayments }} />}</QuotationGuard>;
}

function PaymentWorkspace({ access }: { access: PaymentAccess }) {
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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
      setError(paymentResult.error ? "ไม่สามารถโหลดข้อมูลการรับชำระได้" : "ไม่พบข้อมูลการรับชำระ");
      setLoading(false);
      return;
    }
    const paymentRow = paymentResult.data as FinancePayment;
    const [allocationsResult, effectiveResult, reallocationResult, candidateResult, bankResult] = await Promise.all([
      supabase.from("finance_payment_invoice_allocations").select(allocationSelect).eq("payment_id", id).order("created_at"),
      supabase.from("finance_payment_effective_invoice_allocations").select(effectiveAllocationSelect).eq("payment_id", id),
      supabase.from("finance_payment_allocation_reallocations").select(reallocationSelect).eq("payment_id", id).order("created_at", { ascending: false }),
      supabase.from("finance_invoices").select(invoiceContextSelect).eq("client_id", paymentRow.client_id).eq("currency", paymentRow.currency).eq("document_status", "issued").order("issue_date", { ascending: false }),
      supabase.from("finance_bank_accounts").select("id,short_name,bank_name,account_name,account_number,is_active").order("short_name"),
    ]);
    if (allocationsResult.error || !allocationsResult.data?.length) {
      console.error("Failed to load Payment allocation", allocationsResult.error);
      setError("ไม่สามารถโหลดการจัดสรรยอดรับชำระได้");
      setLoading(false);
      return;
    }
    if (effectiveResult.error || reallocationResult.error || candidateResult.error || bankResult.error) {
      console.error("Failed to load Payment allocation context", { effective: effectiveResult.error, history: reallocationResult.error, candidates: candidateResult.error, bank: bankResult.error });
      setError("โหลดข้อมูลการจัดสรรยอดรับชำระบางส่วนไม่สำเร็จ กรุณารีเฟรช");
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
      setError("โหลดข้อมูลใบแจ้งหนี้หรือบัญชีรับเงินไม่สำเร็จ");
    }
    const nextForm = paymentForm(paymentRow);
    const invoiceRows = (invoiceResult.data || []) as InvoiceContext[];
    const invoiceRow = invoiceRows.find((row) => row.id === rawRows[0].invoice_id) || null;
    const assistance = paymentWhtAssistance(nextForm, invoiceRow);
    setPayment(paymentRow);
    setAllocations(rawRows);
    setEffectiveAllocations(effectiveRows);
    setReallocations(historyRows);
    setInvoices(invoiceRows);
    setSettlements((settlementResult.data || []) as InvoiceSettlement[]);
    setCandidateInvoices(candidateRows);
    setBankAccounts((bankResult.data || []) as BankAccount[]);
    setForm(nextForm);
    setSettlementTarget(assistance.settlementTarget);
    setWhtMode(assistance.whtMode);
    setWhtRateOption(assistance.whtRateOption);
    setCustomWhtRate("");
    setBaseline(paymentFingerprint(nextForm));
    setErrors({});
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const fingerprint = useMemo(() => paymentFingerprint(form), [form]);
  const dirty = Boolean(baseline) && fingerprint !== baseline;
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
  const invoiceTotals = {
    amountBeforeVat: invoice?.amount_before_vat || 0,
    vatAmount: invoice?.vat_amount || 0,
    totalAmount: invoice?.total_amount || 0,
  };
  const targetSettlement = normalizedAmount(settlementTarget);
  const selectedWhtRate = whtRateOption === "custom" ? Number(customWhtRate || 0) : Number(whtRateOption || 0);
  const currentWhtBase = derivePaymentWhtBase(targetSettlement, invoiceTotals);
  const savedWhtBase = derivePaymentWhtBase(payment?.settlement_amount || 0, invoiceTotals);
  const savedWhtPreset = inferPaymentWhtPreset(payment?.settlement_amount || 0, payment?.wht_amount || 0, invoiceTotals, whtRatePresets);
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

  const setAssistedAmounts = (targetValue: string, mode: WhtMode, rateOption = whtRateOption, customRate = customWhtRate, manualWht = form.whtAmount) => {
    const target = normalizedAmount(targetValue);
    const rate = rateOption === "custom" ? Number(customRate || 0) : Number(rateOption || 0);
    const assisted = mode === "calculated"
      ? calculateAssistedPaymentAmounts(target, rate, invoiceTotals)
      : null;
    const nextWht = mode === "none" ? 0 : mode === "manual" ? normalizedAmount(manualWht) : assisted?.whtAmount || 0;
    const nextCash = nextWht <= target ? normalizedAmount(target - nextWht) : 0;
    setForm((current) => ({ ...current, cashAmount: nextCash.toFixed(2), whtAmount: nextWht.toFixed(2) }));
    setErrors((current) => ({ ...current, settlementTarget: undefined, cashAmount: undefined, whtAmount: undefined, whtRate: undefined, allocation: undefined }));
    setMessage("");
  };

  const updateSettlementTarget = (value: string) => {
    setSettlementTarget(value);
    setAssistedAmounts(value, whtMode);
  };

  const selectWhtMode = (applies: boolean) => {
    if (!applies) {
      setWhtMode("none");
      setAssistedAmounts(settlementTarget, "none");
      return;
    }
    const nextMode: WhtMode = currentWhtBase.reliable ? "calculated" : "manual";
    setWhtMode(nextMode);
    setAssistedAmounts(settlementTarget, nextMode, whtRateOption, customWhtRate, form.whtAmount);
  };

  const selectWhtRate = (option: WhtRateOption) => {
    setWhtRateOption(option);
    setWhtMode("calculated");
    setAssistedAmounts(settlementTarget, "calculated", option, customWhtRate);
  };

  const updateCustomWhtRate = (value: string) => {
    setCustomWhtRate(value);
    setAssistedAmounts(settlementTarget, "calculated", "custom", value);
  };

  const updateManualWhtAmount = (value: string) => {
    setForm((current) => {
      const manualWht = normalizedAmount(value);
      const manualCash = manualWht <= targetSettlement ? normalizedAmount(targetSettlement - manualWht) : 0;
      return { ...current, whtAmount: value, cashAmount: manualCash.toFixed(2) };
    });
    setErrors((current) => ({ ...current, whtAmount: undefined, allocation: undefined }));
    setMessage("");
  };

  const validate = (forConfirmation: boolean) => {
    const next: FormErrors = {};
    if (!hasValidCurrencyPrecision(settlementTarget) || targetSettlement <= 0) next.settlementTarget = "กรุณาระบุยอดที่ต้องการตัดชำระมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
    if (!draftAllocationEditingLimited && targetSettlement > outstandingBefore) next.settlementTarget = "ยอดที่ต้องการตัดชำระเกินยอดคงค้างของใบแจ้งหนี้";
    if (whtMode === "calculated" && !currentWhtBase.reliable) next.whtRate = "ไม่สามารถคำนวณฐาน WHT จากยอด Invoice ได้อย่างปลอดภัย กรุณาปรับยอด WHT เอง";
    if (whtMode === "calculated" && (!Number.isFinite(selectedWhtRate) || selectedWhtRate <= 0 || selectedWhtRate > 100)) next.whtRate = "กรุณาเลือกหรือระบุอัตราหัก ณ ที่จ่ายมากกว่า 0 และไม่เกิน 100%";
    if (whtMode === "manual" && (!hasValidCurrencyPrecision(form.whtAmount) || wht <= 0)) next.whtAmount = "กรุณาระบุเครดิตภาษีหัก ณ ที่จ่ายมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
    if (wht > targetSettlement) next.whtAmount = "เครดิตภาษีหัก ณ ที่จ่ายต้องไม่เกินยอดที่ต้องการตัดชำระ";
    if (!hasValidCurrencyPrecision(form.cashAmount) || cash < 0) next.cashAmount = "กรุณาระบุยอดเงินสดตั้งแต่ 0 ขึ้นไป และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
    if (!hasValidCurrencyPrecision(form.whtAmount) || wht < 0) next.whtAmount = "กรุณาระบุเครดิตภาษีหัก ณ ที่จ่ายตั้งแต่ 0 ขึ้นไป และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
    if (Math.abs(paymentSettlement - targetSettlement) > 0.009) next.allocation = "เงินสดที่ได้รับ + เครดิตภาษีหัก ณ ที่จ่าย ต้องเท่ากับยอดที่ต้องการตัดชำระ";
    if (paymentSettlement <= 0) next.allocation = "ยอดรับชำระรวมต้องมากกว่า 0";
    if (!draftAllocationEditingLimited && paymentSettlement > outstandingBefore) next.allocation = "ยอดจัดสรรเกินยอดคงค้างก่อนการรับชำระครั้งนี้";
    if (draftAllocationEditingLimited) {
      const rawCash = normalizedAmount(allocations.reduce((sum, row) => sum + normalizedAmount(row.cash_allocated), 0));
      const rawWht = normalizedAmount(allocations.reduce((sum, row) => sum + normalizedAmount(row.wht_credit_allocated), 0));
      if (rawCash !== cash || rawWht !== wht) next.allocation = "ยอดรวมของรายการจัดสรรหลายใบแจ้งหนี้ไม่ตรงกับยอดรับชำระ กรุณาให้ผู้ดูแลตรวจสอบ";
    }
    if (forConfirmation && !form.receivedOn) next.receivedOn = "กรุณาระบุวันที่รับชำระจริง";
    if (forConfirmation && form.receivedOn > bangkokToday()) next.receivedOn = "วันที่รับชำระจริงต้องไม่เป็นวันในอนาคต";
    if (forConfirmation && !form.paymentMethod) next.paymentMethod = "กรุณาเลือกวิธีรับชำระ";
    if (forConfirmation && form.paymentMethod === "bank_transfer" && !form.receivingBankAccountId) next.bankAccount = "กรุณาเลือกบัญชีธนาคารที่รับเงิน";
    setErrors(next);
    if (Object.keys(next).length) requestAnimationFrame(() => { firstInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); firstInputRef.current?.focus(); });
    return Object.keys(next).length === 0;
  };

  const allocationPayload = () => draftAllocationEditingLimited
    ? allocations.map((row) => ({ invoice_id: row.invoice_id, cash_allocated: normalizedAmount(row.cash_allocated), wht_credit_allocated: normalizedAmount(row.wht_credit_allocated) }))
    : [{ invoice_id: allocation?.invoice_id, cash_allocated: cash, wht_credit_allocated: wht }];

  const saveDraft = async () => {
    if (!payment || !allocation || !isDraft || !access.canManage || !dirty || saving || actionLock.current || !validate(false)) return;
    actionLock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("save_finance_payment_draft", {
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
      });
      if (result.error) throw result.error;
      await load();
      setMessage("บันทึกร่างการรับชำระแล้ว");
    } catch (saveError) {
      console.error("Failed to save Payment Draft", saveError);
      setError(safePaymentError(saveError, "บันทึกร่างการรับชำระไม่สำเร็จ"));
    } finally {
      actionLock.current = false; setSaving(false);
    }
  };

  const openConfirmation = () => {
    setError(""); setMessage("");
    if (dirty) { setError("กรุณาบันทึกการเปลี่ยนแปลงก่อนยืนยันรับชำระ"); return; }
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
      setMessage("ยืนยันรับชำระแล้ว ยอดคงค้างของใบแจ้งหนี้ได้รับการปรับปรุงเรียบร้อย");
    } catch (confirmError) {
      console.error("Failed to confirm Payment", confirmError);
      setError(safePaymentError(confirmError, "ยืนยันรับชำระไม่สำเร็จ"));
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
      setMessage(completedMode === "cancel" ? "ยกเลิกร่างการรับชำระแล้ว" : "กลับรายการรับชำระแล้ว ยอดคงค้างได้รับการปรับปรุงเรียบร้อย");
    } catch (exceptionError) {
      console.error("Failed to change Payment state", exceptionError);
      setError(safePaymentError(exceptionError, exceptionMode === "cancel" ? "ยกเลิกร่างการรับชำระไม่สำเร็จ" : "กลับรายการรับชำระไม่สำเร็จ"));
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
    if (!selectedSourceAllocation) next.source = "กรุณาเลือกใบแจ้งหนี้ที่ต้องการย้ายยอดออก";
    if (!selectedTargetInvoice) next.target = "กรุณาเลือกใบแจ้งหนี้ที่ต้องการย้ายยอดไปยัง";
    if (reallocationSourceId && reallocationSourceId === reallocationTargetId) next.target = "ใบแจ้งหนี้ที่ย้ายออกและใบแจ้งหนี้ที่รับยอดต้องเป็นคนละฉบับ";
    if (reallocationMode === "partial" && (!hasValidCurrencyPrecision(reallocationCash) || reallocationCashAmount < 0)) next.cash = "กรุณาระบุเงินสดตั้งแต่ 0 ขึ้นไป และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
    if (reallocationMode === "partial" && (!hasValidCurrencyPrecision(reallocationWht) || reallocationWhtAmount < 0)) next.wht = "กรุณาระบุเครดิต WHT ตั้งแต่ 0 ขึ้นไป และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
    if (selectedSourceAllocation && reallocationCashAmount > normalizedAmount(selectedSourceAllocation.effective_cash_allocated)) next.cash = "เงินสดที่ย้ายเกินยอดปัจจุบันของใบแจ้งหนี้ที่ย้ายออก";
    if (selectedSourceAllocation && reallocationWhtAmount > normalizedAmount(selectedSourceAllocation.effective_wht_credit_allocated)) next.wht = "เครดิต WHT ที่ย้ายเกินยอดปัจจุบันของใบแจ้งหนี้ที่ย้ายออก";
    if (reallocationTotal <= 0) next.cash = "ยอดเงินสดและเครดิต WHT ที่ย้ายรวมกันต้องมากกว่า 0";
    const targetSettlementSummary = settlements.find((row) => row.invoice_id === reallocationTargetId);
    if (targetSettlementSummary && reallocationTotal > normalizedAmount(targetSettlementSummary.outstanding_amount)) next.target = "ยอดที่ย้ายเกินยอดคงค้างปัจจุบันของใบแจ้งหนี้ที่รับยอด";
    if (!reallocationReason.trim()) next.reason = "กรุณาระบุเหตุผลในการย้ายการจัดสรรยอดรับชำระ";
    if (reallocationReason.trim().length > 2000) next.reason = "เหตุผลต้องไม่เกิน 2,000 ตัวอักษร";
    if (!reallocationAcknowledged) next.acknowledgement = "กรุณายืนยันว่ารายการรับเงินจริงถูกต้องและต้องการเปลี่ยนเฉพาะใบแจ้งหนี้";
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
      const successTitle = `ย้ายยอด ${money(successfulSettlement, payment.currency)} จาก ${displayText(successfulSourceInvoice?.invoice_no)} ไปยัง ${displayText(successfulTargetInvoice?.invoice_no)} เรียบร้อยแล้ว`;
      const successDetail = `รายการเงินจริง เงินสด ${money(successfulCash, payment.currency)} และเครดิต WHT ${money(successfulWht, payment.currency)} ไม่เปลี่ยน`;
      setReallocationOpen(false);
      setReallocationRequestId("");
      setReallocationAttempted(false);
      await load();
      setMessage(`${successTitle}\n${successDetail}`);
    } catch (reallocationError) {
      console.error("Failed to reallocate Payment allocation", reallocationError);
      setError(safePaymentReallocationError(reallocationError));
    } finally {
      reallocationLock.current = false; setReallocating(false);
    }
  };

  if (loading) return <main style={page}>กำลังโหลดข้อมูลการรับชำระ...</main>;
  if (!payment || !allocation || !invoice) return <main style={page}>{error || "ไม่พบข้อมูลการรับชำระ"}</main>;

  return <main className="payment-workspace" style={page}>
    <nav style={navigationToolbar}>{payment.status === "confirmed" ? currentAllocatedInvoice ? <Link style={navigationLink} href={`/finance/invoices/${currentAllocatedInvoice.id}`}>เปิดใบแจ้งหนี้ที่ได้รับการจัดสรรปัจจุบัน {displayText(currentAllocatedInvoice.invoice_no)}</Link> : <a style={navigationLink} href="#current-payment-allocations">ดูใบแจ้งหนี้ที่เกี่ยวข้อง</a> : <Link style={navigationLink} href={`/finance/invoices/${invoice.id}`}>← กลับไปใบแจ้งหนี้ {displayText(invoice.invoice_no)}</Link>}</nav>
    {error ? <div role="alert" style={errorNotice}>{error}</div> : null}
    {message ? <SuccessNotice message={message} /> : null}

    <section style={{ ...surface, ...headerSurface }}>
      <div className="payment-header" style={identityHeader}>
        <div><span style={eyebrow}>PAYMENT</span><h1 style={title}>{payment.status === "draft" ? "ร่างการรับชำระ" : "ข้อมูลการรับชำระ"}</h1><p style={reference}>รหัสอ้างอิง {displayText(payment.internal_reference, payment.id.slice(0, 8).toUpperCase())}</p></div>
        <div style={statusPanel}><small style={fieldLabel}>สถานะ</small><StatusBadge status={payment.status}>{paymentStatusLabels[payment.status] || payment.status}</StatusBadge><span style={smallText}>แก้ไขล่าสุด {formatBangkokDateTime(payment.updated_at)}</span></div>
      </div>
      {payment.status === "confirmed" ? <div style={confirmedNotice}><strong>ยืนยันรับชำระแล้ว</strong><span>ข้อมูลนี้เป็นแบบอ่านอย่างเดียว</span></div> : null}
      {payment.status === "cancelled" ? <div style={cancelledNotice}><strong>ร่างนี้ถูกยกเลิกแล้ว</strong><span>{displayText(payment.cancel_reason)}</span></div> : null}
      {payment.status === "reversed" ? <div style={cancelledNotice}><strong>รายการรับชำระนี้ถูกกลับรายการแล้ว</strong><span>{displayText(payment.reverse_reason)}</span></div> : null}
    </section>

    <section style={surface}>
      <SectionHeading title="บริบทการรับชำระ" description="ตรวจสอบลูกค้า สกุลเงิน และใบแจ้งหนี้ที่เกี่ยวข้องกับรายการนี้" />
      <div style={contextGrid}><Field label="ลูกค้า" value={displayText(invoice.customer_name)} /><Field label="ใบแจ้งหนี้ที่จัดสรร" value={`${payment.status === "confirmed" ? currentEffectiveAllocations.length : allocations.length} ฉบับ`} /><Field label="ยอดรับชำระรวม" value={money(payment.settlement_amount, payment.currency)} /><Field label="สกุลเงิน" value={payment.currency} /></div>
    </section>

    {isDraft ? <>
      <section style={surface}>
        <SectionHeading title="ข้อมูลการรับชำระ" description="ระบุข้อมูลตามหลักฐานการรับเงินจริง ภาษีหัก ณ ที่จ่ายเป็นเครดิตชำระ ไม่ใช่เงินสดรับ" />
        {!access.canManage ? <div style={neutralNotice}>คุณดูร่างนี้ได้ แต่ไม่มีสิทธิ์แก้ไขหรือยกเลิกร่างการรับชำระ</div> : null}
        <div style={formGrid}>
          <FormField label="วันที่รับชำระจริง" required error={errors.receivedOn}><input ref={firstInputRef} style={inputStyle(Boolean(errors.receivedOn))} type="date" value={form.receivedOn} disabled={!access.canManage || saving} onChange={(event) => updateForm("receivedOn", event.target.value)} /></FormField>
          <FormField label="วิธีรับชำระ" required error={errors.paymentMethod}><select style={inputStyle(Boolean(errors.paymentMethod))} value={form.paymentMethod} disabled={!access.canManage || saving} onChange={(event) => updateForm("paymentMethod", event.target.value)}><option value="">เลือกวิธีรับชำระ</option>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
          <FormField label="บัญชีธนาคารที่รับเงิน" required={form.paymentMethod === "bank_transfer"} error={errors.bankAccount}><select style={inputStyle(Boolean(errors.bankAccount))} value={form.receivingBankAccountId} disabled={!access.canManage || saving} onChange={(event) => updateForm("receivingBankAccountId", event.target.value)}><option value="">ไม่ระบุ</option>{bankAccounts.filter((account) => account.is_active || account.id === form.receivingBankAccountId).map((account) => <option key={account.id} value={account.id}>{displayText(account.short_name, account.bank_name || "บัญชีธนาคาร")}{account.is_active ? "" : " (ไม่ใช้งาน)"}</option>)}</select></FormField>
          <FormField label="ชื่อผู้ชำระ"><input style={inputStyle(false)} value={form.payerName} disabled={!access.canManage || saving} onChange={(event) => updateForm("payerName", event.target.value)} /></FormField>
          <FormField label="เลขอ้างอิงรายการรับชำระ"><input style={inputStyle(false)} value={form.externalTransactionReference} disabled={!access.canManage || saving} onChange={(event) => updateForm("externalTransactionReference", event.target.value)} /></FormField>
          <FormField label="รายละเอียดบัญชี/ช่องทางรับเงิน"><input style={inputStyle(false)} value={form.receivingAccountReference} disabled={!access.canManage || saving} onChange={(event) => updateForm("receivingAccountReference", event.target.value)} /></FormField>
        </div>
        <FormField label="หมายเหตุ"><textarea style={textareaStyle} rows={3} value={form.note} disabled={!access.canManage || saving} onChange={(event) => updateForm("note", event.target.value)} /></FormField>
      </section>

      <section style={surface}>
        <SectionHeading title="ยอดตัดชำระและภาษีหัก ณ ที่จ่าย" description="กำหนดยอดที่ต้องการตัดชำระ ระบบจะช่วยคำนวณเงินสดและเครดิตภาษีหัก ณ ที่จ่าย โดยยอด Invoice ไม่เปลี่ยนแปลง" />
        {draftAllocationEditingLimited ? <div style={neutralNotice}>ร่างนี้มีการจัดสรรไปยังหลายใบแจ้งหนี้ ระบบจะแสดงและคงยอดเดิมครบทุกฉบับ การแก้สัดส่วนรายใบยังไม่รองรับในหน้านี้</div> : null}
        <div className="payment-settlement-entry-grid" style={settlementEntryGrid}>
          <FormField label="ยอดที่ต้องการตัดชำระในครั้งนี้" helper={draftAllocationEditingLimited ? "ยอดรวมจากการจัดสรรทุกใบแจ้งหนี้" : `ยอดคงค้างปัจจุบัน ${money(outstandingBefore, payment.currency)}`} required error={errors.settlementTarget}><input style={inputStyle(Boolean(errors.settlementTarget))} type="number" min="0" step="0.01" value={settlementTarget} disabled={!access.canManage || saving || draftAllocationEditingLimited} onChange={(event) => updateSettlementTarget(event.target.value)} /></FormField>
          <div style={whtChoiceField}><span style={formLabel}>ภาษีหัก ณ ที่จ่าย</span><div style={whtToggleGroup} role="group" aria-label="ภาษีหัก ณ ที่จ่าย"><button className="payment-wht-choice" type="button" aria-pressed={whtMode === "none"} style={{ ...whtToggleButton, ...(whtMode === "none" ? whtToggleButtonActive : {}) }} disabled={!access.canManage || saving || draftAllocationEditingLimited} onClick={() => selectWhtMode(false)}>ไม่มีหัก ณ ที่จ่าย</button><button className="payment-wht-choice" type="button" aria-pressed={whtMode !== "none"} style={{ ...whtToggleButton, ...(whtMode !== "none" ? whtToggleButtonActive : {}) }} disabled={!access.canManage || saving || draftAllocationEditingLimited} onClick={() => selectWhtMode(true)}>มีหัก ณ ที่จ่าย</button></div><small style={helperText}>ผู้ใช้เป็นผู้เลือกอัตราที่เหมาะสม ระบบไม่กำหนดอัตราจากประเภทบริการ</small></div>
        </div>
        {whtMode === "calculated" && !draftAllocationEditingLimited ? <div style={whtRateSection}><span style={formLabel}>อัตราหัก ณ ที่จ่าย</span><div className="payment-wht-rate-grid" style={whtRateGrid}>{whtRatePresets.map((rate) => { const value = String(rate) as WhtRateOption; return <button className="payment-wht-rate" key={rate} type="button" aria-pressed={whtRateOption === value} style={{ ...whtRateButton, ...(whtRateOption === value ? whtRateButtonActive : {}) }} disabled={!access.canManage || saving} onClick={() => selectWhtRate(value)}>{rate}%</button>; })}<button className="payment-wht-rate" type="button" aria-pressed={whtRateOption === "custom"} style={{ ...whtRateButton, ...(whtRateOption === "custom" ? whtRateButtonActive : {}) }} disabled={!access.canManage || saving} onClick={() => selectWhtRate("custom")}>กำหนดเอง</button></div>{whtRateOption === "custom" ? <FormField label="อัตราที่กำหนดเอง" helper="มากกว่า 0 และไม่เกิน 100%" error={errors.whtRate}><div style={percentInputWrap}><input style={inputStyle(Boolean(errors.whtRate))} type="number" min="0" max="100" step="0.01" value={customWhtRate} disabled={!access.canManage || saving} onChange={(event) => updateCustomWhtRate(event.target.value)} /><span>%</span></div></FormField> : errors.whtRate ? <div role="alert" style={inlineError}>{errors.whtRate}</div> : null}</div> : null}
        {whtMode === "manual" && !draftAllocationEditingLimited ? <div className="payment-manual-wht-grid" style={manualWhtSection}><div><strong>ปรับยอด WHT เอง</strong><p style={manualWhtHelp}>{currentWhtBase.reliable ? "ใช้เมื่อยอดตามเอกสารแตกต่างจากผลคำนวณ ระบบจะไม่เขียนทับยอดที่ระบุเอง" : "ยอด Invoice ไม่สามารถใช้คำนวณฐาน WHT ได้อย่างปลอดภัย กรุณาระบุเครดิต WHT ตามหลักฐานจริง"}</p></div><FormField label="เครดิตภาษีหัก ณ ที่จ่าย" required error={errors.whtAmount}><input style={inputStyle(Boolean(errors.whtAmount))} type="number" min="0" step="0.01" value={form.whtAmount} disabled={!access.canManage || saving} onChange={(event) => updateManualWhtAmount(event.target.value)} /></FormField></div> : null}
        {whtMode !== "none" && !draftAllocationEditingLimited ? <div style={whtModeActions}>{whtMode === "calculated" ? <button type="button" style={textActionButton} disabled={!access.canManage || saving} onClick={() => { setWhtMode("manual"); setAssistedAmounts(settlementTarget, "manual", whtRateOption, customWhtRate, form.whtAmount); }}>ปรับยอด WHT เอง</button> : currentWhtBase.reliable ? <button type="button" style={textActionButton} disabled={!access.canManage || saving} onClick={() => { setWhtMode("calculated"); setAssistedAmounts(settlementTarget, "calculated"); }}>กลับไปคำนวณจากอัตรา</button> : null}</div> : null}
        <div style={assistedAmountSummary}>
          <Metric label="ยอดที่ต้องการตัดชำระ" value={money(targetSettlement, payment.currency)} prominent />
          {whtMode !== "none" && currentWhtBase.reliable && !draftAllocationEditingLimited ? <Metric label="ฐานคำนวณภาษีหัก ณ ที่จ่าย" value={money(currentWhtBase.amount, payment.currency)} /> : null}
          {whtMode === "calculated" && selectedWhtRate > 0 && !draftAllocationEditingLimited ? <Metric label="อัตรา WHT" value={`${selectedWhtRate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`} /> : null}
          <Metric label="เครดิตภาษีหัก ณ ที่จ่าย" value={money(wht, payment.currency)} />
          <Metric label="เงินสดที่ได้รับจริง" value={money(cash, payment.currency)} />
          <Metric label="ยอดตัดชำระรวม" value={money(paymentSettlement, payment.currency)} />
        </div>
        <div style={allocationList}>{allocations.map((row) => {
          const rowInvoice = invoices.find((item) => item.id === row.invoice_id);
          const rowCash = draftAllocationEditingLimited ? row.cash_allocated : cash;
          const rowWht = draftAllocationEditingLimited ? row.wht_credit_allocated : wht;
          const rowTotal = draftAllocationEditingLimited ? row.settlement_total : paymentSettlement;
          return <AllocationSummaryCard key={row.id} invoice={rowInvoice || null} cash={rowCash} wht={rowWht} total={rowTotal} currency={payment.currency} />;
        })}</div>
        {errors.allocation ? <div role="alert" style={inlineError}>{errors.allocation}</div> : null}
        {access.canManage ? <div style={saveRow}><span style={dirty ? unsavedState : savedState}>{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "บันทึกแล้ว"}</span><button type="button" style={{ ...secondaryButton, ...(!dirty ? disabledButton : {}) }} disabled={!dirty || saving} onClick={() => void saveDraft()}>{saving ? "กำลังบันทึก..." : dirty ? "บันทึกการเปลี่ยนแปลง" : "บันทึกแล้ว"}</button></div> : null}
      </section>

      <section ref={reviewRef} style={reviewZone}>
        <span style={eyebrow}>ตรวจสอบขั้นสุดท้าย</span><h2 style={reviewTitle}>ตรวจสอบก่อนยืนยันรับชำระ</h2><p style={sectionDescription}>ตรวจสอบหลักฐาน วันที่ วิธีรับชำระ และยอดจัดสรรให้ครบถ้วนก่อนยืนยัน</p>
        <div style={reviewGroups}>
          <div style={reviewGroup}><h3 style={reviewGroupTitle}>ข้อมูลรายการ</h3><div style={reviewGrid}><Field label="ใบแจ้งหนี้" value={displayText(invoice.invoice_no)} /><Field label="วันที่รับชำระจริง" value={form.receivedOn ? formatDocumentDate(form.receivedOn, "th") : "ยังไม่ระบุ"} /><Field label="วิธีรับชำระ" value={paymentMethodLabels[form.paymentMethod] || "ยังไม่ระบุ"} /><Field label="บัญชีที่รับเงินจริง" value={<BankAccountIdentity account={draftReceivingBankAccount} paymentMethod={form.paymentMethod} />} />{form.payerName.trim() ? <Field label="ชื่อผู้ชำระ" value={form.payerName.trim()} /> : null}{form.externalTransactionReference.trim() ? <Field label="เลขอ้างอิงรายการรับชำระ" value={form.externalTransactionReference.trim()} /> : null}{form.receivingAccountReference.trim() ? <Field label="รายละเอียดบัญชี/ช่องทางรับเงิน" value={form.receivingAccountReference.trim()} /> : null}{form.note.trim() ? <Field label="หมายเหตุ" value={form.note.trim()} /> : null}</div></div>
          <div style={reviewGroup}><h3 style={reviewGroupTitle}>ยอดเงิน</h3><div style={reviewGrid}><Field label="ยอดที่ต้องการตัดชำระ" value={<strong>{money(targetSettlement, payment.currency)}</strong>} /><Field label="ภาษีหัก ณ ที่จ่าย" value={whtMode === "none" ? "ไม่มี" : whtMode === "manual" ? "มี · ปรับยอดเอง" : selectedWhtRate > 0 ? `มี · ${selectedWhtRate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%` : "มี · ยังไม่ระบุอัตรา"} />{whtMode !== "none" && currentWhtBase.reliable ? <Field label="ฐานคำนวณ WHT" value={money(currentWhtBase.amount, payment.currency)} /> : null}<Field label="เงินสดที่ได้รับจริง" value={money(cash, payment.currency)} /><Field label="เครดิต WHT" value={money(wht, payment.currency)} /><Field label="ยอดรับชำระรวม" value={<strong>{money(paymentSettlement, payment.currency)}</strong>} /></div></div>
          <div style={reviewGroup}><h3 style={reviewGroupTitle}>การจัดสรร</h3><div style={allocationList}>{allocations.map((row) => { const rowInvoice = invoices.find((item) => item.id === row.invoice_id); return <AllocationSummaryCard key={row.id} invoice={rowInvoice || null} cash={draftAllocationEditingLimited ? row.cash_allocated : cash} wht={draftAllocationEditingLimited ? row.wht_credit_allocated : wht} total={draftAllocationEditingLimited ? row.settlement_total : paymentSettlement} currency={payment.currency} />; })}</div>{!draftAllocationEditingLimited ? <div style={{ marginTop: 12 }}><Field label="คาดว่ายอดคงค้างหลังยืนยัน" value={<strong>{money(expectedOutstanding, payment.currency)}</strong>} /></div> : null}</div>
        </div>
        {dirty ? <div style={neutralNotice}>กรุณาบันทึกการเปลี่ยนแปลงก่อนยืนยันรับชำระ</div> : null}
        {!access.canConfirm ? <div style={neutralNotice}>คุณไม่มีสิทธิ์ยืนยันรับชำระ กรุณาให้ผู้มีสิทธิ์ตรวจสอบและยืนยันรายการนี้</div> : null}
        {access.canConfirm && !confirmationOpen ? <button type="button" style={{ ...primaryButton, ...(dirty ? disabledButton : {}) }} disabled={dirty} onClick={openConfirmation}>ยืนยันรับชำระ</button> : null}
        {confirmationOpen ? <div style={confirmationPanel}>
          <label style={{ ...confirmationCheck, ...(errors.confirmation ? invalidConfirmation : {}) }}><input type="checkbox" checked={confirmationAcknowledged} onChange={(event) => { setConfirmationAcknowledged(event.target.checked); setErrors((current) => ({ ...current, confirmation: undefined })); }} />ยืนยันว่าได้ตรวจสอบข้อมูลและหลักฐานการรับชำระครบถ้วนแล้ว และต้องการบันทึกยอดชำระนี้</label>
          <p style={sectionDescription}>เมื่อยืนยันแล้ว ข้อมูลการรับชำระจะเป็นแบบอ่านอย่างเดียวและปรับยอดคงค้างของใบแจ้งหนี้ เอกสารใบเสร็จ/ใบกำกับภาษียังไม่ถูกสร้างในขั้นตอนนี้</p>
          <div style={actionRow}><button type="button" style={secondaryButton} disabled={confirming} onClick={() => setConfirmationOpen(false)}>กลับไปตรวจสอบ</button><button type="button" style={{ ...primaryButton, ...(!confirmationAcknowledged ? disabledButton : {}) }} disabled={!confirmationAcknowledged || confirming} onClick={() => void confirmPayment()}>{confirming ? "กำลังยืนยัน..." : "ยืนยันรับชำระ"}</button></div>
        </div> : null}
      </section>
    </> : <>
      <section style={surface}>
        <SectionHeading title="ข้อมูลการรับชำระ" description="ข้อมูลที่ยืนยันแล้วแสดงเป็นแบบอ่านอย่างเดียว" />
        <div style={readOnlyGroups}>
          <div style={readOnlyGroup}><h3 style={readOnlyGroupTitle}>ข้อมูลรายการ</h3><div style={readOnlyGrid}><Field label="สถานะ" value={<StatusBadge status={payment.status}>{paymentStatusLabels[payment.status] || payment.status}</StatusBadge>} /><Field label="วันที่รับชำระจริง" value={payment.received_on ? formatDocumentDate(payment.received_on, "th") : "ไม่ระบุ"} /><Field label="วิธีรับชำระ" value={paymentMethodLabels[payment.payment_method || ""] || "ไม่ระบุ"} /><Field label="บัญชีที่รับเงินจริง" value={<BankAccountIdentity account={savedReceivingBankAccount} paymentMethod={payment.payment_method || ""} />} />{payment.payer_name?.trim() ? <Field label="ชื่อผู้ชำระ" value={payment.payer_name.trim()} /> : null}{payment.external_transaction_reference?.trim() ? <Field label="เลขอ้างอิงรายการรับชำระ" value={payment.external_transaction_reference.trim()} /> : null}{payment.receiving_account_reference?.trim() ? <Field label="รายละเอียดบัญชี/ช่องทางรับเงิน" value={payment.receiving_account_reference.trim()} /> : null}{payment.note?.trim() ? <Field label="หมายเหตุ" value={payment.note.trim()} /> : null}</div></div>
          <div style={readOnlyGroup}><h3 style={readOnlyGroupTitle}>ยอดเงิน</h3><div style={summaryGrid}><Metric label="ยอดตัดชำระ" value={money(payment.settlement_amount, payment.currency)} prominent />{allocations.length === 1 && normalizedAmount(payment.wht_amount) > 0 && savedWhtBase.reliable ? <Metric label="ฐานคำนวณ WHT" value={money(savedWhtBase.amount, payment.currency)} /> : null}{allocations.length === 1 && normalizedAmount(payment.wht_amount) > 0 && savedWhtPreset ? <Metric label="อัตรา WHT ที่อนุมานได้" value={`${savedWhtPreset}%`} /> : null}<Metric label="เงินสดที่ได้รับ" value={money(payment.cash_amount, payment.currency)} /><Metric label="เครดิต WHT" value={money(payment.wht_amount, payment.currency)} /><Metric label="ยอดรับชำระรวม" value={money(payment.settlement_amount, payment.currency)} />{payment.status === "confirmed" ? <Metric label="ยอดที่จัดสรรปัจจุบัน" value={money(effectiveAllocationTotal, payment.currency)} /> : null}</div></div>
        </div>
        {payment.status === "confirmed" ? <div style={nextStepNotice}>การรับชำระถูกบันทึกแล้ว เอกสารใบเสร็จ/ใบกำกับภาษียังเป็นขั้นตอนถัดไป</div> : null}
      </section>

      {payment.status === "confirmed" ? <section id="current-payment-allocations" style={{ ...surface, scrollMarginTop: 84 }}>
        <SectionHeading title="การจัดสรรปัจจุบัน" description="แสดงใบแจ้งหนี้ที่ได้รับการตัดชำระจากรายการนี้ในสถานะปัจจุบัน" />
        <div className="payment-effective-allocation-grid" style={effectiveAllocationGrid}>{currentEffectiveAllocations.map((row) => {
          const rowInvoice = invoices.find((item) => item.id === row.invoice_id) || null;
          const rowSettlement = settlements.find((item) => item.invoice_id === row.invoice_id) || null;
          return <EffectiveAllocationCard key={row.invoice_id} allocation={row} invoice={rowInvoice} settlement={rowSettlement} currency={payment.currency} />;
        })}</div>
        {!currentEffectiveAllocations.length ? <div style={neutralNotice}>ไม่มีใบแจ้งหนี้ที่ได้รับการจัดสรรยอดในปัจจุบัน</div> : null}
      </section> : <section style={surface}><SectionHeading title="การจัดสรรตามรายการ" description="แสดงข้อมูลการจัดสรรเดิมเพื่อการตรวจสอบ รายการนี้ไม่อยู่ในสถานะยืนยันรับชำระแล้ว" /><div style={allocationList}>{allocations.map((row) => <AllocationSummaryCard key={row.id} invoice={invoices.find((item) => item.id === row.invoice_id) || null} cash={row.cash_allocated} wht={row.wht_credit_allocated} total={row.settlement_total} currency={payment.currency} />)}</div></section>}

      <section style={surface}>
        <details>
          <summary style={historySummary}>ประวัติการย้ายยอด {reallocations.length ? `(${reallocations.length})` : ""}</summary>
          <p style={sectionDescription}>เก็บรายการจัดสรรตั้งต้นและการย้ายยอดทุกครั้งเพื่อการตรวจสอบ โดยไม่เปลี่ยนรายการเงินจริง</p>
          <div style={historyList}>
            {allocations.map((row) => <HistoryRow key={`original-${row.id}`} title="การจัดสรรตั้งต้น" source={null} target={invoices.find((item) => item.id === row.invoice_id) || null} cash={row.cash_allocated} wht={row.wht_credit_allocated} total={row.settlement_total} reason={null} createdAt={null} currency={payment.currency} />)}
            {reallocations.map((row) => <HistoryRow key={row.id} title="ย้ายการจัดสรร" source={invoices.find((item) => item.id === row.source_invoice_id) || null} target={invoices.find((item) => item.id === row.target_invoice_id) || null} cash={row.cash_moved} wht={row.wht_moved} total={row.settlement_moved} reason={row.reason} createdAt={row.created_at} currency={payment.currency} />)}
          </div>
        </details>
      </section>
    </>}

    {payment.status === "confirmed" && access.canReallocate ? <section ref={reallocationRef} style={financialActionSection}>
      <h2 style={financialActionTitle}>การจัดสรรยอดรับชำระ</h2>
      <p style={sectionDescription}>ใช้เมื่อรับเงินจริงถูกต้อง แต่ต้องเปลี่ยนใบแจ้งหนี้ที่ได้รับการตัดชำระ เงินสด บัญชีรับเงิน และยอดรับชำระรวมจะไม่เปลี่ยน</p>
      {!reallocationOpen ? <button type="button" style={reallocationButton} onClick={openReallocation}>ย้ายการจัดสรรยอดรับชำระ</button> : <div style={reallocationPanel}>
        <div style={coreWarning}><strong>รายการเงินจริงและยอดรับชำระรวมจะไม่เปลี่ยน</strong><span>ระบบจะเปลี่ยนเฉพาะใบแจ้งหนี้ที่ได้รับการตัดชำระ</span><span>เลือกใบแจ้งหนี้ที่ได้รับการตัดชำระผิด และเลือกใบแจ้งหนี้ที่ควรได้รับยอดชำระแทน</span></div>
        {Object.keys(reallocationErrors).length ? <div role="alert" style={validationSummary}>กรุณาตรวจสอบข้อมูลที่จำเป็นก่อนยืนยันการย้าย</div> : null}
        <div className="payment-reallocation-form-grid" style={reallocationFormGrid}>
          <FormField label="1. ย้ายยอดออกจากใบแจ้งหนี้" required error={reallocationErrors.source}><select ref={reallocationFirstInvalidRef} style={inputStyle(Boolean(reallocationErrors.source))} value={reallocationSourceId} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationSourceId(event.target.value); if (event.target.value === reallocationTargetId) setReallocationTargetId(""); setReallocationErrors((current) => ({ ...current, source: undefined, target: undefined, cash: undefined, wht: undefined })); }}><option value="">เลือกใบแจ้งหนี้ที่ต้องการย้ายยอดออก</option>{currentEffectiveAllocations.map((row) => { const rowInvoice = invoices.find((item) => item.id === row.invoice_id); return <option key={row.invoice_id} value={row.invoice_id}>{displayText(rowInvoice?.invoice_no)} · {money(row.effective_settlement_total, payment.currency)}</option>; })}</select></FormField>
          <FormField label="2. ย้ายยอดไปยังใบแจ้งหนี้" required error={reallocationErrors.target}><select style={inputStyle(Boolean(reallocationErrors.target))} value={reallocationTargetId} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationTargetId(event.target.value); setReallocationErrors((current) => ({ ...current, target: undefined })); }}><option value="">เลือกใบแจ้งหนี้ที่ต้องการนำยอดไปตัดชำระ</option>{candidateInvoices.filter((row) => row.id !== reallocationSourceId && normalizedAmount(settlements.find((item) => item.invoice_id === row.id)?.outstanding_amount) > 0).map((row) => { const rowSettlement = settlements.find((item) => item.invoice_id === row.id); return <option key={row.id} value={row.id}>{displayText(row.invoice_no)} · คงค้าง {money(rowSettlement?.outstanding_amount, row.currency)}</option>; })}</select></FormField>
        </div>
        <div className="payment-reallocation-context-grid" style={reallocationContextGrid}>
          {selectedSourceAllocation ? <InvoiceMoveContext title="ย้ายยอดออกจาก" invoice={selectedSourceInvoice} tone="neutral"><small style={contextSectionLabel}>การจัดสรรปัจจุบัน</small><div style={contextAmounts}><span>เงินสด {money(selectedSourceAllocation.effective_cash_allocated, payment.currency)}</span><span>WHT {money(selectedSourceAllocation.effective_wht_credit_allocated, payment.currency)}</span><strong>รวม {money(selectedSourceAllocation.effective_settlement_total, payment.currency)}</strong></div></InvoiceMoveContext> : null}
          {selectedTargetInvoice ? <InvoiceMoveContext title="ย้ายยอดไปยัง" invoice={selectedTargetInvoice} tone="accent"><div style={contextAmounts}><span>ยอดใบแจ้งหนี้ {money(selectedTargetInvoice.total_amount, payment.currency)}</span><strong>ยอดคงค้าง {money(settlements.find((row) => row.invoice_id === selectedTargetInvoice.id)?.outstanding_amount, payment.currency)}</strong></div></InvoiceMoveContext> : null}
        </div>
        {crossMatterReallocation ? <div style={crossMatterWarning}>ใบแจ้งหนี้ทั้งสองฉบับอยู่คนละคดี/งาน กรุณาตรวจสอบให้แน่ใจก่อนยืนยัน</div> : null}
        <div><h3 style={moveTitle}>3. ต้องการย้ายยอดแบบใด</h3><div className="payment-reallocation-mode-grid" style={reallocationModeGrid}>{([{
          value: "full" as const,
          title: "ย้ายยอดทั้งหมด",
          description: "ย้ายเงินสดและเครดิต WHT ที่จัดสรรอยู่ทั้งหมดไปยังใบแจ้งหนี้ที่เลือก",
        }, {
          value: "partial" as const,
          title: "ย้ายบางส่วน",
          description: "ระบุยอดเงินสดและเครดิต WHT ที่ต้องการย้ายแยกกัน",
        }]).map((option) => <label key={option.value} className="payment-reallocation-mode" style={{ ...reallocationModeOption, ...(reallocationMode === option.value ? selectedReallocationModeOption : {}) }}><input type="radio" name="reallocation-mode" value={option.value} checked={reallocationMode === option.value} disabled={reallocating} onChange={() => { beginChangedReallocationIntent(); setReallocationMode(option.value); if (option.value === "partial") { setReallocationCash("0.00"); setReallocationWht("0.00"); } setReallocationErrors((current) => ({ ...current, cash: undefined, wht: undefined })); }} /><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}</div></div>
        {reallocationMode === "full" ? <div style={fullMoveSummary}><span>ยอดที่จะย้ายทั้งหมดจากใบแจ้งหนี้ที่เลือก</span><div className="payment-full-move-grid" style={fullMoveGrid}><Metric label="เงินสด" value={money(reallocationCashAmount, payment.currency)} /><Metric label="เครดิต WHT" value={money(reallocationWhtAmount, payment.currency)} /><Metric label="ยอดตัดชำระรวม" value={money(reallocationTotal, payment.currency)} prominent /></div></div> : <div className="payment-reallocation-form-grid" style={reallocationFormGrid}><FormField label="เงินสดที่ย้าย" required error={reallocationErrors.cash}><input style={inputStyle(Boolean(reallocationErrors.cash))} type="number" min="0" step="0.01" value={reallocationCash} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationCash(event.target.value); setReallocationErrors((current) => ({ ...current, cash: undefined })); }} /></FormField><FormField label="เครดิตภาษีหัก ณ ที่จ่ายที่ย้าย" required error={reallocationErrors.wht}><input style={inputStyle(Boolean(reallocationErrors.wht))} type="number" min="0" step="0.01" value={reallocationWht} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationWht(event.target.value); setReallocationErrors((current) => ({ ...current, wht: undefined })); }} /></FormField></div>}
        {selectedSourceAllocation && selectedTargetInvoice ? <ReallocationReview sourceInvoice={selectedSourceInvoice} targetInvoice={selectedTargetInvoice} source={selectedSourceAllocation} target={selectedTargetAllocation} cashMoved={reallocationCashAmount} whtMoved={reallocationWhtAmount} currency={payment.currency} /> : null}
        <div style={unchangedSummary}><strong>รายการเงินจริงไม่เปลี่ยน</strong><div style={unchangedTotals}><Metric label="ยอดรับชำระรวม" value={money(payment.settlement_amount, payment.currency)} prominent /><Metric label="เงินสด" value={money(payment.cash_amount, payment.currency)} /><Metric label="เครดิต WHT" value={money(payment.wht_amount, payment.currency)} /></div></div>
        <FormField label="5. เหตุผลในการย้ายการจัดสรรยอดรับชำระ" required error={reallocationErrors.reason}><textarea style={{ ...textareaStyle, ...(reallocationErrors.reason ? invalidInput : {}) }} rows={3} value={reallocationReason} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationReason(event.target.value); setReallocationErrors((current) => ({ ...current, reason: undefined })); }} /></FormField>
        <label style={{ ...reallocationAcknowledgement, ...(reallocationErrors.acknowledgement ? invalidConfirmation : {}) }}><input type="checkbox" checked={reallocationAcknowledged} disabled={reallocating} onChange={(event) => { beginChangedReallocationIntent(); setReallocationAcknowledged(event.target.checked); setReallocationErrors((current) => ({ ...current, acknowledgement: undefined })); }} /><span>ยืนยันว่ารายการรับเงินจริงถูกต้อง และต้องการเปลี่ยนเฉพาะใบแจ้งหนี้ที่ได้รับการตัดชำระ{reallocationErrors.acknowledgement ? <small style={formError}>{reallocationErrors.acknowledgement}</small> : null}</span></label>
        <div style={actionRow}><button type="button" style={secondaryButton} disabled={reallocating} onClick={closeReallocation}>ยกเลิก</button><button type="button" style={primaryButton} disabled={reallocating} onClick={() => void submitReallocation()}>{reallocating ? "กำลังย้ายการจัดสรร..." : "ยืนยันการย้าย"}</button></div>
      </div>}
    </section> : null}

    {(payment.status === "draft" && access.canManage) || (payment.status === "confirmed" && access.canReverse) ? <section style={otherActions}>
      <h2 style={otherTitle}>การดำเนินการอื่น</h2><p style={sectionDescription}>{payment.status === "draft" ? "ยกเลิกร่างเมื่อไม่ต้องการใช้รายการรับชำระนี้" : "ใช้เมื่อรายการรับชำระทั้งรายการถูกบันทึกผิด ไม่ใช่กรณีเลือกใบแจ้งหนี้ผิด เงินสดอาจต้องเข้าสู่กระบวนการแก้ไขแยกต่างหาก"}</p>
      {!exceptionMode ? <button type="button" style={dangerOutlineButton} onClick={() => setExceptionMode(payment.status === "draft" ? "cancel" : "reverse")}>{payment.status === "draft" ? "ยกเลิกร่างการรับชำระ" : "แก้ไขรายการรับชำระที่บันทึกผิด"}</button> : <div style={exceptionPanel}><FormField label={exceptionMode === "cancel" ? "เหตุผลที่ยกเลิกร่าง" : "เหตุผลที่แก้ไขรายการรับชำระ"} required><textarea style={textareaStyle} rows={3} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} /></FormField><div style={actionRow}><button type="button" style={secondaryButton} disabled={processingException} onClick={() => { setExceptionMode(null); setExceptionReason(""); }}>ไม่ดำเนินการ</button><button type="button" style={{ ...dangerButton, ...(!exceptionReason.trim() ? disabledButton : {}) }} disabled={!exceptionReason.trim() || processingException} onClick={() => void runException()}>{processingException ? "กำลังดำเนินการ..." : exceptionMode === "cancel" ? "ยืนยันยกเลิกร่าง" : "ยืนยันแก้ไขรายการ"}</button></div></div>}
    </section> : null}

    <style jsx global>{`
      @media (max-width: 720px) {
        .payment-workspace { padding: 14px !important; }
        .payment-header { grid-template-columns: minmax(0, 1fr) !important; }
        .payment-allocation-card { grid-template-columns: minmax(0, 1fr) !important; gap: 7px !important; }
        .payment-effective-allocation-grid, .payment-reallocation-form-grid, .payment-reallocation-context-grid, .payment-reallocation-mode-grid, .payment-review-invoice-grid, .payment-full-move-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .payment-settlement-entry-grid, .payment-manual-wht-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .payment-wht-rate-grid { grid-template-columns: repeat(3,minmax(0,1fr)) !important; }
      }
      .payment-wht-choice, .payment-wht-rate { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .payment-reallocation-mode { transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
      .payment-reallocation-mode > span { display: grid; min-width: 0; gap: 3px; }
      .payment-reallocation-mode small { color: #64748b; line-height: 1.45; }
      .payment-reallocation-mode:hover { border-color: #93c5fd !important; }
      .payment-reallocation-mode:focus-within { outline: 3px solid rgba(37, 99, 235, .2); outline-offset: 2px; }
      .payment-wht-choice:hover:not(:disabled), .payment-wht-rate:hover:not(:disabled) { border-color: #64748b !important; }
      .payment-wht-choice:focus-visible, .payment-wht-rate:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .payment-wht-choice:disabled, .payment-wht-rate:disabled { cursor: not-allowed !important; opacity: .58; }
    `}</style>
  </main>;
}

function SectionHeading({ title, description }: { title: string; description: string }) { return <div style={{ marginBottom: 16 }}><h2 style={sectionTitle}>{title}</h2><p style={sectionDescription}>{description}</p></div>; }
function SuccessNotice({ message }: { message: string }) { const [titleLine, ...detailLines] = message.split("\n"); return <div role="status" style={successNotice}><strong>{titleLine}</strong>{detailLines.map((line) => <span key={line}>{line}</span>)}</div>; }
function Field({ label, value }: { label: string; value: ReactNode }) { return <div style={{ minWidth: 0 }}><small style={fieldLabel}>{label}</small><div style={fieldValue}>{value}</div></div>; }
function FormField({ label, helper, required = false, error, children }: { label: string; helper?: string; required?: boolean; error?: string; children: ReactNode }) { return <label style={formField}><span style={formLabel}>{label}{required ? <strong style={{ color: "#b91c1c" }}> *</strong> : null}</span>{children}{helper ? <small style={helperText}>{helper}</small> : null}{error ? <small style={formError}>{error}</small> : null}</label>; }
function Metric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...metric, ...(prominent ? prominentMetric : {}) }}><small>{label}</small><strong style={metricValue}>{value}</strong></div>; }
function StatusBadge({ status, children }: { status: string; children: ReactNode }) { return <span style={{ ...badge, ...(status === "draft" ? amberBadge : status === "confirmed" ? greenBadge : redBadge) }}>{children}</span>; }
function BankAccountIdentity({ account, paymentMethod }: { account: BankAccount | null; paymentMethod: string }) { if (!account) return <span>{paymentMethod === "bank_transfer" ? "ยังไม่ระบุ" : "ไม่ใช้บัญชีธนาคารสำหรับวิธีรับชำระนี้"}</span>; return <div style={bankAccountIdentity}><strong>{displayText(account.short_name)} — {displayText(account.bank_name)}</strong>{account.account_number ? <span style={bankAccountDetail}>{account.account_number}{account.account_name ? ` · ${account.account_name}` : ""}</span> : null}</div>; }
function paymentWhtAssistance(form: PaymentForm, invoice: InvoiceContext | null): { settlementTarget: string; whtMode: WhtMode; whtRateOption: WhtRateOption } { const settlement = normalizedAmount(normalizedAmount(form.cashAmount) + normalizedAmount(form.whtAmount)); const wht = normalizedAmount(form.whtAmount); if (wht <= 0) return { settlementTarget: settlement.toFixed(2), whtMode: "none", whtRateOption: "" }; if (!invoice) return { settlementTarget: settlement.toFixed(2), whtMode: "manual", whtRateOption: "" }; const preset = inferPaymentWhtPreset(settlement, wht, { amountBeforeVat: invoice.amount_before_vat, vatAmount: invoice.vat_amount, totalAmount: invoice.total_amount }, whtRatePresets); return { settlementTarget: settlement.toFixed(2), whtMode: preset ? "calculated" : "manual", whtRateOption: preset ? String(preset) as WhtRateOption : "" }; }

function AllocationSummaryCard({ invoice, cash, wht, total, currency }: { invoice: InvoiceContext | null; cash: number | string; wht: number | string; total: number | string; currency: string }) {
  return <div className="payment-allocation-card" style={allocationCard}><div><small style={fieldLabel}>จัดสรรไปยังใบแจ้งหนี้</small><strong>{displayText(invoice?.invoice_no)}</strong><span style={matterText}>{invoiceMatterLabel(invoice)}</span></div><span>เงินสด {money(cash, currency)}</span><span>WHT {money(wht, currency)}</span><strong>รวม {money(total, currency)}</strong></div>;
}

function EffectiveAllocationCard({ allocation, invoice, settlement, currency }: { allocation: EffectivePaymentAllocation; invoice: InvoiceContext | null; settlement: InvoiceSettlement | null; currency: string }) {
  return <article style={effectiveAllocationCard}><div style={effectiveAllocationHeader}><div><Link style={invoiceLink} href={`/finance/invoices/${allocation.invoice_id}`}>{displayText(invoice?.invoice_no)}</Link><p style={matterText}>{invoiceMatterLabel(invoice)}</p></div><span style={invoiceStatusBadge}>{invoiceStatusLabel(invoice?.document_status)}</span></div><div style={allocationMetrics}><Field label="ลูกค้า" value={displayText(invoice?.customer_name)} /><Field label="เงินสด" value={money(allocation.effective_cash_allocated, currency)} /><Field label="เครดิต WHT" value={money(allocation.effective_wht_credit_allocated, currency)} /><Field label="ยอดตัดชำระรวม" value={<strong>{money(allocation.effective_settlement_total, currency)}</strong>} /><Field label="ยอดใบแจ้งหนี้" value={money(invoice?.total_amount, currency)} /><Field label="ยอดคงค้างปัจจุบัน" value={money(settlement?.outstanding_amount, currency)} /></div></article>;
}

function HistoryRow({ title, source, target, cash, wht, total, reason, createdAt, currency }: { title: string; source: InvoiceContext | null; target: InvoiceContext | null; cash: number | string; wht: number | string; total: number | string; reason: string | null; createdAt: string | null; currency: string }) {
  return <div style={historyRow}><div style={historyRowHeader}><strong>{title}</strong>{createdAt ? <span>{formatBangkokDateTime(createdAt)}</span> : null}</div><div style={historyRoute}>{source ? <span>จาก <Link href={`/finance/invoices/${source.id}`}>{displayText(source.invoice_no)}</Link></span> : null}<span>{source ? "ไปยัง" : "ใบแจ้งหนี้"} {target ? <Link href={`/finance/invoices/${target.id}`}>{displayText(target.invoice_no)}</Link> : "ไม่พบข้อมูล"}</span></div><div style={historyAmounts}><span>เงินสด {money(cash, currency)}</span><span>WHT {money(wht, currency)}</span><strong>รวม {money(total, currency)}</strong></div>{reason ? <p style={historyReason}>เหตุผล: {reason}</p> : null}</div>;
}

function InvoiceMoveContext({ title, invoice, tone, children }: { title: string; invoice: InvoiceContext | null; tone: "neutral" | "accent"; children: ReactNode }) {
  return <article style={{ ...invoiceMoveContext, ...(tone === "accent" ? accentInvoiceMoveContext : {}) }}><small style={contextLabel}>{title}</small><strong style={contextInvoiceNo}>{displayText(invoice?.invoice_no)}</strong><span style={matterText}>{invoiceMatterLabel(invoice)}</span>{children}</article>;
}

function ReallocationReview({ sourceInvoice, targetInvoice, source, target, cashMoved, whtMoved, currency }: { sourceInvoice: InvoiceContext | null; targetInvoice: InvoiceContext; source: EffectivePaymentAllocation; target: EffectivePaymentAllocation | null; cashMoved: number; whtMoved: number; currency: string }) {
  const sourceCashAfter = normalizedAmount(normalizedAmount(source.effective_cash_allocated) - cashMoved);
  const sourceWhtAfter = normalizedAmount(normalizedAmount(source.effective_wht_credit_allocated) - whtMoved);
  const targetCashAfter = normalizedAmount(normalizedAmount(target?.effective_cash_allocated) + cashMoved);
  const targetWhtAfter = normalizedAmount(normalizedAmount(target?.effective_wht_credit_allocated) + whtMoved);
  return <section style={reviewComparison}><h3 style={comparisonTitle}>4. ตรวจสอบผลการย้าย</h3><div><h4 style={reviewStageTitle}>ก่อนย้าย</h4><div className="payment-review-invoice-grid" style={reviewInvoiceGrid}><AllocationReviewCard invoice={sourceInvoice} total={source.effective_settlement_total} currency={currency} /><AllocationReviewCard invoice={targetInvoice} total={normalizedAmount(target?.effective_settlement_total)} currency={currency} /></div></div><div style={movingSummary}><small>ยอดที่จะย้าย</small><strong>{money(cashMoved + whtMoved, currency)}</strong><span>เงินสด {money(cashMoved, currency)}</span><span>เครดิต WHT {money(whtMoved, currency)}</span></div><div><h4 style={reviewStageTitle}>หลังย้าย</h4><div className="payment-review-invoice-grid" style={reviewInvoiceGrid}><AllocationReviewCard invoice={sourceInvoice} total={normalizedAmount(sourceCashAfter + sourceWhtAfter)} currency={currency} /><AllocationReviewCard invoice={targetInvoice} total={normalizedAmount(targetCashAfter + targetWhtAfter)} currency={currency} /></div></div></section>;
}

function AllocationReviewCard({ invoice, total, currency }: { invoice: InvoiceContext | null; total: number | string; currency: string }) {
  return <div style={allocationReviewCard}><strong>{displayText(invoice?.invoice_no)}</strong><span style={matterText}>{invoiceMatterLabel(invoice)}</span><div style={allocationReviewTotal}><small>ยอดตัดชำระ</small><strong>{money(total, currency)}</strong></div></div>;
}

function invoiceMatterLabel(invoice: InvoiceContext | null | undefined) {
  if (!invoice) return "ไม่ระบุคดี/งาน";
  const snapshot = invoice.matter_snapshot_json || {};
  const references = [snapshot.file_no, snapshot.matter_no, snapshot.title, snapshot.name].filter((value, index, values) => typeof value === "string" && value.trim() && values.indexOf(value) === index) as string[];
  if (references.length) return references.join(" - ");
  if (invoice.case_id != null) return `Case ${invoice.case_id}`;
  if (invoice.advisory_matter_id) return "Advisory";
  return "ยังไม่ผูกคดี/งาน";
}

function sameInvoiceMatter(left: InvoiceContext, right: InvoiceContext) {
  return left.case_id === right.case_id && left.advisory_matter_id === right.advisory_matter_id;
}

function invoiceStatusLabel(status?: string) {
  if (status === "issued") return "ออกใบแจ้งหนี้แล้ว";
  if (status === "voided") return "ยกเลิกแล้ว";
  if (status === "cancelled") return "ยกเลิกร่างแล้ว";
  return status || "ไม่ระบุ";
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
const manualWhtSection: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(220px,0.7fr)", gap: 18, marginTop: 16, padding: "15px 0", borderTop: "1px solid #fcd34d", borderBottom: "1px solid #fcd34d", color: "#78350f" };
const manualWhtHelp: CSSProperties = { margin: "5px 0 0", color: "#92400e", fontSize: 12, lineHeight: 1.5 };
const whtModeActions: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: 8 };
const textActionButton: CSSProperties = { padding: "6px 0", border: 0, background: "transparent", color: "#1d4ed8", font: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const assistedAmountSummary: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10, marginTop: 16 };
const metric: CSSProperties = { display: "grid", gap: 5, minWidth: 0, padding: 13, border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b" };
const prominentMetric: CSSProperties = { borderColor: "#86efac", background: "#f0fdf4", color: "#166534" };
const metricValue: CSSProperties = { color: "#172033", fontSize: 17, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" };
const allocationCard: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px,1fr) repeat(3,max-content)", alignItems: "center", gap: 18, marginTop: 16, padding: 14, border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", fontVariantNumeric: "tabular-nums" };
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
const nextStepNotice: CSSProperties = { marginTop: 16, padding: 13, border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", color: "#1e40af" };
const financialActionSection: CSSProperties = { ...surface, borderColor: "#bfdbfe", background: "#f8fbff", scrollMarginTop: 84 };
const financialActionTitle: CSSProperties = { margin: 0, color: "#1e3a8a", fontSize: 17 };
const reallocationButton: CSSProperties = { ...secondaryButton, marginTop: 14, borderColor: "#93c5fd", color: "#1d4ed8" };
const reallocationPanel: CSSProperties = { display: "grid", minWidth: 0, gap: 16, marginTop: 16, padding: 16, border: "1px solid #bfdbfe", borderRadius: 6, background: "#fff" };
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
