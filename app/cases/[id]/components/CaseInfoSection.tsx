"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { supabase } from "../../../../lib/supabase";

type CaseItem = {
  title?: string;

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
  title?: string | null;

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
};

type Props = {
  caseId: string;
  caseItem: CaseItemFromDb | null;
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

export default function CaseInfoSection({ caseId, caseItem }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CaseItem>({});

  useEffect(() => {
    const parsedCaseNumber = parseBlackCaseNumber(
      caseItem?.case_number || caseItem?.caseNumber || ""
    );

    const parsedClaimAmount = parseClaimAmount(
      caseItem?.claim_amount || caseItem?.claimAmount || ""
    );

    setForm({
      title: caseItem?.title || "",

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

      const payload = {
        title: form.title || "",

        client_name: form.clientName || "",
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

      const { error } = await supabase
        .from("cases")
        .update(payload)
        .eq("id", Number(caseId));

      if (error) {
        alert("Save failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      setIsEditing(false);
    } catch (error: unknown) {
      alert("Save failed:\n" + stringifyError(error));
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

  return (
    <div id="info" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Case Information</h3>
          <div style={subTitleStyle}>
            ข้อมูลหลักของแฟ้มคดี ศาล ประเภทคดี ทุนทรัพย์ และที่เก็บสำนวน
          </div>
        </div>

        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} style={btnSecondary}>
            Edit
          </button>
        ) : (
          <div style={buttonWrapStyle}>
            <button onClick={saveCaseInfo} style={btnPrimary} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setIsEditing(false)} style={btnSecondary}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div style={mainGridStyle}>
        <InfoBlock
          title="Basic Information"
          subtitle="ข้อมูลคู่ความและผู้รับผิดชอบ"
        >
          {isEditing ? (
            <Input
              label="Title"
              value={form.title}
              disabled={!isEditing}
              onChange={(value) => setForm({ ...form, title: value })}
            />
          ) : (
            <ReadOnlyValue label="Title" value={form.title} />
          )}

          {isEditing ? (
            <Input
              label="Client"
              value={form.clientName}
              disabled={!isEditing}
              onChange={(value) => setForm({ ...form, clientName: value })}
            />
          ) : (
            <ReadOnlyValue label="Client" value={form.clientName} />
          )}

          {isEditing ? (
            <Input
              label="Owner"
              value={form.ownerName}
              disabled={!isEditing}
              onChange={(value) => setForm({ ...form, ownerName: value })}
            />
          ) : (
            <ReadOnlyValue label="Owner" value={form.ownerName} />
          )}
        </InfoBlock>

        <InfoBlock title="Court Information" subtitle="ศาลและเลขคดีดำ">
          {isEditing ? (
            <Input
              label="Court"
              value={form.courtName}
              disabled={!isEditing}
              onChange={(value) => setForm({ ...form, courtName: value })}
            />
          ) : (
            <ReadOnlyValue label="Court" value={form.courtName} />
          )}

          {isEditing ? (
            <div>
              <label style={labelStyle}>Black Case Number</label>
              <div style={caseNumberRowStyle}>
                <input
                  disabled={!isEditing}
                  value={form.caseNumberPart1 || ""}
                  onChange={(e) =>
                    setForm({ ...form, caseNumberPart1: e.target.value })
                  }
                  style={{
                    ...inputStyle,
                    width: "28%",
                    background: !isEditing ? "#f5f5f5" : "#fff",
                  }}
                  placeholder="ผบอ"
                />

                <input
                  disabled={!isEditing}
                  value={form.caseNumberPart2 || ""}
                  onChange={(e) =>
                    setForm({ ...form, caseNumberPart2: e.target.value })
                  }
                  style={{
                    ...inputStyle,
                    width: "32%",
                    background: !isEditing ? "#f5f5f5" : "#fff",
                  }}
                  placeholder="56"
                />

                <span style={slashStyle}>/</span>

                <select
                  disabled={!isEditing}
                  value={form.caseYear || ""}
                  onChange={(e) =>
                    setForm({ ...form, caseYear: e.target.value })
                  }
                  style={{
                    ...inputStyle,
                    width: "40%",
                    background: !isEditing ? "#f5f5f5" : "#fff",
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
            <ReadOnlyValue label="Black Case Number" value={blackCaseNumber} />
          )}
        </InfoBlock>

        <InfoBlock title="Classification" subtitle="ประเภทคดีและสถานะ">
          {isEditing ? (
            <Select
              label="Type"
              value={form.caseType}
              disabled={!isEditing}
              onChange={(value) => setForm({ ...form, caseType: value })}
              options={[
                { value: "Civil", label: "Civil (แพ่ง)" },
                { value: "Criminal", label: "Criminal (อาญา)" },
                { value: "Bankruptcy", label: "Bankruptcy (ล้มละลาย)" },
                { value: "Administrative", label: "Administrative (ปกครอง)" },
              ]}
            />
          ) : (
            <ReadOnlyValue label="Type" value={renderCaseType(form.caseType)} />
          )}

          {isEditing ? (
            <Textarea
              label="Subtype"
              value={form.caseSubtype}
              disabled={!isEditing}
              onChange={(value) => setForm({ ...form, caseSubtype: value })}
              minHeight={82}
            />
          ) : (
            <ReadOnlyValue
              label="Subtype"
              value={form.caseSubtype}
              multiline
            />
          )}

          {isEditing ? (
            <Select
              label="Case Status"
              value={form.caseStatus}
              disabled={!isEditing}
              onChange={(value) => setForm({ ...form, caseStatus: value })}
              options={[
                { value: "Active", label: "Active" },
                { value: "Waiting", label: "Waiting" },
                { value: "Done", label: "Done" },
              ]}
            />
          ) : (
            <ReadOnlyValue label="Case Status" value={form.caseStatus} />
          )}
        </InfoBlock>

        <InfoBlock title="Claim & Issue" subtitle="ทุนทรัพย์และประเด็นหลัก">
          {isEditing ? (
            <div>
              <label style={labelStyle}>Claim Value / Disputed Amount</label>
              <div style={claimRowStyle}>
                <input
                  disabled={!isEditing}
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
                    background: !isEditing ? "#f5f5f5" : "#fff",
                  }}
                  placeholder="50,000"
                />
                <span style={unitStyle}>บาท</span>

                <input
                  disabled={!isEditing}
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
                    background: !isEditing ? "#f5f5f5" : "#fff",
                  }}
                  placeholder="00"
                />
                <span style={unitStyle}>สตางค์</span>
              </div>

              <div style={claimPreviewStyle}>{claimPreview}</div>
            </div>
          ) : (
            <ReadOnlyValue
              label="Claim Value / Disputed Amount"
              value={claimPreview}
            />
          )}

          {isEditing ? (
            <Textarea
              label="Issue Detail"
              value={form.issueText}
              disabled={!isEditing}
              onChange={(value) => setForm({ ...form, issueText: value })}
              minHeight={170}
            />
          ) : (
            <ReadOnlyValue
              label="Issue Detail"
              value={form.issueText}
              multiline
            />
          )}
        </InfoBlock>

        <InfoBlock
          title="Storage"
          subtitle="ที่เก็บสำนวนตัวจริงหรือเอกสารหลัก"
        >
          {isEditing ? (
            <Select
              label="Storage Type"
              value={form.physicalStorageType}
              disabled={!isEditing}
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
              label="Storage Type"
              value={form.physicalStorageType}
            />
          )}

          {isEditing ? (
            <Input
              label="Detail"
              value={form.physicalStorageDetail}
              disabled={!isEditing}
              onChange={(value) =>
                setForm({ ...form, physicalStorageDetail: value })
              }
            />
          ) : (
            <ReadOnlyValue label="Detail" value={form.physicalStorageDetail} />
          )}
        </InfoBlock>
      </div>
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
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={multiline ? readOnlyTextAreaStyle : readOnlyValueStyle}>
        {value && value.trim() ? value : "-"}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, disabled }: InputProps) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
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
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, background: disabled ? "#f5f5f5" : "#fff" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
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
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
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

const mainGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
};

const infoBlockStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 14,
  background: "#fafafa",
};

const blockHeaderStyle: CSSProperties = {
  marginBottom: 12,
};

const blockTitleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
  fontSize: 16,
};

const blockSubtitleStyle: CSSProperties = {
  marginTop: 4,
  color: "#666666",
  fontSize: 13,
};

const blockContentStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#666666",
  fontWeight: 700,
  fontSize: 12,
};

const readOnlyValueStyle: CSSProperties = {
  minHeight: 22,
  color: "#111111",
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const readOnlyTextAreaStyle: CSSProperties = {
  minHeight: 44,
  color: "#111111",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.7,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  boxSizing: "border-box",
  color: "#111111",
  colorScheme: "light",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  boxSizing: "border-box",
  color: "#111111",
  resize: "vertical",
  colorScheme: "light",
};

const caseNumberRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
};

const slashStyle: CSSProperties = {
  fontWeight: 800,
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
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const claimPreviewStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#555555",
  fontWeight: 600,
};

const btnPrimary: CSSProperties = {
  background: "black",
  color: "white",
  padding: "9px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
};

const btnSecondary: CSSProperties = {
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "white",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 600,
};

const buttonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};