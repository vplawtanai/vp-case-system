"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import AppTopNav from "../components/AppTopNav";

/* =========================================================
   TYPES
========================================================= */

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

  risk_level?: string | null;
  next_alert_text?: string | null;
  next_alert_date?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
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

  /* =========================================================
     STATE
  ========================================================= */

  const [cases, setCases] = useState<CaseItem[]>([]);
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
     LOAD CASES
  ========================================================= */

  const fetchCases = async () => {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });

    console.log("CASES DATA:", data);
    console.log("CASES ERROR:", error);

    if (error) {
      alert("SUPABASE ERROR:\n" + JSON.stringify(error, null, 2));
      return;
    }

    setCases((data || []) as CaseItem[]);
  };

  useEffect(() => {
    fetchCases();
  }, []);

  /* =========================================================
     CREATE CASE WITH AUTO FILE NO
     - ถามยืนยันก่อนสร้าง
     - สร้างเลขแฟ้ม
     - เข้าไปกรอกรายละเอียดในหน้า detail
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
          "Generate File No failed:\n" +
            JSON.stringify(fileNoError, null, 2)
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

  const getRiskLevel = (item: CaseItem) => {
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

        return (a.next_alert_date || "").localeCompare(
          b.next_alert_date || ""
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
  ========================================================= */

  const summary = useMemo(() => {
    return {
      overdue: cases.filter((c) => getRiskLevel(c) === "overdue").length,
      today: cases.filter((c) => getRiskLevel(c) === "today").length,
      dueSoon: cases.filter((c) => getRiskLevel(c) === "dueSoon").length,
      clear: cases.filter((c) => getRiskLevel(c) === "clear").length,
    };
  }, [cases]);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <main style={pageStyle}>
      <AppTopNav title="Cases" subtitle="Case list" activePage="cases" />

      {/* SUMMARY BLOCK */}
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

      {/* FILTER + ACTION BLOCK */}
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

      {/* CASE LIST BLOCK */}
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
   TABLE VIEW
========================================================= */

function CaseTable({
  cases,
  getRiskLevel,
}: {
  cases: CaseItem[];
  getRiskLevel: (item: CaseItem) => string;
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
                  <div style={subTextStyle}>{c.next_alert_date}</div>
                )}
              </td>
              <td style={tdStyle}>{formatDate(c.updated_at)}</td>
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
  getRiskLevel: (item: CaseItem) => string;
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
            <InfoLine label="Updated" value={formatDate(c.updated_at)} />
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
      <div>{label}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
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

function formatDate(value?: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("th-TH");
  } catch {
    return value;
  }
}

/* =========================================================
   STYLES
========================================================= */

const pageStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 1440,
  margin: "0 auto",
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
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  marginBottom: 8,
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
  color: "#333",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
  background: "white",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "black",
  color: "white",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const resultTextStyle: React.CSSProperties = {
  marginBottom: 14,
  color: "#555",
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
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  verticalAlign: "top",
  borderTop: "1px solid #eee",
  whiteSpace: "nowrap",
};

const rowStyle: React.CSSProperties = {
  borderTop: "1px solid #eee",
};

const subTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#777",
};

const riskBadgeBaseStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
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
};

const caseCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
};

const fileNoLinkStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 16,
};

const cardTitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#555",
};

const caseCardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#777",
};

const infoValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  wordBreak: "break-word",
};

const cardActionStyle: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #eee",
};

const emptyCardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  color: "#666",
};