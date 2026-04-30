"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import AppTopNav from "../components/AppTopNav";

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

  enforcement_ready?: boolean | null;
  enforcement_ready_text?: string | null;
  enforcement_ready_date?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type SortMode =
  | "highestRisk"
  | "latestUpdated"
  | "fileNo"
  | "nextAlertDate";

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [storageFilter, setStorageFilter] = useState("All");
  const [sortMode, setSortMode] = useState<SortMode>("highestRisk");

  const [form, setForm] = useState({
    title: "",
    client_name: "",
    court_name: "",
    case_number: "",
    phase: "litigation",
    status: "Active",
    owner_name: "",
  });

  const fetchCases = async () => {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });

    console.log("CASES DATA:", data);
    console.log("CASES ERROR:", error);

    if (error) {
  alert(
    "SUPABASE ERROR:\n" +
      JSON.stringify(error, null, 2)
  );
  return;
}

    setCases((data || []) as CaseItem[]);
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const createCase = async () => {
    if (!form.title || !form.client_name) {
      alert("กรอก Title และ Client ก่อน");
      return;
    }

    try {
      setSaving(true);

      const now = new Date().toISOString();

      const { error } = await supabase.from("cases").insert([
        {
          file_no: "TEMP",
          title: form.title,
          client_name: form.client_name,
          court_name: form.court_name,
          case_number: form.case_number,
          phase: form.phase,
          status: form.status,
          owner_name: form.owner_name,
          risk_level: "clear",
          next_alert_text: "-",
          next_alert_date: null,
          enforcement_ready: false,
          created_at: now,
          updated_at: now,
        },
      ]);

      if (error) throw error;

      setForm({
        title: "",
        client_name: "",
        court_name: "",
        case_number: "",
        phase: "litigation",
        status: "Active",
        owner_name: "",
      });

      setShowForm(false);
      await fetchCases();
    } catch (err) {
      console.error(err);
      alert("Error creating case");
    } finally {
      setSaving(false);
    }
  };

  const getRiskLevel = (item: CaseItem) => {
    return item.risk_level || "clear";
  };

  const getRiskScore = (item: CaseItem) => {
    const level = getRiskLevel(item);

    if (level === "overdue") return 1;
    if (level === "today") return 2;
    if (level === "dueSoon") return 3;
    if (item.enforcement_ready) return 4;

    return 5;
  };

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
        storageFilter === "All" ||
        c.physical_storage_type === storageFilter;

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

  const summary = useMemo(() => {
    return {
      overdue: cases.filter((c) => getRiskLevel(c) === "overdue").length,
      today: cases.filter((c) => getRiskLevel(c) === "today").length,
      dueSoon: cases.filter((c) => getRiskLevel(c) === "dueSoon").length,
      clear: cases.filter((c) => getRiskLevel(c) === "clear").length,
    };
  }, [cases]);

  return (
    <main style={{ padding: 24 }}>
      <AppTopNav title="Cases" subtitle="Case list" activePage="cases" />

      <div style={summaryGridStyle}>
        <SummaryCard
          count={summary.overdue}
          label="Overdue"
          background="#fde2e2"
        />
        <SummaryCard count={summary.today} label="Today" background="#fff3c4" />
        <SummaryCard
          count={summary.dueSoon}
          label="Due Soon"
          background="#fff8df"
        />
        <SummaryCard count={summary.clear} label="Clear" background="#e4f4e9" />
      </div>

      <div style={filterGridStyle}>
        <div>
          <label style={labelStyle}>Search</label>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search file no, title, client, case number"
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
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              style={primaryButtonStyle}
            >
              + Add Case
            </button>
          ) : (
            <button
              onClick={() => setShowForm(false)}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div style={formCardStyle}>
          <h3 style={{ marginTop: 0 }}>Add Case</h3>

          <div style={formGridStyle}>
            <input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={inputStyle}
            />

            <input
              placeholder="Client"
              value={form.client_name}
              onChange={(e) =>
                setForm({ ...form, client_name: e.target.value })
              }
              style={inputStyle}
            />

            <input
              placeholder="Court"
              value={form.court_name}
              onChange={(e) =>
                setForm({ ...form, court_name: e.target.value })
              }
              style={inputStyle}
            />

            <input
              placeholder="Case Number"
              value={form.case_number}
              onChange={(e) =>
                setForm({ ...form, case_number: e.target.value })
              }
              style={inputStyle}
            />

            <input
              placeholder="Owner"
              value={form.owner_name}
              onChange={(e) =>
                setForm({ ...form, owner_name: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <button
            onClick={createCase}
            style={{ ...primaryButtonStyle, marginTop: 16 }}
            disabled={saving}
          >
            {saving ? "Saving..." : "Create Case"}
          </button>
        </div>
      )}

      <div style={resultTextStyle}>
        Showing {filteredCases.length} of {cases.length} case(s)
      </div>

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
              <th style={thStyle}>Enforcement</th>
              <th style={thStyle}>Last Updated</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredCases.map((c) => (
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
                <td style={tdStyle}>
                  {c.enforcement_ready ? (
                    <span style={enforcementReadyStyle}>Ready</span>
                  ) : (
                    <span style={subTextStyle}>-</span>
                  )}
                </td>
                <td style={tdStyle}>{formatDate(c.updated_at)}</td>
                <td style={tdStyle}>
                  <Link href={`/cases/${c.id}`}>Open</Link>
                </td>
              </tr>
            ))}

            {filteredCases.length === 0 && (
              <tr>
                <td colSpan={13} style={{ padding: 16, color: "#666" }}>
                  No cases found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

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

// ===== STYLE =====

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 20,
  marginBottom: 24,
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
  marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#333",
};

const formCardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 16,
  borderRadius: 10,
  marginBottom: 20,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "white",
  border: "1px solid #ccc",
  borderRadius: 8,
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
  minWidth: 1200,
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

const enforcementReadyStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#dff3ff",
  color: "#006c9c",
  fontSize: 13,
  fontWeight: 700,
};