export type AuthorizedSigner = {
  id?: string;
  key: string;
  displayName: string;
  nickname: string;
  positionTh: string;
  positionEn: string;
  email: string;
  signatureStoragePath?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  default?: boolean;
};

export type CompanyProfile = {
  nameTh: string;
  nameEn: string;
  companyNameTh: string;
  companyNameEn: string;
  taxId: string;
  branchLabel: string;
  address: string;
  addressTh: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  quotationPrefix: string;
  logoStoragePath?: string | null;
  logoPath?: string;
};

export type DbCompanyProfile = {
  id?: string;
  company_name_th?: string | null;
  company_name_en?: string | null;
  tax_id?: string | null;
  branch_label?: string | null;
  address_th?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  quotation_prefix?: string | null;
  logo_storage_path?: string | null;
};

export type DbAuthorizedSigner = {
  id?: string;
  signer_key?: string | null;
  display_name?: string | null;
  nickname?: string | null;
  position_th?: string | null;
  position_en?: string | null;
  email?: string | null;
  signature_storage_path?: string | null;
  is_active?: boolean | null;
  is_default?: boolean | null;
  sort_order?: number | null;
};

export const VP_COMPANY_PROFILE: CompanyProfile = {
  nameTh: "บริษัท วีพี พาร์ทเนอร์ จำกัด",
  nameEn: "VP Partners Co., Ltd.",
  companyNameTh: "บริษัท วีพี พาร์ทเนอร์ จำกัด",
  companyNameEn: "VP Partners Co., Ltd.",
  taxId: "0105559032840 (สำนักงานใหญ่)",
  branchLabel: "สำนักงานใหญ่",
  address: "เลขที่ 91/260 ถนนสุวินทวงศ์ แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510",
  addressTh: "เลขที่ 91/260 ถนนสุวินทวงศ์ แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510",
  phone: "06-6014-3225",
  email: "info@vplawyer.com",
  website: "vplawyer.com",
  description: "Professional Legal Services",
  quotationPrefix: "VP-QT",
  logoPath: "/brand/vp-logo.svg",
} as const;

export const AUTHORIZED_SIGNERS: AuthorizedSigner[] = [
  {
    key: "preecha",
    displayName: "นายปรีชา ฤกษ์งาม",
    nickname: "ทนายเป้า",
    positionTh: "หุ้นส่วนผู้จัดการ",
    positionEn: "Managing Partner",
    email: "preecha@vplawyer.com",
    default: true,
  },
  {
    key: "korbtul",
    displayName: "นายกอรปตุลย์ อินทรำพรรณ",
    nickname: "ทนายตุลย์",
    positionTh: "หุ้นส่วน",
    positionEn: "Partner",
    email: "korbtul@vppartnerslaw.com",
    default: false,
  },
];

export const DEFAULT_AUTHORIZED_SIGNER = AUTHORIZED_SIGNERS.find((signer) => signer.default) || AUTHORIZED_SIGNERS[0];

export function getAuthorizedSigner(key?: string | null) {
  return AUTHORIZED_SIGNERS.find((signer) => signer.key === key) || DEFAULT_AUTHORIZED_SIGNER;
}

export function formatSignerPosition(signer: Pick<AuthorizedSigner, "positionTh" | "positionEn">) {
  return [signer.positionTh, signer.positionEn].filter(Boolean).join(" / ");
}

export function normalizeCompanyProfile(row?: DbCompanyProfile | null): CompanyProfile {
  const companyNameTh = row?.company_name_th || VP_COMPANY_PROFILE.companyNameTh;
  const companyNameEn = row?.company_name_en || VP_COMPANY_PROFILE.companyNameEn;
  const addressTh = row?.address_th || VP_COMPANY_PROFILE.addressTh;

  return {
    nameTh: companyNameTh,
    nameEn: companyNameEn,
    companyNameTh,
    companyNameEn,
    taxId: row?.tax_id || VP_COMPANY_PROFILE.taxId,
    branchLabel: row?.branch_label || VP_COMPANY_PROFILE.branchLabel,
    address: addressTh,
    addressTh,
    phone: row?.phone || VP_COMPANY_PROFILE.phone,
    email: row?.email || VP_COMPANY_PROFILE.email,
    website: row?.website || VP_COMPANY_PROFILE.website,
    description: row?.description || VP_COMPANY_PROFILE.description,
    quotationPrefix: row?.quotation_prefix || VP_COMPANY_PROFILE.quotationPrefix,
    logoStoragePath: row?.logo_storage_path || null,
    logoPath: VP_COMPANY_PROFILE.logoPath,
  };
}

export function normalizeAuthorizedSigner(row: DbAuthorizedSigner): AuthorizedSigner {
  return {
    id: row.id,
    key: row.signer_key || "",
    displayName: row.display_name || "",
    nickname: row.nickname || "",
    positionTh: row.position_th || "",
    positionEn: row.position_en || "",
    email: row.email || "",
    signatureStoragePath: row.signature_storage_path || null,
    isActive: row.is_active === true,
    isDefault: row.is_default === true,
    sortOrder: row.sort_order || 0,
    default: row.is_default === true,
  };
}

export function getDefaultSigner(signers: AuthorizedSigner[] = AUTHORIZED_SIGNERS) {
  return signers.find((signer) => signer.isActive !== false && (signer.isDefault || signer.default)) || signers.find((signer) => signer.isActive !== false) || DEFAULT_AUTHORIZED_SIGNER;
}

export function getSignerByKey(signers: AuthorizedSigner[], key?: string | null) {
  return signers.find((signer) => signer.key === key) || getDefaultSigner(signers);
}
