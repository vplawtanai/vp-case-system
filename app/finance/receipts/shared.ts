import { translate } from "../../../lib/i18n/catalog";
import { isUiMessage, type UiLocale } from "../../../lib/i18n/core";
import type { DocumentIdentity } from "../../../lib/documentIdentity";
import { documentLogoEvidence, type DocumentLogoEvidence } from "../../../lib/documentLogo";

export type ReceiptStatus = "draft" | "issued" | "cancelled" | "voided";
export type FinanceReceipt = {
  id: string;
  payment_id: string;
  status: ReceiptStatus;
  receipt_no: string | null;
  receipt_date: string;
  currency: string;
  cash_amount: number | string;
  wht_amount: number | string;
  settlement_amount: number | string;
  draft_snapshot_json: unknown;
  issued_snapshot_json: unknown;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  replaces_receipt_id: string | null;
  created_at: string;
  updated_at: string;
  combined_document_id?: string | null;
};

export const receiptSelect = "id,payment_id,status,receipt_no,receipt_date,currency,cash_amount,wht_amount,settlement_amount,draft_snapshot_json,issued_snapshot_json,issued_at,voided_at,void_reason,replaces_receipt_id,created_at,updated_at,combined_document_id";
export const receiptStatusLabels: Record<ReceiptStatus, string> = {
  draft: translate("th", "finance.receipt.draft"),
  issued: translate("th", "finance.receipt.issued"),
  cancelled: translate("th", "finance.taxInvoice.ui.statusCancelled"),
  voided: translate("th", "finance.receipt.voided"),
};
export function receiptStatusLabel(status: ReceiptStatus, locale: UiLocale = "th"): string {
  return translate(locale, status === "cancelled" ? "finance.taxInvoice.ui.statusCancelled" : `finance.receipt.${status}`);
}
export function receiptMethodLabel(method: string, locale: UiLocale = "th"): string {
  const keys: Record<string, string> = { bank_transfer: "bankTransfer", cash: "cash", cheque: "cheque", card_or_gateway: "cardGateway", other: "other" };
  return translate(locale, `finance.payment.method.${keys[method] || "other"}`);
}
export const receiptMethodLabels: Record<string, string> = {
  bank_transfer: "โอนเงินผ่านธนาคาร", cash: "เงินสด", cheque: "เช็ค",
  card_or_gateway: "บัตรหรือช่องทางรับชำระ", other: "อื่น ๆ",
};
type Amounts = { cash: number; wht: number; settlement: number; currency: string };
export type ReceiptPresentation = {
  status: ReceiptStatus;
  identity: DocumentIdentity;
  logo: DocumentLogoEvidence | null;
  customer: { name: string; taxId: string; address: string; branch: string };
  payment: Amounts & {
    id: string; reference: string; receivedOn: string; method: string; receivingAccountReference: string;
    bank: { id: string; bankName: string; accountName: string; accountNumber: string } | null;
  };
  invoices: (Amounts & { id: string; number: string; description: string })[];
  receipt: { id: string; number: string; date: string; issuedAt: string; issuedBy: string };
  structuredWhtComponents: Record<string, unknown>[];
};
export type ReceiptPresentationResult = { ok: true; value: ReceiptPresentation } | { ok: false; error: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object");
  return value as Record<string, unknown>;
}
function optionalText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new Error("text");
  return value.trim();
}
function requiredText(value: unknown): string {
  const result = optionalText(value);
  if (!result) throw new Error("required text");
  return result;
}
function uuid(value: unknown): string {
  const result = requiredText(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) throw new Error("UUID");
  return result;
}
function date(value: unknown): string {
  const result = requiredText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error("date");
  return result;
}
function timestamp(value: unknown): string {
  const result = requiredText(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error("timestamp");
  return result;
}
function cents(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) throw new Error("amount");
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("amount range");
  return result;
}
function amounts(cash: unknown, wht: unknown, settlement: unknown, currency: unknown): Amounts {
  const result = { cash: cents(cash), wht: cents(wht), settlement: cents(settlement), currency: requiredText(currency) };
  if (result.cash + result.wht !== result.settlement || result.settlement <= 0 || !/^[A-Z]{3}$/.test(result.currency)) throw new Error("settlement");
  return result;
}

