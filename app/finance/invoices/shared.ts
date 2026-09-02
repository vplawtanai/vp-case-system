export type Json = Record<string, unknown>;

export type FinanceInvoice = {
  id: string;
  billing_plan_id: string | null;
  primary_billing_installment_id: string | null;
  fee_agreement_id: string | null;
  source_quotation_id: string | null;
  client_id: string;
  case_id: number | null;
  advisory_matter_id: string | null;
  source_model: "installment_v1" | "billable_charge_v2";
  v2_bridge_id: string | null;
  v2_creation_request_id: string | null;
  invoice_no: string | null;
  document_status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  language_code: string;
  customer_note: string | null;
  payment_terms_text: string | null;
  payment_destination_bank_account_id: string | null;
  payment_destination_snapshot_json: Json | null;
  internal_note: string | null;
  amount_before_vat: number | string;
  vat_amount: number | string;
  total_amount: number | string;
  seller_name_th: string | null;
  seller_name_en: string | null;
  seller_tax_id: string | null;
  seller_branch: string | null;
  seller_address: string | null;
  seller_phone: string | null;
  seller_email: string | null;
  seller_website: string | null;
  customer_name: string | null;
  customer_tax_id: string | null;
  customer_branch: string | null;
  customer_billing_address: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  seller_snapshot_json: Json | null;
  customer_snapshot_json: Json | null;
  matter_snapshot_json: Json | null;
  source_snapshot_json: Json | null;
  issued_snapshot_json: Json | null;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceInvoiceItem = {
  id: string;
  source_billable_charge_id: string | null;
  source_state: string;
  source_snapshot_json: Json | null;
  description: string;
  source_quantity: number | string | null;
  source_unit_price: number | string | null;
  allocation_percent: number | string | null;
  vat_applicable: boolean;
  vat_rate: number | string;
  tax_category: string | null;
  price_tax_mode: string | null;
  amount_before_vat: number | string;
  vat_amount: number | string;
  line_total: number | string;
  sort_order: number;
};

export type InvoiceDraftForm = {
  issueDate: string;
  dueDate: string;
  customerNote: string;
  paymentTermsText: string;
  paymentDestinationBankAccountId: string;
  internalNote: string;
  languageCode: "th" | "en";
};

export type FinanceBankAccount = {
  id: string;
  short_name: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  is_active: boolean;
};

export type InvoicePaymentDestination = {
  bankAccountId: string | null;
  shortName: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
};

export const invoiceStatusLabels: Record<string, string> = {
  draft: "ร่างใบแจ้งหนี้",
  issued: "ออกใบแจ้งหนี้แล้ว",
  cancelled: "ยกเลิกร่างแล้ว",
  voided: "ยกเลิกแล้ว",
};

export const installmentStatusLabels: Record<string, string> = {
  pending: "รอดำเนินการ",
  ready_to_invoice: "พร้อมออกใบแจ้งหนี้",
  invoiced: "ออกใบแจ้งหนี้แล้ว",
  cancelled: "ยกเลิก",
};

export const triggerLabels: Record<string, string> = {
  agreement_effective: "เมื่อการว่าจ้างมีผล",
  date: "ตามวันที่",
  case_milestone: "ตามเหตุการณ์สำคัญ",
  manual: "กำหนดด้วยตนเอง",
  recurring_period: "ตามรอบระยะเวลา",
};

export const economicClassificationLabels: Record<string, string> = {
  professional_fee: "ค่าวิชาชีพ",
  additional_service: "ค่าบริการเพิ่มเติม",
  reimbursable_expense: "ค่าใช้จ่ายเรียกคืน",
  government_or_court_fee: "ค่าธรรมเนียมศาล / หน่วยงานรัฐ",
  other: "อื่น ๆ",
};

export function economicClassificationLabel(value: string | null | undefined) {
  return value ? economicClassificationLabels[value] || value : "ยังไม่ระบุ";
}

export function invoiceDraftForm(invoice: FinanceInvoice): InvoiceDraftForm {
  return {
    issueDate: invoice.issue_date?.slice(0, 10) || "",
    dueDate: invoice.due_date?.slice(0, 10) || "",
    customerNote: invoice.customer_note || "",
    paymentTermsText: invoice.payment_terms_text || "",
    paymentDestinationBankAccountId: invoice.payment_destination_bank_account_id || "",
    internalNote: invoice.internal_note || "",
    languageCode: invoice.language_code === "en" ? "en" : "th",
  };
}

export function invoiceDraftFingerprint(form: InvoiceDraftForm) {
  return JSON.stringify({
    issueDate: form.issueDate || "",
    dueDate: form.dueDate || "",
    customerNote: form.customerNote.trim(),
    paymentTermsText: form.paymentTermsText.trim(),
    paymentDestinationBankAccountId: form.paymentDestinationBankAccountId,
    internalNote: form.internalNote.trim(),
    languageCode: form.languageCode,
  });
}

export function eligibleInvoicePaymentBankAccount(account: FinanceBankAccount) {
  return account.is_active && Boolean(account.account_name?.trim()) && Boolean(account.account_number?.trim());
}

export function bankAccountPaymentDestination(account: FinanceBankAccount | null | undefined): InvoicePaymentDestination | null {
  if (!account) return null;
  return {
    bankAccountId: account.id,
    shortName: account.short_name?.trim() || null,
    bankName: account.bank_name?.trim() || null,
    accountName: account.account_name?.trim() || null,
    accountNumber: account.account_number?.trim() || null,
  };
}

export function snapshotPaymentDestination(value: unknown): InvoicePaymentDestination | null {
  const snapshot = asJson(value);
  const destination = {
    bankAccountId: textValue(snapshot.bank_account_id),
    shortName: textValue(snapshot.short_name),
    bankName: textValue(snapshot.bank_name),
    accountName: textValue(snapshot.account_name),
    accountNumber: textValue(snapshot.account_number),
  };
  return Object.values(destination).some(Boolean) ? destination : null;
}

export function numberValue(value: number | string | null | undefined) {
  return Number(value || 0);
}

export function money(value: number | string | null | undefined, currency: string) {
  return `${numberValue(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function displayText(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatBangkokDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

export function formatThaiDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

export function formatDocumentDate(value: string | null | undefined, languageCode = "th") {
  if (!value) return "-";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat(languageCode === "en" ? "en-GB" : "th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

export function sourceQuotationNo(snapshot: Json | null) {
  const sourceDocument = snapshot?.source_document;
  return displayText(
    sourceDocument && typeof sourceDocument === "object" && !Array.isArray(sourceDocument)
      ? (sourceDocument as Json).quotation_no
      : null,
    "ใบเสนอราคาต้นทาง",
  );
}

export function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function invoiceItemReadySnapshot(item: FinanceInvoiceItem) {
  return asJson(asJson(item.source_snapshot_json).ready_snapshot);
}

export function invoiceItemEconomicClassification(item: FinanceInvoiceItem) {
  const value = asJson(invoiceItemReadySnapshot(item).economic).classification;
  return typeof value === "string" && value.trim() ? value : null;
}

export function invoiceItemSourceType(item: FinanceInvoiceItem) {
  const value = asJson(invoiceItemReadySnapshot(item).source).source_type;
  return typeof value === "string" && value.trim() ? value : null;
}

export function invoiceItemUnit(item: FinanceInvoiceItem) {
  const value = asJson(invoiceItemReadySnapshot(item).commercial).unit;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function safeInvoiceError(error: unknown, fallback: string) {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : error instanceof Error ? error.message : "";
  if (message.includes("due date cannot be before")) return "วันที่ครบกำหนดต้องไม่มาก่อนวันที่ออกเอกสาร";
  if (message.includes("issue date is required")) return "กรุณาระบุวันที่ออกเอกสาร";
  if (message.includes("issue date cannot be in the future")) return "วันที่ออกใบแจ้งหนี้ต้องไม่เป็นวันในอนาคต";
  if (message.includes("customer name is required")) return "ข้อมูลชื่อลูกค้าไม่ครบถ้วน กรุณาตรวจสอบข้อมูลต้นทางก่อนออกใบแจ้งหนี้";
  if (message.includes("payment destination bank account is required")) return "กรุณาเลือกบัญชีสำหรับรับชำระก่อนออกใบแจ้งหนี้";
  if (message.includes("payment bank account is not eligible") || message.includes("payment destination bank account is not eligible")) return "บัญชีสำหรับรับชำระที่เลือกไม่พร้อมใช้งาน กรุณาเลือกบัญชีที่มีข้อมูลครบถ้วน";
  if (message.includes("source Billing Installment to remain ready")) return "งวดต้นทางไม่ได้อยู่ในสถานะพร้อมออกใบแจ้งหนี้แล้ว กรุณารีเฟรชและตรวจสอบอีกครั้ง";
  if (message.includes("active Billing Plan")) return "แผนเรียกเก็บเงินต้นทางไม่ได้อยู่ในสถานะใช้งานแล้ว";
  if (message.includes("Invoice Void reason is required")) return "กรุณาระบุเหตุผลในการยกเลิกใบแจ้งหนี้";
  if (message.includes("Invoice Void reason is too long")) return "เหตุผลในการยกเลิกใบแจ้งหนี้ต้องไม่เกิน 2,000 ตัวอักษร";
  if (message.includes("Invoice Void acknowledgement is required")) return "กรุณายืนยันว่าคุณเข้าใจผลของการยกเลิกใบแจ้งหนี้";
  if (message.includes("active Payment Draft")) return "ยังมีร่างการรับชำระที่ยังไม่ได้ยกเลิก กรุณายกเลิกร่างการรับชำระก่อน";
  if (message.includes("Confirmed Payment") || message.includes("settlement must be zero")) return "ใบแจ้งหนี้นี้มีการรับชำระที่ยังมีผล กรุณาดำเนินการย้อนกลับรายการรับชำระก่อน";
  if (message.includes("downstream document dependency")) return "ไม่สามารถยกเลิกใบแจ้งหนี้นี้ได้ เนื่องจากมีเอกสารหรือรายการทางการเงินที่เกี่ยวข้อง";
  if (message.includes("Only an Issued Invoice") || message.includes("Issued Invoice is required")) return "ยกเลิกได้เฉพาะใบแจ้งหนี้ที่ออกแล้วเท่านั้น กรุณารีเฟรชและตรวจสอบสถานะเอกสาร";
  if (message.includes("source Billing Plan or Installment lineage") || message.includes("source Billing Plan is not eligible") || message.includes("source Billing Installment is not invoiced") || message.includes("readiness evidence is incomplete")) {
    return "ข้อมูลงวดหรือแผนเรียกเก็บเงินต้นทางไม่พร้อมสำหรับการยกเลิกใบแจ้งหนี้ กรุณาติดต่อผู้ดูแลระบบ";
  }
  if (message.includes("settlement summary is unavailable")) return "ไม่สามารถตรวจสอบสถานะการรับชำระได้ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ";
  if (message.includes("Only a Draft Invoice")) return "รายการนี้ไม่ได้อยู่ในสถานะร่างที่ดำเนินการได้";
  if (message.includes("same Client, currency, and exact matter context") || message.includes("incompatible with Invoice context")) return "รายการที่เลือกต้องเป็นของลูกค้า สกุลเงิน และคดี/งานเดียวกันทั้งหมด";
  if (message.includes("must be Ready") || message.includes("not available") || message.includes("do not exist")) return "รายการเรียกเก็บเพิ่มเติมบางรายการไม่พร้อมใช้งานแล้ว กรุณารีเฟรชและเลือกใหม่";
  if (message.includes("requires at least one Billable Charge") || message.includes("requires at least one Charge")) return "กรุณาเลือกรายการเรียกเก็บเพิ่มเติมอย่างน้อยหนึ่งรายการ";
  if (message.includes("Fixed-installment") && message.includes("approval authority")) return "คุณไม่มีสิทธิ์รับรองข้อมูลค่าวิชาชีพจากงวดตามแผนเรียกเก็บ";
  if (message.includes("Human-certified installment semantic adapter") || message.includes("Missing installment semantics")) return "ข้อมูลประกอบรายการค่าวิชาชีพยังไม่ครบ กรุณาระบุประเภทของยอดและยืนยันข้อมูลทุกบรรทัด";
  if (message.includes("V1 Invoice history") || message.includes("FINANCE_INSTALLMENT_HAS_V1_INVOICE_HISTORY")) return "งวดนี้มีประวัติใบแจ้งหนี้เดิมแล้ว จึงไม่สามารถนำมารวมในใบแจ้งหนี้แบบรวมรายการได้";
  if (message.includes("Invoice V2 request ID was already used")) return "ข้อมูลที่เลือกเปลี่ยนไประหว่างการส่งคำขอ กรุณาตรวจสอบและเริ่มสร้างร่างใหม่";
  if (message.includes("Not allowed to compose") || message.includes("Not allowed to change Invoice V2 composition")) return "คุณไม่มีสิทธิ์สร้างหรือแก้ไขรายการในใบแจ้งหนี้นี้";
  if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์ดำเนินการกับใบแจ้งหนี้นี้";
  if (message.includes("do not reconcile") || message.includes("exactly copy") || message.includes("exactly match") || message.includes("inconsistent")) {
    return "รายการหรือยอดเงินไม่ตรงกับข้อมูลต้นทาง จึงยังดำเนินการไม่ได้";
  }
  console.error(fallback, error);
  return fallback;
}
