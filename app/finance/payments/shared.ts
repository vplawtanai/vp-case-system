import { translate, resolveUiMessage } from "../../../lib/i18n/catalog";
import { isUiMessage, uiMessage, type UiLocale, type UiMessage } from "../../../lib/i18n/core";
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
  wht_calculation_mode?: "none" | "rate" | "line_review" | null;
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
  draft: translate("th", "finance.payment.ui.draftTitle"),
  confirmed: translate("th", "finance.payment.ui.confirmed"),
  cancelled: translate("th", "finance.taxInvoice.ui.statusCancelled"),
  reversed: translate("th", "status.reversed"),
};

export const settlementStatusLabels: Record<string, string> = {
  unpaid: translate("th", "status.unpaid"),
  partially_settled: translate("th", "status.partiallySettled"),
  settled: translate("th", "status.settled"),
};

export const paymentMethodLabels: Record<string, string> = {
  bank_transfer: translate("th", "finance.payment.method.bankTransfer"),
  cash: translate("th", "finance.payment.method.cash"),
  cheque: translate("th", "finance.payment.method.cheque"),
  card_or_gateway: translate("th", "finance.payment.method.cardGateway"),
  other: translate("th", "finance.payment.method.other"),
};

export const paymentSettlementLabels = {
  receivedFull: translate("th", "finance.taxInvoice.ui.actualReceived"),
  receivedCompact: translate("th", "finance.payment.settlement.receivedCompact"),
  whtCredit: translate("th", "finance.payment.settlement.whtCredit"),
  settlementTotal: translate("th", "finance.payment.settlement.settlementTotal"),
} as const;

