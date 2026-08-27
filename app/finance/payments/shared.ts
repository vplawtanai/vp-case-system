export type PaymentStatus = "draft" | "confirmed" | "cancelled" | "reversed";

export type FinancePayment = {
  id: string;
  draft_origin_invoice_id: string | null;
  internal_reference: string | null;
  client_id: string;
  currency: string;
  status: PaymentStatus | string;
  cash_amount: number | string;
  wht_amount: number | string;
  settlement_amount: number | string;
  received_on: string | null;
  payment_method: string | null;
  receiving_bank_account_id: string | null;
  receiving_account_reference: string | null;
  external_transaction_reference: string | null;
  payer_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  reversed_at: string | null;
  reverse_reason: string | null;
};

export type PaymentAllocation = {
  id: string;
  payment_id: string;
  invoice_id: string;
  cash_allocated: number | string;
  wht_credit_allocated: number | string;
  settlement_total: number | string;
};

export type InvoiceSettlement = {
  invoice_id: string;
  invoice_no: string | null;
  invoice_status: string;
  client_id: string;
  currency: string;
  invoice_gross_amount: number | string;
  confirmed_cash_allocated: number | string;
  confirmed_wht_credit_allocated: number | string;
  economically_settled_amount: number | string;
  outstanding_amount: number | string;
  payment_status: "unpaid" | "partially_settled" | "settled" | string;
  is_overdue: boolean;
};

export type PaymentForm = {
  receivedOn: string;
  paymentMethod: string;
  receivingBankAccountId: string;
  receivingAccountReference: string;
  externalTransactionReference: string;
  payerName: string;
  note: string;
  cashAmount: string;
  whtAmount: string;
};

export const paymentStatusLabels: Record<string, string> = {
  draft: "ร่างการรับชำระ",
  confirmed: "ยืนยันรับชำระแล้ว",
  cancelled: "ยกเลิกร่างแล้ว",
  reversed: "กลับรายการแล้ว",
};

export const settlementStatusLabels: Record<string, string> = {
  unpaid: "ยังไม่ชำระ",
  partially_settled: "ชำระบางส่วน",
  settled: "ชำระครบแล้ว",
};

export const paymentMethodLabels: Record<string, string> = {
  bank_transfer: "โอนเงินผ่านธนาคาร",
  cash: "เงินสด",
  cheque: "เช็ค",
  card_or_gateway: "บัตรหรือช่องทางรับชำระ",
  other: "อื่น ๆ",
};

export function paymentForm(payment: FinancePayment): PaymentForm {
  return {
    receivedOn: payment.received_on || "",
    paymentMethod: payment.payment_method || "",
    receivingBankAccountId: payment.receiving_bank_account_id || "",
    receivingAccountReference: payment.receiving_account_reference || "",
    externalTransactionReference: payment.external_transaction_reference || "",
    payerName: payment.payer_name || "",
    note: payment.note || "",
    cashAmount: Number(payment.cash_amount || 0).toFixed(2),
    whtAmount: Number(payment.wht_amount || 0).toFixed(2),
  };
}

export function paymentFingerprint(form: PaymentForm) {
  return JSON.stringify({
    ...form,
    receivingAccountReference: form.receivingAccountReference.trim(),
    externalTransactionReference: form.externalTransactionReference.trim(),
    payerName: form.payerName.trim(),
    note: form.note.trim(),
    cashAmount: normalizedAmount(form.cashAmount),
    whtAmount: normalizedAmount(form.whtAmount),
  });
}

export function normalizedAmount(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;
}

export function hasValidCurrencyPrecision(value: string) {
  return /^\d+(?:\.\d{0,2})?$/.test(value.trim());
}

export function safePaymentError(error: unknown, fallback: string) {
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : "";
  const mappings: Array<[string, string]> = [
    ["Not allowed", "คุณไม่มีสิทธิ์ดำเนินการรับชำระนี้"],
    ["already economically settled", "ใบแจ้งหนี้นี้ชำระครบแล้ว"],
    ["outstanding is already reserved", "ยอดคงค้างนี้มีร่างการรับชำระอื่นจองไว้แล้ว"],
    ["Actual Payment received date is required", "กรุณาระบุวันที่รับชำระจริง"],
    ["cannot be in the future", "วันที่รับชำระจริงต้องไม่เป็นวันในอนาคต"],
    ["Payment method is required", "กรุณาเลือกวิธีรับชำระ"],
    ["Receiving bank account is required", "กรุณาเลือกบัญชีธนาคารที่รับเงิน"],
    ["allocation exceeds", "ยอดจัดสรรเกินยอดคงค้างของใบแจ้งหนี้"],
    ["downstream records", "ไม่สามารถกลับรายการได้ เนื่องจากมีเอกสารขั้นตอนถัดไปแล้ว"],
  ];
  return mappings.find(([needle]) => message.includes(needle))?.[1] || fallback;
}
