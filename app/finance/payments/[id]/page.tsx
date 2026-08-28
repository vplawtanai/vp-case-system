"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";
import { bangkokToday, displayText, formatBangkokDateTime, formatDocumentDate, money } from "../../invoices/shared";
import {
  hasValidCurrencyPrecision,
  normalizedAmount,
  paymentFingerprint,
  paymentForm,
  paymentMethodLabels,
  paymentStatusLabels,
  safePaymentError,
  settlementStatusLabels,
  type FinancePayment,
  type InvoiceSettlement,
  type PaymentAllocation,
  type PaymentForm,
} from "../shared";

type PaymentAccess = {
  canManage: boolean;
  canConfirm: boolean;
  canReverse: boolean;
};
type InvoiceContext = { id: string; invoice_no: string | null; customer_name: string | null; currency: string; total_amount: number | string; document_status: string };
type BankAccount = { id: string; short_name: string | null; bank_name: string | null; account_name: string | null; account_number: string | null; is_active: boolean };
type FormErrors = Partial<Record<"receivedOn" | "paymentMethod" | "bankAccount" | "cashAmount" | "whtAmount" | "allocation" | "confirmation", string>>;

const paymentSelect = "id,draft_origin_invoice_id,internal_reference,client_id,currency,status,cash_amount,wht_amount,settlement_amount,received_on,payment_method,receiving_bank_account_id,receiving_account_reference,external_transaction_reference,payer_name,note,created_at,updated_at,confirmed_at,cancelled_at,cancel_reason,reversed_at,reverse_reason";
const allocationSelect = "id,payment_id,invoice_id,cash_allocated,wht_credit_allocated,settlement_total";

export default function PaymentDetailPage() {
  return <QuotationGuard>{(access) => <PaymentWorkspace access={{ canManage: access.permissions.canManageFinancePayments, canConfirm: access.permissions.canConfirmFinancePayments, canReverse: access.permissions.canReverseFinancePayments }} />}</QuotationGuard>;
}

