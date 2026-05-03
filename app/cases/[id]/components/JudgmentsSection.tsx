"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

type JudgmentItem = {
  id: string;
  case_id: number;
  court_level?: string | null;
  judgment_date?: string | null;
  summary_text?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CourtFilingItem = {
  id: string;
  case_id: number;
  filing_type?: string | null;
  party_label?: string | null;
  party_other?: string | null;
  filed_date?: string | null;
  summary_text?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type JudgmentForm = {
  court_level: string;
  judgment_date: string;
  summary_text: string;
  note: string;
};

type FilingForm = {
  filing_type: string;
  party_label: string;
  party_other: string;
  filed_date: string;
  summary_text: string;
  note: string;
};

type Props = {
  caseId: string;
};

const courtLevelOptions = [
  { value: "first_instance", label: "ศาลชั้นต้น" },
  { value: "appeal", label: "ศาลอุทธรณ์" },
  { value: "supreme", label: "ศาลฎีกา" },
];

const filingTypeOptions = [
  { value: "appeal", label: "ยื่นอุทธรณ์" },
  { value: "appeal_answer", label: "ยื่นคำแก้อุทธรณ์" },
  { value: "supreme", label: "ยื่นฎีกา" },
  { value: "supreme_answer", label: "ยื่นคำแก้ฎีกา" },
];

const partyOptions = [
  "โจทก์",
  "โจทก์ที่ 1",
  "โจทก์ที่ 2",
  "โจทก์ที่ 3",
  "จำเลย",
  "จำเลยที่ 1",
  "จำเลยที่ 2",
  "จำเลยที่ 3",
  "ผู้ร้อง",
  "ผู้ร้องที่ 1",
  "ผู้ร้องที่ 2",
  "ผู้คัดค้าน",
  "ผู้คัดค้านที่ 1",
  "ผู้คัดค้านที่ 2",
  "อื่นๆ",
];

const emptyJudgmentForm: JudgmentForm = {
  court_level: "first_instance",
  judgment_date: "",
  summary_text: "",
  note: "",
};

const emptyFilingForm: FilingForm = {
  filing_type: "appeal",
  party_label: "โจทก์",
  party_other: "",
  filed_date: "",
  summary_text: "",
  note: "",
};

export default function JudgmentsSection({ caseId }: Props) {
  const caseIdNumber = Number(caseId);

  const [judgments, setJudgments] = useState<JudgmentItem[]>([]);
  const [filings, setFilings] = useState<CourtFilingItem[]>([]);

  const [loading, setLoading] = useState(false);

  const [showJudgmentForm, setShowJudgmentForm] = useState(false);
  const [editingJudgmentId, setEditingJudgmentId] = useState<string | null>(
    null
  );
  const [savingJudgment, setSavingJudgment] = useState(false);
  const [judgmentForm, setJudgmentForm] =
    useState<JudgmentForm>(emptyJudgmentForm);

  const [showFilingForm, setShowFilingForm] = useState(false);
  const [editingFilingId, setEditingFilingId] = useState<string | null>(null);
  const [savingFiling, setSavingFiling] = useState(false);
  const [filingForm, setFilingForm] = useState<FilingForm>(emptyFilingForm);

  const loadData = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data: judgmentData, error: judgmentError } = await supabase
        .from("case_judgments")
        .select("*")
        .eq("case_id", caseIdNumber)
        .order("created_at", { ascending: true });

      if (judgmentError) {
        alert("Load judgments failed:\n" + JSON.stringify(judgmentError, null, 2));
        setJudgments([]);
        return;
      }

      const { data: filingData, error: filingError } = await supabase
        .from("case_court_filings")
        .select("*")
        .eq("case_id", caseIdNumber)
        .order("filed_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (filingError) {
        alert("Load court filings failed:\n" + JSON.stringify(filingError, null, 2));
        setFilings([]);
        return;
      }

      setJudgments((judgmentData || []) as JudgmentItem[]);
      setFilings((filingData || []) as CourtFilingItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const sortedJudgments = useMemo(() => {
    const order: Record<string, number> = {
      first_instance: 1,
      appeal: 2,
      supreme: 3,
    };

    return [...judgments].sort((a, b) => {
      const aOrder = order[a.court_level || ""] || 99;
      const bOrder = order[b.court_level || ""] || 99;

      if (aOrder !== bOrder) return aOrder - bOrder;

      return (a.judgment_date || "").localeCompare(b.judgment_date || "");
    });
  }, [judgments]);

  const sortedFilings = useMemo(() => {
    const order: Record<string, number> = {
      appeal: 1,
      appeal_answer: 2,
      supreme: 3,
      supreme_answer: 4,
    };

    return [...filings].sort((a, b) => {
      const aOrder = order[a.filing_type || ""] || 99;
      const bOrder = order[b.filing_type || ""] || 99;

      if (aOrder !== bOrder) return aOrder - bOrder;

      return (a.filed_date || "").localeCompare(b.filed_date || "");
    });
  }, [filings]);

  const startAddJudgment = () => {
    setEditingJudgmentId(null);
    setJudgmentForm(emptyJudgmentForm);
    setShowJudgmentForm(true);
  };

  const startEditJudgment = (item: JudgmentItem) => {
    setEditingJudgmentId(item.id);
    setJudgmentForm({
      court_level: item.court_level || "first_instance",
      judgment_date: item.judgment_date || "",
      summary_text: item.summary_text || "",
      note: item.note || "",
    });
    setShowJudgmentForm(true);
  };

  const cancelJudgmentForm = () => {
    setEditingJudgmentId(null);
    setJudgmentForm(emptyJudgmentForm);
    setShowJudgmentForm(false);
  };

  const validateJudgment = () => {
    if (!judgmentForm.court_level) {
      alert("กรุณาเลือกชั้นศาล");
      return false;
    }

    if (!judgmentForm.summary_text.trim()) {
      alert("กรุณากรอกสรุปคำพิพากษา/คำสั่งโดยย่อ");
      return false;
    }

    return true;
  };

  const createJudgment = async () => {
    if (!validateJudgment()) return;

    try {
      setSavingJudgment(true);

      const now = new Date().toISOString();

      const { error } = await supabase.from("case_judgments").insert([
        {
          case_id: caseIdNumber,
          court_level: judgmentForm.court_level,
          judgment_date: judgmentForm.judgment_date || null,
          summary_text: judgmentForm.summary_text,
          note: judgmentForm.note,
          created_at: now,
          updated_at: now,
        },
      ]);

      if (error) {
        alert("Create judgment failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelJudgmentForm();
      await loadData();
    } finally {
      setSavingJudgment(false);
    }
  };

  const updateJudgment = async () => {
    if (!editingJudgmentId) return;
    if (!validateJudgment()) return;

    try {
      setSavingJudgment(true);

      const { error } = await supabase
        .from("case_judgments")
        .update({
          court_level: judgmentForm.court_level,
          judgment_date: judgmentForm.judgment_date || null,
          summary_text: judgmentForm.summary_text,
          note: judgmentForm.note,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingJudgmentId);

      if (error) {
        alert("Update judgment failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelJudgmentForm();
      await loadData();
    } finally {
      setSavingJudgment(false);
    }
  };

  const deleteJudgment = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบข้อมูลคำพิพากษานี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase.from("case_judgments").delete().eq("id", id);

    if (error) {
      alert("Delete judgment failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingJudgmentId === id) cancelJudgmentForm();

    await loadData();
  };

  const startAddFiling = () => {
    setEditingFilingId(null);
    setFilingForm(emptyFilingForm);
    setShowFilingForm(true);
  };

  const startEditFiling = (item: CourtFilingItem) => {
    setEditingFilingId(item.id);
    setFilingForm({
      filing_type: item.filing_type || "appeal",
      party_label: item.party_label || "โจทก์",
      party_other: item.party_other || "",
      filed_date: item.filed_date || "",
      summary_text: item.summary_text || "",
      note: item.note || "",
    });
    setShowFilingForm(true);
  };

  const cancelFilingForm = () => {
    setEditingFilingId(null);
    setFilingForm(emptyFilingForm);
    setShowFilingForm(false);
  };

  const validateFiling = () => {
    if (!filingForm.filing_type) {
      alert("กรุณาเลือกประเภทการยื่น");
      return false;
    }

    if (filingForm.party_label === "อื่นๆ" && !filingForm.party_other.trim()) {
      alert("กรุณาระบุฝ่ายที่ยื่น");
      return false;
    }

    if (!filingForm.filed_date) {
      alert("กรุณาเลือกวันที่ยื่น");
      return false;
    }

    return true;
  };

  const createFiling = async () => {
    if (!validateFiling()) return;

    try {
      setSavingFiling(true);

      const now = new Date().toISOString();

      const { error } = await supabase.from("case_court_filings").insert([
        {
          case_id: caseIdNumber,
          filing_type: filingForm.filing_type,
          party_label: filingForm.party_label,
          party_other:
            filingForm.party_label === "อื่นๆ" ? filingForm.party_other : "",
          filed_date: filingForm.filed_date,
          summary_text: filingForm.summary_text,
          note: filingForm.note,
          created_at: now,
          updated_at: now,
        },
      ]);

      if (error) {
        alert("Create filing failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelFilingForm();
      await loadData();
    } finally {
      setSavingFiling(false);
    }
  };

  const updateFiling = async () => {
    if (!editingFilingId) return;
    if (!validateFiling()) return;

    try {
      setSavingFiling(true);

      const { error } = await supabase
        .from("case_court_filings")
        .update({
          filing_type: filingForm.filing_type,
          party_label: filingForm.party_label,
          party_other:
            filingForm.party_label === "อื่นๆ" ? filingForm.party_other : "",
          filed_date: filingForm.filed_date,
          summary_text: filingForm.summary_text,
          note: filingForm.note,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingFilingId);

      if (error) {
        alert("Update filing failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelFilingForm();
      await loadData();
    } finally {
      setSavingFiling(false);
    }
  };

  const deleteFiling = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบข้อมูลการยื่นนี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("case_court_filings")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Delete filing failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingFilingId === id) cancelFilingForm();

    await loadData();
  };

  return (
    <div id="judgments" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Judgments & Filings</h3>
          <div style={subTitleStyle}>
            คำพิพากษา คำสั่ง อุทธรณ์ คำแก้อุทธรณ์ ฎีกา และคำแก้ฎีกา
          </div>
        </div>
      </div>

      <div style={twoColumnStyle}>
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h4 style={panelTitleStyle}>Judgment Summary</h4>
              <div style={panelSubtitleStyle}>สรุปคำพิพากษา/คำสั่ง</div>
            </div>

            {!showJudgmentForm ? (
              <button
                type="button"
                onClick={startAddJudgment}
                style={primaryButtonStyle}
              >
                + Add Judgment
              </button>
            ) : (
              <button
                type="button"
                onClick={cancelJudgmentForm}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            )}
          </div>

          {showJudgmentForm && (
            <div style={formCardStyle}>
              <h4 style={formTitleStyle}>
                {editingJudgmentId ? "Edit Judgment" : "Add Judgment"}
              </h4>

              <div style={formGridStyle}>
                <Select
                  label="ชั้นศาล"
                  value={judgmentForm.court_level}
                  onChange={(value) =>
                    setJudgmentForm({ ...judgmentForm, court_level: value })
                  }
                  options={courtLevelOptions}
                />

                <Input
                  label="วันที่อ่านคำพิพากษา/คำสั่ง"
                  type="date"
                  value={judgmentForm.judgment_date}
                  onChange={(value) =>
                    setJudgmentForm({
                      ...judgmentForm,
                      judgment_date: value,
                    })
                  }
                />

                <div style={{ gridColumn: "1 / -1" }}>
                  <Textarea
                    label="สรุปคำพิพากษา/คำสั่งโดยย่อ"
                    value={judgmentForm.summary_text}
                    onChange={(value) =>
                      setJudgmentForm({
                        ...judgmentForm,
                        summary_text: value,
                      })
                    }
                    placeholder="เช่น ศาลชั้นต้นพิพากษาให้จำเลยชำระเงิน..."
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Textarea
                    label="หมายเหตุ"
                    value={judgmentForm.note}
                    onChange={(value) =>
                      setJudgmentForm({ ...judgmentForm, note: value })
                    }
                  />
                </div>
              </div>

              <div style={formButtonWrapStyle}>
                <button
                  type="button"
                  onClick={
                    editingJudgmentId ? updateJudgment : createJudgment
                  }
                  disabled={savingJudgment}
                  style={primaryButtonStyle}
                >
                  {savingJudgment ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={cancelJudgmentForm}
                  disabled={savingJudgment}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={emptyStyle}>Loading judgments...</div>
          ) : sortedJudgments.length === 0 ? (
            <div style={emptyStyle}>No judgments added.</div>
          ) : (
            <div style={cardListStyle}>
              {sortedJudgments.map((item) => (
                <JudgmentCard
                  key={item.id}
                  item={item}
                  onEdit={startEditJudgment}
                  onDelete={deleteJudgment}
                />
              ))}
            </div>
          )}
        </div>

        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h4 style={panelTitleStyle}>Appeal / Supreme Filings</h4>
              <div style={panelSubtitleStyle}>
                การยื่นอุทธรณ์ คำแก้อุทธรณ์ ฎีกา คำแก้ฎีกา
              </div>
            </div>

            {!showFilingForm ? (
              <button
                type="button"
                onClick={startAddFiling}
                style={primaryButtonStyle}
              >
                + Add Filing
              </button>
            ) : (
              <button
                type="button"
                onClick={cancelFilingForm}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            )}
          </div>

          {showFilingForm && (
            <div style={formCardStyle}>
              <h4 style={formTitleStyle}>
                {editingFilingId ? "Edit Filing" : "Add Filing"}
              </h4>

              <div style={formGridStyle}>
                <Select
                  label="ประเภทการยื่น"
                  value={filingForm.filing_type}
                  onChange={(value) =>
                    setFilingForm({ ...filingForm, filing_type: value })
                  }
                  options={filingTypeOptions}
                />

                <Select
                  label="ฝ่ายที่ยื่น"
                  value={filingForm.party_label}
                  onChange={(value) =>
                    setFilingForm({
                      ...filingForm,
                      party_label: value,
                      party_other:
                        value === "อื่นๆ" ? filingForm.party_other : "",
                    })
                  }
                  options={partyOptions.map((option) => ({
                    value: option,
                    label: option,
                  }))}
                />

                {filingForm.party_label === "อื่นๆ" && (
                  <Input
                    label="ระบุฝ่ายที่ยื่น"
                    value={filingForm.party_other}
                    onChange={(value) =>
                      setFilingForm({ ...filingForm, party_other: value })
                    }
                  />
                )}

                <Input
                  label="วันที่ยื่น"
                  type="date"
                  value={filingForm.filed_date}
                  onChange={(value) =>
                    setFilingForm({ ...filingForm, filed_date: value })
                  }
                />

                <div style={{ gridColumn: "1 / -1" }}>
                  <Textarea
                    label="ประเด็น / เนื้อหาโดยย่อ"
                    value={filingForm.summary_text}
                    onChange={(value) =>
                      setFilingForm({
                        ...filingForm,
                        summary_text: value,
                      })
                    }
                    placeholder="เช่น อุทธรณ์โต้แย้งประเด็นความรับผิด..."
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Textarea
                    label="หมายเหตุ"
                    value={filingForm.note}
                    onChange={(value) =>
                      setFilingForm({ ...filingForm, note: value })
                    }
                  />
                </div>
              </div>

              <div style={formButtonWrapStyle}>
                <button
                  type="button"
                  onClick={editingFilingId ? updateFiling : createFiling}
                  disabled={savingFiling}
                  style={primaryButtonStyle}
                >
                  {savingFiling ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={cancelFilingForm}
                  disabled={savingFiling}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={emptyStyle}>Loading filings...</div>
          ) : sortedFilings.length === 0 ? (
            <div style={emptyStyle}>No filings added.</div>
          ) : (
            <div style={cardListStyle}>
              {sortedFilings.map((item) => (
                <FilingCard
                  key={item.id}
                  item={item}
                  onEdit={startEditFiling}
                  onDelete={deleteFiling}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function JudgmentCard({
  item,
  onEdit,
  onDelete,
}: {
  item: JudgmentItem;
  onEdit: (item: JudgmentItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={itemCardStyle}>
      <div style={itemHeaderStyle}>
        <div>
          <div style={itemTitleStyle}>{renderCourtLevel(item.court_level)}</div>
          <div style={itemMetaStyle}>
            วันที่อ่าน: {formatDisplayDate(item.judgment_date)}
          </div>
        </div>
      </div>

      <div style={summaryBlockStyle}>{item.summary_text || "-"}</div>

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

function FilingCard({
  item,
  onEdit,
  onDelete,
}: {
  item: CourtFilingItem;
  onEdit: (item: CourtFilingItem) => void;
  onDelete: (id: string) => void;
}) {
  const partyText =
    item.party_label === "อื่นๆ"
      ? item.party_other || "อื่นๆ"
      : item.party_label || "-";

  return (
    <div style={itemCardStyle}>
      <div style={itemHeaderStyle}>
        <div>
          <div style={itemTitleStyle}>{renderFilingType(item.filing_type)}</div>
          <div style={itemMetaStyle}>
            {partyText} • วันที่ยื่น: {formatDisplayDate(item.filed_date)}
          </div>
        </div>
      </div>

      <div style={summaryBlockStyle}>
        {item.summary_text || "ไม่ได้กรอกประเด็นโดยย่อ"}
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

function renderCourtLevel(level?: string | null) {
  if (level === "first_instance") return "ศาลชั้นต้น";
  if (level === "appeal") return "ศาลอุทธรณ์";
  if (level === "supreme") return "ศาลฎีกา";
  return "-";
}

function renderFilingType(type?: string | null) {
  if (type === "appeal") return "ยื่นอุทธรณ์";
  if (type === "appeal_answer") return "ยื่นคำแก้อุทธรณ์";
  if (type === "supreme") return "ยื่นฎีกา";
  if (type === "supreme_answer") return "ยื่นคำแก้ฎีกา";
  return "-";
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

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const panelStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 14,
  background: "#fafafa",
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 12,
  flexWrap: "wrap",
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
};

const panelSubtitleStyle: CSSProperties = {
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
  background: "#ffffff",
  marginBottom: 14,
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
  minHeight: 100,
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

const cardListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};

const itemCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const itemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 10,
};

const itemTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111111",
};

const itemMetaStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
  fontWeight: 600,
};

const summaryBlockStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
  color: "#111111",
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
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
  whiteSpace: "pre-wrap",
};

const noteBlockStyle: CSSProperties = {
  marginTop: 10,
  paddingTop: 8,
  borderTop: "1px solid #eeeeee",
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