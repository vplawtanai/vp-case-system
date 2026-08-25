export type FeeAgreementLifecycleTarget = "under_review" | "sent" | "signed" | "completed" | "cancelled";

const statusLabels: Record<string, string> = {
  draft: "ร่าง",
  under_review: "อยู่ระหว่างตรวจทาน",
  sent: "ส่งเอกสารให้ลูกค้าแล้ว",
  signed: "ลงนามแล้ว",
  completed: "ปิดกระบวนการเอกสารแล้ว",
  cancelled: "ยกเลิก",
  active: "มีผลใช้งาน (ข้อมูลเดิม)",
};

const statusDescriptions: Record<string, string> = {
  draft: "เอกสารยังแก้ไขได้ เมื่อข้อมูลและเอกสารถูกต้องแล้ว ให้ส่งเข้าสู่ขั้นตอนตรวจทาน",
  under_review: "เอกสารอยู่ระหว่างตรวจสอบความครบถ้วน ก่อนส่งให้ลูกค้าผ่านช่องทางภายนอก",
  sent: "เอกสารฉบับนี้ถูกส่งให้ลูกค้าแล้ว ระบบได้เก็บเอกสารฉบับที่ส่งไว้เป็นหลักฐาน และกำลังรอการลงนาม",
  signed: "ระบบบันทึกสถานะว่าลงนามแล้ว และเอกสารพร้อมให้ปิดกระบวนการเอกสาร",
  completed: "ปิดกระบวนการจัดทำเอกสารแล้ว โดยไม่เปลี่ยนสถานะงาน การเรียกเก็บเงิน หรือการชำระเงิน",
  cancelled: "เอกสารถูกยกเลิกและเก็บไว้เพื่อการตรวจสอบ ไม่สามารถดำเนินการต่อในกระบวนการปกติ",
  active: "เอกสารเดิมที่ยังมีผล ระบบเก็บสถานะไว้เพื่อความเข้ากันได้กับข้อมูลเดิม",
};

const actionDescriptions: Record<FeeAgreementLifecycleTarget, string> = {
  under_review: "ส่งให้ผู้มีสิทธิ์ตรวจทานความครบถ้วนก่อนส่งให้ลูกค้า",
  sent: "เมื่อส่งเอกสารให้ลูกค้าทาง LINE, Email, กระดาษ หรือช่องทางอื่นเรียบร้อยแล้ว ให้กดปุ่มนี้เพื่อบันทึกสถานะ ระบบไม่ได้ส่งเอกสารให้ลูกค้าโดยอัตโนมัติ",
  signed: "ใช้เมื่อได้รับเอกสารฉบับที่ลงนามแล้วและตรวจสอบผู้ลงนามเรียบร้อยแล้ว",
  completed: "ปิดเฉพาะกระบวนการเอกสาร ไม่เปลี่ยนสถานะงาน การเรียกเก็บเงิน หรือการชำระเงิน",
  cancelled: "ยกเลิกเอกสารและเก็บไว้เพื่อการตรวจสอบ",
};

const actionLabels: Record<FeeAgreementLifecycleTarget, string> = {
  under_review: "ส่งตรวจทาน",
  sent: "บันทึกว่าส่งเอกสารให้ลูกค้าแล้ว",
  signed: "บันทึกว่าลงนามแล้ว",
  completed: "ปิดกระบวนการเอกสาร",
  cancelled: "ยกเลิกเอกสาร",
};

