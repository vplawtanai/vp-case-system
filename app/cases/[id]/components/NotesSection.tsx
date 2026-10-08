"use client";
import { useCaseDetailText } from "../labels";

import CaseEditModal from "../CaseEditModal";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";
import { createAuditLog } from "../../../../lib/auditLog";

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

  deleted_at?: string | null;
  deleted_by?: string | null;
};

type NoteForm = {
  note_no: string;
  note_date: string;
  author_name: string;
  author_other: string;
  note_type: string;
  note_title: string;
  note_text: string;
  important: boolean;
};

type Props = {
  caseId: string;
  canEdit?: boolean;
  canDelete?: boolean;
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
  author_other: "",
  note_type: "General Note / บันทึกทั่วไป",
  note_title: "",
  note_text: "",
  important: false,
};

export default function NotesSection({
  caseId,
  canEdit = false,
  canDelete = false,
}: Props) {
  const { tr } = useCaseDetailText();
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
        .is("deleted_at", null)
        .order("note_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        alert(tr("Load notes failed:\n" + JSON.stringify(error, null, 2)));
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
      const importantA = a.important ? 0 : 1;
      const importantB = b.important ? 0 : 1;

      if (importantA !== importantB) return importantA - importantB;

      const noA = a.note_no || 0;
      const noB = b.note_no || 0;

      if (noA !== noB) return noA - noB;

      return (a.created_at || "").localeCompare(b.created_at || "");
    });
  }, [items]);

  const summary = useMemo(() => {
    const important = items.filter((item) => item.important).length;

    const strategy = items.filter((item) =>
      (item.note_type || "").startsWith("Strategy")
    ).length;

    const risk = items.filter((item) =>
      (item.note_type || "").startsWith("Risk")
    ).length;

    const clientInstruction = items.filter((item) =>
      (item.note_type || "").startsWith("Client Instruction")
    ).length;

    return {
      total: items.length,
      important,
      strategy,
      risk,
      clientInstruction,
    };
  }, [items]);

  const getNextNoteNo = () => {
    const maxNo = items.reduce((max, item) => {
      const no = item.note_no || 0;
      return no > max ? no : max;
    }, 0);

    return maxNo + 1;
  };

  const startAdd = () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่ม Note"));
      return;
    }

    setEditingId(null);
    setForm({
      ...emptyForm,
      note_no: String(getNextNoteNo()),
      note_date: getTodayDateString(),
    });
    setShowForm(true);

  };

  const startEdit = (item: NoteItem) => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไข Note"));
      return;
    }

    const savedAuthorName = item.author_name || "ทนายเป้า";
    const isKnownAuthor = authorOptions.includes(savedAuthorName);

    setEditingId(item.id);
    setShowForm(true);


    setForm({
      note_no: item.note_no ? String(item.note_no) : "1",
      note_date: item.note_date || getTodayDateString(),
      author_name: isKnownAuthor ? savedAuthorName : "อื่นๆ",
      author_other: isKnownAuthor ? "" : savedAuthorName,
      note_type: item.note_type || "General Note / บันทึกทั่วไป",
      note_title: item.note_title || "",
      note_text: item.note_text || "",
      important: !!item.important,
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm({
      ...emptyForm,
      note_date: getTodayDateString(),
    });
  };

  const validateNote = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert(tr("Missing case id"));
      return false;
    }

    if (!form.note_date) {
      alert(tr("กรุณาเลือกวันที่บันทึก"));
      return false;
    }

    if (!form.author_name.trim()) {
      alert(tr("กรุณาเลือกหรือกรอกผู้บันทึก"));
      return false;
    }

    if (form.author_name === "อื่นๆ" && !form.author_other.trim()) {
      alert(tr("กรุณากรอกชื่อผู้บันทึกอื่นๆ"));
      return false;
    }

    if (!form.note_type.trim()) {
      alert(tr("กรุณาเลือกประเภท Note"));
      return false;
    }

    if (!form.note_title.trim()) {
      alert(tr("กรุณากรอกหัวข้อ Note"));
      return false;
    }

    if (!form.note_text.trim()) {
      alert(tr("กรุณากรอกรายละเอียด Note"));
      return false;
    }

    return true;
  };

  const buildPayload = () => {
    const finalAuthorName =
      form.author_name === "อื่นๆ" ? form.author_other.trim() : form.author_name;

    return {
      case_id: caseIdNumber,
      note_no: form.note_no ? Number(form.note_no) : null,
      note_date: form.note_date,
      author_name: finalAuthorName,
      note_type: form.note_type,
      note_title: form.note_title,
      note_text: form.note_text,
      important: form.important,
      updated_at: new Date().toISOString(),
    };
  };

  const createNote = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่ม Note"));
      cancelForm();
      return;
    }

    if (!validateNote()) return;

    try {
      setSaving(true);

      const payload = {
        ...buildPayload(),
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };

      const { data, error } = await supabase
        .from("case_notes")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        alert(tr("Create note failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_notes",
        recordId: data?.id,
        action: "create",
        oldData: null,
        newData: data || payload,
        note: "Create note",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      cancelForm();
      await loadNotes();
    } finally {
      setSaving(false);
    }
  };

  const updateNote = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไข Note"));
      cancelForm();
      return;
    }

    if (!editingId) return;
    if (!validateNote()) return;

    try {
      setSaving(true);

      const oldData = items.find((item) => item.id === editingId) || null;
      const payload = buildPayload();

      const { data, error } = await supabase
        .from("case_notes")
        .update(payload)
        .eq("id", editingId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(tr("Update note failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_notes",
        recordId: editingId,
        action: "update",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Update note",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      cancelForm();
      await loadNotes();
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    if (!canDelete) {
      alert(tr("คุณไม่มีสิทธิ์ลบ Note"));
      return;
    }

    const confirmed = window.confirm(
      tr("ต้องการลบ Note นี้หรือไม่?\n\nระบบจะซ่อนรายการนี้ออกจากหน้าใช้งาน แต่ยังเก็บข้อมูลไว้ในฐานข้อมูลเพื่อใช้ตรวจสอบย้อนหลัง")
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const oldData = items.find((item) => item.id === id) || null;

      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: "current_user",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("case_notes")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(tr("Soft delete note failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_notes",
        recordId: id,
        action: "soft_delete",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Soft delete note",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      if (editingId === id) cancelForm();

      await loadNotes();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="notes" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>{tr("Notes")} </h3>
          <div style={subTitleStyle}>
            {tr("สมุดบันทึกกลางของคดี สำหรับข้อมูล ความเห็น และข้อสังเกตภายใน · รวม")} {" "}
            {summary.total} {tr("รายการ")} </div>
        </div>

        {!showForm ? (
          canEdit ? (
            <button type="button" onClick={startAdd} style={primaryButtonStyle}>
              {tr("+ Add Note")} </button>
          ) : null
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            {tr("Cancel")} </button>
        )}
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard label={tr("Total")} value={String(summary.total)} />
        <SummaryCard label={tr("Important")} value={String(summary.important)} />
        <SummaryCard label={tr("Strategy")} value={String(summary.strategy)} />
        <SummaryCard label={tr("Risk")} value={String(summary.risk)} />
        <SummaryCard
          label={tr("Client Instruction")}
          value={String(summary.clientInstruction)}
        />
      </div>

      {showForm && (
        <CaseEditModal title={editingId ? tr("Edit Note") : tr("Add Note")} onClose={cancelForm} busy={saving}>


          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>{tr("ลำดับ Note")} </label>
              <div style={readonlyBoxStyle}>{tr("Note No.")} {form.note_no || "-"}</div>
            </div>

            <Input
              label={tr("วันที่บันทึก")}
              type="date"
              value={form.note_date}
              onChange={(value) => setForm({ ...form, note_date: value })}
            />

            <Select
              label={tr("ผู้บันทึก")}
              value={form.author_name}
              onChange={(value) =>
                setForm({
                  ...form,
                  author_name: value,
                  author_other: value === "อื่นๆ" ? form.author_other : "",
                })
              }
              options={authorOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            {form.author_name === "อื่นๆ" && (
              <Input
                label={tr("ระบุชื่อผู้บันทึกอื่นๆ")}
                value={form.author_other}
                onChange={(value) => setForm({ ...form, author_other: value })}
                placeholder={tr("เช่น ทนายเอก / ผู้ช่วย / บุคคลอื่น")}
              />
            )}

            <Select
              label={tr("ประเภท Note")}
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
              <span>{tr("Important / สำคัญ")} </span>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <Input
                label={tr("หัวข้อ Note")}
                value={form.note_title}
                onChange={(value) => setForm({ ...form, note_title: value })}
                placeholder={tr("เช่น ลูกค้าแจ้งข้อมูลเพิ่มเติม / ประเด็นที่ต้องตรวจสอบ")}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label={tr("รายละเอียด Note")}
                value={form.note_text}
                onChange={(value) => setForm({ ...form, note_text: value })}
                placeholder={tr("บันทึกรายละเอียด ข้อสังเกต ความเห็น หรือข้อมูลที่ต้องจำไว้")}
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
        <div style={emptyStyle}>{tr("Loading notes...")} </div>
      ) : sortedNotes.length === 0 ? (
        <div style={emptyStyle}>{tr("No notes added.")} </div>
      ) : (
        <div style={noteListStyle}>
          {sortedNotes.map((item) => (
            <NoteCard
              key={item.id}
              item={item}
              canEdit={canEdit}
              canDelete={canDelete}
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  const { tr } = useCaseDetailText();
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{tr(label)}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function NoteCard({
  item,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  item: NoteItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (item: NoteItem) => void;
  onDelete: (id: string) => void;
}) {
  const { tr, date } = useCaseDetailText();
  const showActions = canEdit || canDelete;

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
            {tr("Note No.")} {item.note_no || "-"} : {item.note_title || "-"}
          </div>
          <div style={noteMetaStyle}>
            {date(item.note_date)} • {item.author_name || "-"} •{" "}
            {tr(item.note_type) || "-"}
          </div>
        </div>

        {item.important && <span style={importantBadgeStyle}>{tr("Important")} </span>}
      </div>

      <div style={noteTextStyle}>{item.note_text || "-"}</div>

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


/* =========================================================
   STYLES
========================================================= */

const sectionStyle: CSSProperties = {
  border: "1px solid #dddddd",
  padding: "clamp(12px, 2vw, 16px)",
  borderRadius: 14,
  background: "#ffffff",
  color: "#183854",
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
  color: "#183854",
  fontSize: 18,
  fontWeight: 700,
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
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#ffffff",
  color: "#183854",
  borderRadius: 8,
  border: "1px solid #cccccc",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 11,
  background: "#f7f9fc",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 4,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const summaryValueStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#183854",
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
  fontWeight: 700,
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
  color: "#183854",
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
  color: "#183854",
  boxSizing: "border-box",
  fontWeight: 700,
  fontSize: 13,
};

const checkboxBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 36,
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#ffffff",
  color: "#183854",
  fontWeight: 700,
  fontSize: 13,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  resize: "vertical",
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  flexWrap: "wrap",
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

const noteListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 10,
};

const noteCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 12,
  background: "#ffffff",
  color: "#183854",
  boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
};

const noteHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 9,
};

const noteTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#183854",
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const noteMetaStyle: CSSProperties = {
  marginTop: 3,
  color: "#555555",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.45,
};

const noteTextStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
  color: "#183854",
  fontSize: 13,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const importantBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#fff3cd",
  color: "#b54708",
  border: "1px solid #f0d58a",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
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
  color: "#183854",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};
