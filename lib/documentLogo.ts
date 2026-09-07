import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_ASSET_BUCKET } from "./documentIdentity";

export type DocumentLogoEvidence = {
  bucket: typeof DOCUMENT_ASSET_BUCKET;
  path: string;
  object_id: string;
  storage_version: string | null;
};

export function documentLogoEvidence(value: unknown): DocumentLogoEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("logo evidence");
  const asset = value as Record<string, unknown>;
  if (asset.bucket !== DOCUMENT_ASSET_BUCKET || typeof asset.path !== "string"
    || !/^company\/logo\/[^/]+$/.test(asset.path) || asset.path.includes("..")
    || typeof asset.object_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(asset.object_id)
    || !(asset.storage_version === null || typeof asset.storage_version === "string")) throw new Error("logo evidence");
  return asset as DocumentLogoEvidence;
}

// Receipt rendering never asks the current company profile which logo to use.
// A decoded local Blob URL does not expire while the document is open for print.
export async function loadReviewedDocumentLogo(client: SupabaseClient, evidence: DocumentLogoEvidence) {
  const asset = documentLogoEvidence(evidence);
  const { data, error } = await client.storage.from(asset.bucket).download(asset.path);
  if (error || !data) throw new Error("ไม่สามารถโหลดโลโก้ตามหลักฐานเอกสารได้ กรุณาลองโหลดใหม่หรือติดต่อผู้ดูแล");
  const url = URL.createObjectURL(data);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return url;
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("ไม่สามารถแสดงโลโก้ตามหลักฐานเอกสารได้ กรุณาติดต่อผู้ดูแล");
  }
}

export function newCompanyLogoPath(fileName: string) {
  const name = fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/\.{2,}/g, "-") || "logo";
  return `company/logo/${crypto.randomUUID()}-${name}`;
}
