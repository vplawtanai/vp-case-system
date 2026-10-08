"use client";
import { useCaseDetailText } from "../labels";
import CaseEditModal from "../CaseEditModal";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { supabase } from "../../../../lib/supabase";
import { createAuditLog } from "../../../../lib/auditLog";

type CaseItem = {
  title?: string;

  clientId?: string;
  clientName?: string;
  courtName?: string;
  ownerName?: string;

  caseNumberPart1?: string;
  caseNumberPart2?: string;
  caseYear?: string;

  caseType?: string;
  caseSubtype?: string;
  issueText?: string;

  claimAmountBaht?: string;
  claimAmountSatang?: string;

  physicalStorageType?: string;
  physicalStorageDetail?: string;
  caseStatus?: string;
};

type CaseItemFromDb = {
  id?: number | null;

  title?: string | null;

  client_id?: string | null;
  clientId?: string | null;
  client_name?: string | null;
  clientName?: string | null;

  court_name?: string | null;
  courtName?: string | null;

  owner_name?: string | null;
  ownerName?: string | null;

  case_number?: string | null;
  caseNumber?: string | null;

  case_type?: string | null;
  caseType?: string | null;

  case_subtype?: string | null;
  caseSubtype?: string | null;

  issue_text?: string | null;
  issueText?: string | null;

  claim_amount?: string | null;
  claimAmount?: string | null;

  physical_storage_type?: string | null;
  physicalStorageType?: string | null;

  physical_storage_detail?: string | null;
  physicalStorageDetail?: string | null;

  status?: string | null;
  caseStatus?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type Props = {
  caseId: string;
  caseItem: CaseItemFromDb | null;
  canEdit?: boolean;
};

type InfoBlockProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

type ReadOnlyValueProps = {
  label: string;
  value?: string;
  multiline?: boolean;
};

type InputProps = {
  label: string;
  value?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

type SelectOption = {
  value: string;
  label: string;
};

type ClientOption = {
  id: string;
  name: string;
};

type SelectProps = {
  label: string;
  value?: string;
  disabled?: boolean;
  options: SelectOption[];
  onChange: (value: string) => void;
};

type TextareaProps = {
  label: string;
  value?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export default function CaseInfoSection({
  caseId,
  caseItem,
  canEdit = false,
}: Props) {
  const { tr } = useCaseDetailText();
  const caseIdNumber = Number(caseId);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState<CaseItem>({});
  const savedForm = useRef<CaseItem>({});
  const cancelEdit = () => { setForm(savedForm.current); setIsEditing(false); };

  useEffect(() => {
    const loadClients = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("LOAD CLIENTS ERROR:", error);
        return;
      }

      setClients((data || []) as ClientOption[]);
    };

    loadClients();
  }, []);

  useEffect(() => {
    const parsedCaseNumber = parseBlackCaseNumber(
      caseItem?.case_number || caseItem?.caseNumber || ""
    );

    const parsedClaimAmount = parseClaimAmount(
      caseItem?.claim_amount || caseItem?.claimAmount || ""
    );

    setForm({
      title: caseItem?.title || "",

      clientId: caseItem?.client_id || caseItem?.clientId || "",
      clientName: caseItem?.client_name || caseItem?.clientName || "",
      courtName: caseItem?.court_name || caseItem?.courtName || "",
      ownerName: caseItem?.owner_name || caseItem?.ownerName || "",

      caseNumberPart1: parsedCaseNumber.part1,
      caseNumberPart2: parsedCaseNumber.part2,
      caseYear: parsedCaseNumber.year,

      caseType: caseItem?.case_type || caseItem?.caseType || "Civil",
      caseSubtype: caseItem?.case_subtype || caseItem?.caseSubtype || "",
      issueText: caseItem?.issue_text || caseItem?.issueText || "",

      claimAmountBaht: parsedClaimAmount.baht,
      claimAmountSatang: parsedClaimAmount.satang,

      physicalStorageType:
        caseItem?.physical_storage_type ||
        caseItem?.physicalStorageType ||
        "Cabinet",
      physicalStorageDetail:
        caseItem?.physical_storage_detail ||
        caseItem?.physicalStorageDetail ||
        "",
      caseStatus: caseItem?.status || caseItem?.caseStatus || "Active",
    });
  }, [caseItem]);

  const formatNumber = (val: string) => {
    const num = val.replace(/,/g, "").replace(/[^\d]/g, "");
    if (!num) return "";
    return Number(num).toLocaleString("en-US");
  };

  const saveCaseInfo = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไขข้อมูลหลักของคดี"));
      setIsEditing(false);
      return;
    }

    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert(tr("Missing case id"));
      return;
    }

    try {
      setSaving(true);

      const fullCaseNumber = buildBlackCaseNumber(
        form.caseNumberPart1,
        form.caseNumberPart2,
        form.caseYear
      );

      const claimAmountText = buildClaimAmountText(
        form.claimAmountBaht,
        form.claimAmountSatang
      );
      const selectedClient =
        clients.find((client) => client.id === form.clientId) || null;

      const payload = {
        title: form.title || "",

        client_id: selectedClient?.id || null,
        client_name: selectedClient?.name || form.clientName || "",
        court_name: form.courtName || "",
        owner_name: form.ownerName || "",

        case_number: fullCaseNumber,

        case_type: form.caseType || "Civil",
        case_subtype: form.caseSubtype || "",
        issue_text: form.issueText || "",

        claim_amount: claimAmountText,

        physical_storage_type: form.physicalStorageType || "",
        physical_storage_detail: form.physicalStorageDetail || "",
        status: form.caseStatus || "Active",

        updated_at: new Date().toISOString(),
      };

      const oldData = caseItem || null;

      const { data, error } = await supabase
        .from("cases")
        .update(payload)
        .eq("id", caseIdNumber)
        .select("*")
        .single();

      if (error) {
        alert(tr("Save failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "cases",
        recordId: String(caseIdNumber),
        action: "update",
        oldData,
        newData: data || {
          id: caseIdNumber,
          ...payload,
        },
        note: "Update case information",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      setIsEditing(false);
    } catch (error: unknown) {
      alert(tr("Save failed:\n" + stringifyError(error)));
    } finally {
      setSaving(false);
    }
  };

  const yearOptions = () => {
    const now = new Date().getFullYear() + 543;
    const years: string[] = [];

    for (let i = -5; i <= 20; i++) {
      years.push(String(now + i));
    }

    return years;
  };

  const blackCaseNumber = buildBlackCaseNumber(
    form.caseNumberPart1,
    form.caseNumberPart2,
    form.caseYear
  );

  const claimPreview =
    buildClaimAmountText(form.claimAmountBaht, form.claimAmountSatang) || "-";
  const linkedClientName = form.clientId
    ? clients.find((client) => client.id === form.clientId)?.name
    : "";
  const displayClientName = linkedClientName || form.clientName || "";

  const renderFields = (editing: boolean) => (<div style={mainGridStyle}>
        <InfoBlock
          title={tr("Basic Information")}
          subtitle={tr("ข้อมูลคู่ความและผู้รับผิดชอบ")}
        >
          {editing ? (
            <Input
              label={tr("Title")}
              value={form.title}
              disabled={!editing}
              onChange={(value) => setForm({ ...form, title: value })}
            />
          ) : (
            <ReadOnlyValue label={tr("Title")} value={form.title} />
          )}

          {editing ? (
            <Select
              label={tr("Client")}
              value={form.clientId}
              disabled={!editing}
              onChange={(value) => {
                const selectedClient =
                  clients.find((client) => client.id === value) || null;

                setForm({
                  ...form,
                  clientId: value,
                  clientName: selectedClient?.name || form.clientName || "",
                });
              }}
              options={[
                { value: "", label: form.clientName || "No linked client" },
                ...clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                })),
              ]}
            />
          ) : (
            <ReadOnlyValue label={tr("Client")} value={displayClientName} />
          )}

          {editing && clients.length === 0 && (
            <div style={hintStyle}>{tr("No clients yet. Create Client first.")} </div>
          )}

          {editing ? (
            <Input
              label={tr("Owner")}
              value={form.ownerName}
              disabled={!editing}
              onChange={(value) => setForm({ ...form, ownerName: value })}
            />
          ) : (
            <ReadOnlyValue label={tr("Owner")} value={form.ownerName} />
          )}
        </InfoBlock>

        <InfoBlock title={tr("Court Information")} subtitle={tr("ศาลและเลขคดีดำ")}>
          {editing ? (
            <Input
              label={tr("Court")}
              value={form.courtName}
              disabled={!editing}
              onChange={(value) => setForm({ ...form, courtName: value })}
            />
          ) : (
            <ReadOnlyValue label={tr("Court")} value={form.courtName} />
          )}

          {editing ? (
            <div>
              <label style={labelStyle}>{tr("Black Case Number")} </label>
              <div style={caseNumberRowStyle}>
                <input
                  disabled={!editing}
                  value={form.caseNumberPart1 || ""}
                  onChange={(e) =>
                    setForm({ ...form, caseNumberPart1: e.target.value })
                  }
                  style={{
                    ...inputStyle,
                    width: "28%",
                    background: !editing ? "#f5f5f5" : "#fff",
                  }}
                  placeholder={tr("ผบอ")}
                />

                <input
                  disabled={!editing}
                  value={form.caseNumberPart2 || ""}
                  onChange={(e) =>
                    setForm({ ...form, caseNumberPart2: e.target.value })
                  }
                  style={{
                    ...inputStyle,
                    width: "32%",
                    background: !editing ? "#f5f5f5" : "#fff",
                  }}
                  placeholder="56"
                />

                <span style={slashStyle}>/</span>

                <select
                  disabled={!editing}
                  value={form.caseYear || ""}
                  onChange={(e) =>
                    setForm({ ...form, caseYear: e.target.value })
                  }
                  style={{
                    ...inputStyle,
                    width: "40%",
                    background: !editing ? "#f5f5f5" : "#fff",
                  }}
                >
                  {yearOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <ReadOnlyValue label={tr("Black Case Number")} value={blackCaseNumber} />
          )}
        </InfoBlock>

        <InfoBlock title={tr("Classification")} subtitle={tr("ประเภทคดีและสถานะ")}>
          {editing ? (
            <Select
              label={tr("Type")}
              value={form.caseType}
              disabled={!editing}
              onChange={(value) => setForm({ ...form, caseType: value })}
              options={[
                { value: "Civil", label: "Civil (แพ่ง)" },
                { value: "Criminal", label: "Criminal (อาญา)" },
                { value: "Bankruptcy", label: "Bankruptcy (ล้มละลาย)" },
                { value: "Administrative", label: "Administrative (ปกครอง)" },
              ]}
            />
          ) : (
            <ReadOnlyValue label={tr("Type")} value={tr(renderCaseType(form.caseType))} />
          )}

          {editing ? (
            <Textarea
              label={tr("Subtype")}
              value={form.caseSubtype}
              disabled={!editing}
              onChange={(value) => setForm({ ...form, caseSubtype: value })}
              minHeight={64}
            />
          ) : (
            <ReadOnlyValue
              label={tr("Subtype")}
              value={form.caseSubtype}
              multiline
            />
          )}

          {editing ? (
            <Select
              label={tr("Case Status")}
              value={form.caseStatus}
              disabled={!editing}
              onChange={(value) => setForm({ ...form, caseStatus: value })}
              options={[
                { value: "Active", label: "Active" },
                { value: "Waiting", label: "Waiting" },
                { value: "Done", label: "Done" },
              ]}
            />
          ) : (
            <ReadOnlyValue label={tr("Case Status")} value={tr(form.caseStatus)} />
          )}
        </InfoBlock>

        <InfoBlock title={tr("Claim & Issue")} subtitle={tr("ทุนทรัพย์และประเด็นหลัก")}>
          {editing ? (
            <div>
              <label style={labelStyle}>{tr("Claim Value / Disputed Amount")} </label>
              <div style={claimRowStyle}>
                <input
                  disabled={!editing}
                  value={form.claimAmountBaht || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      claimAmountBaht: formatNumber(e.target.value),
                    })
                  }
                  style={{
                    ...inputStyle,
                    flex: 1,
                    background: !editing ? "#f5f5f5" : "#fff",
                  }}
                  placeholder="50,000"
                />
                <span style={unitStyle}>{tr("บาท")} </span>

                <input
                  disabled={!editing}
                  value={form.claimAmountSatang || ""}
                  maxLength={2}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val === "" || Number(val) <= 99) {
                      setForm({ ...form, claimAmountSatang: val });
                    }
                  }}
                  onBlur={() => {
                    const satang = form.claimAmountSatang || "00";
                    setForm({
                      ...form,
                      claimAmountSatang: satang.padStart(2, "0"),
                    });
                  }}
                  style={{
                    ...inputStyle,
                    width: 82,
                    background: !editing ? "#f5f5f5" : "#fff",
                  }}
                  placeholder="00"
                />
                <span style={unitStyle}>{tr("สตางค์")} </span>
              </div>

              <div style={claimPreviewStyle}>{tr(claimPreview)}</div>
            </div>
          ) : (
            <ReadOnlyValue
              label={tr("Claim Value / Disputed Amount")}
              value={tr(claimPreview)}
            />
          )}

          {editing ? (
            <Textarea
              label={tr("Issue Detail")}
              value={form.issueText}
              disabled={!editing}
              onChange={(value) => setForm({ ...form, issueText: value })}
              minHeight={110}
            />
          ) : (
            <ReadOnlyValue
              label={tr("Issue Detail")}
              value={form.issueText}
              multiline
            />
          )}
        </InfoBlock>

        <InfoBlock
          title={tr("Storage")}
          subtitle={tr("ที่เก็บสำนวนตัวจริงหรือเอกสารหลัก")}
        >
          {editing ? (
            <Select
              label={tr("Storage Type")}
              value={form.physicalStorageType}
              disabled={!editing}
              onChange={(value) =>
                setForm({ ...form, physicalStorageType: value })
              }
              options={[
                { value: "Cabinet", label: "Cabinet" },
                { value: "Box", label: "Box" },
                { value: "Digital", label: "Digital" },
                { value: "With Client", label: "With Client" },
              ]}
            />
          ) : (
            <ReadOnlyValue
              label={tr("Storage Type")}
              value={tr(form.physicalStorageType)}
            />
          )}

          {editing ? (
            <Input
              label={tr("Detail")}
              value={form.physicalStorageDetail}
              disabled={!editing}
              onChange={(value) =>
                setForm({ ...form, physicalStorageDetail: value })
              }
            />
          ) : (
            <ReadOnlyValue label={tr("Detail")} value={form.physicalStorageDetail} />
          )}
        </InfoBlock>
      </div>);

  return (
    <div id="info" style={sectionStyle}>
      <div style={headerStyle}><div><h3 style={titleStyle}>{tr("Case Information")} </h3><div style={subTitleStyle}>{tr("ข้อมูลหลักของแฟ้มคดี ศาล ประเภทคดี ทุนทรัพย์ และที่เก็บสำนวน")} </div></div>{canEdit && <button onClick={() => { savedForm.current = form; setIsEditing(true); }} style={btnSecondary}>{tr("Edit")} </button>}</div>

      {renderFields(false)}
      {isEditing && <CaseEditModal title={tr("Edit Case Information")} busy={saving} onClose={cancelEdit}>{renderFields(true)}<div style={buttonWrapStyle}><button onClick={saveCaseInfo} disabled={saving} style={btnPrimary}>{saving ? tr("Saving...") : tr("Save")}</button><button onClick={cancelEdit} disabled={saving} style={btnSecondary}>{tr("Cancel")} </button></div></CaseEditModal>}
    </div>
  );
}

