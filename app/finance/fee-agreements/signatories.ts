export const feeAgreementPartyTypes = ["client", "firm", "witness"] as const;

export type FeeAgreementPartyType = (typeof feeAgreementPartyTypes)[number];

export const feeAgreementSigningModes = [
  "self",
  "attorney_in_fact",
  "authorized_representative",
  "authorized_signer",
  "witness",
] as const;

export type FeeAgreementSigningMode = (typeof feeAgreementSigningModes)[number];

export type FeeAgreementSignatory = {
  [key: string]: unknown;
  name: string;
  capacity: string;
  party_type: FeeAgreementPartyType | "";
  sort_order: number;
  signing_mode?: FeeAgreementSigningMode | "";
  contractual_party_name?: string;
  authorized_signer_id?: string;
  authorized_signer_key?: string;
  email?: string;
  position_th?: string;
  position_en?: string;
  signature_storage_path?: string;
  authority_reference?: string;
  power_of_attorney_no?: string;
  power_of_attorney_date?: string;
  authority_note?: string;
};

type JsonObject = Record<string, unknown>;

const object = (value: unknown): JsonObject => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {}
);

const text = (value: unknown, fallback = "") => (
  typeof value === "string" && value.trim() ? value.trim() : fallback
);

export function readSignatoryPartyType(value: unknown): FeeAgreementPartyType | "" {
  const row = object(value);
  const candidate = text(row.party_type, text(row.party, text(row.side))).toLowerCase();
  return feeAgreementPartyTypes.includes(candidate as FeeAgreementPartyType)
    ? candidate as FeeAgreementPartyType
    : "";
}

export function normalizeFeeAgreementSignatory(
  value: unknown,
  index = 0,
): FeeAgreementSignatory | null {
  const row = object(value);
  const name = text(row.name, text(row.display_name));
  if (!name && Object.keys(row).length === 0) return null;

  return {
    ...row,
    name,
    capacity: text(row.capacity, text(row.title)),
    party_type: readSignatoryPartyType(row),
    sort_order: Number(row.sort_order || row.order || index + 1) || index + 1,
    signing_mode: readSigningMode(row.signing_mode),
    contractual_party_name: text(row.contractual_party_name),
    authorized_signer_id: text(row.authorized_signer_id),
    authorized_signer_key: text(row.authorized_signer_key, text(row.signer_key)),
    email: text(row.email),
    position_th: text(row.position_th),
    position_en: text(row.position_en),
    signature_storage_path: text(row.signature_storage_path),
    authority_reference: text(row.authority_reference),
    power_of_attorney_no: text(row.power_of_attorney_no),
    power_of_attorney_date: text(row.power_of_attorney_date),
    authority_note: text(row.authority_note),
  };
}

export function normalizeFeeAgreementSignatories(value: unknown): FeeAgreementSignatory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const normalized = normalizeFeeAgreementSignatory(entry, index);
    return normalized ? [normalized] : [];
  });
}

export function resequenceFeeAgreementSignatories(value: FeeAgreementSignatory[]) {
  const partyOrder: Record<FeeAgreementPartyType, number> = { client: 0, firm: 1, witness: 2 };
  return [...value]
    .sort((left, right) => {
      const leftParty = left.party_type ? partyOrder[left.party_type] : 3;
      const rightParty = right.party_type ? partyOrder[right.party_type] : 3;
      return leftParty - rightParty || left.sort_order - right.sort_order;
    })
    .map((row, index) => ({ ...row, sort_order: index + 1 }));
}

export function feeAgreementSignatoryContext(
  signer: FeeAgreementSignatory,
  fallbackContractualParty = "",
) {
  const party = text(signer.contractual_party_name, fallbackContractualParty);
  if (signer.signing_mode === "attorney_in_fact") {
    return party ? `ผู้รับมอบอำนาจจาก ${party}` : "ผู้รับมอบอำนาจ";
  }
  if (signer.signing_mode === "authorized_representative") {
    return party ? `ผู้แทนผู้มีอำนาจของ ${party}` : "ผู้แทนผู้มีอำนาจ";
  }
  return "";
}

function readSigningMode(value: unknown): FeeAgreementSigningMode | "" {
  const candidate = text(value).toLowerCase();
  return feeAgreementSigningModes.includes(candidate as FeeAgreementSigningMode)
    ? candidate as FeeAgreementSigningMode
    : "";
}
