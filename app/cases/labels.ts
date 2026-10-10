import type { UiLocale } from "../../lib/i18n/core";
import type { AlertCandidate } from "./case-list-model";

export const caseLabels = {
  title: { th: "ศูนย์รวมคดี", en: "Case Command Center" },
  subtitle: { th: "ติดตามแฟ้มคดี นัดหมาย และงานที่ต้องดำเนินการ", en: "Your case files, hearings and work ahead, in one place." },
  cases: { th: "คดี", en: "Cases" }, total: { th: "คดีทั้งหมด", en: "All cases" },
  overdue: { th: "เกินกำหนด", en: "Overdue" }, today: { th: "ครบกำหนดวันนี้", en: "Due today" },
  dueSoon: { th: "ใกล้กำหนด", en: "Due soon" }, upcoming: { th: "กำหนดถัดไป", en: "Upcoming" },
  planned: { th: "กำหนดในเดือนนี้", en: "Planned" }, future: { th: "เกิน 30 วัน", en: "Beyond 30 days" },
  clear: { th: "ไม่มีรายการใกล้กำหนด", en: "No current alerts" },
  all: { th: "ทั้งหมด", en: "All" }, caseUnit: { th: "คดี", en: "cases" }, itemUnit: { th: "รายการ", en: "items" },
  soonRange: { th: "อีก 1–4 วัน", en: "In 1–4 days" }, upcomingRange: { th: "อีก 5–15 วัน", en: "In 5–15 days" }, plannedRange: { th: "อีก 16–30 วัน", en: "In 16–30 days" },
  refresh: { th: "โหลดใหม่", en: "Refresh" }, refreshing: { th: "กำลังโหลด…", en: "Refreshing…" },
  add: { th: "เพิ่มคดีใหม่", en: "Add case" }, create: { th: "สร้างแฟ้มคดี", en: "Create case" }, creating: { th: "กำลังสร้าง…", en: "Creating…" },
  createHint: { th: "เลือกลูกค้าที่เกี่ยวข้อง ระบบจะออกเลขแฟ้มให้อัตโนมัติ", en: "Choose a linked client. A file number will be assigned automatically." },
  noClient: { th: "ยังไม่เชื่อมโยงลูกค้า", en: "No linked client" }, noClients: { th: "ยังไม่มีลูกค้า กรุณาเพิ่มลูกค้าก่อน", en: "No clients yet. Add a client first." },
  cancel: { th: "ยกเลิก", en: "Cancel" }, close: { th: "ปิดรายละเอียด", en: "Close details" },
  confirmCreate: { th: "ต้องการสร้างแฟ้มคดีใหม่หรือไม่? ระบบจะออกเลขแฟ้มให้อัตโนมัติ", en: "Create a new case file with an automatically assigned file number?" },
  created: { th: "สร้างแฟ้มคดีเรียบร้อยแล้ว", en: "Case file created" }, denied: { th: "คุณไม่มีสิทธิ์สร้างแฟ้มคดีใหม่", en: "You do not have permission to create a case." },
  createFailed: { th: "สร้างแฟ้มคดีไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ", en: "Could not create the case. Please try again or contact your administrator." },
  loadFailed: { th: "โหลดข้อมูลคดีหรือรายการติดตามไม่สำเร็จ กรุณาโหลดใหม่", en: "Could not load cases or follow-up items. Please refresh." },
  search: { th: "ค้นหาคดี", en: "Search cases" }, searchHint: { th: "เลขแฟ้ม ศาล เลขคดีดำ ชื่อเรื่อง ลูกค้า…", en: "File no., court, black case no., title, client…" },
  filters: { th: "ค้นหาและกรองคดี", en: "Search and filter cases" }, moreFilters: { th: "ตัวกรองเพิ่มเติม", en: "More filters" }, clearFilters: { th: "ล้างตัวกรอง", en: "Clear filters" },
  risk: { th: "ความเร่งด่วน", en: "Urgency" }, status: { th: "สถานะปัจจุบัน", en: "Current status" }, phase: { th: "ช่วงดำเนินงาน", en: "Phase" },
  owner: { th: "ผู้รับผิดชอบ", en: "Responsible person" }, client: { th: "ลูกค้า", en: "Client" }, storage: { th: "การจัดเก็บแฟ้ม", en: "File storage" }, location: { th: "ตำแหน่งจัดเก็บ", en: "Storage location" },
  sort: { th: "เรียงตาม", en: "Sort by" }, highestRisk: { th: "เร่งด่วนที่สุดก่อน", en: "Highest urgency first" }, latestUpdated: { th: "แก้ไขล่าสุด", en: "Recently updated" }, nextAlertDate: { th: "วันครบกำหนดถัดไป", en: "Next alert date" },
  list: { th: "รายการคดี", en: "Case list" }, results: { th: "แสดง {shown} จาก {total} คดี", en: "Showing {shown} of {total} cases" },
  fileNo: { th: "เลขแฟ้ม VP", en: "VP file no." }, court: { th: "ศาล", en: "Court" }, blackNo: { th: "เลขคดีดำ", en: "Black case no." },
  courtIdentity: { th: "ศาล / เลขคดีดำ", en: "Court / black case no." }, caseTitle: { th: "ชื่อเรื่อง", en: "Title" }, type: { th: "ประเภทคดี", en: "Case type" },
  noCourt: { th: "ยังไม่ระบุศาล", en: "Court not recorded" }, noBlackNo: { th: "ยังไม่มีเลขคดีดำ", en: "Black case no. pending" }, untitled: { th: "ยังไม่ระบุชื่อเรื่อง", en: "Untitled case" }, unknown: { th: "ยังไม่ระบุ", en: "Not recorded" },
  nextHearing: { th: "นัดถัดไป", en: "Next hearing" }, nextTask: { th: "งานถัดไป", en: "Next task" }, nearestDeadline: { th: "กำหนดเวลาที่ใกล้สุด", en: "Nearest deadline" }, nextAlert: { th: "รายการติดตาม", en: "Follow-up" },
  noHearing: { th: "ยังไม่มีนัดหมายถัดไป", en: "No upcoming hearing recorded" }, noTask: { th: "ไม่มีงานค้างที่บันทึกไว้", en: "No outstanding task recorded" }, noDeadline: { th: "ไม่มีกำหนดเวลาค้างที่บันทึกไว้", en: "No outstanding deadline recorded" }, noDate: { th: "ยังไม่ระบุวันครบกำหนด", en: "No due date recorded" },
  task: { th: "งาน", en: "Task" }, hearing: { th: "นัดศาล", en: "Hearing" }, deadline: { th: "กำหนดเวลา", en: "Deadline" }, enforcement: { th: "ขอออกหมายบังคับคดี", en: "Request enforcement writ" },
  preview: { th: "รายละเอียดคดีโดยย่อ", en: "Case quick view" }, openFull: { th: "เปิดหน้าคดีเต็ม", en: "Open full case" }, updated: { th: "แก้ไขล่าสุด", en: "Last updated" },
  loading: { th: "กำลังโหลดคดีและรายการติดตาม…", en: "Loading cases and follow-up items…" }, empty: { th: "ไม่พบคดีที่ตรงกับตัวกรอง", en: "No cases match these filters" }, more: { th: "อีก {count} รายการ", en: "{count} more" },
} as const;
export type CaseLabel = keyof typeof caseLabels;
export function caseText(locale: UiLocale, key: CaseLabel, values: Record<string, string | number> = {}) {
  return caseLabels[key][locale].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

// Translate existing controlled vocabulary only; preserve names and free-text facts verbatim.
const terms: Record<string, [string, string]> = {
  Active: ["อยู่ระหว่างดำเนินการ", "Active"], Waiting: ["รอดำเนินการ", "Waiting"], Done: ["เสร็จสิ้น", "Done"], Closed: ["ปิดคดี", "Closed"], Pending: ["รอดำเนินการ", "Pending"], Cancelled: ["ยกเลิก", "Cancelled"], "In Progress": ["กำลังดำเนินการ", "In progress"],
  Civil: ["แพ่ง", "Civil"], Criminal: ["อาญา", "Criminal"], Bankruptcy: ["ล้มละลาย", "Bankruptcy"], Administrative: ["ปกครอง", "Administrative"],
  litigation: ["ดำเนินคดี", "Litigation"], enforcement: ["บังคับคดี", "Enforcement"],
  Cabinet: ["ตู้เอกสาร", "Cabinet"], Box: ["กล่องเอกสาร", "Box"], Digital: ["จัดเก็บดิจิทัล", "Digital"], "With Client": ["อยู่กับลูกค้า", "With client"],
  answer: ["ครบกำหนดยื่นคำให้การจำเลย", "Defendant’s answer due"], "ครบกำหนดยื่นคำให้การ": ["ครบกำหนดยื่นคำให้การจำเลย", "Defendant’s answer due"], appeal: ["ครบกำหนดอุทธรณ์", "Appeal due"], appeal_answer: ["ครบกำหนดแก้อุทธรณ์", "Appeal response due"], supreme: ["ครบกำหนดฎีกา", "Supreme Court appeal due"], supreme_answer: ["ครบกำหนดแก้ฎีกา", "Supreme Court appeal response due"],
  defendant: ["จำเลย", "Defendant"], defendant_1: ["จำเลยที่ 1", "Defendant 1"], defendant_2: ["จำเลยที่ 2", "Defendant 2"], defendant_3: ["จำเลยที่ 3", "Defendant 3"], defendant_4: ["จำเลยที่ 4", "Defendant 4"],
  "สอบข้อเท็จจริง": ["สอบข้อเท็จจริง", "Fact finding"], "เตรียมเอกสาร": ["เตรียมเอกสาร", "Prepare documents"], "ทำหนังสือบอกกล่าว": ["ทำหนังสือบอกกล่าว", "Prepare notice"], "ร่างคำฟ้อง": ["ร่างคำฟ้อง", "Draft complaint"], "เตรียมพยาน": ["เตรียมพยาน", "Prepare witnesses"], "เตรียมเอกสารวันนัดที่จะถึง": ["เตรียมเอกสารวันนัดที่จะถึง", "Prepare documents for the next hearing"], "งานที่ต้องทำ": ["งานที่ต้องทำ", "Task"],
  "นัดไกล่เกลี่ย": ["นัดไกล่เกลี่ย", "Mediation"], "นัดไกล่เกลี่ย/ให้การ/สืบพยานโจทก์": ["นัดไกล่เกลี่ย/ให้การ/สืบพยานโจทก์", "Mediation / plea / plaintiff evidence"], "นัดพร้อม": ["นัดพร้อม", "Case management hearing"], "นัดชี้สองสถาน/สืบพยานโจทก์": ["นัดชี้สองสถาน/สืบพยานโจทก์", "Issue settlement / plaintiff evidence"], "นัดชี้สองสถาน": ["นัดชี้สองสถาน", "Issue settlement hearing"], "นัดไต่สวนมูลฟ้อง": ["นัดไต่สวนมูลฟ้อง", "Preliminary examination"], "นัดฟังคำสั่ง": ["นัดฟังคำสั่ง", "Court order hearing"], "นัดสอบคำให้การจำเลย": ["นัดสอบคำให้การจำเลย", "Defendant plea hearing"], "นัดสอบคำให้การจำเลย/ตรวจพยาน": ["นัดสอบคำให้การจำเลย/ตรวจพยาน", "Defendant plea / evidence examination"], "นัดสืบพยานโจทก์": ["นัดสืบพยานโจทก์", "Plaintiff evidence hearing"], "นัดสืบพยานจำเลย": ["นัดสืบพยานจำเลย", "Defendant evidence hearing"], "นัดฟังคำพิพากษา/คำสั่ง": ["นัดฟังคำพิพากษา/คำสั่ง", "Judgment / court order hearing"], "นัดศาล": ["นัดศาล", "Court hearing"], "อื่นๆ": ["อื่นๆ", "Other"],
};
export function caseTerm(value: string | null | undefined, locale: UiLocale) {
  if (!value?.trim()) return caseText(locale, "unknown");
  const pair = terms[value] || Object.entries(terms).find(([key]) => key.toLowerCase() === value.toLowerCase())?.[1];
  return pair ? pair[locale === "th" ? 0 : 1] : value;
}
export function alertLabel(alert: AlertCandidate, locale: UiLocale) {
  return `${caseText(locale, alert.kind)}${alert.kind === "hearing" && alert.ordinal ? ` ${alert.ordinal}` : ""}: ${alert.label ? caseTerm(alert.label, locale) : caseText(locale, "unknown")}`;
}
