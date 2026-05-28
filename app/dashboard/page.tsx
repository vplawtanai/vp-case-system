"use client";

import AuthGuard from "../components/AuthGuard";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
type TimeRange = "today" | "thisWeek" | "thisMonth" | "selectedMonth" | "all";

type Tone =
  | "neutral"
  | "danger"
  | "warning"
  | "soon"
  | "success"
  | "blue"
  | "purple";

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  staff_name?: string | null;
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
  minutes?: number | string | null;
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
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  periodMinutes: number;
  coreMinutes: number;
  supportMinutes: number;
  totalMinutes: number;
};

type DailyStaffTimeDetail = {
  id: string;
  caseId: number;
  fileNo: string;
  title: string;
  clientName: string;
  workText: string;
  coreMinutes: number;
  supportMinutes: number;
  totalMinutes: number;
};

type DailyStaffTimeSummary = {
  staff: string;
  coreMinutes: number;
  supportMinutes: number;
  totalMinutes: number;
  details: DailyStaffTimeDetail[];
};

type CaseTimeSummary = {
  caseId: number;
  fileNo: string;
  title: string;
  clientName: string;
  coreMinutes: number;
  supportMinutes: number;
  totalMinutes: number;
};

type ActionRequiredItem = {
  id: string;
  caseId: number;
  fileNo: string;
  title: string;
  clientName: string;
  level: "overdue" | "today" | "dueSoon" | "stale";
  label: string;
  text: string;
  dateText: string;
  href: string;
  score: number;
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
    staff_name: "",
  });

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const currentStaffName = (profile.staff_name || "").trim();

  const canSeeTimeOverview = permissions.canViewTimeOverview;
  const canSeeOwnTimeDetail = permissions.canViewOwnTimeDetail;
  const canSeeTeamTimeDetail = permissions.canViewTeamTimeDetail;
  const canSeeTeamWorkload = permissions.canViewTeamWorkload;
  const canSeeDailyStaffWorkload = permissions.canViewDailyStaffWorkload;
  const canSeeCaseCost = permissions.canViewCaseCost;

  const canSeeAnyWorkloadData =
    canSeeTimeOverview ||
    canSeeOwnTimeDetail ||
    canSeeTeamTimeDetail ||
    canSeeTeamWorkload ||
    canSeeDailyStaffWorkload ||
    canSeeCaseCost;

  const [cases, setCases] = useState<EnrichedCase[]>([]);
  const [alertItems, setAlertItems] = useState<AlertCandidate[]>([]);
  const [timeLogs, setTimeLogs] = useState<CaseTimeLog[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isCompact, setIsCompact] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortMode, setSortMode] = useState<SortMode>("highestRisk");

  const [timeRange, setTimeRange] = useState<TimeRange>("selectedMonth");
  const [selectedMonth, setSelectedMonth] = useState("2026-06");
  const [selectedDailyDate, setSelectedDailyDate] = useState(getTodayDateString());
  const [selectedOwnDailyDate, setSelectedOwnDailyDate] = useState(getTodayDateString());

  useEffect(() => {
    const updateSize = () => {
      setIsCompact(window.innerWidth < 900);
      setIsMobile(window.innerWidth < 640);
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const updateScrollTop = () => {
      setShowScrollTop(window.scrollY > 320);
    };

    updateScrollTop();
    window.addEventListener("scroll", updateScrollTop, { passive: true });

    return () => window.removeEventListener("scroll", updateScrollTop);
  }, []);

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
            staff_name: "",
          });
          return;
        }

        const { data, error } = await supabase
          .from("user_profiles")
          .select("role, financial_access, staff_name")
          .eq("id", userData.user.id)
          .single();

        if (error || !data) {
          setProfile({
            role: "",
            financial_access: false,
            staff_name: "",
          });
          return;
        }

        setProfile({
          role: data.role || "",
          financial_access: data.financial_access === true,
          staff_name: data.staff_name || "",
        });
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

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

      const [tasksRes, deadlinesRes, timelineRes, enforcementRes] =
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

      let loadedTimeLogs: CaseTimeLog[] = [];

      if (canSeeAnyWorkloadData) {
        const { data, error } = await supabase
          .from("case_time_logs")
          .select(
            "id, case_id, work_date, staff_name, work_type, work_other, minutes, billable, note, created_at, updated_at"
          )
          .in("case_id", caseIds)
          .is("deleted_at", null);

        if (error) {
          alert("Load time logs failed:\n" + JSON.stringify(error, null, 2));
          return;
        }

        loadedTimeLogs = (data || []) as CaseTimeLog[];
      }

      const tasks = (tasksRes.data || []) as CaseTask[];
      const deadlines = (deadlinesRes.data || []) as CaseDeadline[];
      const timeline = (timelineRes.data || []) as CaseTimeline[];
      const enforcements = (enforcementRes.data || []) as CaseEnforcement[];

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
  }, [loadingProfile, permissions.canViewDashboard, canSeeAnyWorkloadData]);

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

  const monthOptions = useMemo(() => {
    return getMonthKeysFromMay2026();
  }, []);

  const clearFilters = () => {
    setSearchText("");
    setRiskFilter("all");
    setOwnerFilter("All");
    setPhaseFilter("All");
    setStatusFilter("All");
    setSortMode("highestRisk");
    setTimeRange("selectedMonth");
    setSelectedMonth("2026-06");
    setSelectedDailyDate(getTodayDateString());
    setSelectedOwnDailyDate(getTodayDateString());
  };

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
      const matchRisk = riskFilter === "all" || item.risk_level === riskFilter;
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

  const filteredTimeLogsAllTime = useMemo(() => {
    if (!canSeeAnyWorkloadData) return [];
    return timeLogs.filter((item) => filteredCaseIds.has(item.case_id));
  }, [timeLogs, filteredCaseIds, canSeeAnyWorkloadData]);

  const filteredTimeLogsByPeriod = useMemo(() => {
    return filteredTimeLogsAllTime.filter((item) =>
      isDateInTimeRange(item.work_date, timeRange, selectedMonth)
    );
  }, [filteredTimeLogsAllTime, timeRange, selectedMonth]);

  const ownTimeLogsByPeriod = useMemo(() => {
    if (!canSeeOwnTimeDetail) return [];
    if (!currentStaffName) return [];

    return filteredTimeLogsByPeriod.filter(
      (item) => (item.staff_name || "").trim() === currentStaffName
    );
  }, [filteredTimeLogsByPeriod, canSeeOwnTimeDetail, currentStaffName]);

  const dailyDateOptions = useMemo(() => {
    const values = filteredTimeLogsByPeriod
      .map((item) => item.work_date)
      .filter((value): value is string => !!value && value.trim() !== "");

    return Array.from(new Set(values)).sort((a, b) => b.localeCompare(a));
  }, [filteredTimeLogsByPeriod]);

  const ownDailyDateOptions = useMemo(() => {
    const values = ownTimeLogsByPeriod
      .map((item) => item.work_date)
      .filter((value): value is string => !!value && value.trim() !== "");

    return Array.from(new Set(values)).sort((a, b) => b.localeCompare(a));
  }, [ownTimeLogsByPeriod]);

  useEffect(() => {
    if (dailyDateOptions.length === 0) return;

    if (!dailyDateOptions.includes(selectedDailyDate)) {
      setSelectedDailyDate(dailyDateOptions[0]);
    }
  }, [dailyDateOptions, selectedDailyDate]);

  useEffect(() => {
    if (ownDailyDateOptions.length === 0) return;

    if (!ownDailyDateOptions.includes(selectedOwnDailyDate)) {
      setSelectedOwnDailyDate(ownDailyDateOptions[0]);
    }
  }, [ownDailyDateOptions, selectedOwnDailyDate]);

  const totalLoggedMinutes = useMemo(() => {
    if (!canSeeTimeOverview) return 0;

    return filteredTimeLogsByPeriod.reduce(
      (sum, item) => sum + safeMinutes(item.minutes),
      0
    );
  }, [filteredTimeLogsByPeriod, canSeeTimeOverview]);

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
      totalLoggedMinutes,
    };
  }, [filteredCases, alertItems, totalLoggedMinutes]);

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

  const workloadSummary = useMemo(() => {
    const coreMinutes = filteredTimeLogsByPeriod
      .filter((item) => item.billable !== false)
      .reduce((sum, item) => sum + safeMinutes(item.minutes), 0);

    const supportMinutes = filteredTimeLogsByPeriod
      .filter((item) => item.billable === false)
      .reduce((sum, item) => sum + safeMinutes(item.minutes), 0);

    const totalMinutes = coreMinutes + supportMinutes;

    const corePercent =
      totalMinutes > 0 ? Math.round((coreMinutes / totalMinutes) * 100) : 0;

    const supportPercent =
      totalMinutes > 0 ? Math.round((supportMinutes / totalMinutes) * 100) : 0;

    return {
      coreMinutes,
      supportMinutes,
      totalMinutes,
      corePercent,
      supportPercent,
    };
  }, [filteredTimeLogsByPeriod]);

  const staffTimeSummary = useMemo<StaffTimeSummary[]>(() => {
    const today = getTodayDateString();
    const weekStart = getWeekStartDateString();
    const monthStart = getMonthStartDateString();

    const map = new Map<string, StaffTimeSummary>();

    filteredTimeLogsAllTime.forEach((item) => {
      const staff = item.staff_name || "-";
      const minutes = safeMinutes(item.minutes);
      const workDate = item.work_date || "";
      const isCore = item.billable !== false;
      const isInPeriod = isDateInTimeRange(workDate, timeRange, selectedMonth);

      const current = map.get(staff) || {
        staff,
        todayMinutes: 0,
        weekMinutes: 0,
        monthMinutes: 0,
        periodMinutes: 0,
        coreMinutes: 0,
        supportMinutes: 0,
        totalMinutes: 0,
      };

      if (workDate === today) current.todayMinutes += minutes;
      if (workDate >= weekStart && workDate <= today) {
        current.weekMinutes += minutes;
      }
      if (workDate >= monthStart && workDate <= today) {
        current.monthMinutes += minutes;
      }

      if (isInPeriod) {
        current.periodMinutes += minutes;

        if (isCore) {
          current.coreMinutes += minutes;
        } else {
          current.supportMinutes += minutes;
        }
      }

      current.totalMinutes += minutes;
      map.set(staff, current);
    });

    return Array.from(map.values()).sort(
      (a, b) => b.periodMinutes - a.periodMinutes
    );
  }, [filteredTimeLogsAllTime, timeRange, selectedMonth]);

  const dailyStaffSummary = useMemo<DailyStaffTimeSummary[]>(() => {
    return buildDailyStaffSummary({
      logs: filteredTimeLogsByPeriod.filter(
        (item) => item.work_date === selectedDailyDate
      ),
      caseMap,
    });
  }, [filteredTimeLogsByPeriod, selectedDailyDate, caseMap]);

  const ownDailyStaffSummary = useMemo<DailyStaffTimeSummary[]>(() => {
    return buildDailyStaffSummary({
      logs: ownTimeLogsByPeriod.filter(
        (item) => item.work_date === selectedOwnDailyDate
      ),
      caseMap,
    });
  }, [ownTimeLogsByPeriod, selectedOwnDailyDate, caseMap]);

  const dailySummary = useMemo(() => {
    return buildDailyTotalSummary(dailyStaffSummary);
  }, [dailyStaffSummary]);

  const ownDailySummary = useMemo(() => {
    return buildDailyTotalSummary(ownDailyStaffSummary);
  }, [ownDailyStaffSummary]);

  const topTimeConsumingCases = useMemo<CaseTimeSummary[]>(() => {
    const map = new Map<number, CaseTimeSummary>();

    filteredTimeLogsByPeriod.forEach((item) => {
      const caseItem = caseMap.get(item.case_id);
      if (!caseItem) return;

      const minutes = safeMinutes(item.minutes);
      const isCore = item.billable !== false;

      const current = map.get(item.case_id) || {
        caseId: item.case_id,
        fileNo: caseItem.file_no || "-",
        title: caseItem.title || "-",
        clientName: caseItem.client_name || "-",
        coreMinutes: 0,
        supportMinutes: 0,
        totalMinutes: 0,
      };

      if (isCore) {
        current.coreMinutes += minutes;
      } else {
        current.supportMinutes += minutes;
      }

      current.totalMinutes += minutes;
      map.set(item.case_id, current);
    });

    return Array.from(map.values())
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 5);
  }, [filteredTimeLogsByPeriod, caseMap]);

  const actionRequired = useMemo(() => {
    const filteredAlerts = alertItems.filter((item) =>
      filteredCaseIds.has(item.case_id)
    );

    const overdueItems = filteredAlerts.filter(
      (item) => item.level === "overdue"
    );

    const todayItems = filteredAlerts.filter((item) => item.level === "today");

    const dueSoonItems = filteredAlerts.filter(
      (item) => item.level === "dueSoon"
    );

    const staleCases = filteredCases.filter((item) => {
      if (item.status !== "Active") return false;
      return getDaysSinceDateTime(item.updated_at) >= 14;
    });

    const rows: ActionRequiredItem[] = [];

    filteredAlerts.forEach((item) => {
      if (
        item.level !== "overdue" &&
        item.level !== "today" &&
        item.level !== "dueSoon"
      ) {
        return;
      }

      const caseItem = caseMap.get(item.case_id);
      if (!caseItem) return;

      rows.push({
        id: item.id,
        caseId: item.case_id,
        fileNo: caseItem.file_no || "-",
        title: caseItem.title || "-",
        clientName: caseItem.client_name || "-",
        level: item.level,
        label:
          item.level === "overdue"
            ? "Overdue"
            : item.level === "today"
              ? "Due Today"
              : "Due Soon",
        text: item.text,
        dateText: formatDisplayDate(item.date),
        href: `/cases/${item.case_id}${item.sourceHash}`,
        score: item.level === "overdue" ? 1 : item.level === "today" ? 2 : 3,
      });
    });

    staleCases.forEach((item) => {
      const staleDays = getDaysSinceDateTime(item.updated_at);

      rows.push({
        id: `stale-${item.id}`,
        caseId: item.id,
        fileNo: item.file_no || "-",
        title: item.title || "-",
        clientName: item.client_name || "-",
        level: "stale",
        label: "Stale Case",
        text: `ไม่มีการอัปเดต ${staleDays} วัน`,
        dateText: formatDateTime(item.updated_at),
        href: `/cases/${item.id}`,
        score: 4,
      });
    });

    rows.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.fileNo.localeCompare(b.fileNo);
    });

    return {
      overdue: overdueItems.length,
      today: todayItems.length,
      dueSoon: dueSoonItems.length,
      stale: staleCases.length,
      total:
        overdueItems.length +
        todayItems.length +
        dueSoonItems.length +
        staleCases.length,
      rows: rows.slice(0, 5),
    };
  }, [alertItems, filteredCaseIds, filteredCases, caseMap]);

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={isMobile ? mobilePageStyle : pageStyle}>
          <div style={loadingBoxStyle}>Loading dashboard permission...</div>
        </main>
      </AuthGuard>
    );
  }

  if (!permissions.canViewDashboard) {
    return (
      <AuthGuard>
        <main style={isMobile ? mobilePageStyle : pageStyle}>
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

  return (
    <AuthGuard>
      <main style={isMobile ? mobilePageStyle : pageStyle}>
        <AppTopNav
          title="VP Command Center"
          subtitle="Cases, deadlines, workload, and action items in one view."
          activePage="dashboard"
        />

        <section style={isMobile ? mobileHeroPanelStyle : heroPanelStyle}>
          <div>
            <div style={eyebrowStyle}>COMMAND CENTER</div>
            <h1 style={isMobile ? mobileHeroTitleStyle : heroTitleStyle}>
              VP Command Center
            </h1>
            <div style={heroSubtitleStyle}>
              Cases, deadlines, workload, and action items in one view.
            </div>
          </div>

          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            style={isMobile ? mobileSecondaryButtonStyle : secondaryButtonStyle}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        <nav style={isMobile ? mobileStickyNavStyle : stickyNavStyle} aria-label="Dashboard sections">
          <a href="#overview" style={stickyNavLinkStyle}>Overview</a>
          <a href="#urgent" style={stickyNavLinkStyle}>Urgent</a>
          <a href="#workload" style={stickyNavLinkStyle}>Workload</a>
          <a href="#cases" style={stickyNavLinkStyle}>Cases</a>
          <a href="#team" style={stickyNavLinkStyle}>Team</a>
        </nav>

        <section id="overview" style={blockStyle}>
          <div style={isMobile ? mobileSummaryGridStyle : isCompact ? compactSummaryGridStyle : summaryGridStyle}>
            <MetricCard
              label="Active Cases"
              subLabel={`${summary.total} cases in view`}
              count={String(summary.active)}
              tone="neutral"
              isMobile={isMobile}
            />
            <MetricCard
              label="Overdue"
              subLabel="เกินกำหนด"
              count={String(summary.overdue)}
              tone="danger"
              isMobile={isMobile}
            />
            <MetricCard
              label="Today"
              subLabel="ครบกำหนดวันนี้"
              count={String(summary.today)}
              tone="warning"
              isMobile={isMobile}
            />
            <MetricCard
              label="Due Soon"
              subLabel="ใกล้ครบกำหนด"
              count={String(summary.dueSoon)}
              tone="soon"
              isMobile={isMobile}
            />
            {canSeeTimeOverview && (
              <MetricCard
                label="Total Logged Time"
                subLabel={renderTimeRangeLabel(timeRange, selectedMonth)}
                count={formatDuration(summary.totalLoggedMinutes)}
                tone="blue"
                isMobile={isMobile}
              />
            )}
          </div>
        </section>

        <section id="urgent" style={isMobile ? mobileUrgentCommandPanelStyle : urgentCommandPanelStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionEyebrowStyle}>COMMAND CENTER</div>
              <h3 style={sectionTitleStyle}>Urgent Command Panel</h3>
              <div style={sectionSubtitleStyle}>
                Overdue, due today, due soon, and stale cases that need attention first.
              </div>
            </div>

            <Link href="/cases" style={sectionLinkStyle}>
              View cases
            </Link>
          </div>

          <ActionRequiredPanel data={actionRequired} isMobile={isMobile} />
        </section>

        {canSeeTimeOverview && (
          <section id="workload" style={workloadStackSectionStyle}>
            <div style={isMobile ? mobileSectionCardStyle : sectionCardStyle}>
              <div style={isMobile ? mobileHeaderGridStyle : workloadHeaderGridStyle}>
                <SectionHeader
                  eyebrow="WORKLOAD"
                  title="Workload Snapshot"
                  subtitle="Core and support time for the selected period. Time visibility follows current permissions and RLS."
                />

                <SelectFilter
                  label="Select Month"
                  value={selectedMonth}
                  onChange={(value) => {
                    setSelectedMonth(value);
                    setTimeRange("selectedMonth");
                  }}
                  options={monthOptions.map((item) => ({
                    value: item,
                    label: renderMonthKey(item),
                  }))}
                />
              </div>

              <WorkloadOverview summary={workloadSummary} isMobile={isMobile} />

              {canSeeTeamWorkload && (
                <div style={nestedPanelStyle}>
                  <SectionHeader
                    eyebrow="TEAM SNAPSHOT"
                    title="Staff Core / Support Split"
                    subtitle="Team workload split for the selected period."
                  />
                  <StaffWorkloadChart items={staffTimeSummary} isMobile={isMobile} />
                </div>
              )}
            </div>
          </section>
        )}

        <section style={isMobile ? mobileFilterPanelStyle : filterPanelStyle}>
          <div style={filterHeaderStyle}>
            <div>
              <h3 style={filterTitleStyle}>Search & Filters</h3>
              <div style={filterSubtitleStyle}>
                Narrow the command center by case, owner, status, risk, and workload period.
              </div>
            </div>

            <button type="button" onClick={clearFilters} style={isMobile ? mobileGhostButtonStyle : ghostButtonStyle}>
              Clear Filters
            </button>
          </div>

          <div style={isCompact ? compactFilterGridStyle : filterGridStyle}>
            <InputFilter
              label="Search"
              value={searchText}
              onChange={setSearchText}
              placeholder="Search file no, title, client, owner, alert text"
            />

            <SelectFilter
              label="Risk"
              value={riskFilter}
              onChange={(value) => setRiskFilter(value as RiskFilter)}
              options={[
                { value: "all", label: "All" },
                { value: "overdue", label: "Overdue" },
                { value: "today", label: "Today" },
                { value: "dueSoon", label: "Due Soon" },
                { value: "clear", label: "Clear" },
              ]}
            />

            <SelectFilter
              label="Owner"
              value={ownerFilter}
              onChange={setOwnerFilter}
              options={owners.map((item) => ({ value: item, label: item }))}
            />

            <SelectFilter
              label="Phase"
              value={phaseFilter}
              onChange={setPhaseFilter}
              options={phases.map((item) => ({ value: item, label: item }))}
            />

            <SelectFilter
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statuses.map((item) => ({ value: item, label: item }))}
            />

            <SelectFilter
              label="Sort By"
              value={sortMode}
              onChange={(value) => setSortMode(value as SortMode)}
              options={[
                { value: "highestRisk", label: "Highest Risk First" },
                { value: "latestUpdated", label: "Latest Updated" },
                { value: "fileNo", label: "File No" },
                { value: "nextAlertDate", label: "Next Alert Date" },
              ]}
            />

            {canSeeAnyWorkloadData && (
              <>
                <SelectFilter
                  label="Time Period"
                  value={timeRange}
                  onChange={(value) => setTimeRange(value as TimeRange)}
                  options={[
                    { value: "today", label: "Today" },
                    { value: "thisWeek", label: "This Week" },
                    { value: "thisMonth", label: "This Month" },
                    { value: "selectedMonth", label: "Selected Month" },
                    { value: "all", label: "All Time" },
                  ]}
                />

                <SelectFilter
                  label="Month / Year"
                  value={selectedMonth}
                  onChange={(value) => {
                    setSelectedMonth(value);
                    setTimeRange("selectedMonth");
                  }}
                  disabled={timeRange !== "selectedMonth"}
                  options={monthOptions.map((item) => ({
                    value: item,
                    label: renderMonthKey(item),
                  }))}
                />
              </>
            )}
          </div>
        </section>

        <section id="cases" style={isMobile ? mobileMiniGridStyle : miniGridStyle}>
          <DistributionCard
            title="Case Status"
            rows={[
              { label: "Active", value: summary.active },
              { label: "Waiting", value: summary.waiting },
              { label: "Done", value: summary.done },
              { label: "Clear", value: summary.clear },
            ]}
            isMobile={isMobile}
          />

          <DistributionCard
            title="Phase Distribution"
            rows={phaseSummary.map(([label, value]) => ({ label, value }))}
            isMobile={isMobile}
          />

          <DistributionCard
            title="Owner Distribution"
            rows={ownerSummary.map(([label, value]) => ({ label, value }))}
            isMobile={isMobile}
          />

          <MetricCard
            label="Enforcement Ready"
            subLabel="พร้อมดำเนินการบังคับคดี"
            count={String(summary.enforcementReady)}
            tone="blue"
            isMobile={isMobile}
          />
        </section>

        <section id="team" style={singleColumnSectionStyle}>
          {canSeeOwnTimeDetail && !canSeeTeamTimeDetail && (
            <div style={isMobile ? mobileSectionCardStyle : sectionCardStyle}>
              <div style={isMobile ? mobileHeaderGridStyle : dailyHeaderGridStyle}>
                <SectionHeader
                  eyebrow="MY TIME DETAIL"
                  title="My Daily Case Work"
                  subtitle="ดูว่าวันที่เลือก คุณบันทึกเวลาทำคดีอะไรบ้าง แยก Core Work / Support Time"
                />

                <SelectFilter
                  label="Select Date"
                  value={ownDailyDateOptions.length > 0 ? selectedOwnDailyDate : ""}
                  onChange={setSelectedOwnDailyDate}
                  disabled={!currentStaffName || ownDailyDateOptions.length === 0}
                  options={
                    ownDailyDateOptions.length > 0
                      ? ownDailyDateOptions.map((item) => ({
                          value: item,
                          label: formatDisplayDate(item),
                        }))
                      : [{ value: "", label: "No date" }]
                  }
                />
              </div>

              {!currentStaffName ? (
                <div style={emptyStyle}>
                  ยังไม่ได้ตั้งค่า staff_name ใน user_profiles ของผู้ใช้นี้
                  จึงยังไม่สามารถจับคู่กับ Time Log ของตัวเองได้
                </div>
              ) : (
                <DailyStaffTimeCheck
                  selectedDate={selectedOwnDailyDate}
                  items={ownDailyStaffSummary}
                  summary={ownDailySummary}
                  isCompact={isCompact}
                  isMobile={isMobile}
                  detailMode="own"
                />
              )}
            </div>
          )}

          {canSeeTeamWorkload && (
            <div style={isMobile ? mobileSectionCardStyle : sectionCardStyle}>
              <SectionHeader
                eyebrow="TEAM TIME"
                title="Time by Staff"
                subtitle="ภาพรวมเวลาทำงานรายคนตามช่วงเวลาที่เลือก"
              />

              {staffTimeSummary.length === 0 ? (
                <div style={emptyStyle}>No time logs found.</div>
              ) : isCompact ? (
                <StaffTimeCardList items={staffTimeSummary} isMobile={isMobile} />
              ) : (
                <StaffTimeTable items={staffTimeSummary} />
              )}
            </div>
          )}

          {canSeeDailyStaffWorkload && (
            <div style={isMobile ? mobileSectionCardStyle : sectionCardStyle}>
              <div style={isMobile ? mobileHeaderGridStyle : dailyHeaderGridStyle}>
                <SectionHeader
                  eyebrow="DAILY TIME CHECK"
                  title="Daily Core / Support by Staff"
                  subtitle="เลือกวันที่เพื่อดูว่าในวันนั้นแต่ละคนทำ Core Work / Support Time เท่าไร และทำคดีอะไรบ้าง"
                />

                <SelectFilter
                  label="Select Date"
                  value={dailyDateOptions.length > 0 ? selectedDailyDate : ""}
                  onChange={setSelectedDailyDate}
                  disabled={dailyDateOptions.length === 0}
                  options={
                    dailyDateOptions.length > 0
                      ? dailyDateOptions.map((item) => ({
                          value: item,
                          label: formatDisplayDate(item),
                        }))
                      : [{ value: "", label: "No date" }]
                  }
                />
              </div>

              <DailyStaffTimeCheck
                selectedDate={selectedDailyDate}
                items={dailyStaffSummary}
                summary={dailySummary}
                isCompact={isCompact}
                isMobile={isMobile}
                detailMode="team"
              />
            </div>
          )}

          {canSeeCaseCost && (
            <div style={isMobile ? mobileSectionCardStyle : sectionCardStyle}>
              <SectionHeader
                eyebrow="CASE COST"
                title="Top Time-Consuming Cases"
                subtitle="5 คดีที่ใช้เวลาทำงานมากที่สุดตามช่วงเวลาที่เลือก"
              />

              {topTimeConsumingCases.length === 0 ? (
                <div style={emptyStyle}>No time logs found.</div>
              ) : (
                <TopTimeConsumingCaseList
                  items={topTimeConsumingCases}
                  isMobile={isMobile}
                />
              )}
            </div>
          )}
        </section>

        {showScrollTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={scrollTopButtonStyle}
            aria-label="Scroll to top"
          >
            Top
          </button>
        )}
      </main>
    </AuthGuard>
  );
}

