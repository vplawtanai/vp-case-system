export type Json = Record<string, unknown>;

export type FinanceInvoice = {
  id: string;
  billing_plan_id: string;
  primary_billing_installment_id: string;
  fee_agreement_id: string;
  source_quotation_id: string | null;
  client_id: string;
  case_id: number | null;
  advisory_matter_id: string | null;
  invoice_no: string | null;
  document_status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  language_code: string;
  customer_note: string | null;
  payment_terms_text: string | null;
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
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceInvoiceItem = {
  id: string;
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
  internalNote: string;
  languageCode: "th" | "en";
};

export const invoiceStatusLabels: Record<string, string> = {
  draft: "ร่างใบแจ้งหนี้",
  issued: "ออกใบแจ้งหนี้แล้ว",
  cancelled: "ยกเลิกร่างแล้ว",
  voided: "ยกเลิกเลขที่เอกสารแล้ว",
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

export function invoiceDraftForm(invoice: FinanceInvoice): InvoiceDraftForm {
  return {
    issueDate: invoice.issue_date?.slice(0, 10) || "",
    dueDate: invoice.due_date?.slice(0, 10) || "",
    customerNote: invoice.customer_note || "",
    paymentTermsText: invoice.payment_terms_text || "",
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
    internalNote: form.internalNote.trim(),
    languageCode: form.languageCode,
  });
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

export function safeInvoiceError(error: unknown, fallback: string) {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : error instanceof Error ? error.message : "";
  if (message.includes("due date cannot be before")) return "วันที่ครบกำหนดต้องไม่มาก่อนวันที่ออกเอกสาร";
  if (message.includes("issue date is required")) return "กรุณาระบุวันที่ออกเอกสาร";
  if (message.includes("issue date cannot be in the future")) return "วันที่ออกใบแจ้งหนี้ต้องไม่เป็นวันในอนาคต";
  if (message.includes("customer name is required")) return "ข้อมูลชื่อลูกค้าไม่ครบถ้วน กรุณาตรวจสอบข้อมูลต้นทางก่อนออกใบแจ้งหนี้";
  if (message.includes("source Billing Installment to remain ready")) return "งวดต้นทางไม่ได้อยู่ในสถานะพร้อมออกใบแจ้งหนี้แล้ว กรุณารีเฟรชและตรวจสอบอีกครั้ง";
  if (message.includes("active Billing Plan")) return "แผนเรียกเก็บเงินต้นทางไม่ได้อยู่ในสถานะใช้งานแล้ว";
  if (message.includes("Only a Draft Invoice")) return "รายการนี้ไม่ได้อยู่ในสถานะร่างที่ดำเนินการได้";
  if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์ดำเนินการกับใบแจ้งหนี้นี้";
  if (message.includes("do not reconcile") || message.includes("exactly copy") || message.includes("exactly match") || message.includes("inconsistent")) {
    return "รายการหรือยอดเงินไม่ตรงกับข้อมูลต้นทาง จึงยังดำเนินการไม่ได้";
  }
  console.error(fallback, error);
  return fallback;
}
