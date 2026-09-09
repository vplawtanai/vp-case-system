import { taxError } from "../tax-invoices/shared";

export type VatTreatment = "standard_rate" | "zero_rated" | "exempt" | "outside_scope" | "disbursement" | "pass_through" | "unknown";
export type VatEvidence = { schema_version?: number; treatment: VatTreatment; reason?: string | null; basis?: string };
export const vatTreatmentLabels: Record<VatTreatment, string> = {
  standard_rate: "VAT ตามอัตราต้นทาง", zero_rated: "VAT 0% (อัตราศูนย์)", exempt: "ยกเว้น VAT",
  outside_scope: "ไม่อยู่ในบังคับ VAT", disbursement: "เงินทดรองจ่ายแทนที่ได้รับการรับรอง", pass_through: "รายการผ่านบัญชีที่ได้รับการรับรอง", unknown: "ยังไม่ระบุ VAT Treatment",
};
export function resolveVatEvidence(evidence: VatEvidence | null | undefined, applicable: boolean, rate: number): VatTreatment {
  if (applicable && rate > 0 && rate <= 100) return !evidence || ["unknown", "standard_rate"].includes(evidence.treatment) ? "standard_rate" : "unknown";
  if (!evidence?.reason?.trim() || rate !== 0) return "unknown";
  if (applicable) return evidence.treatment === "zero_rated" ? "zero_rated" : "unknown";
  return ["exempt", "outside_scope", "disbursement", "pass_through"].includes(evidence.treatment) ? evidence.treatment : "unknown";
}
export type DocumentLine = { id: string; invoice_id: string; description: string; amount_before_vat: number | string; vat_amount: number | string; line_total: number | string; vat_rate: number | string; resolved_vat_treatment: VatEvidence };
export type DocumentDecision = {
  decision: string; lines: DocumentLine[]; unknown_lines?: DocumentLine[]; blockers?: string[];
  receipt_id?: string | null; receipt_status?: string | null; tax_invoice_id?: string | null; tax_invoice_status?: string | null;
  combined_id?: string | null; combined_status?: string | null;
};
export const documentDecisionLabels: Record<string, string> = {
  receipt_only: "จัดทำใบเสร็จรับเงิน", combined_receipt_tax_invoice: "จัดทำใบเสร็จรับเงิน/ใบกำกับภาษี",
  tax_invoice_completion_only: "จัดทำใบกำกับภาษีส่วนที่ยังขาด", receipt_completion_only: "จัดทำใบเสร็จรับเงินส่วนที่ยังขาด",
  complete: "เอกสารครบแล้ว", blocked_unknown_treatment: "ยังตัดสินประเภทเอกสารไม่ได้: มีรายการที่ยังไม่ระบุ VAT Treatment",
  blocked_partial_taxable: "รายการรับชำระนี้เป็นการชำระบางส่วนและมีรายการ VAT ระบบยังไม่สามารถระบุฐานภาษีของเงินรับครั้งนี้ได้อย่างปลอดภัย",
  blocked_multiple_invoices: "การจัดทำเอกสารภาษีสำหรับหลายใบแจ้งหนี้ในรายการรับชำระเดียวต้องผ่านขั้นตอนตรวจสอบที่ยังไม่รองรับ",
  blocked_payment: "ต้องยืนยันรายการรับชำระก่อน",
};
export function documentError(error: unknown): string {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  for (const [key, text] of Object.entries(documentDecisionLabels)) if (message.includes("DOCUMENT_ROUTE_" + key.toUpperCase())) return text;
  const known: Record<string,string> = {
    DOCUMENT_PERMISSION_DENIED: "ไม่มีสิทธิ์ดำเนินการเอกสารทั้งสองประเภท", DOCUMENT_EXTERNAL_CHECK_REQUIRED: "กรุณาตรวจสอบเอกสารและเลขที่ที่ออกหรือจองไว้นอกระบบทั้งสองประเภท",
    DOCUMENT_EXISTING_STANDALONE_DRAFT: "มีร่างเอกสารแยกอยู่แล้ว กรุณาเปิดตรวจสอบและยกเลิกร่างเดิมก่อนจัดทำเอกสารรวม",
    DOCUMENT_SOURCE_CHANGED: "ต้นทางเปลี่ยนแปลง กรุณารีเฟรชร่างแล้วตรวจสอบใหม่", DOCUMENT_STALE_REVIEW: "ข้อมูลเปลี่ยนหลังตรวจสอบ กรุณาโหลดข้อมูลล่าสุด",
    DOCUMENT_USE_COMBINED_WORKFLOW: "เอกสารนี้ต้องดำเนินการผ่านใบเสร็จรับเงิน/ใบกำกับภาษีที่เชื่อมโยงกัน",
    DOCUMENT_UNKNOWN_TREATMENT_BEFORE_ISSUE: "กรุณาระบุ VAT Treatment ที่ต้นทางก่อนออกใบแจ้งหนี้",
    DOCUMENT_VAT_CONFLICT: "VAT Treatment ไม่สอดคล้องกับอัตราภาษีหรือยังไม่มีเหตุผลประกอบ", DOCUMENT_CORRECTION_WORKFLOW_REQUIRED: "เอกสารที่ออกแล้วต้องใช้ขั้นตอนแก้ไขเฉพาะประเภท ห้ามยกเลิกรวม",
  };
  for (const [code,text] of Object.entries(known)) if (message.includes(code)) return text;
  return taxError(error);
}
