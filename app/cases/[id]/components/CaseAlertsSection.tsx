"use client";

import { useMemo } from "react";

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

type TimelineItem = {
  id: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  appointment?: string;
  done?: boolean;
};

type Props = {
  deadlines: DeadlineItem[];
  tasks: TaskItem[];
  timeline: TimelineItem[];
};

type AlertItem = {
  type: "deadline" | "task" | "timeline";
  urgency: "Overdue" | "Today" | "Due Soon" | "Upcoming";
  title: string;
  dateText: string;
  subText?: string;
};

export default function CaseAlertsSection({
  deadlines,
  tasks,
  timeline,
}: Props) {
  const alerts = useMemo(() => {
    const result: AlertItem[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = (dateStr?: string) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const renderDeadlineType = (deadlineType?: string) => {
      if (deadlineType === "appeal") return "Appeal";
      if (deadlineType === "supreme") return "Supreme Court";
      if (deadlineType === "submission") return "Submission";
      if (deadlineType === "payment") return "Payment";
      return deadlineType || "Deadline";
    };

    deadlines.forEach((item) => {
      if (item.done || item.status === "done" || !item.dueDate) return;

      const diff = diffDays(item.dueDate);
      if (diff === null) return;

      if (diff < 0) {
        result.push({
          type: "deadline",
          urgency: "Overdue",
          title: renderDeadlineType(item.deadlineType),
          dateText: item.dueDate,
          subText: item.note || "",
        });
      } else if (diff === 0) {
        result.push({
          type: "deadline",
          urgency: "Today",
          title: renderDeadlineType(item.deadlineType),
          dateText: item.dueDate,
          subText: item.note || "",
        });
      } else if (diff <= 3) {
        result.push({
          type: "deadline",
          urgency: "Due Soon",
          title: renderDeadlineType(item.deadlineType),
          dateText: item.dueDate,
          subText: item.note || "",
        });
      }
    });

    tasks.forEach((item) => {
      if (item.done || item.status === "done" || !item.dueDate) return;

      const diff = diffDays(item.dueDate);
      if (diff === null) return;

      if (diff < 0) {
        result.push({
          type: "task",
          urgency: "Overdue",
          title: item.title || "Task",
          dateText: item.dueDate,
          subText: item.assigneeName ? `Assigned to ${item.assigneeName}` : "",
        });
      } else if (diff === 0) {
        result.push({
          type: "task",
          urgency: "Today",
          title: item.title || "Task",
          dateText: item.dueDate,
          subText: item.assigneeName ? `Assigned to ${item.assigneeName}` : "",
        });
      } else if (diff <= 3) {
        result.push({
          type: "task",
          urgency: "Due Soon",
          title: item.title || "Task",
          dateText: item.dueDate,
          subText: item.assigneeName ? `Assigned to ${item.assigneeName}` : "",
        });
      }
    });

    timeline.forEach((item) => {
      if (item.done || !item.eventDate) return;

      const diff = diffDays(item.eventDate);
      if (diff === null) return;

      if (diff < 0) {
        result.push({
          type: "timeline",
          urgency: "Overdue",
          title: item.appointment || "Appointment",
          dateText: item.eventDate,
          subText: item.startTime
            ? `${item.startTime}${item.endTime ? ` - ${item.endTime}` : ""}`
            : "",
        });
      } else if (diff === 0) {
        result.push({
          type: "timeline",
          urgency: "Today",
          title: item.appointment || "Appointment",
          dateText: item.eventDate,
          subText: item.startTime
            ? `${item.startTime}${item.endTime ? ` - ${item.endTime}` : ""}`
            : "",
        });
      } else if (diff <= 3) {
        result.push({
          type: "timeline",
          urgency: "Upcoming",
          title: item.appointment || "Appointment",
          dateText: item.eventDate,
          subText: item.startTime
            ? `${item.startTime}${item.endTime ? ` - ${item.endTime}` : ""}`
            : "",
        });
      }
    });

    const urgencyScore = (u: AlertItem["urgency"]) => {
      if (u === "Overdue") return 0;
      if (u === "Today") return 1;
      if (u === "Due Soon") return 2;
      if (u === "Upcoming") return 3;
      return 9;
    };

    return result.sort((a, b) => {
      const byUrgency = urgencyScore(a.urgency) - urgencyScore(b.urgency);
      if (byUrgency !== 0) return byUrgency;
      return a.dateText.localeCompare(b.dateText);
    });
  }, [deadlines, tasks, timeline]);

  if (alerts.length === 0) {
    return (
      <div style={okCardStyle}>
        <strong>All clear:</strong> No overdue or near-term items.
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Important Alerts</h3>

      <div style={{ display: "grid", gap: 10 }}>
        {alerts.map((item, index) => (
          <div key={`${item.type}-${index}`} style={getAlertStyle(item.urgency)}>
            <div style={{ fontWeight: 700 }}>
              {renderTypeLabel(item.type)} · {item.urgency}
            </div>
            <div style={{ marginTop: 4 }}>{item.title}</div>
            <div style={{ marginTop: 4, fontSize: 14 }}>
              {item.dateText}
              {item.subText ? ` • ${item.subText}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderTypeLabel(type: AlertItem["type"]) {
  if (type === "deadline") return "Deadline";
  if (type === "task") return "Task";
  return "Timeline";
}

function getAlertStyle(urgency: AlertItem["urgency"]): React.CSSProperties {
  if (urgency === "Overdue") {
    return {
      border: "1px solid #f1b5b5",
      background: "#ffe5e5",
      borderRadius: 10,
      padding: 12,
    };
  }

  return {
    border: "1px solid #f3d7aa",
    background: "#fff4e5",
    borderRadius: 10,
    padding: 12,
  };
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
};

const okCardStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #cfe7cf",
  background: "#eef9ee",
  borderRadius: 10,
  padding: 16,
};