import type { UserRole } from "../../lib/permissions";
import { getDueStatus, getDueStatusScore, getTodayDateKey, isActiveAlertStatus, isClosedStatus as isClosedDueStatus, type DueStatus } from "../../lib/dueStatus";

export type RiskLevel = DueStatus;
export type RiskFilter = "all" | RiskLevel;

export type CaseItem = {
  id: number;
  file_no?: string | null;
  client_id?: string | null;
  title?: string | null;
  client_name?: string | null;
  court_name?: string | null;
  case_number?: string | null;
  case_type?: string | null;
  phase?: string | null;
  status?: string | null;
  owner_name?: string | null;

  physical_storage_type?: string | null;
  physical_storage_detail?: string | null;

  risk_level?: RiskLevel | null;
  next_alert_text?: string | null;
  next_alert_date?: string | null;
  next_alerts?: AlertCandidate[];

  created_at?: string | null;
  updated_at?: string | null;
};

export type CaseTask = {
  case_id: number;
  task_type?: string | null;
  task_other?: string | null;
  due_date?: string | null;
  status?: string | null;
};

export type CaseDeadline = {
  case_id: number;
  deadline_type?: string | null;
  deadline_other?: string | null;
  current_due_date?: string | null;
  status?: string | null;
};

export type CaseTimeline = {
  case_id: number;
  event_type?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  appointment_type?: string | null;
  appointment_other?: string | null;
  order_no?: number | null;
  status?: string | null;
};

export type CaseEnforcement = {
  case_id: number;
  party_label?: string | null;
  party_other?: string | null;
  final_due_date?: string | null;
  writ_request_date?: string | null;
  writ_issued_date?: string | null;
  status?: string | null;
};

export type AlertCandidate = {
  case_id: number;
  level: RiskLevel;
  text: string;
  date: string;
  score: number;
  kind: "task" | "deadline" | "hearing" | "enforcement";
  label: string;
  ordinal?: number | null;
};

export type SortMode =
  | "highestRisk"
  | "latestUpdated"
  | "fileNo"
  | "nextAlertDate";

export type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
};

export type ClientOption = {
  id: string;
  name: string;
};

export function buildAlertCandidates(
  tasks: CaseTask[],
  deadlines: CaseDeadline[],
  timeline: CaseTimeline[],
  enforcements: CaseEnforcement[]
) {
  const candidates: AlertCandidate[] = [];

  tasks.forEach((task) => {
    if (!task.due_date) return;
    if (isTaskDone(task.status)) return;

    const level = getDateRiskLevel(task.due_date);
    if (!isActiveAlertStatus(level)) return;

    const taskText =
      task.task_type === "อื่นๆ"
        ? task.task_other || "งานที่ต้องทำ"
        : task.task_type || "งานที่ต้องทำ";

    candidates.push({
      case_id: task.case_id,
      level,
      text: `Task: ${taskText}`, kind: "task", label: taskText,
      date: task.due_date,
      score: getRiskScoreFromLevel(level),
    });
  });

  deadlines.forEach((deadline) => {
    if (!deadline.current_due_date) return;
    if (isDeadlineDone(deadline.status)) return;

    const level = getDateRiskLevel(deadline.current_due_date);
    if (!isActiveAlertStatus(level)) return;

    const deadlineText = renderDeadlineTypeForAlert(
      deadline.deadline_type,
      deadline.deadline_other
    );

    candidates.push({
      case_id: deadline.case_id,
      level,
      text: `Deadline: ${deadlineText}`, kind: "deadline", label: deadline.deadline_type === "other" ? deadlineText : deadline.deadline_type || "",
      date: deadline.current_due_date,
      score: getRiskScoreFromLevel(level),
    });
  });

  timeline.forEach((event) => {
    if (event.event_type !== "hearing") return;
    if (!event.event_date) return;
    if (isTimelineDone(event.status)) return;

    const level = getDateRiskLevel(event.event_date);
    if (!isActiveAlertStatus(level)) return;

    const appointmentText =
      event.appointment_type === "นัดอื่นๆ"
        ? event.appointment_other || "นัดศาล"
        : event.appointment_type || "นัดศาล";

    candidates.push({
      case_id: event.case_id,
      level,
      text: `Timeline: นัดที่ ${event.order_no || "-"} ${appointmentText}`, kind: "hearing", label: appointmentText, ordinal: event.order_no,
      date: event.event_date,
      score: getRiskScoreFromLevel(level),
    });
  });

  enforcements.forEach((item) => {
    if (!item.final_due_date) return;
    if (isEnforcementWritDone(item)) return;

    const level = getDateRiskLevel(item.final_due_date);
    if (!isActiveAlertStatus(level)) return;

    const partyText = renderEnforcementPartyLabel(
      item.party_label,
      item.party_other
    );

    candidates.push({
      case_id: item.case_id,
      level,
      text: `Enforcement: ขอออกหมายบังคับคดี (${partyText})`, kind: "enforcement", label: item.party_label === "other" ? partyText : item.party_label || "",
      date: item.final_due_date,
      score: getRiskScoreFromLevel(level),
    });
  });

  return candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.date.localeCompare(b.date);
  });
}