// All document facts and the logo reference come from the selected snapshot.
export function receiptPresentation(row: FinanceReceipt): ReceiptPresentationResult {
  try {
    if (!Object.hasOwn(receiptStatusLabels, row.status)) throw new Error("status");
    const frozen = row.status === "issued" || row.status === "voided";
    const snapshot = object(frozen ? row.issued_snapshot_json : row.draft_snapshot_json);
    if (![1, 2].includes(Number(snapshot.schema_version)) || typeof snapshot.schema_version !== "number" || snapshot.document_kind !== "receipt") throw new Error("schema version");
    const seller = object(snapshot.seller);
    const logo = snapshot.schema_version === 2 ? documentLogoEvidence(seller.logo_asset) : null;
    const customer = object(snapshot.customer);
    const payment = object(snapshot.payment);
    const nameTh = optionalText(seller.company_name_th);
    const nameEn = optionalText(seller.company_name_en);
    const addressTh = optionalText(seller.address_th);
    const addressEn = optionalText(seller.address_en);
    const branchTh = optionalText(seller.branch_label_th);
    const branchEn = optionalText(seller.branch_label_en);
    const identity: DocumentIdentity = {
      companyNameTh: requiredText(nameTh || nameEn), companyNameEn: nameTh ? nameEn : "",
      addressTh, addressEn, taxId: requiredText(seller.tax_id), branchTh, branchEn,
      phone: optionalText(seller.phone), email: optionalText(seller.email), website: optionalText(seller.website),
      description: "", logoStoragePath: logo?.path || "",
    };
    requiredText(addressTh || addressEn);
    requiredText(branchTh || branchEn);
    const paymentAmounts = amounts(payment.cash_amount, payment.wht_amount, payment.settlement_amount, payment.currency);
    const method = requiredText(payment.payment_method);
    if (!Object.hasOwn(receiptMethodLabels, method)) throw new Error("payment method");
    const bank = payment.receiving_bank_account == null ? null : object(payment.receiving_bank_account);
    const receivingAccountReference = optionalText(payment.receiving_account_reference);
    const paymentId = uuid(payment.id);
    const bankView = bank ? { id: uuid(bank.id), bankName: requiredText(bank.bank_name), accountName: requiredText(bank.account_name), accountNumber: requiredText(bank.account_number) } : null;
    if (method === "bank_transfer" && !receivingAccountReference && (!bankView || !Object.values(bankView).some(Boolean))) throw new Error("receiving bank");
    const paymentView = {
      ...paymentAmounts, id: paymentId, reference: optionalText(payment.internal_reference) || paymentId.slice(0, 8).toUpperCase(),
      receivedOn: date(payment.received_on), method,
      bank: bankView, receivingAccountReference,
    };
    if (!Array.isArray(snapshot.invoices) || !snapshot.invoices.length) throw new Error("invoices");
    const invoices = snapshot.invoices.map((value) => {
      const invoice = object(value);
      return {
        ...amounts(invoice.cash_allocated, invoice.wht_allocated, invoice.settlement_allocated, invoice.currency),
        id: requiredText(invoice.invoice_id), number: requiredText(invoice.invoice_no), description: requiredText(invoice.description),
      };
    });
    if (new Set(invoices.map((invoice) => invoice.id)).size !== invoices.length || invoices.some((invoice) => invoice.currency !== paymentView.currency)) throw new Error("invoice coverage");
    for (const key of ["cash", "wht", "settlement"] as const) {
      const total = invoices.reduce((sum, invoice) => sum + invoice[key], 0);
      if (!Number.isSafeInteger(total) || total !== paymentView[key]) throw new Error("allocation totals");
    }
    const receipt = frozen ? object(snapshot.receipt) : null;
    const issuerId = receipt ? uuid(receipt.issued_by_user_id) : "";
    const receiptView = {
      id: receipt ? requiredText(receipt.id) : row.id,
      number: receipt ? requiredText(receipt.receipt_no) : "",
      date: receipt ? date(receipt.receipt_date) : paymentView.receivedOn,
      issuedAt: receipt ? timestamp(receipt.issued_at) : "",
      issuedBy: receipt ? optionalText(receipt.issued_by_name) || issuerId : "",
    };
    if (frozen && (!/^VP-RC-\d{6}-\d{6}$/.test(receiptView.number) || receiptView.number !== row.receipt_no || Date.parse(receiptView.issuedAt) !== Date.parse(timestamp(row.issued_at)))) throw new Error("issued metadata");
    if (!frozen && (row.receipt_no !== null || row.issued_at !== null || snapshot.receipt != null)) throw new Error("draft number");
    if (receiptView.id !== row.id || paymentView.id !== row.payment_id || receiptView.date !== date(row.receipt_date) || receiptView.date !== paymentView.receivedOn) throw new Error("receipt linkage");
    const rowAmounts = amounts(row.cash_amount, row.wht_amount, row.settlement_amount, row.currency);
    if ((["cash", "wht", "settlement", "currency"] as const).some((key) => rowAmounts[key] !== paymentView[key])) throw new Error("row amounts");
    if (row.status === "voided") { timestamp(row.voided_at); requiredText(row.void_reason); }
    if (snapshot.structured_wht_components != null && !Array.isArray(snapshot.structured_wht_components)) throw new Error("WHT evidence");
    const structuredWhtComponents = (snapshot.structured_wht_components as unknown[] | undefined ?? []).map((value) => structuredClone(object(value)));
    return { ok: true, value: {
      status: row.status, identity, logo,
      customer: { name: requiredText(customer.name), taxId: optionalText(customer.tax_id), address: optionalText(customer.address), branch: optionalText(customer.branch) },
      payment: paymentView, invoices, receipt: receiptView, structuredWhtComponents,
    } };
  } catch {
    return { ok: false, error: "ข้อมูลหลักฐานใบเสร็จรับเงินไม่ครบถ้วนหรือไม่สอดคล้องกัน จึงไม่สามารถแสดงเอกสารหรือออกใบเสร็จได้ กรุณารีเฟรชร่างหรือติดต่อผู้ดูแล" };
  }
}

