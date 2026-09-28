// Shared validation/display contract. No Auth credentials or privileged client here.
export const PEOPLE_ROLES = ["admin", "partner", "lawyer", "assistant_lawyer", "staff", "viewer"] as const;
export type AccountType = "operational" | "uat" | null;
export type PeopleProfile = {
  id: string; email: string | null; full_name: string | null; staff_name: string | null;
  role: string; active: boolean; financial_access: boolean;
  finance_operator?: boolean; account_type: AccountType; assignable: boolean; must_change_password?: boolean;
  [key: string]: unknown;
};
export const ROLE_LABELS: Record<string, string> = {
  admin: "ผู้ดูแลระบบ", partner: "หุ้นส่วน", lawyer: "ทนายความ",
  assistant_lawyer: "ผู้ช่วยทนายความ", staff: "เจ้าหน้าที่", viewer: "ผู้ดูข้อมูล",
};
// Existing capability columns only. Role changes never synthesize/clear these flags.
export const CAPABILITY_LABELS: Record<string, string> = {
  financial_access: "เข้าถึงข้อมูลการเงิน",
  can_submit_expense_claim: "ส่งคำขอเบิกค่าใช้จ่ายเดิม",
  can_view_own_expense_claims: "ดูคำขอเบิกเดิมของตนเอง",
  can_view_all_expense_claims: "ดูคำขอเบิกเดิมทั้งหมด",
  can_approve_expense_claims: "อนุมัติคำขอเบิกเดิม",
  can_pay_expense_claims: "จ่ายคำขอเบิกเดิม",
  can_view_company_ledger: "ดูบัญชีบริษัทเดิม",
  can_edit_company_ledger: "แก้ไขบัญชีบริษัทเดิม",
  can_void_company_ledger: "ยกเลิกรายการบัญชีบริษัทเดิม",
  can_view_lawyer_compensation: "ดูค่าตอบแทนทนายเดิม",
  can_edit_lawyer_compensation: "แก้ไขค่าตอบแทนทนายเดิม",
  can_void_lawyer_compensation: "ยกเลิกค่าตอบแทนทนายเดิม",
  can_manage_finance_payments: "จัดการเงินรับ",
  can_confirm_finance_payments: "ยืนยันเงินรับ",
  can_reverse_finance_payments: "กลับรายการเงินรับ",
  can_reallocate_finance_payments: "จัดสรรเงินรับใหม่",
  can_view_finance_receipts: "ดูใบเสร็จรับเงิน",
  can_manage_finance_receipts: "จัดการใบเสร็จรับเงิน",
  can_issue_finance_receipts: "ออกใบเสร็จรับเงิน",
  can_void_finance_receipts: "ยกเลิกใบเสร็จรับเงิน",
  can_view_finance_tax_invoices: "ดูใบกำกับภาษี",
  can_manage_finance_tax_invoices: "จัดการใบกำกับภาษี",
  can_issue_finance_tax_invoices: "ออกใบกำกับภาษี",
  can_view_finance_cash_transactions: "ดูรายการเงินสดและบัญชี",
  can_manage_finance_cash_transactions: "จัดการรายการเงินสดและบัญชี",
  can_confirm_finance_cash_transactions: "ยืนยันรายการเงินสดและบัญชี",
  can_reverse_finance_cash_transactions: "กลับรายการเงินสดและบัญชี",
  can_view_finance_billable_charges: "ดูรายการเรียกเก็บ",
  can_manage_finance_billable_charges: "จัดการรายการเรียกเก็บ",
  can_approve_finance_billable_charges: "อนุมัติรายการเรียกเก็บ",
  can_submit_office_work_log: "บันทึกงานสำนักงาน",
  can_view_own_office_work_logs: "ดูงานสำนักงานของตนเอง",
  can_view_all_office_work_logs: "ดูงานสำนักงานทั้งหมด",
  can_edit_office_work_logs: "แก้ไขงานสำนักงาน",
  can_void_office_work_logs: "ยกเลิกงานสำนักงาน",
};
export function isActiveAdmin(profile: { role?: unknown; active?: unknown } | null | undefined) {
  return profile?.role === "admin" && profile?.active === true;
}
export function isAssignablePerson(profile: { active?: unknown; account_type?: unknown; assignable?: unknown }) {
  return profile.active === true && profile.account_type === "operational" && profile.assignable === true;
}
export const PROFILE_FIELDS = ["full_name", "staff_name", "role", "active", "account_type", "assignable", "finance_operator", ...Object.keys(CAPABILITY_LABELS)];
export function validatePeopleInput(value: unknown, creating = false): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const input = value as Record<string, unknown>;
  const allowed = creating ? ["email", "full_name", "staff_name", "role", "account_type", "assignable"] : PROFILE_FIELDS;
  if (!Object.keys(input).length || Object.keys(input).some(key => !allowed.includes(key))) throw new Error("INVALID_INPUT");
  const result = { ...input };
  for (const key of ["email", "full_name", "staff_name"]) {
    if (!(key in result)) continue;
    if (typeof result[key] !== "string" || result[key].length > (key === "email" ? 254 : 200)) throw new Error("INVALID_INPUT");
    result[key] = result[key].trim();
  }
  if ("full_name" in result && !result.full_name) throw new Error("INVALID_INPUT");
  if ("role" in result && !PEOPLE_ROLES.includes(result.role as typeof PEOPLE_ROLES[number])) throw new Error("INVALID_INPUT");
  if ("account_type" in result && ![null, "operational", "uat"].includes(result.account_type as AccountType)) throw new Error("INVALID_INPUT");
  for (const key of ["active", "assignable", "finance_operator", ...Object.keys(CAPABILITY_LABELS)]) {
    if (key in result && typeof result[key] !== "boolean") throw new Error("INVALID_INPUT");
  }
  if (creating) {
    if (typeof result.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)
      || !result.full_name || !result.role || !result.account_type || typeof result.assignable !== "boolean") throw new Error("INVALID_INPUT");
    result.email = result.email.toLowerCase();
    result.staff_name ??= "";
  }
  if (result.assignable === true && (result.account_type === "uat" || result.account_type === null || result.active === false)) throw new Error("NOT_ASSIGNABLE");
  return result;
}
export const PEOPLE_ERRORS: Record<string, string> = {
  UNAUTHORIZED: "กรุณาเข้าสู่ระบบอีกครั้ง", FORBIDDEN: "เฉพาะผู้ดูแลระบบที่เปิดใช้งานเท่านั้น",
  INVALID_INPUT: "กรุณาตรวจสอบข้อมูลที่กรอก", NOT_ASSIGNABLE: "เฉพาะบัญชีใช้งานจริงที่เปิดใช้งานเท่านั้นที่รับมอบหมายงานได้",
  DUPLICATE_EMAIL: "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาแก้ไขผู้ใช้เดิม",
  PROFILE_CHANGED: "ข้อมูลผู้ใช้เปลี่ยนไปแล้ว กรุณาโหลดใหม่ก่อนบันทึก",
  SELF_PROTECTION: "ไม่สามารถปิดใช้งาน ลดบทบาท หรือลบบัญชีของตนเองจากหน้านี้",
  USER_HISTORY_REQUIRED: "ผู้ใช้นี้มีประวัติการทำงาน/ธุรกรรมในระบบ จึงไม่สามารถลบถาวรได้ กรุณาปิดการใช้งานแทน",
  DELETE_REQUIRES_INACTIVE: "กรุณาปิดใช้งานและจัดประเภทบัญชีก่อนลบถาวร",
  NOT_FOUND: "ไม่พบผู้ใช้", CREATE_FAILED: "สร้างผู้ใช้ไม่สำเร็จ บัญชีที่สร้างในคำขอนี้ถูกล้างแล้ว",
  CREATE_RECOVERY_REQUIRED: "การสร้างยังไม่สมบูรณ์ บัญชีถูกระงับไว้ กรุณาติดต่อผู้ดูแลระบบพร้อมรหัสอ้างอิง",
  AUTH_UNCERTAIN: "ยังยืนยันผลจากระบบบัญชีไม่ได้ กรุณาโหลดรายการใหม่ก่อนลองอีกครั้ง",
  PASSWORD_REQUIRED: "กรุณากรอกรหัสผ่านชั่วคราว",
  PASSWORD_MISMATCH: "รหัสผ่านและการยืนยันไม่ตรงกัน",
  PASSWORD_WEAK: "รหัสผ่านไม่ผ่านข้อกำหนด กรุณาใช้รหัสผ่านที่ปลอดภัยอย่างน้อย 8 ตัวอักษร",
  CONFIGURATION_REQUIRED: "ระบบเพิ่ม/ลบผู้ใช้ยังไม่พร้อม กรุณาตรวจการตั้งค่าฝั่งเซิร์ฟเวอร์",
  OPERATION_FAILED: "ดำเนินการไม่สำเร็จ กรุณาโหลดใหม่แล้วลองอีกครั้ง",
};
