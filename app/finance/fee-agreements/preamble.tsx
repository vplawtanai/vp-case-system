import type { DocumentIdentity } from "../../../lib/documentIdentity";
import type { FeeAgreementSignatory } from "./signatories";

type JsonObject = Record<string, unknown>;

export function FeeAgreementPreamble({
  section,
  variables,
  client,
  matter,
  identity,
  signatories,
  languageCode = "th",
  placeholderMode = false,
}: {
  section?: unknown;
  variables: Record<string, string>;
  client?: unknown;
  matter?: unknown;
  identity: DocumentIdentity;
  signatories: FeeAgreementSignatory[];
  languageCode?: string;
  placeholderMode?: boolean;
}) {
  const sectionRow = object(section);
  const clientRow = object(client);
  const matterRow = object(matter);
  const isThai = languageCode.toLowerCase().startsWith("th");
  const clientName = value(
    variables.CLIENT_NAME,
    firstText(clientRow.name, clientRow.client_name, clientRow.display_name),
    placeholderMode ? "[ชื่อลูกค้า]" : "[ยังไม่ได้ระบุชื่อลูกค้า]",
  );
  const clientAddress = value(
    variables.CLIENT_ADDRESS,
    firstText(clientRow.address, clientRow.address_th),
  );
  const clientTaxId = value(variables.CLIENT_TAX_ID, text(clientRow.tax_id));
  const clientType = firstText(clientRow.client_type, clientRow.type).toLowerCase();
  const isIndividual = !clientType || clientType === "individual";
  const clientSigner = signatories.find((entry) => entry.party_type === "client") || null;
  const firmName = value(
    variables.LAW_FIRM_NAME,
    isThai ? identity.companyNameTh || identity.companyNameEn : identity.companyNameEn || identity.companyNameTh,
    placeholderMode ? "[ชื่อผู้ให้บริการ]" : "[ยังไม่ได้ตั้งค่าชื่อผู้ให้บริการ]",
  );
  const firmAddress = value(
    variables.LAW_FIRM_ADDRESS,
    isThai ? identity.addressTh || identity.addressEn : identity.addressEn || identity.addressTh,
  );
  const firmTaxId = value(variables.LAW_FIRM_TAX_ID, identity.taxId);
  const branch = isThai ? identity.branchTh || identity.branchEn : identity.branchEn || identity.branchTh;
  const agreementDate = value(
    variables.AGREEMENT_DATE,
    "",
    placeholderMode ? "[วันที่ทำสัญญา]" : "[ยังไม่ได้ระบุวันที่ทำสัญญา]",
  );
  const matterName = value(
    variables.MATTER_NAME,
    firstText(matterRow.title, matterRow.name, matterRow.file_no, matterRow.matter_no),
  );
  const title = sectionTitle(sectionRow, isThai);

  if (!isThai) {
    return <section className="fee-agreement-preamble" data-section-kind="preamble" data-section-code={text(sectionRow.section_code, "PREAMBLE")} style={sectionStyle}>
      <h2 className="fee-agreement-section-title" style={heading}>{title}</h2>
      <p style={paragraph}>This Legal Services Agreement is made on {agreementDate} between:</p>
      <p style={partyParagraph}><strong>{clientName}</strong>{clientAddress ? `, of ${clientAddress}` : ""} (the “Client”);</p>
      <p style={connector}>and</p>
      <p style={partyParagraph}><strong>{firmName}</strong>{firmAddress ? `, of ${firmAddress}` : ""} (the “Service Provider”).</p>
      {matterName ? <p style={paragraph}>The parties agree that the Service Provider will provide legal services concerning <strong>{matterName}</strong>, subject to the scope, fees, and terms of this Agreement.</p> : null}
      <p style={paragraph}>The Client and the Service Provider are collectively referred to as the “Parties”.</p>
    </section>;
  }

  return <section className="fee-agreement-preamble" data-section-kind="preamble" data-section-code={text(sectionRow.section_code, "PREAMBLE")} style={sectionStyle}>
    <h2 className="fee-agreement-section-title" style={heading}>{title}</h2>
    <p style={paragraph}>สัญญาว่าจ้างให้บริการทางกฎหมายฉบับนี้ทำขึ้น ณ วันที่ <strong>{agreementDate}</strong> ระหว่าง</p>
    <p style={partyParagraph}>
      <strong>{clientName}</strong>
      {clientAddress ? ` มีที่อยู่ ณ ${clientAddress}` : ""}
      {!isIndividual && clientTaxId ? ` เลขประจำตัวผู้เสียภาษี ${clientTaxId}` : ""}
      {clientRepresentation(clientSigner, clientName, isIndividual)}
      {" "}(ต่อไปในสัญญานี้เรียกว่า “ผู้ว่าจ้าง”)
    </p>
    <p style={connector}>กับ</p>
    <p style={partyParagraph}>
      <strong>{firmName}</strong>
      {firmAddress ? ` มีสำนักงานตั้งอยู่ ณ ${firmAddress}` : ""}
      {firmTaxId ? ` เลขประจำตัวผู้เสียภาษี ${firmTaxId}` : ""}
      {branch ? ` (${branch})` : ""}
      {" "}(ต่อไปในสัญญานี้เรียกว่า “ผู้ให้บริการ”)
    </p>
    {matterName ? <p style={paragraph}>คู่สัญญาตกลงว่าจ้างและให้บริการทางกฎหมายเกี่ยวกับ <strong>{matterName}</strong> ตามขอบเขต ค่าบริการ และเงื่อนไขที่กำหนดไว้ในสัญญานี้</p> : null}
    <p style={paragraph}>ผู้ว่าจ้างและผู้ให้บริการรวมเรียกว่า “คู่สัญญา”</p>
  </section>;
}

