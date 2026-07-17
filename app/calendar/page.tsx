"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import AppTopNav from "../components/AppTopNav";
import AuthGuard from "../components/AuthGuard";
import { buildPermissions } from "../../lib/permissions";
import type { UserPermissions, UserRole } from "../../lib/permissions";
import { supabase } from "../../lib/supabase";
import {
  getDueStatus,
  getDueStatusLabel,
  getDueStatusScore,
  getDueStatusStyle,
  isActiveAlertStatus,
  isClosedStatus as isClosedDueStatus,
} from "../../lib/dueStatus";

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
};

type CaseRow = {
  id: number;
  file_no?: string | null;
  title?: string | null;
  client_name?: string | null;
};

type ClientRow = {
  id: string;
  name?: string | null;
};

type AdvisoryMatterRow = {
  id: string;
  client_id?: string | null;
  matter_no?: string | null;
  title?: string | null;
};

type CaseDeadlineRow = {
  id: string;
  case_id: number;
  deadline_type?: string | null;
  deadline_other?: string | null;
  party_label?: string | null;
  party_other?: string | null;
  current_due_date?: string | null;
  original_due_date?: string | null;
  status?: string | null;
};

type CaseTaskRow = {
  id: string;
  case_id: number;
  task_type?: string | null;
  task_other?: string | null;
  owner_name?: string | null;
  assignee_name?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  note?: string | null;
};

type CaseTimelineRow = {
  id: string;
  case_id: number;
  event_type?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  event_end_time?: string | null;
  appointment_type?: string | null;
  appointment_other?: string | null;
  status?: string | null;
  note?: string | null;
};

type AdvisoryIssueRow = {
  id: string;
  advisory_matter_id: string;
  client_id?: string | null;
  issue_no?: string | null;
  title?: string | null;
  issue_type?: string | null;
  status?: string | null;
  priority?: string | null;
  responsible_person?: string | null;
  due_date?: string | null;
};

type AdvisoryTaskRow = {
  id: string;
  advisory_matter_id: string;
  advisory_issue_id?: string | null;
  client_id?: string | null;
  title?: string | null;
  task_type?: string | null;
  status?: string | null;
  priority?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
};

type CalendarItem = {
  id: string;
  source: "Case" | "Advisory";
  itemType:
    | "Case Deadline"
    | "Case Task"
    | "Case Timeline"
    | "Advisory Issue"
    | "Advisory Task";
  date: string;
  title: string;
  status: string;
  priority?: string;
  assignee?: string;
  clientName: string;
  matterOrCaseTitle: string;
  link: string;
  timelineStartTime?: string | null;
  timelineEndTime?: string | null;
};

