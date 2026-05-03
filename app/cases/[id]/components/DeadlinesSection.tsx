"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

type DeadlineItem = {
  id: string;
  case_id: number;

  order_no?: number | null;

  deadline_type?: string | null;
  deadline_other?: string | null;

  party_label?: string | null;
  party_other?: string | null;

  procedure_type?: string | null;
  service_method?: string | null;

  trigger_date?: string | null;
  original_due_date?: string | null;
  current_due_date?: string | null;

  status?: string | null;
  note?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type DeadlineExtension = {
  id: string;
  deadline_id: string;
  extension_no?: number | null;
  requested_date?: string | null;
  granted_until_date?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type DeadlineForm = {
  order_no: string;

  deadline_type: string;
  deadline_other: string;

  party_label: string;
  party_other: string;

  procedure_type: string;
  service_method: string;

  trigger_date: string;

  status: string;
  note: string;
};

type ExtensionForm = {
  requested_date: string;
  granted_until_date: string;
  note: string;
};

type Props = {
  caseId: string;
  deadlines?: unknown[];
};

const deadlineTypeOptions = [
  { value: "answer", label: "ครบกำหนดยื่นคำให้การ" },
  { value: "appeal", label: "ครบกำหนดอุทธรณ์" },
  { value: "appeal_answer", label: "ครบกำหนดแก้อุทธรณ์" },
  { value: "supreme", label: "ครบกำหนดฎีกา" },
  { value: "supreme_answer", label: "ครบกำหนดแก้ฎีกา" },
  { value: "other", label: "อื่นๆ" },
];

const partyOptions = [
  "จำเลย",
  "จำเลยที่ 1",
  "จำเลยที่ 2",
  "จำเลยที่ 3",
  "โจทก์",
  "โจทก์ที่ 1",
  "โจทก์ที่ 2",
  "โจทก์ที่ 3",
  "ผู้ร้อง",
  "ผู้คัดค้าน",
  "อื่นๆ",
];

const procedureOptions = [
  { value: "ordinary_civil", label: "คดีแพ่งสามัญ" },
  {
    value: "small_or_simple",
    label: "คดีมโนสาเร่/ไม่มีข้อยุ่งยาก",
  },
  { value: "consumer", label: "คดีผู้บริโภค" },
];

const serviceMethodOptions = [
  { value: "personal", label: "รับหมายเอง" },
  { value: "posting", label: "ปิดหมาย" },
];

const statusOptions = [
  { value: "Active", label: "Active (ยังต้องติดตาม)" },
  { value: "Done", label: "Done (เสร็จแล้ว)" },
  { value: "Cancelled", label: "Cancelled (ยกเลิก)" },
];

const emptyForm: DeadlineForm = {
  order_no: "1",

  deadline_type: "answer",
  deadline_other: "",

  party_label: "จำเลย",
  party_other: "",

  procedure_type: "ordinary_civil",
  service_method: "personal",

  trigger_date: "",

  status: "Active",
  note: "",
};

const emptyExtensionForm: ExtensionForm = {
  requested_date: "",
  granted_until_date: "",
  note: "",
};

export default function DeadlinesSection({ caseId }: Props) {
  const caseIdNumber = Number(caseId);

  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [extensions, setExtensions] = useState<DeadlineExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DeadlineForm>(emptyForm);

  const [extensionDeadlineId, setExtensionDeadlineId] = useState<string | null>(
    null
  );
  const [extensionForm, setExtensionForm] =
    useState<ExtensionForm>(emptyExtensionForm);
  const [savingExtension, setSavingExtension] = useState(false);

  const loadDeadlines = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data: deadlineData, error: deadlineError } = await supabase
        .from("case_deadlines")
        .select("*")
        .eq("case_id", caseIdNumber)
        .order("order_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (deadlineError) {
        alert("Load deadlines failed:\n" + JSON.stringify(deadlineError, null, 2));
        setItems([]);
        setExtensions([]);
        return;
      }

      const loadedDeadlines = (deadlineData || []) as DeadlineItem[];
      setItems(loadedDeadlines);

      const deadlineIds = loadedDeadlines.map((item) => item.id);

      if (deadlineIds.length === 0) {
        setExtensions([]);
        return;
      }

      const { data: extensionData, error: extensionError } = await supabase
        .from("case_deadline_extensions")
        .select("*")
        .in("deadline_id", deadlineIds)
        .order("extension_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (extensionError) {
        alert(
          "Load deadline extensions failed:\n" +
            JSON.stringify(extensionError, null, 2)
        );
        setExtensions([]);
        return;
      }

      setExtensions((extensionData || []) as DeadlineExtension[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeadlines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const sortedDeadlines = useMemo(() => {
    return [...items].sort((a, b) => {
      const aScore = getDeadlineStatusScore(a);
      const bScore = getDeadlineStatusScore(b);

      if (aScore !== bScore) return aScore - bScore;

      const aDue = a.current_due_date || "9999-12-31";
      const bDue = b.current_due_date || "9999-12-31";

      if (aDue !== bDue) return aDue.localeCompare(bDue);

      return (a.order_no || 0) - (b.order_no || 0);
    });
  }, [items]);

  const getNextOrderNo = () => {
    const maxOrder = items.reduce((max, item) => {
      const order = item.order_no || 0;
      return order > max ? order : max;
    }, 0);

    return maxOrder + 1;
  };

  const startAdd = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      order_no: String(getNextOrderNo()),
    });
    setShowForm(true);
  };

  const startEdit = (item: DeadlineItem) => {
    setEditingId(item.id);
    setShowForm(true);

    setForm({
      order_no: item.order_no ? String(item.order_no) : "1",

      deadline_type: item.deadline_type || "answer",
      deadline_other: item.deadline_other || "",

      party_label: item.party_label || "จำเลย",
      party_other: item.party_other || "",

      procedure_type: item.procedure_type || "ordinary_civil",
      service_method: item.service_method || "personal",

      trigger_date: item.trigger_date || "",

      status: item.status || "Active",
      note: item.note || "",
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  };

  const validateDeadline = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return false;
    }

    if (!form.deadline_type) {
      alert("กรุณาเลือกประเภทกำหนดเวลา");
      return false;
    }

    if (form.deadline_type === "other" && !form.deadline_other.trim()) {
      alert("กรุณากรอกกำหนดเวลาอื่นๆ");
      return false;
    }

    if (form.party_label === "อื่นๆ" && !form.party_other.trim()) {
      alert("กรุณากรอกผู้เกี่ยวข้องอื่นๆ");
      return false;
    }

    if (!form.trigger_date) {
      alert("กรุณาเลือกวันที่ตั้งต้น / วันครบกำหนด");
      return false;
    }

    return true;
  };

  const buildPayload = () => {
    const now = new Date().toISOString();
    const dueDate = calculateDueDate(form);

    return {
      case_id: caseIdNumber,
      order_no: form.order_no ? Number(form.order_no) : null,

      deadline_type: form.deadline_type,
      deadline_other:
        form.deadline_type === "other" ? form.deadline_other : "",

      party_label: form.party_label,
      party_other: form.party_label === "อื่นๆ" ? form.party_other : "",

      procedure_type: form.procedure_type,
      service_method:
        form.deadline_type === "answer" &&
        form.procedure_type === "ordinary_civil"
          ? form.service_method
          : "",

      trigger_date: form.trigger_date,
      original_due_date: dueDate,
      current_due_date: dueDate,

      status: form.status,
      note: form.note,

      updated_at: now,
    };
  };

  const createDeadline = async () => {
    if (!validateDeadline()) return;

    try {
      setSaving(true);

      const { error } = await supabase.from("case_deadlines").insert([
        {
          ...buildPayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create deadline failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const updateDeadline = async () => {
    if (!editingId) return;
    if (!validateDeadline()) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("case_deadlines")
        .update(buildPayload())
        .eq("id", editingId);

      if (error) {
        alert("Update deadline failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const deleteDeadline = async (id: string) => {
    const confirmed = window.confirm(
      "ต้องการลบกำหนดเวลานี้หรือไม่? ประวัติการขยายเวลาจะถูกลบไปด้วย"
    );

    if (!confirmed) return;

    const { error } = await supabase.from("case_deadlines").delete().eq("id", id);

    if (error) {
      alert("Delete deadline failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingId === id) cancelForm();
    if (extensionDeadlineId === id) cancelExtensionForm();

    await loadDeadlines();
  };

  const toggleDone = async (item: DeadlineItem) => {
    const nextStatus = item.status === "Done" ? "Active" : "Done";

    const { error } = await supabase
      .from("case_deadlines")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      alert("Update deadline status failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    await loadDeadlines();
  };

  const startAddExtension = (deadlineId: string) => {
    setExtensionDeadlineId(deadlineId);
    setExtensionForm(emptyExtensionForm);
  };

  const cancelExtensionForm = () => {
    setExtensionDeadlineId(null);
    setExtensionForm(emptyExtensionForm);
  };

  const createExtension = async () => {
    if (!extensionDeadlineId) return;

    if (!extensionForm.granted_until_date) {
      alert("กรุณาเลือกวันที่ศาลอนุญาตให้ขยายถึง");
      return;
    }

    try {
      setSavingExtension(true);

      const existing = extensions.filter(
        (item) => item.deadline_id === extensionDeadlineId
      );

      const nextNo =
        existing.reduce((max, item) => {
          const no = item.extension_no || 0;
          return no > max ? no : max;
        }, 0) + 1;

      const now = new Date().toISOString();

      const { error: insertError } = await supabase
        .from("case_deadline_extensions")
        .insert([
          {
            deadline_id: extensionDeadlineId,
            extension_no: nextNo,
            requested_date: extensionForm.requested_date || null,
            granted_until_date: extensionForm.granted_until_date,
            note: extensionForm.note,
            created_at: now,
            updated_at: now,
          },
        ]);

      if (insertError) {
        alert(
          "Create extension failed:\n" + JSON.stringify(insertError, null, 2)
        );
        return;
      }

      const { error: updateError } = await supabase
        .from("case_deadlines")
        .update({
          current_due_date: extensionForm.granted_until_date,
          status: "Active",
          updated_at: now,
        })
        .eq("id", extensionDeadlineId);

      if (updateError) {
        alert(
          "Update current due date failed:\n" +
            JSON.stringify(updateError, null, 2)
        );
        return;
      }

      cancelExtensionForm();
      await loadDeadlines();
    } finally {
      setSavingExtension(false);
    }
  };

  return (
    <div id="deadlines" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Legal Deadlines</h3>
          <div style={subTitleStyle}>กำหนดเวลาทางกฎหมายและการขยายเวลา</div>
        </div>

        {!showForm ? (
          <button type="button" onClick={startAdd} style={primaryButtonStyle}>
            + Add Deadline
          </button>
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      {showForm && (
        <div style={formCardStyle}>
          <h4 style={formTitleStyle}>
            {editingId ? "Edit Deadline" : "Add Deadline"}
          </h4>

          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>ลำดับกำหนดเวลา</label>
              <div style={readonlyBoxStyle}>
                Deadline {form.order_no || "-"}
              </div>
            </div>

            <Select
              label="ประเภทกำหนดเวลา"
              value={form.deadline_type}
              onChange={(value) =>
                setForm({
                  ...form,
                  deadline_type: value,
                  deadline_other: value === "other" ? form.deadline_other : "",
                })
              }
              options={deadlineTypeOptions}
            />

            {form.deadline_type === "other" && (
              <Input
                label="ระบุกำหนดเวลาอื่นๆ"
                value={form.deadline_other}
                onChange={(value) =>
                  setForm({ ...form, deadline_other: value })
                }
                placeholder="เช่น ครบกำหนดยื่นบัญชีระบุพยาน"
              />
            )}

            <Select
              label="ฝ่าย / ผู้เกี่ยวข้อง"
              value={form.party_label}
              onChange={(value) =>
                setForm({
                  ...form,
                  party_label: value,
                  party_other: value === "อื่นๆ" ? form.party_other : "",
                })
              }
              options={partyOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            {form.party_label === "อื่นๆ" && (
              <Input
                label="ระบุฝ่าย / ผู้เกี่ยวข้องอื่นๆ"
                value={form.party_other}
                onChange={(value) => setForm({ ...form, party_other: value })}
              />
            )}

            <Select
              label="ประเภทคดี / Procedure"
              value={form.procedure_type}
              onChange={(value) =>
                setForm({
                  ...form,
                  procedure_type: value,
                  service_method:
                    value === "ordinary_civil"
                      ? form.service_method || "personal"
                      : "",
                })
              }
              options={procedureOptions}
            />

            {form.deadline_type === "answer" &&
              form.procedure_type === "ordinary_civil" && (
                <Select
                  label="วิธีส่งหมาย"
                  value={form.service_method}
                  onChange={(value) =>
                    setForm({ ...form, service_method: value })
                  }
                  options={serviceMethodOptions}
                />
              )}

            <Input
              label={getTriggerDateLabel(form)}
              type="date"
              value={form.trigger_date}
              onChange={(value) => setForm({ ...form, trigger_date: value })}
            />

            <div>
              <label style={labelStyle}>วันครบกำหนดที่ระบบคำนวณ</label>
              <div style={readonlyBoxStyle}>
                {calculateDueDate(form)
                  ? formatDisplayDate(calculateDueDate(form))
                  : "-"}
              </div>
            </div>

            <Select
              label="Status"
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
              options={statusOptions}
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="Note"
                value={form.note}
                onChange={(value) => setForm({ ...form, note: value })}
                placeholder="หมายเหตุเพิ่มเติม"
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={editingId ? updateDeadline : createDeadline}
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
        <div style={emptyStyle}>Loading deadlines...</div>
      ) : sortedDeadlines.length === 0 ? (
        <div style={emptyStyle}>No deadlines added.</div>
      ) : (
        <div style={deadlineListStyle}>
          {sortedDeadlines.map((item) => (
            <DeadlineCard
              key={item.id}
              item={item}
              extensions={extensions.filter((ex) => ex.deadline_id === item.id)}
              extensionDeadlineId={extensionDeadlineId}
              extensionForm={extensionForm}
              savingExtension={savingExtension}
              onEdit={startEdit}
              onDelete={deleteDeadline}
              onToggleDone={toggleDone}
              onStartAddExtension={startAddExtension}
              onCancelExtension={cancelExtensionForm}
              onChangeExtensionForm={setExtensionForm}
              onCreateExtension={createExtension}
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

function DeadlineCard({
  item,
  extensions,
  extensionDeadlineId,
  extensionForm,
  savingExtension,
  onEdit,
  onDelete,
  onToggleDone,
  onStartAddExtension,
  onCancelExtension,
  onChangeExtensionForm,
  onCreateExtension,
}: {
  item: DeadlineItem;
  extensions: DeadlineExtension[];
  extensionDeadlineId: string | null;
  extensionForm: ExtensionForm;
  savingExtension: boolean;
  onEdit: (item: DeadlineItem) => void;
  onDelete: (id: string) => void;
  onToggleDone: (item: DeadlineItem) => void;
  onStartAddExtension: (id: string) => void;
  onCancelExtension: () => void;
  onChangeExtensionForm: (form: ExtensionForm) => void;
  onCreateExtension: () => void;
}) {
  const deadlineText =
    item.deadline_type === "other"
      ? item.deadline_other || "อื่นๆ"
      : renderDeadlineType(item.deadline_type);

  const partyText =
    item.party_label === "อื่นๆ"
      ? item.party_other || "อื่นๆ"
      : item.party_label || "-";

  const dueStatus = getDeadlineDueStatus(item);
  const isDone = item.status === "Done";
  const isAddingExtension = extensionDeadlineId === item.id;

  return (
    <div
      style={{
        ...deadlineCardStyle,
        background: isDone ? "#f7f7f7" : getDeadlineBackground(dueStatus),
      }}
    >
      <div style={deadlineHeaderStyle}>
        <div>
          <div style={deadlineTitleStyle}>
            Deadline {item.order_no || "-"} : {deadlineText}
          </div>

          <div style={deadlineMatterStyle}>{partyText}</div>

          <div style={badgeRowStyle}>
            <span style={getStatusBadgeStyle(item.status)}>
              {renderStatus(item.status)}
            </span>
            <span style={getDueStatusBadgeStyle(dueStatus)}>{dueStatus}</span>
            {extensions.length > 0 && (
              <span style={extensionBadgeStyle}>
                Extended {extensions.length} time(s)
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onToggleDone(item)}
          style={isDone ? doneButtonStyle : smallButtonStyle}
        >
          {isDone ? "Undo" : "Done"}
        </button>
      </div>

      <div style={deadlineMetaGridStyle}>
        <InfoLine
          label="Procedure"
          value={renderProcedureType(item.procedure_type)}
        />
        <InfoLine
          label="Service / Trigger"
          value={renderServiceMethod(item.service_method)}
        />
        <InfoLine
          label="Trigger Date"
          value={formatDisplayDate(item.trigger_date)}
        />
        <InfoLine
          label="Original Due Date"
          value={formatDisplayDate(item.original_due_date)}
        />
        <InfoLine
          label="Current Due Date"
          value={formatDisplayDate(item.current_due_date)}
        />
      </div>

      {item.note && (
        <div style={noteBlockStyle}>
          <div style={infoLabelStyle}>Note</div>
          <div style={infoValueStyle}>{item.note}</div>
        </div>
      )}

      {extensions.length > 0 && (
        <div style={extensionListStyle}>
          <div style={extensionTitleStyle}>Extensions</div>
          {extensions.map((ex) => (
            <div key={ex.id} style={extensionItemStyle}>
              <div style={infoValueStyle}>
                ขยายครั้งที่ {ex.extension_no || "-"} ถึงวันที่{" "}
                {formatDisplayDate(ex.granted_until_date)}
              </div>
              {ex.requested_date && (
                <div style={infoLabelStyle}>
                  Requested: {formatDisplayDate(ex.requested_date)}
                </div>
              )}
              {ex.note && <div style={infoLabelStyle}>{ex.note}</div>}
            </div>
          ))}
        </div>
      )}

      {isAddingExtension && (
        <div style={extensionFormStyle}>
          <div style={extensionTitleStyle}>Add Extension</div>

          <div style={formGridStyle}>
            <Input
              label="วันที่ยื่นคำร้องขยายเวลา"
              type="date"
              value={extensionForm.requested_date}
              onChange={(value) =>
                onChangeExtensionForm({
                  ...extensionForm,
                  requested_date: value,
                })
              }
            />

            <Input
              label="ศาลอนุญาตถึงวันที่"
              type="date"
              value={extensionForm.granted_until_date}
              onChange={(value) =>
                onChangeExtensionForm({
                  ...extensionForm,
                  granted_until_date: value,
                })
              }
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="หมายเหตุการขยายเวลา"
                value={extensionForm.note}
                onChange={(value) =>
                  onChangeExtensionForm({
                    ...extensionForm,
                    note: value,
                  })
                }
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={onCreateExtension}
              disabled={savingExtension}
              style={primaryButtonStyle}
            >
              {savingExtension ? "Saving..." : "Save Extension"}
            </button>

            <button
              type="button"
              onClick={onCancelExtension}
              disabled={savingExtension}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={actionWrapStyle}>
        <button type="button" onClick={() => onEdit(item)} style={smallButtonStyle}>
          Edit
        </button>

        <button
          type="button"
          onClick={() => onStartAddExtension(item.id)}
          style={smallButtonStyle}
        >
          + Extension
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

function calculateDueDate(form: DeadlineForm) {
  if (!form.trigger_date) return "";

  if (form.deadline_type === "answer") {
    if (form.procedure_type === "ordinary_civil") {
      if (form.service_method === "personal") {
        return addDays(form.trigger_date, 15);
      }

      if (form.service_method === "posting") {
        return addDays(form.trigger_date, 30);
      }
    }

    if (
      form.procedure_type === "small_or_simple" ||
      form.procedure_type === "consumer"
    ) {
      return form.trigger_date;
    }
  }

  return form.trigger_date;
}

function addDays(dateString: string, days: number) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTriggerDateLabel(form: DeadlineForm) {
  if (form.deadline_type === "answer") {
    if (form.procedure_type === "ordinary_civil") {
      if (form.service_method === "posting") return "วันที่ปิดหมาย";
      return "วันที่ได้รับหมาย";
    }

    return "วันนัดแรก";
  }

  return "วันครบกำหนด";
}

function renderDeadlineType(type?: string | null) {
  if (type === "answer") return "ครบกำหนดยื่นคำให้การ";
  if (type === "appeal") return "ครบกำหนดอุทธรณ์";
  if (type === "appeal_answer") return "ครบกำหนดแก้อุทธรณ์";
  if (type === "supreme") return "ครบกำหนดฎีกา";
  if (type === "supreme_answer") return "ครบกำหนดแก้ฎีกา";
  if (type === "other") return "อื่นๆ";
  return "-";
}

function renderProcedureType(type?: string | null) {
  if (type === "ordinary_civil") return "คดีแพ่งสามัญ";
  if (type === "small_or_simple") return "คดีมโนสาเร่/ไม่มีข้อยุ่งยาก";
  if (type === "consumer") return "คดีผู้บริโภค";
  return "-";
}

function renderServiceMethod(method?: string | null) {
  if (method === "personal") return "รับหมายเอง";
  if (method === "posting") return "ปิดหมาย";
  return "-";
}

function renderStatus(status?: string | null) {
  if (status === "Active") return "Active (ยังต้องติดตาม)";
  if (status === "Done") return "Done (เสร็จแล้ว)";
  if (status === "Cancelled") return "Cancelled (ยกเลิก)";
  return "Active (ยังต้องติดตาม)";
}

function getDeadlineDueStatus(item: DeadlineItem) {
  if (item.status === "Done") return "Done (เสร็จแล้ว)";
  if (item.status === "Cancelled") return "Cancelled (ยกเลิก)";
  if (!item.current_due_date) return "No Due Date (ไม่กำหนดวัน)";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(item.current_due_date);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "Overdue (เกินกำหนด)";
  if (diffDays === 0) return "Today (ครบกำหนดวันนี้)";
  if (diffDays <= 3) return "Due Soon (ใกล้ครบกำหนด)";
  return "Normal (ปกติ)";
}

function getDeadlineStatusScore(item: DeadlineItem) {
  const dueStatus = getDeadlineDueStatus(item);

  if (dueStatus.startsWith("Overdue")) return 1;
  if (dueStatus.startsWith("Today")) return 2;
  if (dueStatus.startsWith("Due Soon")) return 3;
  if (dueStatus.startsWith("Normal")) return 4;
  if (dueStatus.startsWith("No Due Date")) return 5;
  if (dueStatus.startsWith("Cancelled")) return 6;
  if (dueStatus.startsWith("Done")) return 7;

  return 9;
}

function getDeadlineBackground(dueStatus: string) {
  if (dueStatus.startsWith("Overdue")) return "#fff5f5";
  if (dueStatus.startsWith("Today")) return "#fff8e1";
  if (dueStatus.startsWith("Due Soon")) return "#fffaf0";
  if (dueStatus.startsWith("Cancelled")) return "#f8fafc";
  return "#ffffff";
}

function getStatusBadgeStyle(status?: string | null): CSSProperties {
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

function getDueStatusBadgeStyle(dueStatus: string): CSSProperties {
  if (dueStatus.startsWith("Overdue")) {
    return {
      ...badgeBaseStyle,
      background: "#ffe5e5",
      color: "#b42318",
      border: "1px solid #f1b5b5",
    };
  }

  if (dueStatus.startsWith("Today")) {
    return {
      ...badgeBaseStyle,
      background: "#fff3cd",
      color: "#b54708",
      border: "1px solid #f0d58a",
    };
  }

  if (dueStatus.startsWith("Due Soon")) {
    return {
      ...badgeBaseStyle,
      background: "#fff8e1",
      color: "#b54708",
      border: "1px solid #eedc9a",
    };
  }

  if (dueStatus.startsWith("Done")) {
    return {
      ...badgeBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  if (dueStatus.startsWith("Cancelled")) {
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

const readonlyBoxStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#eeeeee",
  color: "#111111",
  boxSizing: "border-box",
  fontWeight: 700,
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

const emptyStyle: CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
};

const deadlineListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 12,
};

const deadlineCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const deadlineHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
};

const deadlineTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111111",
  lineHeight: 1.45,
};

const deadlineMatterStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 14,
  color: "#222222",
  fontWeight: 600,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 8,
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const extensionBadgeStyle: CSSProperties = {
  ...badgeBaseStyle,
  background: "#edf4ff",
  color: "#175cd3",
  border: "1px solid #b2ccff",
};

const deadlineMetaGridStyle: CSSProperties = {
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

const extensionListStyle: CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
};

const extensionTitleStyle: CSSProperties = {
  fontWeight: 800,
  marginBottom: 8,
  color: "#111111",
};

const extensionItemStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 10,
  padding: 10,
  background: "#ffffff",
  marginBottom: 8,
};

const extensionFormStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#fafafa",
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

const doneButtonStyle: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #b9dfc3",
  background: "#e6f4ea",
  color: "#067647",
  cursor: "pointer",
  fontWeight: 700,
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