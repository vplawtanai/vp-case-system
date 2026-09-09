import { translate } from "./catalog";
import { uiMessage, type UiLocale, type UiMessage } from "./core";

// Legacy categories are persisted values. Translate their labels, never the values.
const categoryKeys: Record<string, string> = {
  "ยอดยกมาก่อนเริ่มระบบ": "finance.legacy.category.opening",
  "เงินเข้าบริษัทจากคดี": "finance.legacy.category.caseIncome",
  "เงินเข้าบริษัทจาก Advisory": "finance.legacy.category.advisoryIncome",
  "ค่าเดินทางรับจากลูกค้า": "finance.legacy.category.travelIncome",
  "เงินคืนค่าใช้จ่าย": "finance.legacy.category.expenseRefund",
  "รายรับอื่น": "finance.legacy.category.otherIncome",
  "เงินเดือน / ค่าจ้าง": "finance.legacy.category.salary",
  "ค่าตอบแทนผู้ช่วย / ฟรีแลนซ์": "finance.legacy.category.assistant",
  "ค่าเดินทาง": "finance.legacy.category.travel",
  "ค่าน้ำมัน / ทางด่วน / ที่จอดรถ": "finance.legacy.category.fuel",
  "ค่าส่งเอกสาร": "finance.legacy.category.delivery",
  "ค่าถ่ายเอกสาร / ค่าเอกสาร": "finance.legacy.category.copies",
  "ค่าธรรมเนียมศาล / ค่าธรรมเนียมราชการ": "finance.legacy.category.officialFees",
  "ค่าอากร / ภาษี": "finance.legacy.category.tax",
  "ค่าเช่า / ค่าใช้จ่ายสำนักงาน": "finance.legacy.category.rent",
  "อุปกรณ์สำนักงาน": "finance.legacy.category.supplies",
  "ค่า Software / System": "finance.legacy.category.software",
  "ค่าเว็บไซต์ / Hosting / Domain": "finance.legacy.category.hosting",
  "ค่าการตลาด / โฆษณา": "finance.legacy.category.marketing",
  "ค่าบัญชี / ภาษี / ที่ปรึกษา": "finance.legacy.category.professional",
  "ค่าธรรมเนียมธนาคาร": "finance.legacy.category.bankFees",
  "รับรองลูกค้า / ประชุมงาน": "finance.legacy.category.hospitality",
  "ค่าใช้จ่ายทั่วไป": "finance.legacy.category.general",
  "โอนย้ายระหว่างบัญชีบริษัท": "finance.legacy.category.transfer",
  "Other": "finance.legacy.category.other",
};

export function legacyCategoryLabel(value: string | null, locale: UiLocale): string {
  return value && categoryKeys[value] ? translate(locale, categoryKeys[value]) : value || "-";
}

export function legacyStatusLabel(value: string, locale: UiLocale): string {
  const supported = ["active", "voided", "submitted", "approved", "paid", "unpaid", "rejected", "draft", "finalized", "posted"];
  return supported.includes(value) ? translate(locale, `finance.legacy.status.${value}`) : value;
}

const roleKeys: Record<string, string> = {
  "Client Source / Broker": "finance.compensation.role.source",
  "Company Share": "finance.compensation.fields.companyShare",
  "Lead Lawyer / Case Owner": "finance.compensation.role.lead",
  "Co-Lawyer / Co-Worker": "finance.compensation.role.worker",
  "Assistant": "finance.compensation.role.assistant",
  "Quality Controller": "finance.compensation.role.qc",
  "Other": "finance.legacy.choice.other",
};

export function compensationRoleLabel(value: string, locale: UiLocale): string {
  return roleKeys[value] ? translate(locale, roleKeys[value]) : value;
}

export function legacyOperationError(error: unknown, fallback: UiMessage): UiMessage {
  if (!error) return fallback;
  console.error("LEGACY FINANCE OPERATION FAILED", error);
  const primary = error && typeof error === "object" && "message" in error ? String(error.message || "") : typeof error === "string" ? error : "";
  if (/permission denied|not allowed|row.level.security/i.test(primary)) return uiMessage("finance.legacy.error.permission");
  // Retain a bounded primary diagnostic, without query context, IDs or credentials.
  const message = primary
    .split(/\n|\b(?:DETAIL|HINT|CONTEXT|STATEMENT|QUERY|SQL):/i)[0]
    .replace(/(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:token|password|secret|cookie|authorization)\s*[:=]\s*\S+)/gi, "[redacted]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\b(?:public|auth|storage)\.[a-z_][a-z0-9_]*/gi, "[object]")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, 240).trim();
  return message ? uiMessage("finance.legacy.error.technical", { message }) : fallback;
}