export const paymentCorrectionCopy = {
  sectionTitle: translate("th", "finance.payment.correction.sectionTitle"),
  wrongInvoiceTitle: translate("th", "finance.payment.correction.wrongInvoiceTitle"),
  wrongInvoiceDescription: translate("th", "finance.payment.correction.wrongInvoiceDescription"),
  allocationHeading: translate("th", "finance.payment.correction.allocationHeading"),
  allocationHelper: translate("th", "finance.payment.correction.allocationHelper"),
  allocationAction: translate("th", "finance.payment.ui.changeInvoice"),
  allocationHistory: translate("th", "finance.payment.correction.allocationHistory"),
  wrongPaymentTitle: translate("th", "finance.payment.correction.wrongPaymentTitle"),
  wrongPaymentDescription: translate("th", "finance.payment.correction.wrongPaymentDescription"),
  paymentCorrectionAction: translate("th", "finance.payment.correction.paymentCorrectionAction"),
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

export function paymentUiLabels(locale: UiLocale = "th") {
  return {
    statuses: { draft: translate(locale, "finance.payment.ui.draftTitle"), confirmed: translate(locale, "finance.payment.ui.confirmed"), cancelled: translate(locale, "finance.taxInvoice.ui.statusCancelled"), reversed: translate(locale, "status.reversed") } as Record<string, string>,
    settlementStatuses: { unpaid: translate(locale, "status.unpaid"), partially_settled: translate(locale, "status.partiallySettled"), settled: translate(locale, "status.settled") } as Record<string, string>,
    methods: Object.fromEntries(Object.entries({ bank_transfer: "bankTransfer", cash: "cash", cheque: "cheque", card_or_gateway: "cardGateway", other: "other" }).map(([code, key]) => [code, translate(locale, `finance.payment.method.${key}`)])),
    settlement: Object.fromEntries(Object.keys(paymentSettlementLabels).map(key => [key, translate(locale, `finance.payment.settlement.${key}`)])) as Record<keyof typeof paymentSettlementLabels, string>,
    correction: Object.fromEntries(Object.keys(paymentCorrectionCopy).map(key => [key, translate(locale, `finance.payment.correction.${key}`)])) as Record<keyof typeof paymentCorrectionCopy, string>,
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

export function paymentErrorMessage(error: unknown, fallback: UiMessage | string): UiMessage | string {
  if (isUiMessage(error)) return error;
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : "";
  const mappings: Array<[string, string]> = [
    ["MONEY_ALLOCATION_SUPERSEDE_REQUIRED", "moneyAllocation.error.SUPERSEDE_REQUIRED"],
    ["TAX_INVOICE_ACTIVE_DEPENDENCY", "finance.payment.error.taxDependency"],
    ["FINANCE_ISSUED_RECEIPT_DEPENDENCY", "finance.payment.error.receiptDependency"],
    ["WHT_LEGACY_RECALCULATION_REQUIRED", "finance.payment.error.legacyRecalculation"],
    ["WHT_COMPONENT_SCOPE_UNSUPPORTED", "finance.payment.error.whtScope"],
    ["WHT_PARTIAL_SCOPE_UNSUPPORTED", "finance.payment.error.partialWhtScope"],
    ["WHT_SNAPSHOT_INVALID", "finance.payment.error.whtSnapshot"],
    ["WHT_CALCULATION_MISMATCH", "finance.payment.error.whtMismatch"],
    ["WHT_RATE_REQUIRED", "finance.payment.error.whtRate"],
    ["WHT_SAVE_BEFORE_CONFIRM", "finance.payment.error.saveWht"],
    ["Not allowed", "finance.payment.error.permission"],
    ["already economically settled", "finance.payment.error.settled"],
    ["outstanding is already reserved", "finance.payment.error.reserved"],
    ["Actual Payment received date is required", "finance.payment.error.dateRequired"],
    ["cannot be in the future", "finance.payment.error.futureDate"],
    ["Payment method is required", "finance.payment.error.method"],
    ["Receiving bank account is required", "finance.payment.error.bank"],
    ["allocation exceeds", "finance.payment.error.allocation"],
    ["downstream records", "finance.payment.error.downstream"],
  ];
  const key = mappings.find(([needle]) => message.includes(needle))?.[1];
  return key ? uiMessage(key) : fallback;
}

export function paymentReallocationErrorMessage(error: unknown): UiMessage {
  if (isUiMessage(error)) return error;
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : "";
  const mappings: Array<[string, string]> = [
    ["MONEY_ALLOCATION_SUPERSEDE_REQUIRED", "moneyAllocation.error.SUPERSEDE_REQUIRED"],
    ["TAX_INVOICE_ACTIVE_DEPENDENCY", "finance.payment.error.taxDependency"],
    ["FINANCE_ISSUED_RECEIPT_DEPENDENCY", "finance.payment.error.receiptDependency"],
    ["WHT_REALLOCATION_REQUIRES_COMPONENT_WORKFLOW", "finance.payment.error.whtReallocation"],
    ["Not allowed to reallocate", "finance.payment.error.reallocationPermission"],
    ["FINANCE_PAYMENT_REALLOCATION_ACK_REQUIRED", "finance.payment.error.reallocationAck"],
    ["Only a Confirmed Payment", "finance.payment.error.confirmedRequired"],
    ["Source and target Invoice must differ", "finance.payment.error.differentInvoices"],
    ["Payment reallocation reason is required", "finance.payment.error.reason"],
    ["Payment reallocation reason is too long", "finance.payment.error.reasonLength"],
    ["FINANCE_PAYMENT_REALLOCATION_SOURCE_INSUFFICIENT", "finance.payment.error.sourceInsufficient"],
    ["FINANCE_PAYMENT_REALLOCATION_CLIENT_MISMATCH", "finance.payment.error.clientMismatch"],
    ["FINANCE_PAYMENT_REALLOCATION_CURRENCY_MISMATCH", "finance.payment.error.currencyMismatch"],
    ["Target Invoice must be Issued", "finance.payment.error.issuedTarget"],
    ["FINANCE_PAYMENT_REALLOCATION_TARGET_CAPACITY_EXCEEDED", "finance.payment.error.targetCapacity"],
    ["FINANCE_PAYMENT_REALLOCATION_REQUEST_CONFLICT", "finance.payment.error.requestConflict"],
    ["FINANCE_PAYMENT_REALLOCATION_HAS_DOWNSTREAM_DEPENDENCIES", "finance.payment.error.reallocationDownstream"],
    ["Moved Cash and WHT", "finance.payment.error.moveAmounts"],
    ["Payment, source Invoice, and target Invoice are required", "finance.payment.error.sourceTargetRequired"],
    ["Source Invoice not found", "finance.payment.error.sourceMissing"],
    ["Target Invoice not found", "finance.payment.error.targetMissing"],
  ];
  return uiMessage(mappings.find(([needle]) => message.includes(needle))?.[1]
    || "finance.payment.error.reallocationFailed");
}

export function safePaymentError(error: unknown, fallback: string, locale: UiLocale = "th") {
  return resolveUiMessage(locale, paymentErrorMessage(error, fallback));
}
export function safePaymentReallocationError(error: unknown, locale: UiLocale = "th") {
  const message = paymentReallocationErrorMessage(error);
  return translate(locale, message.key, message.parameters);
}
