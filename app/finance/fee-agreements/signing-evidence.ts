export const FEE_AGREEMENT_EVIDENCE_BUCKET = "fee-agreement-executed-documents";
export const MAX_FEE_AGREEMENT_EVIDENCE_BYTES = 25 * 1024 * 1024;

const evidenceExtensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function feeAgreementEvidenceFileError(file: File): UiMessage | "" {
  if (!Object.hasOwn(evidenceExtensions, file.type)) return uiMessage("finance.feeAgreement.workspace.error.fileType");
  if (file.size <= 0) return uiMessage("finance.feeAgreement.workspace.error.fileEmpty");
  if (file.size > MAX_FEE_AGREEMENT_EVIDENCE_BYTES) return uiMessage("finance.feeAgreement.workspace.error.fileSize");
  return "";
}

export function validateFeeAgreementEvidenceFile(file: File, locale: UiLocale = "th") {
  return resolveUiMessage(locale, feeAgreementEvidenceFileError(file));
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
import { uiMessage, type UiMessage, type UiLocale } from "../../../lib/i18n/core";
import { resolveUiMessage } from "../../../lib/i18n/catalog";
