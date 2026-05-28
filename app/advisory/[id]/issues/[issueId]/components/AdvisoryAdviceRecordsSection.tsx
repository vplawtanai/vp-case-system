"use client";

import { useEffect, useState } from "react";
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

type AdviceRecord = {
  id: string;
  advisory_matter_id: string;
  advisory_issue_id: string;
  client_id?: string | null;
  advice_date?: string | null;
  channel?: string | null;
  question?: string | null;
  facts_received?: string | null;
  legal_analysis?: string | null;
  advice_given?: string | null;
  caveat?: string | null;
  follow_up?: string | null;
  responsible_person?: string | null;
};

type AdviceForm = {
  id: string;
  advice_date: string;
  channel: string;
  question: string;
  facts_received: string;
  legal_analysis: string;
  advice_given: string;
  caveat: string;
  follow_up: string;
  responsible_person: string;
};

const emptyForm: AdviceForm = {
  id: "",
  advice_date: getTodayDateString(),
  channel: "internal_note",
  question: "",
  facts_received: "",
  legal_analysis: "",
  advice_given: "",
  caveat: "",
  follow_up: "",
  responsible_person: "",
};

const channelOptions = [
  { value: "internal_note", label: "Internal Note" },
  { value: "phone", label: "Phone" },
  { value: "line", label: "LINE" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "document", label: "Document Review" },
  { value: "court_related", label: "Court-related" },
  { value: "other", label: "Other" },
];

