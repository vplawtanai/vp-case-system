export type DueStatus =
  | "overdue"
  | "today"
  | "dueSoon"
  | "upcoming"
  | "planned"
  | "future"
  | "clear";

export type ActiveDueStatus = Exclude<DueStatus, "future" | "clear">;

export const CLOSED_STATUSES = [
  "done",
  "closed",
  "completed",
  "cancelled",
  "clear",
];

export const ACTIVE_ALERT_STATUSES: ActiveDueStatus[] = [
  "overdue",
  "today",
  "dueSoon",
  "upcoming",
  "planned",
];

export function normalizeStatus(status?: string | null) {
  return (status || "").trim().toLowerCase();
}

export function isClosedStatus(status?: string | null) {
  return CLOSED_STATUSES.includes(normalizeStatus(status));
}

export function getDueStatus(
  date?: string | null,
  status?: string | null,
  today = getTodayDateKey()
): DueStatus {
  if (isClosedStatus(status)) return "clear";
  if (!date?.trim()) return "clear";

  const diffDays = diffDaysFromDateKey(today, date);
  if (diffDays === null) return "clear";

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 4) return "dueSoon";
  if (diffDays <= 15) return "upcoming";
  if (diffDays <= 30) return "planned";
  return "future";
}

export function isActiveAlertStatus(status: DueStatus): status is ActiveDueStatus {
  return ACTIVE_ALERT_STATUSES.includes(status as ActiveDueStatus);
}

export function getDueStatusLabel(status: DueStatus) {
  if (status === "overdue") return "Overdue";
  if (status === "today") return "Today";
  if (status === "dueSoon") return "Due Soon";
  if (status === "upcoming") return "Upcoming";
  if (status === "planned") return "Planned";
  if (status === "future") return "Future";
  return "Clear";
}

export function getDueStatusScore(status: DueStatus) {
  if (status === "overdue") return 1;
  if (status === "today") return 2;
  if (status === "dueSoon") return 3;
  if (status === "upcoming") return 4;
  if (status === "planned") return 5;
  if (status === "future") return 6;
  return 7;
}

export function getDueStatusStyle(status: DueStatus) {
  if (status === "overdue") {
    return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" };
  }
  if (status === "today") {
    return { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };
  }
  if (status === "dueSoon") {
    return { background: "#ccfbf1", color: "#0f766e", border: "1px solid #5eead4" };
  }
  if (status === "upcoming") {
    return { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" };
  }
  if (status === "planned") {
    return { background: "#ede9fe", color: "#6d28d9", border: "1px solid #c4b5fd" };
  }
  if (status === "future") {
    return { background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" };
  }
  return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
}

export function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function diffDaysFromDateKey(todayKey: string, dateKey: string) {
  const today = parseLocalDateKey(todayKey);
  const target = parseLocalDateKey(dateKey);
  if (!today || !target) return null;

  return Math.floor(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function parseLocalDateKey(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
