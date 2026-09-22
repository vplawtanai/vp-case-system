import type { UiLocale } from "../../../lib/i18n/core";

// Create-only choices. Each Thai atomic value is persisted as existing category text;
// group headings and search aliases are presentation only.
export type ClaimCategory = { value: string; label: Record<UiLocale, string>; group: Record<UiLocale, string>; keywords?: string };
const travel = { th: "เดินทาง", en: "Travel" }, court = { th: "งานคดี / ราชการ", en: "Cases / Government" }, documents = { th: "เอกสาร / การจัดส่ง", en: "Documents / Delivery" }, operations = { th: "การปฏิบัติงาน", en: "Work expenses" };
const category = (value: string, en: string, group: ClaimCategory["group"], keywords = ""): ClaimCategory => ({ value, label: { th: value, en }, group, keywords });
export const claimCategories: readonly ClaimCategory[] = [
 category("ค่าเดินทาง", "Travel (general)", travel),
 category("ค่าแท็กซี่ / Grab / รถรับจ้าง", "Taxi / Grab / Hired transport", travel),
 category("ค่าโดยสารสาธารณะ", "Public transport", travel),
 category("ค่าน้ำมัน", "Fuel", travel),
 category("ค่าทางด่วน", "Tolls", travel),
 category("ค่าที่จอดรถ", "Parking", travel),
 category("ค่าเดินทางต่างจังหวัด / ตั๋วโดยสาร", "Intercity travel / Tickets", travel),
 category("ค่าที่พัก", "Accommodation", travel),
 category("ค่าธรรมเนียมศาล", "Court fees", court),
 category("ค่าธรรมเนียมราชการ", "Government fees", court),
 category("ค่าอากรแสตมป์", "Stamp duty", court),
 category("ค่าคัดถ่าย / รับรองสำเนาเอกสาร", "Document copies / Certification", court, "ศาล court"),
 category("ค่านำหมาย / ค่าดำเนินการเกี่ยวกับคดี", "Service of process / Case expenses", court, "ศาล court"),
 category("ค่าส่งเอกสาร / Messenger", "Document delivery / Messenger", documents),
 category("ค่าไปรษณีย์ / ขนส่ง", "Postage / Shipping", documents),
 category("ค่าถ่ายเอกสาร / พิมพ์เอกสาร", "Photocopying / Printing", documents),
 category("ค่าเข้าเล่ม / จัดทำเอกสาร", "Binding / Document preparation", documents),
 category("ค่าอาหารระหว่างปฏิบัติงาน", "Meals during work", operations),
 category("ค่าเลี้ยงรับรอง / ประชุมลูกค้า", "Client hospitality / Meetings", operations),
 category("ค่าวัสดุ / อุปกรณ์สำนักงาน", "Office supplies / Equipment", operations),
 category("ค่าบริการภายนอก", "External services", operations),
 { value: "Other", label: { th: "อื่น ๆ", en: "Other" }, group: { th: "อื่น ๆ", en: "Other" } },
];
export function claimCategoryOptions(existing?: { value: string; label: string }): ClaimCategory[] {
 const options = [...claimCategories];
 if (existing?.value && !options.some(c => c.value === existing.value)) options.splice(-1, 0, { value: existing.value, label: { th: existing.label, en: existing.label }, group: { th: "หมวดเดิม", en: "Saved category" } });
 return options;
}
export function filterClaimCategories(options: readonly ClaimCategory[], query: string) {
 const search = query.trim().normalize("NFC").toLocaleLowerCase();
 return options.filter(c => c.value === "Other" || `${c.value} ${c.label.th} ${c.label.en} ${c.keywords || ""}`.normalize("NFC").toLocaleLowerCase().includes(search));
}
