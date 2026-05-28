"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { buildPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  staff_name: string | null;
  role: string | null;
  active?: boolean | null;
};

type CaseTimeLog = {
  id: string;
  case_id: string | null;
  work_date: string;
  staff_name: string | null;
  work_type: string | null;
  work_other: string | null;
  minutes: number | null;
  billable: boolean | null;
  note: string | null;
};

type AdvisoryTimeLog = {
  id: string;
  advisory_matter_id: string | null;
  advisory_issue_id: string | null;
  client_id: string | null;
  work_date: string;
  staff_name: string | null;
  work_type: string | null;
  work_other: string | null;
  minutes: number | null;
  billable: boolean | null;
  note: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
};

type CaseRow = {
  id: string;
  file_no: string | null;
  title: string | null;
  client_name: string | null;
  case_number: string | null;
};

type AdvisoryMatter = {
  id: string;
  client_id: string | null;
  matter_no: string | null;
  title: string | null;
};

type AdvisoryIssue = {
  id: string;
  advisory_matter_id: string | null;
  issue_no: string | null;
  title: string | null;
};

type Client = {
  id: string;
  name: string | null;
};

type WorkloadRow = {
  id: string;
  source: "case" | "advisory";
  work_date: string;
  staff_name: string;
  client_name: string;
  matter_or_case: string;
  issue: string;
  work_type: string;
  category: "Core" | "Support";
  minutes: number;
  note: string;
};

type StaffSummary = {
  staff: string;
  core: number;
  support: number;
  caseTime: number;
  advisoryTime: number;
  total: number;
  signal: "No Time" | "No Core" | "Support High" | "Normal";
};

const today = () => new Date().toISOString().slice(0, 10);

const formatDuration = (minutes: number) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

const displayName = (profile: Profile | null) =>
  profile?.staff_name || profile?.full_name || profile?.email || "";

const uniqueValues = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.filter(Boolean) as string[]));

const workTypeLabel = (workType: string | null, other: string | null) => {
  if (workType === "อื่นๆ" || workType === "other") return other || workType || "-";
  return workType || "-";
};

const getSignal = (
  core: number,
  support: number,
  total: number,
): StaffSummary["signal"] => {
  if (total <= 0) return "No Time";
  if (core <= 0) return "No Core";
  if (support > core) return "Support High";
  return "Normal";
};

const signalClass = (signal: StaffSummary["signal"]) => {
  if (signal === "No Time") return "bg-gray-100 text-gray-700";
  if (signal === "No Core") return "bg-red-50 text-red-700";
  if (signal === "Support High") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
};

