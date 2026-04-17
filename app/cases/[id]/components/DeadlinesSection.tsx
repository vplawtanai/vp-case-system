"use client";

import { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";

type DeadlineItem = {
  id: string;
  deadlineType?: string;
  dueDate?: string;
  status?: string;
  note?: string;
  done?: boolean;
};

type Props = {
  caseId: string;
  deadlines: DeadlineItem[];
};

export default function DeadlinesSection({ caseId, deadlines }: Props) {
  const emptyForm = {
    deadlineType: "appeal",
    dueDate: "",
    status: "pending",
    note: "",
    done: false,
  };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const sortedDeadlines = useMemo(() => {
    return [...deadlines].sort((a, b) => {
      const aDate = a.dueDate || "";
      const bDate = b.dueDate || "";
      return aDate.localeCompare(bDate);
    });
  }, [deadlines]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const renderDeadlineType = (deadlineType?: string) => {
    if (!deadlineType) return "-";
    if (deadlineType === "appeal") return "Appeal";
    if (deadlineType === "supreme") return "Supreme Court";
    if (deadlineType === "submission") return "Submission";
    if (deadlineType === "payment") return "Payment";
    return deadlineType;
  };

  const renderStatus = (status?: string, done?: boolean) => {
    if (done) return "Done";
    if (!status) return "-";
    if (status === "pending") return "Pending";
    if (status === "filed") return "Filed";
    if (status === "submitted") return "Submitted";
    if (status === "done") return "Done";
    return status;
  };

  const getUrgency = (item: DeadlineItem) => {
    if (item.done || item.status === "done") return "Done";
    if (!item.dueDate) return "-";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(item.dueDate);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays <= 3) return "Due Soon";
    return "Normal";
  };

  const getTaskUrgency = (item: any) => {
    if (item.done || item.status === "done") return "Done";
    if (!item.dueDate) return "No Due Date";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(item.dueDate);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays <= 3) return "Due Soon";
    return "Normal";
  };

  const getTimelineUrgency = (item: any) => {
    if (item.done) return "Done";
    if (!item.eventDate) return "-";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const event = new Date(item.eventDate);
    event.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays <= 3) return "Upcoming";
    return "Normal";
  };

  const recomputeCaseRisk = async () => {
    const [caseSnap, deadlineSnap, taskSnap, timelineSnap] = await Promise.all([
      getDoc(doc(db, "cases", caseId)),
      getDocs(collection(db, "cases", caseId, "deadlines")),
      getDocs(collection(db, "cases", caseId, "tasks")),
      getDocs(collection(db, "cases", caseId, "timeline")),
    ]);

    const caseData = caseSnap.exists() ? (caseSnap.data() as any) : {};

    const allDeadlines = deadlineSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    const allTasks = taskSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    const allTimeline = timelineSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    const candidates: {
      level: "overdue" | "today" | "dueSoon";
      text: string;
      date: string;
      score: number;
    }[] = [];

    allDeadlines.forEach((item: any) => {
      const urgency = getUrgency(item);
      if (!item.dueDate) return;

      if (urgency === "Overdue") {
        candidates.push({
          level: "overdue",
          text: `Deadline overdue: ${renderDeadlineType(item.deadlineType)}`,
          date: item.dueDate,
          score: 0,
        });
      } else if (urgency === "Today") {
        candidates.push({
          level: "today",
          text: `Deadline today: ${renderDeadlineType(item.deadlineType)}`,
          date: item.dueDate,
          score: 1,
        });
      } else if (urgency === "Due Soon") {
        candidates.push({
          level: "dueSoon",
          text: `Deadline due soon: ${renderDeadlineType(item.deadlineType)}`,
          date: item.dueDate,
          score: 2,
        });
      }
    });

    allTasks.forEach((item: any) => {
      const urgency = getTaskUrgency(item);
      if (!item.dueDate) return;

      if (urgency === "Overdue") {
        candidates.push({
          level: "overdue",
          text: `Task overdue: ${item.title || "Task"}`,
          date: item.dueDate,
          score: 0,
        });
      } else if (urgency === "Today") {
        candidates.push({
          level: "today",
          text: `Task today: ${item.title || "Task"}`,
          date: item.dueDate,
          score: 1,
        });
      } else if (urgency === "Due Soon") {
        candidates.push({
          level: "dueSoon",
          text: `Task due soon: ${item.title || "Task"}`,
          date: item.dueDate,
          score: 2,
        });
      }
    });

    allTimeline.forEach((item: any) => {
      const urgency = getTimelineUrgency(item);
      if (!item.eventDate) return;

      if (urgency === "Overdue") {
        candidates.push({
          level: "overdue",
          text: `Timeline overdue: ${item.appointment || "Appointment"}`,
          date: item.eventDate,
          score: 0,
        });
      } else if (urgency === "Today") {
        candidates.push({
          level: "today",
          text: `Timeline today: ${item.appointment || "Appointment"}`,
          date: item.eventDate,
          score: 1,
        });
      } else if (urgency === "Upcoming") {
        candidates.push({
          level: "dueSoon",
          text: `Timeline upcoming: ${item.appointment || "Appointment"}`,
          date: item.eventDate,
          score: 2,
        });
      }
    });

    candidates.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.date.localeCompare(b.date);
    });

    const top = candidates[0];

    await updateDoc(doc(db, "cases", caseId), {
      riskLevel: top?.level || "clear",
      nextAlertText: top?.text || "-",
      nextAlertDate: top?.date || "",

      enforcementReady: !!caseData.enforcementReady,
      enforcementReadyText: caseData.enforcementReadyText || "-",
      enforcementReadyDate: caseData.enforcementReadyDate || "",

      updatedAt: serverTimestamp(),
    });
  };

  const createDeadline = async () => {
    if (!form.deadlineType || !form.dueDate) {
      alert("Please fill Deadline Type and Due Date.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "cases", caseId, "deadlines"), {
        deadlineType: form.deadlineType,
        dueDate: form.dueDate,
        status: form.done ? "done" : form.status,
        note: form.note,
        done: form.done,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Create deadline failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: DeadlineItem) => {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      deadlineType: item.deadlineType || "appeal",
      dueDate: item.dueDate || "",
      status: item.done ? "done" : item.status || "pending",
      note: item.note || "",
      done: !!item.done,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;

    if (!form.deadlineType || !form.dueDate) {
      alert("Please fill Deadline Type and Due Date.");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", caseId, "deadlines", editingId), {
        deadlineType: form.deadlineType,
        dueDate: form.dueDate,
        status: form.done ? "done" : form.status,
        note: form.note,
        done: form.done,
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Save deadline failed.");
    } finally {
      setSaving(false);
    }
  };

  const removeDeadline = async (id: string) => {
    const confirmed = window.confirm("Delete this deadline?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", caseId, "deadlines", id));
      await recomputeCaseRisk();
      if (editingId === id) resetForm();
    } catch (error) {
      console.error(error);
      alert("Delete deadline failed.");
    }
  };

  const toggleDone = async (item: DeadlineItem) => {
    try {
      const nextDone = !item.done;

      await updateDoc(doc(db, "cases", caseId, "deadlines", item.id), {
        done: nextDone,
        status: nextDone ? "done" : "pending",
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
    } catch (error) {
      console.error(error);
      alert("Update deadline failed.");
    }
  };

  return (
    <div id="deadlines" style={cardStyle}>
      <div style={responsiveHeaderStyle}>
        <h3 style={{ margin: 0 }}>Legal Deadlines</h3>

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
              + Add Deadline
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
            {editingId ? "Edit Deadline" : "Add Deadline"}
          </div>

          <div style={gridStyle}>
            <div>
              <label>Deadline Type</label>
              <select
                value={form.deadlineType}
                onChange={(e) =>
                  setForm({ ...form, deadlineType: e.target.value })
                }
                style={inputStyle}
              >
                <option value="appeal">Appeal</option>
                <option value="supreme">Supreme Court</option>
                <option value="submission">Submission</option>
                <option value="payment">Payment</option>
              </select>
            </div>

            <div>
              <label>Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm({ ...form, dueDate: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value,
                    done: e.target.value === "done",
                  })
                }
                style={inputStyle}
              >
                <option value="pending">Pending</option>
                <option value="filed">Filed</option>
                <option value="submitted">Submitted</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label>Note</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={inputStyle}
                placeholder="รายละเอียดเพิ่มเติม"
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.done}
                onChange={(e) =>
                  setForm({
                    ...form,
                    done: e.target.checked,
                    status: e.target.checked ? "done" : "pending",
                  })
                }
              />
              <label>Done</label>
            </div>
          </div>

          <button
            onClick={editingId ? saveEdit : createDeadline}
            disabled={saving}
            style={{ ...buttonPrimary, marginTop: 16, marginBottom: 20 }}
          >
            {saving
              ? "Saving..."
              : editingId
              ? "Save Deadline Changes"
              : "Save New Deadline"}
          </button>
        </>
      )}

      {sortedDeadlines.length === 0 ? (
        <p>No deadlines yet.</p>
      ) : (
        <div style={tableScrollWrapStyle}>
          <table style={responsiveTableStyle}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f5f5" }}>
                <th style={cellHead}>Done</th>
                <th style={cellHead}>Type</th>
                <th style={cellHead}>Due Date</th>
                <th style={cellHead}>Status</th>
                <th style={cellHead}>Urgency</th>
                <th style={cellHead}>Note</th>
                <th style={cellHead}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedDeadlines.map((item) => {
                const urgency = getUrgency(item);

                let rowStyle: React.CSSProperties = {
                  borderTop: "1px solid #eee",
                };

                if (item.done || urgency === "Done") {
                  rowStyle.background = "#f0f0f0";
                } else if (urgency === "Overdue") {
                  rowStyle.background = "#ffe5e5";
                } else if (urgency === "Today" || urgency === "Due Soon") {
                  rowStyle.background = "#fff4e5";
                }

                return (
                  <tr key={item.id} style={rowStyle}>
                    <td style={cellBody}>
                      <input
                        type="checkbox"
                        checked={!!item.done}
                        onChange={() => toggleDone(item)}
                      />
                    </td>
                    <td style={cellBody}>
                      {renderDeadlineType(item.deadlineType)}
                    </td>
                    <td style={cellBody}>{item.dueDate || "-"}</td>
                    <td style={cellBody}>
                      {renderStatus(item.status, item.done)}
                    </td>
                    <td
                      style={{
                        ...cellBody,
                        fontWeight: 600,
                        color:
                          urgency === "Overdue"
                            ? "red"
                            : urgency === "Today" || urgency === "Due Soon"
                            ? "orange"
                            : urgency === "Done"
                            ? "#888"
                            : "inherit",
                      }}
                    >
                      {urgency}
                    </td>
                    <td style={cellBody}>{item.note || "-"}</td>
                    <td style={cellBody}>
                      <div style={rowActionsWrapStyle}>
                        <button
                          onClick={() => startEdit(item)}
                          style={smallButtonStyle}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeDeadline(item.id)}
                          style={smallDangerStyle}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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

const tableScrollWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

const responsiveTableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 860,
  borderCollapse: "collapse",
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

const cellHead: React.CSSProperties = {
  padding: 12,
};

const cellBody: React.CSSProperties = {
  padding: 12,
};