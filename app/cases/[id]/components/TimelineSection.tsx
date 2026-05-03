"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

type TimelineEventType = "filing" | "hearing";

type TimelineItem = {
  id: string;
  case_id: number;
  event_type?: TimelineEventType | string | null;
  event_date?: string | null;
  event_time?: string | null;
  appointment_type?: string | null;
  appointment_other?: string | null;
  note?: string | null;
  order_no?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TimelineForm = {
  event_date: string;
  event_time: string;
  appointment_type: string;
  appointment_other: string;
  note: string;
  order_no: string;
};

type Props = {
  caseId: string;
  timeline?: unknown[];
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

const emptyAppointmentForm: TimelineForm = {
  event_date: "",
  event_time: "",
  appointment_type: "นัดไกล่เกลี่ย",
  appointment_other: "",
  note: "",
  order_no: "1",
};

export default function TimelineSection({ caseId }: Props) {
  const caseIdNumber = Number(caseId);

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [filingDate, setFilingDate] = useState("");
  const [filingId, setFilingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [savingFiling, setSavingFiling] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TimelineForm>(emptyAppointmentForm);

  const loadTimeline = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("case_timeline")
        .select("*")
        .eq("case_id", caseIdNumber)
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const appointments = useMemo(() => {
    return items
      .filter((item) => item.event_type === "hearing")
      .sort((a, b) => {
        const orderA = a.order_no || 0;
        const orderB = b.order_no || 0;

        if (orderA !== orderB) return orderA - orderB;

        return (a.created_at || "").localeCompare(b.created_at || "");
      });
  }, [items]);

  const getNextOrderNo = () => {
    const maxOrder = appointments.reduce((max, item) => {
      const order = item.order_no || 0;
      return order > max ? order : max;
    }, 0);

    return maxOrder + 1;
  };

  const saveFilingDate = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return;
    }

    try {
      setSavingFiling(true);

      const now = new Date().toISOString();

      if (filingId) {
        const { error } = await supabase
          .from("case_timeline")
          .update({
            event_date: filingDate,
            updated_at: now,
          })
          .eq("id", filingId);

        if (error) {
          alert("Save filing date failed:\n" + JSON.stringify(error, null, 2));
          return;
        }
      } else {
        const { error } = await supabase.from("case_timeline").insert([
          {
            case_id: caseIdNumber,
            event_type: "filing",
            event_date: filingDate,
            event_time: "",
            appointment_type: "",
            appointment_other: "",
            note: "",
            order_no: 0,
            created_at: now,
            updated_at: now,
          },
        ]);

        if (error) {
          alert("Create filing date failed:\n" + JSON.stringify(error, null, 2));
          return;
        }
      }

      await loadTimeline();
    } finally {
      setSavingFiling(false);
    }
  };

  const startAddAppointment = () => {
    setEditingId(null);
    setForm({
      ...emptyAppointmentForm,
      order_no: String(getNextOrderNo()),
    });
    setShowForm(true);
  };

  const startEditAppointment = (item: TimelineItem) => {
    setEditingId(item.id);
    setShowForm(true);

    setForm({
      event_date: item.event_date || "",
      event_time: item.event_time || "",
      appointment_type: item.appointment_type || "นัดไกล่เกลี่ย",
      appointment_other: item.appointment_other || "",
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
      alert("กรุณากรอกวันที่นัด");
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
      appointment_type: form.appointment_type,
      appointment_other:
        form.appointment_type === "นัดอื่นๆ" ? form.appointment_other : "",
      note: form.note,
      order_no: form.order_no ? Number(form.order_no) : null,
      updated_at: now,
    };
  };

  const createAppointment = async () => {
    if (!validateAppointment()) return;

    try {
      setSavingAppointment(true);

      const { error } = await supabase.from("case_timeline").insert([
        {
          ...buildAppointmentPayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create appointment failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadTimeline();
    } finally {
      setSavingAppointment(false);
    }
  };

  const updateAppointment = async () => {
    if (!editingId) return;
    if (!validateAppointment()) return;

    try {
      setSavingAppointment(true);

      const { error } = await supabase
        .from("case_timeline")
        .update(buildAppointmentPayload())
        .eq("id", editingId);

      if (error) {
        alert("Update appointment failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadTimeline();
    } finally {
      setSavingAppointment(false);
    }
  };

  const deleteAppointment = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบนัดศาลรายการนี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase.from("case_timeline").delete().eq("id", id);

    if (error) {
      alert("Delete appointment failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingId === id) cancelForm();

    await loadTimeline();
  };

  return (
    <div id="timeline" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Court Timeline</h3>
          <div style={subTitleStyle}>วันยื่นฟ้องและนัดศาล</div>
        </div>

        {!showForm ? (
          <button type="button" onClick={startAddAppointment} style={primaryButtonStyle}>
            + Add Appointment
          </button>
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={filingCardStyle}>
        <div style={filingTitleStyle}>Filing Date</div>
        <div style={filingSubTitleStyle}>วันที่ยื่นฟ้อง</div>

        <div style={filingFormStyle}>
          <input
            value={filingDate}
            onChange={(e) => setFilingDate(e.target.value)}
            placeholder="เช่น 15/05/2569"
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
        </div>
      </div>

      {showForm && (
        <div style={formCardStyle}>
          <h4 style={formTitleStyle}>
            {editingId ? "Edit Appointment" : "Add Appointment"}
          </h4>

          <div style={formGridStyle}>
            <Input
              label="ลำดับนัด"
              value={form.order_no}
              onChange={(value) =>
                setForm({
                  ...form,
                  order_no: value.replace(/\D/g, ""),
                })
              }
            />

            <Input
              label="วันที่"
              value={form.event_date}
              onChange={(value) => setForm({ ...form, event_date: value })}
              placeholder="เช่น 20/06/2569"
            />

            <Input
              label="เวลา"
              value={form.event_time}
              onChange={(value) => setForm({ ...form, event_time: value })}
              placeholder="เช่น 09:00"
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
              onEdit={startEditAppointment}
              onDelete={deleteAppointment}
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

function AppointmentCard({
  item,
  onEdit,
  onDelete,
}: {
  item: TimelineItem;
  onEdit: (item: TimelineItem) => void;
  onDelete: (id: string) => void;
}) {
  const appointmentText =
    item.appointment_type === "นัดอื่นๆ"
      ? item.appointment_other || "นัดอื่นๆ"
      : item.appointment_type || "-";

  return (
    <div style={appointmentCardStyle}>
      <div style={appointmentHeaderStyle}>
        <div>
          <div style={appointmentTitleStyle}>
            นัดที่ {item.order_no || "-"}
          </div>
          <div style={appointmentMatterStyle}>{appointmentText}</div>
        </div>
      </div>

      <div style={appointmentMetaGridStyle}>
        <InfoLine label="วันที่" value={item.event_date || "-"} />
        <InfoLine label="เวลา" value={item.event_time || "-"} />
      </div>

      {item.note && (
        <div style={noteBlockStyle}>
          <div style={infoLabelStyle}>หมายเหตุ</div>
          <div style={infoValueStyle}>{item.note}</div>
        </div>
      )}

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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
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

const filingCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#fafafa",
  marginBottom: 16,
};

const filingTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111111",
};

const filingSubTitleStyle: CSSProperties = {
  marginTop: 3,
  marginBottom: 10,
  color: "#555555",
  fontSize: 13,
};

const filingFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  alignItems: "center",
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

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: "vertical",
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
  flexWrap: "wrap",
};

const listHeaderStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111111",
  marginBottom: 10,
};

const emptyStyle: CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
};

const appointmentListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const appointmentCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const appointmentHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
};

const appointmentTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111111",
};

const appointmentMatterStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 14,
  color: "#222222",
  fontWeight: 600,
  lineHeight: 1.45,
};

const appointmentMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginBottom: 10,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 2,
};

const infoValueStyle: CSSProperties = {
  fontSize: 14,
  color: "#111111",
  fontWeight: 600,
  wordBreak: "break-word",
  lineHeight: 1.5,
};

const noteBlockStyle: CSSProperties = {
  paddingTop: 8,
  borderTop: "1px solid #eeeeee",
};

const actionWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
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