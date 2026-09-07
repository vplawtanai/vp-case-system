import { documentLogoEvidence, type DocumentLogoEvidence } from "../../../lib/documentLogo";
import { normalizeDocumentIdentity, type DocumentIdentity } from "../../../lib/documentIdentity";

export type TaxDecisions = {
  tax_treatment?: string; treatment_reason?: string; buyer_vat_registered?: boolean | null;
  customer_address?: string; customer_tax_id?: string; buyer_branch_type?: string; buyer_branch_code?: string;
  identity_evidence?: string; no_earlier_event?: boolean; external_coverage_checked?: boolean;
};
export type TaxInvoice = {
  id: string; payment_id: string; invoice_id: string; status: "draft" | "issued" | "cancelled";
  tax_invoice_no: string | null; issue_date: string; source_snapshot_json: unknown; decisions_json: TaxDecisions;
  draft_snapshot_json: unknown; issued_snapshot_json: unknown; issued_at: string | null;
  created_at: string; updated_at: string; cancel_reason: string | null;
};
export const taxInvoiceSelect = "id,payment_id,invoice_id,status,tax_invoice_no,issue_date,source_snapshot_json,decisions_json,draft_snapshot_json,issued_snapshot_json,issued_at,created_at,updated_at,cancel_reason";
export type TaxEligibility = { can_prepare: boolean; blockers: string[]; existing_id?: string; existing_status?: string; existing_number?: string | null };
export const taxStatusLabels = { draft: "ร่าง", issued: "ออกใบกำกับภาษีแล้ว", cancelled: "ยกเลิกร่างแล้ว" };
export const taxTreatmentLabels: Record<string, string> = { standard_rated: "อยู่ในบังคับ VAT ตามอัตราต้นทาง", zero_rated: "อัตราภาษี 0% (ต้องมีหลักฐาน)", exempt: "ยกเว้น VAT (ยังไม่รองรับ)", outside_scope: "ไม่อยู่ในบังคับ VAT (ยังไม่รองรับ)" };
export const taxBlockerMessages: Record<string, string> = {
  TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED: "ข้อมูลผู้รับบริการไม่ครบ กรุณาระบุที่อยู่และสถานะจดทะเบียน VAT พร้อมหลักฐานภาษีที่จำเป็น",
  TAX_INVOICE_SELLER_IDENTITY_REQUIRED: "ข้อมูลภาษีผู้ขายหรือหลักฐานสำนักงานใหญ่ไม่ครบ กรุณาติดต่อผู้ดูแล",
  TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED: "ยังไม่ได้ยืนยันจุดเกิดภาษีและตรวจสอบว่าไม่มีเหตุเกิดภาษีก่อนวันรับชำระ",
  TAX_INVOICE_VAT_TREATMENT_UNRESOLVED: "ยังไม่ได้ยืนยันประเภท VAT หรือประเภทที่เลือกไม่สอดคล้องกับข้อมูลต้นทาง",
  TAX_INVOICE_EXTERNAL_COVERAGE_CHECK_REQUIRED: "ยังไม่ได้ตรวจสอบใบกำกับภาษีภายนอกและการใช้เลข VP-TI ซ้ำ",
  TAX_INVOICE_PARTIAL_PAYMENT_UNSUPPORTED: "เป็นการรับชำระบางส่วน หรือชำระจากหลายรายการรับชำระ ยังไม่รองรับในขั้นตอนนี้",
  TAX_INVOICE_MULTILINE_UNSUPPORTED: "รายการหลายประเภท / หลายบรรทัด ยังไม่รองรับในขั้นตอนนี้",
  TAX_INVOICE_MULTIPLE_SOURCES_UNSUPPORTED: "รายการรับชำระอ้างอิงหลายใบแจ้งหนี้ ยังไม่รองรับในขั้นตอนนี้",
  TAX_INVOICE_V2_ISSUED_SOURCE_REQUIRED: "ต้องเป็นใบแจ้งหนี้ V2 ที่ออกแล้ว",
  TAX_INVOICE_CONFIRMED_PAYMENT_REQUIRED: "ต้องยืนยันรายการรับชำระก่อน",
  TAX_INVOICE_ALREADY_COVERED: "มีใบกำกับภาษีหรือการจองยอดภาษีสำหรับต้นทางนี้แล้ว",
  TAX_INVOICE_PERMISSION_DENIED: "ไม่มีสิทธิ์ดำเนินการใบกำกับภาษีนี้",
  TAX_INVOICE_DRAFT_REQUIRED: "เอกสารไม่ใช่ร่างที่แก้ไขได้แล้ว กรุณาโหลดข้อมูลล่าสุด",
  TAX_INVOICE_SOURCE_CHANGED: "ข้อมูลต้นทางเปลี่ยนแปลง กรุณารีเฟรชร่างและตรวจสอบใหม่",
  TAX_INVOICE_STALE_REVIEW: "ข้อมูลเปลี่ยนหลังการตรวจสอบ กรุณาโหลดข้อมูลล่าสุดและตรวจสอบตัวอย่างใหม่",
  TAX_INVOICE_DELAY_ACK_REQUIRED: "วันที่ออกเอกสารหลังวันเกิดภาษี กรุณารับทราบการออกเอกสารล่าช้าก่อนยืนยัน",
  TAX_INVOICE_ISSUE_DATE_INVALID: "วันที่ออกต้องไม่ก่อนวันเกิดภาษีหรือเป็นวันในอนาคต",
  TAX_INVOICE_ISSUE_ACK_REQUIRED: "กรุณาตรวจสอบตัวอย่างและยืนยันการออกเลขที่ถาวร",
  TAX_INVOICE_FROZEN_IDENTITY_CHANGE_BLOCKED: "ข้อมูลที่ตรึงจากต้นทางแล้วเปลี่ยนในร่างนี้ไม่ได้",
  TAX_INVOICE_ACTIVE_DEPENDENCY: "มีใบกำกับภาษีหรือร่างที่ผูกกับหลักฐานนี้อยู่ ต้องตรวจสอบเอกสารก่อน",
  TAX_INVOICE_CONTEXT_UNSUPPORTED: "รองรับเฉพาะบริบทลูกค้าเดียวกันและสกุลเงินบาท",
  TAX_INVOICE_REASON_REQUIRED: "กรุณาระบุเหตุผลยกเลิกร่าง",
  TAX_INVOICE_NUMBERING_EXHAUSTED: "เลขที่ใบกำกับภาษีของรอบนี้เต็มแล้ว กรุณาติดต่อผู้ดูแล ห้ามนำเลขเดิมกลับมาใช้",
  TAX_INVOICE_NUMBERING_PROFILE_INVALID: "รูปแบบเลขที่ใบกำกับภาษีไม่ตรงกับนโยบายที่อนุมัติ กรุณาติดต่อผู้ดูแล",
  TAX_INVOICE_SOURCE_INVALID: "หลักฐานรายการและยอดภาษีต้นทางไม่ครบหรือไม่สอดคล้อง กรุณาติดต่อผู้ดูแล",
};
export function taxError(error: unknown): string {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  for (const [code, text] of Object.entries(taxBlockerMessages)) if (message.includes(code)) return text;
  if (/LOGO/.test(message)) return "ไม่พบหลักฐานโลโก้ตามเอกสาร กรุณาติดต่อผู้ดูแล";
  if (/permission denied|42501/i.test(message)) return taxBlockerMessages.TAX_INVOICE_PERMISSION_DENIED;
  return "ดำเนินการใบกำกับภาษีไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุดหรือติดต่อผู้ดูแล";
}
export function taxObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid tax evidence");
  return value as Record<string, unknown>;
}
export const taxText = (value: unknown) => typeof value === "string" ? value.trim() : "";
function moneyValue(value: unknown): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) throw new Error("Invalid tax amount");
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid tax amount");
  return cents;
}
export const taxMoney = (cents: number) => (cents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function taxDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }) : "";
}
export type TaxDocument = {
  identity: DocumentIdentity; logo: DocumentLogoEvidence; customer: Record<string, unknown>; description: string;
  beforeVat: number; vat: number; gross: number; cash: number; wht: number; vatRate: number;
  invoiceNumber: string; paymentReference: string; receiptNumber: string; taxPointDate: string; issueDate: string;
  number: string; treatment: string; status: TaxInvoice["status"];
};
// Issued documents are decoded solely from their own immutable snapshot.
export function taxPresentation(row: TaxInvoice): { ok: true; value: TaxDocument } | { ok: false; error: string } {
  try {
    const issued = row.status === "issued";
    const s = taxObject(issued ? row.issued_snapshot_json : row.draft_snapshot_json);
    if (s.schema_version !== 1 || s.document_kind !== "tax_invoice" || !Object.hasOwn(taxStatusLabels, row.status)) throw new Error("schema");
    const seller = taxObject(s.seller), item = taxObject(s.invoice_item), invoice = taxObject(s.invoice), payment = taxObject(s.payment), point = taxObject(s.tax_point);
    const customer = taxObject(s.customer), logo = documentLogoEvidence(seller.logo_asset);
    const beforeVat = moneyValue(item.amount_before_vat), vat = moneyValue(item.vat_amount), gross = moneyValue(item.line_total);
    const cash = moneyValue(payment.cash_amount), wht = moneyValue(payment.wht_amount);
    if (beforeVat + vat !== gross || cash + wht !== gross || moneyValue(payment.settlement_amount) !== gross
      || moneyValue(invoice.total_amount) !== gross || moneyValue(invoice.amount_before_vat) !== beforeVat || moneyValue(invoice.vat_amount) !== vat
      || invoice.id !== row.invoice_id || payment.id !== row.payment_id || item.invoice_id !== row.invoice_id
      || taxText(invoice.currency) !== "THB" || taxText(payment.currency) !== "THB" || !taxText(item.description)) throw new Error("source");
    if (!Number.isFinite(Number(item.vat_rate)) || Number(item.vat_rate) < 0 || typeof item.vat_applicable !== "boolean") throw new Error("VAT evidence");
    const document = issued ? taxObject(s.document) : null;
    if (issued && (!row.tax_invoice_no || !row.issued_at || document?.id !== row.id || document?.tax_invoice_no !== row.tax_invoice_no
      || document?.issue_date !== row.issue_date || Date.parse(taxText(document?.issued_at)) !== Date.parse(row.issued_at)
      || !taxText(customer.name) || !taxText(customer.address) || typeof customer.vat_registered !== "boolean"
      || !["standard_rated", "zero_rated"].includes(taxText(s.tax_treatment)) || point.no_earlier_event_acknowledged !== true
      || s.external_coverage_checked !== true || !taxText(point.approved_at) || !taxText(point.approved_by_user_id)
      || seller.vat_registered !== true || seller.branch_type !== "head_office" || seller.branch_code !== "00000"
      || !/^\d{13}$/.test(taxText(seller.tax_id))
      || (customer.vat_registered === true && (!/^\d{13}$/.test(taxText(customer.tax_id)) || !["head_office", "branch"].includes(taxText(customer.branch_type))
        || !/^\d{5}$/.test(taxText(customer.branch_code)) || (customer.branch_type === "head_office" ? customer.branch_code !== "00000" : customer.branch_code === "00000"))))) throw new Error("issued evidence");
    if (!issued && (row.tax_invoice_no || row.issued_at || s.document)) throw new Error("draft number");
    const issueDate = taxText(s.issue_date), taxPointDate = taxText(point.date);
    if (!taxDate(issueDate) || !taxDate(taxPointDate) || issueDate !== row.issue_date || taxPointDate !== payment.received_on) throw new Error("date");
    const identity = normalizeDocumentIdentity({ ...seller, branch_th: seller.branch_label_th, branch_en: seller.branch_label_en, logo_storage_path: logo.path });
    return { ok: true, value: { identity, logo, customer, description: taxText(item.description), beforeVat, vat, gross, cash, wht,
      vatRate: Number(item.vat_rate), invoiceNumber: taxText(invoice.invoice_no), paymentReference: taxText(payment.internal_reference) || row.payment_id.slice(0, 8).toUpperCase(),
      receiptNumber: s.receipt_reference ? taxText(taxObject(s.receipt_reference).receipt_no) : "", taxPointDate, issueDate,
      number: row.tax_invoice_no || "", treatment: taxText(s.tax_treatment), status: row.status } };
  } catch { return { ok: false, error: "หลักฐานใบกำกับภาษีไม่ครบหรือไม่สอดคล้อง จึงไม่แสดงเอกสารที่อาจคลาดเคลื่อน" }; }
}
export const taxReviewFingerprint = (row: TaxInvoice) => JSON.stringify([row.id, row.updated_at, row.draft_snapshot_json]);
