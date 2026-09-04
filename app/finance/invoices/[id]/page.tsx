"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { feeAgreementStatusLabel } from "../../fee-agreements/lifecycle";
import { supabase } from "../../../../lib/supabase";
import { paymentSettlementLabels, paymentStatusLabels, safePaymentError, settlementStatusLabels, type EffectivePaymentAllocation, type FinancePayment, type InvoiceSettlement, type PaymentAllocationReallocation } from "../../payments/shared";
import InvoiceCompositionEditor from "../invoice-composition-editor";
import { invoiceDraftDatesAreValid, resolveInvoicePaymentInstructions } from "../payment-instructions";
import {
  bangkokToday,
  bankAccountPaymentDestination,
  displayText,
  economicClassificationLabel,
  eligibleInvoicePaymentBankAccount,
  formatBangkokDateTime,
  formatDocumentDate,
  invoiceDraftFingerprint,
  invoiceDraftForm,
  invoiceItemEconomicClassification,
  invoiceItemSourceType,
  invoiceItemUnit,
  invoiceStatusLabels,
  installmentStatusLabels,
  money,
  safeInvoiceError,
  snapshotPaymentDestination,
  sourceQuotationNo,
  triggerLabels,
  type FinanceBankAccount,
  type FinanceInvoice,
  type FinanceInvoiceItem,
  type InvoiceDraftForm,
} from "../shared";

type BillingPlan = { id: string; title: string | null; status: string; billing_method: string };
type Installment = { id: string; installment_no: number; title: string; trigger_type: string; trigger_description: string | null; due_date: string | null; status: string; readiness_event_date: string | null; readiness_confirmed_at: string | null; readiness_reference: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string };
type FeeAgreement = { id: string; agreement_no: string | null; title: string; status: string; engagement_basis: "formal_agreement" | "accepted_quotation" | null; source_reference: string | null };
type V2Bridge = { billing_installment_id: string; billing_plan_id: string; fee_agreement_id: string };
type FormErrors = Partial<Record<"issueDate" | "dueDate" | "bankAccount", string>>;
type VoidFormErrors = Partial<Record<"reason" | "acknowledgement", string>>;
type InvoicePaymentAllocation = { payment_id: string; cash_allocated: number | string; wht_credit_allocated: number | string; settlement_total: number | string };

const invoiceSelect = "id,billing_plan_id,primary_billing_installment_id,fee_agreement_id,source_quotation_id,client_id,case_id,advisory_matter_id,source_model,v2_bridge_id,v2_creation_request_id,invoice_no,document_status,issue_date,due_date,currency,language_code,customer_note,payment_terms_text,payment_destination_bank_account_id,payment_destination_snapshot_json,internal_note,amount_before_vat,vat_amount,total_amount,seller_name_th,seller_name_en,seller_tax_id,seller_branch,seller_address,seller_phone,seller_email,seller_website,customer_name,customer_tax_id,customer_branch,customer_billing_address,customer_phone,customer_email,seller_snapshot_json,customer_snapshot_json,matter_snapshot_json,source_snapshot_json,issued_snapshot_json,issued_at,voided_at,void_reason,cancelled_at,cancel_reason,created_at,updated_at";
const itemSelect = "id,source_billable_charge_id,source_state,source_snapshot_json,description,source_quantity,source_unit_price,allocation_percent,vat_applicable,vat_rate,tax_category,price_tax_mode,amount_before_vat,vat_amount,line_total,sort_order";

export default function InvoiceDetailPage() {
  return <QuotationGuard>{(access) => <InvoiceWorkspace canManagePayments={access.permissions.canManageFinancePayments} canManageComposition={access.permissions.canEditFinanceQuotation && access.permissions.canManageFinanceBillableCharges} />}</QuotationGuard>;
}

