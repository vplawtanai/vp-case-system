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

type TimelineItem = {
  id: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  appointment?: string;
  done?: boolean;
};

type DeadlineItem = {
  id: string;
  deadlineType?: string;
  dueDate?: string;
  status?: string;
  note?: string;
  done?: boolean;
};

type TaskItem = {
  id: string;
  title?: string;
  assigneeName?: string;
  startDate?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  done?: boolean;
};

type Props = {
  caseId: string;
  timeline: TimelineItem[];
};

export default function TimelineSection({ caseId, timeline }: Props) {
  const emptyForm = {
    eventDate: "",
    startTime: "",
    endTime: "",
    appointment: "",
    done: false,
  };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const sortedTimeline = useMemo(() => {
    return [...timeline].sort((a, b) => {
      const aDateTime = `${a.eventDate || ""} ${a.startTime || ""}`.trim();
      const bDateTime = `${b.eventDate || ""} ${b.startTime || ""}`.trim();
      return aDateTime.localeCompare(bDateTime);
    });
  }, [timeline]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const getUrgency = (item: TimelineItem) => {
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

  const renderDeadlineType = (deadlineType?: string) => {
    if (!deadlineType) return "Deadline";
    if (deadlineType === "appeal") return "Appeal";
    if (deadlineType === "supreme") return "Supreme Court";
    if (deadlineType === "submission") return "Submission";
    if (deadlineType === "payment") return "Payment";
    return deadlineType;
  };

  const getDeadlineUrgency = (item: DeadlineItem) => {
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

  const getTaskUrgency = (item: TaskItem) => {
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
    })) as DeadlineItem[];

    const allTasks = taskSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as TaskItem[];

    const allTimeline = timelineSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as TimelineItem[];

    const candidates: {
      level: "overdue" | "today" | "dueSoon";
      text: string;
      date: string;
      score: number;
    }[] = [];

    allDeadlines.forEach((item) => {
      const urgency = getDeadlineUrgency(item);
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

    allTasks.forEach((item) => {
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

    allTimeline.forEach((item) => {
      const urgency = getUrgency(item);
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

  const createTimeline = async () => {
    if (!form.eventDate || !form.appointment) {
      alert("Please fill Date and Appointment.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "cases", caseId, "timeline"), {
        eventDate: form.eventDate,
        startTime: form.startTime,
        endTime: form.endTime,
        appointment: form.appointment,
        done: form.done,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Create timeline failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: TimelineItem) => {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      eventDate: item.eventDate || "",
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      appointment: item.appointment || "",
      done: !!item.done,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;

    if (!form.eventDate || !form.appointment) {
      alert("Please fill Date and Appointment.");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", caseId, "timeline", editingId), {
        eventDate: form.eventDate,
        startTime: form.startTime,
        endTime: form.endTime,
        appointment: form.appointment,
        done: form.done,
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Save timeline failed.");
    } finally {
      setSaving(false);
    }
  };

  const removeTimeline = async (id: string) => {
    const confirmed = window.confirm("Delete this timeline item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", caseId, "timeline", id));
      await recomputeCaseRisk();
      if (editingId === id) resetForm();
    } catch (error) {
      console.error(error);
      alert("Delete timeline failed.");
    }
  };

  const toggleDone = async (item: TimelineItem) => {
    try {
      await updateDoc(doc(db, "cases", caseId, "timeline", item.id), {
        done: !item.done,
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
    } catch (error) {
      console.error(error);
      alert("Update timeline failed.");
    }
  };

  return (
    <div id="timeline" style={cardStyle}>
      <div style={responsiveHeaderStyle}>
        <h3 style={{ margin: 0 }}>Court Timeline</h3>

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
              + Add Timeline
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
            {editingId ? "Edit Court Timeline" : "Add Court Timeline"}
          </div>

          <div style={gridStyle}>
            <div>
              <label>Date</label>
              <input
                type="date"
                value={form.eventDate}
                onChange={(e) =>
                  setForm({ ...form, eventDate: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Start Time</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm({ ...form, startTime: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>End Time</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) =>
                  setForm({ ...form, endTime: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Appointment</label>
              <input
                value={form.appointment}
                onChange={(e) =>
                  setForm({ ...form, appointment: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={form.done}
                onChange={(e) => setForm({ ...form, done: e.target.checked })}
              />
              <label>Done</label>
            </div>
          </div>

          <button
            onClick={editingId ? saveEdit : createTimeline}
            disabled={saving}
            style={{ ...buttonPrimary, marginTop: 16, marginBottom: 20 }}
          >
            {saving
              ? "Saving..."
              : editingId
              ? "Save Timeline Changes"
              : "Save New Timeline"}
          </button>
        </>
      )}

      {sortedTimeline.length === 0 ? (
        <p>No timeline yet.</p>
      ) : (
        <div style={timelineListStyle}>
          {sortedTimeline.map((item) => (
            <TimelineCard
              key={item.id}
              item={item}
              urgency={getUrgency(item)}
              onToggleDone={() => toggleDone(item)}
              onEdit={() => startEdit(item)}
              onDelete={() => removeTimeline(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineCard({
  item,
  urgency,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  item: TimelineItem;
  urgency: string;
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDone = !!item.done;
  const timeText =
    item.startTime || item.endTime
      ? `${item.startTime || "-"}${item.endTime ? ` - ${item.endTime}` : ""}`
      : "-";

  return (
    <div
      style={{
        ...timelineCardStyle,
        background: isDone
          ? "#f7f7f7"
          : urgency === "Overdue"
          ? "#fff5f5"
          : urgency === "Today" || urgency === "Upcoming"
          ? "#fffaf0"
          : "#fff",
      }}
    >
      <div style={timelineCardHeaderStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={timelineTitleRowStyle}>
            <input
              type="checkbox"
              checked={isDone}
              onChange={onToggleDone}
              style={{ marginTop: 2 }}
            />
            <div
              style={{
                ...timelineTitleStyle,
                textDecoration: isDone ? "line-through" : "none",
                color: isDone ? "#777" : "#111",
              }}
            >
              {item.appointment || "-"}
            </div>
          </div>

          <div style={timelineBadgeRowStyle}>
            <span style={getUrgencyPillStyle(urgency)}>{urgency}</span>
          </div>
        </div>
      </div>

      <div style={timelineMetaGridStyle}>
        <div>
          <div style={metaLabelStyle}>Date</div>
          <div style={metaValueStyle}>{item.eventDate || "-"}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Time</div>
          <div style={metaValueStyle}>{timeText}</div>
        </div>
      </div>

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

function getUrgencyPillStyle(urgency: string): React.CSSProperties {
  if (urgency === "Overdue") {
    return {
      ...pillBaseStyle,
      background: "#ffe5e5",
      color: "#b42318",
      border: "1px solid #f1b5b5",
    };
  }

  if (urgency === "Today") {
    return {
      ...pillBaseStyle,
      background: "#fff3cd",
      color: "#b54708",
      border: "1px solid #f0d58a",
    };
  }

  if (urgency === "Upcoming") {
    return {
      ...pillBaseStyle,
      background: "#fff8e1",
      color: "#b54708",
      border: "1px solid #eedc9a",
    };
  }

  if (urgency === "Done") {
    return {
      ...pillBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  return {
    ...pillBaseStyle,
    background: "#f8fafc",
    color: "#475467",
    border: "1px solid #dde3ea",
  };
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

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 38,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const timelineListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const timelineCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
};

const timelineCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const timelineTitleRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 10,
};

const timelineTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const timelineBadgeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const timelineMetaGridStyle: React.CSSProperties = {
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

const pillBaseStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
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