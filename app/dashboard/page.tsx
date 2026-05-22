"use client";

import AuthGuard from "../components/AuthGuard";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import AppTopNav from "../components/AppTopNav";
import { buildPermissions } from "../../lib/permissions";
import type { UserPermissions, UserRole } from "../../lib/permissions";

/* =========================================================
   TYPES
========================================================= */

type RiskLevel = "overdue" | "today" | "dueSoon" | "clear";
type RiskFilter = "all" | RiskLevel;

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
};

type CaseItem = {
  id: number;
  file_no?: string | null;
  title?: string | null;
  client_name?: string | null;
  court_name?: string | null;
  case_number?: string | null;
  phase?: string | null;
  status?: string | null;
  owner_name?: string | null;

  physical_storage_type?: string | null;
  physical_storage_detail?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type CaseTask = {
  id: string;
  case_id: number;
  task_type?: string | null;
  task_other?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
  status?: string | null;
};

type CaseDeadline = {
  id: string;
  case_id: number;
  deadline_type?: string | null;
  deadline_other?: string | null;
  party_label?: string | null;
  party_other?: string | null;
  current_due_date?: string | null;
  status?: string | null;
};

type CaseTimeline = {
  id: string;
  case_id: number;
  event_type?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  appointment_type?: string | null;
  appointment_other?: string | null;
  order_no?: number | null;
  status?: string | null;
};

type CaseEnforcement = {
  id: string;
  case_id: number;
  party_label?: string | null;
  party_other?: string | null;
  final_due_date?: string | null;
  writ_request_date?: string | null;
  writ_issued_date?: string | null;
  status?: string | null;
};

type CaseTimeLog = {
  id: string;
  case_id: number;
  work_date?: string | null;
  staff_name?: string | null;
  work_type?: string | null;
  work_other?: string | null;
  minutes?: number | null;
  billable?: boolean | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AlertCandidate = {
  id: string;
  case_id: number;
  level: RiskLevel;
  text: string;
  date: string;
  score: number;
  sourceType: "task" | "deadline" | "timeline" | "enforcement";
  sourceHash: string;
};

type EnrichedCase = CaseItem & {
  risk_level: RiskLevel;
  next_alert_text: string;
  next_alert_date: string;
  next_alert_hash: string;
};

type StaffTimeSummary = {
  staff: string;
  totalMinutes: number;
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  coreMinutes: number;
  supportMinutes: number;
};

type CaseTimeSummary = {
  caseId: number;
  fileNo: string;
  title: string;
  clientName: string;
  totalMinutes: number;
  coreMinutes: number;
  supportMinutes: number;
};

type SortMode =
  | "highestRisk"
  | "latestUpdated"
  | "fileNo"
  | "nextAlertDate";

/* =========================================================
   MAIN PAGE
========================================================= */

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const [cases, setCases] = useState<EnrichedCase[]>([]);
  const [alertItems, setAlertItems] = useState<AlertCandidate[]>([]);
  const [timeLogs, setTimeLogs] = useState<CaseTimeLog[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isCompact, setIsCompact] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortMode, setSortMode] = useState<SortMode>("highestRisk");

  /* =========================================================
     RESPONSIVE
  ========================================================= */

  useEffect(() => {
    const updateSize = () => {
      setIsCompact(window.innerWidth < 900);
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => window.removeEventListener("resize", updateSize);
  }, []);

  /* =========================================================
     LOAD PROFILE
  ========================================================= */

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);

        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          setProfile({
            role: "",
            financial_access: false,
          });
          return;
        }

        const { data, error } = await supabase
          .from("user_profiles")
          .select("role, financial_access")
          .eq("id", userData.user.id)
          .single();

        if (error || !data) {
          setProfile({
            role: "",
            financial_access: false,
          });
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

  /* =========================================================
     LOAD DASHBOARD DATA FROM SUPABASE
  ========================================================= */

  const fetchDashboard = async () => {
    try {
      setLoading(true);

      const { data: caseData, error: caseError } = await supabase
        .from("cases")
        .select("*")
        .order("updated_at", { ascending: false });

      if (caseError) {
        alert("Load cases failed:\n" + JSON.stringify(caseError, null, 2));
        return;
      }

      const baseCases = (caseData || []) as CaseItem[];
      const caseIds = baseCases.map((item) => item.id);

      if (caseIds.length === 0) {
        setCases([]);
        setAlertItems([]);
        setTimeLogs([]);
        return;
      }

      const [tasksRes, deadlinesRes, timelineRes, enforcementRes, timeLogsRes] =
        await Promise.all([
          supabase
            .from("case_tasks")
            .select(
              "id, case_id, task_type, task_other, assignee_name, due_date, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_deadlines")
            .select(
              "id, case_id, deadline_type, deadline_other, party_label, party_other, current_due_date, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_timeline")
            .select(
              "id, case_id, event_type, event_date, event_time, appointment_type, appointment_other, order_no, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_enforcements")
            .select(
              "id, case_id, party_label, party_other, final_due_date, writ_request_date, writ_issued_date, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_time_logs")
            .select(
              "id, case_id, work_date, staff_name, work_type, work_other, minutes, billable, note, created_at, updated_at"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),
        ]);

      if (tasksRes.error) {
        alert("Load tasks failed:\n" + JSON.stringify(tasksRes.error, null, 2));
        return;
      }

      if (deadlinesRes.error) {
        alert(
          "Load deadlines failed:\n" +
            JSON.stringify(deadlinesRes.error, null, 2)
        );
        return;
      }

      if (timelineRes.error) {
        alert(
          "Load timeline failed:\n" +
            JSON.stringify(timelineRes.error, null, 2)
        );
        return;
      }

      if (enforcementRes.error) {
        alert(
          "Load enforcement failed:\n" +
            JSON.stringify(enforcementRes.error, null, 2)
        );
        return;
      }

      if (timeLogsRes.error) {
        alert(
          "Load time logs failed:\n" +
            JSON.stringify(timeLogsRes.error, null, 2)
        );
        return;
      }

      const tasks = (tasksRes.data || []) as CaseTask[];
      const deadlines = (deadlinesRes.data || []) as CaseDeadline[];
      const timeline = (timelineRes.data || []) as CaseTimeline[];
      const enforcements = (enforcementRes.data || []) as CaseEnforcement[];
      const loadedTimeLogs = (timeLogsRes.data || []) as CaseTimeLog[];

      const allAlerts = buildAlertCandidates(
        tasks,
        deadlines,
        timeline,
        enforcements
      );

      const alertMap = buildAlertMapFromCandidates(allAlerts);

      const enrichedCases = baseCases.map((item) => {
        const alert = alertMap.get(item.id);

        if (!alert) {
          return {
            ...item,
            risk_level: "clear" as RiskLevel,
            next_alert_text: "-",
            next_alert_date: "",
            next_alert_hash: "",
          };
        }

        return {
          ...item,
          risk_level: alert.level,
          next_alert_text: alert.text,
          next_alert_date: alert.date,
          next_alert_hash: alert.sourceHash,
        };
      });

      setCases(enrichedCases);
      setAlertItems(allAlerts);
      setTimeLogs(loadedTimeLogs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadingProfile) return;
    if (!permissions.canViewDashboard) return;

    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingProfile, permissions.canViewDashboard]);

  /* =========================================================
     OPTIONS
  ========================================================= */

  const owners = useMemo(() => {
    const values = cases
      .map((item) => item.owner_name)
      .filter((value): value is string => !!value && value.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const phases = useMemo(() => {
    const values = cases
      .map((item) => item.phase)
      .filter((value): value is string => !!value && value.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const statuses = useMemo(() => {
    const values = cases
      .map((item) => item.status)
      .filter((value): value is string => !!value && value.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const clearFilters = () => {
    setSearchText("");
    setRiskFilter("all");
    setOwnerFilter("All");
    setPhaseFilter("All");
    setStatusFilter("All");
    setSortMode("highestRisk");
  };

  /* =========================================================
     FILTERED CASES
  ========================================================= */

  const filteredCases = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    let result = cases.filter((item) => {
      const searchableText = [
        item.file_no,
        item.title,
        item.client_name,
        item.owner_name,
        item.court_name,
        item.case_number,
        item.next_alert_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchSearch = !keyword || searchableText.includes(keyword);
      const matchRisk =
        riskFilter === "all" || item.risk_level === riskFilter;
      const matchOwner =
        ownerFilter === "All" || item.owner_name === ownerFilter;
      const matchPhase = phaseFilter === "All" || item.phase === phaseFilter;
      const matchStatus =
        statusFilter === "All" || item.status === statusFilter;

      return (
        matchSearch && matchRisk && matchOwner && matchPhase && matchStatus
      );
    });

    result = [...result].sort((a, b) => {
      if (sortMode === "highestRisk") {
        const riskDiff = getRiskScore(a.risk_level) - getRiskScore(b.risk_level);
        if (riskDiff !== 0) return riskDiff;

        return (a.next_alert_date || "9999-12-31").localeCompare(
          b.next_alert_date || "9999-12-31"
        );
      }

      if (sortMode === "latestUpdated") {
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      }

      if (sortMode === "fileNo") {
        return (a.file_no || "").localeCompare(b.file_no || "");
      }

      if (sortMode === "nextAlertDate") {
        return (a.next_alert_date || "9999-12-31").localeCompare(
          b.next_alert_date || "9999-12-31"
        );
      }

      return 0;
    });

    return result;
  }, [
    cases,
    searchText,
    riskFilter,
    ownerFilter,
    phaseFilter,
    statusFilter,
    sortMode,
  ]);

  const filteredCaseIds = useMemo(() => {
    return new Set(filteredCases.map((item) => item.id));
  }, [filteredCases]);

  const filteredTimeLogs = useMemo(() => {
    return timeLogs.filter((item) => filteredCaseIds.has(item.case_id));
  }, [timeLogs, filteredCaseIds]);

  /* =========================================================
     SUMMARY
  ========================================================= */

  const summary = useMemo(() => {
    const overdue = filteredCases.filter(
      (item) => item.risk_level === "overdue"
    ).length;

    const today = filteredCases.filter(
      (item) => item.risk_level === "today"
    ).length;

    const dueSoon = filteredCases.filter(
      (item) => item.risk_level === "dueSoon"
    ).length;

    const clear = filteredCases.filter(
      (item) => item.risk_level === "clear"
    ).length;

    const active = filteredCases.filter(
      (item) => item.status === "Active"
    ).length;

    const waiting = filteredCases.filter(
      (item) => item.status === "Waiting"
    ).length;

    const done = filteredCases.filter((item) => item.status === "Done").length;

    const enforcementReady = alertItems.filter(
      (item) =>
        filteredCaseIds.has(item.case_id) &&
        item.sourceType === "enforcement" &&
        (item.level === "overdue" || item.level === "today")
    ).length;

    return {
      total: filteredCases.length,
      overdue,
      today,
      dueSoon,
      clear,
      active,
      waiting,
      done,
      enforcementReady,
    };
  }, [filteredCases, alertItems, filteredCaseIds]);

  const timeSummary = useMemo(() => {
    const today = getTodayDateString();
    const weekStart = getWeekStartDateString();
    const monthStart = getMonthStartDateString();

    const totalMinutes = filteredTimeLogs.reduce(
      (sum, item) => sum + (item.minutes || 0),
      0
    );

    const todayMinutes = filteredTimeLogs
      .filter((item) => item.work_date === today)
      .reduce((sum, item) => sum + (item.minutes || 0), 0);

    const weekMinutes = filteredTimeLogs
      .filter((item) => !!item.work_date && item.work_date >= weekStart)
      .reduce((sum, item) => sum + (item.minutes || 0), 0);

    const monthMinutes = filteredTimeLogs
      .filter((item) => !!item.work_date && item.work_date >= monthStart)
      .reduce((sum, item) => sum + (item.minutes || 0), 0);

    const coreMinutes = filteredTimeLogs
      .filter((item) => item.billable !== false)
      .reduce((sum, item) => sum + (item.minutes || 0), 0);

    const supportMinutes = totalMinutes - coreMinutes;

    return {
      totalMinutes,
      todayMinutes,
      weekMinutes,
      monthMinutes,
      coreMinutes,
      supportMinutes,
    };
  }, [filteredTimeLogs]);

  const staffTimeSummary = useMemo(() => {
    const today = getTodayDateString();
    const weekStart = getWeekStartDateString();
    const monthStart = getMonthStartDateString();

    const map = new Map<string, StaffTimeSummary>();

    filteredTimeLogs.forEach((item) => {
      const staff = item.staff_name || "-";
      const minutes = item.minutes || 0;
      const isCore = item.billable !== false;

      const existing = map.get(staff) || {
        staff,
        totalMinutes: 0,
        todayMinutes: 0,
        weekMinutes: 0,
        monthMinutes: 0,
        coreMinutes: 0,
        supportMinutes: 0,
      };

      existing.totalMinutes += minutes;

      if (item.work_date === today) existing.todayMinutes += minutes;
      if (item.work_date && item.work_date >= weekStart) {
        existing.weekMinutes += minutes;
      }
      if (item.work_date && item.work_date >= monthStart) {
        existing.monthMinutes += minutes;
      }

      if (isCore) {
        existing.coreMinutes += minutes;
      } else {
        existing.supportMinutes += minutes;
      }

      map.set(staff, existing);
    });

    return Array.from(map.values()).sort(
      (a, b) => b.totalMinutes - a.totalMinutes
    );
  }, [filteredTimeLogs]);

  const caseTimeSummary = useMemo(() => {
    const caseMap = new Map<number, EnrichedCase>();
    filteredCases.forEach((item) => caseMap.set(item.id, item));

    const map = new Map<number, CaseTimeSummary>();

    filteredTimeLogs.forEach((item) => {
      const caseData = caseMap.get(item.case_id);
      const minutes = item.minutes || 0;
      const isCore = item.billable !== false;

      const existing = map.get(item.case_id) || {
        caseId: item.case_id,
        fileNo: caseData?.file_no || "-",
        title: caseData?.title || "-",
        clientName: caseData?.client_name || "-",
        totalMinutes: 0,
        coreMinutes: 0,
        supportMinutes: 0,
      };

      existing.totalMinutes += minutes;

      if (isCore) {
        existing.coreMinutes += minutes;
      } else {
        existing.supportMinutes += minutes;
      }

      map.set(item.case_id, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 8);
  }, [filteredTimeLogs, filteredCases]);

  const topRiskCases = useMemo(() => {
    return filteredCases
      .filter((item) => item.risk_level !== "clear")
      .sort((a, b) => {
        const riskDiff = getRiskScore(a.risk_level) - getRiskScore(b.risk_level);
        if (riskDiff !== 0) return riskDiff;

        return (a.next_alert_date || "9999-12-31").localeCompare(
          b.next_alert_date || "9999-12-31"
        );
      })
      .slice(0, 8);
  }, [filteredCases]);

  const enforcementAlerts = useMemo(() => {
    return alertItems
      .filter((item) => filteredCaseIds.has(item.case_id))
      .filter((item) => item.sourceType === "enforcement")
      .filter((item) => item.level === "overdue" || item.level === "today")
      .sort((a, b) => {
        const riskDiff = getRiskScore(a.level) - getRiskScore(b.level);
        if (riskDiff !== 0) return riskDiff;

        return a.date.localeCompare(b.date);
      })
      .slice(0, 8);
  }, [alertItems, filteredCaseIds]);

  const caseMap = useMemo(() => {
    const map = new Map<number, EnrichedCase>();
    cases.forEach((item) => map.set(item.id, item));
    return map;
  }, [cases]);

  const phaseSummary = useMemo(() => {
    const map = new Map<string, number>();

    filteredCases.forEach((item) => {
      const label = renderPhase(item.phase);
      map.set(label, (map.get(label) || 0) + 1);
    });

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredCases]);

  const ownerSummary = useMemo(() => {
    const map = new Map<string, number>();

    filteredCases.forEach((item) => {
      const label = item.owner_name || "-";
      map.set(label, (map.get(label) || 0) + 1);
    });

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredCases]);

  const recentCases = useMemo(() => {
    return [...filteredCases]
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
      .slice(0, 8);
  }, [filteredCases]);

  /* =========================================================
     ACCESS GUARD
  ========================================================= */

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <div style={loadingBoxStyle}>Loading dashboard permission...</div>
        </main>
      </AuthGuard>
    );
  }

  if (!permissions.canViewDashboard) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="Dashboard"
            subtitle="Executive overview across all cases"
            activePage="dashboard"
          />

          <div style={noAccessBoxStyle}>
            คุณไม่มีสิทธิ์ดู Dashboard นี้
            <div style={noAccessSubTextStyle}>
              หากต้องการดูภาพรวมคดี ต้องใช้สิทธิ์ Staff ขึ้นไป
            </div>
          </div>
        </main>
      </AuthGuard>
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav
          title="Dashboard"
          subtitle="Executive overview across all cases"
          activePage="dashboard"
        />

        <section style={heroPanelStyle}>
          <div>
            <div style={eyebrowStyle}>VP CASE SYSTEM</div>
            <h1 style={heroTitleStyle}>Executive Dashboard</h1>
            <div style={heroSubtitleStyle}>
              ภาพรวมคดี ความเสี่ยง กำหนดเวลา งานเร่งด่วน บังคับคดี และเวลาทำงานของทีม
            </div>
          </div>

          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            style={secondaryButtonStyle}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        <section style={filterPanelStyle}>
          <div style={filterHeaderStyle}>
            <div>
              <h3 style={filterTitleStyle}>Search & Filters</h3>
              <div style={filterSubtitleStyle}>
                ค้นหาและกรอง Dashboard ตามแฟ้มคดี ผู้รับผิดชอบ สถานะ และความเสี่ยง
              </div>
            </div>

            <button type="button" onClick={clearFilters} style={ghostButtonStyle}>
              Clear Filters
            </button>
          </div>

          <div style={isCompact ? compactFilterGridStyle : filterGridStyle}>
            <div>
              <label style={labelStyle}>Search</label>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search file no, title, client, owner, alert text"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Risk</label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
                style={inputStyle}
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="dueSoon">Due Soon</option>
                <option value="clear">Clear</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Owner</label>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                style={inputStyle}
              >
                {owners.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Phase</label>
              <select
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                style={inputStyle}
              >
                {phases.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={inputStyle}
              >
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Sort By</label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                style={inputStyle}
              >
                <option value="highestRisk">Highest Risk First</option>
                <option value="latestUpdated">Latest Updated</option>
                <option value="fileNo">File No</option>
                <option value="nextAlertDate">Next Alert Date</option>
              </select>
            </div>
          </div>
        </section>

        <section style={blockStyle}>
          <div style={isCompact ? compactSummaryGridStyle : summaryGridStyle}>
            <SummaryCard
              label="Total Cases"
              subLabel="แฟ้มที่แสดง"
              count={summary.total}
              background="#f8fafc"
            />

            <SummaryCard
              label="Overdue"
              subLabel="เกินกำหนด"
              count={summary.overdue}
              background="#fde2e2"
            />

            <SummaryCard
              label="Today"
              subLabel="ครบกำหนดวันนี้"
              count={summary.today}
              background="#fff3c4"
            />

            <SummaryCard
              label="Due Soon"
              subLabel="ใกล้ครบกำหนด"
              count={summary.dueSoon}
              background="#fff8df"
            />

            <SummaryCard
              label="Enforcement Ready"
              subLabel="พร้อมดำเนินการบังคับคดี"
              count={summary.enforcementReady}
              background="#e0f2fe"
            />

            <SummaryCard
              label="Clear"
              subLabel="ยังไม่มี Alert"
              count={summary.clear}
              background="#e4f4e9"
            />
          </div>
        </section>

        <section style={blockStyle}>
          <div style={isCompact ? compactSummaryGridStyle : timeSummaryGridStyle}>
            <SummaryCard
              label="Time Today"
              subLabel="เวลาทำงานวันนี้"
              countText={formatDuration(timeSummary.todayMinutes)}
              background="#edf4ff"
            />

            <SummaryCard
              label="This Week"
              subLabel="เวลาทำงานสัปดาห์นี้"
              countText={formatDuration(timeSummary.weekMinutes)}
              background="#f5f3ff"
            />

            <SummaryCard
              label="This Month"
              subLabel="เวลาทำงานเดือนนี้"
              countText={formatDuration(timeSummary.monthMinutes)}
              background="#fff7ed"
            />

            <SummaryCard
              label="Total Time"
              subLabel="เวลารวมทั้งหมด"
              countText={formatDuration(timeSummary.totalMinutes)}
              background="#f8fafc"
            />

            <SummaryCard
              label="Core Work"
              subLabel="เนื้องานหลัก"
              countText={formatDuration(timeSummary.coreMinutes)}
              background="#e6f4ea"
            />

            <SummaryCard
              label="Support Time"
              subLabel="เวลาสนับสนุน"
              countText={formatDuration(timeSummary.supportMinutes)}
              background="#f1f5f9"
            />
          </div>
        </section>

        <section style={miniGridStyle}>
          <MiniSummaryCard
            title="Case Status"
            rows={[
              { label: "Active", value: summary.active },
              { label: "Waiting", value: summary.waiting },
              { label: "Done", value: summary.done },
            ]}
          />

          <MiniSummaryCard
            title="Phase Distribution"
            rows={phaseSummary.map(([label, value]) => ({ label, value }))}
          />

          <MiniSummaryCard
            title="Owner Distribution"
            rows={ownerSummary.map(([label, value]) => ({ label, value }))}
          />
        </section>

        {permissions.canEditTimeLogs && (
          <section style={sectionGridStyle}>
            <div style={sectionCardStyle}>
              <div style={sectionHeaderStyle}>
                <div>
                  <h3 style={sectionTitleStyle}>Time by Staff</h3>
                  <div style={sectionSubtitleStyle}>
                    เวลาทำงานแยกตามรายชื่อ วันนี้ / สัปดาห์นี้ / เดือนนี้ / รวมทั้งหมด
                  </div>
                </div>
              </div>

              {loading ? (
                <div style={loadingBoxStyle}>Loading time by staff...</div>
              ) : staffTimeSummary.length === 0 ? (
                <div style={emptyStyle}>No time logs found.</div>
              ) : isCompact ? (
                <StaffTimeCardList items={staffTimeSummary} />
              ) : (
                <StaffTimeTable items={staffTimeSummary} />
              )}
            </div>

            <div style={sectionCardStyle}>
              <div style={sectionHeaderStyle}>
                <div>
                  <h3 style={sectionTitleStyle}>Top Time-Consuming Cases</h3>
                  <div style={sectionSubtitleStyle}>
                    คดีที่ใช้เวลาทำงานมากที่สุด เพื่อใช้ดูภาระงานและประเมินต้นทุนเวลา
                  </div>
                </div>
              </div>

              {loading ? (
                <div style={loadingBoxStyle}>Loading case time summary...</div>
              ) : caseTimeSummary.length === 0 ? (
                <div style={emptyStyle}>No case time data found.</div>
              ) : isCompact ? (
                <CaseTimeCardList items={caseTimeSummary} />
              ) : (
                <CaseTimeTable items={caseTimeSummary} />
              )}
            </div>
          </section>
        )}

        <section style={sectionGridStyle}>
          <div style={sectionCardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h3 style={sectionTitleStyle}>Top Risk Cases</h3>
                <div style={sectionSubtitleStyle}>
                  แฟ้มที่มี Deadline / Task / Timeline / Enforcement ใกล้หรือเกินกำหนด
                </div>
              </div>

              <Link href="/cases" style={sectionLinkStyle}>
                View cases
              </Link>
            </div>

            {loading ? (
              <div style={loadingBoxStyle}>Loading risk cases...</div>
            ) : topRiskCases.length === 0 ? (
              <div style={allClearStyle}>✓ No risk cases</div>
            ) : isCompact ? (
              <RiskCardList items={topRiskCases} />
            ) : (
              <RiskTable items={topRiskCases} />
            )}
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h3 style={sectionTitleStyle}>Enforcement Ready</h3>
                <div style={sectionSubtitleStyle}>
                  งานบังคับคดีที่ครบกำหนดหรือควรดำเนินการต่อ
                </div>
              </div>

              <Link href="/cases" style={sectionLinkStyle}>
                View cases
              </Link>
            </div>

            {loading ? (
              <div style={loadingBoxStyle}>Loading enforcement queue...</div>
            ) : enforcementAlerts.length === 0 ? (
              <div style={allClearStyle}>
                ✓ All clear — no enforcement action required
              </div>
            ) : isCompact ? (
              <EnforcementCardList items={enforcementAlerts} caseMap={caseMap} />
            ) : (
              <EnforcementTable items={enforcementAlerts} caseMap={caseMap} />
            )}
          </div>
        </section>

        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h3 style={sectionTitleStyle}>Recently Updated Cases</h3>
              <div style={sectionSubtitleStyle}>แฟ้มที่มีการแก้ไขล่าสุด</div>
            </div>

            <Link href="/cases" style={sectionLinkStyle}>
              View all cases
            </Link>
          </div>

          {loading ? (
            <div style={loadingBoxStyle}>Loading recent cases...</div>
          ) : recentCases.length === 0 ? (
            <div style={emptyStyle}>No cases found.</div>
          ) : isCompact ? (
            <RecentCaseCardList items={recentCases} />
          ) : (
            <RecentCaseTable items={recentCases} />
          )}
        </section>
      </main>
    </AuthGuard>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function SummaryCard({
  label,
  subLabel,
  count,
  countText,
  background,
}: {
  label: string;
  subLabel: string;
  count?: number;
  countText?: string;
  background: string;
}) {
  return (
    <div style={{ ...summaryCardStyle, background }}>
      <div style={summaryNumberStyle}>
        {countText !== undefined ? countText : count}
      </div>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summarySubLabelStyle}>{subLabel}</div>
    </div>
  );
}

function MiniSummaryCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  return (
    <div style={miniCardStyle}>
      <div style={miniTitleStyle}>{title}</div>

      {rows.length === 0 ? (
        <div style={emptyMiniStyle}>No data</div>
      ) : (
        rows.map((row) => (
          <div key={row.label} style={miniRowStyle}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))
      )}
    </div>
  );
}

function StaffTimeTable({ items }: { items: StaffTimeSummary[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Staff</th>
            <th style={thStyle}>Today</th>
            <th style={thStyle}>This Week</th>
            <th style={thStyle}>This Month</th>
            <th style={thStyle}>Core</th>
            <th style={thStyle}>Support</th>
            <th style={thStyle}>Total</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.staff} style={rowStyle}>
              <td style={tdStyle}>{item.staff}</td>
              <td style={tdStyle}>{formatDuration(item.todayMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.weekMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.monthMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.coreMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.supportMinutes)}</td>
              <td style={tdStyle}>
                <strong>{formatDuration(item.totalMinutes)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffTimeCardList({ items }: { items: StaffTimeSummary[] }) {
  return (
    <div style={cardListStyle}>
      {items.map((item) => (
        <div key={item.staff} style={mobileCardStyle}>
          <div style={mobileCardHeaderStyle}>
            <div>
              <div style={fileNoStyle}>{item.staff}</div>
              <div style={mobileTitleStyle}>
                Total: {formatDuration(item.totalMinutes)}
              </div>
            </div>
          </div>

          <InfoLine label="Today" value={formatDuration(item.todayMinutes)} />
          <InfoLine label="This Week" value={formatDuration(item.weekMinutes)} />
          <InfoLine label="This Month" value={formatDuration(item.monthMinutes)} />
          <InfoLine label="Core" value={formatDuration(item.coreMinutes)} />
          <InfoLine label="Support" value={formatDuration(item.supportMinutes)} />
        </div>
      ))}
    </div>
  );
}

function CaseTimeTable({ items }: { items: CaseTimeSummary[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>File No</th>
            <th style={thStyle}>Title</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Core</th>
            <th style={thStyle}>Support</th>
            <th style={thStyle}>Total</th>
            <th style={thStyle}>Open</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.caseId} style={rowStyle}>
              <td style={tdStyle}>{item.fileNo}</td>
              <td style={tdStyle}>{item.title}</td>
              <td style={tdStyle}>{item.clientName}</td>
              <td style={tdStyle}>{formatDuration(item.coreMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.supportMinutes)}</td>
              <td style={tdStyle}>
                <strong>{formatDuration(item.totalMinutes)}</strong>
              </td>
              <td style={tdStyle}>
                <Link href={`/cases/${item.caseId}#timelogs`} style={openButtonLinkStyle}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaseTimeCardList({ items }: { items: CaseTimeSummary[] }) {
  return (
    <div style={cardListStyle}>
      {items.map((item) => (
        <div key={item.caseId} style={mobileCardStyle}>
          <div style={mobileCardHeaderStyle}>
            <div>
              <div style={fileNoStyle}>{item.fileNo}</div>
              <div style={mobileTitleStyle}>{item.title}</div>
            </div>
          </div>

          <InfoLine label="Client" value={item.clientName} />
          <InfoLine label="Core" value={formatDuration(item.coreMinutes)} />
          <InfoLine label="Support" value={formatDuration(item.supportMinutes)} />
          <InfoLine label="Total" value={formatDuration(item.totalMinutes)} />

          <div style={cardActionStyle}>
            <Link href={`/cases/${item.caseId}#timelogs`} style={openButtonLinkStyle}>
              Open
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function RiskTable({ items }: { items: EnrichedCase[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>File No</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Risk</th>
            <th style={thStyle}>Next Alert</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Action</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={rowStyle}>
              <td style={tdStyle}>{item.file_no || "-"}</td>
              <td style={tdStyle}>{item.client_name || "-"}</td>
              <td style={tdStyle}>
                <RiskBadge level={item.risk_level} />
              </td>
              <td style={tdStyle}>
                <div style={alertTextStyle}>{item.next_alert_text || "-"}</div>
              </td>
              <td style={tdStyle}>{formatDisplayDate(item.next_alert_date)}</td>
              <td style={tdStyle}>
                <Link
                  href={`/cases/${item.id}${item.next_alert_hash || ""}`}
                  style={openButtonLinkStyle}
                >
                  Open & Fix
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskCardList({ items }: { items: EnrichedCase[] }) {
  return (
    <div style={cardListStyle}>
      {items.map((item) => (
        <div key={item.id} style={mobileCardStyle}>
          <div style={mobileCardHeaderStyle}>
            <div>
              <div style={fileNoStyle}>{item.file_no || "-"}</div>
              <div style={mobileTitleStyle}>{item.title || "-"}</div>
            </div>

            <RiskBadge level={item.risk_level} />
          </div>

          <InfoLine label="Client" value={item.client_name || "-"} />
          <InfoLine label="Next Alert" value={item.next_alert_text || "-"} />
          <InfoLine
            label="Date"
            value={formatDisplayDate(item.next_alert_date)}
          />

          <div style={cardActionStyle}>
            <Link
              href={`/cases/${item.id}${item.next_alert_hash || ""}`}
              style={openButtonLinkStyle}
            >
              Open & Fix
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function EnforcementTable({
  items,
  caseMap,
}: {
  items: AlertCandidate[];
  caseMap: Map<number, EnrichedCase>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>File No</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Action</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => {
            const caseItem = caseMap.get(item.case_id);

            return (
              <tr key={item.id} style={rowStyle}>
                <td style={tdStyle}>{caseItem?.file_no || "-"}</td>
                <td style={tdStyle}>{caseItem?.client_name || "-"}</td>
                <td style={tdStyle}>{item.text}</td>
                <td style={tdStyle}>{formatDisplayDate(item.date)}</td>
                <td style={tdStyle}>
                  <Link
                    href={`/cases/${item.case_id}${item.sourceHash}`}
                    style={openButtonLinkStyle}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EnforcementCardList({
  items,
  caseMap,
}: {
  items: AlertCandidate[];
  caseMap: Map<number, EnrichedCase>;
}) {
  return (
    <div style={cardListStyle}>
      {items.map((item) => {
        const caseItem = caseMap.get(item.case_id);

        return (
          <div key={item.id} style={mobileCardStyle}>
            <div style={mobileCardHeaderStyle}>
              <div>
                <div style={fileNoStyle}>{caseItem?.file_no || "-"}</div>
                <div style={mobileTitleStyle}>{caseItem?.title || "-"}</div>
              </div>

              <RiskBadge level={item.level} />
            </div>

            <InfoLine label="Client" value={caseItem?.client_name || "-"} />
            <InfoLine label="Status" value={item.text} />
            <InfoLine label="Date" value={formatDisplayDate(item.date)} />

            <div style={cardActionStyle}>
              <Link
                href={`/cases/${item.case_id}${item.sourceHash}`}
                style={openButtonLinkStyle}
              >
                Open
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentCaseTable({ items }: { items: EnrichedCase[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>File No</th>
            <th style={thStyle}>Title</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Owner</th>
            <th style={thStyle}>Risk</th>
            <th style={thStyle}>Last Updated</th>
            <th style={thStyle}>Open</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={rowStyle}>
              <td style={tdStyle}>{item.file_no || "-"}</td>
              <td style={tdStyle}>{item.title || "-"}</td>
              <td style={tdStyle}>{item.client_name || "-"}</td>
              <td style={tdStyle}>{item.owner_name || "-"}</td>
              <td style={tdStyle}>
                <RiskBadge level={item.risk_level} />
              </td>
              <td style={tdStyle}>{formatDateTime(item.updated_at)}</td>
              <td style={tdStyle}>
                <Link href={`/cases/${item.id}`} style={openButtonLinkStyle}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentCaseCardList({ items }: { items: EnrichedCase[] }) {
  return (
    <div style={cardListStyle}>
      {items.map((item) => (
        <div key={item.id} style={mobileCardStyle}>
          <div style={mobileCardHeaderStyle}>
            <div>
              <div style={fileNoStyle}>{item.file_no || "-"}</div>
              <div style={mobileTitleStyle}>{item.title || "-"}</div>
            </div>

            <RiskBadge level={item.risk_level} />
          </div>

          <InfoLine label="Client" value={item.client_name || "-"} />
          <InfoLine label="Owner" value={item.owner_name || "-"} />
          <InfoLine label="Updated" value={formatDateTime(item.updated_at)} />

          <div style={cardActionStyle}>
            <Link href={`/cases/${item.id}`} style={openButtonLinkStyle}>
              Open
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const text =
    level === "overdue"
      ? "Overdue"
      : level === "today"
        ? "Today"
        : level === "dueSoon"
          ? "Due Soon"
          : "Clear";

  const style =
    level === "overdue"
      ? riskOverdueStyle
      : level === "today"
        ? riskTodayStyle
        : level === "dueSoon"
          ? riskDueSoonStyle
          : riskClearStyle;

  return <span style={{ ...riskBadgeBaseStyle, ...style }}>{text}</span>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoLineStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

/* =========================================================
   ALERT BUILDER
========================================================= */

function buildAlertCandidates(
  tasks: CaseTask[],
  deadlines: CaseDeadline[],
  timeline: CaseTimeline[],
  enforcements: CaseEnforcement[]
) {
  const candidates: AlertCandidate[] = [];

  tasks.forEach((task) => {
    if (!task.due_date) return;
    if (isDoneStatus(task.status)) return;

    const level = getDateRiskLevel(task.due_date);
    if (level === "clear") return;

    const taskText =
      task.task_type === "อื่นๆ"
        ? task.task_other || "งานที่ต้องทำ"
        : task.task_type || "งานที่ต้องทำ";

    candidates.push({
      id: `task-${task.id}`,
      case_id: task.case_id,
      level,
      text: `Task: ${taskText}`,
      date: task.due_date,
      score: getRiskScore(level),
      sourceType: "task",
      sourceHash: "#tasks",
    });
  });

  deadlines.forEach((deadline) => {
    if (!deadline.current_due_date) return;
    if (isDoneStatus(deadline.status)) return;

    const level = getDateRiskLevel(deadline.current_due_date);
    if (level === "clear") return;

    candidates.push({
      id: `deadline-${deadline.id}`,
      case_id: deadline.case_id,
      level,
      text: `Deadline: ${renderDeadlineType(deadline.deadline_type, deadline.deadline_other)}`,
      date: deadline.current_due_date,
      score: getRiskScore(level),
      sourceType: "deadline",
      sourceHash: "#deadlines",
    });
  });

  timeline.forEach((event) => {
    if (event.event_type !== "hearing") return;
    if (!event.event_date) return;
    if (isDoneStatus(event.status)) return;

    const level = getDateRiskLevel(event.event_date);
    if (level === "clear") return;

    const appointmentText =
      event.appointment_type === "นัดอื่นๆ"
        ? event.appointment_other || "นัดศาล"
        : event.appointment_type || "นัดศาล";

    candidates.push({
      id: `timeline-${event.id}`,
      case_id: event.case_id,
      level,
      text: `Timeline: นัดที่ ${event.order_no || "-"} ${appointmentText}`,
      date: event.event_date,
      score: getRiskScore(level),
      sourceType: "timeline",
      sourceHash: "#timeline",
    });
  });

  enforcements.forEach((item) => {
    if (!item.final_due_date) return;
    if (isEnforcementDone(item)) return;

    const level = getDateRiskLevel(item.final_due_date);
    if (level === "clear") return;

    const partyText = renderEnforcementPartyLabel(
      item.party_label,
      item.party_other
    );

    candidates.push({
      id: `enforcement-${item.id}`,
      case_id: item.case_id,
      level,
      text: `Enforcement: ขอออกหมายบังคับคดี (${partyText})`,
      date: item.final_due_date,
      score: getRiskScore(level),
      sourceType: "enforcement",
      sourceHash: "#enforcement",
    });
  });

  return candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.date.localeCompare(b.date);
  });
}

function buildAlertMapFromCandidates(candidates: AlertCandidate[]) {
  const map = new Map<number, AlertCandidate>();

  candidates.forEach((candidate) => {
    const existing = map.get(candidate.case_id);

    if (!existing) {
      map.set(candidate.case_id, candidate);
      return;
    }

    if (candidate.score < existing.score) {
      map.set(candidate.case_id, candidate);
      return;
    }

    if (candidate.score === existing.score && candidate.date < existing.date) {
      map.set(candidate.case_id, candidate);
    }
  });

  return map;
}

/* =========================================================
   HELPERS
========================================================= */

function getDateRiskLevel(dateText: string): RiskLevel {
  const diffDays = diffDaysFromToday(dateText);

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 3) return "dueSoon";

  return "clear";
}

function getRiskScore(level: RiskLevel) {
  if (level === "overdue") return 1;
  if (level === "today") return 2;
  if (level === "dueSoon") return 3;
  return 5;
}

function diffDaysFromToday(dateText: string) {
  const today = parseLocalDate(getTodayDateString());
  const target = parseLocalDate(dateText);

  return Math.floor(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function parseLocalDate(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getWeekStartDateString() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const date = String(monday.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function getMonthStartDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}

function formatDuration(totalMinutes: number) {
  const safeMinutes = Number.isFinite(totalMinutes) ? totalMinutes : 0;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours <= 0) return `${minutes} นาที`;
  if (minutes <= 0) return `${hours} ชม.`;

  return `${hours} ชม. ${minutes} นาที`;
}

function isDoneStatus(status?: string | null) {
  const value = (status || "").toLowerCase();

  return (
    value === "done" ||
    value === "cancelled" ||
    value === "filed" ||
    value === "submitted"
  );
}

function isEnforcementDone(item: CaseEnforcement) {
  if (item.writ_request_date || item.writ_issued_date) return true;

  const value = (item.status || "").toLowerCase();

  return (
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

function renderDeadlineType(
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

function renderEnforcementPartyLabel(
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

function renderPhase(value?: string | null) {
  if (!value) return "-";
  if (value === "litigation") return "Litigation";
  if (value === "judgment") return "Judgment";
  if (value === "enforcement") return "Enforcement";
  if (value === "closed") return "Closed";
  return value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("th-TH");
  } catch {
    return value;
  }
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/* =========================================================
   STYLES
========================================================= */

const pageStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 1440,
  margin: "0 auto",
  color: "#111111",
};

const blockStyle: React.CSSProperties = {
  marginBottom: 18,
};

const heroPanelStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 20,
  marginBottom: 18,
  background:
    "linear-gradient(135deg, #ffffff 0%, #f8fafc 48%, #eef6f0 100%)",
  boxShadow: "0 8px 28px rgba(15, 23, 42, 0.06)",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.2,
  color: "#0f2743",
  marginBottom: 6,
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 950,
  color: "#111111",
};

const heroSubtitleStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#555555",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.6,
};

const filterPanelStyle: React.CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 16,
  padding: 16,
  background: "#ffffff",
  marginBottom: 18,
};

const filterHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const filterTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 900,
  color: "#111111",
};

const filterSubtitleStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#666666",
  fontWeight: 600,
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.2fr",
  gap: 12,
  alignItems: "end",
};

const compactFilterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(130px, 1fr))",
  gap: 12,
};

const timeSummaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(130px, 1fr))",
  gap: 12,
};

const compactSummaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
  gap: 10,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 14,
  padding: 16,
  minHeight: 104,
  color: "#111111",
  boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 950,
  marginBottom: 8,
  color: "#111111",
  lineHeight: 1.15,
};

const summaryLabelStyle: React.CSSProperties = {
  fontWeight: 900,
  color: "#222222",
};

const summarySubLabelStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "#666666",
};

const miniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const miniCardStyle: React.CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 16,
  padding: 16,
  background: "#ffffff",
};

const miniTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  marginBottom: 10,
  color: "#111111",
};

const miniRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "7px 0",
  borderTop: "1px solid #f0f0f0",
  color: "#333333",
  fontWeight: 700,
};

const emptyMiniStyle: React.CSSProperties = {
  color: "#666666",
  fontWeight: 600,
};

const sectionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const sectionCardStyle: React.CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 16,
  padding: 16,
  background: "#ffffff",
  marginBottom: 18,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 900,
  color: "#111111",
};

const sectionSubtitleStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#666666",
  fontWeight: 600,
  lineHeight: 1.5,
};

const sectionLinkStyle: React.CSSProperties = {
  color: "#0f2743",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 900,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#222222",
  fontWeight: 800,
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  background: "white",
  color: "#111111",
  colorScheme: "light",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#ffffff",
  color: "#111111",
  borderRadius: 10,
  border: "1px solid #cccccc",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "9px 13px",
  background: "#f8fafc",
  color: "#111111",
  borderRadius: 10,
  border: "1px solid #dddddd",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 760,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "11px 10px",
  borderBottom: "1px solid #eeeeee",
  whiteSpace: "nowrap",
  color: "#111111",
  fontSize: 13,
  fontWeight: 900,
  background: "#fafafa",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  verticalAlign: "top",
  borderTop: "1px solid #eeeeee",
  whiteSpace: "nowrap",
  color: "#111111",
  fontSize: 14,
};

const rowStyle: React.CSSProperties = {
  borderTop: "1px solid #eeeeee",
};

const alertTextStyle: React.CSSProperties = {
  maxWidth: 320,
  whiteSpace: "normal",
  fontWeight: 700,
  lineHeight: 1.45,
};

const riskBadgeBaseStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const riskOverdueStyle: React.CSSProperties = {
  background: "#ffe0e0",
  color: "#c0392b",
};

const riskTodayStyle: React.CSSProperties = {
  background: "#fff0c2",
  color: "#b26a00",
};

const riskDueSoonStyle: React.CSSProperties = {
  background: "#fff4d9",
  color: "#c96b00",
};

const riskClearStyle: React.CSSProperties = {
  background: "#e8f5ec",
  color: "#18794e",
};

const openButtonLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "7px 11px",
  borderRadius: 999,
  background: "#0f2743",
  color: "#ffffff",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 900,
};

const allClearStyle: React.CSSProperties = {
  color: "#067647",
  fontWeight: 800,
  padding: 12,
  border: "1px solid #b9dfc3",
  borderRadius: 12,
  background: "#e6f4ea",
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#666666",
  background: "#ffffff",
  fontWeight: 700,
};

const loadingBoxStyle: React.CSSProperties = {
  padding: 18,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  background: "#fafafa",
  color: "#555555",
  fontWeight: 800,
};

const cardListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const mobileCardStyle: React.CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 14,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
};

const mobileCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
};

const fileNoStyle: React.CSSProperties = {
  fontWeight: 950,
  fontSize: 15,
  color: "#12355b",
};

const mobileTitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#333333",
  fontWeight: 900,
};

const infoLineStyle: React.CSSProperties = {
  marginBottom: 8,
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666666",
  fontWeight: 800,
};

const infoValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111111",
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const cardActionStyle: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
};

const noAccessBoxStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  border: "1px solid #f0c4c4",
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 900,
};

const noAccessSubTextStyle: React.CSSProperties = {
  marginTop: 6,
  color: "#555555",
  fontSize: 13,
  fontWeight: 700,
};