"use client";

import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AuthorizedSigner } from "../../../lib/companyProfile";
import {
  type FeeAgreementPartyType,
  type FeeAgreementSignatory,
  resequenceFeeAgreementSignatories,
} from "./signatories";

type Json = Record<string, unknown>;

export type FeeAgreementClientContext = {
  id: string;
  name: string;
  clientType: string;
  contactName: string;
};

export function buildInitialFeeAgreementSignatories(
  client: FeeAgreementClientContext,
  authorizedSigners: AuthorizedSigner[],
) {
  const rows: FeeAgreementSignatory[] = [];
  if (isIndividual(client.clientType)) {
    rows.push({
      name: client.name,
      capacity: "",
      party_type: "client",
      sort_order: 1,
      signing_mode: "self",
      contractual_party_name: client.name,
    });
  } else {
    rows.push({
      name: "",
      capacity: "",
      party_type: "client",
      sort_order: 1,
      signing_mode: "authorized_representative",
      contractual_party_name: client.name,
    });
  }
  const defaultSigner = authorizedSigners.find((signer) => signer.isDefault || signer.default);
  if (defaultSigner) rows.push(officeSignatory(defaultSigner, 2));
  return resequenceFeeAgreementSignatories(rows);
}

export function FeeAgreementSignatoryEditor({
  value,
  client,
  authorizedSigners,
  signatureRequirements,
  disabled,
  onChange,
}: {
  value: FeeAgreementSignatory[];
  client: FeeAgreementClientContext;
  authorizedSigners: AuthorizedSigner[];
  signatureRequirements: Json;
  disabled: boolean;
  onChange: (next: FeeAgreementSignatory[]) => void;
}) {
  const groupRefs = useRef<Partial<Record<FeeAgreementPartyType | "unclassified", HTMLDivElement | null>>>({});
  const ordered = [...value].sort(compareSignatories);
  const clientRows = ordered.filter((row) => row.party_type === "client");
  const firmRows = ordered.filter((row) => row.party_type === "firm");
  const witnessRows = ordered.filter((row) => row.party_type === "witness");
  const unclassifiedRows = ordered.filter((row) => !row.party_type);
  const selectedOfficeKeys = new Set(firmRows.map((row) => text(row.authorized_signer_key)).filter(Boolean));
  const availableOfficeSigners = authorizedSigners.filter((signer) => !selectedOfficeKeys.has(signer.key));
  const minimumClient = number(signatureRequirements.minimum_client_signers);
  const minimumFirm = number(signatureRequirements.minimum_firm_signers);
  const minimumWitness = Math.max(
    signatureRequirements.witness_required === true ? 1 : 0,
    number(signatureRequirements.minimum_witnesses),
  );
  const configuredPartyTypes = Array.isArray(signatureRequirements.allowed_party_types)
    ? signatureRequirements.allowed_party_types.filter((entry): entry is string => typeof entry === "string")
    : [];
  const partyIsAllowed = (party: FeeAgreementPartyType) => !configuredPartyTypes.length || configuredPartyTypes.includes(party);
  const scrollToGroup = (party: FeeAgreementPartyType | "unclassified") => {
    window.requestAnimationFrame(() => groupRefs.current[party]?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const updateRow = (target: FeeAgreementSignatory, next: FeeAgreementSignatory) => {
    onChange(resequenceFeeAgreementSignatories(value.map((row) => row === target ? next : row)));
  };
  const removeRow = (target: FeeAgreementSignatory) => {
    onChange(resequenceFeeAgreementSignatories(value.filter((row) => row !== target)));
  };
  const moveRow = (party: FeeAgreementPartyType, index: number, direction: -1 | 1) => {
    const group = ordered.filter((row) => row.party_type === party);
    const destination = index + direction;
    if (destination < 0 || destination >= group.length) return;
    [group[index], group[destination]] = [group[destination], group[index]];
    const next = (["client", "firm", "witness"] as FeeAgreementPartyType[])
      .flatMap((partyType) => partyType === party ? group : ordered.filter((row) => row.party_type === partyType));
    onChange(resequenceFeeAgreementSignatories([...next, ...unclassifiedRows]));
  };
  const addClient = () => {
    onChange(resequenceFeeAgreementSignatories([
      ...value,
      {
        name: "",
        capacity: "",
        party_type: "client",
        sort_order: value.length + 1,
        signing_mode: isIndividual(client.clientType) ? "attorney_in_fact" : "authorized_representative",
        contractual_party_name: client.name,
      },
    ]));
    scrollToGroup("client");
  };
  const addOffice = () => {
    const signer = availableOfficeSigners[0];
    if (!signer) return;
    onChange(resequenceFeeAgreementSignatories([...value, officeSignatory(signer, value.length + 1)]));
    scrollToGroup("firm");
  };
  const addWitness = () => {
    onChange(resequenceFeeAgreementSignatories([
      ...value,
      { name: "", capacity: "", party_type: "witness", sort_order: value.length + 1, signing_mode: "witness" },
    ]));
    scrollToGroup("witness");
  };

  return <div style={editor}>
    <RequirementSummary
      minimumClient={minimumClient}
      minimumFirm={minimumFirm}
      minimumWitness={minimumWitness}
      clientCount={clientRows.filter(hasName).length}
      firmCount={firmRows.filter(hasName).length}
      witnessCount={witnessRows.filter(hasName).length}
    />

    <div ref={(node) => { groupRefs.current.client = node; }} style={scrollTarget}>
      <SignerGroup title="ฝ่ายลูกค้า" description={`คู่สัญญา: ${client.name || "-"}`}>
        {clientRows.map((row, index) => <ClientSignerRow
          key={`client-${index}-${row.sort_order}`}
          row={row}
          client={client}
          disabled={disabled}
          canRemove={clientRows.length > Math.max(minimumClient, 1)}
          canMoveUp={index > 0}
          canMoveDown={index < clientRows.length - 1}
          onChange={(next) => updateRow(row, next)}
          onRemove={() => removeRow(row)}
          onMove={(direction) => moveRow("client", index, direction)}
        />)}
        {!clientRows.length ? <p style={missing}>ยังไม่มีผู้ลงนามฝ่ายลูกค้า</p> : null}
        <button type="button" style={secondaryButton} disabled={disabled || !partyIsAllowed("client")} onClick={addClient}>+ เพิ่มผู้ลงนามฝ่ายลูกค้า</button>
      </SignerGroup>
    </div>

    <div ref={(node) => { groupRefs.current.firm = node; }} style={scrollTarget}>
      <SignerGroup title="ฝ่ายสำนักงาน" description="เลือกจากผู้ลงนามที่เปิดใช้งานใน Settings → ตั้งค่าเอกสาร">
        {firmRows.map((row, index) => <OfficeSignerRow
          key={`firm-${index}-${row.sort_order}`}
          row={row}
          authorizedSigners={authorizedSigners}
          disabled={disabled}
          canRemove={firmRows.length > Math.max(minimumFirm, 1)}
          canMoveUp={index > 0}
          canMoveDown={index < firmRows.length - 1}
          onChange={(next) => updateRow(row, next)}
          onRemove={() => removeRow(row)}
          onMove={(direction) => moveRow("firm", index, direction)}
        />)}
        {!firmRows.length ? <p style={missing}>ยังไม่มีผู้ลงนามฝ่ายสำนักงาน</p> : null}
        <button type="button" style={secondaryButton} disabled={disabled || !partyIsAllowed("firm") || !availableOfficeSigners.length} onClick={addOffice}>+ เพิ่มผู้ลงนามฝ่ายสำนักงาน</button>
      </SignerGroup>
    </div>

    <div ref={(node) => { groupRefs.current.witness = node; }} style={scrollTarget}>
      <SignerGroup title="พยาน" description={minimumWitness ? `แม่แบบกำหนดให้มีพยานอย่างน้อย ${minimumWitness} คน` : "ไม่บังคับ เว้นแต่แม่แบบที่เลือกกำหนดไว้"}>
        {witnessRows.map((row, index) => <SimpleSignerRow
          key={`witness-${index}-${row.sort_order}`}
          row={row}
          disabled={disabled}
          canMoveUp={index > 0}
          canMoveDown={index < witnessRows.length - 1}
          onChange={(next) => updateRow(row, next)}
          onRemove={() => removeRow(row)}
          onMove={(direction) => moveRow("witness", index, direction)}
        />)}
        <button type="button" style={secondaryButton} disabled={disabled || !partyIsAllowed("witness")} onClick={addWitness}>+ เพิ่มพยาน</button>
      </SignerGroup>
    </div>

    {unclassifiedRows.length ? <div ref={(node) => { groupRefs.current.unclassified = node; }} style={scrollTarget}>
      <SignerGroup title="ข้อมูลผู้ลงนามเดิมที่ต้องตรวจสอบ" description="เลือกฝ่ายให้ข้อมูลเดิมก่อนบันทึก โดยระบบจะไม่เปลี่ยนข้อมูลนี้ให้อัตโนมัติ">
        {unclassifiedRows.map((row, index) => <UnclassifiedSignerRow
          key={`unclassified-${index}-${row.sort_order}`}
          row={row}
          disabled={disabled}
          onChange={(next) => updateRow(row, next)}
          onRemove={() => removeRow(row)}
        />)}
      </SignerGroup>
    </div> : null}
  </div>;
}

function ClientSignerRow({ row, client, disabled, canRemove, canMoveUp, canMoveDown, onChange, onRemove, onMove }: {
  row: FeeAgreementSignatory;
  client: FeeAgreementClientContext;
  disabled: boolean;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (next: FeeAgreementSignatory) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const individual = isIndividual(client.clientType);
  const mode = effectiveClientSigningMode(row, client);
  const delegated = mode === "attorney_in_fact";
  const updateMode = (nextMode: "self" | "attorney_in_fact" | "authorized_representative") => {
    if (nextMode === "self") {
      onChange({
        ...row,
        name: client.name,
        capacity: "",
        signing_mode: "self",
        contractual_party_name: client.name,
        authority_reference: "",
        power_of_attorney_no: "",
        power_of_attorney_date: "",
        authority_note: "",
      });
      return;
    }
    onChange({
      ...row,
      name: row.name === client.name ? "" : row.name,
      signing_mode: nextMode,
      contractual_party_name: client.name,
    });
  };
  return <div style={signerCard}>
    <div style={cardHeader}><strong>{individual ? "ผู้ลงนามฝ่ายลูกค้า" : "ผู้แทนผู้ลงนามของลูกค้า"}</strong><OrderActions disabled={disabled} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMove={onMove} /></div>
    <div style={compactGrid}>
      <label style={labelStyle}>รูปแบบการลงนาม<select style={input} value={mode} disabled={disabled} onChange={(event) => updateMode(event.target.value as "self" | "attorney_in_fact" | "authorized_representative")}>
        {individual ? <><option value="self">ลงนามด้วยตนเอง</option><option value="attorney_in_fact">ลงนามโดยผู้รับมอบอำนาจ</option></> : <><option value="authorized_representative">ผู้แทนผู้มีอำนาจของนิติบุคคล</option><option value="attorney_in_fact">ผู้รับมอบอำนาจ</option></>}
      </select></label>
      <ReadOnlyField label="คู่สัญญา" value={client.name} />
    </div>
    {mode === "self" ? <div style={identityLine}><strong>{client.name || "-"}</strong><span>ลงนามด้วยตนเอง</span></div> : <>
      <div style={compactGrid}>
        <Input label={delegated ? "ชื่อผู้รับมอบอำนาจ" : "ชื่อผู้ลงนาม"} value={row.name} disabled={disabled} onChange={(name) => onChange({ ...row, name, contractual_party_name: client.name, signing_mode: mode })} />
        <Input label="ตำแหน่ง/ฐานะ" value={row.capacity} disabled={disabled} onChange={(capacity) => onChange({ ...row, capacity })} />
        {delegated ? <><Input label="หนังสือมอบอำนาจเลขที่" value={text(row.power_of_attorney_no)} disabled={disabled} onChange={(power_of_attorney_no) => onChange({ ...row, power_of_attorney_no })} /><Input label="วันที่หนังสือมอบอำนาจ" type="date" value={text(row.power_of_attorney_date)} disabled={disabled} onChange={(power_of_attorney_date) => onChange({ ...row, power_of_attorney_date })} /></> : null}
      </div>
      <Input label="หมายเหตุอ้างอิงอำนาจ" value={text(row.authority_reference, text(row.authority_note))} disabled={disabled} onChange={(authority_reference) => onChange({ ...row, authority_reference })} />
      {!individual && client.contactName ? <p style={suggestion}>ผู้ติดต่อในข้อมูลลูกค้า: {client.contactName} โปรดตรวจสอบอำนาจก่อนกรอกเป็นผู้ลงนาม ระบบจะไม่เลือกให้โดยอัตโนมัติ</p> : null}
    </>}
    <div style={rowFooter}>{canRemove ? <button type="button" style={removeButton} disabled={disabled} onClick={onRemove}>ลบผู้ลงนามนี้</button> : null}</div>
  </div>;
}

function OfficeSignerRow({ row, authorizedSigners, disabled, canRemove, canMoveUp, canMoveDown, onChange, onRemove, onMove }: {
  row: FeeAgreementSignatory;
  authorizedSigners: AuthorizedSigner[];
  disabled: boolean;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (next: FeeAgreementSignatory) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const savedKey = text(row.authorized_signer_key);
  const activeMatch = authorizedSigners.find((signer) => signer.key === savedKey);
  const selectedValue = activeMatch ? activeMatch.key : "__saved__";
  return <div style={signerCard}>
    <div style={cardHeader}><strong>ผู้ลงนามฝ่ายสำนักงาน</strong><OrderActions disabled={disabled} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMove={onMove} /></div>
    <label style={labelStyle}>ผู้ลงนามที่ได้รับมอบอำนาจ<select style={input} value={selectedValue} disabled={disabled} onChange={(event) => {
      const signer = authorizedSigners.find((candidate) => candidate.key === event.target.value);
      if (signer) onChange(officeSignatory(signer, row.sort_order));
    }}>
      {!activeMatch ? <option value="__saved__">{row.name || "ผู้ลงนามเดิม"} — ข้อมูลที่บันทึกไว้</option> : null}
      {authorizedSigners.map((signer) => <option key={signer.key} value={signer.key}>{signer.displayName} — {signer.positionTh || signer.positionEn || "ไม่ระบุตำแหน่ง"}</option>)}
    </select></label>
    <div style={compactGrid}>
      <ReadOnlyField label="ชื่อ" value={row.name} />
      <ReadOnlyField label="ตำแหน่ง" value={[text(row.position_th, row.capacity), text(row.position_en)].filter(Boolean).join(" / ")} />
      <ReadOnlyField label="อีเมล" value={text(row.email, "-")} />
      <ReadOnlyField label="ลายมือชื่อ" value={row.signature_storage_path ? "มีไฟล์ลายมือชื่อ" : "ยังไม่มีไฟล์ลายมือชื่อ"} />
    </div>
    <div style={rowFooter}>{canRemove ? <button type="button" style={removeButton} disabled={disabled} onClick={onRemove}>ลบผู้ลงนามนี้</button> : null}</div>
  </div>;
}

function SimpleSignerRow({ row, disabled, canMoveUp, canMoveDown, onChange, onRemove, onMove }: {
  row: FeeAgreementSignatory;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (next: FeeAgreementSignatory) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return <div style={signerCard}>
    <div style={cardHeader}><strong>พยาน</strong><OrderActions disabled={disabled} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMove={onMove} /></div>
    <div style={compactGrid}><Input label="ชื่อพยาน" value={row.name} disabled={disabled} onChange={(name) => onChange({ ...row, name, signing_mode: "witness" })} /><Input label="ตำแหน่ง/คำอธิบาย" value={row.capacity} disabled={disabled} onChange={(capacity) => onChange({ ...row, capacity })} /></div>
    <div style={rowFooter}><button type="button" style={removeButton} disabled={disabled} onClick={onRemove}>ลบพยาน</button></div>
  </div>;
}

function UnclassifiedSignerRow({ row, disabled, onChange, onRemove }: { row: FeeAgreementSignatory; disabled: boolean; onChange: (next: FeeAgreementSignatory) => void; onRemove: () => void }) {
  return <div style={signerCard}><div style={compactGrid}><Input label="ชื่อ" value={row.name} disabled={disabled} onChange={(name) => onChange({ ...row, name })} /><Input label="ตำแหน่ง/ฐานะ" value={row.capacity} disabled={disabled} onChange={(capacity) => onChange({ ...row, capacity })} /><label style={labelStyle}>ฝ่าย<select style={input} value="" disabled={disabled} onChange={(event) => onChange({ ...row, party_type: event.target.value as FeeAgreementPartyType, signing_mode: event.target.value === "witness" ? "witness" : "" })}><option value="">เลือกฝ่าย</option><option value="client">ฝ่ายลูกค้า</option><option value="firm">ฝ่ายสำนักงาน</option><option value="witness">พยาน</option></select></label></div><div style={rowFooter}><button type="button" style={removeButton} disabled={disabled} onClick={onRemove}>ลบข้อมูลนี้</button></div></div>;
}

function RequirementSummary({ minimumClient, minimumFirm, minimumWitness, clientCount, firmCount, witnessCount }: { minimumClient: number; minimumFirm: number; minimumWitness: number; clientCount: number; firmCount: number; witnessCount: number }) {
  const requirements = [minimumClient ? `ฝ่ายลูกค้าอย่างน้อย ${minimumClient}` : "", minimumFirm ? `ฝ่ายสำนักงานอย่างน้อย ${minimumFirm}` : "", minimumWitness ? `พยานอย่างน้อย ${minimumWitness}` : ""].filter(Boolean);
  if (!requirements.length) return <p style={requirement}>แม่แบบไม่กำหนดจำนวนผู้ลงนามขั้นต่ำเพิ่มเติม ระบบยังตรวจสอบความพร้อมก่อนบันทึกว่าส่งเอกสารให้ลูกค้าแล้ว</p>;
  const complete = clientCount >= minimumClient && firmCount >= minimumFirm && witnessCount >= minimumWitness;
  return <p style={{ ...requirement, ...(complete ? requirementReady : requirementPending) }}>ข้อกำหนดแม่แบบ: {requirements.join(" · ")} {complete ? "— ครบแล้ว" : "— ยังไม่ครบ"}</p>;
}

function SignerGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section style={group}><div><h3 style={groupTitle}>{title}</h3><p style={groupDescription}>{description}</p></div><div style={groupBody}>{children}</div></section>;
}

function OrderActions({ disabled, canMoveUp, canMoveDown, onMove }: { disabled: boolean; canMoveUp: boolean; canMoveDown: boolean; onMove: (direction: -1 | 1) => void }) {
  return <div style={orderActions}><button type="button" style={iconButton} title="เลื่อนขึ้น" aria-label="เลื่อนผู้ลงนามขึ้น" disabled={disabled || !canMoveUp} onClick={() => onMove(-1)}>↑</button><button type="button" style={iconButton} title="เลื่อนลง" aria-label="เลื่อนผู้ลงนามลง" disabled={disabled || !canMoveDown} onClick={() => onMove(1)}>↓</button></div>;
}

function Input({ label, value, disabled, onChange, type = "text" }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; type?: string }) {
  return <label style={labelStyle}>{label}<input style={input} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div style={readOnly}><span>{label}</span><strong>{value || "-"}</strong></div>;
}

function officeSignatory(signer: AuthorizedSigner, sortOrder: number): FeeAgreementSignatory {
  return {
    name: signer.displayName,
    capacity: signer.positionTh || signer.positionEn,
    party_type: "firm",
    sort_order: sortOrder,
    signing_mode: "authorized_signer",
    authorized_signer_id: signer.id || "",
    authorized_signer_key: signer.key,
    email: signer.email,
    position_th: signer.positionTh,
    position_en: signer.positionEn,
    signature_storage_path: signer.signatureStoragePath || "",
  };
}

function effectiveClientSigningMode(row: FeeAgreementSignatory, client: FeeAgreementClientContext) {
  if (row.signing_mode === "self" && isIndividual(client.clientType)) return row.signing_mode;
  if (row.signing_mode === "attorney_in_fact" || row.signing_mode === "authorized_representative") return row.signing_mode;
  return isIndividual(client.clientType) && row.name === client.name ? "self" : isIndividual(client.clientType) ? "attorney_in_fact" : "authorized_representative";
}

function isIndividual(clientType: string) {
  return clientType.trim().toLowerCase() === "individual";
}

function compareSignatories(left: FeeAgreementSignatory, right: FeeAgreementSignatory) {
  const order: Record<string, number> = { client: 0, firm: 1, witness: 2 };
  return (order[left.party_type] ?? 3) - (order[right.party_type] ?? 3) || left.sort_order - right.sort_order;
}

function hasName(row: FeeAgreementSignatory) {
  return Boolean(row.name.trim());
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

const editor: CSSProperties = { display: "grid", gap: 14, marginTop: 14 };
const group: CSSProperties = { display: "grid", gap: 12, padding: 14, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" };
const groupTitle: CSSProperties = { margin: 0, fontSize: 16, color: "#1e293b" };
const groupDescription: CSSProperties = { margin: "4px 0 0", color: "#64748b", fontSize: 13 };
const groupBody: CSSProperties = { display: "grid", gap: 10 };
const signerCard: CSSProperties = { display: "grid", gap: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff" };
const cardHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
const compactGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 };
const identityLine: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px 14px", color: "#334155" };
const labelStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 0, color: "#334155", fontSize: 14 };
const input: CSSProperties = { boxSizing: "border-box", width: "100%", minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px", background: "#fff", font: "inherit" };
const readOnly: CSSProperties = { display: "grid", alignContent: "start", gap: 5, minWidth: 0, fontSize: 14, overflowWrap: "anywhere" };
const rowFooter: CSSProperties = { display: "flex", justifyContent: "flex-end" };
const orderActions: CSSProperties = { display: "flex", gap: 6 };
const iconButton: CSSProperties = { width: 32, height: 32, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#334155", cursor: "pointer" };
const secondaryButton: CSSProperties = { justifySelf: "start", border: "1px solid #94a3b8", borderRadius: 6, padding: "8px 11px", background: "#fff", color: "#334155", cursor: "pointer" };
const removeButton: CSSProperties = { border: 0, background: "transparent", color: "#b91c1c", cursor: "pointer", padding: "6px 2px" };
const missing: CSSProperties = { margin: 0, color: "#9a3412", fontSize: 13 };
const suggestion: CSSProperties = { margin: 0, color: "#92400e", fontSize: 13, background: "#fffbeb", padding: 9 };
const requirement: CSSProperties = { margin: 0, padding: "9px 11px", borderRadius: 6, color: "#475569", background: "#f1f5f9", fontSize: 13 };
const requirementReady: CSSProperties = { color: "#166534", background: "#f0fdf4" };
const requirementPending: CSSProperties = { color: "#9a3412", background: "#fff7ed" };
const scrollTarget: CSSProperties = { scrollMarginTop: 96 };