export function buildAlertMapFromCandidates(candidates: AlertCandidate[]) {
  const map = new Map<number, AlertCandidate[]>();

  candidates.forEach((candidate) => {
    const existing = map.get(candidate.case_id) || [];
    existing.push(candidate);
    existing.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.date.localeCompare(b.date);
    });
    map.set(candidate.case_id, existing);
  });

  return map;
}

export function renderDeadlineTypeForAlert(
  deadlineType?: string | null,
  deadlineOther?: string | null
) {
  if (!deadlineType) return "Deadline";

  if (deadlineType === "answer") return "ครบกำหนดยื่นคำให้การ";
  if (deadlineType === "appeal") return "ครบกำหนดอุทธรณ์";
  if (deadlineType === "appeal_answer") return "ครบกำหนดแก้อุทธรณ์";
  if (deadlineType === "supreme") return "ครบกำหนดฎีกา";
  if (deadlineType === "supreme_answer") return "ครบกำหนดแก้ฎีกา";
  if (deadlineType === "other") return deadlineOther || "กำหนดเวลาอื่นๆ";

  return deadlineType;
}

export function getDateRiskLevel(dateText: string): RiskLevel {
  return getDueStatus(dateText);
}

export function getRiskScoreFromLevel(level: RiskLevel) {
  return getDueStatusScore(level);
}

export function isTaskDone(status?: string | null) {
  return isClosedAlertStatus(status);
}

export function isDeadlineDone(status?: string | null) {
  const value = (status || "").toLowerCase();

  return (
    isClosedAlertStatus(status) ||
    value === "filed" ||
    value === "submitted"
  );
}

export function isTimelineDone(status?: string | null) {
  return isClosedAlertStatus(status);
}

export function isEnforcementWritDone(item: CaseEnforcement) {
  if (item.writ_request_date || item.writ_issued_date) return true;

  const value = (item.status || "").toLowerCase();

  return (
    isClosedAlertStatus(item.status) ||
    value === "writ_requested" ||
    value === "writ_issued" ||
    value === "asset_searching" ||
    value === "no_asset_found" ||
    value === "asset_found_waiting_approval" ||
    value === "client_rejected" ||
    value === "approved_waiting_seizure" ||
    value === "seized_waiting_auction" ||
    value === "sold" ||
    value === "closed"
  );
}

export function isClosedAlertStatus(status?: string | null) {
  return isClosedDueStatus(status);
}

export function renderEnforcementPartyLabel(
  value?: string | null,
  other?: string | null
) {
  if (value === "defendant") return "จำเลย";
  if (value === "defendant_1") return "จำเลยที่ 1";
  if (value === "defendant_2") return "จำเลยที่ 2";
  if (value === "defendant_3") return "จำเลยที่ 3";
  if (value === "defendant_4") return "จำเลยที่ 4";
  if (value === "other") return other || "อื่นๆ";

  return value || "-";
}


// Preview derives only from already-loaded records; alerts/count windows stay unchanged.
export function casePreview(id: number, tasks: CaseTask[], deadlines: CaseDeadline[], timeline: CaseTimeline[], today = getTodayDateKey()) {
  const task = tasks.filter(t => t.case_id === id && !isTaskDone(t.status))
    .sort((a,b) => (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31"))[0];
  const deadline = deadlines.filter(d => d.case_id === id && d.current_due_date && !isDeadlineDone(d.status))
    .sort((a,b) => a.current_due_date!.localeCompare(b.current_due_date!))[0];
  const hearing = timeline.filter(t => t.case_id === id && t.event_type === "hearing" && t.event_date && t.event_date >= today && !isTimelineDone(t.status))
    .sort((a,b) => a.event_date!.localeCompare(b.event_date!) || (a.event_time || "").localeCompare(b.event_time || ""))[0];
  return { task, deadline, hearing };
}
export type CasePreview = ReturnType<typeof casePreview>;
