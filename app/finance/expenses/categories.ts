import type { UiLocale } from "../../../lib/i18n/core";
import { companyCategories } from "./company-categories";

export type ExpenseWorkflow = "company" | "claim";
type ExpenseCategory = { value: string; workflow: ExpenseWorkflow | "both" | null; label: Record<UiLocale, string> };

// Values are persisted text, not display labels. Null workflow retains historical values without offering them for creation.
export const expenseCategories: readonly ExpenseCategory[] = [
 { value: "ค่าตอบแทนผู้ช่วย / ฟรีแลนซ์", workflow: "company", label: { th: "ค่าบริการ / ผู้ช่วย / ฟรีแลนซ์", en: "Services / Assistants / Freelancers" } },
 { value: "ค่าเดินทาง", workflow: "both", label: { th: "ค่าเดินทาง / ที่พัก", en: "Travel / Accommodation" } },
 { value: "ค่าน้ำมัน / ทางด่วน / ที่จอดรถ", workflow: "both", label: { th: "ค่าน้ำมัน / ทางด่วน / ที่จอดรถ", en: "Fuel / Tolls / Parking" } },
 { value: "ค่าส่งเอกสาร", workflow: "both", label: { th: "ค่าส่งเอกสาร / ไปรษณีย์ / ขนส่ง", en: "Courier / Postage / Shipping" } },
 { value: "ค่าถ่ายเอกสาร / ค่าเอกสาร", workflow: "both", label: { th: "ค่าเอกสาร / ถ่ายเอกสาร / คัดเอกสาร", en: "Documents / Copies / Certified copies" } },
 { value: "ค่าธรรมเนียมศาล / ค่าธรรมเนียมราชการ", workflow: "both", label: { th: "ค่าธรรมเนียมศาล / ราชการ / อากรแสตมป์", en: "Court / Government fees / Stamp duty" } },
 { value: "ค่าเช่า / ค่าใช้จ่ายสำนักงาน", workflow: "company", label: { th: "ค่าเช่า / สาธารณูปโภค / โทรศัพท์ / อินเทอร์เน็ต", en: "Rent / Utilities / Phone / Internet" } },
 { value: "อุปกรณ์สำนักงาน", workflow: "both", label: { th: "วัสดุ / อุปกรณ์สำนักงาน", en: "Office supplies / Equipment" } },
 { value: "ค่า Software / System", workflow: "company", label: { th: "ซอฟต์แวร์ / ระบบ / เว็บไซต์ / โดเมน", en: "Software / Systems / Websites / Domains" } },
 { value: "ค่าบัญชี / ภาษี / ที่ปรึกษา", workflow: "company", label: { th: "ค่าบัญชี / ที่ปรึกษา / วิชาชีพ", en: "Accounting / Advisory / Professional fees" } },
 { value: "ค่าการตลาด / โฆษณา", workflow: "company", label: { th: "การตลาด / โฆษณา", en: "Marketing / Advertising" } },
 { value: "ค่าธรรมเนียมธนาคาร", workflow: "company", label: { th: "ค่าธรรมเนียมธนาคาร / บริการการเงิน", en: "Bank fees / Financial services" } },
 { value: "รับรองลูกค้า / ประชุมงาน", workflow: "both", label: { th: "รับรองลูกค้า / ประชุมงาน / กิจกรรม", en: "Client hospitality / Meetings / Events" } },
 { value: "ค่าซ่อมบำรุง / ทรัพย์สิน / อุปกรณ์", workflow: "company", label: { th: "ซ่อมบำรุง / ทรัพย์สิน / อุปกรณ์", en: "Maintenance / Assets / Equipment" } },
 { value: "Other", workflow: "both", label: { th: "อื่น ๆ", en: "Other" } },
 { value: "เงินเดือน / ค่าจ้าง", workflow: null, label: { th: "เงินเดือน / ค่าจ้าง", en: "Salaries / Wages" } },
 { value: "ค่าอากร / ภาษี", workflow: null, label: { th: "ค่าอากร / ภาษี", en: "Duties / Taxes" } },
 { value: "ค่าใช้จ่ายทั่วไป", workflow: null, label: { th: "ค่าใช้จ่ายทั่วไป", en: "General expenses" } },
 { value: "ค่าเว็บไซต์ / Hosting / Domain", workflow: null, label: { th: "ค่าเว็บไซต์ / โฮสติ้ง / โดเมน", en: "Website / Hosting / Domain" } },
];

export function expenseCategoryOptions(workflow: ExpenseWorkflow, existingValue?: string) {
 return expenseCategories.filter(category => category.workflow === workflow || category.workflow === "both" || category.value === existingValue);
}

export function expenseCategoryLabel(value: string | null, locale: UiLocale) {
 return companyCategories.find(category => category.value === value)?.label[locale] || expenseCategories.find(category => category.value === value)?.label[locale] || value || "-";
}

export function expenseCategoryChoice(value: string) {
 return [...expenseCategories, ...companyCategories].some(category => category.value === value) ? value : value ? "Other" : "";
}
