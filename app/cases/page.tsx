"use client";

import AuthGuard from "../components/AuthGuard";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import AppTopNav from "../components/AppTopNav";
import { buildPermissions } from "../../lib/permissions";
import type { UserPermissions, UserRole } from "../../lib/permissions";
import {
  getDueStatus,
  getDueStatusLabel,
  getDueStatusScore,
  getDueStatusStyle,
  isActiveAlertStatus,
  isClosedStatus as isClosedDueStatus,
  type DueStatus,
} from "../../lib/dueStatus";

/* =========================================================
   TYPES
========================================================= */

type RiskLevel = DueStatus;
type RiskFilter = "all" | RiskLevel;

type CaseItem = {
  id: number;
  file_no?: string | null;
  client_id?: string | null;
  title?: string | null;
  client_name?: string | null;
  court_name?: string | null;
  case_number?: string | null;
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

type CaseTask = {
  case_id: number;
  task_type?: string | null;
  task_other?: string | null;
  due_date?: string | null;
  status?: string | null;
};

type CaseDeadline = {
  case_id: number;
  deadline_type?: string | null;
  deadline_other?: string | null;
  current_due_date?: string | null;
  status?: string | null;
};

type CaseTimeline = {
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
  case_id: number;
  party_label?: string | null;
  party_other?: string | null;
  final_due_date?: string | null;
  writ_request_date?: string | null;
  writ_issued_date?: string | null;
  status?: string | null;
};

type AlertCandidate = {
  case_id: number;
  level: RiskLevel;
  text: string;
  date: string;
  score: number;
};

type SortMode =
  | "highestRisk"
  | "latestUpdated"
  | "fileNo"
  | "nextAlertDate";

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
};

type ClientOption = {
  id: string;
  name: string;
};

/* =========================================================
   MAIN PAGE
========================================================= */

