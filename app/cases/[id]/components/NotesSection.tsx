"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

type NoteItem = {
  id: string;
  case_id: number;

  note_no?: number | null;
  note_date?: string | null;
  author_name?: string | null;

  note_type?: string | null;
  note_title?: string | null;
  note_text?: string | null;

  important?: boolean | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type NoteForm = {
  note_no: string;
  note_date: string;
  author_name: string;
  note_type: string;
  note_title: string;
  note_text: string;
  important: boolean;
};

type Props = {
  caseId: string;
};

const authorOptions = ["ทนายเป้า", "ทนายตุลย์", "แพม", "แตงโม", "อื่นๆ"];

const noteTypeOptions = [
  "General Note / บันทึกทั่วไป",
  "Client Instruction / คำสั่งหรือข้อมูลจากลูกค้า",
  "Strategy / แนวทางคดี",
  "Evidence Note / หมายเหตุเรื่องพยานหลักฐาน",
  "Internal Comment / ความเห็นภายในทีม",
  "Risk / ข้อควรระวัง",
  "Other / อื่นๆ",
];

const emptyForm: NoteForm = {
  note_no: "1",
  note_date: getTodayDateString(),
  author_name: "ทนายเป้า",
  note_type: "General Note / บันทึกทั่วไป",
  note_title: "",
  note_text: "",
  important: false,
};

export default function NotesSection({ caseId }: Props) {
  const caseIdNumber = Number(caseId);

  const [items, setItems] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NoteForm>(emptyForm);

  const loadNotes = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("case_notes")
        .select("*")
        .eq("case_id", caseIdNumber)
        .order("note_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        alert("Load notes failed:\n" + JSON.stringify(error, null, 2));
        setItems([]);
        return;
      }

      setItems((data || []) as NoteItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const sortedNotes = useMemo(() => {
    return [...items].sort((a, b) => {
      const noA = a.note_no || 0;
      const noB = b.note_no || 0;

      if (noA !== noB) return noA - noB;

      return (a.created_at || "").localeCompare(b.created_at || "");
    });
  }, [items]);

  const getNextNoteNo = () => {
    const maxNo = items.reduce((max, item) => {
      const no = item.note_no || 0;
      return no > max ? no : max;
    }, 0);

    return maxNo + 1;
  };

  const startAdd = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      note_no: String(getNextNoteNo()),
      note_date: getTodayDateString(),
    });
    setShowForm(true);
  };

  const startEdit = (item: NoteItem) => {
    setEditingId(item.id);
    setShowForm(true);

    setForm({
      note_no: item.note_no ? String(item.note_no) : "1",
      note_date: item.note_date || getTodayDateString(),
      author_name: item.author_name || "ทนายเป้า",
      note_type: item.note_type || "General Note / บันทึกทั่วไป",
      note_title: item.note_title || "",
      note_text: item.note_text || "",
      important: !!item.important,
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  };

  const validateNote = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return false;
    }

    if (!form.note_date) {
      alert("กรุณาเลือกวันที่บันทึก");
      return false;
    }

    if (!form.author_name.trim()) {
      alert("กรุณาเลือกหรือกรอกผู้บันทึก");
      return false;
    }

    if (form.author_name === "อื่นๆ") {
      alert("ตอนนี้ช่องผู้บันทึกอื่นๆ ยังไม่ได้แยกไว้ ให้พิมพ์ชื่อจริงแทนคำว่าอื่นๆ ก่อน");
      return false;
    }

    if (!form.note_type.trim()) {
      alert("กรุณาเลือกประเภท Note");
      return false;
    }

    if (!form.note_title.trim()) {
      alert("กรุณากรอกหัวข้อ Note");
      return false;
    }

    if (!form.note_text.trim()) {
      alert("กรุณากรอกรายละเอียด Note");
      return false;
    }

    return true;
  };

  const buildPayload = () => {
    return {
      case_id: caseIdNumber,
      note_no: form.note_no ? Number(form.note_no) : null,
      note_date: form.note_date,
      author_name: form.author_name,
      note_type: form.note_type,
      note_title: form.note_title,
      note_text: form.note_text,
      important: form.important,
      updated_at: new Date().toISOString(),
    };
  };

  const createNote = async () => {
    if (!validateNote()) return;

    try {
      setSaving(true);

      const { error } = await supabase.from("case_notes").insert([
        {
          ...buildPayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create note failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadNotes();
    } finally {
      setSaving(false);
    }
  };

  const updateNote = async () => {
    if (!editingId) return;
    if (!validateNote()) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("case_notes")
        .update(buildPayload())
        .eq("id", editingId);

      if (error) {
        alert("Update note failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelForm();
      await loadNotes();
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบ Note นี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase.from("case_notes").delete().eq("id", id);

    if (error) {
      alert("Delete note failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingId === id) cancelForm();

    await loadNotes();
  };

  return (
    <div id="notes" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Notes</h3>
          <div style={subTitleStyle}>
            สมุดบันทึกกลางของคดี สำหรับข้อมูล ความเห็น และข้อสังเกตภายใน
          </div>
        </div>

        {!showForm ? (
          <button type="button" onClick={startAdd} style={primaryButtonStyle}>
            + Add Note
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
            {editingId ? "Edit Note" : "Add Note"}
          </h4>

          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>ลำดับ Note</label>
              <div style={readonlyBoxStyle}>Note No. {form.note_no || "-"}</div>
            </div>

            <Input
              label="วันที่บันทึก"
              type="date"
              value={form.note_date}
              onChange={(value) => setForm({ ...form, note_date: value })}
            />

            <Select
              label="ผู้บันทึก"
              value={form.author_name}
              onChange={(value) => setForm({ ...form, author_name: value })}
              options={authorOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            <Select
              label="ประเภท Note"
              value={form.note_type}
              onChange={(value) => setForm({ ...form, note_type: value })}
              options={noteTypeOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            <div style={checkboxBoxStyle}>
              <input
                type="checkbox"
                checked={form.important}
                onChange={(e) =>
                  setForm({ ...form, important: e.target.checked })
                }
              />
              <span>Important / สำคัญ</span>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <Input
                label="หัวข้อ Note"
                value={form.note_title}
                onChange={(value) => setForm({ ...form, note_title: value })}
                placeholder="เช่น ลูกค้าแจ้งข้อมูลเพิ่มเติม / ประเด็นที่ต้องตรวจสอบ"
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="รายละเอียด Note"
                value={form.note_text}
                onChange={(value) => setForm({ ...form, note_text: value })}
                placeholder="บันทึกรายละเอียด ข้อสังเกต ความเห็น หรือข้อมูลที่ต้องจำไว้"
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={editingId ? updateNote : createNote}
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
        <div style={emptyStyle}>Loading notes...</div>
      ) : sortedNotes.length === 0 ? (
        <div style={emptyStyle}>No notes added.</div>
      ) : (
        <div style={noteListStyle}>
          {sortedNotes.map((item) => (
            <NoteCard
              key={item.id}
              item={item}
              onEdit={startEdit}
              onDelete={deleteNote}
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

function NoteCard({
  item,
  onEdit,
  onDelete,
}: {
  item: NoteItem;
  onEdit: (item: NoteItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      style={{
        ...noteCardStyle,
        border: item.important ? "1px solid #f0c36a" : noteCardStyle.border,
        background: item.important ? "#fffaf0" : "#ffffff",
      }}
    >
      <div style={noteHeaderStyle}>
        <div>
          <div style={noteTitleStyle}>
            Note No. {item.note_no || "-"} : {item.note_title || "-"}
          </div>
          <div style={noteMetaStyle}>
            {formatDisplayDate(item.note_date)} • {item.author_name || "-"} •{" "}
            {item.note_type || "-"}
          </div>
        </div>

        {item.important && <span style={importantBadgeStyle}>Important</span>}
      </div>

      <div style={noteTextStyle}>{item.note_text || "-"}</div>

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

const checkboxBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 40,
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 600,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 130,
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

const noteListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
};

const noteCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const noteHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 10,
};

const noteTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#111111",
  lineHeight: 1.45,
};

const noteMetaStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
  fontWeight: 600,
};

const noteTextStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
  color: "#111111",
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: "pre-wrap",
};

const importantBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#fff3cd",
  color: "#b54708",
  border: "1px solid #f0d58a",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
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