function PaymentWorkspace({ access }: { access: PaymentAccess }) {
  const { id } = useParams<{ id: string }>();
  const [payment, setPayment] = useState<FinancePayment | null>(null);
  const [allocation, setAllocation] = useState<PaymentAllocation | null>(null);
  const [invoice, setInvoice] = useState<InvoiceContext | null>(null);
  const [settlement, setSettlement] = useState<InvoiceSettlement | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [form, setForm] = useState<PaymentForm>({ receivedOn: "", paymentMethod: "", receivingBankAccountId: "", receivingAccountReference: "", externalTransactionReference: "", payerName: "", note: "", cashAmount: "0.00", whtAmount: "0.00" });
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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const actionLock = useRef(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const paymentResult = await supabase.from("finance_payments").select(paymentSelect).eq("id", id).maybeSingle();
    if (paymentResult.error || !paymentResult.data) {
      console.error("Failed to load Payment", paymentResult.error);
      setError(paymentResult.error ? "ไม่สามารถโหลดข้อมูลการรับชำระได้" : "ไม่พบข้อมูลการรับชำระ");
      setLoading(false);
      return;
    }
    const paymentRow = paymentResult.data as FinancePayment;
    const allocationsResult = await supabase.from("finance_payment_invoice_allocations").select(allocationSelect).eq("payment_id", id).order("created_at");
    if (allocationsResult.error || !allocationsResult.data?.length) {
      console.error("Failed to load Payment allocation", allocationsResult.error);
      setError("ไม่สามารถโหลดการจัดสรรยอดรับชำระได้");
      setLoading(false);
      return;
    }
    const allocationRow = allocationsResult.data[0] as PaymentAllocation;
    const [invoiceResult, settlementResult, bankResult] = await Promise.all([
      supabase.from("finance_invoices").select("id,invoice_no,customer_name,currency,total_amount,document_status").eq("id", allocationRow.invoice_id).maybeSingle(),
      supabase.from("finance_invoice_settlement_summary").select("*").eq("invoice_id", allocationRow.invoice_id).maybeSingle(),
      supabase.from("finance_bank_accounts").select("id,short_name,bank_name,account_name,account_number,is_active").order("short_name"),
    ]);
    if (invoiceResult.error || settlementResult.error || bankResult.error) {
      console.error("Failed to load Payment context", { invoice: invoiceResult.error, settlement: settlementResult.error, bank: bankResult.error });
      setError("โหลดข้อมูลใบแจ้งหนี้หรือบัญชีรับเงินไม่สำเร็จ");
    }
    const nextForm = paymentForm(paymentRow);
    setPayment(paymentRow);
    setAllocation(allocationRow);
    setInvoice((invoiceResult.data || null) as InvoiceContext | null);
    setSettlement((settlementResult.data || null) as InvoiceSettlement | null);
    setBankAccounts((bankResult.data || []) as BankAccount[]);
    setForm(nextForm);
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
  const cash = normalizedAmount(form.cashAmount);
  const wht = normalizedAmount(form.whtAmount);
  const paymentSettlement = normalizedAmount(cash + wht);
  const currentAllocation = normalizedAmount(allocation?.settlement_total);
  const authoritativeOutstanding = normalizedAmount(settlement?.outstanding_amount);
  const outstandingBefore = payment?.status === "confirmed" ? authoritativeOutstanding + currentAllocation : authoritativeOutstanding;
  const expectedOutstanding = Math.max(0, outstandingBefore - paymentSettlement);
  const draftReceivingBankAccount = bankAccounts.find((account) => account.id === form.receivingBankAccountId) || null;
  const savedReceivingBankAccount = bankAccounts.find((account) => account.id === payment?.receiving_bank_account_id) || null;

  const updateForm = <Key extends keyof PaymentForm>(key: Key, value: PaymentForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    const errorKey = key === "receivedOn" ? "receivedOn" : key === "paymentMethod" ? "paymentMethod" : key === "receivingBankAccountId" ? "bankAccount" : key === "cashAmount" ? "cashAmount" : key === "whtAmount" ? "whtAmount" : null;
    if (errorKey) setErrors((current) => ({ ...current, [errorKey]: undefined, allocation: undefined }));
    setMessage("");
  };

  const validate = (forConfirmation: boolean) => {
    const next: FormErrors = {};
    if (!hasValidCurrencyPrecision(form.cashAmount) || cash < 0) next.cashAmount = "กรุณาระบุยอดเงินสดตั้งแต่ 0 ขึ้นไป และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
    if (!hasValidCurrencyPrecision(form.whtAmount) || wht < 0) next.whtAmount = "กรุณาระบุเครดิตภาษีหัก ณ ที่จ่ายตั้งแต่ 0 ขึ้นไป และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
    if (paymentSettlement <= 0) next.allocation = "ยอดรับชำระรวมต้องมากกว่า 0";
    if (paymentSettlement > outstandingBefore) next.allocation = "ยอดจัดสรรเกินยอดคงค้างก่อนการรับชำระครั้งนี้";
    if (forConfirmation && !form.receivedOn) next.receivedOn = "กรุณาระบุวันที่รับชำระจริง";
    if (forConfirmation && form.receivedOn > bangkokToday()) next.receivedOn = "วันที่รับชำระจริงต้องไม่เป็นวันในอนาคต";
    if (forConfirmation && !form.paymentMethod) next.paymentMethod = "กรุณาเลือกวิธีรับชำระ";
    if (forConfirmation && form.paymentMethod === "bank_transfer" && !form.receivingBankAccountId) next.bankAccount = "กรุณาเลือกบัญชีธนาคารที่รับเงิน";
    setErrors(next);
    if (Object.keys(next).length) requestAnimationFrame(() => { firstInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); firstInputRef.current?.focus(); });
    return Object.keys(next).length === 0;
  };

  const allocationPayload = () => [{ invoice_id: allocation?.invoice_id, cash_allocated: cash, wht_credit_allocated: wht }];

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

  if (loading) return <main style={page}>กำลังโหลดข้อมูลการรับชำระ...</main>;
  if (!payment || !allocation || !invoice) return <main style={page}>{error || "ไม่พบข้อมูลการรับชำระ"}</main>;

  return <main className="payment-workspace" style={page}>
    <nav style={navigationToolbar}><Link style={navigationLink} href={`/finance/invoices/${invoice.id}`}>← กลับไปใบแจ้งหนี้ {displayText(invoice.invoice_no)}</Link></nav>
    {error ? <div role="alert" style={errorNotice}>{error}</div> : null}
    {message ? <div role="status" style={successNotice}>{message}</div> : null}

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
      <SectionHeading title="ใบแจ้งหนี้ต้นทาง" description="ตรวจสอบบริบทและยอดคงค้างก่อนบันทึกการรับชำระ" />
      <div style={contextGrid}><Field label="ใบแจ้งหนี้" value={<Link href={`/finance/invoices/${invoice.id}`}>{displayText(invoice.invoice_no)}</Link>} /><Field label="ลูกค้า" value={displayText(invoice.customer_name)} /><Field label="ยอดใบแจ้งหนี้" value={money(settlement?.invoice_gross_amount ?? invoice.total_amount, invoice.currency)} /><Field label="รับชำระยืนยันแล้วก่อนรายการนี้" value={money(payment.status === "confirmed" ? normalizedAmount(settlement?.economically_settled_amount) - currentAllocation : settlement?.economically_settled_amount, invoice.currency)} /><Field label="ยอดคงค้างก่อนรายการนี้" value={money(outstandingBefore, invoice.currency)} /><Field label="สถานะการชำระปัจจุบัน" value={settlementStatusLabels[settlement?.payment_status || "unpaid"] || "ยังไม่ชำระ"} /><Field label="สกุลเงิน" value={invoice.currency} /></div>
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
        <SectionHeading title="ยอดรับชำระและการจัดสรร" description="ยอดเงินสดรับ + เครดิตภาษีหัก ณ ที่จ่าย = ยอดชำระของใบแจ้งหนี้" />
        <div style={amountGrid}>
          <FormField label="เงินสดที่ได้รับ" required error={errors.cashAmount}><input style={inputStyle(Boolean(errors.cashAmount))} type="number" min="0" step="0.01" value={form.cashAmount} disabled={!access.canManage || saving} onChange={(event) => updateForm("cashAmount", event.target.value)} /></FormField>
          <FormField label="เครดิตภาษีหัก ณ ที่จ่าย" helper="ไม่ใช่เงินสดรับ และไม่ใช่อัตราที่ระบบกำหนดให้อัตโนมัติ" required error={errors.whtAmount}><input style={inputStyle(Boolean(errors.whtAmount))} type="number" min="0" step="0.01" value={form.whtAmount} disabled={!access.canManage || saving} onChange={(event) => updateForm("whtAmount", event.target.value)} /></FormField>
          <Metric label="ยอดรับชำระรวม" value={money(paymentSettlement, payment.currency)} prominent />
        </div>
        <div className="payment-allocation-card" style={allocationCard}><div><small style={fieldLabel}>จัดสรรไปยังใบแจ้งหนี้</small><strong>{displayText(invoice.invoice_no)}</strong></div><span>เงินสด {money(cash, payment.currency)}</span><span>WHT {money(wht, payment.currency)}</span><strong>รวม {money(paymentSettlement, payment.currency)}</strong></div>
        {errors.allocation ? <div role="alert" style={inlineError}>{errors.allocation}</div> : null}
        {access.canManage ? <div style={saveRow}><span style={dirty ? unsavedState : savedState}>{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "บันทึกแล้ว"}</span><button type="button" style={{ ...secondaryButton, ...(!dirty ? disabledButton : {}) }} disabled={!dirty || saving} onClick={() => void saveDraft()}>{saving ? "กำลังบันทึก..." : dirty ? "บันทึกการเปลี่ยนแปลง" : "บันทึกแล้ว"}</button></div> : null}
      </section>

      <section ref={reviewRef} style={reviewZone}>
        <span style={eyebrow}>ตรวจสอบขั้นสุดท้าย</span><h2 style={reviewTitle}>ตรวจสอบก่อนยืนยันรับชำระ</h2><p style={sectionDescription}>ตรวจสอบหลักฐาน วันที่ วิธีรับชำระ และยอดจัดสรรให้ครบถ้วนก่อนยืนยัน</p>
        <div style={reviewGroups}>
          <div style={reviewGroup}><h3 style={reviewGroupTitle}>ข้อมูลรายการ</h3><div style={reviewGrid}><Field label="ใบแจ้งหนี้" value={displayText(invoice.invoice_no)} /><Field label="วันที่รับชำระจริง" value={form.receivedOn ? formatDocumentDate(form.receivedOn, "th") : "ยังไม่ระบุ"} /><Field label="วิธีรับชำระ" value={paymentMethodLabels[form.paymentMethod] || "ยังไม่ระบุ"} /><Field label="บัญชีที่รับเงินจริง" value={<BankAccountIdentity account={draftReceivingBankAccount} paymentMethod={form.paymentMethod} />} />{form.payerName.trim() ? <Field label="ชื่อผู้ชำระ" value={form.payerName.trim()} /> : null}{form.externalTransactionReference.trim() ? <Field label="เลขอ้างอิงรายการรับชำระ" value={form.externalTransactionReference.trim()} /> : null}{form.receivingAccountReference.trim() ? <Field label="รายละเอียดบัญชี/ช่องทางรับเงิน" value={form.receivingAccountReference.trim()} /> : null}{form.note.trim() ? <Field label="หมายเหตุ" value={form.note.trim()} /> : null}</div></div>
          <div style={reviewGroup}><h3 style={reviewGroupTitle}>ยอดเงิน</h3><div style={reviewGrid}><Field label="เงินสดที่ได้รับ" value={money(cash, payment.currency)} /><Field label="เครดิตภาษีหัก ณ ที่จ่าย" value={money(wht, payment.currency)} /><Field label="ยอดรับชำระรวม" value={<strong>{money(paymentSettlement, payment.currency)}</strong>} /></div></div>
          <div style={reviewGroup}><h3 style={reviewGroupTitle}>การจัดสรร</h3><div style={reviewGrid}><Field label="จัดสรร" value={`${displayText(invoice.invoice_no)} · ${money(paymentSettlement, payment.currency)}`} /><Field label="คาดว่ายอดคงค้างหลังยืนยัน" value={<strong>{money(expectedOutstanding, payment.currency)}</strong>} /></div></div>
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
          <div style={readOnlyGroup}><h3 style={readOnlyGroupTitle}>ข้อมูลรายการ</h3><div style={readOnlyGrid}><Field label="สถานะ" value={<StatusBadge status={payment.status}>{paymentStatusLabels[payment.status] || payment.status}</StatusBadge>} /><Field label="ใบแจ้งหนี้" value={<Link href={`/finance/invoices/${invoice.id}`}>{displayText(invoice.invoice_no)}</Link>} /><Field label="วันที่รับชำระจริง" value={payment.received_on ? formatDocumentDate(payment.received_on, "th") : "ไม่ระบุ"} /><Field label="วิธีรับชำระ" value={paymentMethodLabels[payment.payment_method || ""] || "ไม่ระบุ"} /><Field label="บัญชีที่รับเงินจริง" value={<BankAccountIdentity account={savedReceivingBankAccount} paymentMethod={payment.payment_method || ""} />} />{payment.payer_name?.trim() ? <Field label="ชื่อผู้ชำระ" value={payment.payer_name.trim()} /> : null}{payment.external_transaction_reference?.trim() ? <Field label="เลขอ้างอิงรายการรับชำระ" value={payment.external_transaction_reference.trim()} /> : null}{payment.receiving_account_reference?.trim() ? <Field label="รายละเอียดบัญชี/ช่องทางรับเงิน" value={payment.receiving_account_reference.trim()} /> : null}{payment.note?.trim() ? <Field label="หมายเหตุ" value={payment.note.trim()} /> : null}</div></div>
          <div style={readOnlyGroup}><h3 style={readOnlyGroupTitle}>ยอดเงินและการจัดสรร</h3><div style={summaryGrid}><Metric label="เงินสดที่ได้รับ" value={money(payment.cash_amount, payment.currency)} /><Metric label="เครดิตภาษีหัก ณ ที่จ่าย" value={money(payment.wht_amount, payment.currency)} /><Metric label="ยอดรับชำระรวม" value={money(payment.settlement_amount, payment.currency)} prominent /><Metric label="ยอดคงค้างปัจจุบัน" value={money(settlement?.outstanding_amount, payment.currency)} /></div><div style={confirmedAllocation}><Field label="จัดสรร" value={`${displayText(invoice.invoice_no)} · ${money(allocation.settlement_total, payment.currency)}`} /></div></div>
        </div>
        {payment.status === "confirmed" ? <div style={nextStepNotice}>การรับชำระถูกบันทึกแล้ว เอกสารใบเสร็จ/ใบกำกับภาษียังเป็นขั้นตอนถัดไป</div> : null}
      </section>
    </>}

    {(payment.status === "draft" && access.canManage) || (payment.status === "confirmed" && access.canReverse) ? <section style={otherActions}>
      <h2 style={otherTitle}>การดำเนินการอื่น</h2><p style={sectionDescription}>{payment.status === "draft" ? "ยกเลิกร่างเมื่อไม่ต้องการใช้รายการรับชำระนี้" : "การกลับรายการใช้เฉพาะเมื่อพบว่ารายการรับชำระที่ยืนยันแล้วไม่ถูกต้อง"}</p>
      {!exceptionMode ? <button type="button" style={dangerOutlineButton} onClick={() => setExceptionMode(payment.status === "draft" ? "cancel" : "reverse")}>{payment.status === "draft" ? "ยกเลิกร่างการรับชำระ" : "กลับรายการรับชำระ"}</button> : <div style={exceptionPanel}><FormField label={exceptionMode === "cancel" ? "เหตุผลที่ยกเลิกร่าง" : "เหตุผลที่กลับรายการ"} required><textarea style={textareaStyle} rows={3} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} /></FormField><div style={actionRow}><button type="button" style={secondaryButton} disabled={processingException} onClick={() => { setExceptionMode(null); setExceptionReason(""); }}>ไม่ดำเนินการ</button><button type="button" style={{ ...dangerButton, ...(!exceptionReason.trim() ? disabledButton : {}) }} disabled={!exceptionReason.trim() || processingException} onClick={() => void runException()}>{processingException ? "กำลังดำเนินการ..." : exceptionMode === "cancel" ? "ยืนยันยกเลิกร่าง" : "ยืนยันกลับรายการ"}</button></div></div>}
    </section> : null}

    <style jsx global>{`
      @media (max-width: 720px) {
        .payment-workspace { padding: 14px !important; }
        .payment-header { grid-template-columns: minmax(0, 1fr) !important; }
        .payment-allocation-card { grid-template-columns: minmax(0, 1fr) !important; gap: 7px !important; }
      }
    `}</style>
  </main>;
}