const confirmations: Record<FeeAgreementLifecycleTarget, string> = {
  under_review: "ส่งเอกสารเพื่อตรวจทาน?\n\nเอกสารจะเปลี่ยนเป็นสถานะอยู่ระหว่างตรวจทาน ผู้มีสิทธิ์ยังสามารถแก้ไขข้อกำหนดได้ และทุกการแก้ไขจะถูกบันทึกเป็นเวอร์ชันใหม่",
  sent: "ยืนยันว่าได้ส่งเอกสารให้ลูกค้าแล้ว?\n\nระบบจะบันทึกเอกสารฉบับที่ส่งไว้เป็นหลักฐาน และเปลี่ยนสถานะเป็น “ส่งเอกสารให้ลูกค้าแล้ว” ระบบไม่ได้ส่งเอกสารให้ลูกค้าโดยอัตโนมัติ",
  signed: "ยืนยันว่าต้องการบันทึกสถานะว่าลงนามแล้ว?\n\nการดำเนินการนี้เป็นการบันทึกสถานะโดยผู้ใช้ ระบบยังไม่ได้ตรวจสอบลายมือชื่ออิเล็กทรอนิกส์หรือไฟล์หลักฐานโดยอัตโนมัติ",
  completed: "ยืนยันการปิดกระบวนการเอกสาร?\n\nสถานะนี้ปิดเฉพาะกระบวนการจัดทำเอกสาร ไม่ได้หมายความว่างาน การเรียกเก็บเงิน หรือการชำระเงินเสร็จสิ้น",
  cancelled: "ยืนยันการยกเลิกเอกสาร?\n\nเอกสารที่ยกเลิกจะยังคงอยู่ในระบบเพื่อการตรวจสอบ แต่ไม่สามารถนำกลับมาใช้ในกระบวนการปกติได้",
};

const versionEventLabels: Record<string, string> = {
  created: "สร้างเอกสาร",
  draft_saved: "บันทึกการเปลี่ยนแปลงร่าง",
  under_review_saved: "บันทึกการเปลี่ยนแปลงระหว่างตรวจทาน",
  draft_metadata_saved: "แก้ไขข้อมูลเอกสาร",
  under_review_metadata_saved: "แก้ไขข้อมูลเอกสารระหว่างตรวจทาน",
  draft_legal_terms_saved: "แก้ไขข้อกำหนดสัญญา",
  under_review_legal_terms_saved: "แก้ไขข้อกำหนดระหว่างตรวจทาน",
  under_review: "ส่งตรวจทาน",
  sent: "บันทึกการส่งเอกสารให้ลูกค้า",
  signed: "บันทึกว่าลงนามแล้ว",
  completed: "ปิดกระบวนการเอกสาร",
  cancelled: "ยกเลิก",
};

export function feeAgreementStatusLabel(status: string) {
  return statusLabels[status] || status;
}

export function feeAgreementStatusDescription(status: string) {
  return statusDescriptions[status] || "ตรวจสอบสถานะและข้อมูลเอกสารก่อนดำเนินการขั้นตอนถัดไป";
}

export function feeAgreementActionDescription(status: FeeAgreementLifecycleTarget) {
  return actionDescriptions[status];
}

export function feeAgreementLifecycleActionLabel(status: FeeAgreementLifecycleTarget) {
  return actionLabels[status];
}

export function feeAgreementLifecycleConfirmation(status: FeeAgreementLifecycleTarget) {
  return confirmations[status];
}

export function feeAgreementLifecycleSuccess(status: FeeAgreementLifecycleTarget) {
  if (status === "sent") return "บันทึกการส่งเอกสารให้ลูกค้าเรียบร้อยแล้ว และเก็บเอกสารฉบับที่ส่งไว้เป็นหลักฐานแล้ว";
  if (status === "signed") return "บันทึกสถานะว่าลงนามแล้ว และบันทึกเวอร์ชันเอกสารแล้ว";
  if (status === "completed") return "ปิดกระบวนการเอกสารแล้ว และบันทึกเวอร์ชันเอกสารแล้ว";
  return `อัปเดตสถานะเป็น ${feeAgreementStatusLabel(status)} และบันทึกเวอร์ชันแล้ว`;
}

export function feeAgreementVersionEventLabel(event: string) {
  return versionEventLabels[event] || event.replaceAll("_", " ");
}
