export type AuthorizedSigner = {
  key: string;
  displayName: string;
  nickname: string;
  positionTh: string;
  positionEn: string;
  email: string;
  default?: boolean;
};

export const VP_COMPANY_PROFILE = {
  nameTh: "บริษัท วีพี พาร์ทเนอร์ จำกัด",
  nameEn: "VP Partners Co., Ltd.",
  taxId: "0105559032840 (สำนักงานใหญ่)",
  address: "เลขที่ 91/260 ถนนสุวินทวงศ์ แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510",
  phone: "06-6014-3225",
  email: "info@vplawyer.com",
  website: "vplawyer.com",
  description: "Professional Legal Services",
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