export default function AdvisoryAdviceRecordsSection({
  advisoryMatterId,
  advisoryIssueId,
  clientId,
  canEdit,
  canDelete,
  actorName,
}: Props) {
  const [items, setItems] = useState<AdviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AdviceForm>(emptyForm);

  const loadRecords = async () => {
    if (!advisoryMatterId || !advisoryIssueId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("advisory_advice_records")
        .select("*")
        .eq("advisory_matter_id", advisoryMatterId)
        .eq("advisory_issue_id", advisoryIssueId)
        .is("deleted_at", null)
        .order("advice_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        alert("Load advice records failed:\n" + error.message);
        setItems([]);
        return;
      }

      setItems((data || []) as AdviceRecord[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisoryMatterId, advisoryIssueId]);

  const startAdd = () => {
    if (!canEdit) return;
    setForm({ ...emptyForm, advice_date: getTodayDateString() });
    setShowForm(true);
  };

  const startEdit = (item: AdviceRecord) => {
    if (!canEdit) return;
    setForm({
      id: item.id,
      advice_date: item.advice_date || getTodayDateString(),
      channel: normalizeOptionValue(item.channel, channelOptions),
      question: item.question || "",
      facts_received: item.facts_received || "",
      legal_analysis: item.legal_analysis || "",
      advice_given: item.advice_given || "",
      caveat: item.caveat || "",
      follow_up: item.follow_up || "",
      responsible_person: item.responsible_person || "",
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setForm(emptyForm);
    setShowForm(false);
  };

  const saveRecord = async () => {
    if (!canEdit) return;

    if (!form.advice_date) {
      alert("Advice date is required");
      return;
    }

    if (!form.advice_given.trim()) {
      alert("Advice given is required");
      return;
    }

    const payload = {
      advisory_matter_id: advisoryMatterId,
      advisory_issue_id: advisoryIssueId,
      client_id: clientId || null,
      advice_date: form.advice_date,
      channel: form.channel,
      question: form.question.trim(),
      facts_received: form.facts_received.trim(),
      legal_analysis: form.legal_analysis.trim(),
      advice_given: form.advice_given.trim(),
      caveat: form.caveat.trim(),
      follow_up: form.follow_up.trim(),
      responsible_person: form.responsible_person.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      setSaving(true);

      if (form.id) {
        const oldData = items.find((item) => item.id === form.id) || null;
        const { data, error } = await supabase
          .from("advisory_advice_records")
          .update(payload)
          .eq("id", form.id)
          .eq("advisory_matter_id", advisoryMatterId)
          .eq("advisory_issue_id", advisoryIssueId)
          .is("deleted_at", null)
          .select("*")
          .maybeSingle();

        if (error || !data) {
          alert(
            "Update advice record failed:\n" +
              (error?.message || "No row updated")
          );
          return;
        }

        await writeAuditLog("update", data.id, oldData, data);
      } else {
        const { data, error } = await supabase
          .from("advisory_advice_records")
          .insert([{ ...payload, created_at: new Date().toISOString() }])
          .select("*")
          .single();

        if (error || !data) {
          alert(
            "Create advice record failed:\n" +
              (error?.message || "No row created")
          );
          return;
        }

        await writeAuditLog("create", data.id, null, data);
      }

      cancelForm();
      await loadRecords();
    } finally {
      setSaving(false);
    }
  };

  const softDeleteRecord = async (item: AdviceRecord) => {
    if (!canDelete) return;

    const confirmed = window.confirm("Delete this advice record?");
    if (!confirmed) return;

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from("advisory_advice_records")
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
          "Soft delete advice record failed:\n" +
            (error?.message || "No row updated")
        );
        return;
      }

      await writeAuditLog("soft_delete", item.id, item, data);
      if (form.id === item.id) cancelForm();
      await loadRecords();
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
        tableName: "advisory_advice_records",
        recordId,
        action,
        oldData,
        newData,
        note: `Advisory advice record ${action}`,
      });
    } catch (auditError) {
      console.error("CREATE ADVISORY ADVICE AUDIT FAILED:", auditError);
    }
  };

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Advice Records</h3>
          <div style={subTitleStyle}>
            Record legal advice, facts, caveats, and follow-up.
          </div>
        </div>
        {canEdit && !showForm ? (
          <button type="button" onClick={startAdd} style={primaryButtonStyle}>
            Add Advice
          </button>
        ) : null}
      </div>

      {showForm ? (
        <div style={formStyle}>
          <Field
            label="Advice Date"
            type="date"
            value={form.advice_date}
            onChange={(value) => setForm({ ...form, advice_date: value })}
          />
          <SelectField
            label="Channel"
            value={form.channel}
            onChange={(value) => setForm({ ...form, channel: value })}
            options={channelOptions}
          />
          <Field
            label="Question"
            value={form.question}
            onChange={(value) => setForm({ ...form, question: value })}
          />
          <Field
            label="Facts Received"
            value={form.facts_received}
            onChange={(value) => setForm({ ...form, facts_received: value })}
          />
          <Field
            label="Legal Analysis"
            value={form.legal_analysis}
            onChange={(value) => setForm({ ...form, legal_analysis: value })}
          />
          <Field
            label="Advice Given"
            value={form.advice_given}
            onChange={(value) => setForm({ ...form, advice_given: value })}
          />
          <Field
            label="Caveat"
            value={form.caveat}
            onChange={(value) => setForm({ ...form, caveat: value })}
          />
          <Field
            label="Follow-up"
            value={form.follow_up}
            onChange={(value) => setForm({ ...form, follow_up: value })}
          />
          <Field
            label="Responsible Person"
            value={form.responsible_person}
            onChange={(value) =>
              setForm({ ...form, responsible_person: value })
            }
          />
          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={saveRecord}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? "Saving..." : "Save Advice"}
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
        <div style={messageStyle}>Loading advice records...</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Channel</th>
                <th style={thStyle}>Responsible</th>
                <th style={thStyle}>Question</th>
                <th style={thStyle}>Advice Given</th>
                <th style={thStyle}>Follow-up</th>
                {(canEdit || canDelete) && <th style={thStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{item.advice_date || "-"}</td>
                  <td style={tdStyle}>
                    {renderOptionLabel(item.channel, channelOptions)}
                  </td>
                  <td style={tdStyle}>{item.responsible_person || "-"}</td>
                  <td style={tdStyle}>
                    <TextPreview value={item.question} />
                  </td>
                  <td style={tdStyle}>
                    <TextPreview value={item.advice_given} />
                  </td>
                  <td style={tdStyle}>
                    <TextPreview value={item.follow_up} />
                  </td>
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
                            onClick={() => softDeleteRecord(item)}
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
            <div style={messageStyle}>No advice records found.</div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TextPreview({ value }: { value?: string | null }) {
  if (!value) return <span>-</span>;
  const shortText = value.length > 120 ? `${value.slice(0, 120)}...` : value;
  return (
    <details>
      <summary style={summaryStyle}>{shortText}</summary>
      <div style={fullTextStyle}>{value}</div>
    </details>
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

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
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

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "pre-wrap",
};

const fullTextStyle: React.CSSProperties = {
  marginTop: 8,
  maxWidth: 420,
  whiteSpace: "pre-wrap",
};
