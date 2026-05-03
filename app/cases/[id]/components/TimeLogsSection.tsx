"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

type TimeLogItem = {
  id: string;
  case_id: number;

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

type Props = {
  caseId: string;
};

const workTypeOptions = [
  "สอบข้อเท็จจริง",
  "ตรวจเอกสาร",
  "ค้นข้อกฎหมาย",
  "วางรูปคดี / กลยุทธ์",
  "ร่างเอกสาร",
  "แก้ไขเอกสาร",
  "ติดต่อศาล",
  "ติดต่อราชการ",
  "ติดต่อคู่ความ / ลูกความ",
  "ประชุม",
  "เดินทาง",
  "ว่าความ / ไปศาล",
  "ติดตามงาน",
  "อื่นๆ",
];

const staffOptions = [
  "ทนายเป้า",
  "ทนายตุลย์",
  "แพม",
  "แตงโม",
  "อื่นๆ",
];

const timeCategoryOptions = [
  {
    value: "core",
    label: "Core Work / เนื้องานหลัก",
  },
  {
    value: "support",
    label: "Support Time / เวลาสนับสนุน",
  },
];

const emptyForm: TimeLogForm = {
  work_date: getTodayDateString(),
  staff_name: "ทนายเป้า",
  work_type: "สอบข้อเท็จจริง",
  work_other: "",
  hours: "0",
  minutes: "30",
  billable: true,
  note: "",
};

export default function TimeLogsSection({ caseId }: Props) {
  const caseIdNumber = Number(caseId);

  const [items, setItems] = useState<TimeLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TimeLogForm>(emptyForm);

  const loadTimeLogs = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("case_time_logs")
        .select("*")
        .eq("case_id", caseIdNumber)
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        alert("Load time logs failed:\n" + JSON.stringify(error, null, 2));
        setItems([]);
        return;
      }

      setItems((data || []) as TimeLogItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const summary = useMemo(() => {
    const totalMinutes = items.reduce((sum, item) => sum + (item.minutes || 0), 0);

    const coreWorkMinutes = items
      .filter((item) => item.billable !== false)
      .reduce((sum, item) => sum + (item.minutes || 0), 0);

    const supportTimeMinutes = totalMinutes - coreWorkMinutes;

    const byStaffMap = new Map<string, number>();

    items.forEach((item) => {
      const staff = item.staff_name || "-";
      byStaffMap.set(staff, (byStaffMap.get(staff) || 0) + (item.minutes || 0));
    });

    const byStaff = Array.from(byStaffMap.entries())
      .map(([staff, minutes]) => ({ staff, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    return {
      totalMinutes,
      coreWorkMinutes,
      supportTimeMinutes,
      byStaff,
    };
  }, [items]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aDate = a.work_date || "";
      const bDate = b.work_date || "";

      if (aDate !== bDate) return bDate.localeCompare(aDate);

      return (b.created_at || "").localeCompare(a.created_at || "");
    });
  }, [items]);

  const startAdd = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      work_date: getTodayDateString(),
    });
    setShowForm(true);
  };

  const startEdit = (item: TimeLogItem) => {
    const split = splitMinutes(item.minutes || 0);

    setEditingId(item.id);
    setShowForm(true);

    setForm({
      work_date: item.work_date || getTodayDateString(),
      staff_name: item.staff_name || "ทนายเป้า",
      work_type: item.work_type || "สอบข้อเท็จจริง",
      work_other: item.work_other || "",
      hours: String(split.hours),
      minutes: String(split.minutes),
      billable: item.billable !== false,
      note: item.note || "",
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  };

  const validateForm = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return false;
    }

    if (!form.work_date) {
      alert("กรุณาเลือกวันที่ทำงาน");
      return false;
    }

    if (!form.staff_name.trim()) {
      alert("กรุณาเลือกหรือกรอกผู้ทำงาน");
      return false;
    }

    if (form.staff_name === "อื่นๆ") {
      alert("ตอนนี้ช่องผู้ทำงานอื่นๆ ยังไม่ได้แยกไว้ ให้พิมพ์ชื่อจริงแทนคำว่าอื่นๆ ก่อน");
      return false;
    }

    if (!form.work_type.trim()) {
      alert("กรุณาเลือกประเภทงาน");
      return false;
    }

    if (form.work_type === "อื่นๆ" && !form.work_other.trim()) {
      alert("กรุณากรอกประเภทงานอื่นๆ");
      return false;
    }

    const totalMinutes = buildTotalMinutes(form.hours, form.minutes);

    if (totalMinutes <= 0) {
      alert("กรุณากรอกเวลาที่ใช้มากกว่า 0 นาที");
      return false;
    }

    return true;
  };

  const buildPayload = () => {
    const now = new Date().toISOString();

    return {
      case_id: caseIdNumber,

      work_date: form.work_date,
      staff_name: form.staff_name,

      work_type: form.work_type,
      work_other: form.work_type === "อื่นๆ" ? form.work_other : "",

      minutes: buildTotalMinutes(form.hours, form.minutes),
      billable: form.billable,

      note: form.note,

      updated_at: now,
    };
  };

  const createTimeLog = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);

      const { error } = await supabase.from("case_time_logs").insert([
        {
          ...buildPayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create time log failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadTimeLogs();
    } finally {
      setSaving(false);
    }
  };

  const updateTimeLog = async () => {
    if (!editingId) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("case_time_logs")
        .update(buildPayload())
        .eq("id", editingId);

      if (error) {
        alert("Update time log failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadTimeLogs();
    } finally {
      setSaving(false);
    }
  };

  const deleteTimeLog = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบ Time Log นี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("case_time_logs")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Delete time log failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingId === id) cancelForm();

    await loadTimeLogs();
  };

  return (
    <div id="timelogs" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Time Logs</h3>
          <div style={subTitleStyle}>
            บันทึกเวลาทำงาน แยกเนื้องานหลักและเวลาสนับสนุน
          </div>
        </div>

        {!showForm ? (
          <button type="button" onClick={startAdd} style={primaryButtonStyle}>
            + Add Time
          </button>
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard
          label="Total Time"
          value={formatDuration(summary.totalMinutes)}
        />
        <SummaryCard
          label="Core Work"
          value={formatDuration(summary.coreWorkMinutes)}
        />
        <SummaryCard
          label="Support Time"
          value={formatDuration(summary.supportTimeMinutes)}
        />
        <SummaryCard label="Entries" value={String(items.length)} />
      </div>

      {summary.byStaff.length > 0 && (
        <div style={staffSummaryStyle}>
          <div style={staffSummaryTitleStyle}>Time by Staff</div>
          <div style={staffChipWrapStyle}>
            {summary.byStaff.map((row) => (
              <span key={row.staff} style={staffChipStyle}>
                {row.staff}: {formatDuration(row.minutes)}
              </span>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div style={formCardStyle}>
          <h4 style={formTitleStyle}>
            {editingId ? "Edit Time Log" : "Add Time Log"}
          </h4>

          <div style={formGridStyle}>
            <Input
              label="วันที่ทำงาน"
              type="date"
              value={form.work_date}
              onChange={(value) => setForm({ ...form, work_date: value })}
            />

            <Select
              label="ผู้ทำงาน"
              value={form.staff_name}
              onChange={(value) => setForm({ ...form, staff_name: value })}
              options={staffOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            <Select
              label="ประเภทงาน"
              value={form.work_type}
              onChange={(value) =>
                setForm({
                  ...form,
                  work_type: value,
                  work_other: value === "อื่นๆ" ? form.work_other : "",
                })
              }
              options={workTypeOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            {form.work_type === "อื่นๆ" && (
              <Input
                label="ระบุประเภทงานอื่นๆ"
                value={form.work_other}
                onChange={(value) => setForm({ ...form, work_other: value })}
                placeholder="กรอกประเภทงาน"
              />
            )}

            <Select
              label="Time Category"
              value={form.billable ? "core" : "support"}
              onChange={(value) =>
                setForm({
                  ...form,
                  billable: value === "core",
                })
              }
              options={timeCategoryOptions}
            />

            <div>
              <label style={labelStyle}>เวลาที่ใช้</label>
              <div style={durationInputWrapStyle}>
                <input
                  type="number"
                  min="0"
                  value={form.hours}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hours: sanitizeNumberString(e.target.value),
                    })
                  }
                  style={inputStyle}
                />
                <span style={durationUnitStyle}>ชั่วโมง</span>

                <input
                  type="number"
                  min="0"
                  max="59"
                  value={form.minutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      minutes: sanitizeNumberString(e.target.value),
                    })
                  }
                  style={inputStyle}
                />
                <span style={durationUnitStyle}>นาที</span>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="รายละเอียดงาน"
                value={form.note}
                onChange={(value) => setForm({ ...form, note: value })}
                placeholder="เช่น ประชุมลูกความเพื่อสอบข้อเท็จจริงเพิ่มเติม..."
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={editingId ? updateTimeLog : createTimeLog}
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
      )}

      {loading ? (
        <div style={emptyStyle}>Loading time logs...</div>
      ) : sortedItems.length === 0 ? (
        <div style={emptyStyle}>No time logs added.</div>
      ) : (
        <div style={logListStyle}>
          {sortedItems.map((item) => (
            <TimeLogCard
              key={item.id}
              item={item}
              onEdit={startEdit}
              onDelete={deleteTimeLog}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function TimeLogCard({
  item,
  onEdit,
  onDelete,
}: {
  item: TimeLogItem;
  onEdit: (item: TimeLogItem) => void;
  onDelete: (id: string) => void;
}) {
  const workText =
    item.work_type === "อื่นๆ" ? item.work_other || "อื่นๆ" : item.work_type || "-";

  const isCoreWork = item.billable !== false;

  return (
    <div style={logCardStyle}>
      <div style={logHeaderStyle}>
        <div>
          <div style={logTitleStyle}>
            {workText} • {formatDuration(item.minutes || 0)}
          </div>
          <div style={logMetaStyle}>
            {formatDisplayDate(item.work_date)} • {item.staff_name || "-"}
          </div>
        </div>

        <span style={isCoreWork ? coreWorkBadgeStyle : supportTimeBadgeStyle}>
          {isCoreWork ? "Core Work" : "Support Time"}
        </span>
      </div>

      {item.note && <div style={noteBlockStyle}>{item.note}</div>}

      <div style={actionWrapStyle}>
        <button type="button" onClick={() => onEdit(item)} style={smallButtonStyle}>
          Edit
        </button>

        <button
          type="button"
          onClick={() => onDelete(item.id)}
          style={dangerButtonStyle}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function Select({
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
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={textareaStyle}
      />
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function sanitizeNumberString(value: string) {
  return value.replace(/[^\d]/g, "");
}

function buildTotalMinutes(hours: string, minutes: string) {
  const h = Number(hours || 0);
  const m = Number(minutes || 0);

  return h * 60 + m;
}

function splitMinutes(totalMinutes: number) {
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function formatDuration(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h <= 0) return `${m} นาที`;
  if (m <= 0) return `${h} ชม.`;

  return `${h} ชม. ${m} นาที`;
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/* =========================================================
   STYLES
========================================================= */

const sectionStyle: CSSProperties = {
  border: "1px solid #dddddd",
  padding: 16,
  borderRadius: 12,
  background: "#ffffff",
  color: "#111111",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 16,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
};

const subTitleStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  background: "#000000",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  background: "#ffffff",
  color: "#111111",
  borderRadius: 8,
  border: "1px solid #cccccc",
  cursor: "pointer",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 14,
  background: "#fafafa",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 6,
  fontWeight: 600,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  color: "#111111",
};

const staffSummaryStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 12,
  background: "#ffffff",
  marginBottom: 14,
};

const staffSummaryTitleStyle: CSSProperties = {
  fontWeight: 800,
  marginBottom: 8,
  color: "#111111",
};

const staffChipWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const staffChipStyle: CSSProperties = {
  display: "inline-flex",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #dddddd",
  background: "#f8fafc",
  color: "#111111",
  fontSize: 13,
  fontWeight: 700,
};

const formCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 16,
  background: "#fafafa",
  marginBottom: 18,
};

const formTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  color: "#111111",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#222222",
  fontWeight: 600,
  fontSize: 13,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  background: "#ffffff",
  color: "#111111",
  colorScheme: "light",
  boxSizing: "border-box",
};

const durationInputWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr auto",
  gap: 8,
  alignItems: "center",
};

const durationUnitStyle: CSSProperties = {
  color: "#333333",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 90,
  resize: "vertical",
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
  flexWrap: "wrap",
};

const emptyStyle: CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
};

const logListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const logCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const logHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 10,
};

const logTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#111111",
  lineHeight: 1.45,
};

const logMetaStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
  fontWeight: 600,
};

const coreWorkBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#e6f4ea",
  color: "#067647",
  border: "1px solid #b9dfc3",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const supportTimeBadgeStyle: CSSProperties = {
  ...coreWorkBadgeStyle,
  background: "#f1f5f9",
  color: "#475467",
  border: "1px solid #d0d5dd",
};

const noteBlockStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
  color: "#111111",
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const actionWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
  flexWrap: "wrap",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 600,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 700,
};