"use client";

import { useEffect, useMemo, useState } from "react";
import { createAuditLog } from "../../../../lib/auditLog";
import { supabase } from "../../../../lib/supabase";

type AdvisoryTimeLog = {
  id: string;
  advisory_matter_id: string;
  client_id?: string | null;
  work_date?: string | null;
  staff_name?: string | null;
  work_type?: string | null;
  work_other?: string | null;
  minutes?: number | null;
  billable?: boolean | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TimeLogForm = {
  work_date: string;
  staff_name: string;
  work_type: string;
  work_other: string;
  hours: string;
  minutes: string;
  billable: boolean;
  note: string;
};

type ValidatedTimeLogForm = {
  staffName: string;
  totalMinutes: number;
};

type Props = {
  advisoryMatterId: string;
  clientId: string;
  canEdit: boolean;
  canDelete: boolean;
  actorName: string;
};

const workTypeOptions = [
  "Advisory",
  "Legal Opinion",
  "Contract Review",
  "Document Drafting",
  "Meeting / Consultation",
  "Corporate Support",
  "Compliance",
  "อื่นๆ",
];

const emptyForm: TimeLogForm = {
  work_date: getTodayDateString(),
  staff_name: "",
  work_type: "Advisory",
  work_other: "",
  hours: "0",
  minutes: "30",
  billable: true,
  note: "",
};

export default function AdvisoryTimeLogsSection({
  advisoryMatterId,
  clientId,
  canEdit,
  canDelete,
  actorName,
}: Props) {
  const [items, setItems] = useState<AdvisoryTimeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actorEmail, setActorEmail] = useState("");
  const [form, setForm] = useState<TimeLogForm>({
    ...emptyForm,
    staff_name: actorName || "",
  });

  useEffect(() => {
    const loadActorEmail = async () => {
      const { data } = await supabase.auth.getUser();
      setActorEmail(data.user?.email || data.user?.id || "");
    };

    loadActorEmail();
  }, []);

  const loadTimeLogs = async () => {
    if (!advisoryMatterId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("advisory_time_logs")
        .select("*")
        .eq("advisory_matter_id", advisoryMatterId)
        .is("deleted_at", null)
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        alert("Load advisory time logs failed:\n" + error.message);
        setItems([]);
        return;
      }

      setItems((data || []) as AdvisoryTimeLog[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisoryMatterId]);

  const summary = useMemo(() => {
    const byStaff = new Map<
      string,
      { total: number; core: number; support: number }
    >();

    let total = 0;
    let core = 0;
    let support = 0;

    items.forEach((item) => {
      const minutes = safeMinutes(item.minutes);
      const staff = item.staff_name || "-";
      const isCore = item.billable !== false;
      const current = byStaff.get(staff) || { total: 0, core: 0, support: 0 };

      total += minutes;
      current.total += minutes;

      if (isCore) {
        core += minutes;
        current.core += minutes;
      } else {
        support += minutes;
        current.support += minutes;
      }

      byStaff.set(staff, current);
    });

    return {
      total,
      core,
      support,
      byStaff: Array.from(byStaff.entries()),
    };
  }, [items]);

  const startAdd = () => {
    if (!canEdit) return;
    setEditingId(null);
    setForm({
      ...emptyForm,
      work_date: getTodayDateString(),
      staff_name: actorName || "",
    });
    setShowForm(true);
  };

  const startEdit = (item: AdvisoryTimeLog) => {
    if (!canEdit) return;

    const split = splitMinutes(safeMinutes(item.minutes));
    setEditingId(item.id);
    setForm({
      work_date: item.work_date || getTodayDateString(),
      staff_name: item.staff_name || actorName || "",
      work_type: item.work_type || "Advisory",
      work_other: item.work_other || "",
      hours: String(split.hours),
      minutes: String(split.minutes),
      billable: item.billable !== false,
      note: item.note || "",
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm({
      ...emptyForm,
      work_date: getTodayDateString(),
      staff_name: actorName || "",
    });
  };

  const validateForm = (): ValidatedTimeLogForm | null => {
    if (!workDateIsValid(form.work_date)) {
      alert("Work date is required");
      return null;
    }

    if (form.work_type === "อื่นๆ" && !form.work_other.trim()) {
      alert("กรุณากรอกประเภทงานอื่นๆ");
      return null;
    }

    const hours = Number(form.hours || 0);
    const minutes = Number(form.minutes || 0);

    if (Number.isNaN(hours) || hours < 0) {
      alert("Hours must be a valid number greater than or equal to 0");
      return null;
    }

    if (Number.isNaN(minutes) || minutes < 0) {
      alert("Minutes must be a valid number greater than or equal to 0");
      return null;
    }

    if (minutes > 59) {
      alert("Minutes must not exceed 59");
      return null;
    }

    const totalMinutes = buildTotalMinutes(form.hours, form.minutes);
    if (totalMinutes <= 0) {
      alert("Total time must be greater than 0 minutes");
      return null;
    }

    const staffName = form.staff_name.trim() || actorName || actorEmail;
    if (!staffName) {
      alert("Staff name is required");
      return null;
    }

    return {
      staffName,
      totalMinutes,
    };
  };

  const buildPayload = (validated: ValidatedTimeLogForm) => ({
    advisory_matter_id: advisoryMatterId,
    client_id: clientId || null,
    work_date: form.work_date,
    staff_name: validated.staffName,
    work_type: form.work_type,
    work_other: form.work_type === "อื่นๆ" ? form.work_other.trim() : "",
    minutes: validated.totalMinutes,
    billable: form.billable,
    note: form.note.trim(),
    updated_at: new Date().toISOString(),
  });

  const saveTimeLog = async () => {
    if (!canEdit) return;
    const validated = validateForm();
    if (!validated) return;

    try {
      setSaving(true);

      if (editingId) {
        const oldData = items.find((item) => item.id === editingId) || null;
        const payload = buildPayload(validated);
        const { data, error } = await supabase
          .from("advisory_time_logs")
          .update(payload)
          .eq("id", editingId)
          .is("deleted_at", null)
          .select("*")
          .maybeSingle();

        if (error || !data) {
          alert(
            "Update advisory time log failed:\n" +
              (error?.message || "No row updated")
          );
          return;
        }

        await writeAuditLog("update", editingId, oldData, data);
      } else {
        const payload = {
          ...buildPayload(validated),
          created_at: new Date().toISOString(),
          deleted_at: null,
          deleted_by: null,
        };
        const { data, error } = await supabase
          .from("advisory_time_logs")
          .insert([payload])
          .select("*")
          .single();

        if (error || !data) {
          alert(
            "Create advisory time log failed:\n" +
              (error?.message || "No row created")
          );
          return;
        }

        await writeAuditLog("create", data.id, null, data);
      }

      cancelForm();
      await loadTimeLogs();
    } finally {
      setSaving(false);
    }
  };

  const softDeleteTimeLog = async (id: string) => {
    if (!canDelete) return;

    const confirmed = window.confirm("Delete this advisory time log?");
    if (!confirmed) return;

    try {
      setSaving(true);

      const oldData = items.find((item) => item.id === id) || null;
      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: actorName || "current_user",
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("advisory_time_logs")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        alert(
          "Soft delete advisory time log failed:\n" +
            (error?.message || "No row updated")
        );
        return;
      }

      await writeAuditLog("soft_delete", id, oldData, data);
      if (editingId === id) cancelForm();
      await loadTimeLogs();
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
        tableName: "advisory_time_logs",
        recordId,
        action,
        oldData,
        newData,
        note: `Advisory time log ${action}`,
      });
    } catch (auditError) {
      console.error("CREATE ADVISORY TIME LOG AUDIT FAILED:", auditError);
    }
  };

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Advisory Time Logs</h3>
          <div style={subTitleStyle}>Track advisory work time by staff.</div>
        </div>
        {canEdit && !showForm ? (
          <button type="button" onClick={startAdd} style={primaryButtonStyle}>
            Add Time
          </button>
        ) : null}
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard label="Total" value={formatDuration(summary.total)} />
        <SummaryCard label="Core" value={formatDuration(summary.core)} />
        <SummaryCard label="Support" value={formatDuration(summary.support)} />
      </div>

      {summary.byStaff.length > 0 ? (
        <div style={byStaffStyle}>
          {summary.byStaff.map(([staff, value]) => (
            <div key={staff}>
              <strong>{staff}</strong>: {formatDuration(value.total)} (Core{" "}
              {formatDuration(value.core)} / Support{" "}
              {formatDuration(value.support)})
            </div>
          ))}
        </div>
      ) : null}

      {showForm ? (
        <div style={formStyle}>
          <Field
            label="Work date"
            type="date"
            value={form.work_date}
            onChange={(value) => setForm({ ...form, work_date: value })}
          />
          <Field
            label="Staff name"
            value={form.staff_name}
            onChange={(value) => setForm({ ...form, staff_name: value })}
          />
          <SelectField
            label="Work type"
            value={form.work_type}
            onChange={(value) => setForm({ ...form, work_type: value })}
            options={workTypeOptions.map((item) => ({
              value: item,
              label: item,
            }))}
          />
          {form.work_type === "อื่นๆ" ? (
            <Field
              label="Other work"
              value={form.work_other}
              onChange={(value) => setForm({ ...form, work_other: value })}
            />
          ) : null}
          <Field
            label="Hours"
            type="number"
            value={form.hours}
            onChange={(value) => setForm({ ...form, hours: value })}
          />
          <Field
            label="Minutes"
            type="number"
            value={form.minutes}
            onChange={(value) => setForm({ ...form, minutes: value })}
          />
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={form.billable}
              onChange={(event) =>
                setForm({ ...form, billable: event.target.checked })
              }
            />
            Core work
          </label>
          <Field
            label="Note"
            value={form.note}
            onChange={(value) => setForm({ ...form, note: value })}
          />
          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={saveTimeLog}
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
        <div style={messageStyle}>Loading time logs...</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Staff</th>
                <th style={thStyle}>Work Type</th>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Note</th>
                {(canEdit || canDelete) && <th style={thStyle}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{item.work_date || "-"}</td>
                  <td style={tdStyle}>{item.staff_name || "-"}</td>
                  <td style={tdStyle}>
                    {item.work_type === "อื่นๆ"
                      ? item.work_other || "อื่นๆ"
                      : item.work_type || "-"}
                  </td>
                  <td style={tdStyle}>{formatDuration(item.minutes || 0)}</td>
                  <td style={tdStyle}>
                    {item.billable === false ? "Support" : "Core"}
                  </td>
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
                            onClick={() => softDeleteTimeLog(item.id)}
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
            <div style={messageStyle}>No advisory time logs found.</div>
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

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function workDateIsValid(value: string) {
  return value.trim() !== "";
}

function buildTotalMinutes(hoursText: string, minutesText: string) {
  const hours = Number(hoursText || 0);
  const minutes = Number(minutesText || 0);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return Math.max(0, hours * 60 + minutes);
}

function splitMinutes(totalMinutes: number) {
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function safeMinutes(value?: number | null) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return 0;
  return num;
}

function formatDuration(value: number) {
  const safeValue = safeMinutes(value);
  const hours = Math.floor(safeValue / 60);
  const minutes = safeValue % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
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
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
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

const byStaffStyle: React.CSSProperties = {
  padding: "0 16px 16px 16px",
  color: "#333333",
  fontSize: 13,
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

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  minHeight: 40,
  fontSize: 13,
  fontWeight: 800,
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
  minWidth: 880,
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
