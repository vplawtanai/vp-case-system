import { invoiceTaxFacts } from "../payments/tax";
import { taxObject, taxText } from "./shared";

export type VatTreatment = "standard_rate" | "zero_rated" | "exempt" | "outside_scope" | "unknown";
export type VatTreatmentPresentation = { label: string; workflow: "applies" | "not_applicable" | "unresolved"; status: string; explanation: string };
export const unknownVatExplanation = "ระบบยังไม่สามารถระบุได้ว่ารายการนี้เป็น VAT 0%, ยกเว้น VAT, ไม่อยู่ในบังคับ VAT หรือรายการผ่านบัญชี";
export const unknownTaxDecision = "ยังไม่สามารถตัดสินสถานะใบกำกับภาษีได้ เนื่องจาก VAT Treatment ยังไม่ครบ";
export const vatSummaryUnavailable = "ยังไม่สามารถอ่านหลักฐาน VAT ของใบแจ้งหนี้ได้ครบ กรุณาโหลดข้อมูลล่าสุดหรือติดต่อผู้ดูแลเพื่อตรวจสอบสิทธิ์และหลักฐานต้นทาง";

// Display vocabulary, not a decoder of free-text tax_category or economic classification.
export function vatTreatmentPresentation(treatment: VatTreatment, rate: number | null): VatTreatmentPresentation {
  switch (treatment) {
    case "standard_rate":
      if (rate !== null && Number.isFinite(rate) && rate > 0 && rate <= 100) return {
        label: `VAT ${rate}%`, workflow: "applies", status: "ต้องดำเนินการใบกำกับภาษี",
        explanation: "รายการนี้อยู่ในระบบ VAT และต้องดำเนินการใบกำกับภาษีเมื่อจุดเกิดภาษีได้รับการยืนยัน",
      };
      break;
    case "zero_rated": return {
      label: "VAT 0% (อัตราศูนย์)", workflow: "applies", status: "ต้องดำเนินการใบกำกับภาษี",
      explanation: "รายการนี้ใช้อัตรา VAT 0% แต่ยังอยู่ในระบบ VAT และยังเกี่ยวข้องกับใบกำกับภาษี",
    };
    case "exempt": return {
      label: "ยกเว้น VAT", workflow: "not_applicable", status: "ไม่เข้าสู่ขั้นตอนใบกำกับภาษี VAT",
      explanation: "รายการนี้ได้รับยกเว้น VAT จึงไม่เข้าสู่ขั้นตอนออกใบกำกับภาษี VAT สำหรับรายการนี้",
    };
    case "outside_scope": return {
      label: "ไม่อยู่ในบังคับ VAT", workflow: "not_applicable", status: "ไม่เข้าสู่ขั้นตอนใบกำกับภาษี VAT",
      explanation: "รายการนี้ไม่อยู่ในบังคับ VAT จึงไม่เข้าสู่ขั้นตอนออกใบกำกับภาษี VAT สำหรับรายการนี้",
    };
  }
  return { label: "ยังไม่ได้กำหนด VAT Treatment", workflow: "unresolved", status: "ยังตัดสินสถานะใบกำกับภาษีไม่ได้", explanation: unknownTaxDecision };
}

export type InvoiceVatLine = {
  invoiceId: string; invoiceNumber: string; id: string; description: string; currency: string;
  beforeVat: number; vat: number; treatment: VatTreatment; rate: number | null;
};

export function invoiceVatLines(snapshot: unknown, expectedInvoiceId: string): InvoiceVatLine[] {
  const facts = invoiceTaxFacts(snapshot);
  if (!facts || facts.invoiceId !== expectedInvoiceId) throw new Error("Invalid frozen VAT source");
  const source = taxObject(snapshot), invoice = taxObject(source.invoice);
  const entries = source.items as unknown[];
  return facts.lines.map((factsLine, index) => {
    const item = taxObject(facts.version === 2 ? taxObject(entries[index]).invoice_item : entries[index]);
    const description = taxText(item.description), invoiceNumber = taxText(invoice.invoice_no);
    if (!description || !invoiceNumber) throw new Error("Incomplete frozen VAT source");
    const rateValue = item.vat_rate;
    const rate = (typeof rateValue === "number" || typeof rateValue === "string") && /^\d+(?:\.\d{1,4})?$/.test(String(rateValue))
      && Number(rateValue) <= 100 ? Number(rateValue) : null;
    // Current Invoice snapshots have no controlled zero/exempt/outside-scope/pass-through evidence.
    // Even vat_applicable=true + rate=0 is not an explicit zero-rating approval.
    const treatment = factsLine.vatApplicable && rate !== null && rate > 0 ? "standard_rate" : "unknown";
    return { invoiceId: facts.invoiceId, invoiceNumber, id: factsLine.id, description, currency: facts.currency,
      beforeVat: factsLine.beforeVat, vat: factsLine.vat, treatment, rate };
  });
}
