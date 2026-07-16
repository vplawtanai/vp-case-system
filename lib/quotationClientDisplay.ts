const JURISTIC_NAME_PREFIX = /^(บริษัท|บ\.?\s*|ห้างหุ้นส่วน|หจก\.?\s*|ห้างหุ้นส่วนจำกัด|สมาคม|มูลนิธิ)/u;
const INDIVIDUAL_PREFIX = /^(?:นาย|นางสาว|นาง|คุณ)\s*/u;

export function getQuotationClientDisplayName(name: string | null | undefined, clientType?: string | null) {
  const normalizedName = (name || "").trim();
  if (!normalizedName) return "-";

  const normalizedType = (clientType || "").trim().toLowerCase();
  const isJuristic = normalizedType !== "individual" && (
    normalizedType.includes("company")
    || normalizedType.includes("partnership")
    || normalizedType.includes("association")
    || normalizedType.includes("foundation")
    || JURISTIC_NAME_PREFIX.test(normalizedName)
  );
  if (isJuristic) return normalizedName;

  return `คุณ${normalizedName.replace(INDIVIDUAL_PREFIX, "").trim()}`;
}