/* =========================================================
   SMALL FORM COMPONENTS
========================================================= */

function InputFilter({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        disabled={disabled}
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={sectionHeaderStyle}>
      <div>
        <div style={sectionEyebrowStyle}>{eyebrow}</div>
        <h3 style={sectionTitleStyle}>{title}</h3>
        <div style={sectionSubtitleStyle}>{subtitle}</div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  subLabel,
  count,
  tone,
  isMobile = false,
}: {
  label: string;
  subLabel: string;
  count: string;
  tone: Tone;
  isMobile?: boolean;
}) {
  return (
    <div style={{ ...(isMobile ? mobileMetricCardStyle : metricCardStyle), ...getMetricToneStyle(tone) }}>
      <div style={{ ...metricTopLineStyle, ...getBarToneStyle(tone) }} />
      <div style={isMobile ? mobileMetricNumberStyle : metricNumberStyle}>{count}</div>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricSubLabelStyle}>{subLabel}</div>
    </div>
  );
}

function DistributionCard({
  title,
  rows,
  isMobile = false,
}: {
  title: string;
  rows: { label: string; value: number }[];
  isMobile?: boolean;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div style={isMobile ? mobileDistributionCardStyle : distributionCardStyle}>
      <div style={distributionTitleWrapStyle}>
        <div style={distributionTitleStyle}>{title}</div>
        <div style={distributionTotalStyle}>{total} total</div>
      </div>

      {rows.length === 0 ? (
        <div style={emptyMiniStyle}>No data</div>
      ) : (
        rows.map((row, index) => {
          const width = Math.max(3, Math.round((row.value / max) * 100));
          const percent = total > 0 ? Math.round((row.value / total) * 100) : 0;
          const tone = getToneByIndex(index);

          return (
            <div key={row.label} style={isMobile ? mobileDistributionRowStyle : distributionRowStyle}>
              <div style={distributionRowTopStyle}>
                <div style={distributionNameWrapStyle}>
                  <span
                    style={{
                      ...distributionDotStyle,
                      ...getBarToneStyle(tone),
                    }}
                  />
                  <span>{row.label}</span>
                </div>

                <div style={distributionValueStyle}>
                  <strong>{row.value}</strong>
                  <span>{percent}%</span>
                </div>
              </div>

              <div style={distributionTrackStyle}>
                <div
                  style={{
                    ...distributionFillStyle,
                    ...getBarToneStyle(tone),
                    width: `${width}%`,
                  }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ActionRequiredPanel({
  data,
  isMobile = false,
}: {
  data: {
    overdue: number;
    today: number;
    dueSoon: number;
    stale: number;
    total: number;
    rows: ActionRequiredItem[];
  };
  isMobile?: boolean;
}) {
  return (
    <div>
      <div style={isMobile ? mobileActionSummaryGridStyle : actionSummaryGridStyle}>
        <ActionMiniCard
          label="Overdue"
          value={data.overdue}
          tone="danger"
          description="รายการเกินกำหนด"
          isMobile={isMobile}
        />
        <ActionMiniCard
          label="Due Today"
          value={data.today}
          tone="warning"
          description="ครบกำหนดวันนี้"
          isMobile={isMobile}
        />
        <ActionMiniCard
          label="Due Soon"
          value={data.dueSoon}
          tone="soon"
          description="ใกล้ครบกำหนด"
          isMobile={isMobile}
        />
        <ActionMiniCard
          label="Stale Cases"
          value={data.stale}
          tone="purple"
          description="ไม่ได้อัปเดตเกิน 14 วัน"
          isMobile={isMobile}
        />
      </div>

      {data.rows.length === 0 ? (
        <CompactAllClearBox text="No action required right now" />
      ) : (
        <div style={actionListStyle}>
          {data.rows.map((item) => (
            <div key={item.id} style={isMobile ? mobileActionRowStyle : actionRowStyle}>
              <div style={actionRowLeftStyle}>
                <ActionLevelBadge level={item.level} />

                <div>
                  <div style={actionCaseTitleStyle}>
                    {item.fileNo} · {item.title}
                  </div>

                  <div style={actionMetaStyle}>
                    {item.clientName} · {item.text}
                  </div>
                </div>
              </div>

              <div style={isMobile ? mobileActionRowRightStyle : actionRowRightStyle}>
                <div style={actionDateStyle}>{item.dateText || "-"}</div>

                <Link href={item.href} style={openButtonLinkStyle}>
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionMiniCard({
  label,
  value,
  description,
  tone,
  isMobile = false,
}: {
  label: string;
  value: number;
  description: string;
  tone: Tone;
  isMobile?: boolean;
}) {
  return (
    <div style={{ ...(isMobile ? mobileActionMiniCardStyle : actionMiniCardStyle), ...getMetricToneStyle(tone) }}>
      <div style={{ ...actionMiniTopLineStyle, ...getBarToneStyle(tone) }} />
      <div style={isMobile ? mobileActionMiniNumberStyle : actionMiniNumberStyle}>{value}</div>
      <div style={actionMiniLabelStyle}>{label}</div>
      <div style={actionMiniDescriptionStyle}>{description}</div>
    </div>
  );
}

function ActionLevelBadge({
  level,
}: {
  level: "overdue" | "today" | "dueSoon" | "stale";
}) {
  const label =
    level === "overdue"
      ? "Overdue"
      : level === "today"
        ? "Today"
        : level === "dueSoon"
          ? "Due Soon"
          : "Stale";

  const style =
    level === "overdue"
      ? actionBadgeDangerStyle
      : level === "today"
        ? actionBadgeWarningStyle
        : level === "dueSoon"
          ? actionBadgeSoonStyle
          : actionBadgePurpleStyle;

  return <span style={{ ...actionBadgeBaseStyle, ...style }}>{label}</span>;
}

function WorkloadOverview({
  summary,
  isMobile = false,
}: {
  summary: {
    coreMinutes: number;
    supportMinutes: number;
    totalMinutes: number;
    corePercent: number;
    supportPercent: number;
  };
  isMobile?: boolean;
}) {
  if (summary.totalMinutes <= 0) {
    return <div style={emptyStyle}>No time logs found.</div>;
  }

  const donutStyle: CSSProperties = {
    ...(isMobile ? mobileWorkloadDonutRingStyle : workloadDonutRingStyle),
    background: `conic-gradient(#175cd3 0 ${summary.corePercent}%, #7e22ce ${summary.corePercent}% 100%)`,
  };

  return (
    <div style={isMobile ? mobileWorkloadDonutBoxStyle : workloadDonutBoxStyle}>
      <div style={workloadDonutWrapStyle}>
        <div style={donutStyle}>
          <div style={isMobile ? mobileWorkloadDonutCenterStyle : workloadDonutCenterStyle}>
            <div style={isMobile ? mobileWorkloadDonutValueStyle : workloadDonutValueStyle}>
              {formatDuration(summary.totalMinutes)}
            </div>
            <div style={workloadDonutLabelStyle}>Total</div>
          </div>
        </div>
      </div>

      <div style={workloadDonutSideStyle}>
        <div>
          <div style={workloadTotalLabelStyle}>Workload Composition</div>
          <div style={isMobile ? mobileWorkloadTotalValueStyle : workloadTotalValueStyle}>
            Core {summary.corePercent}% / Support {summary.supportPercent}%
          </div>
        </div>

        <div style={isMobile ? mobileWorkloadMiniGridStyle : workloadMiniGridStyle}>
          <div style={workloadMiniCardStyle}>
            <div style={workloadMiniTopStyle}>
              <span style={{ ...legendDotStyle, background: "#175cd3" }} />
              <span>Core Work</span>
            </div>
            <strong>{formatDuration(summary.coreMinutes)}</strong>
            <div style={legendPercentStyle}>{summary.corePercent}%</div>
          </div>

          <div style={workloadMiniCardStyle}>
            <div style={workloadMiniTopStyle}>
              <span style={{ ...legendDotStyle, background: "#7e22ce" }} />
              <span>Support Time</span>
            </div>
            <strong>{formatDuration(summary.supportMinutes)}</strong>
            <div style={legendPercentStyle}>{summary.supportPercent}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaffWorkloadChart({
  items,
  isMobile = false,
}: {
  items: StaffTimeSummary[];
  isMobile?: boolean;
}) {
  if (items.length === 0) {
    return <div style={emptyStyle}>No time logs found.</div>;
  }

  const maxMinutes = Math.max(1, ...items.map((item) => item.periodMinutes));

  return (
    <div style={staffSlimListStyle}>
      {items.map((item, index) => {
        const targetMinutes = item.periodMinutes;

        const totalWidth =
          targetMinutes > 0
            ? Math.max(4, Math.round((targetMinutes / maxMinutes) * 100))
            : 0;

        const corePercent =
          targetMinutes > 0
            ? Math.round((item.coreMinutes / targetMinutes) * 100)
            : 0;

        const supportPercent =
          targetMinutes > 0
            ? Math.round((item.supportMinutes / targetMinutes) * 100)
            : 0;

        return (
          <div key={item.staff} style={isMobile ? mobileStaffSlimRowStyle : staffSlimRowStyle}>
            <div style={staffSlimHeaderStyle}>
              <div style={staffSlimNameWrapStyle}>
                <span style={staffSlimRankStyle}>#{index + 1}</span>

                <div>
                  <div style={staffSlimNameStyle}>{item.staff}</div>
                  <div style={staffSlimMetaStyle}>
                    Core {formatDuration(item.coreMinutes)} · Support{" "}
                    {formatDuration(item.supportMinutes)}
                  </div>
                </div>
              </div>

              <div style={staffSlimTotalStyle}>
                {formatDuration(targetMinutes)}
              </div>
            </div>

            <div style={isMobile ? mobileStaffSlimTrackStyle : staffSlimTrackStyle}>
              <div
                style={{
                  ...staffSlimTotalBarStyle,
                  width: `${totalWidth}%`,
                }}
              >
                <div
                  style={{
                    ...staffSegmentCoreStyle,
                    width: `${corePercent}%`,
                  }}
                />
                <div
                  style={{
                    ...staffSegmentSupportStyle,
                    width: `${supportPercent}%`,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
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
            <th style={thStyle}>Selected Period</th>
            <th style={thStyle}>Core</th>
            <th style={thStyle}>Support</th>
            <th style={thStyle}>All Time (ทุกเดือน)</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.staff} style={rowStyle}>
              <td style={tdStyle}>{item.staff}</td>
              <td style={tdStyle}>{formatDuration(item.todayMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.weekMinutes)}</td>
              <td style={tdStyle}>
                <strong>{formatDuration(item.periodMinutes)}</strong>
              </td>
              <td style={tdStyle}>{formatDuration(item.coreMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.supportMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.totalMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffTimeCardList({
  items,
  isMobile = false,
}: {
  items: StaffTimeSummary[];
  isMobile?: boolean;
}) {
  return (
    <div style={cardListStyle}>
      {items.map((item) => (
        <div key={item.staff} style={isMobile ? compactMobileCardStyle : mobileCardStyle}>
          <div style={mobileTitleStyle}>{item.staff}</div>
          <InfoLine label="Selected" value={formatDuration(item.periodMinutes)} />
          <InfoLine label="Today" value={formatDuration(item.todayMinutes)} />
          <InfoLine label="This Week" value={formatDuration(item.weekMinutes)} />
          <InfoLine label="Core" value={formatDuration(item.coreMinutes)} />
          <InfoLine
            label="Support"
            value={formatDuration(item.supportMinutes)}
          />
          <InfoLine
            label="All Time (ทุกเดือน)"
            value={formatDuration(item.totalMinutes)}
          />
        </div>
      ))}
    </div>
  );
}

function DailyStaffTimeCheck({
  selectedDate,
  items,
  summary,
  isCompact,
  isMobile,
  detailMode,
}: {
  selectedDate: string;
  items: DailyStaffTimeSummary[];
  summary: {
    coreMinutes: number;
    supportMinutes: number;
    totalMinutes: number;
  };
  isCompact: boolean;
  isMobile: boolean;
  detailMode: "own" | "team";
}) {
  if (!selectedDate || items.length === 0) {
    return <div style={emptyStyle}>No time logs found for selected date.</div>;
  }

  return (
    <div>
      <div style={isMobile ? mobileDailySummaryGridStyle : dailySummaryGridStyle}>
        <DailySummaryCard
          label="Selected Date"
          value={formatDisplayDate(selectedDate)}
          tone="neutral"
          isMobile={isMobile}
        />
        <DailySummaryCard
          label="Total Time"
          value={formatDuration(summary.totalMinutes)}
          tone="neutral"
          isMobile={isMobile}
        />
        <DailySummaryCard
          label="Core Work"
          value={formatDuration(summary.coreMinutes)}
          tone="blue"
          isMobile={isMobile}
        />
        <DailySummaryCard
          label="Support Time"
          value={formatDuration(summary.supportMinutes)}
          tone="purple"
          isMobile={isMobile}
        />
      </div>

      {isCompact ? (
        <DailyStaffTimeCardList items={items} detailMode={detailMode} isMobile={isMobile} />
      ) : (
        <DailyStaffTimeTable items={items} detailMode={detailMode} />
      )}
    </div>
  );
}

function DailySummaryCard({
  label,
  value,
  tone,
  isMobile = false,
}: {
  label: string;
  value: string;
  tone: Tone;
  isMobile?: boolean;
}) {
  return (
    <div style={{ ...(isMobile ? mobileDailySummaryCardStyle : dailySummaryCardStyle), ...getMetricToneStyle(tone) }}>
      <div style={dailySummaryLabelStyle}>{label}</div>
      <div style={isMobile ? mobileDailySummaryValueStyle : dailySummaryValueStyle}>{value}</div>
    </div>
  );
}

function DailyStaffTimeTable({
  items,
  detailMode,
}: {
  items: DailyStaffTimeSummary[];
  detailMode: "own" | "team";
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {detailMode === "team" && <th style={thStyle}>Staff</th>}
            <th style={thStyle}>Core Work</th>
            <th style={thStyle}>Support Time</th>
            <th style={thStyle}>Total</th>
            <th style={thStyle}>Signal</th>
            <th style={thStyle}>Cases / Work Details</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.staff} style={rowStyle}>
              {detailMode === "team" && (
                <td style={tdStrongStyle}>{item.staff}</td>
              )}
              <td style={tdStyle}>{formatDuration(item.coreMinutes)}</td>
              <td style={tdStyle}>{formatDuration(item.supportMinutes)}</td>
              <td style={tdStrongStyle}>{formatDuration(item.totalMinutes)}</td>
              <td style={tdStyle}>
                <DailySignalBadge item={item} />
              </td>
              <td style={tdWideStyle}>
                <DailyCaseDetailList details={item.details} isMobile={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyStaffTimeCardList({
  items,
  detailMode,
  isMobile = false,
}: {
  items: DailyStaffTimeSummary[];
  detailMode: "own" | "team";
  isMobile?: boolean;
}) {
  return (
    <div style={cardListStyle}>
      {items.map((item) => (
        <div key={item.staff} style={isMobile ? compactMobileCardStyle : mobileCardStyle}>
          {detailMode === "team" && (
            <div style={mobileTitleStyle}>{item.staff}</div>
          )}
          <InfoLine label="Core Work" value={formatDuration(item.coreMinutes)} />
          <InfoLine
            label="Support Time"
            value={formatDuration(item.supportMinutes)}
          />
          <InfoLine label="Total" value={formatDuration(item.totalMinutes)} />
          <div style={dailySignalWrapStyle}>
            <DailySignalBadge item={item} />
          </div>
          <DailyCaseDetailList details={item.details} isMobile={isMobile} />
        </div>
      ))}
    </div>
  );
}

function DailyCaseDetailList({
  details,
  isMobile = false,
}: {
  details: DailyStaffTimeDetail[];
  isMobile?: boolean;
}) {
  if (details.length === 0) {
    return <span style={mutedTextStyle}>-</span>;
  }

  return (
    <div style={dailyDetailListStyle}>
      {details.map((detail) => (
        <div key={detail.id} style={isMobile ? mobileDailyDetailItemStyle : dailyDetailItemStyle}>
          <div style={dailyDetailTopStyle}>
            <Link
              href={`/cases/${detail.caseId}#timelogs`}
              style={miniOpenLinkStyle}
            >
              {detail.fileNo} · {detail.title}
            </Link>
            <span style={dailyDetailTotalStyle}>
              {formatDuration(detail.totalMinutes)}
            </span>
          </div>

          <div style={dailyDetailMetaStyle}>
            {detail.clientName} · {detail.workText}
          </div>

          <div style={dailyDetailSplitStyle}>
            <span>Core {formatDuration(detail.coreMinutes)}</span>
            <span>Support {formatDuration(detail.supportMinutes)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailySignalBadge({ item }: { item: DailyStaffTimeSummary }) {
  const supportPercent =
    item.totalMinutes > 0
      ? Math.round((item.supportMinutes / item.totalMinutes) * 100)
      : 0;

  if (item.totalMinutes <= 0) {
    return <span style={dailySignalNeutralStyle}>No Time</span>;
  }

  if (supportPercent >= 80) {
    return <span style={dailySignalPurpleStyle}>Support สูง</span>;
  }

  if (item.coreMinutes <= 0 && item.supportMinutes > 0) {
    return <span style={dailySignalWarningStyle}>ไม่มี Core</span>;
  }

  return <span style={dailySignalSuccessStyle}>ปกติ</span>;
}

function TopTimeConsumingCaseList({
  items,
  isMobile = false,
}: {
  items: CaseTimeSummary[];
  isMobile?: boolean;
}) {
  const maxMinutes = Math.max(1, ...items.map((item) => item.totalMinutes));

  return (
  <div style={isMobile ? compactTimeCaseListStyle : timeCaseListStyle}>
    {items.map((item, index) => {
      const width = Math.max(
        4,
        Math.round((item.totalMinutes / maxMinutes) * 100)
      );

      const corePercent =
        item.totalMinutes > 0
          ? Math.round((item.coreMinutes / item.totalMinutes) * 100)
          : 0;

      const supportPercent =
        item.totalMinutes > 0
          ? Math.round((item.supportMinutes / item.totalMinutes) * 100)
          : 0;

      return (
        <div
          key={item.caseId}
          style={isMobile ? compactTimeCaseItemStyle : timeCaseItemStyle}
        >
          <div
            style={
              isMobile ? compactTimeCaseHeaderStyle : timeCaseHeaderStyle
            }
          >
            <div style={timeCaseLeftStyle}>
              <span
                style={
                  isMobile
                    ? compactTimeCaseRankStyle
                    : timeCaseRankStyle
                }
              >
                #{index + 1}
              </span>

              <div style={timeCaseTextWrapStyle}>
                <div
                  style={
                    isMobile
                      ? compactTimeCaseTitleStyle
                      : timeCaseTitleStyle
                  }
                >
                  {item.fileNo} · {item.title}
                </div>

                <div style={timeCaseClientStyle}>{item.clientName}</div>
              </div>
            </div>

            <div
              style={
                isMobile
                  ? compactTimeCaseTotalStyle
                  : timeCaseTotalStyle
              }
            >
              {formatDuration(item.totalMinutes)}
            </div>
          </div>

          <div
            style={
              isMobile ? compactTimeCaseBarTrackStyle : timeCaseBarTrackStyle
            }
          >
            <div
              style={{
                ...timeCaseBarOuterStyle,
                width: `${width}%`,
              }}
            >
              <div
                style={{
                  ...timeCaseCorePartStyle,
                  width: `${corePercent}%`,
                }}
              />
              <div
                style={{
                  ...timeCaseSupportPartStyle,
                  width: `${supportPercent}%`,
                }}
              />
            </div>
          </div>

          <div
            style={isMobile ? compactTimeCaseFooterStyle : timeCaseFooterStyle}
          >
            <span>Core {formatDuration(item.coreMinutes)}</span>
            <span>Support {formatDuration(item.supportMinutes)}</span>
            <Link
              href={`/cases/${item.caseId}#timelogs`}
              style={miniOpenLinkStyle}
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

function CompactAllClearBox({ text }: { text: string }) {
  return (
    <div style={compactAllClearStyle}>
      <div style={compactAllClearIconStyle}>✓</div>
      <div>
        <div style={compactAllClearTitleStyle}>{text}</div>
        <div style={compactAllClearSubStyle}>
          ไม่มีรายการที่ต้องดำเนินการในขณะนี้
        </div>
      </div>
    </div>
  );
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
      text: `Deadline: ${renderDeadlineType(
        deadline.deadline_type,
        deadline.deadline_other
      )}`,
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
   DAILY TIME HELPERS
========================================================= */

function buildDailyStaffSummary({
  logs,
  caseMap,
}: {
  logs: CaseTimeLog[];
  caseMap: Map<number, EnrichedCase>;
}) {
  const map = new Map<string, DailyStaffTimeSummary>();

  logs.forEach((item) => {
    const staff = item.staff_name || "-";
    const minutes = safeMinutes(item.minutes);
    const isCore = item.billable !== false;
    const caseItem = caseMap.get(item.case_id);

    const current = map.get(staff) || {
      staff,
      coreMinutes: 0,
      supportMinutes: 0,
      totalMinutes: 0,
      details: [],
    };

    const detail: DailyStaffTimeDetail = {
      id: item.id,
      caseId: item.case_id,
      fileNo: caseItem?.file_no || "-",
      title: caseItem?.title || "-",
      clientName: caseItem?.client_name || "-",
      workText: renderWorkType(item.work_type, item.work_other),
      coreMinutes: isCore ? minutes : 0,
      supportMinutes: isCore ? 0 : minutes,
      totalMinutes: minutes,
    };

    if (isCore) {
      current.coreMinutes += minutes;
    } else {
      current.supportMinutes += minutes;
    }

    current.totalMinutes += minutes;
    current.details.push(detail);

    map.set(staff, current);
  });

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      details: item.details.sort((a, b) => b.totalMinutes - a.totalMinutes),
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

function buildDailyTotalSummary(items: DailyStaffTimeSummary[]) {
  const coreMinutes = items.reduce((sum, item) => sum + item.coreMinutes, 0);
  const supportMinutes = items.reduce(
    (sum, item) => sum + item.supportMinutes,
    0
  );

  return {
    coreMinutes,
    supportMinutes,
    totalMinutes: coreMinutes + supportMinutes,
  };
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

function safeMinutes(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return 0;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
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

function getMonthKeysFromMay2026() {
  const result: string[] = [];
  const start = new Date(2026, 4, 1);
  const end = new Date(2031, 4, 1);

  const current = new Date(start);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");

    result.push(`${year}-${month}`);

    current.setMonth(current.getMonth() + 1);
  }

  return result;
}

function getMonthKeyFromDate(dateText?: string | null) {
  if (!dateText || dateText.length < 7) return "";
  return dateText.slice(0, 7);
}

function getWeekStartDateString() {
  const today = parseLocalDate(getTodayDateString());
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  today.setDate(today.getDate() + diffToMonday);

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthStartDateString() {
  const today = parseLocalDate(getTodayDateString());
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}

function isDateInTimeRange(
  dateText?: string | null,
  range?: TimeRange,
  selectedMonth?: string
) {
  if (!dateText) return false;

  const today = getTodayDateString();

  if (range === "today") {
    return dateText === today;
  }

  if (range === "thisWeek") {
    return dateText >= getWeekStartDateString() && dateText <= today;
  }

  if (range === "thisMonth") {
    return dateText >= getMonthStartDateString() && dateText <= today;
  }

  if (range === "selectedMonth") {
    return getMonthKeyFromDate(dateText) === selectedMonth;
  }

  return true;
}

function renderTimeRangeLabel(range: TimeRange, selectedMonth: string) {
  if (range === "today") return "วันนี้";
  if (range === "thisWeek") return "สัปดาห์นี้";
  if (range === "thisMonth") return "เดือนนี้";
  if (range === "selectedMonth") return renderMonthKey(selectedMonth);
  return "รวมทั้งหมด";
}

function renderMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;

  return `${month}/${year}`;
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

function renderWorkType(workType?: string | null, workOther?: string | null) {
  if (!workType) return "-";
  if (workType === "อื่นๆ") return workOther || "อื่นๆ";
  return workType;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("th-TH");
  } catch {
    return value;
  }
}

function getDaysSinceDateTime(value?: string | null) {
  if (!value) return 9999;

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return 9999;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  target.setHours(0, 0, 0, 0);

  return Math.floor(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function formatDuration(totalMinutes?: number | null) {
  const safeValue =
    typeof totalMinutes === "number" && Number.isFinite(totalMinutes)
      ? totalMinutes
      : 0;

  const hours = Math.floor(safeValue / 60);
  const minutes = safeValue % 60;

  if (hours <= 0) return `${minutes} นาที`;
  if (minutes <= 0) return `${hours} ชม.`;

  return `${hours} ชม. ${minutes} นาที`;
}

function getMetricToneStyle(tone: Tone): CSSProperties {
  if (tone === "danger") {
    return {
      background: "linear-gradient(135deg, #fff5f5 0%, #ffe0e0 100%)",
      border: "1px solid #f1b5b5",
    };
  }

  if (tone === "warning") {
    return {
      background: "linear-gradient(135deg, #fffaf0 0%, #fff0c2 100%)",
      border: "1px solid #f0d58a",
    };
  }

  if (tone === "soon") {
    return {
      background: "linear-gradient(135deg, #fffdf2 0%, #fff8df 100%)",
      border: "1px solid #eedc9a",
    };
  }

  if (tone === "success") {
    return {
      background: "linear-gradient(135deg, #f0fff4 0%, #e4f4e9 100%)",
      border: "1px solid #b9dfc3",
    };
  }

  if (tone === "blue") {
    return {
      background: "linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 100%)",
      border: "1px solid #b2ccff",
    };
  }

  if (tone === "purple") {
    return {
      background: "linear-gradient(135deg, #faf5ff 0%, #f1e4ff 100%)",
      border: "1px solid #d8b4fe",
    };
  }

  return {
    background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
    border: "1px solid #dddddd",
  };
}

function getBarToneStyle(tone: Tone): CSSProperties {
  if (tone === "danger") return { background: "#c0392b" };
  if (tone === "warning") return { background: "#b54708" };
  if (tone === "soon") return { background: "#c96b00" };
  if (tone === "success") return { background: "#18794e" };
  if (tone === "blue") return { background: "#175cd3" };
  if (tone === "purple") return { background: "#7e22ce" };

  return { background: "#0f2743" };
}

function getToneByIndex(index: number): Tone {
  const tones: Tone[] = ["blue", "success", "warning", "purple", "neutral"];
  return tones[index % tones.length];
}

/* =========================================================
   STYLES
========================================================= */

const pageStyle: CSSProperties = {
  padding: "22px 24px 40px",
  maxWidth: 1280,
  margin: "0 auto",
  color: "#111111",
};

const mobilePageStyle: CSSProperties = {
  padding: "12px 10px 28px",
  maxWidth: 1280,
  margin: "0 auto",
  color: "#111111",
};

const blockStyle: CSSProperties = {
  marginBottom: 18,
};

const heroPanelStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 14,
  background: "#ffffff",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
};

const mobileHeroPanelStyle: CSSProperties = {
  ...heroPanelStyle,
  padding: 12,
  borderRadius: 12,
  marginBottom: 10,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.2,
  color: "#0f2743",
  marginBottom: 6,
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 950,
  color: "#111111",
};

const mobileHeroTitleStyle: CSSProperties = {
  ...heroTitleStyle,
  fontSize: 22,
};

const heroSubtitleStyle: CSSProperties = {
  marginTop: 5,
  color: "#555555",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.45,
};

const stickyNavStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  display: "flex",
  gap: 8,
  alignItems: "center",
  overflowX: "auto",
  padding: "8px 0 12px",
  marginBottom: 6,
  background: "rgba(248, 250, 252, 0.94)",
  backdropFilter: "blur(10px)",
};

const mobileStickyNavStyle: CSSProperties = {
  ...stickyNavStyle,
  gap: 6,
  padding: "7px 0 10px",
};

const stickyNavLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #d8e0ea",
  background: "#ffffff",
  color: "#0f2743",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: "nowrap",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
};

const filterPanelStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 16,
  padding: 16,
  background: "#ffffff",
  marginBottom: 18,
};

const mobileFilterPanelStyle: CSSProperties = {
  ...filterPanelStyle,
  padding: 12,
  borderRadius: 14,
  marginBottom: 12,
};

const filterHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const filterTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 900,
  color: "#111111",
};

const filterSubtitleStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#666666",
  fontWeight: 600,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.2fr 1.1fr 1.1fr",
  gap: 12,
  alignItems: "end",
};

const compactFilterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const compactSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
  gap: 10,
};

const mobileSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const metricCardStyle: CSSProperties = {
  position: "relative",
  borderRadius: 14,
  padding: 14,
  minHeight: 96,
  color: "#111111",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.045)",
  overflow: "hidden",
};

const mobileMetricCardStyle: CSSProperties = {
  ...metricCardStyle,
  padding: 10,
  minHeight: 78,
  borderRadius: 12,
};

const metricTopLineStyle: CSSProperties = {
  width: 38,
  height: 5,
  borderRadius: 999,
  marginBottom: 14,
};

const metricNumberStyle: CSSProperties = {
  fontSize: 26,
  fontWeight: 950,
  marginBottom: 6,
  color: "#111111",
  lineHeight: 1.1,
};

const mobileMetricNumberStyle: CSSProperties = {
  ...metricNumberStyle,
  fontSize: 21,
  marginBottom: 4,
};

const metricLabelStyle: CSSProperties = {
  fontWeight: 900,
  color: "#222222",
};

const metricSubLabelStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "#666666",
};

const miniGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const mobileMiniGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
  marginBottom: 12,
};

const distributionCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 18,
  padding: 18,
  background: "linear-gradient(135deg, #ffffff 0%, #fbfcff 100%)",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.045)",
};

const mobileDistributionCardStyle: CSSProperties = {
  ...distributionCardStyle,
  padding: 12,
  borderRadius: 14,
};

const distributionTitleWrapStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 14,
};

const distributionTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  color: "#111111",
};

const distributionTotalStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748b",
};

const distributionRowStyle: CSSProperties = {
  padding: "10px 0",
  borderTop: "1px solid #f1f5f9",
};

const mobileDistributionRowStyle: CSSProperties = {
  ...distributionRowStyle,
  padding: "8px 0",
};

const distributionRowTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 8,
};

const distributionNameWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 900,
  color: "#222222",
};

const distributionDotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  display: "inline-block",
};

const distributionValueStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  color: "#334155",
  fontSize: 13,
  fontWeight: 900,
};

const distributionTrackStyle: CSSProperties = {
  width: "100%",
  height: 9,
  borderRadius: 999,
  background: "#eef2f7",
  overflow: "hidden",
};

const distributionFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
};

const emptyMiniStyle: CSSProperties = {
  color: "#666666",
  fontWeight: 600,
};

const workloadStackSectionStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 14,
  marginBottom: 18,
};

const workloadHeaderGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr minmax(180px, 240px)",
  gap: 14,
  alignItems: "start",
  marginBottom: 12,
};

const dailyHeaderGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr minmax(180px, 240px)",
  gap: 14,
  alignItems: "start",
  marginBottom: 12,
};

const mobileHeaderGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
  alignItems: "start",
  marginBottom: 12,
};

const nestedPanelStyle: CSSProperties = {
  marginTop: 14,
  paddingTop: 14,
  borderTop: "1px solid #e5e7eb",
};

const sectionCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 16,
  padding: 16,
  background: "#ffffff",
  marginBottom: 14,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
};

const mobileSectionCardStyle: CSSProperties = {
  ...sectionCardStyle,
  borderRadius: 14,
  padding: 12,
  marginBottom: 10,
};

const urgentCommandPanelStyle: CSSProperties = {
  ...sectionCardStyle,
  border: "1px solid #c8d7ea",
  boxShadow: "0 12px 30px rgba(15, 39, 67, 0.08)",
};

const mobileUrgentCommandPanelStyle: CSSProperties = {
  ...urgentCommandPanelStyle,
  borderRadius: 14,
  padding: 12,
  marginBottom: 10,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const sectionEyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1,
  fontWeight: 950,
  color: "#0f2743",
  marginBottom: 4,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 900,
  color: "#111111",
};

const sectionSubtitleStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#666666",
  fontWeight: 600,
  lineHeight: 1.5,
};

const sectionLinkStyle: CSSProperties = {
  color: "#0f2743",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 900,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#222222",
  fontWeight: 800,
  fontSize: 13,
};

const inputStyle: CSSProperties = {
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

const secondaryButtonStyle: CSSProperties = {
  padding: "10px 16px",
  background: "#ffffff",
  color: "#111111",
  borderRadius: 10,
  border: "1px solid #cccccc",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const mobileSecondaryButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  width: "100%",
  justifyContent: "center",
};

const ghostButtonStyle: CSSProperties = {
  padding: "9px 13px",
  background: "#f8fafc",
  color: "#111111",
  borderRadius: 10,
  border: "1px solid #dddddd",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const mobileGhostButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  width: "100%",
};

const scrollTopButtonStyle: CSSProperties = {
  position: "fixed",
  right: 24,
  bottom: 96,
  zIndex: 40,
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(255, 255, 255, 0.22)",
  background: "#0f2743",
  color: "#ffffff",
  boxShadow: "0 10px 24px rgba(15, 39, 67, 0.22)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 900,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 860,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: "1px solid #eeeeee",
  whiteSpace: "nowrap",
  color: "#111111",
  fontSize: 12,
  fontWeight: 900,
  background: "#fafafa",
};

const tdStyle: CSSProperties = {
  padding: "10px 10px",
  verticalAlign: "top",
  borderTop: "1px solid #eeeeee",
  whiteSpace: "nowrap",
  color: "#111111",
  fontSize: 13,
};

const tdStrongStyle: CSSProperties = {
  ...tdStyle,
  fontWeight: 950,
};

const tdWideStyle: CSSProperties = {
  ...tdStyle,
  whiteSpace: "normal",
  minWidth: 360,
};

const rowStyle: CSSProperties = {
  borderTop: "1px solid #eeeeee",
};

const openButtonLinkStyle: CSSProperties = {
  display: "inline-flex",
  padding: "7px 11px",
  borderRadius: 999,
  background: "#0f2743",
  color: "#ffffff",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 900,
};

const miniOpenLinkStyle: CSSProperties = {
  color: "#0f2743",
  textDecoration: "none",
  fontWeight: 900,
};

const emptyStyle: CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#666666",
  background: "#ffffff",
  fontWeight: 700,
};

const loadingBoxStyle: CSSProperties = {
  padding: 18,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  background: "#fafafa",
  color: "#555555",
  fontWeight: 800,
};

const cardListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const mobileCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 14,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
};

const compactMobileCardStyle: CSSProperties = {
  ...mobileCardStyle,
  padding: 10,
  borderRadius: 12,
};

const mobileTitleStyle: CSSProperties = {
  marginTop: 4,
  color: "#333333",
  fontWeight: 900,
};

const infoLineStyle: CSSProperties = {
  marginBottom: 8,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  fontWeight: 800,
};

const infoValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111111",
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const noAccessBoxStyle: CSSProperties = {
  padding: 18,
  borderRadius: 12,
  border: "1px solid #f0c4c4",
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 900,
};

const noAccessSubTextStyle: CSSProperties = {
  marginTop: 6,
  color: "#555555",
  fontSize: 13,
  fontWeight: 700,
};

const legendDotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  display: "inline-block",
};

const legendPercentStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#666666",
  fontWeight: 800,
};

const workloadDonutBoxStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  gap: 18,
  alignItems: "center",
  padding: 16,
  border: "1px solid #eeeeee",
  borderRadius: 16,
  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
};

const mobileWorkloadDonutBoxStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
  alignItems: "center",
  padding: 12,
  border: "1px solid #eeeeee",
  borderRadius: 14,
  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
};

const workloadDonutWrapStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const workloadDonutRingStyle: CSSProperties = {
  width: 175,
  height: 175,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.06)",
};

const mobileWorkloadDonutRingStyle: CSSProperties = {
  ...workloadDonutRingStyle,
  width: 132,
  height: 132,
};

const workloadDonutCenterStyle: CSSProperties = {
  width: 108,
  height: 108,
  borderRadius: "50%",
  background: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.10)",
  textAlign: "center",
  padding: 10,
};

const mobileWorkloadDonutCenterStyle: CSSProperties = {
  ...workloadDonutCenterStyle,
  width: 84,
  height: 84,
  padding: 8,
};

const workloadDonutValueStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  color: "#111111",
  lineHeight: 1.2,
};

const mobileWorkloadDonutValueStyle: CSSProperties = {
  ...workloadDonutValueStyle,
  fontSize: 16,
};

const workloadDonutLabelStyle: CSSProperties = {
  marginTop: 3,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 900,
};

const workloadDonutSideStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  minWidth: 0,
};

const workloadTotalLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748b",
};

const workloadTotalValueStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 26,
  fontWeight: 950,
  color: "#111111",
  lineHeight: 1.15,
};

const mobileWorkloadTotalValueStyle: CSSProperties = {
  ...workloadTotalValueStyle,
  fontSize: 20,
};

const workloadMiniGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const mobileWorkloadMiniGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
};

const workloadMiniCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 12,
  background: "#ffffff",
};

const workloadMiniTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#333333",
  fontWeight: 900,
  marginBottom: 6,
};

const staffSlimListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const staffSlimRowStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 10,
  padding: "6px 8px",
  background: "#ffffff",
};

const mobileStaffSlimRowStyle: CSSProperties = {
  ...staffSlimRowStyle,
  padding: "6px 8px",
  borderRadius: 10,
};

const staffSlimHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 7,
};

const staffSlimNameWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  minWidth: 0,
};

const staffSlimRankStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 9,
  background: "#0f2743",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 950,
  flex: "0 0 auto",
  fontSize: 12,
};

const staffSlimNameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111111",
  lineHeight: 1.2,
};

const staffSlimMetaStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: "#666666",
  fontWeight: 800,
};

const staffSlimTotalStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111111",
  whiteSpace: "nowrap",
};

const staffSlimTrackStyle: CSSProperties = {
  width: "100%",
  height: 6,
  borderRadius: 999,
  background: "#eef2f7",
  overflow: "hidden",
};

const mobileStaffSlimTrackStyle: CSSProperties = {
  ...staffSlimTrackStyle,
  height: 6,
};

const staffSlimTotalBarStyle: CSSProperties = {
  height: "100%",
  display: "flex",
  borderRadius: 999,
  overflow: "hidden",
  minWidth: 0,
};

const staffSegmentCoreStyle: CSSProperties = {
  height: "100%",
  background: "#175cd3",
};

const staffSegmentSupportStyle: CSSProperties = {
  height: "100%",
  background: "#7e22ce",
};

const dailySummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const mobileDailySummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 10,
};

const dailySummaryCardStyle: CSSProperties = {
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.035)",
};

const mobileDailySummaryCardStyle: CSSProperties = {
  ...dailySummaryCardStyle,
  padding: 10,
};

const dailySummaryLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 900,
  marginBottom: 5,
};

const dailySummaryValueStyle: CSSProperties = {
  fontSize: 18,
  color: "#111111",
  fontWeight: 950,
};