/* COMPONENTS */

function InfoBlock({ title, subtitle, children }: InfoBlockProps) {
  return (
    <section style={infoBlockStyle}>
      <div style={blockHeaderStyle}>
        <h4 style={blockTitleStyle}>{title}</h4>
        {subtitle && <div style={blockSubtitleStyle}>{subtitle}</div>}
      </div>

      <div style={blockContentStyle}>{children}</div>
    </section>
  );
}

function ReadOnlyValue({ label, value, multiline = false }: ReadOnlyValueProps) {
  const { tr } = useCaseDetailText();
  return (
    <div style={readOnlyRowStyle}>
      <div style={labelStyle}>{tr(label)}</div>
      <div style={multiline ? readOnlyTextAreaStyle : readOnlyValueStyle}>
        {value && value.trim() ? value : "-"}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, disabled }: InputProps) {
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <input aria-label={tr(label)}
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, background: disabled ? "#f5f5f5" : "#fff" }}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: SelectProps) {
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <select aria-label={tr(label)}
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, background: disabled ? "#f5f5f5" : "#fff" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {tr(o.label)}
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
  disabled,
  minHeight = 100,
}: TextareaProps & { minHeight?: number }) {
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <textarea aria-label={tr(label)}
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...textareaStyle,
          minHeight,
          background: disabled ? "#f5f5f5" : "#fff",
        }}
      />
    </div>
  );
}

