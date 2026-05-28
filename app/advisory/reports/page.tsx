"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { buildPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import type { UserPermissions, UserRole } from "../../../lib/permissions";

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
};

type ClientRow = {
  id: string;
  name?: string | null;
};

type MatterRow = {
  id: string;
  client_id?: string | null;
  matter_no?: string | null;
  title?: string | null;
};

type IssueRow = {
  id: string;
  advisory_matter_id?: string | null;
  title?: string | null;
  issue_no?: string | null;
};

type TimeLogRow = {
  id: string;
  advisory_matter_id?: string | null;
  advisory_issue_id?: string | null;
  client_id?: string | null;
  work_date?: string | null;
  staff_name?: string | null;
  work_type?: string | null;
  minutes?: number | null;
  billable?: boolean | null;
  note?: string | null;
};

type TaskRow = {
  id: string;
  advisory_matter_id?: string | null;
  advisory_issue_id?: string | null;
  client_id?: string | null;
  title?: string | null;
  task_type?: string | null;
  status?: string | null;
  priority?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  note?: string | null;
};

type AdviceRow = {
  id: string;
  advisory_matter_id?: string | null;
  advisory_issue_id?: string | null;
  client_id?: string | null;
  advice_date?: string | null;
  channel?: string | null;
  responsible_person?: string | null;
  question?: string | null;
  advice_given?: string | null;
  follow_up?: string | null;
};

