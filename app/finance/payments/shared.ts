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
  wht_calculation_mode?: "none" | "rate" | null;
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

export type PaymentWhtRateOption = "" | "1" | "2" | "3" | "5" | "10" | "custom";

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

export const paymentSettlementLabels = {
  receivedFull: "เงินที่ได้รับจริง",
  receivedCompact: "เงินรับจริง",
  whtCredit: "เครดิตภาษีหัก ณ ที่จ่าย",
  settlementTotal: "ยอดตัดชำระรวม",
} as const;

export const paymentCorrectionCopy = {
  sectionTitle: "แก้ไขหลังยืนยัน",
  wrongInvoiceTitle: "เลือกใบแจ้งหนี้ผิด",
  wrongInvoiceDescription: "ยอดเงิน วันที่ วิธีรับ และบัญชีรับเงินถูกต้อง แต่ต้องการเปลี่ยนใบแจ้งหนี้ที่ใช้ตัดชำระ",
  allocationHeading: "แก้ไขใบแจ้งหนี้ที่ตัดชำระ",
  allocationHelper: "ใช้เมื่อยอดเงิน วันที่ วิธีรับชำระ และบัญชีรับเงินถูกต้อง แต่เลือกใบแจ้งหนี้ที่นำยอดไปตัดชำระผิด การแก้ไขนี้ไม่ย้ายเงินจริงระหว่างบัญชี",
  allocationAction: "เปลี่ยนใบแจ้งหนี้ที่ตัดชำระ",
  allocationHistory: "ประวัติการเปลี่ยนใบแจ้งหนี้ที่ตัดชำระ",
  wrongPaymentTitle: "ข้อมูลรับชำระผิด",
  wrongPaymentDescription: "ใช้เมื่อยอดรับชำระ วันที่ วิธีรับชำระ บัญชีรับเงิน หรือข้อมูลการรับชำระถูกบันทึกผิด",
  paymentCorrectionAction: "แก้ไขรายการรับชำระที่บันทึกผิด",
} as const;

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
    ["WHT_LEGACY_RECALCULATION_REQUIRED", "ข้อมูล WHT เดิมยังไม่มีฐานและอัตราที่บันทึกไว้ กรุณาเลือกคำนวณ WHT ใหม่และบันทึกก่อนยืนยัน"],
    ["WHT_COMPONENT_SCOPE_UNSUPPORTED", "รายการหลายบรรทัดหรือหลายใบแจ้งหนี้ยังไม่มีข้อมูลกำหนดฐาน WHT ที่ปลอดภัย"],
    ["WHT_PARTIAL_SCOPE_UNSUPPORTED", "ยังไม่รองรับการกำหนดฐาน WHT สำหรับยอดรับชำระบางส่วน หรือมีรายการอื่นจองยอดใบแจ้งหนี้นี้อยู่"],
    ["WHT_SNAPSHOT_INVALID", "หลักฐานภาษีของใบแจ้งหนี้ไม่ครบถ้วน กรุณาให้ผู้ดูแลตรวจสอบ"],
    ["WHT_CALCULATION_MISMATCH", "ฐาน อัตรา หรือยอด WHT ไม่ตรงกับหลักฐานใบแจ้งหนี้ กรุณาคำนวณใหม่และบันทึก"],
    ["WHT_RATE_REQUIRED", "กรุณาเลือกอัตราหัก ณ ที่จ่ายที่ถูกต้องก่อนบันทึก"],
    ["WHT_SAVE_BEFORE_CONFIRM", "กรุณาบันทึกข้อมูล WHT ก่อนยืนยันรับชำระ"],
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
    ["WHT_REALLOCATION_REQUIRES_COMPONENT_WORKFLOW", "รายการนี้มีหลักฐาน WHT ผูกกับรายการเดิม ต้องใช้กระบวนการแก้ไขฐาน WHT ซึ่งยังไม่เปิดใช้งาน"],
    ["Not allowed to reallocate", "คุณไม่มีสิทธิ์เปลี่ยนใบแจ้งหนี้ที่ตัดชำระ"],
    ["FINANCE_PAYMENT_REALLOCATION_ACK_REQUIRED", "กรุณายืนยันว่ารายการรับเงินจริงถูกต้องและต้องการเปลี่ยนเฉพาะใบแจ้งหนี้"],
    ["Only a Confirmed Payment", "เปลี่ยนใบแจ้งหนี้ที่ตัดชำระได้เฉพาะรายการรับชำระที่ยืนยันแล้ว"],
    ["Source and target Invoice must differ", "ใบแจ้งหนี้ปัจจุบันและใบแจ้งหนี้ใหม่ต้องเป็นคนละฉบับ"],
    ["Payment reallocation reason is required", "กรุณาระบุเหตุผลในการเปลี่ยนใบแจ้งหนี้ที่ตัดชำระ"],
    ["Payment reallocation reason is too long", "เหตุผลยาวเกินกำหนด กรุณาใช้ข้อความไม่เกิน 2,000 ตัวอักษร"],
    ["FINANCE_PAYMENT_REALLOCATION_SOURCE_INSUFFICIENT", "ยอดเงินรับจริงหรือเครดิต WHT ที่เปลี่ยนการจัดสรรเกินยอดปัจจุบันของใบแจ้งหนี้"],
    ["FINANCE_PAYMENT_REALLOCATION_CLIENT_MISMATCH", "ใบแจ้งหนี้ที่รับยอดต้องเป็นของลูกค้ารายเดียวกับรายการรับชำระ"],
    ["FINANCE_PAYMENT_REALLOCATION_CURRENCY_MISMATCH", "ใบแจ้งหนี้ที่รับยอดต้องใช้สกุลเงินเดียวกับรายการรับชำระ"],
    ["Target Invoice must be Issued", "ใบแจ้งหนี้ที่รับยอดต้องอยู่ในสถานะออกใบแจ้งหนี้แล้ว"],
    ["FINANCE_PAYMENT_REALLOCATION_TARGET_CAPACITY_EXCEEDED", "ยอดที่เปลี่ยนการจัดสรรเกินยอดคงค้างที่ใบแจ้งหนี้ใหม่รับได้ หรือมียอดร่างอื่นจองอยู่"],
    ["FINANCE_PAYMENT_REALLOCATION_REQUEST_CONFLICT", "คำขอนี้มีข้อมูลเปลี่ยนแปลงหลังส่ง กรุณาปิดและเริ่มเปลี่ยนใบแจ้งหนี้ใหม่"],
    ["FINANCE_PAYMENT_REALLOCATION_HAS_DOWNSTREAM_DEPENDENCIES", "ไม่สามารถเปลี่ยนใบแจ้งหนี้ที่ตัดชำระได้ เนื่องจากมีเอกสารหรือรายการขั้นตอนถัดไปที่เกี่ยวข้องแล้ว"],
    ["Moved Cash and WHT", "กรุณาระบุส่วนเงินรับจริงและเครดิต WHT ที่ต้องการเปลี่ยนการจัดสรรเป็นจำนวนตั้งแต่ 0 ขึ้นไป และยอดรวมต้องมากกว่า 0"],
    ["Payment, source Invoice, and target Invoice are required", "กรุณาเลือกใบแจ้งหนี้ปัจจุบันและใบแจ้งหนี้ใหม่ให้ครบถ้วน"],
    ["Source Invoice not found", "ไม่พบใบแจ้งหนี้ปัจจุบัน กรุณารีเฟรชและลองใหม่"],
    ["Target Invoice not found", "ไม่พบใบแจ้งหนี้ที่รับยอด กรุณารีเฟรชและลองใหม่"],
  ];
  return mappings.find(([needle]) => message.includes(needle))?.[1]
    || "เปลี่ยนใบแจ้งหนี้ที่ตัดชำระไม่สำเร็จ กรุณารีเฟรชและลองใหม่";
}