function clientRepresentation(
  signer: FeeAgreementSignatory | null,
  clientName: string,
  isIndividual: boolean,
) {
  if (!signer || !signer.name.trim()) return "";
  if (isIndividual && signer.signing_mode !== "attorney_in_fact") return "";
  if (!isIndividual && !["authorized_representative", "attorney_in_fact"].includes(signer.signing_mode || "")) return "";

  const authority = signer.signing_mode === "attorney_in_fact"
    ? ` โดยมี ${signer.name} เป็นผู้รับมอบอำนาจ`
    : ` โดยมี ${signer.name}${signer.capacity ? ` ตำแหน่ง/ฐานะ ${signer.capacity}` : ""} เป็นผู้แทนผู้มีอำนาจ`;
  const contractualParty = signer.contractual_party_name && signer.contractual_party_name !== clientName
    ? ` ในนามของ ${clientName}`
    : "";
  return `${authority}${contractualParty}`;
}

function sectionTitle(section: JsonObject, isThai: boolean) {
  const number = firstText(section.display_label, section.display_number, isThai ? "ข้อ 1" : "Section 1");
  const title = text(section.title, isThai ? "คู่สัญญา บทนำ วันที่ และคำนิยาม" : "Parties, Recitals, Date and Definitions");
  return `${number} ${title}`.trim();
}

function value(primary: unknown, secondary: unknown, fallback = "") {
  return firstText(primary, secondary, fallback);
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function firstText(...values: unknown[]) {
  return values.map((entry) => text(entry)).find(Boolean) || "";
}

const sectionStyle = { margin: "20px 0", breakInside: "auto" as const };
const heading = { color: "#15803d", fontSize: 17, borderBottom: "1px solid #bbf7d0", paddingBottom: 6, margin: "0 0 12px", breakAfter: "avoid" as const };
const paragraph = { margin: "8px 0", lineHeight: 1.75, textAlign: "justify" as const, overflowWrap: "break-word" as const };
const partyParagraph = { ...paragraph, paddingLeft: 16 };
const connector = { margin: "8px 0", textAlign: "center" as const, fontWeight: 700 };
