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

type CardProps = {
  title: string;
  children: ReactNode;
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

  return (
    <div>
      <div style={headerStyle}>
        <h2>Case Information</h2>

        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} style={btnSecondary}>
            Edit
          </button>
        ) : (
          <div>
            <button onClick={saveCaseInfo} style={btnPrimary} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setIsEditing(false)} style={btnSecondary}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div style={gridStyle}>
        {/* BASIC */}
        <Card title="Basic Info">
          <Input
            label="Title"
            value={form.title}
            disabled={!isEditing}
            onChange={(value) => setForm({ ...form, title: value })}
          />

          <Input
            label="Client"
            value={form.clientName}
            disabled={!isEditing}
            onChange={(value) => setForm({ ...form, clientName: value })}
          />

          <Input
            label="Owner"
            value={form.ownerName}
            disabled={!isEditing}
            onChange={(value) => setForm({ ...form, ownerName: value })}
          />

          <Input
            label="Court"
            value={form.courtName}
            disabled={!isEditing}
            onChange={(value) => setForm({ ...form, courtName: value })}
          />

          <div>
            <div>Black Case Number</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                disabled={!isEditing}
                value={form.caseNumberPart1 || ""}
                onChange={(e) =>
                  setForm({ ...form, caseNumberPart1: e.target.value })
                }
                style={{
                  ...inputStyle,
                  width: "30%",
                  background: !isEditing ? "#f5f5f5" : "#fff",
                }}
                placeholder="อ"
              />
              <input
                disabled={!isEditing}
                value={form.caseNumberPart2 || ""}
                onChange={(e) =>
                  setForm({ ...form, caseNumberPart2: e.target.value })
                }
                style={{
                  ...inputStyle,
                  width: "30%",
                  background: !isEditing ? "#f5f5f5" : "#fff",
                }}
                placeholder="123"
              />
              <span>/</span>
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
        </Card>

        {/* TYPE */}
        <Card title="Classification">
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

          <Textarea
            label="Subtype"
            value={form.caseSubtype}
            disabled={!isEditing}
            onChange={(value) => setForm({ ...form, caseSubtype: value })}
          />
        </Card>

        {/* ISSUE */}
        <Card title="Issue">
          <Textarea
            label="รายละเอียด"
            value={form.issueText}
            disabled={!isEditing}
            onChange={(value) => setForm({ ...form, issueText: value })}
          />
        </Card>

        {/* CLAIM */}
        <Card title="Claim Value / Disputed Amount">
          <div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
              <span>บาท</span>

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
                  width: 80,
                  background: !isEditing ? "#f5f5f5" : "#fff",
                }}
                placeholder="00"
              />
              <span>สตางค์</span>
            </div>

            {!isEditing && (
              <div style={claimPreviewStyle}>
                {buildClaimAmountText(
                  form.claimAmountBaht,
                  form.claimAmountSatang
                ) || "-"}
              </div>
            )}
          </div>
        </Card>

        {/* STORAGE */}
        <Card title="Storage">
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

          <Input
            label="Detail"
            value={form.physicalStorageDetail}
            disabled={!isEditing}
            onChange={(value) =>
              setForm({ ...form, physicalStorageDetail: value })
            }
          />
        </Card>

        {/* STATUS */}
        <Card title="Status">
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
        </Card>
      </div>
    </div>
  );
}

/* COMPONENT */

function Card({ title, children }: CardProps) {
  return (
    <div style={cardStyle}>
      <h4>{title}</h4>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Input({ label, value, onChange, disabled }: InputProps) {
  return (
    <div>
      <div>{label}</div>
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
      <div>{label}</div>
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

function Textarea({ label, value, onChange, disabled }: TextareaProps) {
  return (
    <div>
      <div>{label}</div>
      <textarea
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...textareaStyle, background: disabled ? "#f5f5f5" : "#fff" }}
      />
    </div>
  );
}

/* HELPER */

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

/* STYLE */

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 20,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
};

const cardStyle: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
  boxSizing: "border-box",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 80,
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
  boxSizing: "border-box",
};

const btnPrimary: CSSProperties = {
  background: "black",
  color: "white",
  padding: "8px 12px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
};

const btnSecondary: CSSProperties = {
  marginLeft: 8,
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "white",
  cursor: "pointer",
};

const claimPreviewStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#555",
};