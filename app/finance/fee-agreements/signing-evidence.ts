export const FEE_AGREEMENT_EVIDENCE_BUCKET = "fee-agreement-executed-documents";
export const MAX_FEE_AGREEMENT_EVIDENCE_BYTES = 25 * 1024 * 1024;

const evidenceExtensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function validateFeeAgreementEvidenceFile(file: File) {
  if (!Object.hasOwn(evidenceExtensions, file.type)) return "เอกสารหลักฐานต้องเป็นไฟล์ PDF, JPEG หรือ PNG";
  if (file.size <= 0) return "ไฟล์หลักฐานไม่มีข้อมูล กรุณาเลือกไฟล์ใหม่";
  if (file.size > MAX_FEE_AGREEMENT_EVIDENCE_BYTES) return "ไฟล์หลักฐานต้องมีขนาดไม่เกิน 25 MB";
  return "";
}

export function buildFeeAgreementEvidencePath(feeAgreementId: string, mimeType: string) {
  const extension = evidenceExtensions[mimeType];
  if (!extension) throw new Error("Unsupported fee agreement evidence MIME type");
  return `fee-agreements/${feeAgreementId}/${crypto.randomUUID()}.${extension}`;
}

export async function calculateSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatEvidenceFileSize(value: unknown) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("th-TH", { maximumFractionDigits: 1 })} MB`;
}
