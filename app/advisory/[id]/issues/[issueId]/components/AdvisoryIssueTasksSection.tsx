"use client";

import { useEffect, useMemo, useState } from "react";
import { createAuditLog } from "../../../../../../lib/auditLog";
import { supabase } from "../../../../../../lib/supabase";

type Props = {
  advisoryMatterId: string;
  advisoryIssueId: string;
  clientId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  actorName: string;
};

type TaskItem = {
  id: string;
  advisory_matter_id: string;
  advisory_issue_id: string;
  client_id?: string | null;
  title?: string | null;
  task_type?: string | null;
  status?: string | null;
  priority?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  note?: string | null;
};

type TaskForm = {
  id: string;
  title: string;
  task_type: string;
  status: string;
  priority: string;
  assignee_name: string;
  due_date: string;
  completed_at: string;
  note: string;
};

const emptyForm: TaskForm = {
  id: "",
  title: "",
  task_type: "general",
  status: "pending",
  priority: "normal",
  assignee_name: "",
  due_date: "",
  completed_at: "",
  note: "",
};

const taskTypeOptions = [
  { value: "general", label: "General" },
  { value: "document_request", label: "Document Request" },
  { value: "legal_review", label: "Legal Review" },
  { value: "drafting", label: "Drafting" },
  { value: "meeting", label: "Meeting" },
  { value: "follow_up", label: "Follow-up" },
  { value: "filing", label: "Filing / Submission" },
  { value: "research", label: "Research" },
  { value: "other", label: "Other" },
];

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function AdvisoryIssueTasksSection({
  advisoryMatterId,
  advisoryIssueId,
  clientId,
  canEdit,
  canDelete,
  actorName,
}: Props) {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TaskForm>(emptyForm);

  const summary = useMemo(() => {
    return {
      total: items.length,
      active: items.filter((item) =>
        ["pending", "in_progress", "waiting"].includes(item.status || "")
      ).length,
      completed: items.filter((item) => item.status === "completed").length,
      important: items.filter((item) =>
        ["urgent", "high"].includes(item.priority || "")
      ).length,
    };
  }, [items]);

  const loadTasks = async () => {
    if (!advisoryMatterId || !advisoryIssueId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("advisory_issue_tasks")
        .select("*")
        .eq("advisory_matter_id", advisoryMatterId)
        .eq("advisory_issue_id", advisoryIssueId)
        .is("deleted_at", null)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        alert("Load advisory issue tasks failed:\n" + error.message);
        setItems([]);
        return;
      }

      setItems((data || []) as TaskItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisoryMatterId, advisoryIssueId]);

  const startAdd = () => {
    if (!canEdit) return;
    setForm(emptyForm);
    setShowForm(true);
  };

  const startEdit = (item: TaskItem) => {
    if (!canEdit) return;
    setForm({
      id: item.id,
      title: item.title || "",
      task_type: normalizeOptionValue(item.task_type, taskTypeOptions),
      status: normalizeOptionValue(item.status, statusOptions),
      priority: normalizeOptionValue(item.priority, priorityOptions),
      assignee_name: item.assignee_name || "",
      due_date: item.due_date || "",
      completed_at: toDateTimeLocal(item.completed_at),
      note: item.note || "",
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setForm(emptyForm);
    setShowForm(false);
  };

  const saveTask = async () => {
    if (!canEdit) return;

    if (!form.title.trim()) {
      alert("Task title is required");
      return;
    }

    const completedAt =
      form.completed_at ||
      (form.status === "completed" ? new Date().toISOString() : "");

    const payload = {
      advisory_matter_id: advisoryMatterId,
      advisory_issue_id: advisoryIssueId,
      client_id: clientId || null,
      title: form.title.trim(),
      task_type: form.task_type,
      status: form.status,
      priority: form.priority,
      assignee_name: form.assignee_name.trim(),
      due_date: form.due_date || null,
      completed_at: completedAt ? new Date(completedAt).toISOString() : null,
      note: form.note.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      setSaving(true);

      if (form.id) {
        const oldData = items.find((item) => item.id === form.id) || null;
        const { data, error } = await supabase
          .from("advisory_issue_tasks")
          .update(payload)
          .eq("id", form.id)
          .eq("advisory_matter_id", advisoryMatterId)
          .eq("advisory_issue_id", advisoryIssueId)
          .is("deleted_at", null)
          .select("*")
          .maybeSingle();

        if (error || !data) {
          alert(
            "Update advisory issue task failed:\n" +
              (error?.message || "No row updated")
          );
          return;
        }

        await writeAuditLog("update", data.id, oldData, data);
      } else {
        const { data, error } = await supabase
          .from("advisory_issue_tasks")
          .insert([{ ...payload, created_at: new Date().toISOString() }])
          .select("*")
          .single();

        if (error || !data) {
          alert(
            "Create advisory issue task failed:\n" +
              (error?.message || "No row created")
          );
          return;
        }

        await writeAuditLog("create", data.id, null, data);
      }

      cancelForm();
      await loadTasks();
    } finally {
      setSaving(false);
    }
  };

  const softDeleteTask = async (item: TaskItem) => {
    if (!canDelete) return;

    const confirmed = window.confirm("Delete this advisory issue task?");
    if (!confirmed) return;

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from("advisory_issue_tasks")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actorName || "current_user",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("advisory_matter_id", advisoryMatterId)
        .eq("advisory_issue_id", advisoryIssueId)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        alert(
          "Soft delete advisory issue task failed:\n" +
            (error?.message || "No row updated")
        );
        return;
      }

      await writeAuditLog("soft_delete", item.id, item, data);
      if (form.id === item.id) cancelForm();
      await loadTasks();
    } finally {
      setSaving(false);
    }
  };

  const writeAuditLog = async (
    action: "create" | "update" | "soft_delete",
    recordId: string,
    oldData: unknown,
    newData: unknown
  ) => {
    try {
      await createAuditLog({
        caseId: null,
        tableName: "advisory_issue_tasks",
        recordId,
        action,
        oldData,
        newData,
        note: `Advisory issue task ${action}`,
      });
    } catch (auditError) {
      console.error("CREATE ADVISORY ISSUE TASK AUDIT FAILED:", auditError);
    }
  };

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Issue Tasks / Next Actions</h3>
          <div style={subTitleStyle}>Track follow-up work for this issue.</div>
        </div>
        {canEdit && !showForm ? (
          <button type="button" onClick={startAdd} style={primaryButtonStyle}>
            Add Task
          </button>
        ) : null}
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard label="Total" value={String(summary.total)} />
        <SummaryCard label="Active" value={String(summary.active)} />
        <SummaryCard label="Completed" value={String(summary.completed)} />
        <SummaryCard label="Urgent/High" value={String(summary.important)} />
      </div>

      {showForm ? (
        <div style={formStyle}>
          <Field
            label="Title"
            value={form.title}
            onChange={(value) => setForm({ ...form, title: value })}
          />
          <SelectField
            label="Task Type"
            value={form.task_type}
            onChange={(value) => setForm({ ...form, task_type: value })}
            options={taskTypeOptions}
          />
          <SelectField
            label="Status"
            value={form.status}
            onChange={(value) => setForm({ ...form, status: value })}
            options={statusOptions}
          />
          <SelectField
            label="Priority"
            value={form.priority}
            onChange={(value) => setForm({ ...form, priority: value })}
            options={priorityOptions}
          />
          <Field
            label="Assignee"
            value={form.assignee_name}
            onChange={(value) => setForm({ ...form, assignee_name: value })}
          />
          <Field
            label="Due Date"
            type="date"
            value={form.due_date}
            onChange={(value) => setForm({ ...form, due_date: value })}
          />
          <Field
            label="Completed At"
            type="datetime-local"
            value={form.completed_at}
            onChange={(value) => setForm({ ...form, completed_at: value })}
          />
          <Field
            label="Note"
            value={form.note}
            onChange={(value) => setForm({ ...form, note: value })}
          />
          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={saveTask}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? "Saving..." : "Save Task"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div style={messageStyle}>Loading advisory issue tasks...</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Assignee</th>
                <th style={thStyle}>Due</th>
                <th style={thStyle}>Completed</th>
                <th style={thStyle}>Note</th>
                {(canEdit || canDelete) && <th style={thStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{item.title || "-"}</td>
                  <td style={tdStyle}>
                    {renderOptionLabel(item.task_type, taskTypeOptions)}
                  </td>
                  <td style={tdStyle}>
                    {renderOptionLabel(item.status, statusOptions)}
                  </td>
                  <td style={tdStyle}>
                    {renderOptionLabel(item.priority, priorityOptions)}
                  </td>
                  <td style={tdStyle}>{item.assignee_name || "-"}</td>
                  <td style={tdStyle}>{item.due_date || "-"}</td>
                  <td style={tdStyle}>{formatDateTime(item.completed_at)}</td>
                  <td style={tdStyle}>{item.note || "-"}</td>
                  {(canEdit || canDelete) && (
                    <td style={tdStyle}>
                      <div style={actionWrapStyle}>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            style={smallButtonStyle}
                          >
                            Edit
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => softDeleteTask(item)}
                            style={dangerButtonStyle}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 ? (
            <div style={messageStyle}>No advisory issue tasks found.</div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function normalizeOptionValue(
  value: string | null | undefined,
  options: { value: string; label: string }[]
) {
  if (options.some((option) => option.value === value)) return value || "";
  return options[0]?.value || "";
}

function renderOptionLabel(
  value: string | null | undefined,
  options: { value: string; label: string }[]
) {
  const option = options.find((item) => item.value === value);
  return option?.label || value || "-";
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 16,
  borderBottom: "1px solid #eeeeee",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 900,
};

const subTitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#666666",
  fontSize: 13,
  fontWeight: 700,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 12,
  padding: 16,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 10,
  padding: 12,
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#666666",
  fontSize: 12,
  fontWeight: 800,
};

const summaryValueStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  fontWeight: 900,
};

const formStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  padding: 16,
  borderTop: "1px solid #eeeeee",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "end",
  flexWrap: "wrap",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #000000",
  borderRadius: 8,
  background: "#000000",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 800,
};

const smallButtonStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 800,
};

const dangerButtonStyle: React.CSSProperties = {
  ...smallButtonStyle,
  border: "1px solid #f0c4c4",
  background: "#fff5f5",
  color: "#a40000",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderTop: "1px solid #eeeeee",
  borderBottom: "1px solid #dddddd",
  background: "#f3f4f6",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 800,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #eeeeee",
  fontSize: 14,
  verticalAlign: "top",
};

const actionWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const messageStyle: React.CSSProperties = {
  padding: 16,
  fontWeight: 800,
};
