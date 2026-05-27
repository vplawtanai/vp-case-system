"use client";

import { useEffect, useState } from "react";
import { createAuditLog } from "../../../../lib/auditLog";
import { supabase } from "../../../../lib/supabase";

type AdvisoryIssue = {
  id: string;
  advisory_matter_id: string;
  client_id?: string | null;
  issue_no?: string | null;
  title?: string | null;
  issue_type?: string | null;
  status?: string | null;
  priority?: string | null;
  responsible_person?: string | null;
  opened_at?: string | null;
  due_date?: string | null;
  closed_at?: string | null;
  summary?: string | null;
  legal_position?: string | null;
  next_action?: string | null;
  note?: string | null;
};

type IssueForm = {
  id: string;
  issue_no: string;
  title: string;
  issue_type: string;
  status: string;
  priority: string;
  responsible_person: string;
  opened_at: string;
  due_date: string;
  closed_at: string;
  summary: string;
  legal_position: string;
  next_action: string;
  note: string;
};

type Props = {
  advisoryMatterId: string;
  clientId: string;
  canEdit: boolean;
  canDelete: boolean;
  actorName: string;
  onIssuesChange?: (issues: AdvisoryIssue[]) => void;
};

const emptyForm: IssueForm = {
  id: "",
  issue_no: "",
  title: "",
  issue_type: "general",
  status: "open",
  priority: "normal",
  responsible_person: "",
  opened_at: "",
  due_date: "",
  closed_at: "",
  summary: "",
  legal_position: "",
  next_action: "",
  note: "",
};

