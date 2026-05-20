"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";
import { createAuditLog } from "../../../../lib/auditLog";

type TimelineEventType = "filing" | "hearing";

type TimelineItem = {
  id: string;
  case_id: number;
  event_type?: TimelineEventType | string | null;
  event_date?: string | null;
  event_time?: string | null;
  event_end_time?: string | null;
  appointment_type?: string | null;
  appointment_other?: string | null;
  status?: string | null;
  note?: string | null;
  order_no?: number | null;
  created_at?: string | null;
  updated_at?: string | null;

  deleted_at?: string | null;
  deleted_by?: string | null;
};

type TimelineForm = {
  event_date: string;
  event_time: string;
  event_end_time: string;
  appointment_type: string;
  appointment_other: string;
  status: string;
  note: string;
  order_no: string;
};

type Props = {
  caseId: string;
  timeline?: unknown[];
  canEdit?: boolean;
  canDelete?: boolean;
};

const appointmentOptions = [
  "นัดไกล่เกลี่ย",
  "นัดไกล่เกลี่ย/ให้การ/สืบพยานโจทก์",
  "นัดพร้อม",
  "นัดชี้สองสถาน/สืบพยานโจทก์",
  "นัดชี้สองสถาน",
  "นัดไต่สวนมูลฟ้อง",
  "นัดฟังคำสั่ง",
  "นัดสอบคำให้การจำเลย",
  "นัดสอบคำให้การจำเลย/ตรวจพยาน",
  "นัดสืบพยานโจทก์",
  "นัดสืบพยานจำเลย",
  "นัดฟังคำพิพากษา/คำสั่ง",
  "นัดอื่นๆ",
];

const appointmentStatusOptions = [
  { value: "Scheduled", label: "Scheduled (รอนัด)" },
  { value: "Done", label: "Done (เสร็จแล้ว)" },
  { value: "Cancelled", label: "Cancelled (ยกเลิก/เลื่อน)" },
];

const startTimeOptions = ["08:30", "09:00", "09:30", "10:00", "16:30"];
const endTimeOptions = ["12:00", "16:30", "17:30"];

const emptyAppointmentForm: TimelineForm = {
  event_date: "",
  event_time: "09:00",
  event_end_time: "12:00",
  appointment_type: "นัดไกล่เกลี่ย",
  appointment_other: "",
  status: "Scheduled",
  note: "",
  order_no: "1",
};

