"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import AppTopNav from "../components/AppTopNav";

type CaseItem = {
  id: number;
  file_no?: string;
  title?: string;
  client_name?: string;
  court_name?: string;
  case_number?: string;
  phase?: string;
  status?: string;
  owner_name?: string;
  created_at?: string;
  updated_at?: string;
};

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    title: "",
    client_name: "",
    court_name: "",
    case_number: "",
    phase: "litigation",
    status: "Active",
    owner_name: "",
  });

  // =========================
  // 🔥 LOAD CASES
  // =========================
  const fetchCases = async () => {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });

    console.log("DATA:", data);
    console.log("ERROR:", error);

    if (error) {
      console.error("SUPABASE ERROR:", error);
      return;
    }

    setCases(data || []);
  };

  useEffect(() => {
    fetchCases();
  }, []);

  // =========================
  // 🔥 CREATE CASE
  // =========================
  const createCase = async () => {
    if (!form.title || !form.client_name) {
      alert("กรอก Title และ Client ก่อน");
      return;
    }

    try {
      setSaving(true);

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
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      if (error) throw error;

      // reset form
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

      // reload data
      await fetchCases();
    } catch (err) {
      console.error(err);
      alert("Error creating case");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <AppTopNav title="Cases" subtitle="Case list" activePage="cases" />

      <div style={{ marginTop: 20, marginBottom: 20 }}>
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

      {/* FORM */}
      {showForm && (
        <div style={formCardStyle}>
          <h3>Add Case</h3>

          <div style={formGridStyle}>
            <input
              placeholder="Title"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
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
          >
            {saving ? "Saving..." : "Create Case"}
          </button>
        </div>
      )}

      {/* TABLE */}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>File No</th>
            <th style={thStyle}>Title</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Owner</th>
            <th style={thStyle}>Phase</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Court</th>
            <th style={thStyle}>Case No.</th>
            <th style={thStyle}>Updated</th>
          </tr>
        </thead>

        <tbody>
          {cases.map((c) => (
            <tr key={c.id} style={rowStyle}>
              <td style={tdStyle}>
                <Link href={`/cases/${c.id}`}>
                  {c.file_no || "-"}
                </Link>
              </td>
              <td style={tdStyle}>{c.title || "-"}</td>
              <td style={tdStyle}>{c.client_name || "-"}</td>
              <td style={tdStyle}>{c.owner_name || "-"}</td>
              <td style={tdStyle}>{c.phase || "-"}</td>
              <td style={tdStyle}>{c.status || "-"}</td>
              <td style={tdStyle}>{c.court_name || "-"}</td>
              <td style={tdStyle}>{c.case_number || "-"}</td>
              <td style={tdStyle}>
                {c.updated_at
                  ? new Date(c.updated_at).toLocaleString("th-TH")
                  : "-"}
              </td>
            </tr>
          ))}

          {cases.length === 0 && (
            <tr>
              <td colSpan={9} style={{ padding: 16 }}>
                No cases found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

// ===== STYLE =====

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
  padding: 8,
  border: "1px solid #ccc",
  borderRadius: 6,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "black",
  color: "white",
  borderRadius: 8,
  border: "none",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "white",
  border: "1px solid #ccc",
  borderRadius: 8,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
};

const tdStyle: React.CSSProperties = {
  padding: 10,
};

const rowStyle: React.CSSProperties = {
  borderTop: "1px solid #eee",
};