/* HELPERS */

function renderCaseType(value?: string) {
  if (!value) return "-";
  if (value === "Civil") return "Civil (แพ่ง)";
  if (value === "Criminal") return "Criminal (อาญา)";
  if (value === "Bankruptcy") return "Bankruptcy (ล้มละลาย)";
  if (value === "Administrative") return "Administrative (ปกครอง)";
  return value;
}

function parseBlackCaseNumber(value: string) {
  const currentThaiYear = String(new Date().getFullYear() + 543);

  if (!value || !value.trim()) {
    return {
      part1: "",
      part2: "",
      year: currentThaiYear,
    };
  }

  const cleaned = value.trim();

  if (!cleaned.includes("/")) {
    return {
      part1: "",
      part2: cleaned,
      year: currentThaiYear,
    };
  }

  const [leftRaw, yearRaw] = cleaned.split("/");
  const leftParts = leftRaw.trim().split(/\s+/);

  return {
    part1: leftParts[0] || "",
    part2: leftParts.slice(1).join(" ") || "",
    year: yearRaw?.trim() || currentThaiYear,
  };
}

function buildBlackCaseNumber(part1?: string, part2?: string, year?: string) {
  const p1 = (part1 || "").trim();
  const p2 = (part2 || "").trim();
  const y = (year || "").trim();

  if (!p1 && !p2 && !y) return "";

  const left = [p1, p2].filter(Boolean).join(" ");

  if (!left && y) return "";
  if (left && y) return `${left}/${y}`;

  return left;
}