export default function TimelineSection({
  caseId,
  canEdit = false,
  canDelete = false,
}: Props) {
  const caseIdNumber = Number(caseId);

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [filingDate, setFilingDate] = useState("");
  const [filingId, setFilingId] = useState<string | null>(null);
  const [isEditingFiling, setIsEditingFiling] = useState(false);

  const [loading, setLoading] = useState(false);
  const [savingFiling, setSavingFiling] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TimelineForm>(emptyAppointmentForm);

  const formRef = useRef<HTMLDivElement | null>(null);

  const scrollToForm = () => {
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const loadTimeline = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("case_timeline")
        .select("*")
        .eq("case_id", caseIdNumber)
        .is("deleted_at", null)
        .order("event_type", { ascending: true })
        .order("order_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        alert("Load timeline failed:\n" + JSON.stringify(error, null, 2));
        setItems([]);
        return;
      }

      const timelineItems = (data || []) as TimelineItem[];
      setItems(timelineItems);

      const filing = timelineItems.find((item) => item.event_type === "filing");
      setFilingId(filing?.id || null);
      setFilingDate(filing?.event_date || "");
      setIsEditingFiling(!filing?.event_date && canEdit);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, canEdit]);

  const appointments = useMemo(() => {
    return items
      .filter((item) => item.event_type === "hearing")
      .sort((a, b) => {
        const aScore = getAppointmentAlertScore(a);
        const bScore = getAppointmentAlertScore(b);

        if (aScore !== bScore) return aScore - bScore;

        const aDate = a.event_date || "9999-12-31";
        const bDate = b.event_date || "9999-12-31";

        if (aDate !== bDate) return aDate.localeCompare(bDate);

        return (a.order_no || 0) - (b.order_no || 0);
      });
  }, [items]);

  const summary = useMemo(() => {
    const scheduled = appointments.filter(
      (item) => item.status !== "Done" && item.status !== "Cancelled"
    ).length;

    const today = appointments.filter((item) =>
      getAppointmentAlertStatus(item).startsWith("Today")
    ).length;

    const upcoming = appointments.filter((item) =>
      getAppointmentAlertStatus(item).startsWith("Upcoming")
    ).length;

    const overdue = appointments.filter((item) =>
      getAppointmentAlertStatus(item).startsWith("Overdue")
    ).length;

    return {
      total: appointments.length,
      scheduled,
      today,
      upcoming,
      overdue,
    };
  }, [appointments]);

  const getNextOrderNo = () => {
    const maxOrder = items
      .filter((item) => item.event_type === "hearing")
      .reduce((max, item) => {
        const order = item.order_no || 0;
        return order > max ? order : max;
      }, 0);

    return maxOrder + 1;
  };

  const saveFilingDate = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขวันยื่นฟ้อง");
      setIsEditingFiling(false);
      await loadTimeline();
      return;
    }

    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return;
    }

    if (!filingDate.trim()) {
      alert("กรุณาเลือกวันที่ยื่นฟ้อง");
      return;
    }

    try {
      setSavingFiling(true);

      const now = new Date().toISOString();

      if (filingId) {
        const oldData = items.find((item) => item.id === filingId) || null;

        const payload = {
          event_date: filingDate,
          updated_at: now,
        };

        const { data, error } = await supabase
          .from("case_timeline")
          .update(payload)
          .eq("id", filingId)
          .is("deleted_at", null)
          .select("*")
          .single();

        if (error) {
          alert("Save filing date failed:\n" + JSON.stringify(error, null, 2));
          return;
        }

        await createAuditLog({
          caseId: caseIdNumber,
          tableName: "case_timeline",
          recordId: filingId,
          action: "update",
          oldData,
          newData: data || (oldData ? { ...oldData, ...payload } : payload),
          note: "Update filing date",
        });
      } else {
        const payload = {
          case_id: caseIdNumber,
          event_type: "filing",
          event_date: filingDate,
          event_time: "",
          event_end_time: "",
          appointment_type: "",
          appointment_other: "",
          status: "Done",
          note: "",
          order_no: 0,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          deleted_by: null,
        };

        const { data, error } = await supabase
          .from("case_timeline")
          .insert([payload])
          .select("*")
          .single();

        if (error) {
          alert("Create filing date failed:\n" + JSON.stringify(error, null, 2));
          return;
        }

        await createAuditLog({
          caseId: caseIdNumber,
          tableName: "case_timeline",
          recordId: data?.id,
          action: "create",
          oldData: null,
          newData: data || payload,
          note: "Create filing date",
        });
      }

      setIsEditingFiling(false);
      await loadTimeline();
    } finally {
      setSavingFiling(false);
    }
  };

  const startAddAppointment = () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เพิ่มนัดศาล");
      return;
    }

    setEditingId(null);
    setForm({
      ...emptyAppointmentForm,
      order_no: String(getNextOrderNo()),
    });
    setShowForm(true);
    scrollToForm();
  };

  const startEditAppointment = (item: TimelineItem) => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขนัดศาล");
      return;
    }

    setEditingId(item.id);
    setShowForm(true);
    scrollToForm();

    setForm({
      event_date: item.event_date || "",
      event_time: item.event_time || "09:00",
      event_end_time: item.event_end_time || "12:00",
      appointment_type: item.appointment_type || "นัดไกล่เกลี่ย",
      appointment_other: item.appointment_other || "",
      status: item.status || "Scheduled",
      note: item.note || "",
      order_no: item.order_no ? String(item.order_no) : "1",
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyAppointmentForm);
  };

  const validateAppointment = () => {
    if (!form.event_date.trim()) {
      alert("กรุณาเลือกวันที่นัด");
      return false;
    }

    if (!form.event_time.trim()) {
      alert("กรุณาเลือกเวลาเริ่มต้น");
      return false;
    }

    if (!form.event_end_time.trim()) {
      alert("กรุณาเลือกเวลาสิ้นสุด");
      return false;
    }

    if (!form.appointment_type.trim()) {
      alert("กรุณาเลือกเรื่องนัด");
      return false;
    }

    if (
      form.appointment_type === "นัดอื่นๆ" &&
      !form.appointment_other.trim()
    ) {
      alert("กรุณากรอกเรื่องนัดอื่นๆ");
      return false;
    }

    return true;
  };

  const buildAppointmentPayload = () => {
    const now = new Date().toISOString();

    return {
      case_id: caseIdNumber,
      event_type: "hearing",
      event_date: form.event_date,
      event_time: form.event_time,
      event_end_time: form.event_end_time,
      appointment_type: form.appointment_type,
      appointment_other:
        form.appointment_type === "นัดอื่นๆ" ? form.appointment_other : "",
      status: form.status || "Scheduled",
      note: form.note,
      order_no: form.order_no ? Number(form.order_no) : null,
      updated_at: now,
    };
  };

  const createAppointment = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เพิ่มนัดศาล");
      cancelForm();
      return;
    }

    if (!validateAppointment()) return;

    try {
      setSavingAppointment(true);

      const payload = {
        ...buildAppointmentPayload(),
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };

      const { data, error } = await supabase
        .from("case_timeline")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        alert("Create appointment failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_timeline",
        recordId: data?.id,
        action: "create",
        oldData: null,
        newData: data || payload,
        note: "Create court appointment",
      });

      cancelForm();
      await loadTimeline();
    } finally {
      setSavingAppointment(false);
    }
  };

  const updateAppointment = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขนัดศาล");
      cancelForm();
      return;
    }

    if (!editingId) return;
    if (!validateAppointment()) return;

    try {
      setSavingAppointment(true);

      const oldData = items.find((item) => item.id === editingId) || null;
      const payload = buildAppointmentPayload();

      const { data, error } = await supabase
        .from("case_timeline")
        .update(payload)
        .eq("id", editingId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert("Update appointment failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_timeline",
        recordId: editingId,
        action: "update",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Update court appointment",
      });

      cancelForm();
      await loadTimeline();
    } finally {
      setSavingAppointment(false);
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!canDelete) {
      alert("คุณไม่มีสิทธิ์ลบนัดศาล");
      return;
    }

    const confirmed = window.confirm(
      "ต้องการลบนัดศาลรายการนี้หรือไม่?\n\nระบบจะซ่อนรายการนี้ออกจากหน้าใช้งาน แต่ยังเก็บข้อมูลไว้ในฐานข้อมูลเพื่อใช้ตรวจสอบย้อนหลัง"
    );

    if (!confirmed) return;

    try {
      setSavingAppointment(true);

      const oldData = items.find((item) => item.id === id) || null;

      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: "current_user",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("case_timeline")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert("Soft delete appointment failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_timeline",
        recordId: id,
        action: "soft_delete",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Soft delete court appointment",
      });

      if (editingId === id) cancelForm();

      await loadTimeline();
    } finally {
      setSavingAppointment(false);
    }
  };

  const toggleAppointmentDone = async (item: TimelineItem) => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เปลี่ยนสถานะนัดศาล");
      return;
    }

    const nextStatus = item.status === "Done" ? "Scheduled" : "Done";
    const oldData = item;

    const payload = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("case_timeline")
      .update(payload)
      .eq("id", item.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      alert("Update appointment status failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    await createAuditLog({
      caseId: caseIdNumber,
      tableName: "case_timeline",
      recordId: item.id,
      action: "update",
      oldData,
      newData: data || {
        ...item,
        ...payload,
      },
      note:
        item.status === "Done"
          ? "Undo court appointment status"
          : "Mark court appointment as done",
    });

    await loadTimeline();
  };

  return (
    <div id="timeline" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Court Timeline</h3>
          <div style={subTitleStyle}>
            วันยื่นฟ้องและนัดศาล · รวม {summary.total} นัด
          </div>
        </div>

        {!showForm ? (
          canEdit ? (
            <button
              type="button"
              onClick={startAddAppointment}
              style={primaryButtonStyle}
            >
              + Add Appointment
            </button>
          ) : null
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard label="Scheduled" value={String(summary.scheduled)} />
        <SummaryCard label="Today" value={String(summary.today)} />
        <SummaryCard label="Upcoming" value={String(summary.upcoming)} />
        <SummaryCard label="Overdue" value={String(summary.overdue)} />
      </div>

      <div style={filingCardStyle}>
        <div style={filingHeaderStyle}>
          <div>
            <div style={filingTitleStyle}>Filing Date</div>
            <div style={filingSubTitleStyle}>วันที่ยื่นฟ้อง</div>
          </div>

          {!isEditingFiling && canEdit && (
            <button
              type="button"
              onClick={() => setIsEditingFiling(true)}
              style={secondaryButtonStyle}
            >
              Edit
            </button>
          )}
        </div>

        {isEditingFiling && canEdit ? (
          <div style={filingFormStyle}>
            <input
              type="date"
              value={filingDate}
              onChange={(e) => setFilingDate(e.target.value)}
              style={inputStyle}
            />

            <button
              type="button"
              onClick={saveFilingDate}
              disabled={savingFiling}
              style={primaryButtonStyle}
            >
              {savingFiling ? "Saving..." : "Save Filing Date"}
            </button>

            {filingId && (
              <button
                type="button"
                onClick={() => {
                  setIsEditingFiling(false);
                  loadTimeline();
                }}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div style={filingDisplayStyle}>
            {filingDate ? formatDisplayDate(filingDate) : "-"}
          </div>
        )}
      </div>

      {showForm && (
        <div ref={formRef} style={formCardStyle}>
          <div style={formHeaderStyle}>
            <div>
              <h4 style={formTitleStyle}>
                {editingId ? "Edit Appointment" : "Add Appointment"}
              </h4>
              <div style={formSubTitleStyle}>
                บันทึกนัดศาล วัน เวลา สถานะ และหมายเหตุที่ต้องติดตาม
              </div>
            </div>

            {editingId && <span style={editBadgeStyle}>Editing</span>}
          </div>

          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>ลำดับนัด</label>
              <div style={readonlyBoxStyle}>นัดที่ {form.order_no || "-"}</div>
            </div>

            <Input
              label="วันที่"
              type="date"
              value={form.event_date}
              onChange={(value) => setForm({ ...form, event_date: value })}
            />

            <Select
              label="เวลาเริ่มต้น"
              value={form.event_time}
              onChange={(value) => setForm({ ...form, event_time: value })}
              options={startTimeOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            <Select
              label="เวลาสิ้นสุด"
              value={form.event_end_time}
              onChange={(value) =>
                setForm({ ...form, event_end_time: value })
              }
              options={endTimeOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            <Select
              label="เรื่องนัด"
              value={form.appointment_type}
              onChange={(value) =>
                setForm({
                  ...form,
                  appointment_type: value,
                  appointment_other:
                    value === "นัดอื่นๆ" ? form.appointment_other : "",
                })
              }
              options={appointmentOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            {form.appointment_type === "นัดอื่นๆ" && (
              <Input
                label="ระบุเรื่องนัดอื่นๆ"
                value={form.appointment_other}
                onChange={(value) =>
                  setForm({ ...form, appointment_other: value })
                }
                placeholder="กรอกเรื่องนัด"
              />
            )}

            <Select
              label="Status"
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
              options={appointmentStatusOptions}
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="หมายเหตุ"
                value={form.note}
                onChange={(value) => setForm({ ...form, note: value })}
                placeholder="รายละเอียดเพิ่มเติม"
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={editingId ? updateAppointment : createAppointment}
              disabled={savingAppointment}
              style={primaryButtonStyle}
            >
              {savingAppointment ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={cancelForm}
              disabled={savingAppointment}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={listHeaderStyle}>Court Appointments</div>

      {loading ? (
        <div style={emptyStyle}>Loading timeline...</div>
      ) : appointments.length === 0 ? (
        <div style={emptyStyle}>No appointments added.</div>
      ) : (
        <div style={appointmentListStyle}>
          {appointments.map((item) => (
            <AppointmentCard
              key={item.id}
              item={item}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={startEditAppointment}
              onDelete={deleteAppointment}
              onToggleDone={toggleAppointmentDone}
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

function AppointmentCard({
  item,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onToggleDone,
}: {
  item: TimelineItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (item: TimelineItem) => void;
  onDelete: (id: string) => void;
  onToggleDone: (item: TimelineItem) => void;
}) {
  const appointmentText =
    item.appointment_type === "นัดอื่นๆ"
      ? item.appointment_other || "นัดอื่นๆ"
      : item.appointment_type || "-";

  const timeText =
    item.event_time || item.event_end_time
      ? `${item.event_time || "-"} - ${item.event_end_time || "-"}`
      : "-";

  const statusText = renderAppointmentStatus(item.status);
  const alertStatus = getAppointmentAlertStatus(item);
  const isDone = item.status === "Done";
  const showActions = canEdit || canDelete;

  return (
    <div
      style={{
        ...appointmentCardStyle,
        background: isDone ? "#f7f7f7" : getAppointmentBackground(alertStatus),
      }}
    >
      <div style={appointmentHeaderStyle}>
        <div>
          <div style={appointmentTitleStyle}>
            นัดที่ {item.order_no || "-"}
          </div>
          <div style={appointmentMatterStyle}>{appointmentText}</div>

          <div style={badgeRowStyle}>
            <span style={getAppointmentStatusBadgeStyle(item.status)}>
              {statusText}
            </span>
            <span style={getAppointmentAlertBadgeStyle(alertStatus)}>
              {alertStatus}
            </span>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => onToggleDone(item)}
            style={isDone ? doneButtonStyle : smallButtonStyle}
          >
            {isDone ? "Undo" : "Done"}
          </button>
        )}
      </div>

      <div style={appointmentMetaGridStyle}>
        <InfoLine label="วันที่" value={formatDisplayDate(item.event_date)} />
        <InfoLine label="เวลา" value={timeText} />
      </div>

      {item.note && (
        <div style={noteBlockStyle}>
          <div style={infoLabelStyle}>หมายเหตุ</div>
          <div style={infoValueStyle}>{item.note}</div>
        </div>
      )}

      {showActions && (
        <div style={actionWrapStyle}>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              style={smallButtonStyle}
            >
              Edit
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              style={dangerButtonStyle}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoLineStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
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

function renderAppointmentStatus(status?: string | null) {
  if (status === "Scheduled") return "Scheduled (รอนัด)";
  if (status === "Done") return "Done (เสร็จแล้ว)";
  if (status === "Cancelled") return "Cancelled (ยกเลิก/เลื่อน)";
  return "Scheduled (รอนัด)";
}

function getAppointmentAlertStatus(item: TimelineItem) {
  if (item.status === "Done") return "Done (เสร็จแล้ว)";
  if (item.status === "Cancelled") return "Cancelled (ยกเลิก/เลื่อน)";
  if (!item.event_date) return "No Date (ไม่กำหนดวัน)";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const appointmentDate = new Date(item.event_date);
  appointmentDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (appointmentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "Overdue (เลยวันนัดแล้ว)";
  if (diffDays === 0) return "Today (นัดวันนี้)";
  if (diffDays <= 7) return "Upcoming (ใกล้ถึงนัด)";
  return "Normal (ยังไม่ใกล้)";
}

function getAppointmentAlertScore(item: TimelineItem) {
  const status = getAppointmentAlertStatus(item);

  if (status.startsWith("Overdue")) return 1;
  if (status.startsWith("Today")) return 2;
  if (status.startsWith("Upcoming")) return 3;
  if (status.startsWith("Normal")) return 4;
  if (status.startsWith("No Date")) return 5;
  if (status.startsWith("Cancelled")) return 6;
  if (status.startsWith("Done")) return 7;

  return 9;
}

function getAppointmentBackground(alertStatus: string) {
  if (alertStatus.startsWith("Overdue")) return "#fff5f5";
  if (alertStatus.startsWith("Today")) return "#fff8e1";
  if (alertStatus.startsWith("Upcoming")) return "#fffaf0";
  if (alertStatus.startsWith("Cancelled")) return "#f8fafc";
  return "#ffffff";
}

function getAppointmentStatusBadgeStyle(status?: string | null): CSSProperties {
  if (status === "Done") {
    return {
      ...badgeBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  if (status === "Cancelled") {
    return {
      ...badgeBaseStyle,
      background: "#f1f5f9",
      color: "#475467",
      border: "1px solid #d0d5dd",
    };
  }

  return {
    ...badgeBaseStyle,
    background: "#fff8e1",
    color: "#b54708",
    border: "1px solid #eedc9a",
  };
}

function getAppointmentAlertBadgeStyle(alertStatus: string): CSSProperties {
  if (alertStatus.startsWith("Overdue")) {
    return {
      ...badgeBaseStyle,
      background: "#ffe5e5",
      color: "#b42318",
      border: "1px solid #f1b5b5",
    };
  }

  if (alertStatus.startsWith("Today")) {
    return {
      ...badgeBaseStyle,
      background: "#fff3cd",
      color: "#b54708",
      border: "1px solid #f0d58a",
    };
  }

  if (alertStatus.startsWith("Upcoming")) {
    return {
      ...badgeBaseStyle,
      background: "#fff8e1",
      color: "#b54708",
      border: "1px solid #eedc9a",
    };
  }

  if (alertStatus.startsWith("Done")) {
    return {
      ...badgeBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  if (alertStatus.startsWith("Cancelled")) {
    return {
      ...badgeBaseStyle,
      background: "#f1f5f9",
      color: "#475467",
      border: "1px solid #d0d5dd",
    };
  }

  return {
    ...badgeBaseStyle,
    background: "#f8fafc",
    color: "#475467",
    border: "1px solid #dde3ea",
  };
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
  padding: "clamp(12px, 2vw, 16px)",
  borderRadius: 14,
  background: "#ffffff",
  color: "#111111",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
  fontSize: 18,
  fontWeight: 900,
};

const subTitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#666666",
  fontSize: 13,
  lineHeight: 1.45,
};

const primaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#000000",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#ffffff",
  color: "#111111",
  borderRadius: 8,
  border: "1px solid #cccccc",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 11,
  background: "#fafafa",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 4,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const summaryValueStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: "#111111",
};

const filingCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
  marginBottom: 14,
};

const filingHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 9,
};

const filingTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#111111",
};

const filingSubTitleStyle: CSSProperties = {
  marginTop: 2,
  color: "#666666",
  fontSize: 12,
  fontWeight: 700,
};

const filingFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) auto auto",
  gap: 8,
  alignItems: "center",
};

const filingDisplayStyle: CSSProperties = {
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 800,
  fontSize: 13,
};

const formCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 14,
  padding: 14,
  background: "#fafafa",
  marginBottom: 16,
  scrollMarginTop: 105,
};

const formHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 12,
  flexWrap: "wrap",
};

const formTitleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
  fontSize: 16,
  fontWeight: 900,
};

const formSubTitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#666666",
  fontSize: 12,
  lineHeight: 1.45,
};

const editBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#fff8e1",
  color: "#b54708",
  border: "1px solid #eedc9a",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 3,
  color: "#777777",
  fontWeight: 800,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  background: "#ffffff",
  color: "#111111",
  colorScheme: "light",
  boxSizing: "border-box",
  fontSize: 13,
};

const readonlyBoxStyle: CSSProperties = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#eeeeee",
  color: "#111111",
  boxSizing: "border-box",
  fontWeight: 800,
  fontSize: 13,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 76,
  resize: "vertical",
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  flexWrap: "wrap",
};

const listHeaderStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#111111",
  marginBottom: 9,
  paddingTop: 4,
};

const emptyStyle: CSSProperties = {
  padding: 14,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
};

const appointmentListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 10,
};

const appointmentCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 12,
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
};

const appointmentHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 10,
};

const appointmentTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#111111",
};

const appointmentMatterStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 13,
  color: "#222222",
  fontWeight: 800,
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 7,
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
};

const appointmentMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginBottom: 8,
};

const infoLineStyle: CSSProperties = {
  padding: "7px 8px",
  border: "1px solid #eeeeee",
  borderRadius: 10,
  background: "#fafafa",
  minWidth: 0,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 2,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#111111",
  fontWeight: 800,
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const noteBlockStyle: CSSProperties = {
  padding: "8px 9px",
  borderRadius: 10,
  background: "#fafafa",
  border: "1px solid #eeeeee",
  marginTop: 8,
};

const actionWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
  flexWrap: "wrap",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const doneButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #b9dfc3",
  background: "#e6f4ea",
  color: "#067647",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
};