export default function AdvisoryReportsPage() {
  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [month, setMonth] = useState(getCurrentMonth());
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedStaffName, setSelectedStaffName] = useState("");
  const [errorText, setErrorText] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [matters, setMatters] = useState<MatterRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLogRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [adviceRecords, setAdviceRecords] = useState<AdviceRow[]>([]);

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const canView = permissions.canViewDashboard;
  const safeMonth = month || getCurrentMonth();

  const staffOptions = useMemo(() => {
    return Array.from(
      new Set(timeLogs.map((item) => item.staff_name || "").filter(Boolean))
    ).sort();
  }, [timeLogs]);

  const filteredTimeLogs = useMemo(() => {
    return timeLogs.filter((item) => {
      if (selectedClientId && item.client_id !== selectedClientId) return false;
      if (selectedStaffName && item.staff_name !== selectedStaffName) return false;
      return true;
    });
  }, [selectedClientId, selectedStaffName, timeLogs]);

  const filteredTasks = useMemo(() => {
    if (!selectedClientId) return tasks;
    return tasks.filter((item) => item.client_id === selectedClientId);
  }, [selectedClientId, tasks]);

  const filteredAdviceRecords = useMemo(() => {
    if (!selectedClientId) return adviceRecords;
    return adviceRecords.filter((item) => item.client_id === selectedClientId);
  }, [adviceRecords, selectedClientId]);

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
    const loadData = async () => {
      if (!canView) return;

      const { firstDay, nextMonth } = getMonthRange(safeMonth);

      try {
        setLoadingData(true);
        setErrorText("");

        const [
          clientsRes,
          mattersRes,
          issuesRes,
          timeLogsRes,
          adviceRes,
          dueTasksRes,
          completedTasksRes,
        ] = await Promise.all([
          supabase.from("clients").select("id, name"),
          supabase.from("advisory_matters").select("id, client_id, matter_no, title"),
          supabase
            .from("advisory_issues")
            .select("id, advisory_matter_id, issue_no, title"),
          supabase
            .from("advisory_time_logs")
            .select(
              "id, advisory_matter_id, advisory_issue_id, client_id, work_date, staff_name, work_type, minutes, billable, note"
            )
            .gte("work_date", firstDay)
            .lt("work_date", nextMonth)
            .is("deleted_at", null),
          supabase
            .from("advisory_advice_records")
            .select(
              "id, advisory_matter_id, advisory_issue_id, client_id, advice_date, channel, responsible_person, question, advice_given, follow_up"
            )
            .gte("advice_date", firstDay)
            .lt("advice_date", nextMonth)
            .is("deleted_at", null),
          supabase
            .from("advisory_issue_tasks")
            .select(
              "id, advisory_matter_id, advisory_issue_id, client_id, title, task_type, status, priority, assignee_name, due_date, completed_at, note"
            )
            .gte("due_date", firstDay)
            .lt("due_date", nextMonth)
            .is("deleted_at", null),
          supabase
            .from("advisory_issue_tasks")
            .select(
              "id, advisory_matter_id, advisory_issue_id, client_id, title, task_type, status, priority, assignee_name, due_date, completed_at, note"
            )
            .gte("completed_at", firstDay)
            .lt("completed_at", nextMonth)
            .is("deleted_at", null),
        ]);

        const failed = [
          clientsRes,
          mattersRes,
          issuesRes,
          timeLogsRes,
          adviceRes,
          dueTasksRes,
          completedTasksRes,
        ].find((response) => response.error);

        if (failed?.error) {
          setErrorText(failed.error.message || "Load advisory report failed");
          return;
        }

        setClients((clientsRes.data || []) as ClientRow[]);
        setMatters((mattersRes.data || []) as MatterRow[]);
        setIssues((issuesRes.data || []) as IssueRow[]);
        setTimeLogs((timeLogsRes.data || []) as TimeLogRow[]);
        setAdviceRecords((adviceRes.data || []) as AdviceRow[]);
        setTasks(mergeTasks(
          (dueTasksRes.data || []) as TaskRow[],
          (completedTasksRes.data || []) as TaskRow[]
        ));
      } finally {
        setLoadingData(false);
      }
    };

    if (loadingProfile) return;
    loadData();
  }, [canView, loadingProfile, safeMonth]);

  const report = useMemo(() => {
    const clientMap = new Map(clients.map((item) => [item.id, item.name || "-"]));
    const matterMap = new Map(matters.map((item) => [item.id, item]));
    const issueMap = new Map(issues.map((item) => [item.id, item]));

    const total = sumMinutes(filteredTimeLogs);
    const core = sumMinutes(
      filteredTimeLogs.filter((item) => item.billable !== false)
    );
    const support = sumMinutes(
      filteredTimeLogs.filter((item) => item.billable === false)
    );

    return {
      total,
      core,
      support,
      adviceCount: filteredAdviceRecords.length,
      taskTotal: filteredTasks.length,
      taskCompleted: filteredTasks.filter((item) => item.status === "completed")
        .length,
      taskActive: filteredTasks.filter((item) =>
        ["pending", "in_progress", "waiting"].includes(item.status || "")
      ).length,
      taskImportant: filteredTasks.filter((item) =>
        ["urgent", "high"].includes(item.priority || "")
      ).length,
      timeByStaff: groupTime(filteredTimeLogs, (item) => item.staff_name || "-"),
      timeByClient: groupTime(filteredTimeLogs, (item) =>
        clientMap.get(item.client_id || "") || "-"
      ),
      timeByIssue: groupTime(filteredTimeLogs, (item) => {
        const issue = issueMap.get(item.advisory_issue_id || "");
        return issue ? renderIssueLabel(issue) : "-";
      }),
      timeByMatterIssue: groupTime(filteredTimeLogs, (item) => {
        const matter = matterMap.get(item.advisory_matter_id || "");
        const issue = issueMap.get(item.advisory_issue_id || "");
        return `${matter?.matter_no || matter?.title || "-"} / ${
          issue ? renderIssueLabel(issue) : "-"
        }`;
      }),
      taskStatus: countBy(filteredTasks, (item) => item.status || "-"),
      adviceByChannel: countBy(
        filteredAdviceRecords,
        (item) => item.channel || "-"
      ),
    };
  }, [
    clients,
    filteredAdviceRecords,
    filteredTasks,
    filteredTimeLogs,
    issues,
    matters,
  ]);

  const hasReportData =
    filteredTimeLogs.length > 0 ||
    filteredTasks.length > 0 ||
    filteredAdviceRecords.length > 0;

  const exportCsv = () => {
    const clientMap = new Map(clients.map((item) => [item.id, item.name || "-"]));
    const matterMap = new Map(matters.map((item) => [item.id, item]));
    const issueMap = new Map(issues.map((item) => [item.id, item]));
    const rows = buildCsvRows({
      month: safeMonth,
      clientFilterLabel: selectedClientId
        ? clientMap.get(selectedClientId) || selectedClientId
        : "All Clients",
      staffFilterLabel: selectedStaffName || "All Staff",
      report,
      timeLogs: filteredTimeLogs,
      tasks: filteredTasks,
      adviceRecords: filteredAdviceRecords,
      clientMap,
      matterMap,
      issueMap,
      hasReportData,
    });
    const csv = rows.map(toCsvLine).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `advisory-report-${safeMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <div style={messageBoxStyle}>Loading permission...</div>
        </main>
      </AuthGuard>
    );
  }

  if (!canView) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="Advisory Reports"
            subtitle="Monthly advisory overview"
            activePage="advisory"
          />
          <div style={noAccessBoxStyle}>No access</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav
          title="Advisory Reports"
          subtitle="Monthly advisory overview"
          activePage="advisory"
        />

        <Link href="/advisory" style={backLinkStyle}>
          Back to Advisory
        </Link>

        <section style={panelStyle}>
          <div style={filterRowStyle}>
            <label style={labelStyle}>
              Month
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Client
              <select
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                style={inputStyle}
              >
                <option value="">All Clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name || client.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Staff
              <select
                value={selectedStaffName}
                onChange={(event) => setSelectedStaffName(event.target.value)}
                style={inputStyle}
              >
                <option value="">All Staff</option>
                {staffOptions.map((staffName) => (
                  <option key={staffName} value={staffName}>
                    {staffName}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={exportCsv} style={buttonStyle}>
              Export CSV
            </button>
          </div>
        </section>

        {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}
        {loadingData ? <div style={messageBoxStyle}>Loading report...</div> : null}

        {!loadingData && !hasReportData ? (
          <div style={messageBoxStyle}>No report data for selected filters.</div>
        ) : null}

        <div style={summaryGridStyle}>
          <SummaryCard label="Total Time" value={formatDuration(report.total)} />
          <SummaryCard label="Core Time" value={formatDuration(report.core)} />
          <SummaryCard
            label="Support Time"
            value={formatDuration(report.support)}
          />
          <SummaryCard label="Advice Records" value={String(report.adviceCount)} />
          <SummaryCard label="Tasks Total" value={String(report.taskTotal)} />
          <SummaryCard
            label="Tasks Completed"
            value={String(report.taskCompleted)}
          />
          <SummaryCard
            label="Tasks Active"
            value={String(report.taskActive)}
          />
          <SummaryCard
            label="Urgent/High Tasks"
            value={String(report.taskImportant)}
          />
        </div>

        <ReportTable title="Time by Staff" rows={report.timeByStaff} isTime />
        <ReportTable title="Time by Client" rows={report.timeByClient} isTime />
        <ReportTable title="Time by Issue" rows={report.timeByIssue} isTime />
        <ReportTable title="Task Status Summary" rows={report.taskStatus} />
        <ReportTable
          title="Advice Records Summary"
          rows={report.adviceByChannel}
        />
        <ReportTable
          title="Top Matters / Issues by Time"
          rows={report.timeByMatterIssue.slice(0, 10)}
          isTime
        />
      </main>
    </AuthGuard>
  );
}

function buildCsvRows({
  month,
  clientFilterLabel,
  staffFilterLabel,
  report,
  timeLogs,
  tasks,
  adviceRecords,
  clientMap,
  matterMap,
  issueMap,
  hasReportData,
}: {
  month: string;
  clientFilterLabel: string;
  staffFilterLabel: string;
  report: {
    total: number;
    core: number;
    support: number;
    adviceCount: number;
    taskTotal: number;
    taskCompleted: number;
    taskActive: number;
    taskImportant: number;
  };
  timeLogs: TimeLogRow[];
  tasks: TaskRow[];
  adviceRecords: AdviceRow[];
  clientMap: Map<string, string>;
  matterMap: Map<string, MatterRow>;
  issueMap: Map<string, IssueRow>;
  hasReportData: boolean;
}) {
  const rows: string[][] = [
    ["Summary"],
    ["Month", month],
    ["Client Filter", clientFilterLabel],
    ["Staff Filter", staffFilterLabel],
    ["Total Time", formatDuration(report.total)],
    ["Core Time", formatDuration(report.core)],
    ["Support Time", formatDuration(report.support)],
    ["Advice Records", String(report.adviceCount)],
    ["Tasks Total", String(report.taskTotal)],
    ["Tasks Completed", String(report.taskCompleted)],
    ["Tasks Active", String(report.taskActive)],
    ["Urgent/High Tasks", String(report.taskImportant)],
  ];

  if (!hasReportData) {
    rows.push([], ["No report data for selected filters."]);
  }

  rows.push(
    [],
    ["Time Logs"],
    [
      "Work Date",
      "Staff",
      "Client",
      "Matter",
      "Issue",
      "Work Type",
      "Category",
      "Minutes",
      "Duration",
      "Note",
    ],
    ...timeLogs.map((item) => [
      item.work_date || "",
      item.staff_name || "",
      clientMap.get(item.client_id || "") || "",
      renderMatterLabel(matterMap.get(item.advisory_matter_id || "")),
      renderIssueLabelOrBlank(issueMap.get(item.advisory_issue_id || "")),
      item.work_type || "",
      item.billable === false ? "Support" : "Core",
      String(item.minutes || 0),
      formatDuration(Number(item.minutes || 0)),
      item.note || "",
    ])
  );

  rows.push(
    [],
    ["Tasks"],
    [
      "Due Date",
      "Completed At",
      "Client",
      "Matter",
      "Issue",
      "Title",
      "Task Type",
      "Status",
      "Priority",
      "Assignee",
      "Note",
    ],
    ...tasks.map((item) => [
      item.due_date || "",
      item.completed_at || "",
      clientMap.get(item.client_id || "") || "",
      renderMatterLabel(matterMap.get(item.advisory_matter_id || "")),
      renderIssueLabelOrBlank(issueMap.get(item.advisory_issue_id || "")),
      item.title || "",
      item.task_type || "",
      item.status || "",
      item.priority || "",
      item.assignee_name || "",
      item.note || "",
    ])
  );

  rows.push(
    [],
    ["Advice Records"],
    [
      "Advice Date",
      "Client",
      "Matter",
      "Issue",
      "Channel",
      "Responsible Person",
      "Question",
      "Advice Given",
      "Follow-up",
    ],
    ...adviceRecords.map((item) => [
      item.advice_date || "",
      clientMap.get(item.client_id || "") || "",
      renderMatterLabel(matterMap.get(item.advisory_matter_id || "")),
      renderIssueLabelOrBlank(issueMap.get(item.advisory_issue_id || "")),
      item.channel || "",
      item.responsible_person || "",
      item.question || "",
      item.advice_given || "",
      item.follow_up || "",
    ])
  );

  return rows;
}

function toCsvLine(row: string[]) {
  return row.map(escapeCsvValue).join(",");
}

function escapeCsvValue(value: string) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function ReportTable({
  title,
  rows,
  isTime = false,
}: {
  title: string;
  rows: { label: string; value: number }[];
  isTime?: boolean;
}) {
  return (
    <section style={panelStyle}>
      <h3 style={sectionTitleStyle}>{title}</h3>
      {rows.length === 0 ? (
        <div style={messageInlineStyle}>No data.</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>{isTime ? "Time" : "Count"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td style={tdStyle}>{row.label}</td>
                  <td style={tdStyle}>
                    {isTime ? formatDuration(row.value) : row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthRange(value: string) {
  const [year, month] = value.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  return {
    firstDay: first.toISOString().slice(0, 10),
    nextMonth: next.toISOString().slice(0, 10),
  };
}

function mergeTasks(first: TaskRow[], second: TaskRow[]) {
  const map = new Map<string, TaskRow>();
  [...first, ...second].forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function sumMinutes(rows: TimeLogRow[]) {
  return rows.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
}

function groupTime(rows: TimeLogRow[], getLabel: (item: TimeLogRow) => string) {
  const map = new Map<string, number>();
  rows.forEach((item) => {
    const label = getLabel(item);
    map.set(label, (map.get(label) || 0) + Number(item.minutes || 0));
  });
  return sortRows(map);
}

function countBy<T>(rows: T[], getLabel: (item: T) => string) {
  const map = new Map<string, number>();
  rows.forEach((item) => {
    const label = getLabel(item);
    map.set(label, (map.get(label) || 0) + 1);
  });
  return sortRows(map);
}

function sortRows(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function renderIssueLabel(issue: IssueRow) {
  const prefix = issue.issue_no ? `${issue.issue_no} - ` : "";
  return `${prefix}${issue.title || issue.id}`;
}

function renderIssueLabelOrBlank(issue?: IssueRow) {
  return issue ? renderIssueLabel(issue) : "";
}

function renderMatterLabel(matter?: MatterRow) {
  if (!matter) return "";
  const prefix = matter.matter_no ? `${matter.matter_no} - ` : "";
  return `${prefix}${matter.title || matter.id}`;
}

function formatDuration(value: number) {
  const minutes = Number(value || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder} min`;
  if (remainder <= 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "#f8fafc",
  color: "#111111",
};

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  padding: 16,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  padding: 14,
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#666666",
  fontSize: 12,
  fontWeight: 800,
};

const summaryValueStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  fontWeight: 900,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  maxWidth: 260,
  fontSize: 13,
  fontWeight: 800,
};

const filterRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "end",
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #000000",
  borderRadius: 8,
  background: "#000000",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 12px 0",
  fontSize: 18,
  fontWeight: 900,
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 520,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #dddddd",
  background: "#f3f4f6",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 800,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eeeeee",
  fontSize: 14,
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 12,
  color: "#111111",
  fontWeight: 800,
};

const messageBoxStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 18,
  fontWeight: 800,
};

const messageInlineStyle: React.CSSProperties = {
  padding: 8,
  fontWeight: 800,
};

const noAccessBoxStyle: React.CSSProperties = {
  padding: 18,
  border: "1px solid #f0c4c4",
  borderRadius: 12,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 800,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  border: "1px solid #f0c4c4",
  borderRadius: 10,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 700,
};