function parseClaimAmount(value: string) {
  const raw = (value || "").trim();

  if (!raw) {
    return {
      baht: "",
      satang: "00",
    };
  }

  if (raw.includes("บาท")) {
    const bahtMatch = raw.match(/([\d,]+)\s*บาท/);
    const satangMatch = raw.match(/(\d{1,2})\s*สตางค์/);

    return {
      baht: bahtMatch?.[1] || "",
      satang: satangMatch?.[1]?.padStart(2, "0") || "00",
    };
  }

  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");

  if (!cleaned) {
    return {
      baht: "",
      satang: "00",
    };
  }

  const [bahtRaw, satangRaw] = cleaned.split(".");

  return {
    baht: bahtRaw ? Number(bahtRaw).toLocaleString("en-US") : "",
    satang: satangRaw ? satangRaw.slice(0, 2).padEnd(2, "0") : "00",
  };
}

function buildClaimAmountText(baht?: string, satang?: string) {
  const cleanBaht = (baht || "").trim();
  const cleanSatang = (satang || "00").trim().padStart(2, "0");

  if (!cleanBaht) return "";

  return `${cleanBaht} บาท ${cleanSatang} สตางค์`;
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

/* STYLES */

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

const mainGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
};

const infoBlockStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 12,
  background: "#f7f9fc",
};

