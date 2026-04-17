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

type DeadlineItem = {
  id: string;
  deadlineType?: string;
  dueDate?: string;
  status?: string;
  note?: string;
  done?: boolean;
};

type TimelineItem = {
  id: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  appointment?: string;
  done?: boolean;
};

type Props = {
  caseId: string;
  tasks: TaskItem[];
};

export default function TasksSection({ caseId, tasks }: Props) {
  const emptyForm = {
    title: "",
    assigneeName: "",
    startDate: "",
    dueDate: "",
    priority: "medium",
    status: "todo",
    done: false,
  };

  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyForm);

  const renderPriority = (priority?: string) => {
    if (!priority) return "-";
    if (priority === "low") return "Low";
    if (priority === "medium") return "Medium";
    if (priority === "high") return "High";
    if (priority === "critical") return "Critical";
    return priority;
  };

  const renderTaskStatus = (status?: string, done?: boolean) => {
    if (done) return "Done";
    if (!status) return "-";
    if (status === "todo") return "To Do";
    if (status === "doing") return "Doing";
    if (status === "done") return "Done";
    return status;
  };

  const priorityScore = (priority?: string) => {
    if (priority === "critical") return 4;
    if (priority === "high") return 3;
    if (priority === "medium") return 2;
    if (priority === "low") return 1;
    return 0;
  };

  const dueBucket = (
    startDate?: string,
    dueDate?: string,
    status?: string,
    done?: boolean
  ) => {
    if (done || status === "done") return 99;
    if (!dueDate) return 50;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const start = startDate ? new Date(startDate) : null;
    if (start) start.setHours(0, 0, 0, 0);

    const diffDue = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDue < 0) return 0;
    if (diffDue === 0) return 1;
    if (start && start.getTime() <= today.getTime() && diffDue <= 3) return 2;
    if (start && start.getTime() <= today.getTime()) return 3;
    if (diffDue <= 3) return 4;
    return 5;
  };

  const getUrgencyLabel = (task: TaskItem) => {
    if (task.done || task.status === "done") return "Done";
    if (!task.dueDate) return "No Due Date";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays <= 3) return "Due Soon";
    return "Normal";
  };

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDone = a.done || a.status === "done" ? 1 : 0;
      const bDone = b.done || b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aBucket = dueBucket(a.startDate, a.dueDate, a.status, a.done);
      const bBucket = dueBucket(b.startDate, b.dueDate, b.status, b.done);
      if (aBucket !== bBucket) return aBucket - bBucket;

      const aDue = a.dueDate
        ? new Date(a.dueDate).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate
        ? new Date(b.dueDate).getTime()
        : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;

      const aPriority = priorityScore(a.priority);
      const bPriority = priorityScore(b.priority);
      if (aPriority !== bPriority) return bPriority - aPriority;

      return 0;
    });
  }, [tasks]);

  const resetForm = () => {
    setTaskForm(emptyForm);
    setEditingTaskId(null);
    setShowForm(false);
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

  const getTimelineUrgency = (item: TimelineItem) => {
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
      const urgency = getUrgencyLabel(item);
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

  const createTask = async () => {
    if (!taskForm.title) {
      alert("Please fill Task Title.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "cases", caseId, "tasks"), {
        title: taskForm.title,
        assigneeName: taskForm.assigneeName,
        startDate: taskForm.startDate,
        dueDate: taskForm.dueDate,
        priority: taskForm.priority,
        status: taskForm.done ? "done" : taskForm.status,
        done: taskForm.done,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Create task failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEditTask = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setShowForm(true);
    setTaskForm({
      title: task.title || "",
      assigneeName: task.assigneeName || "",
      startDate: task.startDate || "",
      dueDate: task.dueDate || "",
      priority: task.priority || "medium",
      status: task.done ? "done" : task.status || "todo",
      done: !!task.done,
    });
  };

  const saveTaskChanges = async () => {
    if (!editingTaskId) return;
    if (!taskForm.title) {
      alert("Please fill Task Title.");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", caseId, "tasks", editingTaskId), {
        title: taskForm.title,
        assigneeName: taskForm.assigneeName,
        startDate: taskForm.startDate,
        dueDate: taskForm.dueDate,
        priority: taskForm.priority,
        status: taskForm.done ? "done" : taskForm.status,
        done: taskForm.done,
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Save task failed.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDoneTask = async (task: TaskItem) => {
    try {
      const nextDone = !(task.done || task.status === "done");
      await updateDoc(doc(db, "cases", caseId, "tasks", task.id), {
        done: nextDone,
        status: nextDone ? "done" : "todo",
        updatedAt: serverTimestamp(),
      });

      await recomputeCaseRisk();
    } catch (error) {
      console.error(error);
      alert("Update task failed.");
    }
  };

  const removeTask = async (taskId: string) => {
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", caseId, "tasks", taskId));
      await recomputeCaseRisk();
      if (editingTaskId === taskId) resetForm();
    } catch (error) {
      console.error(error);
      alert("Delete task failed.");
    }
  };

  return (
    <div id="tasks" style={cardStyle}>
      <div style={responsiveHeaderStyle}>
        <h3 style={{ margin: 0 }}>Tasks</h3>

        <div style={mobileStackButtonWrapStyle}>
          {!showForm ? (
            <button
              onClick={() => {
                setEditingTaskId(null);
                setTaskForm(emptyForm);
                setShowForm(true);
              }}
              style={buttonPrimary}
            >
              + Add Task
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
            {editingTaskId ? "Edit Task" : "Add Task"}
          </div>

          <div style={gridStyle}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Task Title</label>
              <input
                placeholder="Task Title"
                value={taskForm.title}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, title: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Assigned To</label>
              <input
                placeholder="Assigned To"
                value={taskForm.assigneeName}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, assigneeName: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Start Date</label>
              <input
                type="date"
                value={taskForm.startDate}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, startDate: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Due Date</label>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, dueDate: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Priority</label>
              <select
                value={taskForm.priority}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, priority: e.target.value })
                }
                style={inputStyle}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label>Status</label>
              <select
                value={taskForm.status}
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    status: e.target.value,
                    done: e.target.value === "done",
                  })
                }
                style={inputStyle}
              >
                <option value="todo">To Do</option>
                <option value="doing">Doing</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={taskForm.done}
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    done: e.target.checked,
                    status: e.target.checked ? "done" : "todo",
                  })
                }
              />
              <label>Done</label>
            </div>
          </div>

          <button
            onClick={editingTaskId ? saveTaskChanges : createTask}
            disabled={saving}
            style={{ ...buttonPrimary, marginTop: 16, marginBottom: 20 }}
          >
            {saving
              ? "Saving..."
              : editingTaskId
              ? "Save Task Changes"
              : "Save New Task"}
          </button>
        </>
      )}

      {sortedTasks.length === 0 ? (
        <p>No tasks yet.</p>
      ) : (
        <div style={taskListStyle}>
          {sortedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              urgency={getUrgencyLabel(task)}
              priorityText={renderPriority(task.priority)}
              statusText={renderTaskStatus(task.status, task.done)}
              onToggleDone={() => toggleDoneTask(task)}
              onEdit={() => startEditTask(task)}
              onDelete={() => removeTask(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  urgency,
  priorityText,
  statusText,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  task: TaskItem;
  urgency: string;
  priorityText: string;
  statusText: string;
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const priorityStyle = getPriorityPillStyle(task.priority);
  const urgencyStyle = getUrgencyPillStyle(urgency);
  const isDone = !!task.done || task.status === "done";

  return (
    <div
      style={{
        ...taskCardStyle,
        background: isDone
          ? "#f7f7f7"
          : urgency === "Overdue"
          ? "#fff5f5"
          : urgency === "Today" || urgency === "Due Soon"
          ? "#fffaf0"
          : "#fff",
      }}
    >
      <div style={taskCardHeaderStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={taskTitleRowStyle}>
            <input
              type="checkbox"
              checked={isDone}
              onChange={onToggleDone}
              style={{ marginTop: 2 }}
            />
            <div
              style={{
                ...taskTitleStyle,
                textDecoration: isDone ? "line-through" : "none",
                color: isDone ? "#777" : "#111",
              }}
            >
              {task.title || "-"}
            </div>
          </div>

          <div style={taskBadgeRowStyle}>
            <span style={priorityStyle}>{priorityText}</span>
            <span style={urgencyStyle}>{urgency}</span>
            <span style={statusPillStyle}>{statusText}</span>
          </div>
        </div>
      </div>

      <div style={taskMetaGridStyle}>
        <div>
          <div style={metaLabelStyle}>Assigned To</div>
          <div style={metaValueStyle}>{task.assigneeName || "-"}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Start Date</div>
          <div style={metaValueStyle}>{task.startDate || "-"}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Due Date</div>
          <div style={metaValueStyle}>{task.dueDate || "-"}</div>
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

function getPriorityPillStyle(priority?: string): React.CSSProperties {
  if (priority === "critical") {
    return {
      ...pillBaseStyle,
      background: "#fdecec",
      color: "#b42318",
      border: "1px solid #f3c7c7",
    };
  }

  if (priority === "high") {
    return {
      ...pillBaseStyle,
      background: "#fff4e5",
      color: "#b54708",
      border: "1px solid #f3d1a7",
    };
  }

  if (priority === "medium") {
    return {
      ...pillBaseStyle,
      background: "#f5f5f5",
      color: "#444",
      border: "1px solid #ddd",
    };
  }

  return {
    ...pillBaseStyle,
    background: "#f8fafc",
    color: "#475467",
    border: "1px solid #dde3ea",
  };
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

  if (urgency === "Due Soon") {
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

const taskListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const taskCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
};

const taskCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const taskTitleRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 10,
};

const taskTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const taskBadgeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const taskMetaGridStyle: React.CSSProperties = {
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

const statusPillStyle: React.CSSProperties = {
  ...pillBaseStyle,
  background: "#f5f5f5",
  color: "#555",
  border: "1px solid #ddd",
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