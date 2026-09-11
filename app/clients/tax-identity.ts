export type CustomerTaxIdentity = { id: string; name: string | null; tax_id: string | null; address: string | null; client_type: string | null };
export type CustomerTaxProfile = {
  client_id: string; vat_registered: boolean | null; branch_type: "head_office" | "branch" | null; branch_code: string | null;
  identity_evidence: string | null; identity_snapshot_json: CustomerTaxIdentity; verified_at: string | null;
  verified_by_user_id: string | null; updated_at: string;
};
export type CustomerTaxProfileResult = {
  identity: CustomerTaxIdentity; profile: CustomerTaxProfile | null; can_manage: boolean;
  status: "missing" | "stale" | "unverified" | "verified";
};
export type CustomerTaxForm = { vat: "" | "true" | "false"; branch: "" | "head_office" | "branch"; code: string; evidence: string; verified: boolean };
export function customerTaxForm(result: CustomerTaxProfileResult): CustomerTaxForm {
  const p = result.profile;
  return { vat: typeof p?.vat_registered === "boolean" ? String(p.vat_registered) as "true" | "false" : "",
    branch: p?.branch_type || "", code: p?.branch_code || "", evidence: p?.identity_evidence || "", verified: result.status === "verified" };
}
export function customerTaxErrors(form: CustomerTaxForm, identity: CustomerTaxIdentity) {
  const errors: Partial<Record<"identity" | "vat" | "branch" | "code" | "evidence", string>> = {};
  if (form.evidence.length > 2000) errors.evidence = "client.tax.error.evidence";
  if (form.vat === "true" && form.branch === "branch" && !/^(?!00000)\d{5}$/.test(form.code)) errors.code = "client.tax.error.branch";
  if (form.verified) {
    if (!identity.name?.trim() || !identity.address?.trim()) errors.identity = "client.tax.error.identity";
    if (form.vat === "") errors.vat = "client.tax.error.vat";
    if (form.vat === "true") {
      if (!/^\d{13}$/.test(identity.tax_id || "")) errors.identity = "client.tax.error.registered";
      if (!form.branch) errors.branch = "client.tax.error.branch";
    }
  }
  return errors;
}
export function customerTaxPayload(result: CustomerTaxProfileResult, form: CustomerTaxForm) {
  return { p_client_id: result.identity.id, p_vat_registered: form.vat === "" ? null : form.vat === "true",
    p_branch_type: form.vat === "true" ? form.branch || null : null,
    p_branch_code: form.vat !== "true" || !form.branch ? null : form.branch === "head_office" ? "00000" : form.code,
    p_identity_evidence: form.evidence.trim() || null, p_verified: form.verified,
    p_expected_identity_json: result.identity, p_expected_updated_at: result.profile?.updated_at || null };
}
export function customerTaxError(error: unknown) {
  const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return ({ CUSTOMER_TAX_PROFILE_PERMISSION_DENIED: "client.tax.error.permission", CUSTOMER_TAX_PROFILE_CLIENT_REQUIRED: "client.tax.error.client",
    CUSTOMER_TAX_PROFILE_CLIENT_CHANGED: "client.tax.error.stale", CUSTOMER_TAX_PROFILE_STALE: "client.tax.error.stale",
    CUSTOMER_TAX_PROFILE_BRANCH_INVALID: "client.tax.error.branch", CUSTOMER_TAX_PROFILE_IDENTITY_REQUIRED: "client.tax.error.identity",
    CUSTOMER_TAX_PROFILE_VAT_REQUIRED: "client.tax.error.vat", CUSTOMER_TAX_PROFILE_REGISTERED_IDENTITY_REQUIRED: "client.tax.error.registered" } as Record<string, string>)[code] || "client.tax.error.failed";
}