export default function CasesPage() {
  const router = useRouter();

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedCreateClientId, setSelectedCreateClientId] = useState("");
  const [alertItems, setAlertItems] = useState<AlertCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [storageFilter, setStorageFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("highestRisk");

  /* =========================================================
     RESPONSIVE WATCHER
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
     LOAD CURRENT USER PROFILE / PERMISSIONS
  ========================================================= */

  useEffect(() => {
    const loadCurrentUserProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

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
    };

    loadCurrentUserProfile();
  }, []);

  /* =========================================================
     LOAD CASES + REAL ALERTS
  ========================================================= */

  const fetchCases = async () => {
    try {
      setLoading(true);

      const { data: caseData, error: caseError } = await supabase
        .from("cases")
        .select("*")
        .order("created_at", { ascending: false });

      console.log("CASES DATA:", caseData);
      console.log("CASES ERROR:", caseError);

      if (caseError) {
        alert("SUPABASE ERROR:\n" + JSON.stringify(caseError, null, 2));
        return;
      }

      const baseCases = (caseData || []) as CaseItem[];
      const caseIds = baseCases.map((c) => c.id);

      if (caseIds.length === 0) {
        setCases([]);
        setAlertItems([]);
        return;
      }

      const [tasksRes, deadlinesRes, timelineRes, enforcementRes] =
        await Promise.all([
          supabase
            .from("case_tasks")
            .select("case_id, task_type, task_other, due_date, status")
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_deadlines")
            .select(
              "case_id, deadline_type, deadline_other, current_due_date, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_timeline")
            .select(
              "case_id, event_type, event_date, event_time, appointment_type, appointment_other, order_no, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_enforcements")
            .select(
              "case_id, party_label, party_other, final_due_date, writ_request_date, writ_issued_date, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),
        ]);

      if (tasksRes.error) {
        alert(
          "Load tasks for alerts failed:\n" +
            JSON.stringify(tasksRes.error, null, 2)
        );
        return;
      }

      if (deadlinesRes.error) {
        alert(
          "Load deadlines for alerts failed:\n" +
            JSON.stringify(deadlinesRes.error, null, 2)
        );
        return;
      }

      if (timelineRes.error) {
        alert(
          "Load timeline for alerts failed:\n" +
            JSON.stringify(timelineRes.error, null, 2)
        );
        return;
      }

      if (enforcementRes.error) {
        alert(
          "Load enforcement for alerts failed:\n" +
            JSON.stringify(enforcementRes.error, null, 2)
        );
        return;
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

      setAlertItems(allAlerts);

      const enrichedCases = baseCases.map((item) => {
        const alerts = alertMap.get(item.id) || [];
        const alert = alerts[0];

        if (!alert) {
          return {
            ...item,
            risk_level: "clear" as RiskLevel,
            next_alert_text: "-",
            next_alert_date: "",
            next_alerts: [],
          };
        }

        return {
          ...item,
          risk_level: alert.level,
          next_alert_text: alert.text,
          next_alert_date: alert.date,
          next_alerts: alerts,
        };
      });

      setCases(enrichedCases);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  useEffect(() => {
    const loadClients = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("LOAD CLIENTS ERROR:", error);
        return;
      }

      setClients((data || []) as ClientOption[]);
    };

    loadClients();
  }, []);

  /* =========================================================
     CREATE CASE WITH AUTO FILE NO
  ========================================================= */

  const createCase = async () => {
    if (!permissions.canCreateCase) {
      alert("คุณไม่มีสิทธิ์สร้างแฟ้มคดีใหม่");
      return;
    }

    const confirmed = window.confirm(
      "ต้องการสร้างแฟ้มคดีใหม่หรือไม่?\nระบบจะออก File No ให้อัตโนมัติ"
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const now = new Date().toISOString();

      const { data: fileNo, error: fileNoError } = await supabase.rpc(
        "generate_file_no"
      );

      if (fileNoError) {
        alert(
          "Generate File No failed:\n" + JSON.stringify(fileNoError, null, 2)
        );
        return;
      }

      if (!fileNo) {
        alert("Generate File No failed: no file number returned");
        return;
      }

      const selectedClient =
        clients.find((item) => item.id === selectedCreateClientId) || null;

      const { data: createdCase, error } = await supabase
        .from("cases")
        .insert([
          {
            file_no: fileNo,
            client_id: selectedClient?.id || null,
            title: "",
            client_name: selectedClient?.name || "",
            court_name: "",
            case_number: "",
            phase: "litigation",
            status: "Active",
            owner_name: "",
            physical_storage_type: "Cabinet",
            physical_storage_detail: "",
            created_at: now,
            updated_at: now,
          },
        ])
        .select("id, file_no")
        .single();

      if (error) {
        alert("Create case failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      alert(`สร้างแฟ้มคดีเรียบร้อยแล้ว\nFile No: ${createdCase.file_no}`);

      await fetchCases();

      router.push(`/cases/${createdCase.id}`);
    } catch (err: unknown) {
      console.error("CREATE CASE ERROR:", err);
      alert("Error creating case:\n" + JSON.stringify(err, null, 2));
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     RISK LOGIC
  ========================================================= */

  const getRiskLevel = (item: CaseItem): RiskLevel => {
    return item.risk_level || "clear";
  };

  /* =========================================================
     FILTER OPTIONS
  ========================================================= */

  const owners = useMemo(() => {
    const values = cases
      .map((c) => c.owner_name)
      .filter((v): v is string => !!v && v.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const statuses = useMemo(() => {
    const values = cases
      .map((c) => c.status)
      .filter((v): v is string => !!v && v.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const phases = useMemo(() => {
    const values = cases
      .map((c) => c.phase)
      .filter((v): v is string => !!v && v.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const storages = useMemo(() => {
    const values = cases
      .map((c) => c.physical_storage_type)
      .filter((v): v is string => !!v && v.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const clearFilters = () => {
    setSearchText("");
    setStatusFilter("All");
    setPhaseFilter("All");
    setOwnerFilter("All");
    setStorageFilter("All");
    setRiskFilter("all");
    setSortMode("highestRisk");
  };

  /* =========================================================
     FILTERED CASES
  ========================================================= */

  const filteredCases = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    let result = cases.filter((c) => {
      const searchableText = [
        c.file_no,
        c.title,
        c.client_name,
        c.owner_name,
        c.court_name,
        c.case_number,
        c.next_alert_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchSearch = !keyword || searchableText.includes(keyword);
      const matchStatus = statusFilter === "All" || c.status === statusFilter;
      const matchPhase = phaseFilter === "All" || c.phase === phaseFilter;
      const matchOwner = ownerFilter === "All" || c.owner_name === ownerFilter;
      const matchStorage =
        storageFilter === "All" || c.physical_storage_type === storageFilter;
      const matchRisk = riskFilter === "all" || getRiskLevel(c) === riskFilter;

      return (
        matchSearch &&
        matchStatus &&
        matchPhase &&
        matchOwner &&
        matchStorage &&
        matchRisk
      );
    });

    result = [...result].sort((a, b) => {
      if (sortMode === "highestRisk") {
        const riskDiff =
          getDueStatusScore(getRiskLevel(a)) - getDueStatusScore(getRiskLevel(b));
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
    statusFilter,
    phaseFilter,
    ownerFilter,
    storageFilter,
    riskFilter,
    sortMode,
  ]);

  /* =========================================================
     SUMMARY
  ========================================================= */

  const summary = useMemo(() => {
    const overdue = alertItems.filter((item) => item.level === "overdue").length;
    const today = alertItems.filter((item) => item.level === "today").length;
    const dueSoon = alertItems.filter((item) => item.level === "dueSoon").length;
    const upcoming = alertItems.filter((item) => item.level === "upcoming").length;
    const planned = alertItems.filter((item) => item.level === "planned").length;

    const caseIdsWithAlert = new Set(alertItems.map((item) => item.case_id));
    const clear = cases.filter((item) => !caseIdsWithAlert.has(item.id)).length;
    const active = cases.filter((item) => item.status === "Active").length;

    return {
      total: cases.length,
      active,
      overdue,
      today,
      dueSoon,
      upcoming,
      planned,
      clear,
    };
  }, [cases, alertItems]);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav title="Cases" subtitle="Case Command Center" activePage="cases" />

        <section style={heroPanelStyle}>
          <div>
            <div style={eyebrowStyle}>VP CASE SYSTEM</div>
            <h1 style={heroTitleStyle}>Case Command Center</h1>
            <div style={heroSubtitleStyle}>
              ศูนย์รวมแฟ้มคดี สถานะ ความเสี่ยง กำหนดเวลา และงานที่ต้องติดตาม
            </div>
          </div>

          <div style={heroActionWrapStyle}>
            <button
              type="button"
              onClick={fetchCases}
              style={secondaryButtonStyle}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            {permissions.canCreateCase && (
              <div style={createClientSelectWrapStyle}>
                <label style={createClientLabelStyle}>Client</label>
                <select
                  value={selectedCreateClientId}
                  onChange={(event) => setSelectedCreateClientId(event.target.value)}
                  style={createClientSelectStyle}
                >
                  <option value="">No linked client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {clients.length === 0 && (
                  <div style={createClientHintStyle}>No clients yet. Create Client first.</div>
                )}
              </div>
            )}

            {permissions.canCreateCase && (
              <button
                type="button"
                onClick={createCase}
                style={primaryButtonStyle}
                disabled={saving}
              >
                {saving ? "Creating..." : "+ Add Case"}
              </button>
            )}
          </div>
        </section>

        <section style={blockStyle}>
          <div style={isCompact ? compactSummaryGridStyle : summaryGridStyle}>
            <SummaryCard
              count={summary.total}
              label="Total Cases"
              subLabel="แฟ้มทั้งหมด"
              background="#f8fafc"
              active={riskFilter === "all"}
              onClick={() => setRiskFilter("all")}
            />

            <SummaryCard
              count={summary.overdue}
              label="Overdue"
              subLabel="เกินกำหนด"
              background="#fde2e2"
              active={riskFilter === "overdue"}
              onClick={() => setRiskFilter("overdue")}
            />

            <SummaryCard
              count={summary.today}
              label="Today"
              subLabel="ครบกำหนดวันนี้"
              background="#fff3c4"
              active={riskFilter === "today"}
              onClick={() => setRiskFilter("today")}
            />

            <SummaryCard
              count={summary.dueSoon}
              label="Due Soon"
              subLabel="อีก 1-4 วัน"
              background="#ccfbf1"
              active={riskFilter === "dueSoon"}
              onClick={() => setRiskFilter("dueSoon")}
            />

            <SummaryCard
              count={summary.upcoming}
              label="Upcoming"
              subLabel="อีก 5-15 วัน"
              background="#dbeafe"
              active={riskFilter === "upcoming"}
              onClick={() => setRiskFilter("upcoming")}
            />

            <SummaryCard
              count={summary.planned}
              label="Planned"
              subLabel="อีก 16-30 วัน"
              background="#ede9fe"
              active={riskFilter === "planned"}
              onClick={() => setRiskFilter("planned")}
            />

            <SummaryCard
              count={summary.clear}
              label="Clear"
              subLabel="ยังไม่มี Alert"
              background="#e4f4e9"
              active={riskFilter === "clear"}
              onClick={() => setRiskFilter("clear")}
            />
          </div>
        </section>

        <section style={filterPanelStyle}>
          <div style={filterHeaderStyle}>
            <div>
              <h3 style={filterTitleStyle}>Search & Filters</h3>
              <div style={filterSubtitleStyle}>
                ค้นหา กรอง และเรียงลำดับแฟ้มคดีตามความเสี่ยง
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
                placeholder="Search file no, title, client, black case number"
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
                <option value="upcoming">Upcoming</option>
                <option value="planned">Planned</option>
                <option value="future">Future</option>
                <option value="clear">Clear</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={inputStyle}
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
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
                {phases.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Owner</label>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                style={inputStyle}
              >
                {owners.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Storage</label>
              <select
                value={storageFilter}
                onChange={(e) => setStorageFilter(e.target.value)}
                style={inputStyle}
              >
                {storages.map((s) => (
                  <option key={s}>{s}</option>
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

        <section style={listPanelStyle}>
          <div style={listHeaderStyle}>
            <div>
              <h3 style={listTitleStyle}>Case List</h3>
              <div style={resultTextStyle}>
                Showing {filteredCases.length} of {cases.length} case(s)
              </div>
            </div>

            {riskFilter !== "all" && (
              <div style={activeFilterBadgeStyle}>
                Risk Filter: {renderRiskFilterLabel(riskFilter)}
              </div>
            )}
          </div>

          {loading ? (
            <div style={loadingBoxStyle}>Loading cases and alerts...</div>
          ) : isCompact ? (
            <CaseCardList cases={filteredCases} getRiskLevel={getRiskLevel} />
          ) : (
            <CaseTable cases={filteredCases} getRiskLevel={getRiskLevel} />
          )}
        </section>
      </main>
    </AuthGuard>
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
      text: `Task: ${taskText}`,
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
      text: `Deadline: ${deadlineText}`,
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
      text: `Timeline: นัดที่ ${event.order_no || "-"} ${appointmentText}`,
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
      text: `Enforcement: ขอออกหมายบังคับคดี (${partyText})`,
      date: item.final_due_date,
      score: getRiskScoreFromLevel(level),
    });
  });

  return candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.date.localeCompare(b.date);
  });
}

function buildAlertMapFromCandidates(candidates: AlertCandidate[]) {
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

function renderDeadlineTypeForAlert(
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

function getDateRiskLevel(dateText: string): RiskLevel {
  return getDueStatus(dateText);
}

function getRiskScoreFromLevel(level: RiskLevel) {
  return getDueStatusScore(level);
}

function isTaskDone(status?: string | null) {
  return isClosedAlertStatus(status);
}

function isDeadlineDone(status?: string | null) {
  const value = (status || "").toLowerCase();

  return (
    isClosedAlertStatus(status) ||
    value === "filed" ||
    value === "submitted"
  );
}

function isTimelineDone(status?: string | null) {
  return isClosedAlertStatus(status);
}

function isEnforcementWritDone(item: CaseEnforcement) {
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

function isClosedAlertStatus(status?: string | null) {
  return isClosedDueStatus(status);
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

/* =========================================================
   TABLE VIEW
========================================================= */

function CaseTable({
  cases,
  getRiskLevel,
}: {
  cases: CaseItem[];
  getRiskLevel: (item: CaseItem) => RiskLevel;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>File No</th>
            <th style={thStyle}>Title</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Owner</th>
            <th style={thStyle}>Phase</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Storage</th>
            <th style={thStyle}>Location</th>
            <th style={thStyle}>Risk</th>
            <th style={thStyle}>Next Alert</th>
            <th style={thStyle}>Last Updated</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {cases.map((c) => (
            <tr key={c.id} style={rowStyle}>
              <td style={tdStyle}>
                <Link href={`/cases/${c.id}`} style={fileNoLinkStyle}>
                  {c.file_no || "-"}
                </Link>
              </td>
              <td style={tdStyle}>{c.title || "-"}</td>
              <td style={tdStyle}>{c.client_name || "-"}</td>
              <td style={tdStyle}>{c.owner_name || "-"}</td>
              <td style={tdStyle}>{renderPhase(c.phase)}</td>
              <td style={tdStyle}>{c.status || "-"}</td>
              <td style={tdStyle}>{c.physical_storage_type || "-"}</td>
              <td style={tdStyle}>{c.physical_storage_detail || "-"}</td>
              <td style={tdStyle}>
                <RiskBadge level={getRiskLevel(c)} />
              </td>
              <td style={tdStyle}>
                <NextAlertList alerts={c.next_alerts || []} />
              </td>
              <td style={tdStyle}>{formatDateTime(c.updated_at)}</td>
              <td style={tdStyle}>
                <Link href={`/cases/${c.id}`} style={openButtonLinkStyle}>
                  Open
                </Link>
              </td>
            </tr>
          ))}

          {cases.length === 0 && (
            <tr>
              <td colSpan={12} style={emptyTableCellStyle}>
                No cases found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   MOBILE / TABLET CARD VIEW
========================================================= */

function CaseCardList({
  cases,
  getRiskLevel,
}: {
  cases: CaseItem[];
  getRiskLevel: (item: CaseItem) => RiskLevel;
}) {
  if (cases.length === 0) {
    return <div style={emptyCardStyle}>No cases found.</div>;
  }

  return (
    <div style={caseCardListStyle}>
      {cases.map((c) => (
        <div key={c.id} style={caseCardStyle}>
          <div style={caseCardHeaderStyle}>
            <div>
              <Link href={`/cases/${c.id}`} style={fileNoLinkStyle}>
                {c.file_no || "-"}
              </Link>
              <div style={cardTitleStyle}>{c.title || "Untitled case"}</div>
            </div>

            <RiskBadge level={getRiskLevel(c)} />
          </div>

          <div style={caseCardGridStyle}>
            <InfoLine label="Client" value={c.client_name || "-"} />
            <InfoLine label="Owner" value={c.owner_name || "-"} />
            <InfoLine label="Status" value={c.status || "-"} />
            <InfoLine label="Phase" value={renderPhase(c.phase)} />
            <InfoLine
              label="Storage"
              value={c.physical_storage_type || "-"}
            />
            <InfoLine
              label="Location"
              value={c.physical_storage_detail || "-"}
            />
            <InfoLine label="Black Case No." value={c.case_number || "-"} />
            <InfoLine label="Updated" value={formatDateTime(c.updated_at)} />
          </div>

          <div style={mobileAlertBoxStyle}>
            <div style={infoLabelStyle}>Next Alert</div>
            <NextAlertList alerts={c.next_alerts || []} />
          </div>

          <div style={cardActionStyle}>
            <Link href={`/cases/${c.id}`} style={openButtonLinkStyle}>
              Open case
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SummaryCard({
  count,
  label,
  subLabel,
  background,
  active,
  onClick,
}: {
  count: number;
  label: string;
  subLabel: string;
  background: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...summaryCardStyle,
        background,
        ...(active ? summaryCardActiveStyle : {}),
      }}
    >
      <div style={summaryNumberStyle}>{count}</div>
      <div style={summaryLabelTextStyle}>{label}</div>
      <div style={summarySubLabelStyle}>{subLabel}</div>
    </button>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span style={{ ...riskBadgeBaseStyle, ...getDueStatusStyle(level) }}>
      {getDueStatusLabel(level)}
    </span>
  );
}

function NextAlertList({ alerts }: { alerts: AlertCandidate[] }) {
  if (alerts.length === 0) {
    return <div style={alertTextStyle}>-</div>;
  }

  const visibleAlerts = alerts.slice(0, 3);
  const moreCount = alerts.length - visibleAlerts.length;

  return (
    <div style={nextAlertListStyle}>
      {visibleAlerts.map((alert, index) => (
        <div key={`${alert.case_id}-${alert.text}-${alert.date}-${index}`} style={nextAlertItemStyle}>
          <div style={nextAlertHeaderStyle}>
            <RiskBadge level={alert.level} />
            <span style={subTextStyle}>{formatDisplayDate(alert.date)}</span>
          </div>
          <div style={alertTextStyle}>{alert.text}</div>
        </div>
      ))}
      {moreCount > 0 && (
        <div style={subTextStyle}>+{moreCount} more</div>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function renderRiskFilterLabel(value: RiskFilter) {
  if (value === "all") return "All";
  return getDueStatusLabel(value);
}

function renderPhase(phase?: string | null) {
  if (!phase) return "-";
  if (phase === "litigation") return "Litigation";
  if (phase === "enforcement") return "Enforcement";
  return phase;
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
  marginTop: 18,
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

const heroActionWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const createClientSelectWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 220,
};

const createClientLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#333333",
};

const createClientSelectStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  background: "white",
  color: "#111111",
  colorScheme: "light",
};

const createClientHintStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#9a3412",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
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
  textAlign: "left",
  cursor: "pointer",
  boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
};

const summaryCardActiveStyle: React.CSSProperties = {
  outline: "3px solid rgba(15, 39, 67, 0.18)",
  border: "1px solid #0f2743",
  transform: "translateY(-1px)",
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 950,
  marginBottom: 8,
  color: "#111111",
};

const summaryLabelTextStyle: React.CSSProperties = {
  fontWeight: 900,
  color: "#222222",
};

const summarySubLabelStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "#666666",
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
  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1.2fr",
  gap: 12,
  alignItems: "end",
};

const compactFilterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
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

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#000000",
  color: "#ffffff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 900,
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

const listPanelStyle: React.CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 16,
  padding: 16,
  background: "#ffffff",
};

const listHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const listTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 900,
  color: "#111111",
};

const resultTextStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontWeight: 700,
  fontSize: 13,
};

const activeFilterBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "7px 12px",
  borderRadius: 999,
  background: "#edf4ff",
  color: "#175cd3",
  border: "1px solid #b2ccff",
  fontSize: 13,
  fontWeight: 900,
};

const loadingBoxStyle: React.CSSProperties = {
  padding: 18,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  background: "#fafafa",
  color: "#555555",
  fontWeight: 800,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1120,
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
  maxWidth: 300,
  whiteSpace: "normal",
  fontWeight: 700,
  lineHeight: 1.45,
};

const nextAlertListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 220,
};

const nextAlertItemStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const nextAlertHeaderStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const subTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginTop: 2,
};

const riskBadgeBaseStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: "nowrap",
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

const emptyTableCellStyle: React.CSSProperties = {
  padding: 18,
  color: "#666666",
  fontWeight: 700,
};

const caseCardListStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};

const caseCardStyle: React.CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 14,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
};

const caseCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
};

const fileNoLinkStyle: React.CSSProperties = {
  fontWeight: 950,
  fontSize: 15,
  color: "#12355b",
  textDecoration: "none",
};

const cardTitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#333333",
  fontWeight: 900,
};

const caseCardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const mobileAlertBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
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
};

const cardActionStyle: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
  fontWeight: 900,
};

const emptyCardStyle: React.CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 16,
  color: "#666666",
  background: "#ffffff",
  fontWeight: 700,
};
