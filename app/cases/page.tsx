"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import AppTopNav from "../components/AppTopNav";

/* =========================================================
   TYPES
========================================================= */

type RiskLevel = "overdue" | "today" | "dueSoon" | "clear";

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

  risk_level?: RiskLevel | null;
  next_alert_text?: string | null;
  next_alert_date?: string | null;

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

/* =========================================================
   MAIN PAGE
========================================================= */

export default function CasesPage() {
  const router = useRouter();

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [alertItems, setAlertItems] = useState<AlertCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [storageFilter, setStorageFilter] = useState("All");
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
     LOAD CASES + REAL ALERTS
  ========================================================= */

  const fetchCases = async () => {
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

    const [tasksRes, deadlinesRes, timelineRes] = await Promise.all([
      supabase
        .from("case_tasks")
        .select("case_id, task_type, task_other, due_date, status")
        .in("case_id", caseIds),

      supabase
        .from("case_deadlines")
        .select(
          "case_id, deadline_type, deadline_other, current_due_date, status"
        )
        .in("case_id", caseIds),

      supabase
  .from("case_timeline")
  .select(
    "case_id, event_type, event_date, event_time, appointment_type, appointment_other, order_no, status"
  )
  .in("case_id", caseIds),
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

    const tasks = (tasksRes.data || []) as CaseTask[];
    const deadlines = (deadlinesRes.data || []) as CaseDeadline[];
    const timeline = (timelineRes.data || []) as CaseTimeline[];

    const allAlerts = buildAlertCandidates(tasks, deadlines, timeline);
    const alertMap = buildAlertMapFromCandidates(allAlerts);

    setAlertItems(allAlerts);

    const enrichedCases = baseCases.map((item) => {
      const alert = alertMap.get(item.id);

      if (!alert) {
        return {
          ...item,
          risk_level: "clear" as RiskLevel,
          next_alert_text: "-",
          next_alert_date: "",
        };
      }

      return {
        ...item,
        risk_level: alert.level,
        next_alert_text: alert.text,
        next_alert_date: alert.date,
      };
    });

    setCases(enrichedCases);
  };

  useEffect(() => {
    fetchCases();
  }, []);

  /* =========================================================
     CREATE CASE WITH AUTO FILE NO
  ========================================================= */

  const createCase = async () => {
    const confirmed = window.confirm(
      "ต้องการสร้างแฟ้มคดีใหม่หรือไม่?\nระบบจะออก File No ให้อัตโนมัติ"
    );

    if (!confirmed) {
      return;
    }

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

      const { data: createdCase, error } = await supabase
        .from("cases")
        .insert([
          {
            file_no: fileNo,
            title: "",
            client_name: "",
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
    } catch (err: any) {
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

  const getRiskScore = (item: CaseItem) => {
    const level = getRiskLevel(item);

    if (level === "overdue") return 1;
    if (level === "today") return 2;
    if (level === "dueSoon") return 3;

    return 5;
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

      return (
        matchSearch &&
        matchStatus &&
        matchPhase &&
        matchOwner &&
        matchStorage
      );
    });

    result = [...result].sort((a, b) => {
      if (sortMode === "highestRisk") {
        const riskDiff = getRiskScore(a) - getRiskScore(b);
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
    sortMode,
  ]);

  /* =========================================================
     SUMMARY
     - Overdue / Today / Due Soon = จำนวน Alert จริง
     - Clear = จำนวนคดีที่ไม่มี Alert
  ========================================================= */

  const summary = useMemo(() => {
    const overdue = alertItems.filter((item) => item.level === "overdue").length;
    const today = alertItems.filter((item) => item.level === "today").length;
    const dueSoon = alertItems.filter((item) => item.level === "dueSoon").length;

    const caseIdsWithAlert = new Set(alertItems.map((item) => item.case_id));
    const clear = cases.filter((item) => !caseIdsWithAlert.has(item.id)).length;

    return {
      overdue,
      today,
      dueSoon,
      clear,
    };
  }, [cases, alertItems]);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <main style={pageStyle}>
      <AppTopNav title="Cases" subtitle="Case list" activePage="cases" />

      <section style={blockStyle}>
        <div style={isCompact ? compactSummaryGridStyle : summaryGridStyle}>
          <SummaryCard
            count={summary.overdue}
            label="Overdue"
            background="#fde2e2"
          />
          <SummaryCard
            count={summary.today}
            label="Today"
            background="#fff3c4"
          />
          <SummaryCard
            count={summary.dueSoon}
            label="Due Soon"
            background="#fff8df"
          />
          <SummaryCard
            count={summary.clear}
            label="Clear"
            background="#e4f4e9"
          />
        </div>
      </section>

      <section style={blockStyle}>
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

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={createCase}
              style={{
                ...primaryButtonStyle,
                width: isCompact ? "100%" : undefined,
              }}
              disabled={saving}
            >
              {saving ? "Creating..." : "+ Add Case"}
            </button>
          </div>
        </div>
      </section>

      <section style={blockStyle}>
        <div style={resultTextStyle}>
          Showing {filteredCases.length} of {cases.length} case(s)
        </div>

        {isCompact ? (
          <CaseCardList cases={filteredCases} getRiskLevel={getRiskLevel} />
        ) : (
          <CaseTable cases={filteredCases} getRiskLevel={getRiskLevel} />
        )}
      </section>
    </main>
  );
}

/* =========================================================
   ALERT BUILDER
========================================================= */

function buildAlertCandidates(
  tasks: CaseTask[],
  deadlines: CaseDeadline[],
  timeline: CaseTimeline[]
) {
  const candidates: AlertCandidate[] = [];

  tasks.forEach((task) => {
    if (!task.due_date) return;
    if (isTaskDone(task.status)) return;

    const level = getDateRiskLevel(task.due_date);
    if (level === "clear") return;

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
    if (level === "clear") return;

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
    if (level === "clear") return;

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

  if (deadlineType === "อื่นๆ") return deadlineOther || "กำหนดเวลาอื่นๆ";

  return deadlineType;
}

function getDateRiskLevel(dateText: string): RiskLevel {
  const diffDays = diffDaysFromToday(dateText);

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 3) return "dueSoon";

  return "clear";
}

function getRiskScoreFromLevel(level: RiskLevel) {
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

function isTaskDone(status?: string | null) {
  const value = (status || "").toLowerCase();

  return value === "done" || value === "cancelled";
}

function isDeadlineDone(status?: string | null) {
  const value = (status || "").toLowerCase();

  return (
    value === "done" ||
    value === "filed" ||
    value === "submitted" ||
    value === "cancelled"
  );
}
function isTimelineDone(status?: string | null) {

  const value = (status || "").toLowerCase();

  return value === "done" || value === "cancelled";

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
                <Link href={`/cases/${c.id}`}>{c.file_no || "-"}</Link>
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
                <div>{c.next_alert_text || "-"}</div>
                {c.next_alert_date && (
                  <div style={subTextStyle}>
                    {formatDisplayDate(c.next_alert_date)}
                  </div>
                )}
              </td>
              <td style={tdStyle}>{formatDateTime(c.updated_at)}</td>
              <td style={tdStyle}>
                <Link href={`/cases/${c.id}`}>Open</Link>
              </td>
            </tr>
          ))}

          {cases.length === 0 && (
            <tr>
              <td colSpan={12} style={{ padding: 16, color: "#666" }}>
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
            <InfoLine
              label="Black Case No."
              value={c.case_number || "-"}
            />
            <InfoLine label="Updated" value={formatDateTime(c.updated_at)} />
          </div>

          <div style={mobileAlertBoxStyle}>
            <div style={infoLabelStyle}>Next Alert</div>
            <div style={infoValueStyle}>{c.next_alert_text || "-"}</div>
            {c.next_alert_date && (
              <div style={subTextStyle}>
                {formatDisplayDate(c.next_alert_date)}
              </div>
            )}
          </div>

          <div style={cardActionStyle}>
            <Link href={`/cases/${c.id}`}>Open case</Link>
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
  background,
}: {
  count: number;
  label: string;
  background: string;
}) {
  return (
    <div style={{ ...summaryCardStyle, background }}>
      <div style={summaryNumberStyle}>{count}</div>
      <div style={summaryLabelTextStyle}>{label}</div>
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
    <div>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

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
  marginBottom: 20,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 20,
};

const compactSummaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
  gap: 10,
  marginTop: 20,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 18,
  minHeight: 86,
  color: "#111111",
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  marginBottom: 8,
  color: "#111111",
};

const summaryLabelTextStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#333333",
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto",
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
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
  background: "white",
  color: "#111111",
  colorScheme: "light",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "black",
  color: "white",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const resultTextStyle: React.CSSProperties = {
  marginBottom: 14,
  color: "#555555",
  fontWeight: 600,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
  color: "#111111",
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  verticalAlign: "top",
  borderTop: "1px solid #eee",
  whiteSpace: "nowrap",
  color: "#111111",
};

const rowStyle: React.CSSProperties = {
  borderTop: "1px solid #eee",
};

const subTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginTop: 2,
};

const riskBadgeBaseStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
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

const caseCardListStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};

const caseCardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
  color: "#111111",
};

const caseCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
};

const fileNoLinkStyle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
  color: "#12355b",
};

const cardTitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#333333",
  fontWeight: 800,
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
  fontWeight: 700,
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
  borderTop: "1px solid #eee",
  fontWeight: 800,
};

const emptyCardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  color: "#666",
};