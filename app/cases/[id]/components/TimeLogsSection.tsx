"use client";
import { useCaseDetailText } from "../labels";

import CaseEditModal from "../CaseEditModal";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";
import { createAuditLog } from "../../../../lib/auditLog";

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

  created_by_user_id?: string | null;
  created_by_email?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  deleted_at?: string | null;
  deleted_by?: string | null;
};

type TimeLogForm = {
  work_date: string;
  staff_name: string;
  staff_other: string;
  work_type: string;
  work_other: string;
  hours: string;
  minutes: string;
  billable: boolean;
  note: string;
};

type Props = {
  caseId: string;
  canEdit?: boolean;
  canDelete?: boolean;
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

const staffOptions = ["ทนายเป้า", "ทนายตุลย์", "แพม", "แตงโม", "อื่นๆ"];

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
  staff_other: "",
  work_type: "สอบข้อเท็จจริง",
  work_other: "",
  hours: "0",
  minutes: "30",
  billable: true,
  note: "",
};

export default function TimeLogsSection({
  caseId,
  canEdit = false,
  canDelete = false,
}: Props) {
  const { tr } = useCaseDetailText();
  const caseIdNumber = Number(caseId);

  const [items, setItems] = useState<TimeLogItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TimeLogForm>(emptyForm);
  const [actorUserId, setActorUserId] = useState("");
  const [actorEmail, setActorEmail] = useState("");


  useEffect(() => {
    const loadActor = async () => {
      const { data } = await supabase.auth.getUser();
      setActorUserId(data.user?.id || "");
      setActorEmail(data.user?.email || "");
    };

    void loadActor();
  }, []);


  const loadTimeLogs = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("case_time_logs")
        .select("*")
        .eq("case_id", caseIdNumber)
        .is("deleted_at", null)
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        alert(tr("Load time logs failed:\n" + JSON.stringify(error, null, 2)));
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
    const totalMinutes = items.reduce(
      (sum, item) => sum + safeMinutes(item.minutes),
      0
    );

    const coreWorkMinutes = items
      .filter((item) => item.billable !== false)
      .reduce((sum, item) => sum + safeMinutes(item.minutes), 0);

    const supportTimeMinutes = totalMinutes - coreWorkMinutes;

    const byStaffMap = new Map<
      string,
      {
        totalMinutes: number;
        coreWorkMinutes: number;
        supportTimeMinutes: number;
      }
    >();

    items.forEach((item) => {
      const staff = item.staff_name || "-";
      const minutes = safeMinutes(item.minutes);
      const isCoreWork = item.billable !== false;

      const existing = byStaffMap.get(staff) || {
        totalMinutes: 0,
        coreWorkMinutes: 0,
        supportTimeMinutes: 0,
      };

      existing.totalMinutes += minutes;

      if (isCoreWork) {
        existing.coreWorkMinutes += minutes;
      } else {
        existing.supportTimeMinutes += minutes;
      }

      byStaffMap.set(staff, existing);
    });

    const byStaff = Array.from(byStaffMap.entries())
      .map(([staff, value]) => ({
        staff,
        totalMinutes: value.totalMinutes,
        coreWorkMinutes: value.coreWorkMinutes,
        supportTimeMinutes: value.supportTimeMinutes,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

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
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่ม Time Log"));
      return;
    }

    setEditingId(null);
    setForm({
      ...emptyForm,
      work_date: getTodayDateString(),
    });
    setShowForm(true);

  };

  const canEditTimeLogRow = (item: TimeLogItem) => {
    if (canDelete) return true;
    if (!canEdit) return false;
    if (item.created_by_user_id) return item.created_by_user_id === actorUserId;
    if (item.created_by_email) return item.created_by_email === actorEmail;
    return false;
  };

  const startEdit = (item: TimeLogItem) => {
    if (!canEditTimeLogRow(item)) {
      alert(tr("You can edit only your own time log."));
      return;
    }

    const split = splitMinutes(safeMinutes(item.minutes));
    const savedStaffName = item.staff_name || "ทนายเป้า";
    const isKnownStaff = staffOptions.includes(savedStaffName);

    setEditingId(item.id);
    setShowForm(true);

    setForm({
      work_date: item.work_date || getTodayDateString(),
      staff_name: isKnownStaff ? savedStaffName : "อื่นๆ",
      staff_other: isKnownStaff ? "" : savedStaffName,
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
    setForm({
      ...emptyForm,
      work_date: getTodayDateString(),
    });
  };

  const validateForm = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert(tr("Missing case id"));
      return false;
    }

    if (!form.work_date) {
      alert(tr("กรุณาเลือกวันที่ทำงาน"));
      return false;
    }

    if (!form.staff_name.trim()) {
      alert(tr("กรุณาเลือกหรือกรอกผู้ทำงาน"));
      return false;
    }

    if (form.staff_name === "อื่นๆ" && !form.staff_other.trim()) {
      alert(tr("กรุณากรอกชื่อผู้ทำงานอื่นๆ"));
      return false;
    }

    if (!form.work_type.trim()) {
      alert(tr("กรุณาเลือกประเภทงาน"));
      return false;
    }

    if (form.work_type === "อื่นๆ" && !form.work_other.trim()) {
      alert(tr("กรุณากรอกประเภทงานอื่นๆ"));
      return false;
    }

    const totalMinutes = buildTotalMinutes(form.hours, form.minutes);

    if (totalMinutes <= 0) {
      alert(tr("กรุณากรอกเวลาที่ใช้มากกว่า 0 นาที"));
      return false;
    }

    if (Number(form.minutes || 0) > 59) {
      alert(tr("ช่องนาทีต้องไม่เกิน 59 นาที"));
      return false;
    }

    return true;
  };

  const buildPayload = () => {
    const now = new Date().toISOString();

    const finalStaffName =
      form.staff_name === "อื่นๆ" ? form.staff_other.trim() : form.staff_name;

    return {
      case_id: caseIdNumber,

      work_date: form.work_date,
      staff_name: finalStaffName,

      work_type: form.work_type,
      work_other: form.work_type === "อื่นๆ" ? form.work_other.trim() : "",

      minutes: buildTotalMinutes(form.hours, form.minutes),
      billable: form.billable,

      note: form.note.trim(),

      updated_at: now,
    };
  };

  const getCurrentActor = async () => {
    const { data } = await supabase.auth.getUser();
    return data.user?.email || data.user?.id || "current_user";
  };

  const createTimeLog = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่ม Time Log"));
      cancelForm();
      return;
    }

    if (!validateForm()) return;

    try {
      setSaving(true);

      const { data: userData } = await supabase.auth.getUser();
      const payloadBase = buildPayload();
      const userMetadata = userData.user?.user_metadata || {};
      const actorName =
        typeof userMetadata.full_name === "string"
          ? userMetadata.full_name
          : typeof userMetadata.name === "string"
            ? userMetadata.name
            : payloadBase.staff_name;

      const payload = {
        ...payloadBase,
        created_by_user_id: userData.user?.id || null,
        created_by_email: userData.user?.email || null,
        created_by_name: actorName || payloadBase.staff_name,
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };

      const { data, error } = await supabase
        .from("case_time_logs")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        alert(tr("Create time log failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_time_logs",
        recordId: data?.id,
        action: "create",
        oldData: null,
        newData: data || payload,
        note: buildTimeLogAuditNote("create", null, data || payload),
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      cancelForm();
      await loadTimeLogs();
    } finally {
      setSaving(false);
    }
  };

  const updateTimeLog = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไข Time Log"));
      cancelForm();
      return;
    }

    if (!editingId) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      const oldData = items.find((item) => item.id === editingId) || null;
      if (!oldData || !canEditTimeLogRow(oldData)) {
        alert(tr("You can edit only your own time log."));
        return;
      }

      const payload = buildPayload();

      const { data, error } = await supabase
        .from("case_time_logs")
        .update(payload)
        .eq("id", editingId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(tr("Update time log failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      const newData = data || (oldData ? { ...oldData, ...payload } : payload);

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_time_logs",
        recordId: editingId,
        action: "update",
        oldData,
        newData,
        note: buildTimeLogAuditNote("update", oldData, newData),
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      cancelForm();
      await loadTimeLogs();
    } finally {
      setSaving(false);
    }
  };

  const deleteTimeLog = async (id: string) => {
    if (!canDelete) {
      alert(tr("คุณไม่มีสิทธิ์ลบ Time Log"));
      return;
    }

    const confirmed = window.confirm(
      tr("ต้องการลบ Time Log นี้หรือไม่?\n\nระบบจะซ่อนรายการนี้ออกจากหน้าใช้งาน แต่ยังเก็บข้อมูลไว้ในฐานข้อมูลเพื่อใช้ตรวจสอบย้อนหลัง")
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const oldData = items.find((item) => item.id === id) || null;
      const actor = await getCurrentActor();

      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: actor,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("case_time_logs")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(tr("Soft delete time log failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      const newData = data || (oldData ? { ...oldData, ...payload } : payload);

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_time_logs",
        recordId: id,
        action: "soft_delete",
        oldData,
        newData,
        note: buildTimeLogAuditNote("soft_delete", oldData, newData),
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      if (editingId === id) cancelForm();

      await loadTimeLogs();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="timelogs" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>{tr("Time Logs")} </h3>
          <div style={subTitleStyle}>
            {tr("บันทึกเวลาทำงาน แยกเนื้องานหลักและเวลาสนับสนุน")} </div>
        </div>

        <div style={headerButtonWrapStyle}>
          {!showForm ? (
            canEdit ? (
              <button type="button" onClick={startAdd} style={primaryButtonStyle}>
                {tr("+ Add Time")} </button>
            ) : null
          ) : (
            <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
              {tr("Cancel")} </button>
          )}
        </div>
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard
          label={tr("Total Time")}
          value={tr(formatDuration(summary.totalMinutes))}
        />
        <SummaryCard
          label={tr("Core Work")}
          value={tr(formatDuration(summary.coreWorkMinutes))}
        />
        <SummaryCard
          label={tr("Support Time")}
          value={tr(formatDuration(summary.supportTimeMinutes))}
        />
        <SummaryCard label={tr("Entries")} value={String(items.length)} />
      </div>

      {summary.byStaff.length > 0 && (
        <div style={staffSummaryStyle}>
          <div style={staffSummaryTitleStyle}>{tr("Time by Staff")} </div>

          <div style={staffCardGridStyle}>
            {summary.byStaff.map((row) => (
              <div key={row.staff} style={staffTimeCardStyle}>
                <div style={staffNameStyle}>{row.staff}</div>

                <div style={staffTimeLineStyle}>
                  <span>{tr("Total")} </span>
                  <strong>{tr(formatDuration(row.totalMinutes))}</strong>
                </div>

                <div style={staffTimeLineStyle}>
                  <span>{tr("Core")} </span>
                  <strong>{tr(formatDuration(row.coreWorkMinutes))}</strong>
                </div>

                <div style={staffTimeLineStyle}>
                  <span>{tr("Support")} </span>
                  <strong>{tr(formatDuration(row.supportTimeMinutes))}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <CaseEditModal title={editingId ? tr("Edit Time Log") : tr("Add Time Log")} onClose={cancelForm} busy={saving}>


          <div style={formGridStyle}>
            <Input
              label={tr("วันที่ทำงาน")}
              type="date"
              value={form.work_date}
              onChange={(value) => setForm({ ...form, work_date: value })}
            />

            <Select
              label={tr("ผู้ทำงาน")}
              value={form.staff_name}
              onChange={(value) =>
                setForm({
                  ...form,
                  staff_name: value,
                  staff_other: value === "อื่นๆ" ? form.staff_other : "",
                })
              }
              options={staffOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            {form.staff_name === "อื่นๆ" && (
              <Input
                label={tr("ระบุชื่อผู้ทำงานอื่นๆ")}
                value={form.staff_other}
                onChange={(value) => setForm({ ...form, staff_other: value })}
                placeholder={tr("เช่น ทนายเอก / เสมียน / ผู้ช่วย / บุคคลอื่น")}
              />
            )}

            <Select
              label={tr("ประเภทงาน")}
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
                label={tr("ระบุประเภทงานอื่นๆ")}
                value={form.work_other}
                onChange={(value) => setForm({ ...form, work_other: value })}
                placeholder={tr("กรอกประเภทงาน")}
              />
            )}

            <Select
              label={tr("Time Category")}
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
              <label style={labelStyle}>{tr("เวลาที่ใช้")} </label>
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
                <span style={durationUnitStyle}>{tr("ชั่วโมง")} </span>

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
                <span style={durationUnitStyle}>{tr("นาที")} </span>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label={tr("รายละเอียดงาน")}
                value={form.note}
                onChange={(value) => setForm({ ...form, note: value })}
                placeholder={tr("เช่น ประชุมลูกความเพื่อสอบข้อเท็จจริงเพิ่มเติม...")}
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
              {saving ? tr("Saving...") : tr("Save")}
            </button>

            <button
              type="button"
              onClick={cancelForm}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              {tr("Cancel")} </button>
          </div>
        </CaseEditModal>
      )}

      {loading ? (
        <div style={emptyStyle}>{tr("Loading time logs...")} </div>
      ) : sortedItems.length === 0 ? (
        <div style={emptyStyle}>{tr("No time logs added.")} </div>
      ) : (
        <div style={logListStyle}>
          {sortedItems.map((item) => (
            <TimeLogCard
              key={item.id}
              item={item}
              canEdit={canEditTimeLogRow(item)}
              canDelete={canDelete}
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
  const { tr } = useCaseDetailText();
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{tr(label)}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function TimeLogCard({
  item,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  item: TimeLogItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (item: TimeLogItem) => void;
  onDelete: (id: string) => void;
}) {
  const { tr, date } = useCaseDetailText();
  const workText =
    item.work_type === "อื่นๆ"
      ? item.work_other || "อื่นๆ"
      : item.work_type || "-";

  const isCoreWork = item.billable !== false;
  const showActions = canEdit || canDelete;

  return (
    <div style={logCardStyle}>
      <div style={logHeaderStyle}>
        <div>
          <div style={logTitleStyle}>
            {tr(workText)} • {tr(formatDuration(safeMinutes(item.minutes)))}
          </div>
          <div style={logMetaStyle}>
            {date(item.work_date)} • {item.staff_name || "-"}
          </div>
        </div>

        <span style={isCoreWork ? coreWorkBadgeStyle : supportTimeBadgeStyle}>
          {isCoreWork ? tr("Core Work") : tr("Support Time")}
        </span>
      </div>

      {item.note && <div style={noteBlockStyle}>{item.note}</div>}

      {showActions && (
        <div style={actionWrapStyle}>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              style={smallButtonStyle}
            >
              {tr("Edit")} </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              style={dangerButtonStyle}
            >
              {tr("Delete")} </button>
          )}
        </div>
      )}
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
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <input aria-label={tr(label)}
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
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <select aria-label={tr(label)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {tr(option.label)}
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
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <textarea aria-label={tr(label)}
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

function safeMinutes(value?: number | null) {
  if (typeof value !== "number") return 0;
  return Number.isFinite(value) ? value : 0;
}

function buildTotalMinutes(hours: string, minutes: string) {
  const h = Number(hours || 0);
  const m = Number(minutes || 0);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;

  return h * 60 + m;
}

function splitMinutes(totalMinutes: number) {
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function formatDuration(totalMinutes: number) {
  const safeValue = Number.isFinite(totalMinutes) ? totalMinutes : 0;
  const h = Math.floor(safeValue / 60);
  const m = safeValue % 60;

  if (h <= 0) return `${m} นาที`;
  if (m <= 0) return `${h} ชม.`;

  return `${h} ชม. ${m} นาที`;
}


function buildTimeLogAuditNote(
  action?: string | null,
  oldData?: Record<string, unknown> | TimeLogItem | null,
  newData?: Record<string, unknown> | TimeLogItem | null
) {
  const target = newData || oldData || {};
  const workType = String(target.work_type || "Time Log");
  const staffName = String(target.staff_name || "-");

  const minutes =
    typeof target.minutes === "number"
      ? formatDuration(target.minutes)
      : target.minutes
        ? String(target.minutes)
        : "-";

  if (action === "create") {
    return `เพิ่ม Time Log: ${workType} / ${staffName} / ${minutes}`;
  }

  if (action === "update") {
    return `แก้ไข Time Log: ${workType} / ${staffName} / ${minutes}`;
  }

  if (action === "soft_delete" || action === "delete") {
    return `ลบ Time Log: ${workType} / ${staffName} / ${minutes}`;
  }

  return `Time Log: ${workType} / ${staffName} / ${minutes}`;
}

/* =========================================================
   STYLES
========================================================= */

const sectionStyle: CSSProperties = {
  border: "1px solid #dddddd",
  padding: 16,
  borderRadius: 12,
  background: "#ffffff",
  color: "#183854",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 16,
  flexWrap: "wrap",
};

const headerButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#183854",
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
  color: "#183854",
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
  background: "#f7f9fc",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 6,
  fontWeight: 600,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#183854",
};

const staffSummaryStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 12,
  background: "#ffffff",
  marginBottom: 14,
};

const staffSummaryTitleStyle: CSSProperties = {
  fontWeight: 700,
  marginBottom: 8,
  color: "#183854",
};

const staffCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const staffTimeCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#f8fafc",
  color: "#183854",
};

const staffNameStyle: CSSProperties = {
  fontWeight: 700,
  marginBottom: 6,
  color: "#183854",
};

const staffTimeLineStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 13,
  color: "#333333",
  lineHeight: 1.7,
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
  color: "#183854",
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
  color: "#183854",
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
  fontWeight: 700,
  color: "#183854",
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
  fontWeight: 700,
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
  color: "#183854",
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
  color: "#183854",
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