function SectionHeading({ title, description }: { title: string; description: string }) { return <div style={{ marginBottom: 16 }}><h2 style={sectionTitle}>{title}</h2><p style={sectionDescription}>{description}</p></div>; }
function Field({ label, value }: { label: string; value: ReactNode }) { return <div style={{ minWidth: 0 }}><small style={fieldLabel}>{label}</small><div style={fieldValue}>{value}</div></div>; }
function FormField({ label, helper, required = false, error, children }: { label: string; helper?: string; required?: boolean; error?: string; children: ReactNode }) { return <label style={formField}><span style={formLabel}>{label}{required ? <strong style={{ color: "#b91c1c" }}> *</strong> : null}</span>{children}{helper ? <small style={helperText}>{helper}</small> : null}{error ? <small style={formError}>{error}</small> : null}</label>; }
function Metric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...metric, ...(prominent ? prominentMetric : {}) }}><small>{label}</small><strong style={metricValue}>{value}</strong></div>; }
function StatusBadge({ status, children }: { status: string; children: ReactNode }) { return <span style={{ ...badge, ...(status === "draft" ? amberBadge : status === "confirmed" ? greenBadge : redBadge) }}>{children}</span>; }
function BankAccountIdentity({ account, paymentMethod }: { account: BankAccount | null; paymentMethod: string }) { if (!account) return <span>{paymentMethod === "bank_transfer" ? "ยังไม่ระบุ" : "ไม่ใช้บัญชีธนาคารสำหรับวิธีรับชำระนี้"}</span>; return <div style={bankAccountIdentity}><strong>{displayText(account.short_name)} — {displayText(account.bank_name)}</strong>{account.account_number ? <span style={bankAccountDetail}>{account.account_number}{account.account_name ? ` · ${account.account_name}` : ""}</span> : null}</div>; }