const blockHeaderStyle: CSSProperties = {
  marginBottom: 9,
};

const blockTitleStyle: CSSProperties = {
  margin: 0,
  color: "#183854",
  fontSize: 14,
  fontWeight: 700,
};

const blockSubtitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#777777",
  fontSize: 12,
  lineHeight: 1.35,
};

const blockContentStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const readOnlyRowStyle: CSSProperties = {
  padding: "7px 8px",
  border: "1px solid #eeeeee",
  borderRadius: 10,
  background: "#ffffff",
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

const readOnlyValueStyle: CSSProperties = {
  minHeight: 18,
  color: "#183854",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const readOnlyTextAreaStyle: CSSProperties = {
  minHeight: 28,
  color: "#183854",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  boxSizing: "border-box",
  color: "#183854",
  colorScheme: "light",
  fontSize: 13,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  boxSizing: "border-box",
  color: "#183854",
  resize: "vertical",
  colorScheme: "light",
  fontSize: 13,
  lineHeight: 1.5,
};

const caseNumberRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
};

const slashStyle: CSSProperties = {
  fontWeight: 700,
  color: "#333333",
};

const claimRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  flexWrap: "wrap",
};

const unitStyle: CSSProperties = {
  color: "#333333",
  fontWeight: 700,
  whiteSpace: "nowrap",
  fontSize: 13,
};

const claimPreviewStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "#555555",
  fontWeight: 700,
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: "#9a3412",
  fontWeight: 700,
};

const btnPrimary: CSSProperties = {
  background: "black",
  color: "white",
  padding: "8px 13px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const btnSecondary: CSSProperties = {
  padding: "8px 13px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "white",
  color: "#183854",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const buttonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};
