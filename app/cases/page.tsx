"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import Link from "next/link";
import AppTopNav from "../components/AppTopNav";

type FirestoreTimestampLike = {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
};

type CaseItem = {
  id: string;
  fileNo?: string;
  title?: string;
  clientName?: string;
  courtName?: string;
  caseNumber?: string;
  phase?: string;
  caseStatus?: string;
  storageCategory?: string;
  storageLocation?: string;
  ownerName?: string;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
  riskLevel?: "overdue" | "today" | "dueSoon" | "clear";
  nextAlertText?: string;
  nextAlertDate?: string;
  enforcementReady?: boolean;
  enforcementReadyText?: string;
  enforcementReadyDate?: string;
};

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [storageFilter, setStorageFilter] = useState("all");
  const [sortBy, setSortBy] = useState("riskDesc");

  const emptyForm = {
    title: "",
    clientName: "",
    courtName: "",
    caseNumber: "",
    phase: "litigation",
    caseStatus: "Active",
    storageCategory: "cabinet",
    storageLocation: "",
    ownerName: "",
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const q = query(collection(db, "cases"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      })) as CaseItem[];
      setCases(data);
    });

    return () => unsub();
  }, []);

  const renderPhase = (phase?: string) => {
    if (!phase) return "-";
    if (phase === "litigation") return "Litigation";
    if (phase === "judgment") return "Judgment";
    if (phase === "enforcement") return "Enforcement";
    if (phase === "closed") return "Closed";
    return phase;
  };

  const renderStorage = (cat?: string) => {
    if (!cat) return "-";
    if (cat === "cabinet") return "Cabinet";
    if (cat === "boxA4") return "boxA4";
    if (cat === "bigBox") return "bigBox";
    return cat;
  };

  const clearForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const toMillis = (value?: FirestoreTimestampLike) => {
    if (!value) return 0;
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    return 0;
  };

  const formatDateTime = (value?: FirestoreTimestampLike) => {
    const ms = toMillis(value);
    if (!ms) return "-";

    return new Date(ms).toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const generateNextFileNo = async () => {
    const buddhistYear = new Date().getFullYear() + 543;
    const shortYear = String(buddhistYear).slice(-2);

    const q = query(collection(db, "cases"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    let maxSeq = 0;

    snap.docs.forEach((docSnap) => {
      const fileNo = docSnap.data().fileNo;
      if (!fileNo) return;

      const match = fileNo.match(/^VP-(\d{2})-(\d{3})$/);
      if (!match) return;

      if (match[1] === shortYear) {
        const seq = parseInt(match[2], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });

    const nextSeq = String(maxSeq + 1).padStart(3, "0");
    return `VP-${shortYear}-${nextSeq}`;
  };

  const createCase = async () => {
    if (!form.title || !form.clientName) {
      alert("Please fill Title and Client.");
      return;
    }

    try {
      setSaving(true);

      const fileNo = await generateNextFileNo();

      await addDoc(collection(db, "cases"), {
        fileNo,
        ...form,
        riskLevel: "clear",
        nextAlertText: "-",
        nextAlertDate: "",
        enforcementReady: false,
        enforcementReadyText: "-",
        enforcementReadyDate: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      clearForm();
    } catch (err) {
      console.error(err);
      alert("Error creating case");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: CaseItem) => {
    setEditingId(item.id);
    setShowForm(true);

    setForm({
      title: item.title || "",
      clientName: item.clientName || "",
      courtName: item.courtName || "",
      caseNumber: item.caseNumber || "",
      phase: item.phase || "litigation",
      caseStatus: item.caseStatus || "Active",
      storageCategory: item.storageCategory || "cabinet",
      storageLocation: item.storageLocation || "",
      ownerName: item.ownerName || "",
    });
  };

  const saveCaseChanges = async () => {
    if (!editingId) return;

    if (!form.title || !form.clientName) {
      alert("Please fill Title and Client.");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", editingId), {
        ...form,
        updatedAt: serverTimestamp(),
      });

      clearForm();
    } catch (err) {
      console.error(err);
      alert("Error updating case");
    } finally {
      setSaving(false);
    }
  };

  const removeCase = async (id: string) => {
    const confirmed = window.confirm("Delete this case?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", id));

      if (editingId === id) {
        clearForm();
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting case");
    }
  };

  const ownerOptions = useMemo(() => {
    const owners = Array.from(
      new Set(
        cases
          .map((c) => (c.ownerName || "").trim())
          .filter((name) => name !== "")
      )
    ).sort((a, b) => a.localeCompare(b, "th"));

    return owners;
  }, [cases]);

  const getRisk = (c: CaseItem) => {
    if (c.riskLevel === "overdue") return "Overdue";
    if (c.riskLevel === "today") return "Today";
    if (c.riskLevel === "dueSoon") return "Due Soon";
    return "Clear";
  };

  const getRiskScore = (c: CaseItem) => {
    if (c.riskLevel === "overdue") return 0;
    if (c.riskLevel === "today") return 1;
    if (c.riskLevel === "dueSoon") return 2;
    return 3;
  };

  const getNextAlert = (c: CaseItem) => {
    if (!c.nextAlertText || c.nextAlertText === "-") return "-";

    if (c.nextAlertDate) {
      return `${c.nextAlertText} • ${c.nextAlertDate}`;
    }

    return c.nextAlertText;
  };

  const getEnforcementText = (c: CaseItem) => {
    if (!c.enforcementReadyText || c.enforcementReadyText === "-") return "-";

    if (c.enforcementReadyDate) {
      return `${c.enforcementReadyText} • ${c.enforcementReadyDate}`;
    }

    return c.enforcementReadyText;
  };

  const getRiskColor = (risk: string): React.CSSProperties => {
    if (risk === "Overdue") {
      return {
        background: "#ffe5e5",
        color: "#b42318",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    if (risk === "Today") {
      return {
        background: "#fff3cd",
        color: "#b54708",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    if (risk === "Due Soon") {
      return {
        background: "#fff8e1",
        color: "#b54708",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    return {
      background: "#e6f4ea",
      color: "#067647",
      fontWeight: 600,
      borderRadius: 999,
      padding: "4px 10px",
      display: "inline-block",
    };
  };

  const getEnforcementColor = (c: CaseItem): React.CSSProperties => {
    if (c.enforcementReady) {
      return {
        background: "#e0f2fe",
        color: "#075985",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    if (c.enforcementReadyText === "Due soon") {
      return {
        background: "#fff8e1",
        color: "#b54708",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    if (c.enforcementReadyText === "Enforcement issued") {
      return {
        background: "#f0f0f0",
        color: "#666",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    return {
      background: "#f5f5f5",
      color: "#666",
      fontWeight: 600,
      borderRadius: 999,
      padding: "4px 10px",
      display: "inline-block",
    };
  };

  const filteredCases = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    const base = cases.filter((c) => {
      const matchesSearch =
        keyword === "" ||
        (c.fileNo || "").toLowerCase().includes(keyword) ||
        (c.title || "").toLowerCase().includes(keyword) ||
        (c.clientName || "").toLowerCase().includes(keyword) ||
        (c.caseNumber || "").toLowerCase().includes(keyword) ||
        (c.storageLocation || "").toLowerCase().includes(keyword) ||
        (c.ownerName || "").toLowerCase().includes(keyword) ||
        (c.nextAlertText || "").toLowerCase().includes(keyword) ||
        (c.enforcementReadyText || "").toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "all" || (c.caseStatus || "") === statusFilter;

      const matchesPhase =
        phaseFilter === "all" || (c.phase || "") === phaseFilter;

      const matchesOwner =
        ownerFilter === "all" || (c.ownerName || "") === ownerFilter;

      const matchesStorage =
        storageFilter === "all" || (c.storageCategory || "") === storageFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPhase &&
        matchesOwner &&
        matchesStorage
      );
    });

    const sorted = [...base].sort((a, b) => {
      if (sortBy === "riskDesc") {
        const riskCompare = getRiskScore(a) - getRiskScore(b);
        if (riskCompare !== 0) return riskCompare;

        const dateCompare = (a.nextAlertDate || "9999-99-99").localeCompare(
          b.nextAlertDate || "9999-99-99"
        );
        if (dateCompare !== 0) return dateCompare;

        return toMillis(b.updatedAt) - toMillis(a.updatedAt);
      }

      if (sortBy === "riskAsc") {
        const riskCompare = getRiskScore(b) - getRiskScore(a);
        if (riskCompare !== 0) return riskCompare;

        const dateCompare = (a.nextAlertDate || "9999-99-99").localeCompare(
          b.nextAlertDate || "9999-99-99"
        );
        if (dateCompare !== 0) return dateCompare;

        return toMillis(b.updatedAt) - toMillis(a.updatedAt);
      }

      if (sortBy === "updatedDesc") {
        return toMillis(b.updatedAt) - toMillis(a.updatedAt);
      }

      if (sortBy === "updatedAsc") {
        return toMillis(a.updatedAt) - toMillis(b.updatedAt);
      }

      if (sortBy === "fileNoAsc") {
        return (a.fileNo || "").localeCompare(b.fileNo || "", "en");
      }

      if (sortBy === "clientAsc") {
        return (a.clientName || "").localeCompare(b.clientName || "", "th");
      }

      return 0;
    });

    return sorted;
  }, [
    cases,
    searchText,
    statusFilter,
    phaseFilter,
    ownerFilter,
    storageFilter,
    sortBy,
  ]);

  const displayCases = useMemo(() => {
    const critical = filteredCases.filter((c) => {
      const r = getRisk(c);
      return r === "Overdue" || r === "Today" || r === "Due Soon";
    });

    const clearCases = filteredCases.filter((c) => getRisk(c) === "Clear");

    return [...critical, ...clearCases.slice(0, 5)];
  }, [filteredCases]);

  const summary = useMemo(() => {
    let overdue = 0;
    let today = 0;
    let dueSoon = 0;
    let clear = 0;

    filteredCases.forEach((c) => {
      const risk = getRisk(c);
      if (risk === "Overdue") overdue += 1;
      else if (risk === "Today") today += 1;
      else if (risk === "Due Soon") dueSoon += 1;
      else clear += 1;
    });

    return { overdue, today, dueSoon, clear };
  }, [filteredCases]);

  return (
    <main style={pageStyle}>
      <AppTopNav
        title="Cases"
        subtitle="Case list"
        activePage="cases"
      />

      <div style={summaryGridStyle}>
        <div style={{ ...summaryCardStyle, background: "#ffe5e5" }}>
          <div style={summaryNumberStyle}>{summary.overdue}</div>
          <div>Overdue</div>
        </div>

        <div style={{ ...summaryCardStyle, background: "#fff3cd" }}>
          <div style={summaryNumberStyle}>{summary.today}</div>
          <div>Today</div>
        </div>

        <div style={{ ...summaryCardStyle, background: "#fff8e1" }}>
          <div style={summaryNumberStyle}>{summary.dueSoon}</div>
          <div>Due Soon</div>
        </div>

        <div style={{ ...summaryCardStyle, background: "#e6f4ea" }}>
          <div style={summaryNumberStyle}>{summary.clear}</div>
          <div>Clear</div>
        </div>
      </div>

      <div style={filterGridStyle}>
        <div>
          <label>Search</label>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search file no, title, client, case number, location, owner"
            style={inputStyle}
          />
        </div>

        <div>
          <label>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="Waiting">Waiting</option>
            <option value="Done">Done</option>
          </select>
        </div>

        <div>
          <label>Phase</label>
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All</option>
            <option value="litigation">Litigation</option>
            <option value="judgment">Judgment</option>
            <option value="enforcement">Enforcement</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div>
          <label>Owner</label>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All</option>
            {ownerOptions.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Storage</label>
          <select
            value={storageFilter}
            onChange={(e) => setStorageFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All</option>
            <option value="cabinet">Cabinet</option>
            <option value="boxA4">boxA4</option>
            <option value="bigBox">bigBox</option>
          </select>
        </div>

        <div>
          <label>Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={inputStyle}
          >
            <option value="riskDesc">Highest Risk First</option>
            <option value="riskAsc">Lowest Risk First</option>
            <option value="updatedDesc">Last Updated (Newest)</option>
            <option value="updatedAsc">Last Updated (Oldest)</option>
            <option value="fileNoAsc">File No (A–Z)</option>
            <option value="clientAsc">Client Name (A–Z)</option>
          </select>
        </div>

        {!showForm ? (
          <button
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setShowForm(true);
            }}
            style={primaryButtonStyle}
          >
            + Add Case
          </button>
        ) : (
          <button onClick={clearForm} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={{ marginBottom: 16, color: "#555" }}>
        Showing {displayCases.length} of {filteredCases.length} case(s)
      </div>

      {showForm && (
        <div style={formCardStyle}>
          <h3>{editingId ? "Edit Case" : "Add Case"}</h3>

          <div style={formGridStyle}>
            <div>
              <label>Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div>
              <label>Client *</label>
              <input
                value={form.clientName}
                onChange={(e) =>
                  setForm({ ...form, clientName: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Court</label>
              <input
                value={form.courtName}
                onChange={(e) =>
                  setForm({ ...form, courtName: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Case Number</label>
              <input
                value={form.caseNumber}
                onChange={(e) =>
                  setForm({ ...form, caseNumber: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Phase</label>
              <select
                value={form.phase}
                onChange={(e) => setForm({ ...form, phase: e.target.value })}
                style={inputStyle}
              >
                <option value="litigation">Litigation</option>
                <option value="judgment">Judgment</option>
                <option value="enforcement">Enforcement</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label>Status</label>
              <select
                value={form.caseStatus}
                onChange={(e) =>
                  setForm({ ...form, caseStatus: e.target.value })
                }
                style={inputStyle}
              >
                <option value="Active">Active</option>
                <option value="Waiting">Waiting</option>
                <option value="Done">Done</option>
              </select>
            </div>

            <div>
              <label>Storage</label>
              <select
                value={form.storageCategory}
                onChange={(e) =>
                  setForm({ ...form, storageCategory: e.target.value })
                }
                style={inputStyle}
              >
                <option value="cabinet">Cabinet</option>
                <option value="boxA4">boxA4</option>
                <option value="bigBox">bigBox</option>
              </select>
            </div>

            <div>
              <label>Location</label>
              <input
                value={form.storageLocation}
                onChange={(e) =>
                  setForm({ ...form, storageLocation: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div style={{ gridColumn: "1 / span 2" }}>
              <label>Owner</label>
              <input
                value={form.ownerName}
                onChange={(e) =>
                  setForm({ ...form, ownerName: e.target.value })
                }
                style={inputStyle}
                placeholder="เช่น ทนายเป้า / แพม / แตงโม"
              />
            </div>
          </div>

          <button
            onClick={editingId ? saveCaseChanges : createCase}
            disabled={saving}
            style={{
              ...primaryButtonStyle,
              marginTop: 16,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving
              ? editingId
                ? "Saving..."
                : "Creating..."
              : editingId
                ? "Save Changes"
                : "+ Create Case"}
          </button>
        </div>
      )}

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
          {displayCases.map((c) => {
            const risk = getRisk(c);
            const nextAlert = getNextAlert(c);
            const enforcementText = getEnforcementText(c);

            return (
              <tr key={c.id} style={rowStyle}>
                <td style={tdStyle}>
                  <Link href={`/cases/${c.id}`}>{c.fileNo}</Link>
                </td>
                <td style={tdStyle}>{c.title}</td>
                <td style={tdStyle}>{c.clientName}</td>
                <td style={tdStyle}>{c.ownerName || "-"}</td>
                <td style={tdStyle}>{renderPhase(c.phase)}</td>
                <td style={tdStyle}>{c.caseStatus}</td>
                <td style={tdStyle}>{renderStorage(c.storageCategory)}</td>
                <td style={tdStyle}>{c.storageLocation}</td>
                <td style={tdStyle}>
                  <span style={getRiskColor(risk)}>{risk}</span>
                </td>
                <td style={tdStyle}>{nextAlert}</td>
                <td style={tdStyle}>
                  <span style={getEnforcementColor(c)}>{enforcementText}</span>
                </td>
                <td style={tdStyle}>{formatDateTime(c.updatedAt)}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => startEdit(c)}
                      style={smallButtonStyle}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeCase(c.id)}
                      style={smallDangerStyle}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {filteredCases.length === 0 && (
            <tr>
              <td colSpan={13} style={{ padding: 16, color: "#666" }}>
                No cases found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: "system-ui",
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto",
  gap: 12,
  marginTop: 20,
  marginBottom: 20,
  alignItems: "end",
};

const formCardStyle: React.CSSProperties = {
  marginBottom: 24,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "black",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const smallDangerStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "white",
  color: "darkred",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  verticalAlign: "top",
};

const rowStyle: React.CSSProperties = {
  borderTop: "1px solid #eee",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
  marginTop: 16,
  marginBottom: 20,
};

const summaryCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginBottom: 6,
};