import type { UiLocale } from "../../../lib/i18n/core";

type Category = { value: string; label: Record<UiLocale, string> };
// Namespaced text values keep older, aggregated categories historically distinguishable.
const group = (th: string, en: string, rows: [string, string, string][]) => ({ label: { th, en }, items: rows.map(([key, th, en]): Category => ({ value: `company.${key}`, label: { th, en } })) });
export const companyCategoryGroups = [
 group("เดินทาง", "Travel", [["travel", "ค่าเดินทาง", "Travel"], ["accommodation", "ค่าที่พัก", "Accommodation"], ["fuel", "ค่าน้ำมัน", "Fuel"], ["tolls", "ค่าทางด่วน", "Tolls"], ["parking", "ค่าที่จอดรถ", "Parking"]]),
 group("เอกสาร / ราชการ", "Documents / Government", [["courier", "ค่าส่งเอกสาร", "Document delivery"], ["postage", "ค่าไปรษณีย์", "Postage"], ["shipping", "ค่าขนส่ง", "Shipping"], ["photocopies", "ค่าถ่ายเอกสาร", "Photocopies"], ["certified_copies", "ค่าคัดเอกสาร", "Certified copies"], ["court_fees", "ค่าธรรมเนียมศาล", "Court fees"], ["government_fees", "ค่าธรรมเนียมราชการ", "Government fees"], ["stamp_duty", "อากรแสตมป์", "Stamp duty"]]),
 group("สำนักงาน", "Office", [["rent", "ค่าเช่า", "Rent"], ["utilities", "ค่าสาธารณูปโภค", "Utilities"], ["phone", "ค่าโทรศัพท์", "Phone"], ["internet", "ค่าอินเทอร์เน็ต", "Internet"], ["supplies", "วัสดุสำนักงาน", "Office supplies"], ["equipment", "อุปกรณ์สำนักงาน", "Office equipment"], ["maintenance", "ค่าซ่อมบำรุง", "Maintenance"], ["equipment_repairs", "ค่าซ่อมอุปกรณ์", "Equipment repairs"]]),
 group("เทคโนโลยี", "Technology", [["software", "ค่าซอฟต์แวร์", "Software"], ["cloud", "ค่าระบบ / Cloud service", "Systems / Cloud services"], ["hosting", "ค่าเว็บไซต์ / Hosting / Domain", "Website / Hosting / Domain"]]),
 group("บริการวิชาชีพ", "Professional services", [["freelance", "ค่าผู้ช่วย / Freelance", "Assistants / Freelancers"], ["accounting", "ค่าบัญชี", "Accounting"], ["advisory", "ค่าที่ปรึกษา", "Advisory"], ["professional", "ค่าบริการวิชาชีพอื่น", "Other professional services"]]),
 group("ธุรกิจ / บริหาร", "Business / Administration", [["marketing", "การตลาด", "Marketing"], ["advertising", "โฆษณา", "Advertising"], ["hospitality", "รับรองลูกค้า", "Client hospitality"], ["meetings", "ประชุมงาน / กิจกรรม", "Meetings / Events"], ["bank_fees", "ค่าธรรมเนียมธนาคาร / บริการการเงิน", "Bank fees / Financial services"]]),
 { label: { th: "อื่น ๆ", en: "Other" }, items: [{ value: "Other", label: { th: "อื่น ๆ", en: "Other" } }] },
];
export const companyCategories = companyCategoryGroups.flatMap(group => group.items);