const issueTypeOptions = [
  { value: "general", label: "General" },
  { value: "labor", label: "Labor" },
  { value: "contract", label: "Contract" },
  { value: "corporate", label: "Corporate" },
  { value: "compliance", label: "Compliance" },
  { value: "dispute", label: "Dispute" },
  { value: "license", label: "License / Permit" },
  { value: "tax", label: "Tax" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
];

const statusOptions = [
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function AdvisoryIssuesSection({
  advisoryMatterId,
  clientId,
  canEdit,
  canDelete,
  actorName,
  onIssuesChange,
}: Props) {
  const [items, setItems] = useState<AdvisoryIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<IssueForm>(emptyForm);

  const loadIssues = async () => {
    if (!advisoryMatterId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("advisory_issues")
        .select("*")
        .eq("advisory_matter_id", advisoryMatterId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        alert("Load advisory issues failed:\n" + error.message);
        setItems([]);
        onIssuesChange?.([]);
        return;
      }

      const loaded = (data || []) as AdvisoryIssue[];
      setItems(loaded);
      onIssuesChange?.(loaded);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisoryMatterId]);

  const startAdd = () => {
    setForm(emptyForm);
    setShowForm(true);
  };

  const startEdit = (item: AdvisoryIssue) => {
    setForm({
      id: item.id,
      issue_no: item.issue_no || "",
      title: item.title || "",
      issue_type: normalizeOptionValue(item.issue_type, issueTypeOptions),
      status: normalizeOptionValue(item.status, statusOptions),
      priority: normalizeOptionValue(item.priority, priorityOptions),
      responsible_person: item.responsible_person || "",
      opened_at: item.opened_at || "",
      due_date: item.due_date || "",
      closed_at: item.closed_at || "",
      summary: item.summary || "",
      legal_position: item.legal_position || "",
      next_action: item.next_action || "",
      note: item.note || "",
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setForm(emptyForm);
    setShowForm(false);
  };

  const saveIssue = async () => {
    if (!canEdit) return;

    if (!form.title.trim()) {
      alert("Issue title is required");
      return;
    }

    const payload = {
      advisory_matter_id: advisoryMatterId,
      client_id: clientId || null,
      issue_no: form.issue_no.trim(),
      title: form.title.trim(),
      issue_type: form.issue_type,
      status: form.status,
      priority: form.priority,
      responsible_person: form.responsible_person.trim(),
      opened_at: form.opened_at || null,
      due_date: form.due_date || null,
      closed_at: form.closed_at || null,
      summary: form.summary.trim(),
      legal_position: form.legal_position.trim(),
      next_action: form.next_action.trim(),
      note: form.note.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      setSaving(true);

      if (form.id) {
        const oldData = items.find((item) => item.id === form.id) || null;
        const { data, error } = await supabase
          .from("advisory_issues")
          .update(payload)
          .eq("id", form.id)
          .is("deleted_at", null)
          .select("*")
          .maybeSingle();

        if (error || !data) {
          alert(
            "Update advisory issue failed:\n" +
              (error?.message || "No row updated")
          );
          return;
        }

        await writeAuditLog("update", data.id, oldData, data);
      } else {
        const { data, error } = await supabase
          .from("advisory_issues")
          .insert([{ ...payload, created_at: new Date().toISOString() }])
          .select("*")
          .single();

        if (error || !data) {
          alert(
            "Create advisory issue failed:\n" +
              (error?.message || "No row created")
          );
          return;
        }

        await writeAuditLog("create", data.id, null, data);
      }

      cancelForm();
      await loadIssues();
    } finally {
      setSaving(false);
    }
  };

  const softDeleteIssue = async (id: string) => {
    if (!canDelete) return;

    const confirmed = window.confirm("Delete this advisory issue?");
    if (!confirmed) return;

    try {
      setSaving(true);

      const oldData = items.find((item) => item.id === id) || null;
      const { data, error } = await supabase
        .from("advisory_issues")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actorName || "current_user",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        alert(
          "Soft delete advisory issue failed:\n" +
            (error?.message || "No row updated")
        );
        return;
      }

      await writeAuditLog("soft_delete", id, oldData, data);
      await loadIssues();
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
        tableName: "advisory_issues",
        recordId,
        action,
        oldData,
        newData,
        note: `Advisory issue ${action}`,
      });
    } catch (auditError) {
      console.error("CREATE ADVISORY ISSUE AUDIT FAILED:", auditError);
    }
  };

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Advisory Issues / Workstreams</h3>
          <div style={subTitleStyle}>Track advisory issues under this matter.</div>
        </div>
        {canEdit && !showForm ? (
          <button type="button" onClick={startAdd} style={primaryButtonStyle}>
            Add Issue
          </button>
        ) : null}
      </div>

      {showForm ? (
        <div style={formStyle}>
          <Field
            label="Issue no"
            value={form.issue_no}
            onChange={(value) => setForm({ ...form, issue_no: value })}
          />
          <Field
            label="Title"
            value={form.title}
            onChange={(value) => setForm({ ...form, title: value })}
          />
          <SelectField
            label="Issue type"
            value={form.issue_type}
            onChange={(value) => setForm({ ...form, issue_type: value })}
            options={issueTypeOptions}
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
            label="Responsible person"
            value={form.responsible_person}
            onChange={(value) =>
              setForm({ ...form, responsible_person: value })
            }
          />
          <Field
            label="Opened at"
            type="date"
            value={form.opened_at}
            onChange={(value) => setForm({ ...form, opened_at: value })}
          />
          <Field
            label="Due date"
            type="date"
            value={form.due_date}
            onChange={(value) => setForm({ ...form, due_date: value })}
          />
          <Field
            label="Closed at"
            type="date"
            value={form.closed_at}
            onChange={(value) => setForm({ ...form, closed_at: value })}
          />
          <Field
            label="Summary"
            value={form.summary}
            onChange={(value) => setForm({ ...form, summary: value })}
          />
          <Field
            label="Legal position"
            value={form.legal_position}
            onChange={(value) => setForm({ ...form, legal_position: value })}
          />
          <Field
            label="Next action"
            value={form.next_action}
            onChange={(value) => setForm({ ...form, next_action: value })}
          />
          <Field
            label="Note"
            value={form.note}
            onChange={(value) => setForm({ ...form, note: value })}
          />
          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={saveIssue}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? "Saving..." : "Save"}
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
        <div style={messageStyle}>Loading advisory issues...</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Issue No</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Responsible</th>
                <th style={thStyle}>Opened</th>
                <th style={thStyle}>Due</th>
                <th style={thStyle}>Closed</th>
                <th style={thStyle}>Next Action</th>
                {(canEdit || canDelete) && <th style={thStyle}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{item.issue_no || "-"}</td>
                  <td style={tdStyle}>{item.title || "-"}</td>
                  <td style={tdStyle}>
                    {renderOptionLabel(item.issue_type, issueTypeOptions)}
                  </td>
                  <td style={tdStyle}>
                    {renderOptionLabel(item.status, statusOptions)}
                  </td>
                  <td style={tdStyle}>
                    {renderOptionLabel(item.priority, priorityOptions)}
                  </td>
                  <td style={tdStyle}>{item.responsible_person || "-"}</td>
                  <td style={tdStyle}>{item.opened_at || "-"}</td>
                  <td style={tdStyle}>{item.due_date || "-"}</td>
                  <td style={tdStyle}>{item.closed_at || "-"}</td>
                  <td style={tdStyle}>{item.next_action || "-"}</td>
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
                            onClick={() => softDeleteIssue(item.id)}
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
            <div style={messageStyle}>No advisory issues found.</div>
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

const formStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  padding: 16,
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
  minWidth: 1100,
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