const mobileDailySummaryValueStyle: CSSProperties = {
  ...dailySummaryValueStyle,
  fontSize: 16,
};

const dailySignalWrapStyle: CSSProperties = {
  marginTop: 8,
  marginBottom: 10,
};

const dailySignalSuccessStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#e6f4ea",
  color: "#067647",
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const dailySignalWarningStyle: CSSProperties = {
  ...dailySignalSuccessStyle,
  background: "#fff3cd",
  color: "#b54708",
};

const dailySignalPurpleStyle: CSSProperties = {
  ...dailySignalSuccessStyle,
  background: "#f1e4ff",
  color: "#7e22ce",
};

const dailySignalNeutralStyle: CSSProperties = {
  ...dailySignalSuccessStyle,
  background: "#f1f5f9",
  color: "#475467",
};

const dailyDetailListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const dailyDetailItemStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 10,
  background: "#ffffff",
};

const mobileDailyDetailItemStyle: CSSProperties = {
  ...dailyDetailItemStyle,
  padding: 9,
  borderRadius: 10,
};

const dailyDetailTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const dailyDetailTotalStyle: CSSProperties = {
  fontWeight: 950,
  color: "#111111",
  whiteSpace: "nowrap",
};

const dailyDetailMetaStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.45,
};

const dailyDetailSplitStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 6,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 800,
};

const mutedTextStyle: CSSProperties = {
  color: "#777777",
  fontWeight: 700,
};

const timeCaseListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const compactTimeCaseListStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const timeCaseItemStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: "8px 10px",
  background: "#ffffff",
};

const compactTimeCaseItemStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 10,
  padding: "7px 8px",
  background: "#ffffff",
};

const timeCaseHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 6,
};

const compactTimeCaseHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  marginBottom: 5,
};

const timeCaseLeftStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const timeCaseTextWrapStyle: CSSProperties = {
  minWidth: 0,
};

const timeCaseRankStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 22,
  borderRadius: 999,
  background: "#edf4ff",
  color: "#175cd3",
  fontSize: 11,
  fontWeight: 950,
  flex: "0 0 auto",
};

const compactTimeCaseRankStyle: CSSProperties = {
  ...timeCaseRankStyle,
  width: 26,
  height: 20,
  fontSize: 10,
};

const timeCaseTitleStyle: CSSProperties = {
  fontWeight: 950,
  color: "#111111",
  lineHeight: 1.25,
  fontSize: 14,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const compactTimeCaseTitleStyle: CSSProperties = {
  ...timeCaseTitleStyle,
  fontSize: 12,
};

const timeCaseClientStyle: CSSProperties = {
  marginTop: 1,
  color: "#666666",
  fontWeight: 700,
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const timeCaseTotalStyle: CSSProperties = {
  fontWeight: 950,
  color: "#111111",
  whiteSpace: "nowrap",
  fontSize: 13,
};

const compactTimeCaseTotalStyle: CSSProperties = {
  ...timeCaseTotalStyle,
  fontSize: 12,
};

const timeCaseBarTrackStyle: CSSProperties = {
  width: "100%",
  height: 6,
  background: "#eef2f7",
  borderRadius: 999,
  overflow: "hidden",
};

const compactTimeCaseBarTrackStyle: CSSProperties = {
  width: "100%",
  height: 5,
  background: "#eef2f7",
  borderRadius: 999,
  overflow: "hidden",
};

const timeCaseBarOuterStyle: CSSProperties = {
  height: "100%",
  display: "flex",
  borderRadius: 999,
  overflow: "hidden",
};

const timeCaseCorePartStyle: CSSProperties = {
  height: "100%",
  background: "#175cd3",
};

const timeCaseSupportPartStyle: CSSProperties = {
  height: "100%",
  background: "#7e22ce",
};

const timeCaseFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 5,
  color: "#666666",
  fontSize: 11,
  fontWeight: 800,
};

const compactTimeCaseFooterStyle: CSSProperties = {
  ...timeCaseFooterStyle,
  gap: 6,
  marginTop: 4,
  fontSize: 10,
};

const compactAllClearStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: 14,
  borderRadius: 14,
  border: "1px solid #b9dfc3",
  background: "linear-gradient(135deg, #f0fff4 0%, #e6f4ea 100%)",
};

const compactAllClearIconStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  background: "#18794e",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 950,
  flex: "0 0 auto",
};

const compactAllClearTitleStyle: CSSProperties = {
  color: "#067647",
  fontWeight: 950,
};

const compactAllClearSubStyle: CSSProperties = {
  marginTop: 3,
  color: "#555555",
  fontSize: 13,
  fontWeight: 700,
};

const actionSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const mobileActionSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 10,
};

const actionMiniCardStyle: CSSProperties = {
  borderRadius: 14,
  padding: 12,
  minHeight: 86,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.045)",
};

const mobileActionMiniCardStyle: CSSProperties = {
  ...actionMiniCardStyle,
  padding: 10,
  minHeight: 74,
  borderRadius: 12,
};

const actionMiniTopLineStyle: CSSProperties = {
  width: 34,
  height: 5,
  borderRadius: 999,
  marginBottom: 12,
};

const actionMiniNumberStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 950,
  color: "#111111",
  lineHeight: 1,
  marginBottom: 6,
};

const mobileActionMiniNumberStyle: CSSProperties = {
  ...actionMiniNumberStyle,
  fontSize: 20,
};

const actionMiniLabelStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111111",
};

const actionMiniDescriptionStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "#666666",
};

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  border: "1px solid #eeeeee",
  borderRadius: 14,
  padding: 12,
  background: "linear-gradient(135deg, #ffffff 0%, #fafafa 100%)",
};

const mobileActionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 10,
  background: "linear-gradient(135deg, #ffffff 0%, #fafafa 100%)",
};

const actionRowLeftStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  minWidth: 0,
};

const actionRowRightStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const mobileActionRowRightStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "space-between",
};

const actionCaseTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#111111",
  lineHeight: 1.4,
};

const actionMetaStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 13,
  fontWeight: 700,
  color: "#555555",
  lineHeight: 1.45,
};

const actionDateStyle: CSSProperties = {
  fontSize: 13,
  color: "#555555",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const actionBadgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const actionBadgeDangerStyle: CSSProperties = {
  background: "#ffe0e0",
  color: "#c0392b",
};

const actionBadgeWarningStyle: CSSProperties = {
  background: "#fff0c2",
  color: "#b26a00",
};

const actionBadgeSoonStyle: CSSProperties = {
  background: "#fff4d9",
  color: "#c96b00",
};

const actionBadgePurpleStyle: CSSProperties = {
  background: "#f1e4ff",
  color: "#7e22ce",
};

const singleColumnSectionStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 14,
  marginBottom: 18,
};
