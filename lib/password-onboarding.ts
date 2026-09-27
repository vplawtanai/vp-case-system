// Shared policy: the existing application minimum is eight characters. Supabase
// Auth remains authoritative for any additional configured server requirements.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MESSAGES = {
  temporary: { th: "รหัสผ่านชั่วคราว", en: "Temporary Password" },
  confirmation: { th: "ยืนยันรหัสผ่านชั่วคราว", en: "Confirm Temporary Password" },
  hint: { th: "ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก", en: "User must change the password on first sign-in." },
  create: { th: "สร้างผู้ใช้", en: "Create User" },
  required: { th: "ต้องเปลี่ยนรหัสผ่าน", en: "Password Change Required" },
  reset: { th: "ตั้งรหัสผ่านชั่วคราวใหม่", en: "Set New Temporary Password" },
  created: { th: "สร้างผู้ใช้แล้ว กรุณาแจ้งข้อมูลเข้าใช้งานชั่วคราวให้ผู้ใช้โดยตรง", en: "User created. Give the temporary sign-in details to the user directly." },
  resetDone: { th: "ตั้งรหัสผ่านชั่วคราวใหม่แล้ว ผู้ใช้ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน", en: "Temporary password set. The user must change it before using the system." },
  title: { th: "ตั้งรหัสผ่านใหม่", en: "Set a new password" },
  instruction: { th: "กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนเริ่มใช้งานระบบ", en: "Please change your temporary password before using VP OS." },
  ordinaryTitle: { th: "ความปลอดภัยบัญชี", en: "Account Security" },
  ordinaryHint: { th: "เปลี่ยนรหัสผ่านสำหรับบัญชีของคุณ", en: "Change the password for your account." },
  newPassword: { th: "รหัสผ่านใหม่", en: "New password" },
  confirmNew: { th: "ยืนยันรหัสผ่านใหม่", en: "Confirm new password" },
  minimum: { th: "อย่างน้อย 8 ตัวอักษร และเป็นไปตามข้อกำหนดความปลอดภัยของระบบ", en: "At least 8 characters and subject to the system security requirements." },
  save: { th: "บันทึกรหัสผ่านใหม่", en: "Save new password" },
  saving: { th: "กำลังบันทึก…", en: "Saving…" },
  saved: { th: "เปลี่ยนรหัสผ่านสำเร็จแล้ว", en: "Password changed successfully." },
  continue: { th: "เข้าสู่ระบบงาน", en: "Continue to VP OS" },
  logout: { th: "ออกจากระบบ", en: "Sign out" },
  PASSWORD_REQUIRED: { th: "กรุณากรอกรหัสผ่าน", en: "Password is required." },
  PASSWORD_MISMATCH: { th: "รหัสผ่านและการยืนยันไม่ตรงกัน", en: "Passwords do not match." },
  PASSWORD_WEAK: { th: "รหัสผ่านไม่ผ่านข้อกำหนด กรุณาใช้รหัสผ่านที่ปลอดภัยอย่างน้อย 8 ตัวอักษร", en: "Password does not meet security requirements. Use a secure password of at least 8 characters." },
  PASSWORD_UPDATE_FAILED: { th: "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้งแล้วลองใหม่", en: "Unable to change password. Sign in again and retry." },
  PASSWORD_COMPLETION_FAILED: { th: "รหัสผ่านเปลี่ยนแล้ว แต่ยังยืนยันขั้นตอนสุดท้ายไม่ได้ กรุณาใช้ปุ่มยืนยันอีกครั้ง", en: "Password changed, but completion could not be confirmed. Use Retry confirmation." },
  PASSWORD_RESET_CHANGED: { th: "มีการตั้งรหัสผ่านชั่วคราวใหม่ระหว่างดำเนินการ กรุณาเข้าสู่ระบบอีกครั้ง", en: "A new temporary password was set during this operation. Please sign in again." },
  retry: { th: "ยืนยันอีกครั้ง", en: "Retry confirmation" },
} as const;
export type PasswordMessage = keyof typeof PASSWORD_MESSAGES;
export function passwordText(key: PasswordMessage, locale: "th" | "en") { return PASSWORD_MESSAGES[key][locale]; }
export function validatePassword(password: unknown, confirmation: unknown): string {
  if (typeof password !== "string" || !password.trim()) throw new Error("PASSWORD_REQUIRED");
  if (password.length < PASSWORD_MIN_LENGTH) throw new Error("PASSWORD_WEAK");
  if (password !== confirmation) throw new Error("PASSWORD_MISMATCH");
  return password; // Never trim or otherwise change the secret the user entered.
}
export function passwordDestination(profile: { active?: unknown; must_change_password?: unknown } | null, pathname: string) {
  if (!profile || profile.active !== true) return "/login";
  if (profile.must_change_password === true && pathname !== "/account/security") return "/account/security";
  return null;
}
