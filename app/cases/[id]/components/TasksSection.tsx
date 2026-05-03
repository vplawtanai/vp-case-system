"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

type TaskItem = {
  id: string;
  case_id: number;

  order_no?: number | null;

  task_type?: string | null;
  task_other?: string | null;

  owner_name?: string | null;
  assignee_name?: string | null;

  start_date?: string | null;
  due_date?: string | null;

  status?: string | null;
  note?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type TaskForm = {
  order_no: string;
  task_type: string;
  task_other: string;
  owner_name: string;
  assignee_name: string;
  start_date: string;
  due_date: string;
  status: string;
  note: string;
};

type Props = {
  caseId: string;
  tasks?: unknown[];
};

const taskTypeOptions = [
  "สอบข้อเท็จจริง",
  "เตรียมเอกสาร",
  "ทำหนังสือบอกกล่าว",
  "ร่างคำฟ้อง",
  "เตรียมพยาน",
  "เตรียมเอกสารวันนัดที่จะถึง",
  "อื่นๆ",
];

const statusOptions = [
  { value: "Pending", label: "Pending" },
  { value: "In Progress", label: "In Progress" },
  { value: "Done", label: "Done" },
];

const emptyForm: TaskForm = {
  order_no: "1",
  task_type: "สอบข้อเท็จจริง",
  task_other: "",
  owner_name: "",
  assignee_name: "",
  start_date: "",
  due_date: "",
  status: "Pending",
  note: "",
};

export default function TasksSection({ caseId }: Props) {
  const caseIdNumber = Number(caseId);

  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);

  const loadTasks = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("case_tasks")
        .select("*")
        .eq("case_id", caseIdNumber)
        .order("order_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        alert("Load tasks failed:\n" + JSON.stringify(error, null, 2));
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
  }, [caseId]);

  const sortedTasks = useMemo(() => {
    return [...items].sort((a, b) => {
      const aDone = a.status === "Done" ? 1 : 0;
      const bDone = b.status === "Done" ? 1 : 0;

      if (aDone !== bDone) return aDone - bDone;

      const aDue = a.due_date || "9999-12-31";
      const bDue = b.due_date || "9999-12-31";

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

  const startAddTask = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      order_no: String(getNextOrderNo()),
    });
    setShowForm(true);
  };

  const startEditTask = (item: TaskItem) => {
    setEditingId(item.id);
    setShowForm(true);

    setForm({
      order_no: item.order_no ? String(item.order_no) : "1",
      task_type: item.task_type || "สอบข้อเท็จจริง",
      task_other: item.task_other || "",
      owner_name: item.owner_name || "",
      assignee_name: item.assignee_name || "",
      start_date: item.start_date || "",
      due_date: item.due_date || "",
      status: item.status || "Pending",
      note: item.note || "",
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  };

  const validateTask = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return false;
    }

    if (!form.task_type.trim()) {
      alert("กรุณาเลือกงานที่ต้องทำ");
      return false;
    }

    if (form.task_type === "อื่นๆ" && !form.task_other.trim()) {
      alert("กรุณากรอกรายละเอียดงานอื่นๆ");
      return false;
    }

    if (!form.assignee_name.trim()) {
      alert("กรุณากรอกผู้รับมอบหมาย");
      return false;
    }

    return true;
  };

  const buildPayload = () => {
    const now = new Date().toISOString();

    return {
      case_id: caseIdNumber,

      order_no: form.order_no ? Number(form.order_no) : null,

      task_type: form.task_type,
      task_other: form.task_type === "อื่นๆ" ? form.task_other : "",

      owner_name: form.owner_name,
      assignee_name: form.assignee_name,

      start_date: form.start_date,
      due_date: form.due_date,

      status: form.status,
      note: form.note,

      updated_at: now,
    };
  };

  const createTask = async () => {
    if (!validateTask()) return;

    try {
      setSaving(true);

      const { error } = await supabase.from("case_tasks").insert([
        {
          ...buildPayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create task failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadTasks();
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async () => {
    if (!editingId) return;
    if (!validateTask()) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("case_tasks")
        .update(buildPayload())
        .eq("id", editingId);

      if (error) {
        alert("Update task failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadTasks();
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบงานนี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase.from("case_tasks").delete().eq("id", id);

    if (error) {
      alert("Delete task failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingId === id) cancelForm();

    await loadTasks();
  };

  const markDone = async (item: TaskItem) => {
    const nextStatus = item.status === "Done" ? "Pending" : "Done";

    const { error } = await supabase
      .from("case_tasks")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      alert("Update task status failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    await loadTasks();
  };

  return (
    <div id="tasks" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Tasks</h3>
          <div style={subTitleStyle}>งานที่ต้องทำในคดีนี้</div>
        </div>

        {!showForm ? (
          <button type="button" onClick={startAddTask} style={primaryButtonStyle}>
            + Add Task
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
            {editingId ? "Edit Task" : "Add Task"}
          </h4>

          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>ลำดับงาน</label>
              <div style={readonlyBoxStyle}>งานที่ {form.order_no || "-"}</div>
            </div>

            <Select
              label="งานที่ต้องทำ"
              value={form.task_type}
              onChange={(value) =>
                setForm({
                  ...form,
                  task_type: value,
                  task_other: value === "อื่นๆ" ? form.task_other : "",
                })
              }
              options={taskTypeOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            {form.task_type === "อื่นๆ" && (
              <Input
                label="ระบุงานอื่นๆ"
                value={form.task_other}
                onChange={(value) => setForm({ ...form, task_other: value })}
                placeholder="กรอกรายละเอียดงาน"
              />
            )}

            <Input
              label="Owner / ผู้มอบหมาย"
              value={form.owner_name}
              onChange={(value) => setForm({ ...form, owner_name: value })}
              placeholder="เช่น ทนายเป้า"
            />

            <Input
              label="Assignee / ผู้รับมอบหมาย"
              value={form.assignee_name}
              onChange={(value) => setForm({ ...form, assignee_name: value })}
              placeholder="เช่น แพม / แตงโม / ทนายตุลย์"
            />

            <Input
              label="Start Date"
              type="date"
              value={form.start_date}
              onChange={(value) => setForm({ ...form, start_date: value })}
            />

            <Input
              label="Due Date"
              type="date"
              value={form.due_date}
              onChange={(value) => setForm({ ...form, due_date: value })}
            />

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
              onClick={editingId ? updateTask : createTask}
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
        <div style={emptyStyle}>Loading tasks...</div>
      ) : sortedTasks.length === 0 ? (
        <div style={emptyStyle}>No tasks added.</div>
      ) : (
        <div style={taskListStyle}>
          {sortedTasks.map((item) => (
            <TaskCard
              key={item.id}
              item={item}
              onEdit={startEditTask}
              onDelete={deleteTask}
              onToggleDone={markDone}
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

function TaskCard({
  item,
  onEdit,
  onDelete,
  onToggleDone,
}: {
  item: TaskItem;
  onEdit: (item: TaskItem) => void;
  onDelete: (id: string) => void;
  onToggleDone: (item: TaskItem) => void;
}) {
  const taskText =
    item.task_type === "อื่นๆ" ? item.task_other || "อื่นๆ" : item.task_type || "-";

  const isDone = item.status === "Done";

  return (
    <div style={{ ...taskCardStyle, background: isDone ? "#f7f7f7" : "#ffffff" }}>
      <div style={taskHeaderStyle}>
        <div>
          <div style={taskTitleStyle}>
            งานที่ {item.order_no || "-"} : {taskText}
          </div>
          <div style={taskMetaTextStyle}>
            Status: {item.status || "-"}
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

      <div style={taskMetaGridStyle}>
        <InfoLine label="Owner" value={item.owner_name || "-"} />
        <InfoLine label="Assignee" value={item.assignee_name || "-"} />
        <InfoLine label="Start Date" value={formatDisplayDate(item.start_date)} />
        <InfoLine label="Due Date" value={formatDisplayDate(item.due_date)} />
      </div>

      {item.note && (
        <div style={noteBlockStyle}>
          <div style={infoLabelStyle}>Note</div>
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

const taskListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const taskCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const taskHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
};

const taskTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111111",
  lineHeight: 1.45,
};

const taskMetaTextStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
  fontWeight: 600,
};

const taskMetaGridStyle: CSSProperties = {
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