export default function DailyWorkloadReportPage() {
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedStaff, setSelectedStaff] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [actorUserId, setActorUserId] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [activeProfiles, setActiveProfiles] = useState<Profile[]>([]);
  const [caseLogs, setCaseLogs] = useState<CaseTimeLog[]>([]);
  const [advisoryLogs, setAdvisoryLogs] = useState<AdvisoryTimeLog[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [matters, setMatters] = useState<AdvisoryMatter[]>([]);
  const [issues, setIssues] = useState<AdvisoryIssue[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const permissions = buildPermissions(profile);
  const canViewAll = permissions.role === "admin" || permissions.role === "partner";
  const canView = permissions.canViewDashboard;
  const ownStaffName = displayName(profile);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorText("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setErrorText(userError?.message || "Unable to load current user.");
        setLoading(false);
        return;
      }

      setActorUserId(userData.user.id);
      setActorEmail(userData.user.email || "");

      const { data: profileData, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, email, full_name, staff_name, role, active")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError || !profileData) {
        setErrorText(profileError?.message || "Unable to load user profile.");
        setLoading(false);
        return;
      }

      const currentProfile = profileData as Profile;
      const currentPermissions = buildPermissions(currentProfile);
      const isAdminOrPartner =
        currentPermissions.role === "admin" || currentPermissions.role === "partner";
      const ownNames = uniqueValues([currentProfile.staff_name, currentProfile.full_name]);
      setProfile(currentProfile);

      if (!currentPermissions.canViewDashboard) {
        setLoading(false);
        return;
      }

      let caseLogsResult;
      if (isAdminOrPartner) {
        caseLogsResult = await supabase
          .from("case_time_logs")
          .select("id, case_id, work_date, staff_name, work_type, work_other, minutes, billable, note")
          .eq("work_date", selectedDate)
          .is("deleted_at", null);
      } else if (ownNames.length === 0) {
        caseLogsResult = { data: [], error: null };
      } else {
        let caseQuery = supabase
          .from("case_time_logs")
          .select("id, case_id, work_date, staff_name, work_type, work_other, minutes, billable, note")
          .eq("work_date", selectedDate)
          .is("deleted_at", null);
        caseQuery =
          ownNames.length === 1
            ? caseQuery.eq("staff_name", ownNames[0])
            : caseQuery.in("staff_name", ownNames);
        caseLogsResult = await caseQuery;
      }

      const advisorySelect =
        "id, advisory_matter_id, advisory_issue_id, client_id, work_date, staff_name, work_type, work_other, minutes, billable, note, created_by_user_id, created_by_email, created_by_name";
      const advisoryBaseQuery = () =>
        supabase
          .from("advisory_time_logs")
          .select(advisorySelect)
          .eq("work_date", selectedDate)
          .is("deleted_at", null);

      let advisoryLogsResult;
      if (isAdminOrPartner) {
        advisoryLogsResult = await advisoryBaseQuery();
      } else {
        const advisoryQueries = [];
        if (userData.user.id) {
          advisoryQueries.push(advisoryBaseQuery().eq("created_by_user_id", userData.user.id));
        }
        if (userData.user.email) {
          advisoryQueries.push(advisoryBaseQuery().eq("created_by_email", userData.user.email));
        }
        if (ownNames.length === 1) {
          advisoryQueries.push(advisoryBaseQuery().eq("staff_name", ownNames[0]));
        } else if (ownNames.length > 1) {
          advisoryQueries.push(advisoryBaseQuery().in("staff_name", ownNames));
        }

        if (advisoryQueries.length === 0) {
          advisoryLogsResult = { data: [], error: null };
        } else {
          const advisoryResults = await Promise.all(advisoryQueries);
          const advisoryError = advisoryResults.find((result) => result.error)?.error || null;
          const advisoryById = new Map<string, AdvisoryTimeLog>();
          advisoryResults.forEach((result) => {
            ((result.data || []) as AdvisoryTimeLog[]).forEach((item) => {
              advisoryById.set(item.id, item);
            });
          });
          advisoryLogsResult = {
            data: Array.from(advisoryById.values()),
            error: advisoryError,
          };
        }
      }

      const caseLogsData = (caseLogsResult.data || []) as CaseTimeLog[];
      const advisoryLogsData = (advisoryLogsResult.data || []) as AdvisoryTimeLog[];
      const caseIds = uniqueValues(caseLogsData.map((item) => item.case_id));
      const matterIds = uniqueValues(advisoryLogsData.map((item) => item.advisory_matter_id));
      const issueIds = uniqueValues(advisoryLogsData.map((item) => item.advisory_issue_id));
      const directClientIds = uniqueValues(advisoryLogsData.map((item) => item.client_id));

      const [casesResult, mattersResult, issuesResult, profilesResult] = await Promise.all([
        caseIds.length > 0
          ? supabase
              .from("cases")
              .select("id, file_no, title, client_name, case_number")
              .in("id", caseIds)
          : Promise.resolve({ data: [], error: null }),
        matterIds.length > 0
          ? supabase
              .from("advisory_matters")
              .select("id, client_id, matter_no, title")
              .in("id", matterIds)
          : Promise.resolve({ data: [], error: null }),
        issueIds.length > 0
          ? supabase
              .from("advisory_issues")
              .select("id, advisory_matter_id, issue_no, title")
              .in("id", issueIds)
          : Promise.resolve({ data: [], error: null }),
        isAdminOrPartner
          ? supabase
              .from("user_profiles")
              .select("id, email, full_name, staff_name, role, active")
              .eq("active", true)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const mattersData = (mattersResult.data || []) as AdvisoryMatter[];
      const clientIds = uniqueValues([
        ...directClientIds,
        ...mattersData.map((item) => item.client_id),
      ]);
      const clientsResult =
        clientIds.length > 0
          ? await supabase.from("clients").select("id, name").in("id", clientIds)
          : { data: [], error: null };

      const firstError =
        caseLogsResult.error ||
        advisoryLogsResult.error ||
        casesResult.error ||
        mattersResult.error ||
        issuesResult.error ||
        clientsResult.error ||
        profilesResult.error;

      if (firstError) {
        setErrorText(firstError.message);
      }

      setCaseLogs(caseLogsData);
      setAdvisoryLogs(advisoryLogsData);
      setCases((casesResult.data || []) as CaseRow[]);
      setMatters(mattersData);
      setIssues((issuesResult.data || []) as AdvisoryIssue[]);
      setClients((clientsResult.data || []) as Client[]);
      setActiveProfiles((profilesResult.data || []) as Profile[]);
      setLoading(false);
    };

    void load();
  }, [selectedDate]);

  const rows = useMemo(() => {
    const caseMap = new Map(cases.map((item) => [item.id, item]));
    const matterMap = new Map(matters.map((item) => [item.id, item]));
    const issueMap = new Map(issues.map((item) => [item.id, item]));
    const clientMap = new Map(clients.map((item) => [item.id, item]));
    const ownNames = [profile?.staff_name, profile?.full_name].filter(Boolean);

    const caseRows = caseLogs
      .filter((log) => {
        if (canViewAll) return true;
        return ownNames.includes(log.staff_name || "");
      })
      .map((log): WorkloadRow => {
        const caseItem = log.case_id ? caseMap.get(log.case_id) : null;
        const caseLabel = [
          caseItem?.file_no || caseItem?.case_number,
          caseItem?.title,
        ]
          .filter(Boolean)
          .join(" - ");

        return {
          id: log.id,
          source: "case",
          work_date: log.work_date,
          staff_name: log.staff_name || "-",
          client_name: caseItem?.client_name || "-",
          matter_or_case: caseLabel || "Case",
          issue: "-",
          work_type: workTypeLabel(log.work_type, log.work_other),
          category: log.billable === false ? "Support" : "Core",
          minutes: Number(log.minutes || 0),
          note: log.note || "",
        };
      });

    const advisoryRows = advisoryLogs
      .filter((log) => {
        if (canViewAll) return true;
        if (log.created_by_user_id) return log.created_by_user_id === actorUserId;
        if (log.created_by_email) return log.created_by_email === actorEmail;
        return ownNames.includes(log.staff_name || "");
      })
      .map((log): WorkloadRow => {
        const matter = log.advisory_matter_id ? matterMap.get(log.advisory_matter_id) : null;
        const issue = log.advisory_issue_id ? issueMap.get(log.advisory_issue_id) : null;
        const client = log.client_id
          ? clientMap.get(log.client_id)
          : matter?.client_id
            ? clientMap.get(matter.client_id)
            : null;

        return {
          id: log.id,
          source: "advisory",
          work_date: log.work_date,
          staff_name: log.staff_name || log.created_by_name || "-",
          client_name: client?.name || "-",
          matter_or_case: [matter?.matter_no, matter?.title].filter(Boolean).join(" - ") || "Advisory",
          issue: [issue?.issue_no, issue?.title].filter(Boolean).join(" - ") || "-",
          work_type: workTypeLabel(log.work_type, log.work_other),
          category: log.billable === false ? "Support" : "Core",
          minutes: Number(log.minutes || 0),
          note: log.note || "",
        };
      });

    const allRows = [...caseRows, ...advisoryRows];
    if (canViewAll && selectedStaff) {
      return allRows.filter((row) => row.staff_name === selectedStaff);
    }
    return allRows;
  }, [
    actorEmail,
    actorUserId,
    advisoryLogs,
    canViewAll,
    caseLogs,
    cases,
    clients,
    issues,
    matters,
    profile?.full_name,
    profile?.staff_name,
    selectedStaff,
  ]);

  const staffOptions = useMemo(() => {
    const profileNames = activeProfiles.map((item) => displayName(item)).filter(Boolean);
    const rowNames = rows.map((row) => row.staff_name).filter((name) => name && name !== "-");
    return Array.from(new Set([...profileNames, ...rowNames])).sort();
  }, [activeProfiles, rows]);

  const summary = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + row.minutes, 0);
    const core = rows
      .filter((row) => row.category === "Core")
      .reduce((sum, row) => sum + row.minutes, 0);
    const support = total - core;
    const caseTime = rows
      .filter((row) => row.source === "case")
      .reduce((sum, row) => sum + row.minutes, 0);
    const advisoryTime = total - caseTime;

    return {
      total,
      core,
      support,
      caseTime,
      advisoryTime,
      staffCount: new Set(rows.map((row) => row.staff_name).filter((name) => name !== "-")).size,
    };
  }, [rows]);

  const staffTable = useMemo(() => {
    const staffNames = canViewAll
      ? selectedStaff
        ? [selectedStaff]
        : Array.from(
            new Set([
              ...staffOptions,
              ...rows.map((row) => row.staff_name).filter((name) => name && name !== "-"),
            ]),
          )
      : [ownStaffName || "-"];

    return staffNames.sort().map((staff): StaffSummary => {
      const staffRows = rows.filter((row) => row.staff_name === staff);
      const total = staffRows.reduce((sum, row) => sum + row.minutes, 0);
      const core = staffRows
        .filter((row) => row.category === "Core")
        .reduce((sum, row) => sum + row.minutes, 0);
      const support = total - core;
      const caseTime = staffRows
        .filter((row) => row.source === "case")
        .reduce((sum, row) => sum + row.minutes, 0);
      const advisoryTime = total - caseTime;

      return {
        staff,
        core,
        support,
        caseTime,
        advisoryTime,
        total,
        signal: getSignal(core, support, total),
      };
    });
  }, [canViewAll, ownStaffName, rows, selectedStaff, staffOptions]);

  if (!loading && !canView) {
    return (
      <AuthGuard>
        <AppTopNav activePage="dashboard" title="Daily Time Check" />
        <main className="p-6">
          <div className="rounded-lg border bg-white p-6 text-gray-700">No access</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AppTopNav activePage="dashboard" title="Daily Time Check" />
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header>
            <h1 className="text-2xl font-semibold text-gray-900">Daily Time Check</h1>
            <p className="text-sm text-gray-500">Case and advisory workload for the selected day.</p>
          </header>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap gap-4">
              <label className="text-sm font-medium text-gray-700">
                Date
                <input
                  className="mt-1 block rounded-md border px-3 py-2 text-sm"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value || today())}
                />
              </label>

              {canViewAll && (
                <label className="text-sm font-medium text-gray-700">
                  Staff
                  <select
                    className="mt-1 block rounded-md border px-3 py-2 text-sm"
                    value={selectedStaff}
                    onChange={(event) => setSelectedStaff(event.target.value)}
                  >
                    <option value="">All Staff</option>
                    {staffOptions.map((staff) => (
                      <option key={staff} value={staff}>
                        {staff}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </section>

          {errorText && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorText}
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-gray-500">Selected Date</div>
              <div className="mt-2 text-xl font-semibold text-gray-900">{selectedDate}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-gray-500">Total Time</div>
              <div className="mt-2 text-xl font-semibold text-blue-700">
                {formatDuration(summary.total)}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-gray-500">Core Work</div>
              <div className="mt-2 text-xl font-semibold text-purple-700">
                {formatDuration(summary.core)}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-gray-500">Support Time</div>
              <div className="mt-2 text-xl font-semibold text-gray-800">
                {formatDuration(summary.support)}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-gray-500">Case Time</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                {formatDuration(summary.caseTime)}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-gray-500">Advisory Time</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                {formatDuration(summary.advisoryTime)}
              </div>
            </div>
            {canViewAll && (
              <div className="rounded-lg border bg-white p-4">
                <div className="text-sm text-gray-500">Staff Count</div>
                <div className="mt-2 text-lg font-semibold text-gray-900">{summary.staffCount}</div>
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-white">
            <div className="border-b p-4">
              <h2 className="font-semibold text-gray-900">By Staff</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Staff</th>
                    <th className="px-4 py-3">Core</th>
                    <th className="px-4 py-3">Support</th>
                    <th className="px-4 py-3">Case Time</th>
                    <th className="px-4 py-3">Advisory Time</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {staffTable.map((item) => (
                    <tr key={item.staff}>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.staff}</td>
                      <td className="px-4 py-3">{formatDuration(item.core)}</td>
                      <td className="px-4 py-3">{formatDuration(item.support)}</td>
                      <td className="px-4 py-3">{formatDuration(item.caseTime)}</td>
                      <td className="px-4 py-3">{formatDuration(item.advisoryTime)}</td>
                      <td className="px-4 py-3 font-semibold">{formatDuration(item.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${signalClass(item.signal)}`}>
                          {item.signal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border bg-white">
            <div className="border-b p-4">
              <h2 className="font-semibold text-gray-900">Details</h2>
            </div>
            {loading ? (
              <div className="p-4 text-sm text-gray-500">Loading...</div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No workload data for selected date.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Staff</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Case / Matter</th>
                      <th className="px-4 py-3">Issue</th>
                      <th className="px-4 py-3">Work Type</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr key={`${row.source}-${row.id}`}>
                        <td className="px-4 py-3 capitalize">{row.source}</td>
                        <td className="px-4 py-3">{row.staff_name}</td>
                        <td className="px-4 py-3">{row.client_name}</td>
                        <td className="px-4 py-3">{row.matter_or_case}</td>
                        <td className="px-4 py-3">{row.issue}</td>
                        <td className="px-4 py-3">{row.work_type}</td>
                        <td className="px-4 py-3">{row.category}</td>
                        <td className="px-4 py-3">{formatDuration(row.minutes)}</td>
                        <td className="px-4 py-3">{row.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}
