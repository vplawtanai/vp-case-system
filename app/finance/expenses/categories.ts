// Preserve the Legacy Expense Claim vocabulary and stored values; labels use legacyCategoryLabel.
export const expenseCategories = [
 "เงินเดือน / ค่าจ้าง",
 "ค่าตอบแทนผู้ช่วย / ฟรีแลนซ์",
 "ค่าเดินทาง",
 "ค่าน้ำมัน / ทางด่วน / ที่จอดรถ",
 "ค่าส่งเอกสาร",
 "ค่าถ่ายเอกสาร / ค่าเอกสาร",
 "ค่าธรรมเนียมศาล / ค่าธรรมเนียมราชการ",
 "ค่าอากร / ภาษี",
 "ค่าเช่า / ค่าใช้จ่ายสำนักงาน",
 "อุปกรณ์สำนักงาน",
 "ค่า Software / System",
 "ค่าเว็บไซต์ / Hosting / Domain",
 "ค่าการตลาด / โฆษณา",
 "ค่าบัญชี / ภาษี / ที่ปรึกษา",
 "ค่าธรรมเนียมธนาคาร",
 "รับรองลูกค้า / ประชุมงาน",
 "ค่าใช้จ่ายทั่วไป",
 "Other",
] as const;

export function expenseCategoryChoice(value: string) {
 return expenseCategories.some(category => category === value) ? value : value ? "Other" : "";
}
