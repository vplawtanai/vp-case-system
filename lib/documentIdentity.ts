import type { SupabaseClient } from "@supabase/supabase-js";

export const DOCUMENT_ASSET_BUCKET = "vp-document-assets";
const COMPANY_LOGO_PREFIX = "company/logo/";

export type DocumentIdentity = {
  companyNameTh: string;
  companyNameEn: string;
  taxId: string;
  branchTh: string;
  branchEn: string;
  addressTh: string;
  addressEn: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  logoStoragePath: string;
};

export type LoadedDocumentIdentity = {
  identity: DocumentIdentity;
  logoUrl: string;
  error: unknown | null;
};

const emptyIdentity: DocumentIdentity = {
  companyNameTh: "",
  companyNameEn: "",
  taxId: "",
  branchTh: "",
  branchEn: "",
  addressTh: "",
  addressEn: "",
  phone: "",
  email: "",
  website: "",
  description: "",
  logoStoragePath: "",
};

export function normalizeDocumentIdentity(value: unknown): DocumentIdentity {
  const row = object(value);
  const branchLabel = text(row.branch_label);
  return {
    companyNameTh: firstText(row.company_name_th, row.name_th, row.name),
    companyNameEn: firstText(row.company_name_en, row.name_en),
    taxId: text(row.tax_id),
    branchTh: firstText(row.branch_th, branchLabel),
    branchEn: text(row.branch_en),
    addressTh: firstText(row.address_th, row.address),
    addressEn: text(row.address_en),
    phone: text(row.phone),
    email: text(row.email),
    website: text(row.website),
    description: text(row.description),
    logoStoragePath: text(row.logo_storage_path),
  };
}

export function resolveDocumentIdentity(snapshot: unknown, current: DocumentIdentity): DocumentIdentity {
  const frozen = normalizeDocumentIdentity(snapshot);
  return Object.fromEntries(
    Object.entries(emptyIdentity).map(([key]) => [
      key,
      frozen[key as keyof DocumentIdentity] || current[key as keyof DocumentIdentity] || "",
    ]),
  ) as DocumentIdentity;
}

export async function loadCurrentDocumentIdentity(client: SupabaseClient): Promise<LoadedDocumentIdentity> {
  const { data, error } = await client
    .from("finance_company_profiles")
    .select("company_name_th, company_name_en, tax_id, branch_label, branch_th, branch_en, address_th, address_en, phone, email, website, description, logo_storage_path")
    .eq("id", "default")
    .maybeSingle();
  const identity = error || !data ? { ...emptyIdentity } : normalizeDocumentIdentity(data);
  const logoUrl = await loadDocumentLogoUrl(client, identity.logoStoragePath);
  return { identity, logoUrl, error };
}

export async function loadDocumentLogoUrl(client: SupabaseClient, path: string | null | undefined) {
  const normalizedPath = text(path);
  if (!normalizedPath || !normalizedPath.startsWith(COMPANY_LOGO_PREFIX)) return "";
  const { data, error } = await client.storage
    .from(DOCUMENT_ASSET_BUCKET)
    .createSignedUrl(normalizedPath, 60 * 10);
  return error ? "" : data?.signedUrl || "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values: unknown[]) {
  return values.map(text).find(Boolean) || "";
}