export default function CalendarPage() {
  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getDateKey(new Date()));
  const [monthDate, setMonthDate] = useState(getMonthStart(new Date()));

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [matters, setMatters] = useState<AdvisoryMatterRow[]>([]);
  const [caseDeadlines, setCaseDeadlines] = useState<CaseDeadlineRow[]>([]);
  const [caseTasks, setCaseTasks] = useState<CaseTaskRow[]>([]);
  const [caseTimeline, setCaseTimeline] = useState<CaseTimelineRow[]>([]);
  const [advisoryIssues, setAdvisoryIssues] = useState<AdvisoryIssueRow[]>([]);
  const [advisoryTasks, setAdvisoryTasks] = useState<AdvisoryTaskRow[]>([]);
  const [errorText, setErrorText] = useState("");
  const [isCompactView, setIsCompactView] = useState(false);

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);

        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          setProfile({ role: "", financial_access: false });
          return;
        }

        const { data, error } = await supabase
          .from("user_profiles")
          .select("role, financial_access")
          .eq("id", userData.user.id)
          .single();

        if (error || !data) {
          setProfile({ role: "", financial_access: false });
          return;
        }

        setProfile({
          role: data.role || "",
          financial_access: data.financial_access === true,
        });
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateCompactView = () => setIsCompactView(mediaQuery.matches);

    updateCompactView();
    mediaQuery.addEventListener("change", updateCompactView);

    return () => mediaQuery.removeEventListener("change", updateCompactView);
  }, []);

  const loadCalendar = useCallback(async () => {
    if (!permissions.canViewDashboard) return;

    try {
      setLoading(true);
      setErrorText("");

      const [
        casesRes,
        clientsRes,
        mattersRes,
        deadlinesRes,
        tasksRes,
        timelineRes,
        issuesRes,
        advisoryTasksRes,
      ] = await Promise.all([
        supabase.from("cases").select("id, file_no, title, client_name"),
        supabase.from("clients").select("id, name"),
        supabase.from("advisory_matters").select("id, client_id, matter_no, title"),
        supabase
          .from("case_deadlines")
          .select(
            "id, case_id, deadline_type, deadline_other, party_label, party_other, current_due_date, original_due_date, status, deleted_at"
          )
          .is("deleted_at", null),
        supabase
          .from("case_tasks")
          .select(
            "id, case_id, task_type, task_other, owner_name, assignee_name, start_date, due_date, status, note, deleted_at"
          )
          .is("deleted_at", null),
        supabase
          .from("case_timeline")
          .select(
            "id, case_id, event_type, event_date, event_time, event_end_time, appointment_type, appointment_other, status, note, deleted_at"
          )
          .is("deleted_at", null),
        supabase
          .from("advisory_issues")
          .select(
            "id, advisory_matter_id, client_id, issue_no, title, issue_type, status, priority, responsible_person, due_date, deleted_at"
          )
          .is("deleted_at", null),
        supabase
          .from("advisory_issue_tasks")
          .select(
            "id, advisory_matter_id, advisory_issue_id, client_id, title, task_type, status, priority, assignee_name, due_date, deleted_at"
          )
          .is("deleted_at", null),
      ]);

      const error =
        casesRes.error ||
        clientsRes.error ||
        mattersRes.error ||
        deadlinesRes.error ||
        tasksRes.error ||
        timelineRes.error ||
        issuesRes.error ||
        advisoryTasksRes.error;

      if (error) {
        setErrorText(error.message || "Load calendar failed");
        return;
      }

      setCases((casesRes.data || []) as CaseRow[]);
      setClients((clientsRes.data || []) as ClientRow[]);
      setMatters((mattersRes.data || []) as AdvisoryMatterRow[]);
      setCaseDeadlines((deadlinesRes.data || []) as CaseDeadlineRow[]);
      setCaseTasks((tasksRes.data || []) as CaseTaskRow[]);
      setCaseTimeline((timelineRes.data || []) as CaseTimelineRow[]);
      setAdvisoryIssues((issuesRes.data || []) as AdvisoryIssueRow[]);
      setAdvisoryTasks((advisoryTasksRes.data || []) as AdvisoryTaskRow[]);
    } finally {
      setLoading(false);
    }
  }, [permissions.canViewDashboard]);

  useEffect(() => {
    if (loadingProfile) return;
    loadCalendar();
  }, [loadingProfile, loadCalendar]);

  const calendarItems = useMemo(() => {
    const caseMap = new Map(cases.map((item) => [item.id, item]));
    const clientMap = new Map(clients.map((item) => [item.id, item]));
    const matterMap = new Map(matters.map((item) => [item.id, item]));
    const items: CalendarItem[] = [];

    caseDeadlines.forEach((item) => {
      const date = item.current_due_date || item.original_due_date || "";
      if (!date) return;

      const caseItem = caseMap.get(item.case_id);
      items.push({
        id: `case-deadline-${item.id}`,
        source: "Case",
        itemType: "Case Deadline",
        date,
        title: renderDeadlineTitle(item),
        status: item.status || "-",
        clientName: caseItem?.client_name || "-",
        matterOrCaseTitle: renderCaseTitle(caseItem),
        link: `/cases/${item.case_id}#deadlines`,
      });
    });

    caseTasks.forEach((item) => {
      if (!item.due_date) return;

      const caseItem = caseMap.get(item.case_id);
      items.push({
        id: `case-task-${item.id}`,
        source: "Case",
        itemType: "Case Task",
        date: item.due_date,
        title: item.task_type === "อื่นๆ" ? item.task_other || "Task" : item.task_type || "Task",
        status: item.status || "-",
        assignee: item.assignee_name || item.owner_name || "",
        clientName: caseItem?.client_name || "-",
        matterOrCaseTitle: renderCaseTitle(caseItem),
        link: `/cases/${item.case_id}#tasks`,
      });
    });

    caseTimeline.forEach((item) => {
      if (!item.event_date) return;

      const caseItem = caseMap.get(item.case_id);
      items.push({
        id: `case-timeline-${item.id}`,
        source: "Case",
        itemType: "Case Timeline",
        date: item.event_date,
        title: item.appointment_other || item.appointment_type || item.event_type || "Timeline",
        status: item.status || "-",
        clientName: caseItem?.client_name || "-",
        matterOrCaseTitle: renderCaseTitle(caseItem),
        link: `/cases/${item.case_id}#timeline`,
        timelineStartTime: item.event_time,
        timelineEndTime: item.event_end_time,
      });
    });

    advisoryIssues.forEach((item) => {
      if (!item.due_date) return;
      if (isClosedStatus(item.status)) return;

      const matter = matterMap.get(item.advisory_matter_id);
      const client = item.client_id
        ? clientMap.get(item.client_id)
        : matter?.client_id
          ? clientMap.get(matter.client_id)
          : null;

      items.push({
        id: `advisory-issue-${item.id}`,
        source: "Advisory",
        itemType: "Advisory Issue",
        date: item.due_date,
        title: item.title || item.issue_no || "Advisory issue",
        status: item.status || "-",
        priority: item.priority || "",
        assignee: item.responsible_person || "",
        clientName: client?.name || "-",
        matterOrCaseTitle: renderMatterTitle(matter),
        link: `/advisory/${item.advisory_matter_id}/issues/${item.id}`,
      });
    });

    advisoryTasks.forEach((item) => {
      if (!item.due_date) return;
      if (isClosedStatus(item.status)) return;

      const parentIssue = item.advisory_issue_id
        ? advisoryIssues.find((issue) => issue.id === item.advisory_issue_id)
        : null;
      if (isClosedStatus(parentIssue?.status)) return;

      const matter = matterMap.get(item.advisory_matter_id);
      const client = item.client_id
        ? clientMap.get(item.client_id)
        : matter?.client_id
          ? clientMap.get(matter.client_id)
          : null;

      items.push({
        id: `advisory-task-${item.id}`,
        source: "Advisory",
        itemType: "Advisory Task",
        date: item.due_date,
        title: item.title || item.task_type || "Advisory task",
        status: item.status || "-",
        priority: item.priority || "",
        assignee: item.assignee_name || "",
        clientName: client?.name || "-",
        matterOrCaseTitle: renderMatterTitle(matter),
        link: item.advisory_issue_id
          ? `/advisory/${item.advisory_matter_id}/issues/${item.advisory_issue_id}`
          : `/advisory/${item.advisory_matter_id}`,
      });
    });

    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [
    advisoryIssues,
    advisoryTasks,
    caseDeadlines,
    caseTasks,
    caseTimeline,
    cases,
    clients,
    matters,
  ]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    calendarItems.forEach((item) => {
      const current = map.get(item.date) || [];
      current.push(item);
      map.set(item.date, current);
    });
    return map;
  }, [calendarItems]);

  const selectedItems = useMemo(() => {
    return orderSelectedDateCaseTimelineItems(itemsByDate.get(selectedDate) || []);
  }, [itemsByDate, selectedDate]);
  const actionQueueItems = useMemo(() => {
    const today = getDateKey(new Date());

    return calendarItems
      .filter((item) => {
        const status = getDueStatus(item.date, item.status, today);
        return isActiveAlertStatus(status);
      })
      .sort((a, b) => {
        const aDiff = daysBetweenDateKeys(today, a.date);
        const bDiff = daysBetweenDateKeys(today, b.date);
        const aGroup = getDueStatusScore(getDueStatus(a.date, a.status, today));
        const bGroup = getDueStatusScore(getDueStatus(b.date, b.status, today));

        if (aGroup !== bGroup) return aGroup - bGroup;
        if (getDueStatus(a.date, a.status, today) === "overdue") return bDiff - aDiff;
        return aDiff - bDiff;
      });
  }, [calendarItems]);

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <div style={panelStyle}>Loading permission...</div>
        </main>
      </AuthGuard>
    );
  }

  if (!permissions.canViewDashboard) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="Calendar"
            subtitle="Deadlines, tasks, timeline events, and advisory work in one view."
            activePage="calendar"
          />
          <div style={noAccessStyle}>No access</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <style jsx global>{`
          .calendar-date-cell:focus-visible {
            outline: 2px solid rgba(147, 197, 253, 0.55);
            outline-offset: 2px;
          }

          .calendar-date-cell:hover:not([data-selected="true"]) {
            border-color: #e5e7eb !important;
            box-shadow: none !important;
            background: #f8fafc !important;
          }
        `}</style>
        <AppTopNav
          title="Calendar"
          subtitle="Deadlines, tasks, timeline events, and advisory work in one view."
          activePage="calendar"
        />

        <section style={toolbarStyle}>
          <div>
            <div style={eyebrowStyle}>CALENDAR</div>
            <h2 style={monthTitleStyle}>{formatMonthLabel(monthDate)}</h2>
          </div>
          <div style={buttonWrapStyle}>
            <button type="button" onClick={() => setMonthDate(addMonths(monthDate, -1))} style={buttonStyle}>
              Previous month
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setMonthDate(getMonthStart(today));
                setSelectedDate(getDateKey(today));
              }}
              style={buttonStyle}
            >
              Today
            </button>
            <button type="button" onClick={() => setMonthDate(addMonths(monthDate, 1))} style={buttonStyle}>
              Next month
            </button>
          </div>
        </section>

        {errorText ? <div style={errorStyle}>{errorText}</div> : null}
        {loading ? <div style={panelStyle}>Loading calendar...</div> : null}

        <section style={{ ...mainGridStyle, ...(isCompactView ? compactMainGridStyle : {}) }}>
          <div style={{ ...calendarPanelStyle, ...(isCompactView ? compactCalendarPanelStyle : {}) }}>
            <div style={{ ...weekdayGridStyle, ...(isCompactView ? compactWeekdayGridStyle : {}) }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} style={{ ...weekdayStyle, ...(isCompactView ? compactWeekdayStyle : {}) }}>
                  {day}
                </div>
              ))}
            </div>

            <div style={{ ...monthGridStyle, ...(isCompactView ? compactMonthGridStyle : {}) }}>
              {buildMonthCells(monthDate).map((cell) => {
                const dateItems = cell.dateKey ? itemsByDate.get(cell.dateKey) || [] : [];
                const isSelected = cell.dateKey === selectedDate;
                const isToday = cell.dateKey === getDateKey(new Date());
                const hasItems = dateItems.length > 0;

                return (
                  <div
                    key={cell.key}
                    role="button"
                    tabIndex={cell.dateKey ? 0 : -1}
                    aria-disabled={!cell.dateKey}
                    className="calendar-date-cell"
                    data-selected={isSelected ? "true" : "false"}
                    onClick={() => {
                      if (!cell.dateKey) return;
                      setSelectedDate(cell.dateKey);
                    }}
                    onKeyDown={(event) => {
                      if (!cell.dateKey) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedDate(cell.dateKey);
                    }}
                    style={{
                      ...baseDateCellStyle,
                      ...(isCompactView ? compactBaseDateCellStyle : {}),
                      ...(!cell.dateKey ? outsideMonthDateCellStyle : {}),
                      ...(isToday && !isSelected ? todayDateCellStyle : {}),
                      ...(isSelected ? selectedDateCellStyle : {}),
                    }}
                  >
                    <span style={{ ...dateNumberStyle, ...(isCompactView ? compactDateNumberStyle : {}) }}>
                      {cell.dayLabel}
                    </span>
                    {hasItems ? (
                      <span style={{ ...countBadgeStyle, ...(isCompactView ? compactCountBadgeStyle : {}) }}>
                        {isCompactView ? dateItems.length : `${dateItems.length} item(s)`}
                      </span>
                    ) : null}
                    <div style={cellBadgeWrapStyle}>
                      {dateItems.slice(0, isCompactView ? 1 : 2).map((item) => (
                        <span
                          key={item.id}
                          style={
                            item.source === "Case"
                              ? caseBadgeStyle
                              : advisoryBadgeStyle
                          }
                        >
                          {getShortItemType(item.itemType)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={sidePanelStackStyle}>
            <ItemPanel
              title={formatDisplayDate(selectedDate)}
              subtitle="Selected date"
              items={selectedItems}
              showCaseTimelineTimes
            />
            <ItemPanel
              title="Overdue, today, and next 30 days"
              subtitle="Action Queue"
              items={actionQueueItems}
              showDateLabels
            />
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}

function ItemPanel({
  title,
  subtitle,
  items,
  showDateLabels = false,
  showCaseTimelineTimes = false,
}: {
  title: string;
  subtitle: string;
  items: CalendarItem[];
  showDateLabels?: boolean;
  showCaseTimelineTimes?: boolean;
}) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <div style={eyebrowStyle}>{subtitle}</div>
          <h3 style={panelTitleStyle}>{title}</h3>
        </div>
        <span style={countBadgeStyle}>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div style={emptyStyle}>No calendar items.</div>
      ) : (
        <div style={itemListStyle}>
          {items.map((item) => {
            const isOverdue = isOverdueCalendarItem(item);
            const timelineTime = showCaseTimelineTimes ? formatCaseTimelineTime(item) : "";
            return (
              <Link key={item.id} href={item.link} style={isOverdue ? overdueItemRowStyle : itemRowStyle}>
                <div style={itemTopLineStyle}>
                  <div style={itemBadgeLineStyle}>
                    <span style={getItemTypeBadgeStyle(item)}>
                      {getItemTypeBadgeLabel(item)}
                    </span>
                  </div>
                  {showDateLabels ? (
                    <span style={{ ...dateChipStyle, ...getDueStatusStyle(getDueStatus(item.date, item.status)) }}>
                      {formatDisplayDate(item.date)}
                      {getDueLabel(item.date) ? ` · ${getDueLabel(item.date)}` : ""}
                    </span>
                  ) : null}
                </div>
                <div style={isOverdue ? overdueItemTitleStyle : itemTitleStyle}>{item.title}</div>
                <div style={isOverdue ? overdueItemMetaStyle : itemMetaStyle}>
                  {item.clientName} · {item.matterOrCaseTitle}
                </div>
                {timelineTime ? (
                  <div style={isOverdue ? overdueItemTimeStyle : itemTimeStyle}>{timelineTime}</div>
                ) : null}
                <div style={isOverdue ? overdueItemMetaStyle : itemMetaStyle}>
                  {item.status}
                  {item.priority ? ` · ${item.priority}` : ""}
                  {item.assignee ? ` · ${item.assignee}` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function renderDeadlineTitle(item: CaseDeadlineRow) {
  if (item.deadline_type === "other") return item.deadline_other || "Deadline";
  return item.deadline_type || "Deadline";
}

type TimelineTimeValue = {
  label: string;
  sortValue: number;
};

function getTimelineTimeValue(value?: string | null): TimelineTimeValue | null {
  const rawValue = value?.trim() || "";
  if (!rawValue) return null;

  const timeMatch = rawValue.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (hour > 23 || minute > 59 || (hour === 0 && minute === 0)) return null;

    return {
      label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      sortValue: hour * 60 + minute,
    };
  }

  const dateValue = new Date(rawValue);
  if (Number.isNaN(dateValue.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(dateValue);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute) || (hour === 0 && minute === 0)) return null;

  return {
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    sortValue: hour * 60 + minute,
  };
}

function formatCaseTimelineTime(item: CalendarItem) {
  if (item.itemType !== "Case Timeline") return "";

  const startTime = getTimelineTimeValue(item.timelineStartTime);
  const endTime = getTimelineTimeValue(item.timelineEndTime);
  if (!startTime) return "";

  return endTime
    ? `เวลา ${startTime.label}–${endTime.label} น.`
    : `เวลา ${startTime.label} น.`;
}

function orderSelectedDateCaseTimelineItems(items: CalendarItem[]) {
  const timelineItems = items.filter((item) => item.itemType === "Case Timeline");
  if (timelineItems.length < 2) return items;

  const sortedTimelineItems = [...timelineItems].sort((a, b) => {
    const aTime = getTimelineTimeValue(a.timelineStartTime);
    const bTime = getTimelineTimeValue(b.timelineStartTime);
    if (aTime && bTime) return aTime.sortValue - bTime.sortValue;
    if (aTime) return -1;
    if (bTime) return 1;
    return 0;
  });

  let timelineIndex = 0;
  return items.map((item) => (
    item.itemType === "Case Timeline" ? sortedTimelineItems[timelineIndex++] : item
  ));
}

function renderCaseTitle(item?: CaseRow) {
  if (!item) return "-";
  return [item.file_no, item.title].filter(Boolean).join(" - ") || "-";
}

function renderMatterTitle(item?: AdvisoryMatterRow) {
  if (!item) return "-";
  return [item.matter_no, item.title].filter(Boolean).join(" - ") || "-";
}

function getMonthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, count: number) {
  return new Date(value.getFullYear(), value.getMonth() + count, 1);
}

function getDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildMonthCells(monthDate: Date) {
  const start = getMonthStart(monthDate);
  const daysInMonth = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    0
  ).getDate();
  const cells: { key: string; dateKey: string; dayLabel: string }[] = [];

  for (let i = 0; i < start.getDay(); i += 1) {
    cells.push({ key: `empty-start-${i}`, dateKey: "", dayLabel: "" });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), day);
    cells.push({
      key: getDateKey(date),
      dateKey: getDateKey(date),
      dayLabel: String(day),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-end-${cells.length}`, dateKey: "", dayLabel: "" });
  }

  return cells;
}

function formatMonthLabel(value: Date) {
  return value.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatDisplayDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function getShortItemType(value: CalendarItem["itemType"]) {
  if (value.includes("Deadline")) return "Deadline";
  if (value.includes("Timeline")) return "Timeline";
  if (value.includes("Issue")) return "Issue";
  return "Task";
}

function getItemTypeBadgeLabel(item: CalendarItem) {
  return item.itemType || item.source;
}

function getItemTypeBadgeStyle(item: CalendarItem) {
  return item.source === "Case" ? caseBadgeStyle : advisoryBadgeStyle;
}

function getDueLabel(dateKey: string) {
  const today = getDateKey(new Date());
  const dayDiff = daysBetweenDateKeys(today, dateKey);

  if (dayDiff < 0) {
    const days = Math.abs(dayDiff);
    return days === 1 ? "Overdue 1 day" : `Overdue ${days} days`;
  }

  return getDueStatusLabel(getDueStatus(dateKey));
}

function isOverdueCalendarItem(item: CalendarItem) {
  return getDueStatus(item.date, item.status) === "overdue";
}

function isClosedStatus(status?: string | null) {
  return isClosedDueStatus(status);
}

function daysBetweenDateKeys(startKey: string, endKey: string) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "#f6f8fb",
  color: "#0f172a",
  overflowX: "hidden",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "center",
  flexWrap: "wrap",
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  background: "#ffffff",
  padding: 16,
  marginBottom: 14,
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: 1,
  color: "#0f2743",
  marginBottom: 4,
};

const monthTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f2743",
  fontSize: 22,
  fontWeight: 950,
};

const buttonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const buttonStyle: CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  background: "#ffffff",
  color: "#0f2743",
  cursor: "pointer",
  fontWeight: 850,
};

const mainGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.9fr)",
  gap: 14,
  alignItems: "start",
  minWidth: 0,
};

const compactMainGridStyle: CSSProperties = {
  gridTemplateColumns: "minmax(0, 1fr)",
};

const calendarPanelStyle: CSSProperties = {
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  background: "#ffffff",
  padding: 12,
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
  overflowX: "hidden",
  minWidth: 0,
};

const compactCalendarPanelStyle: CSSProperties = {
  padding: 8,
};

const weekdayGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(92px, 1fr))",
  gap: 6,
  marginBottom: 6,
};

const compactWeekdayGridStyle: CSSProperties = {
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: 3,
};

const weekdayStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 900,
  textAlign: "center",
};

const compactWeekdayStyle: CSSProperties = {
  fontSize: 10,
};

const monthGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(92px, 1fr))",
  gap: 6,
};

const compactMonthGridStyle: CSSProperties = {
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: 3,
};

const baseDateCellStyle: CSSProperties = {
  minHeight: 104,
  display: "grid",
  alignContent: "start",
  gap: 6,
  padding: 8,
  border: "1px solid #eef2f7",
  borderRadius: 10,
  background: "#ffffff",
  color: "#0f172a",
  textAlign: "left",
  cursor: "pointer",
  minWidth: 0,
  outline: "none",
  appearance: "none",
  boxShadow: "none",
};

const compactBaseDateCellStyle: CSSProperties = {
  minHeight: 66,
  gap: 3,
  padding: 4,
  borderRadius: 8,
};

const selectedDateCellStyle: CSSProperties = {
  border: "2px solid #0f2743",
  boxShadow: "0 0 0 1px rgba(15, 39, 67, 0.15)",
};

const todayDateCellStyle: CSSProperties = {
  background: "#f0f7ff",
};

const outsideMonthDateCellStyle: CSSProperties = {
  background: "#f8fafc",
  borderColor: "#eef2f7",
  boxShadow: "none",
  opacity: 0.35,
};

const dateNumberStyle: CSSProperties = {
  color: "#0f2743",
  fontWeight: 950,
};

const compactDateNumberStyle: CSSProperties = {
  fontSize: 12,
};

const countBadgeStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#eef2f7",
  color: "#334155",
  fontSize: 11,
  fontWeight: 900,
};

const compactCountBadgeStyle: CSSProperties = {
  padding: "2px 6px",
  fontSize: 10,
};

const cellBadgeWrapStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  padding: "3px 7px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 950,
};

const caseBadgeStyle: CSSProperties = {
  ...badgeBaseStyle,
  background: "#eff6ff",
  color: "#175cd3",
  border: "1px solid #bdd2f6",
};

const advisoryBadgeStyle: CSSProperties = {
  ...badgeBaseStyle,
  background: "#f3e8ff",
  color: "#7e22ce",
  border: "1px solid #d9c4f2",
};

const sidePanelStackStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const panelStyle: CSSProperties = {
  border: "1px solid #dbe3ee",
  borderRadius: 12,
  background: "#ffffff",
  padding: 14,
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 10,
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f2743",
  fontSize: 17,
  fontWeight: 950,
};

const itemListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 620,
  overflowY: "auto",
  paddingRight: 4,
};

const itemRowStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 10,
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  background: "#ffffff",
  color: "#0f172a",
  textDecoration: "none",
};

const overdueItemRowStyle: CSSProperties = {
  ...itemRowStyle,
  border: "1px solid #fca5a5",
  background: "#fef2f2",
  color: "#7f1d1d",
};

const itemTopLineStyle: CSSProperties = {
  display: "flex",
  gap: 5,
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const itemBadgeLineStyle: CSSProperties = {
  display: "flex",
  gap: 5,
  flexWrap: "wrap",
};

const dateChipStyle: CSSProperties = {
  ...badgeBaseStyle,
  background: "#f1f5f9",
  color: "#334155",
  border: "1px solid #dbe3ee",
};

const itemTitleStyle: CSSProperties = {
  color: "#0f2743",
  fontSize: 14,
  fontWeight: 950,
};

const overdueItemTitleStyle: CSSProperties = {
  ...itemTitleStyle,
  color: "#7f1d1d",
};

const itemMetaStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.35,
};

const overdueItemMetaStyle: CSSProperties = {
  ...itemMetaStyle,
  color: "#991b1b",
};

const itemTimeStyle: CSSProperties = {
  color: "#0f2743",
  fontSize: 12,
  fontWeight: 850,
  lineHeight: 1.35,
};

const overdueItemTimeStyle: CSSProperties = {
  ...itemTimeStyle,
  color: "#991b1b",
};

const emptyStyle: CSSProperties = {
  padding: 14,
  border: "1px dashed #cbd5e1",
  borderRadius: 10,
  color: "#64748b",
  fontWeight: 800,
};

const noAccessStyle: CSSProperties = {
  ...panelStyle,
  color: "#a40000",
  background: "#fff5f5",
};

const errorStyle: CSSProperties = {
  ...panelStyle,
  marginBottom: 14,
  color: "#a40000",
  background: "#fff5f5",
};
