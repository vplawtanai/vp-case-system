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

export type EffectivePaymentAllocation = {
  payment_id: string;
  invoice_id: string;
  effective_cash_allocated: number | string;
  effective_wht_credit_allocated: number | string;
  effective_settlement_total: number | string;
};

export type PaymentAllocationReallocation = {
  id: string;
  payment_id: string;
  source_invoice_id: string;
  target_invoice_id: string;
  cash_moved: number | string;
  wht_moved: number | string;
  settlement_moved: number | string;
  reason: string;
  created_at: string;
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

export type PaymentInvoiceTotals = {
  amountBeforeVat: number | string;
  vatAmount: number | string;
  totalAmount: number | string;
};

export type AssistedPaymentAmounts = {
  settlement: number;
  whtBase: number;
  whtAmount: number;
  cashAmount: number;
  reliableBase: boolean;
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

export function derivePaymentWhtBase(settlementValue: string | number, invoice: PaymentInvoiceTotals) {
  const settlement = normalizedAmount(settlementValue);
  const amountBeforeVat = normalizedAmount(invoice.amountBeforeVat);
  const vatAmount = normalizedAmount(invoice.vatAmount);
  const totalAmount = normalizedAmount(invoice.totalAmount);
  const totalsReconcile = Math.abs(normalizedAmount(amountBeforeVat + vatAmount) - totalAmount) <= 0.01;
  if (settlement <= 0 || totalAmount <= 0 || amountBeforeVat < 0 || vatAmount < 0 || !totalsReconcile || settlement > totalAmount + 0.01) {
    return { amount: 0, reliable: false };
  }
  if (vatAmount === 0) return { amount: settlement, reliable: true };
  return { amount: normalizedAmount((settlement * amountBeforeVat) / totalAmount), reliable: true };
}

export function calculateAssistedPaymentAmounts(settlementValue: string | number, rateValue: string | number, invoice: PaymentInvoiceTotals): AssistedPaymentAmounts {
  const settlement = normalizedAmount(settlementValue);
  const rate = Number(rateValue || 0);
  const base = derivePaymentWhtBase(settlement, invoice);
  const whtAmount = base.reliable && Number.isFinite(rate) && rate > 0
    ? Math.min(settlement, normalizedAmount((base.amount * rate) / 100))
    : 0;
  return {
    settlement,
    whtBase: base.amount,
    whtAmount,
    cashAmount: normalizedAmount(settlement - whtAmount),
    reliableBase: base.reliable,
  };
}

export function inferPaymentWhtPreset(settlementValue: string | number, whtValue: string | number, invoice: PaymentInvoiceTotals, presets: readonly number[]) {
  const expectedWht = normalizedAmount(whtValue);
  if (expectedWht <= 0) return null;
  return presets.find((rate) => calculateAssistedPaymentAmounts(settlementValue, rate, invoice).whtAmount === expectedWht) ?? null;
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

export function safePaymentReallocationError(error: unknown) {
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : "";
  const mappings: Array<[string, string]> = [
    ["Not allowed to reallocate", "คุณไม่มีสิทธิ์ย้ายการจัดสรรยอดรับชำระ"],
    ["FINANCE_PAYMENT_REALLOCATION_ACK_REQUIRED", "กรุณายืนยันว่ารายการรับเงินจริงถูกต้องและต้องการเปลี่ยนเฉพาะใบแจ้งหนี้"],
    ["Only a Confirmed Payment", "ย้ายการจัดสรรได้เฉพาะรายการรับชำระที่ยืนยันแล้ว"],
    ["Source and target Invoice must differ", "ใบแจ้งหนี้ต้นทางและปลายทางต้องเป็นคนละฉบับ"],
    ["Payment reallocation reason is required", "กรุณาระบุเหตุผลในการย้ายการจัดสรรยอดรับชำระ"],
    ["Payment reallocation reason is too long", "เหตุผลยาวเกินกำหนด กรุณาใช้ข้อความไม่เกิน 2,000 ตัวอักษร"],
    ["FINANCE_PAYMENT_REALLOCATION_SOURCE_INSUFFICIENT", "ยอดเงินสดหรือเครดิต WHT ที่ย้ายเกินยอดปัจจุบันของใบแจ้งหนี้ต้นทาง"],
    ["FINANCE_PAYMENT_REALLOCATION_CLIENT_MISMATCH", "ใบแจ้งหนี้ปลายทางต้องเป็นของลูกค้ารายเดียวกับรายการรับชำระ"],
    ["FINANCE_PAYMENT_REALLOCATION_CURRENCY_MISMATCH", "ใบแจ้งหนี้ปลายทางต้องใช้สกุลเงินเดียวกับรายการรับชำระ"],
    ["Target Invoice must be Issued", "ใบแจ้งหนี้ปลายทางต้องอยู่ในสถานะออกใบแจ้งหนี้แล้ว"],
    ["FINANCE_PAYMENT_REALLOCATION_TARGET_CAPACITY_EXCEEDED", "ยอดที่ย้ายเกินความสามารถรับชำระของใบแจ้งหนี้ปลายทาง หรือมียอดร่างอื่นจองอยู่"],
    ["FINANCE_PAYMENT_REALLOCATION_REQUEST_CONFLICT", "คำขอนี้มีข้อมูลเปลี่ยนแปลงหลังส่ง กรุณาปิดและเริ่มการย้ายยอดใหม่"],
    ["FINANCE_PAYMENT_REALLOCATION_HAS_DOWNSTREAM_DEPENDENCIES", "ไม่สามารถย้ายยอดได้ เนื่องจากมีเอกสารหรือรายการขั้นตอนถัดไปที่เกี่ยวข้องแล้ว"],
    ["Moved Cash and WHT", "กรุณาระบุเงินสดและเครดิต WHT ที่ย้ายเป็นจำนวนตั้งแต่ 0 ขึ้นไป และยอดรวมต้องมากกว่า 0"],
    ["Payment, source Invoice, and target Invoice are required", "กรุณาเลือกใบแจ้งหนี้ต้นทางและปลายทางให้ครบถ้วน"],
    ["Source Invoice not found", "ไม่พบใบแจ้งหนี้ต้นทาง กรุณารีเฟรชและลองใหม่"],
    ["Target Invoice not found", "ไม่พบใบแจ้งหนี้ปลายทาง กรุณารีเฟรชและลองใหม่"],
  ];
  return mappings.find(([needle]) => message.includes(needle))?.[1]
    || "ย้ายการจัดสรรยอดรับชำระไม่สำเร็จ กรุณารีเฟรชและลองใหม่";
}
