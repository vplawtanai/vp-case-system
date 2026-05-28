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
  minutes?: number | null;
  billable?: boolean | null;
};

type TaskRow = {
  id: string;
  advisory_matter_id?: string | null;
  advisory_issue_id?: string | null;
  client_id?: string | null;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
};

type AdviceRow = {
  id: string;
  advisory_matter_id?: string | null;
  advisory_issue_id?: string | null;
  client_id?: string | null;
  advice_date?: string | null;
  channel?: string | null;
};

export default function AdvisoryReportsPage() {
  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [month, setMonth] = useState(getCurrentMonth());
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

      const { firstDay, nextMonth } = getMonthRange(month);

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
              "id, advisory_matter_id, advisory_issue_id, client_id, work_date, staff_name, minutes, billable"
            )
            .gte("work_date", firstDay)
            .lt("work_date", nextMonth)
            .is("deleted_at", null),
          supabase
            .from("advisory_advice_records")
            .select("id, advisory_matter_id, advisory_issue_id, client_id, advice_date, channel")
            .gte("advice_date", firstDay)
            .lt("advice_date", nextMonth)
            .is("deleted_at", null),
          supabase
            .from("advisory_issue_tasks")
            .select(
              "id, advisory_matter_id, advisory_issue_id, client_id, status, priority, due_date, completed_at"
            )
            .gte("due_date", firstDay)
            .lt("due_date", nextMonth)
            .is("deleted_at", null),
          supabase
            .from("advisory_issue_tasks")
            .select(
              "id, advisory_matter_id, advisory_issue_id, client_id, status, priority, due_date, completed_at"
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
  }, [canView, loadingProfile, month]);

  const report = useMemo(() => {
    const clientMap = new Map(clients.map((item) => [item.id, item.name || "-"]));
    const matterMap = new Map(matters.map((item) => [item.id, item]));
    const issueMap = new Map(issues.map((item) => [item.id, item]));

    const total = sumMinutes(timeLogs);
    const core = sumMinutes(timeLogs.filter((item) => item.billable !== false));
    const support = sumMinutes(timeLogs.filter((item) => item.billable === false));

    return {
      total,
      core,
      support,
      adviceCount: adviceRecords.length,
      taskTotal: tasks.length,
      taskCompleted: tasks.filter((item) => item.status === "completed").length,
      taskActive: tasks.filter((item) =>
        ["pending", "in_progress", "waiting"].includes(item.status || "")
      ).length,
      taskImportant: tasks.filter((item) =>
        ["urgent", "high"].includes(item.priority || "")
      ).length,
      timeByStaff: groupTime(timeLogs, (item) => item.staff_name || "-"),
      timeByClient: groupTime(timeLogs, (item) =>
        clientMap.get(item.client_id || "") || "-"
      ),
      timeByIssue: groupTime(timeLogs, (item) => {
        const issue = issueMap.get(item.advisory_issue_id || "");
        return issue ? renderIssueLabel(issue) : "-";
      }),
      timeByMatterIssue: groupTime(timeLogs, (item) => {
        const matter = matterMap.get(item.advisory_matter_id || "");
        const issue = issueMap.get(item.advisory_issue_id || "");
        return `${matter?.matter_no || matter?.title || "-"} / ${
          issue ? renderIssueLabel(issue) : "-"
        }`;
      }),
      taskStatus: countBy(tasks, (item) => item.status || "-"),
      adviceByChannel: countBy(adviceRecords, (item) => item.channel || "-"),
    };
  }, [adviceRecords, clients, issues, matters, tasks, timeLogs]);

  const hasReportData =
    timeLogs.length > 0 || tasks.length > 0 || adviceRecords.length > 0;

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
          <label style={labelStyle}>
            Month
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              style={inputStyle}
            />
          </label>
        </section>

        {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}
        {loadingData ? <div style={messageBoxStyle}>Loading report...</div> : null}

        {!loadingData && !hasReportData ? (
          <div style={messageBoxStyle}>No report data for selected month.</div>
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
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