function InvoiceWorkspace({ canManagePayments, canManageComposition }: { canManagePayments: boolean; canManageComposition: boolean }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
      setError("ไม่สามารถโหลดใบแจ้งหนี้ได้"); setLoading(false); return;
    }
    if (!invoiceResult.data) { setError("ไม่พบใบแจ้งหนี้"); setLoading(false); return; }
    const invoiceRow = invoiceResult.data as FinanceInvoice;
    const bridgeResult = invoiceRow.v2_bridge_id
      ? await supabase.from("finance_billing_installment_charge_bridges").select("billing_installment_id,billing_plan_id,fee_agreement_id").eq("id", invoiceRow.v2_bridge_id).maybeSingle()
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
      setError("โหลดข้อมูลต้นทางของใบแจ้งหนี้บางส่วนไม่สำเร็จ กรุณารีเฟรช");
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
    if (requireIssueDate && !form.issueDate) nextErrors.issueDate = "กรุณาระบุวันที่ออกเอกสาร";
    if (!invoiceDraftDatesAreValid(form.issueDate, form.dueDate)) nextErrors.dueDate = "วันที่ครบกำหนดต้องไม่มาก่อนวันที่ออกเอกสาร";
    if (requireIssueDate && form.issueDate && form.issueDate > bangkokToday()) nextErrors.issueDate = "วันที่ออกใบแจ้งหนี้ต้องไม่เป็นวันในอนาคต";
    if (requireBankAccount && !form.paymentDestinationBankAccountId) nextErrors.bankAccount = "กรุณาเลือกบัญชีสำหรับรับชำระ";
    if (form.paymentDestinationBankAccountId && (!selectedBankAccount || !eligibleInvoicePaymentBankAccount(selectedBankAccount))) nextErrors.bankAccount = "บัญชีที่เลือกไม่พร้อมใช้งาน กรุณาเลือกบัญชีที่มีข้อมูลครบถ้วน";
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
      setMessage("บันทึกการเปลี่ยนแปลงแล้ว");
    } catch (saveError) {
      setError(safeInvoiceError(saveError, "บันทึกร่างใบแจ้งหนี้ไม่สำเร็จ"));
    } finally {
      actionLock.current = false; setSaving(false);
    }
  };

  const openIssueReview = () => {
    setError(""); setMessage("");
    if (!validateDraft(true, true)) return;
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
    if (!validateDraft(true, true) || dirty) return;
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
      setMessage(invoice.source_model === "billable_charge_v2" ? "ยกเลิกร่างแล้ว รายการเรียกเก็บกลับไปอยู่ในรายการพร้อมออกใบแจ้งหนี้" : "ยกเลิกร่างใบแจ้งหนี้แล้ว งวดต้นทางยังคงสถานะพร้อมออกใบแจ้งหนี้");
    } catch (cancelError) {
      setError(safeInvoiceError(cancelError, "ยกเลิกร่างใบแจ้งหนี้ไม่สำเร็จ"));
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
    if (!voidReason.trim()) nextErrors.reason = "กรุณาระบุเหตุผลในการยกเลิกใบแจ้งหนี้";
    if (voidReason.trim().length > 2000) nextErrors.reason = "เหตุผลในการยกเลิกใบแจ้งหนี้ต้องไม่เกิน 2,000 ตัวอักษร";
    if (!voidAcknowledged) nextErrors.acknowledgement = "กรุณายืนยันว่าคุณเข้าใจผลของการยกเลิกใบแจ้งหนี้";
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
      setMessage(invoice.source_model === "billable_charge_v2" ? "ยกเลิกใบแจ้งหนี้แล้ว เลขที่เดิมถูกเก็บไว้เป็นประวัติและรายการต้นทางพร้อมสำหรับสร้างใบแจ้งหนี้ใหม่" : "ยกเลิกใบแจ้งหนี้แล้ว เลขที่เดิมถูกเก็บไว้เป็นประวัติและงวดต้นทางพร้อมสำหรับสร้างใบแจ้งหนี้ใหม่");
    } catch (voidError) {
      console.error("Failed to void Invoice", voidError);
      setError(safeInvoiceError(voidError, "ยกเลิกใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่"));
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
      setError(safePaymentError(paymentError, "สร้างร่างการรับชำระไม่สำเร็จ"));
    } finally {
      actionLock.current = false; setCreatingPayment(false);
    }
  };

  if (loading) return <main style={page}>กำลังโหลดใบแจ้งหนี้...</main>;
  if (!invoice) return <main style={page}>{error || "ไม่พบใบแจ้งหนี้"}</main>;

  const matter = displayText(invoice.matter_snapshot_json?.title, displayText(invoice.matter_snapshot_json?.file_no, invoice.case_id || invoice.advisory_matter_id ? "เรื่อง/คดีที่เชื่อมไว้" : "ยังไม่ผูกเรื่อง"));
  const engagementReference = agreement ? agreement.engagement_basis === "accepted_quotation" ? displayText(agreement.source_reference, agreement.title) : displayText(agreement.agreement_no, agreement.title) : "-";
  const installmentLabel = installment ? `งวดที่ ${installment.installment_no}${installment.title ? ` · ${installment.title}` : ""}` : "-";
  const invoiceSourceLabel = isV2 ? v2Bridge ? "ยอดตามแผน + รายการเรียกเก็บเพิ่มเติม" : "รายการเรียกเก็บเพิ่มเติม" : engagementReference;
  const paymentDestination = isDraft
    ? bankAccountPaymentDestination(selectedBankAccount)
    : snapshotPaymentDestination(invoice.issued_snapshot_json?.payment_destination);
  const activeItems = items.filter((item) => item.source_state === "active");

  return <main className="invoice-workspace" style={page}>
    <nav className="invoice-navigation-toolbar" style={navigationToolbar} aria-label="การนำทางเอกสารที่เกี่ยวข้อง">
      <NavigationLink href={isV2 ? "/finance/invoices" : `/finance/billing-plans/${invoice.billing_plan_id}`} icon="back" variant="back">{isV2 ? "กลับไปรายการใบแจ้งหนี้" : "กลับไปแผนเรียกเก็บเงิน"}</NavigationLink>
      {invoice.fee_agreement_id ? <NavigationLink href={`/finance/fee-agreements/${invoice.fee_agreement_id}`} icon="document" variant="source">เปิดข้อมูลการว่าจ้างต้นทาง</NavigationLink> : null}
      {isV2 ? <NavigationLink href="/finance/billable-charges" icon="document" variant="source">เปิดรายการเรียกเก็บเพิ่มเติม</NavigationLink> : null}
      {invoice.source_quotation_id ? <NavigationLink href={`/finance/quotations/${invoice.source_quotation_id}`} icon="document" variant="source">เปิดใบเสนอราคาต้นทาง</NavigationLink> : null}
    </nav>

    {error ? <div role="alert" style={errorNotice}>{error}</div> : null}
    {message ? <div role="status" style={successNotice}>{message}</div> : null}

    <section style={{ ...surface, ...headerSurface }}>
      <div className="invoice-identity-header" style={identityHeader}>
        <div><span style={eyebrow}>{isDraft ? "INVOICE DRAFT" : "INVOICE"}</span><h1 style={title}>{isDraft ? "ร่างใบแจ้งหนี้" : "ใบแจ้งหนี้"}</h1>{isDraft ? <p style={draftReference}>รหัสอ้างอิงร่างภายใน {invoice.id.slice(0, 8).toUpperCase()}</p> : <div style={officialNumber}><small>เลขที่ใบแจ้งหนี้</small><strong style={officialNumberValue}>{displayText(invoice.invoice_no)}</strong></div>}</div>
        <div className={`invoice-status-panel${isVoided ? " invoice-status-voided" : ""}`} style={{ ...statusPanel, ...(isIssued ? issuedStatusPanel : {}), ...(isVoided ? voidedStatusPanel : {}) }}><span style={metaLabel}>สถานะเอกสาร</span><StatusBadge status={invoice.document_status} label={invoiceStatusLabels[invoice.document_status] || invoice.document_status} />{invoice.issued_at ? <span style={updatedText}>ออกเอกสาร {formatBangkokDateTime(invoice.issued_at)}</span> : null}{invoice.voided_at ? <span style={voidedUpdatedText}>ยกเลิกเมื่อ {formatBangkokDateTime(invoice.voided_at)}</span> : null}<span style={updatedText}>สร้าง {formatBangkokDateTime(invoice.created_at)}</span><span style={updatedText}>แก้ไขล่าสุด {formatBangkokDateTime(invoice.updated_at)}</span></div>
      </div>
      {isDraft ? <div style={numberNotice}><strong>ยังไม่มีเลขที่ใบแจ้งหนี้</strong><span>เลขที่ VP-IV จะถูกกำหนดเมื่อยืนยันออกใบแจ้งหนี้เท่านั้น</span></div> : null}
      {invoice.document_status === "issued" ? <div style={issuedNotice}><strong>เอกสารถูกออกแล้วและเป็นแบบอ่านอย่างเดียว</strong><span>ขั้นตอนถัดไปคือรอรับชำระเงิน</span><span>การออกใบแจ้งหนี้ยังไม่ถือว่าได้รับชำระเงิน</span></div> : null}
      {isVoided ? <div style={voidedNotice}><strong>สถานะ: ยกเลิกแล้ว</strong><span>ใบแจ้งหนี้เลขที่ {displayText(invoice.invoice_no)} ถูกเก็บไว้เป็นประวัติและไม่สามารถรับชำระเพิ่มได้</span></div> : null}
      {invoice.document_status === "cancelled" ? <div style={cancelledNotice}><strong>ร่างนี้ถูกยกเลิกแล้ว</strong><span>{displayText(invoice.cancel_reason)}</span></div> : null}
    </section>

    <section style={sourceTrail}>
      <h2 style={compactHeading}>เส้นทางเอกสารต้นทาง</h2>
      <div className="invoice-source-nodes" style={sourceNodes}>
        {!isV2 && invoice.source_quotation_id ? <><SourceNode label="ใบเสนอราคา"><Link href={`/finance/quotations/${invoice.source_quotation_id}`}>{sourceQuotationNo(invoice.source_snapshot_json)}</Link></SourceNode><Arrow /></> : null}
        {!isV2 && invoice.fee_agreement_id ? <><SourceNode label={agreement?.engagement_basis === "accepted_quotation" ? "การว่าจ้างตามใบเสนอราคา" : "ข้อตกลงค่าบริการ"}><Link href={`/finance/fee-agreements/${invoice.fee_agreement_id}`}>{engagementReference}</Link>{agreement ? <StatusBadge status={agreement.status} label={feeAgreementStatusLabel(agreement.status)} /> : null}</SourceNode><Arrow /></> : null}
        {!isV2 && invoice.billing_plan_id ? <><SourceNode label="แผนเรียกเก็บเงิน"><Link href={`/finance/billing-plans/${invoice.billing_plan_id}`}>{displayText(plan?.title, "แผนเรียกเก็บเงิน")}</Link></SourceNode><Arrow /></> : null}
        {!isV2 ? <><SourceNode label={`งวดที่ ${installment?.installment_no || "-"}`}>{displayText(installment?.title, "งวดเรียกเก็บเงิน")}{installment ? <StatusBadge status={installment.status} label={installmentStatusLabels[installment.status] || installment.status} /> : null}</SourceNode><Arrow /></> : null}
        {isV2 && agreement && invoice.fee_agreement_id ? <><SourceNode label="ข้อมูลการว่าจ้าง"><Link href={`/finance/fee-agreements/${invoice.fee_agreement_id}`}>{engagementReference}</Link></SourceNode><Arrow /></> : null}
        {isV2 && plan && invoice.billing_plan_id ? <><SourceNode label="แผนเรียกเก็บเงิน"><Link href={`/finance/billing-plans/${invoice.billing_plan_id}`}>{displayText(plan.title, "แผนเรียกเก็บเงิน")}</Link></SourceNode><Arrow /></> : null}
        {isV2 ? <><SourceNode label={v2Bridge ? "แบบรวมรายการ" : "จากรายการเรียกเก็บ"}>{invoiceSourceLabel}</SourceNode><Arrow /></> : null}
        <SourceNode label={isDraft ? "ร่างใบแจ้งหนี้" : isVoided ? "ใบแจ้งหนี้ที่ยกเลิกแล้ว" : "ใบแจ้งหนี้"} current>{invoice.invoice_no || invoice.id.slice(0, 8).toUpperCase()}</SourceNode>
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
        <Field label="แหล่งข้อมูล" value={invoiceSourceLabel} />
      </div>
      <div style={addressBlock}><span style={fieldLabel}>ที่อยู่ออกเอกสาร</span><strong>{displayText(invoice.customer_billing_address)}</strong>{invoice.customer_phone || invoice.customer_email ? <span>{[invoice.customer_phone, invoice.customer_email].filter(Boolean).join(" · ")}</span> : null}</div>
      {!invoice.customer_tax_id ? <div style={neutralWarning}>ยังไม่มีเลขประจำตัวผู้เสียภาษีของลูกค้า กรุณาตรวจสอบข้อมูลลูกค้าให้ถูกต้อง</div> : null}
    </section>

    {!isV2 ? <section style={surface}>
      <SectionHeading title="เหตุผลและหลักฐานการเรียกเก็บงวดนี้" description="แสดงเหตุการณ์ที่ผู้ใช้งานยืนยันแล้วว่างวดนี้พร้อมจัดทำใบแจ้งหนี้" />
      <div style={detailGrid}>
        <Field label="งวดเรียกเก็บเงิน" value={installmentLabel} />
        <Field label="เงื่อนไขเรียกเก็บ" value={displayText(installment?.trigger_description, triggerLabels[installment?.trigger_type || ""] || "-")} />
        <Field label="วันที่เงื่อนไขเกิดขึ้นจริง" value={installment?.readiness_event_date || "-"} />
        <Field label="บันทึกยืนยันเมื่อ" value={formatBangkokDateTime(installment?.readiness_confirmed_at)} />
        <Field label="หลักฐาน/เลขอ้างอิง" value={displayText(installment?.readiness_reference)} />
        <Field label="ยอดของงวด" value={money(installment?.total_amount, invoice.currency)} />
      </div>
    </section> : <section style={surface}><SectionHeading title="ที่มาของยอดเรียกเก็บ" description="รายการแต่ละบรรทัดเก็บความเชื่อมโยงกับข้อมูลต้นทางและยอดเงินเป็นแบบอ่านอย่างเดียว" /><div style={detailGrid}><Field label="รูปแบบการรวบรวมยอด" value={invoiceSourceLabel} /><Field label="งวดตามแผน" value={v2Bridge ? installmentLabel : "ไม่ใช้"} /><Field label="จำนวนรายการ" value={`${activeItems.length} รายการ`} /></div></section>}

    <section style={surface}>
      <SectionHeading title="รายการค่าบริการ" description={isV2 ? "รายการและยอดเงินคัดลอกจากแหล่งยอดที่เลือกและเป็นแบบอ่านอย่างเดียว" : "รายการและยอดเงินคัดลอกจากงวดในแผนเรียกเก็บเงินและเป็นแบบอ่านอย่างเดียว"} />
      {activeItems.length === 0 ? <div style={neutralWarning}>{isDraft ? "ไม่พบรายการค่าบริการในร่างใบแจ้งหนี้" : "ไม่พบรายการค่าบริการในใบแจ้งหนี้"}</div> : <div style={tableScroll}><table className="invoice-item-table" style={table}><colgroup><col style={{ width: "42%" }} /><col style={{ width: "13%" }} /><col style={{ width: "15%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /></colgroup><thead><tr><th>รายการ</th><th>VAT</th><th>มูลค่าก่อน VAT</th><th>VAT</th><th>ยอดรวม</th></tr></thead><tbody>{activeItems.map((item) => { const quantityLabel = invoiceItemQuantityLabel(item, invoice.currency); return <tr key={item.id}><td><strong>{item.description}</strong>{item.allocation_percent !== null ? <small style={itemMeta}>สัดส่วนจากรายการต้นทาง {Number(item.allocation_percent).toLocaleString("en-US", { maximumFractionDigits: 4 })}%</small> : null}{isV2 ? <>{quantityLabel ? <small style={itemMeta}>{quantityLabel}</small> : null}<small style={itemMeta}>{invoiceItemClassificationLabel(item)}</small><small style={itemMeta}>{invoiceItemSourceLabel(item)}</small></> : null}</td><td>{item.vat_applicable ? `${Number(item.vat_rate)}%` : "ไม่มี VAT"}</td><td>{money(item.amount_before_vat, invoice.currency)}</td><td>{money(item.vat_amount, invoice.currency)}</td><td><strong>{money(item.line_total, invoice.currency)}</strong></td></tr>; })}</tbody></table></div>}
      <div className="invoice-total-grid" style={totalsGrid}><Metric label="มูลค่าก่อน VAT" value={money(invoice.amount_before_vat, invoice.currency)} /><Metric label="VAT" value={money(invoice.vat_amount, invoice.currency)} /><Metric label="ยอดรวม" value={money(invoice.total_amount, invoice.currency)} prominent /></div>
    </section>

    {isV2 && isDraft ? <InvoiceCompositionEditor invoice={invoice} canManage={canManageComposition} onChanged={load} /> : null}

    {isDraft ? <section ref={settingsRef} id="invoice-draft-settings" style={surface} className="invoice-draft-settings">
      <SectionHeading title="ข้อมูลในใบแจ้งหนี้" description="แก้ไขเฉพาะข้อมูลการนำเสนอเอกสาร รายการและยอดเงินต้นทางจะไม่เปลี่ยน" />
      <div style={formGrid}>
        <FormField label="วันที่ออกเอกสาร" required error={formErrors.issueDate}><input ref={issueDateRef} style={inputStyle(Boolean(formErrors.issueDate))} type="date" value={form.issueDate} disabled={saving} onChange={(event) => updateForm("issueDate", event.target.value)} /></FormField>
        <FormField label="วันที่ครบกำหนด" helper="ไม่บังคับ หากเงื่อนไขเรียกเก็บไม่มีวันที่แน่นอน" error={formErrors.dueDate}><input ref={dueDateRef} style={inputStyle(Boolean(formErrors.dueDate))} type="date" value={form.dueDate} disabled={saving} onChange={(event) => updateForm("dueDate", event.target.value)} /></FormField>
        <FormField label="ภาษาเอกสาร"><select style={inputStyle(false)} value={form.languageCode} disabled={saving} onChange={(event) => updateForm("languageCode", event.target.value === "en" ? "en" : "th")}><option value="th">ไทย</option><option value="en">English</option></select></FormField>
      </div>
      <div className="invoice-bank-destination" style={bankDestinationPanel}>
        <FormField label="บัญชีสำหรับรับชำระ" required helper="ต้องเลือกก่อนออกใบแจ้งหนี้ บัญชีนี้ใช้แจ้งให้ลูกค้าโอนชำระ ไม่ใช่การบันทึกว่ารับเงินจริงเข้าบัญชีใด" error={formErrors.bankAccount}>
          <select ref={bankAccountRef} style={inputStyle(Boolean(formErrors.bankAccount))} value={form.paymentDestinationBankAccountId} disabled={saving} onChange={(event) => updateForm("paymentDestinationBankAccountId", event.target.value)}>
            <option value="">เลือกบัญชีสำหรับรับชำระ</option>
            {form.paymentDestinationBankAccountId && selectedBankAccount && !eligibleInvoicePaymentBankAccount(selectedBankAccount) ? <option value={selectedBankAccount.id} disabled>{displayText(selectedBankAccount.short_name)} — บัญชีนี้ไม่พร้อมใช้งาน</option> : null}
            {eligibleBankAccounts.map((account) => <option key={account.id} value={account.id}>{displayText(account.short_name)} — {displayText(account.bank_name)} · {displayText(account.account_number)}</option>)}
          </select>
        </FormField>
        {paymentDestination ? <div style={bankDestinationSummary}><strong>{displayText(paymentDestination.bankName, displayText(paymentDestination.shortName))}</strong><span>ชื่อบัญชี {displayText(paymentDestination.accountName)}</span><span>เลขที่บัญชี {displayText(paymentDestination.accountNumber)}</span></div> : eligibleBankAccounts.length === 0 ? <div style={neutralWarning}>ยังไม่มีบัญชีรับชำระที่เปิดใช้งานและมีข้อมูลครบถ้วน</div> : null}
      </div>
      <div style={notesGrid}>
        <FormField label="ข้อมูลการชำระเงินเพิ่มเติม" helper={paymentInstructionState?.isLegacyAutoInheritedBillingTrigger ? "ระบบไม่นำเงื่อนไขการเรียกเก็บเดิมมาใช้เป็นข้อมูลการชำระเงิน" : "แสดงในใบแจ้งหนี้สำหรับลูกค้า หากไม่ระบุจะไม่แสดงหัวข้อนี้"}><textarea style={textareaStyle} rows={4} value={form.paymentTermsText} disabled={saving} onChange={(event) => updateForm("paymentTermsText", event.target.value)} /></FormField>
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
        <ReadOnlyValue label="บัญชีสำหรับรับชำระ" value={paymentDestination ? `${displayText(paymentDestination.bankName, displayText(paymentDestination.shortName))}\nชื่อบัญชี ${displayText(paymentDestination.accountName)}\nเลขที่บัญชี ${displayText(paymentDestination.accountNumber)}` : "ไม่ได้ระบุในเอกสารฉบับนี้"} multiline />
      </div>
      <div style={readOnlyNotesGrid}>
        <ReadOnlyValue label="ข้อมูลการชำระเงินเพิ่มเติม" value={displayText(invoice.payment_terms_text, "ไม่ระบุ")} multiline />
        <ReadOnlyValue label="หมายเหตุถึงลูกค้า" value={displayText(invoice.customer_note, "ไม่ระบุ")} multiline />
        <div style={internalNoteBlock}><ReadOnlyValue label="หมายเหตุภายใน" value={displayText(invoice.internal_note, "ไม่ระบุ")} multiline /><small style={internalNoteHelper}>ข้อมูลภายในสำนักงาน ไม่แสดงใน Preview หรือ Print</small></div>
      </div>
    </section>}

    <section style={previewBand}>
      <div><span style={eyebrow}>PREVIEW & PRINT</span><h2 style={previewTitle}>{isVoided ? "ดูเอกสารฉบับประวัติ" : "ตรวจสอบเอกสารที่ลูกค้าจะได้รับ"}</h2><p style={sectionDescription}>{isDraft ? "Preview และ Print ใช้รูปแบบ A4 เดียวกัน การเปิดหรือพิมพ์ร่างไม่ออกเลขที่ VP-IV และไม่เปลี่ยนสถานะเอกสาร" : isVoided ? "Preview และ Print ใช้ข้อมูลเดิมที่ถูกล็อกเมื่อออกใบแจ้งหนี้ พร้อมแสดงเครื่องหมายยกเลิก โดยไม่แสดงเหตุผลภายใน" : "Preview และ Print ใช้ข้อมูลที่ถูกล็อกไว้เมื่อออกใบแจ้งหนี้ และไม่เปลี่ยนสถานะเอกสาร"}</p></div>
      <div style={previewActions}>{isDraft && dirty ? <><span style={{ ...secondaryButton, ...disabledButton }} aria-disabled="true">ดูตัวอย่าง</span><span style={{ ...primaryDarkButton, ...disabledButton }} aria-disabled="true">พิมพ์</span></> : <><Link style={secondaryButton} href={`/finance/invoices/${invoice.id}/preview`}>ดูตัวอย่าง</Link><Link style={primaryDarkButton} href={`/finance/invoices/${invoice.id}/preview?print=1`} target="_blank">พิมพ์</Link></>}</div>
      {isDraft && dirty ? <div style={{ ...neutralWarning, flexBasis: "100%", marginTop: 0 }}>กรุณาบันทึกการเปลี่ยนแปลงก่อนเปิด Preview หรือ Print เพื่อให้เอกสารตรงกับข้อมูลล่าสุด</div> : null}
    </section>

    {isVoided ? <section style={voidedHistorySection}>
      <span style={voidedHistoryEyebrow}>ประวัติใบแจ้งหนี้</span>
      <h2 style={voidedHistoryTitle}>ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว</h2>
      <p style={voidedHistoryDescription}>เลขที่เดิมและข้อมูลฉบับที่ออกแล้วถูกเก็บไว้เป็นหลักฐาน ระบบจะไม่ใช้เลขที่นี้ซ้ำ</p>
      <div className="invoice-voided-summary" style={voidedSummaryGrid}>
        <Field label="เลขที่ใบแจ้งหนี้เดิม" value={displayText(invoice.invoice_no)} />
        <Field label="วันที่ออกเอกสารเดิม" value={formatDocumentDate(invoice.issue_date, "th")} />
        <Field label="ยกเลิกเมื่อ" value={formatBangkokDateTime(invoice.voided_at)} />
        <Field label="ยอดเดิม" value={money(invoice.total_amount, invoice.currency)} />
      </div>
      <div style={voidReasonBlock}><small style={fieldLabel}>เหตุผลภายในที่ยกเลิก</small><p>{displayText(invoice.void_reason)}</p></div>
      {linkedPayments.length ? <PaymentLinks title="ประวัติรายการรับชำระที่เกี่ยวข้อง" payments={linkedPayments} effectiveAllocations={effectivePaymentAllocations} rawAllocations={rawPaymentAllocations} reallocations={paymentReallocations} invoiceId={invoice.id} historical /> : null}
      <div style={replacementNextStep}><strong>{isV2 ? "สร้างใบแจ้งหนี้ใหม่จากรายการเดิม" : "สร้างใบแจ้งหนี้ใหม่จากงวดเดิม"}</strong><span>{isV2 ? "รายการต้นทางกลับไปพร้อมออกใบแจ้งหนี้แล้ว สามารถเลือกเพื่อสร้างร่างใหม่ได้ โดยระบบจะกำหนดเลขที่ VP-IV ใหม่เมื่อออกเอกสาร" : "หากต้องการเรียกเก็บใหม่ ให้กลับไปยังแผนเรียกเก็บเงินและสร้างร่างใบแจ้งหนี้ใหม่ ระบบจะกำหนดเลขที่ VP-IV ใหม่เมื่อออกเอกสาร"}</span><Link style={replacementButton} href={isV2 ? `/finance/invoices/compose?client=${invoice.client_id}` : `/finance/billing-plans/${invoice.billing_plan_id}`}>กลับไปสร้างใบแจ้งหนี้ใหม่</Link></div>
    </section> : null}

    {invoice.document_status === "issued" ? <section style={nextStepZone}>
      <span style={nextStepEyebrow}>การชำระเงิน</span><h2 style={nextStepTitle}>สถานะการรับชำระ</h2><p style={nextStepDescription}>ยอดรับชำระยืนยันแล้วเป็นแหล่งข้อมูลทางการของสถานะการชำระ ใบแจ้งหนี้ไม่ถือเป็นหลักฐานว่าได้รับเงิน</p>
      <div className="invoice-settlement-summary" style={settlementGrid}>
        <Metric label="ยอดใบแจ้งหนี้" value={money(settlement?.invoice_gross_amount ?? invoice.total_amount, invoice.currency)} />
        <Metric label={paymentSettlementLabels.receivedFull} value={money(settlement?.confirmed_cash_allocated, invoice.currency)} />
        <Metric label="เครดิตภาษีหัก ณ ที่จ่าย" value={money(settlement?.confirmed_wht_credit_allocated, invoice.currency)} />
        <Metric label={paymentSettlementLabels.settlementTotal} value={money(settlement?.economically_settled_amount, invoice.currency)} />
        <Metric label="ยอดคงค้าง" value={money(settlement?.outstanding_amount, invoice.currency)} prominent />
        <div style={metric}><small>สถานะการชำระ</small><StatusBadge status={settlement?.payment_status || "unpaid"} label={settlementStatusLabels[settlement?.payment_status || "unpaid"] || "ยังไม่ชำระ"} /></div>
      </div>
      {currentLinkedPayments.length ? <PaymentLinks title="การจัดสรรยอดรับชำระปัจจุบัน" payments={currentLinkedPayments} effectiveAllocations={effectivePaymentAllocations} rawAllocations={rawPaymentAllocations} reallocations={paymentReallocations} invoiceId={invoice.id} /> : null}
      {historicalLinkedPayments.length ? <PaymentLinks title="ประวัติการจัดสรรที่ไม่ได้ตัดชำระใบแจ้งหนี้นี้แล้ว" payments={historicalLinkedPayments} effectiveAllocations={effectivePaymentAllocations} rawAllocations={rawPaymentAllocations} reallocations={paymentReallocations} invoiceId={invoice.id} historical /> : null}
      {Number(settlement?.outstanding_amount || 0) > 0 && canManagePayments ? <button type="button" style={paymentButton} disabled={creatingPayment} onClick={() => void createPaymentDraft()}>{creatingPayment ? "กำลังเปิดร่างการรับชำระ..." : currentLinkedPayments.some((payment) => payment.status === "draft") ? "เปิดร่างการรับชำระ" : "บันทึกการรับชำระ"}</button> : null}
      {Number(settlement?.outstanding_amount || 0) > 0 && !canManagePayments ? <p style={nextStepNote}>คุณดูสถานะการชำระได้ แต่ไม่มีสิทธิ์สร้างหรือแก้ไขรายการรับชำระ</p> : null}
      {Number(settlement?.outstanding_amount || 0) <= 0 ? <p style={settledNote}>ใบแจ้งหนี้นี้ชำระครบแล้ว จึงไม่สามารถสร้างรายการรับชำระเพิ่มได้</p> : null}
    </section> : null}

    {isDraft ? <>
      <section style={finalActionZone}>
        <span style={finalEyebrow}>ขั้นตอนสุดท้าย</span><h2 style={finalTitle}>ตรวจสอบและออกใบแจ้งหนี้</h2><p style={finalDescription}>เมื่อออกใบแจ้งหนี้แล้ว ระบบจะกำหนดเลขที่ VP-IV และล็อกข้อมูลเอกสารฉบับนี้</p>
        <div className="invoice-final-summary" style={finalSummary}><Metric label="ลูกค้า" value={displayText(invoice.customer_name)} /><Metric label={isV2 ? "ที่มาของยอด" : "งวด"} value={isV2 ? invoiceSourceLabel : `งวดที่ ${installment?.installment_no || "-"}`} /><Metric label="ยอดรวม" value={money(invoice.total_amount, invoice.currency)} prominent /></div>
        {dirty ? <div style={neutralWarning}>มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก กรุณาบันทึกก่อนออกใบแจ้งหนี้</div> : null}
        <button type="button" style={{ ...issueButton, ...(dirty ? disabledButton : {}) }} disabled={dirty || issuing} onClick={openIssueReview}>ออกใบแจ้งหนี้</button>

        {issuePanelOpen ? <div id="invoice-issue-confirmation" style={confirmationPanel}>
          <h3 style={confirmationTitle}>ยืนยันการออกใบแจ้งหนี้</h3>
          <div style={confirmationGrid}><Field label="ลูกค้า" value={displayText(invoice.customer_name)} /><Field label="คดี/งาน" value={matter} /><Field label={isV2 ? "ที่มาของยอด" : "งวด"} value={isV2 ? invoiceSourceLabel : installmentLabel} /><Field label="มูลค่าก่อน VAT" value={money(invoice.amount_before_vat, invoice.currency)} /><Field label="VAT" value={money(invoice.vat_amount, invoice.currency)} /><Field label="ยอดรวม" value={money(invoice.total_amount, invoice.currency)} /><Field label="วันที่ออกเอกสาร" value={form.issueDate || "-"} /><Field label="วันที่ครบกำหนด" value={form.dueDate || "-"} /><Field label="บัญชีสำหรับรับชำระ" value={paymentDestination ? `${displayText(paymentDestination.shortName)} · ${displayText(paymentDestination.accountNumber)}` : "-"} /></div>
          <div style={issueItemsReview}><small style={fieldLabel}>รายการในใบแจ้งหนี้</small>{activeItems.map((item) => <div key={item.id} style={issueItemRow}><span>{item.description}{isV2 ? <small style={itemMeta}>{invoiceItemClassificationLabel(item)}</small> : null}</span><strong>{money(item.line_total, invoice.currency)}</strong></div>)}</div>
          <label style={confirmCheck}><input type="checkbox" checked={issueConfirmed} onChange={(event) => setIssueConfirmed(event.target.checked)} />ยืนยันว่าตรวจสอบข้อมูลใบแจ้งหนี้ครบถ้วนแล้ว และต้องการออกใบแจ้งหนี้ฉบับนี้</label>
          <p style={confirmationHelp}>ระบบจะสร้างเลขที่อย่างเป็นทางการและทำให้เอกสารเป็นแบบอ่านอย่างเดียว การออกใบแจ้งหนี้ไม่ถือว่าได้รับชำระเงิน</p>
          <div style={confirmationActions}><button type="button" style={secondaryButton} disabled={issuing} onClick={() => setIssuePanelOpen(false)}>กลับไปตรวจสอบ</button><button type="button" style={{ ...issueButton, ...(!issueConfirmed ? disabledButton : {}) }} disabled={!issueConfirmed || issuing} onClick={() => void issueInvoice()}>{issuing ? "กำลังออกใบแจ้งหนี้..." : "ยืนยันออกใบแจ้งหนี้"}</button></div>
        </div> : null}
      </section>

      <section style={otherActions}><h2 style={otherActionsTitle}>การดำเนินการอื่น</h2><p style={sectionDescription}>{isV2 ? "การยกเลิกร่างจะคืนรายการต้นทางให้พร้อมสร้างใบแจ้งหนี้ใหม่ และไม่สร้างเลขที่ใบแจ้งหนี้" : "การยกเลิกร่างจะไม่ยกเลิกหลักฐานความพร้อมของงวด และไม่สร้างเลขที่ใบแจ้งหนี้"}</p>{!cancelPanelOpen ? <button type="button" style={dangerOutlineButton} onClick={() => setCancelPanelOpen(true)}>ยกเลิกร่างใบแจ้งหนี้</button> : <div style={cancelPanel}><FormField label="เหตุผลที่ยกเลิกร่าง" required><textarea style={textareaStyle} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></FormField><div style={confirmationActions}><button type="button" style={secondaryButton} disabled={cancelling} onClick={() => { setCancelPanelOpen(false); setCancelReason(""); }}>ไม่ยกเลิก</button><button type="button" style={{ ...dangerButton, ...(!cancelReason.trim() ? disabledButton : {}) }} disabled={!cancelReason.trim() || cancelling} onClick={() => void cancelDraft()}>{cancelling ? "กำลังยกเลิก..." : "ยืนยันยกเลิกร่าง"}</button></div></div>}</section>
    </> : null}

    {isIssued ? <section style={otherActions}>
      <h2 style={otherActionsTitle}>การดำเนินการอื่น</h2>
      <p style={sectionDescription}>การยกเลิกใบแจ้งหนี้เป็นการเก็บเอกสารเดิมไว้เป็นประวัติ และเปิด{isV2 ? "รายการต้นทาง" : "งวดต้นทาง"}ให้สร้างใบแจ้งหนี้ใหม่โดยใช้เลขที่ใหม่</p>
      {activePaymentDraft ? <div style={voidBlockerNotice}><strong>ยังยกเลิกใบแจ้งหนี้ไม่ได้</strong><span>ยังมีร่างการรับชำระที่ยังไม่ได้ยกเลิก กรุณายกเลิกร่างการรับชำระก่อน</span><Link style={blockerLink} href={`/finance/payments/${activePaymentDraft.id}`}>เปิดร่างการรับชำระ</Link></div> : effectiveConfirmedPayment || hasEffectiveSettlement ? <div style={voidBlockerNotice}><strong>ยังยกเลิกใบแจ้งหนี้ไม่ได้</strong><span>ใบแจ้งหนี้นี้มีการรับชำระที่ยังมีผล กรุณาดำเนินการย้อนกลับรายการรับชำระก่อน</span>{effectiveConfirmedPayment ? <Link style={blockerLink} href={`/finance/payments/${effectiveConfirmedPayment.id}`}>เปิดรายการรับชำระ</Link> : null}</div> : null}
      {!voidPanelOpen ? <button type="button" style={{ ...dangerOutlineButton, ...(voidBlockedByPayment ? disabledButton : {}) }} disabled={voidBlockedByPayment} onClick={openVoidPanel}>ยกเลิกใบแจ้งหนี้</button> : <div ref={voidPanelRef} style={voidPanel}>
        <h3 style={voidPanelTitle}>ยืนยันการยกเลิกใบแจ้งหนี้</h3>
        <p style={voidPanelDescription}>ตรวจสอบผลของการยกเลิกและระบุเหตุผลภายในให้ชัดเจนก่อนดำเนินการ</p>
        {Object.keys(voidFormErrors).length ? <div role="alert" style={voidValidationSummary}>กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนยืนยันยกเลิกใบแจ้งหนี้</div> : null}
        <FormField label="เหตุผลในการยกเลิกใบแจ้งหนี้" required error={voidFormErrors.reason}>
          <textarea ref={voidReasonRef} style={{ ...textareaStyle, ...(voidFormErrors.reason ? invalidInputStyle : {}) }} rows={4} maxLength={2000} value={voidReason} disabled={voiding} onChange={(event) => { setVoidReason(event.target.value); setVoidFormErrors((current) => ({ ...current, reason: undefined })); }} />
        </FormField>
        <div style={voidConsequences}>
          <strong>ผลของการยกเลิกใบแจ้งหนี้</strong>
          <ul><li>เลขใบแจ้งหนี้เดิมจะไม่ถูกนำกลับมาใช้</li><li>ใบแจ้งหนี้เดิมจะถูกเก็บไว้เป็นประวัติ</li><li>หากต้องการเรียกเก็บใหม่ ต้องสร้างใบแจ้งหนี้ใหม่</li><li>ไม่สามารถยกเลิกได้หากมีรายการรับชำระที่ยังมีผล</li></ul>
        </div>
        <label style={{ ...voidAcknowledgement, ...(voidFormErrors.acknowledgement ? invalidAcknowledgement : {}) }}><input ref={voidAcknowledgementRef} type="checkbox" checked={voidAcknowledged} disabled={voiding} onChange={(event) => { setVoidAcknowledged(event.target.checked); setVoidFormErrors((current) => ({ ...current, acknowledgement: undefined })); }} /><span>ยืนยันว่าได้ตรวจสอบข้อมูลข้างต้นและเข้าใจผลของการยกเลิกใบแจ้งหนี้</span></label>
        {voidFormErrors.acknowledgement ? <small style={formError}>{voidFormErrors.acknowledgement}</small> : null}
        <div style={confirmationActions}><button type="button" style={secondaryButton} disabled={voiding} onClick={closeVoidPanel}>กลับ</button><button type="button" style={dangerButton} disabled={voiding} onClick={() => void voidInvoice()}>{voiding ? "กำลังยกเลิกใบแจ้งหนี้..." : "ยืนยันยกเลิกใบแจ้งหนี้"}</button></div>
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
function FormField({ label, helper, required = false, error, children }: { label: string; helper?: string; required?: boolean; error?: string; children: ReactNode }) { return <label style={formField}><span style={formLabel}>{label}{required ? <strong style={requiredMark}> *</strong> : null}</span>{children}{helper ? <small style={formHelper}>{helper}</small> : null}{error ? <small style={formError}>{error}</small> : null}</label>; }
function StatusBadge({ status, label }: { status: string; label: string }) { return <span style={{ ...badge, ...(status === "draft" || status === "ready_to_invoice" || status === "partially_settled" ? amberBadge : status === "cancelled" || status === "voided" || status === "unpaid" ? redBadge : greenBadge) }}>{label}</span>; }
function SourceNode({ label, current = false, children }: { label: string; current?: boolean; children: ReactNode }) { return <div style={{ ...sourceNode, ...(current ? currentNode : {}) }}><small style={fieldLabel}>{label}</small><div style={sourceNodeContent}>{children}</div></div>; }
function Arrow() { return <span className="invoice-source-arrow" style={sourceArrow} aria-hidden="true">→</span>; }
function Metric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...metric, ...(prominent ? prominentMetric : {}) }}><small>{label}</small><strong style={metricValue}>{value}</strong></div>; }
function PaymentLinks({ title, payments, effectiveAllocations, rawAllocations, reallocations, invoiceId, historical = false }: { title: string; payments: FinancePayment[]; effectiveAllocations: EffectivePaymentAllocation[]; rawAllocations: InvoicePaymentAllocation[]; reallocations: PaymentAllocationReallocation[]; invoiceId: string; historical?: boolean }) {
  return <div style={{ ...paymentHistory, ...(historical ? historicalPaymentHistory : {}) }}><small style={fieldLabel}>{title}</small>{payments.map((payment) => {
    const effective = effectiveAllocations.find((row) => row.payment_id === payment.id);
    const original = rawAllocations.find((row) => row.payment_id === payment.id);
    const latestMovement = reallocations.find((row) => row.payment_id === payment.id && (row.source_invoice_id === invoiceId || row.target_invoice_id === invoiceId));
    const displayedAmount = effective?.effective_settlement_total ?? original?.settlement_total ?? latestMovement?.settlement_moved ?? 0;
    const amountLabel = effective ? "ยอดที่ตัดชำระใบแจ้งหนี้นี้ในปัจจุบัน" : original ? "ยอดจัดสรรตั้งต้น" : "ยอดจากการเปลี่ยนใบแจ้งหนี้ล่าสุด";
    return <Link key={payment.id} style={{ ...paymentHistoryLink, ...(historical ? historicalPaymentLink : {}) }} href={`/finance/payments/${payment.id}`}><span style={paymentHistoryIdentity}><strong>{paymentStatusLabels[payment.status] || payment.status}</strong><small>{amountLabel}</small></span><strong>{money(displayedAmount, payment.currency)}</strong></Link>;
  })}</div>;
}
function invoiceItemSourceLabel(item: FinanceInvoiceItem) {
  const sourceType = invoiceItemSourceType(item);
  return sourceType === "billing_installment_item" ? "ยอดตามแผนเรียกเก็บเงิน" : "รายการเรียกเก็บเพิ่มเติม";
}
function invoiceItemQuantityLabel(item: FinanceInvoiceItem, currency: string) { if (item.source_quantity === null) return ""; const unit = invoiceItemUnit(item) || "หน่วย"; const price = item.source_unit_price === null ? "" : ` × ${money(item.source_unit_price, currency)}`; return `จำนวน ${Number(item.source_quantity).toLocaleString("th-TH", { maximumFractionDigits: 4 })} ${unit}${price}`; }
function invoiceItemClassificationLabel(item: FinanceInvoiceItem) { return `ประเภทของยอด: ${economicClassificationLabel(invoiceItemEconomicClassification(item))}`; }
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