export function receiptMoney(valueInCents: number, currency: string) {
  return `${(valueInCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
export function receiptDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}T00:00:00+07:00`));
}
export function receiptIssueDate(issuedAt: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(issuedAt));
}
export function receiptTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

export function paymentReceiptAction(paymentStatus: string, receipts: Pick<FinanceReceipt, "id" | "status">[] | null, canView: boolean, canManage: boolean) {
  if (!canView || paymentStatus !== "confirmed") return { kind: "none" as const };
  if (!receipts) return { kind: "unavailable" as const };
  const active = receipts.filter((row) => row.status === "draft" || row.status === "issued");
  if (active.length > 1) return { kind: "conflict" as const };
  if (active.length === 1) return { kind: "open" as const, id: active[0].id, label: active[0].status === "draft" ? "เปิดร่างใบเสร็จรับเงิน" : "ดูใบเสร็จรับเงิน" };
  return canManage ? { kind: "create" as const, label: "จัดทำใบเสร็จรับเงิน" } : { kind: "none" as const };
}

export type ReceiptCommand =
  | { kind: "create"; paymentId: string; externalReceiptChecked: boolean }
  | { kind: "refresh"; receiptId: string }
  | { kind: "issue"; receiptId: string; acknowledged: boolean; reviewedSnapshot: unknown }
  | { kind: "cancel"; receiptId: string; reason: string }
  | { kind: "void"; receiptId: string; reason: string; acknowledged: boolean };
export function receiptRpc(command: ReceiptCommand): { name: string; args: Record<string, unknown> } {
  if (command.kind === "create") {
    if (!command.externalReceiptChecked) throw new Error("external receipt acknowledgement");
    return { name: "create_finance_receipt_draft_from_payment", args: { p_payment_id: command.paymentId, p_external_receipt_checked: true } };
  }
  if (command.kind === "issue" || command.kind === "void") {
    if (!command.acknowledged) throw new Error("acknowledgement required");
  }
  if (command.kind === "cancel" || command.kind === "void") {
    const reason = command.reason.trim();
    if (!reason || reason.length > 2000) throw new Error("reason required");
    return { name: command.kind === "cancel" ? "cancel_finance_receipt_draft" : "void_finance_receipt", args: { p_receipt_id: command.receiptId, p_reason: reason, ...(command.kind === "void" ? { p_acknowledged: true } : {}) } };
  }
  return { name: command.kind === "refresh" ? "refresh_finance_receipt_draft" : "issue_finance_receipt", args: { p_receipt_id: command.receiptId, ...(command.kind === "issue" ? { p_acknowledged: true, p_reviewed_snapshot_json: object(command.reviewedSnapshot) } : {}) } };
}

