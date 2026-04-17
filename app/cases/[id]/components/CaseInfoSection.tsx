"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

type CaseItem = {
  clientName?: string;
  courtName?: string;
  caseNumber?: string;
  phase?: string;
  caseStatus?: string;
  ownerName?: string;
  caseType?: string;
  caseSubtype?: string;
  issueText?: string;
  claimAmount?: string;
  physicalStorageType?: string;
  physicalStorageDetail?: string;

  judgmentFirstInstance?: string;
  judgmentAppeal?: string;
  judgmentSupreme?: string;

  enforcementPeriodDays?: string;
  enforcementNoticeResult?: string;
  enforcementNoticeMethod?: string;
  enforcementNoticeDate?: string;
  enforcementDueDate?: string;
  enforcementReady?: boolean;
  enforcementReadyText?: string;
  enforcementIssued?: boolean;
  enforcementIssuedDate?: string;
};

type Props = {
  caseId: string;
  caseItem: CaseItem | null;
};

export default function CaseInfoSection({ caseId, caseItem }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentCase, setCurrentCase] = useState<CaseItem | null>(caseItem);

  const [form, setForm] = useState<any>({});

  useEffect(() => {
    setCurrentCase(caseItem);
    setForm({
      ...caseItem,
      phase: caseItem?.phase || "litigation",
      caseStatus: caseItem?.caseStatus || "Active",
      clientName: caseItem?.clientName || "",
      courtName: caseItem?.courtName || "",
      caseNumber: caseItem?.caseNumber || "",
      ownerName: caseItem?.ownerName || "",
      caseType: caseItem?.caseType || "",
      caseSubtype: caseItem?.caseSubtype || "",
      issueText: caseItem?.issueText || "",
      claimAmount: caseItem?.claimAmount || "",
      physicalStorageType: caseItem?.physicalStorageType || "",
      physicalStorageDetail: caseItem?.physicalStorageDetail || "",
      judgmentFirstInstance: caseItem?.judgmentFirstInstance || "",
      judgmentAppeal: caseItem?.judgmentAppeal || "",
      judgmentSupreme: caseItem?.judgmentSupreme || "",
      enforcementPeriodDays: caseItem?.enforcementPeriodDays || "",
      enforcementNoticeResult: caseItem?.enforcementNoticeResult || "",
      enforcementNoticeMethod: caseItem?.enforcementNoticeMethod || "",
      enforcementNoticeDate: caseItem?.enforcementNoticeDate || "",
      enforcementDueDate: caseItem?.enforcementDueDate || "",
      enforcementReadyText: caseItem?.enforcementReadyText || "",
      enforcementIssuedDate: caseItem?.enforcementIssuedDate || "",
    });
  }, [caseItem]);

  const saveCaseInfo = async () => {
    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", caseId), {
        ...form,
        updatedAt: serverTimestamp(),
      });

      setCurrentCase(form);
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      alert("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setForm({
      ...currentCase,
      phase: currentCase?.phase || "litigation",
      caseStatus: currentCase?.caseStatus || "Active",
    });
    setIsEditing(false);
  };

  return (
    <div id="case-info" style={cardStyle}>
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>Case Information</h3>

        {!isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            style={buttonSecondary}
          >
            Edit
          </button>
        ) : (
          <div style={headerButtonWrap}>
            <button
              type="button"
              onClick={saveCaseInfo}
              disabled={saving}
              style={buttonPrimary}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              style={buttonSecondary}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {!isEditing ? (
        <>
          <div style={summaryGridStyle}>
            <ViewCard label="Client" value={currentCase?.clientName} />
            <ViewCard label="Court" value={currentCase?.courtName} />
            <ViewCard label="Case No." value={currentCase?.caseNumber} />
            <ViewCard label="Owner" value={currentCase?.ownerName} />
            <ViewCard label="Phase" value={currentCase?.phase} />
            <ViewCard label="Status" value={currentCase?.caseStatus} />
            <ViewCard label="Type" value={currentCase?.caseType} />
            <ViewCard label="Subtype" value={currentCase?.caseSubtype} />
          </div>

          <SectionBlock title="Issue">
            <div style={paragraphStyle}>{currentCase?.issueText || "-"}</div>
          </SectionBlock>

          <SectionBlock title="Claim Amount">
            <div style={paragraphStyle}>{currentCase?.claimAmount || "-"}</div>
          </SectionBlock>

          <SectionBlock title="Physical File">
            <div style={paragraphStyle}>
              {currentCase?.physicalStorageType || "-"}
              {currentCase?.physicalStorageDetail
                ? ` • ${currentCase.physicalStorageDetail}`
                : ""}
            </div>
          </SectionBlock>

          <SectionBlock title="Judgment">
            <div style={detailGridStyle}>
              <ViewCard
                label="First Instance"
                value={currentCase?.judgmentFirstInstance}
              />
              <ViewCard
                label="Appeal"
                value={currentCase?.judgmentAppeal}
              />
              <ViewCard
                label="Supreme"
                value={currentCase?.judgmentSupreme}
              />
            </div>
          </SectionBlock>

          <SectionBlock title="Enforcement">
            <div style={detailGridStyle}>
              <ViewCard
                label="Days"
                value={currentCase?.enforcementPeriodDays}
              />
              <ViewCard
                label="Result"
                value={currentCase?.enforcementNoticeResult}
              />
              <ViewCard
                label="Method"
                value={currentCase?.enforcementNoticeMethod}
              />
              <ViewCard
                label="Notice Date"
                value={currentCase?.enforcementNoticeDate}
              />
              <ViewCard
                label="Due Date"
                value={currentCase?.enforcementDueDate}
              />
              <ViewCard
                label="Status"
                value={currentCase?.enforcementReadyText}
              />
              <ViewCard
                label="Issued Date"
                value={currentCase?.enforcementIssuedDate}
              />
            </div>
          </SectionBlock>
        </>
      ) : (
        <>
          <div style={formSectionTitleStyle}>Main Information</div>
          <div style={gridForm}>
            <Input
              label="Client"
              value={form.clientName}
              onChange={(v: string) => setForm({ ...form, clientName: v })}
            />
            <Input
              label="Court"
              value={form.courtName}
              onChange={(v: string) => setForm({ ...form, courtName: v })}
            />
            <Input
              label="Case Number"
              value={form.caseNumber}
              onChange={(v: string) => setForm({ ...form, caseNumber: v })}
            />
            <Input
              label="Owner"
              value={form.ownerName}
              onChange={(v: string) => setForm({ ...form, ownerName: v })}
            />

            <Select
              label="Phase"
              value={form.phase}
              onChange={(v: string) => setForm({ ...form, phase: v })}
              options={[
                { value: "litigation", label: "Litigation" },
                { value: "judgment", label: "Judgment" },
                { value: "enforcement", label: "Enforcement" },
                { value: "closed", label: "Closed" },
              ]}
            />

            <Select
              label="Status"
              value={form.caseStatus}
              onChange={(v: string) => setForm({ ...form, caseStatus: v })}
              options={[
                { value: "Active", label: "Active" },
                { value: "Waiting", label: "Waiting" },
                { value: "Done", label: "Done" },
              ]}
            />

            <Input
              label="Type"
              value={form.caseType}
              onChange={(v: string) => setForm({ ...form, caseType: v })}
            />
            <Input
              label="Subtype"
              value={form.caseSubtype}
              onChange={(v: string) => setForm({ ...form, caseSubtype: v })}
            />

            <Input
              label="Physical Storage Type"
              value={form.physicalStorageType}
              onChange={(v: string) =>
                setForm({ ...form, physicalStorageType: v })
              }
            />
            <Input
              label="Physical Storage Detail"
              value={form.physicalStorageDetail}
              onChange={(v: string) =>
                setForm({ ...form, physicalStorageDetail: v })
              }
            />
          </div>

          <Textarea
            label="Issue"
            value={form.issueText}
            onChange={(v: string) => setForm({ ...form, issueText: v })}
          />

          <Textarea
            label="Claim Amount"
            value={form.claimAmount}
            onChange={(v: string) => setForm({ ...form, claimAmount: v })}
          />

          <div style={formSectionTitleStyle}>Judgment</div>
          <div style={gridForm}>
            <Textarea
              label="First Instance"
              value={form.judgmentFirstInstance}
              onChange={(v: string) =>
                setForm({ ...form, judgmentFirstInstance: v })
              }
            />
            <Textarea
              label="Appeal"
              value={form.judgmentAppeal}
              onChange={(v: string) =>
                setForm({ ...form, judgmentAppeal: v })
              }
            />
            <Textarea
              label="Supreme"
              value={form.judgmentSupreme}
              onChange={(v: string) =>
                setForm({ ...form, judgmentSupreme: v })
              }
            />
          </div>

          <div style={formSectionTitleStyle}>Enforcement</div>
          <div style={gridForm}>
            <Input
              label="Days"
              value={form.enforcementPeriodDays}
              onChange={(v: string) =>
                setForm({ ...form, enforcementPeriodDays: v })
              }
            />
            <Input
              label="Result"
              value={form.enforcementNoticeResult}
              onChange={(v: string) =>
                setForm({ ...form, enforcementNoticeResult: v })
              }
            />
            <Input
              label="Method"
              value={form.enforcementNoticeMethod}
              onChange={(v: string) =>
                setForm({ ...form, enforcementNoticeMethod: v })
              }
            />
            <Input
              label="Notice Date"
              value={form.enforcementNoticeDate}
              onChange={(v: string) =>
                setForm({ ...form, enforcementNoticeDate: v })
              }
            />
            <Input
              label="Due Date"
              value={form.enforcementDueDate}
              onChange={(v: string) =>
                setForm({ ...form, enforcementDueDate: v })
              }
            />
            <Input
              label="Status Text"
              value={form.enforcementReadyText}
              onChange={(v: string) =>
                setForm({ ...form, enforcementReadyText: v })
              }
            />
            <Input
              label="Issued Date"
              value={form.enforcementIssuedDate}
              onChange={(v: string) =>
                setForm({ ...form, enforcementIssuedDate: v })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function ViewCard({ label, value }: { label: string; value?: string }) {
  return (
    <div style={viewCardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value || "-"}</div>
    </div>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={sectionBlockStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
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
  value?: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <select
        value={value || ""}
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
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={labelStyle}>{label}</div>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={textareaStyle}
      />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 12,
  alignItems: "center",
};

const headerButtonWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const detailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const gridForm: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const sectionBlockStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 12,
  borderTop: "1px solid #eee",
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 8,
  fontSize: 15,
};

const formSectionTitleStyle: React.CSSProperties = {
  marginTop: 18,
  marginBottom: 10,
  fontWeight: 700,
  fontSize: 15,
};

const viewCardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 12,
  background: "#fff",
  minHeight: 68,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const paragraphStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  lineHeight: 1.6,
  wordBreak: "break-word",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 90,
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
  resize: "vertical",
};

const buttonPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "black",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const buttonSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "white",
  border: "1px solid #ccc",
  cursor: "pointer",
};