const page: CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: 24, color: "#172033" };
const surface: CSSProperties = { marginBottom: 18, padding: 20, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" };
const headerSurface: CSSProperties = { padding: 0, overflow: "hidden" };
const identityHeader: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 24, padding: 22 };
const navigationToolbar: CSSProperties = { display: "flex", marginBottom: 18, padding: 8, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" };
const navigationLink: CSSProperties = { display: "inline-flex", minHeight: 38, alignItems: "center", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", fontWeight: 700, textDecoration: "none" };
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
const textareaStyle: CSSProperties = { ...inputStyle(false), minHeight: 90, resize: "vertical" };
const amountGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 };
const metric: CSSProperties = { display: "grid", gap: 5, minWidth: 0, padding: 13, border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b" };
const prominentMetric: CSSProperties = { borderColor: "#86efac", background: "#f0fdf4", color: "#166534" };
const metricValue: CSSProperties = { color: "#172033", fontSize: 17, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" };
const allocationCard: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px,1fr) repeat(3,max-content)", alignItems: "center", gap: 18, marginTop: 16, padding: 14, border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", fontVariantNumeric: "tabular-nums" };
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
const confirmedAllocation: CSSProperties = { marginTop: 12, padding: 13, border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc" };
const bankAccountIdentity: CSSProperties = { display: "grid", gap: 3, minWidth: 0 };
const bankAccountDetail: CSSProperties = { color: "#64748b", fontSize: 12 };
const nextStepNotice: CSSProperties = { marginTop: 16, padding: 13, border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", color: "#1e40af" };
const otherActions: CSSProperties = { marginBottom: 18, padding: 20, border: "1px solid #fecaca", borderRadius: 8, background: "#fff" };
const otherTitle: CSSProperties = { margin: 0, color: "#7f1d1d", fontSize: 16 };
const dangerOutlineButton: CSSProperties = { ...secondaryButton, marginTop: 12, borderColor: "#fca5a5", color: "#b91c1c" };
const dangerButton: CSSProperties = { ...primaryButton, borderColor: "#b91c1c", background: "#b91c1c" };
const exceptionPanel: CSSProperties = { marginTop: 14, padding: 14, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2" };
const errorNotice: CSSProperties = { marginBottom: 14, padding: 13, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2", color: "#b91c1c" };
const successNotice: CSSProperties = { marginBottom: 14, padding: 13, border: "1px solid #bbf7d0", borderRadius: 6, background: "#f0fdf4", color: "#166534" };
const badge: CSSProperties = { display: "inline-block", width: "fit-content", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
const amberBadge: CSSProperties = { background: "#fef3c7", color: "#92400e" };
const greenBadge: CSSProperties = { background: "#dcfce7", color: "#166534" };
const redBadge: CSSProperties = { background: "#fee2e2", color: "#b91c1c" };