export function safeReceiptError(error: unknown, locale: UiLocale = "th") {
  if (isUiMessage(error)) return translate(locale, error.key, error.parameters);
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const codes: Record<string, string> = {
    TAX_INVOICE_ACTIVE_DEPENDENCY: "finance.receipt.error.activeDependency",
    RECEIPT_LOGO_EVIDENCE_REQUIRED: "finance.receipt.error.logoEvidenceRequired",
    RECEIPT_REVIEW_REQUIRED: "finance.receipt.error.reviewRequired",
    RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED: "finance.receipt.error.sourceChangedRefreshRequired",
    RECEIPT_PERMISSION_DENIED: "finance.receipt.error.permissionDenied",
    RECEIPT_EXTERNAL_COVERAGE_ACK_REQUIRED: "finance.receipt.error.externalCoverageAckRequired",
    RECEIPT_CONFIRMED_PAYMENT_REQUIRED: "finance.receipt.error.confirmedPaymentRequired",
    RECEIPT_PAYMENT_EVIDENCE_REQUIRED: "finance.receipt.error.paymentEvidenceRequired",
    RECEIPT_SELLER_IDENTITY_REQUIRED: "finance.receipt.error.sellerIdentityRequired",
    RECEIPT_RECEIVING_ACCOUNT_REQUIRED: "finance.receipt.error.receivingAccountRequired",
    RECEIPT_FROZEN_INVOICE_EVIDENCE_REQUIRED: "finance.receipt.error.frozenInvoiceEvidenceRequired",
    RECEIPT_CUSTOMER_IDENTITY_REQUIRED: "finance.receipt.error.customerIdentityRequired",
    RECEIPT_CUSTOMER_EVIDENCE_CONFLICT: "finance.receipt.error.customerEvidenceConflict",
    RECEIPT_ALLOCATION_MISMATCH: "finance.receipt.error.allocationMismatch",
    RECEIPT_NOT_FOUND: "finance.receipt.error.notFound",
    RECEIPT_DRAFT_REQUIRED: "finance.receipt.error.draftRequired",
    RECEIPT_ISSUED_REQUIRED: "finance.receipt.error.issuedRequired",
    RECEIPT_ISSUE_ACK_REQUIRED: "finance.receipt.error.issueAckRequired",
    RECEIPT_VOID_ACK_REQUIRED: "finance.receipt.error.voidAckRequired",
    RECEIPT_REASON_REQUIRED: "finance.receipt.error.reasonRequired",
    RECEIPT_HISTORY_IMMUTABLE: "finance.receipt.error.historyImmutable",
    RECEIPT_SOURCE_IMMUTABLE: "finance.receipt.error.sourceImmutable",
    RECEIPT_DRAFT_COVERAGE_INVALID: "finance.receipt.error.draftCoverageInvalid",
    RECEIPT_FROZEN_COVERAGE_INVALID: "finance.receipt.error.frozenCoverageInvalid",
    RECEIPT_NUMBERING_PROFILE_INVALID: "finance.receipt.error.numberingProfileInvalid",
    RECEIPT_NUMBERING_EXHAUSTED: "finance.receipt.error.numberingExhausted",
    FINANCE_ISSUED_RECEIPT_DEPENDENCY: "finance.receipt.error.issuedReceiptDependency",
  };
  const mapped = Object.entries(codes).find(([code]) => message.includes(code));
  if (mapped) return translate(locale, mapped[1]);
  if (/stale|changed|refresh|snapshot.*mismatch/i.test(message)) return translate(locale, "finance.receipt.error.sourceChangedRefreshRequired");
  if (/not allowed|permission|denied/i.test(message)) return translate(locale, "finance.receipt.error.permissionDenied");
  if (/external.*receipt/i.test(message)) return translate(locale, "finance.receipt.error.externalCoverageAckRequired");
  if (/confirmed/i.test(message)) return translate(locale, "finance.receipt.error.confirmedPaymentRequired");
  if (/active|coverage|already|duplicate/i.test(message)) return translate(locale, "finance.receipt.errorActive");
  return translate(locale, "finance.receipt.errorFailed");
}

export function receiptSearchFilter(search: string) {
  const escaped = search.trim().slice(0, 150).replace(/[\\%_"]/g, "\\$&");
  if (!escaped) return "";
  return ["receipt_no", "draft_snapshot_json->customer->>name", "issued_snapshot_json->customer->>name", "draft_snapshot_json->payment->>internal_reference", "issued_snapshot_json->payment->>internal_reference"]
    .map((field) => `${field}.ilike."%${escaped}%"`).join(",");
}
