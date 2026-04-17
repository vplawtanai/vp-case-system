"use client";

import { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";

type TimeLogItem = {
  id: string;
  workDate?: string;
  staffName?: string;
  minutes?: number;
  note?: string;
};

type Props = {
  caseId: string;
  timeLogs: TimeLogItem[];
};

export default function TimeLogsSection({ caseId, timeLogs }: Props) {
  const emptyForm = {
    workDate: "",
    staffName: "",
    minutes: "",
    note: "",
  };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const sortedTimeLogs = useMemo(() => {
    return [...timeLogs].sort((a, b) => {
      const aDate = a.workDate || "";
      const bDate = b.workDate || "";
      const dateCompare = bDate.localeCompare(aDate);
      if (dateCompare !== 0) return dateCompare;

      return (b.minutes || 0) - (a.minutes || 0);
    });
  }, [timeLogs]);

  const totalMinutes = useMemo(() => {
    return timeLogs.reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
  }, [timeLogs]);

  const totalHoursText = useMemo(() => {
    const hours = totalMinutes / 60;
    return hours % 1 === 0 ? String(hours) : hours.toFixed(1);
  }, [totalMinutes]);

  const groupedSummary = useMemo(() => {
    const map = new Map<string, number>();

    timeLogs.forEach((item) => {
      const key = (item.staffName || "-").trim() || "-";
      map.set(key, (map.get(key) || 0) + (Number(item.minutes) || 0));
    });

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [timeLogs]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const formatMinutes = (minutes?: number) => {
    const total = Number(minutes) || 0;
    const hrs = Math.floor(total / 60);
    const mins = total % 60;

    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
    if (hrs > 0) return `${hrs}h`;
    return `${mins}m`;
  };

  const createTimeLog = async () => {
    if (!form.workDate || !form.staffName || !form.minutes) {
      alert("Please fill Date, Staff, and Minutes.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "cases", caseId, "timeLogs"), {
        workDate: form.workDate,
        staffName: form.staffName,
        minutes: Number(form.minutes),
        note: form.note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetForm();
    } catch (error) {
      console.error(error);
      alert("Create time log failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: TimeLogItem) => {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      workDate: item.workDate || "",
      staffName: item.staffName || "",
      minutes: String(item.minutes || ""),
      note: item.note || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;

    if (!form.workDate || !form.staffName || !form.minutes) {
      alert("Please fill Date, Staff, and Minutes.");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", caseId, "timeLogs", editingId), {
        workDate: form.workDate,
        staffName: form.staffName,
        minutes: Number(form.minutes),
        note: form.note,
        updatedAt: serverTimestamp(),
      });

      resetForm();
    } catch (error) {
      console.error(error);
      alert("Save time log failed.");
    } finally {
      setSaving(false);
    }
  };

  const removeTimeLog = async (id: string) => {
    const confirmed = window.confirm("Delete this time log?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", caseId, "timeLogs", id));
      if (editingId === id) resetForm();
    } catch (error) {
      console.error(error);
      alert("Delete time log failed.");
    }
  };

  return (
    <div id="timelogs" style={cardStyle}>
      <div style={responsiveHeaderStyle}>
        <h3 style={{ margin: 0 }}>Time Logs</h3>

        <div style={mobileStackButtonWrapStyle}>
          {!showForm ? (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setShowForm(true);
              }}
              style={buttonPrimary}
            >
              + Add Time Log
            </button>
          ) : (
            <button onClick={resetForm} style={buttonSecondary}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>
            {editingId ? "Edit Time Log" : "Add Time Log"}
          </div>

          <div style={gridStyle}>
            <div>
              <label>Date</label>
              <input
                type="date"
                value={form.workDate}
                onChange={(e) =>
                  setForm({ ...form, workDate: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Staff</label>
              <input
                value={form.staffName}
                onChange={(e) =>
                  setForm({ ...form, staffName: e.target.value })
                }
                style={inputStyle}
                placeholder="เช่น ทนายเป้า / แพม / แตงโม"
              />
            </div>

            <div>
              <label>Minutes</label>
              <input
                type="number"
                value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: e.target.value })}
                style={inputStyle}
                placeholder="30"
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Note</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={inputStyle}
                placeholder="เช่น ร่างคำให้การ / ประชุมลูกค้า / ตรวจเอกสาร"
              />
            </div>
          </div>

          <button
            onClick={editingId ? saveEdit : createTimeLog}
            disabled={saving}
            style={{ ...buttonPrimary, marginTop: 16, marginBottom: 20 }}
          >
            {saving
              ? "Saving..."
              : editingId
                ? "Save Time Log Changes"
                : "Save New Time Log"}
          </button>
        </>
      )}

      <div style={summaryWrapStyle}>
        <div style={summaryChipStyle}>
          <strong>Total:</strong> {formatMinutes(totalMinutes)}
        </div>

        <div style={summaryChipStyle}>
          <strong>Hours:</strong> {totalHoursText}
        </div>

        {groupedSummary.slice(0, 3).map(([staff, minutes]) => (
          <div key={staff} style={summaryChipStyle}>
            <strong>{staff}:</strong> {formatMinutes(minutes)}
          </div>
        ))}
      </div>

      {sortedTimeLogs.length === 0 ? (
        <p>No time logs yet.</p>
      ) : (
        <div style={timeLogListStyle}>
          {sortedTimeLogs.map((item) => (
            <TimeLogCard
              key={item.id}
              item={item}
              formatMinutes={formatMinutes}
              onEdit={() => startEdit(item)}
              onDelete={() => removeTimeLog(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TimeLogCard({
  item,
  formatMinutes,
  onEdit,
  onDelete,
}: {
  item: TimeLogItem;
  formatMinutes: (minutes?: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={timeLogCardStyle}>
      <div style={timeLogCardHeaderStyle}>
        <div>
          <div style={timeLogTitleStyle}>{item.staffName || "-"}</div>
          <div style={metaLabelStyle}>{item.workDate || "-"}</div>
        </div>

        <div style={durationPillStyle}>{formatMinutes(item.minutes)}</div>
      </div>

      <div style={timeLogMetaGridStyle}>
        <div>
          <div style={metaLabelStyle}>Date</div>
          <div style={metaValueStyle}>{item.workDate || "-"}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Staff</div>
          <div style={metaValueStyle}>{item.staffName || "-"}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Minutes</div>
          <div style={metaValueStyle}>{Number(item.minutes) || 0}</div>
        </div>
      </div>

      {item.note ? (
        <div style={noteWrapStyle}>
          <div style={metaLabelStyle}>Note</div>
          <div style={metaValueStyle}>{item.note}</div>
        </div>
      ) : null}

      <div style={rowActionsWrapStyle}>
        <button onClick={onEdit} style={smallButtonStyle}>
          Edit
        </button>
        <button onClick={onDelete} style={smallDangerStyle}>
          Delete
        </button>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
  overflow: "hidden",
};

const responsiveHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 8,
};

const mobileStackButtonWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const summaryWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};

const summaryChipStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #ddd",
  borderRadius: 999,
  background: "#fafafa",
};

const timeLogListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const timeLogCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const timeLogCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const timeLogTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const durationPillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background: "#f5f5f5",
  color: "#333",
  border: "1px solid #ddd",
};

const timeLogMetaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 12,
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#111",
  fontWeight: 500,
  wordBreak: "break-word",
};

const noteWrapStyle: React.CSSProperties = {
  marginBottom: 12,
  paddingTop: 8,
  borderTop: "1px solid #f0f0f0",
};

const rowActionsWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const buttonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "black",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const buttonSecondary: React.CSSProperties = {
  padding: "8px 14px",
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