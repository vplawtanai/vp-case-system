export const feeAgreementPartyTypes = ["client", "firm", "witness"] as const;

export type FeeAgreementPartyType = (typeof feeAgreementPartyTypes)[number];

export type FeeAgreementSignatory = {
  name: string;
  capacity: string;
  party_type: FeeAgreementPartyType | "";
  sort_order: number;
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
    name,
    capacity: text(row.capacity, text(row.title)),
    party_type: readSignatoryPartyType(row),
    sort_order: Number(row.sort_order || row.order || index + 1) || index + 1,
  };
}

export function normalizeFeeAgreementSignatories(value: unknown): FeeAgreementSignatory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const normalized = normalizeFeeAgreementSignatory(entry, index);
    return normalized ? [normalized] : [];
  });
}
