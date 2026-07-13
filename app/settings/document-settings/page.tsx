"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { createAuditLog } from "../../../lib/auditLog";
import {
  AUTHORIZED_SIGNERS,
  type DbAuthorizedSigner,
  type DbCompanyProfile,
  normalizeAuthorizedSigner,
  normalizeCompanyProfile,
} from "../../../lib/companyProfile";
import { buildPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";

const ASSET_BUCKET = "vp-document-assets";

type Profile = {
  role?: string | null;
  full_name?: string | null;
  staff_name?: string | null;
};

type CompanyForm = {
  company_name_th: string;
  company_name_en: string;
  tax_id: string;
  branch_label: string;
  address_th: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  quotation_prefix: string;
  logo_storage_path: string;
};

type SignerForm = {
  id: string;
  signer_key: string;
  display_name: string;
  nickname: string;
  position_th: string;
  position_en: string;
  email: string;
  signature_storage_path: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
};

export default function DocumentSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("");
  const [companyForm, setCompanyForm] = useState<CompanyForm>(getFallbackCompanyForm());
  const [signers, setSigners] = useState<SignerForm[]>([]);
  const [signerForm, setSignerForm] = useState<SignerForm>(emptySignerForm());
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  const isAdmin = role === "admin";
  const canManageSigners = role === "admin" || role === "partner";

  const loadAssetUrl = useCallback(async (path: string | null | undefined) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, 60 * 10);
    if (!error && data?.signedUrl) {
      setAssetUrls((current) => ({ ...current, [path]: data.signedUrl }));
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profileData } = await supabase.from("user_profiles").select("role, full_name, staff_name").eq("id", user.id).single();
    const profile = (profileData || {}) as Profile;
    const permissions = buildPermissions(profile);
    setUserId(user.id);
    setUserEmail(user.email || "");
    setUserName(profile.staff_name || profile.full_name || user.email || user.id);
    setRole(permissions.role);

    if (permissions.role !== "admin" && permissions.role !== "partner") {
      setLoading(false);
      return;
    }

    const [companyRes, signersRes] = await Promise.all([
      supabase.from("finance_company_profiles").select("*").eq("id", "default").maybeSingle(),
      supabase.from("finance_authorized_signers").select("*").order("sort_order", { ascending: true }),
    ]);

    const company = normalizeCompanyProfile((companyRes.data || null) as DbCompanyProfile | null);
    setCompanyForm({
      company_name_th: company.companyNameTh,
      company_name_en: company.companyNameEn,
      tax_id: company.taxId,
      branch_label: company.branchLabel,
      address_th: company.addressTh,
      phone: company.phone,
      email: company.email,
      website: company.website,
      description: company.description,
      quotation_prefix: company.quotationPrefix,
      logo_storage_path: company.logoStoragePath || "",
    });
    await loadAssetUrl(company.logoStoragePath);

    const signerRows = signersRes.error ? [] : ((signersRes.data || []) as DbAuthorizedSigner[]);
    const normalizedSigners = signerRows.length > 0
      ? signerRows.map(normalizeAuthorizedSigner).map(toSignerForm)
      : AUTHORIZED_SIGNERS.map(toSignerForm);
    setSigners(normalizedSigners);
    await Promise.all(normalizedSigners.map((signer) => loadAssetUrl(signer.signature_storage_path)));
    setLoading(false);
  }, [loadAssetUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSettings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  const saveCompanyProfile = async () => {
    if (!isAdmin || saving) return;
    setSaving(true);
    const { error } = await supabase.from("finance_company_profiles").upsert({
      id: "default",
      ...companyForm,
      logo_storage_path: companyForm.logo_storage_path || null,
      updated_by_user_id: userId,
      updated_by_email: userEmail,
      updated_by_name: userName,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      alert("Unable to save company profile.");
      setSaving(false);
      return;
    }

    await createAuditLog({
      tableName: "finance_company_profiles",
      recordId: "default",
      action: "update",
      note: "Updated finance document company profile",
    });
    setSaving(false);
    await loadSettings();
  };

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin || !event.target.files?.[0]) return;
    const file = event.target.files[0];
    const error = validateImage(file, ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
    if (error) {
      alert(error);
      return;
    }

    const path = makeStoragePath("company/logo", file.name);
    const oldPath = companyForm.logo_storage_path;
    const { error: uploadError } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { upsert: false });
    if (uploadError) {
      alert("Unable to upload logo.");
      return;
    }

    const { error: updateError } = await supabase
      .from("finance_company_profiles")
      .update({
        logo_storage_path: path,
        updated_by_user_id: userId,
        updated_by_email: userEmail,
        updated_by_name: userName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");

    if (updateError) {
      await safeRemoveAsset(path, "company/logo");
      alert("Logo uploaded, but company profile could not be updated.");
      return;
    }

    setCompanyForm((current) => ({ ...current, logo_storage_path: path }));
    if (oldPath) {
      const removed = await safeRemoveAsset(oldPath, "company/logo");
      if (!removed) console.warn("Old logo cleanup skipped or failed.");
    }
    await loadAssetUrl(path);
    await createAuditLog({
      tableName: "finance_company_profiles",
      recordId: "default",
      action: "update",
      note: "Uploaded/replaced finance document logo",
    });
  };

  const saveSigner = async () => {
    if (!canManageSigners || saving) return;
    if (!signerForm.signer_key.trim() || !signerForm.display_name.trim()) {
      alert("Signer key and name are required.");
      return;
    }
    if (signerForm.is_default && !signerForm.is_active) {
      alert("Default signer must be active.");
      return;
    }
    setSaving(true);

    const payload = {
      signer_key: signerForm.signer_key.trim(),
      display_name: signerForm.display_name.trim(),
      nickname: signerForm.nickname.trim() || null,
      position_th: signerForm.position_th.trim() || null,
      position_en: signerForm.position_en.trim() || null,
      email: signerForm.email.trim() || null,
      signature_storage_path: signerForm.signature_storage_path || null,
      is_active: signerForm.is_active,
      sort_order: Number(signerForm.sort_order || 0),
      updated_by_user_id: userId,
      updated_by_email: userEmail,
      updated_by_name: userName,
      updated_at: new Date().toISOString(),
    };

    const query = signerForm.id
      ? supabase.from("finance_authorized_signers").update(payload).eq("id", signerForm.id).select("id").single()
      : supabase.from("finance_authorized_signers").insert(payload).select("id").single();
    const { data: savedSigner, error } = await query;

    if (error) {
      alert("Unable to save signer.");
      setSaving(false);
      return;
    }

    if (signerForm.is_default && savedSigner?.id) {
      const { error: defaultError } = await supabase.rpc("set_finance_authorized_signer_default", {
        p_signer_id: savedSigner.id,
        p_updated_by_user_id: userId || null,
        p_updated_by_email: userEmail || null,
        p_updated_by_name: userName || null,
      });

      if (defaultError) {
        alert("Signer saved, but default signer could not be updated.");
        setSaving(false);
        await loadSettings();
        return;
      }
    }

    await createAuditLog({
      tableName: "finance_authorized_signers",
      recordId: signerForm.id || signerForm.signer_key,
      action: signerForm.id ? "update" : "create",
      note: `Saved authorized signer ${signerForm.display_name}`,
    });
    setSignerForm(emptySignerForm());
    setSaving(false);
    await loadSettings();
  };

  const uploadSignature = async (signer: SignerForm, event: ChangeEvent<HTMLInputElement>) => {
    if (!canManageSigners || !signer.id || !event.target.files?.[0]) return;
    const file = event.target.files[0];
    const error = validateImage(file, ["image/png", "image/jpeg", "image/webp"]);
    if (error) {
      alert(error);
      return;
    }

    let croppedSignature: File;
    try {
      croppedSignature = await cropSignatureImage(file);
    } catch (cropError) {
      alert(cropError instanceof SignatureCropError ? cropError.message : "ไม่สามารถเตรียมไฟล์ลายเซ็นได้ กรุณาเลือกภาพลายเซ็นใหม่");
      return;
    }

    const path = makeStoragePath(`signers/${signer.id}`, toPngFileName(file.name));
    const oldPath = signer.signature_storage_path;
    const signerPrefix = `signers/${signer.id}`;
    const { error: uploadError } = await supabase.storage.from(ASSET_BUCKET).upload(path, croppedSignature, { upsert: false });
    if (uploadError) {
      alert("Unable to upload signature.");
      return;
    }

    const { error: updateError } = await supabase
      .from("finance_authorized_signers")
      .update({
        signature_storage_path: path,
        updated_by_user_id: userId,
        updated_by_email: userEmail,
        updated_by_name: userName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", signer.id);

    if (updateError) {
      await safeRemoveAsset(path, signerPrefix);
      alert("Signature uploaded, but signer could not be updated.");
      return;
    }

    if (oldPath) {
      const removed = await safeRemoveAsset(oldPath, signerPrefix);
      if (!removed) console.warn("Old signature cleanup skipped or failed.");
    }
    await createAuditLog({
      tableName: "finance_authorized_signers",
      recordId: signer.id,
      action: "update",
      note: `Uploaded/replaced signature for ${signer.display_name}`,
    });
    alert("ครอปพื้นที่ว่างและอัปโหลดลายเซ็นเรียบร้อยแล้ว");
    await loadSettings();
  };

  const removeSignature = async (signer: SignerForm) => {
    if (!canManageSigners || !signer.id || !signer.signature_storage_path) return;
    if (!window.confirm("Remove this signature image?")) return;
    const oldPath = signer.signature_storage_path;
    const signerPrefix = `signers/${signer.id}`;
    const { error } = await supabase
      .from("finance_authorized_signers")
      .update({
        signature_storage_path: null,
        updated_by_user_id: userId,
        updated_by_email: userEmail,
        updated_by_name: userName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", signer.id);
    if (error) {
      alert("Unable to remove signature.");
      return;
    }
    const removed = await safeRemoveAsset(oldPath, signerPrefix);
    if (!removed) console.warn("Signature cleanup skipped or failed.");
    await createAuditLog({
      tableName: "finance_authorized_signers",
      recordId: signer.id,
      action: "update",
      note: `Removed signature for ${signer.display_name}`,
    });
    await loadSettings();
  };

  if (loading) {
    return (
      <AuthGuard>
        <AppTopNav title="Settings" subtitle="Document Settings" activePage="account" />
        <main style={pageStyle}><div style={cardStyle}>Loading document settings...</div></main>
      </AuthGuard>
    );
  }

  if (!canManageSigners) {
    return (
      <AuthGuard>
        <AppTopNav title="Settings" subtitle="Document Settings" activePage="account" />
        <main style={pageStyle}>
          <div style={cardStyle}>
            <h1 style={pageTitleStyle}>No access</h1>
            <p style={mutedTextStyle}>Only admin and partner users can manage document settings.</p>
          </div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AppTopNav title="Settings" subtitle="Document Settings" activePage="account" />
      <main style={pageStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h1 style={pageTitleStyle}>Document Settings</h1>
            <p style={mutedTextStyle}>Company profile, quotation prefix, logo, authorized signers, and private signature assets.</p>
          </div>
        </div>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>Company Profile</h2>
            {!isAdmin ? <span style={badgeStyle}>Admin only</span> : null}
          </div>
          <div style={formGridStyle}>
            <TextField label="Thai company name" value={companyForm.company_name_th} disabled={!isAdmin} onChange={(value) => setCompanyForm({ ...companyForm, company_name_th: value })} />
            <TextField label="English company name" value={companyForm.company_name_en} disabled={!isAdmin} onChange={(value) => setCompanyForm({ ...companyForm, company_name_en: value })} />
            <TextField label="Tax ID" value={companyForm.tax_id} disabled={!isAdmin} onChange={(value) => setCompanyForm({ ...companyForm, tax_id: value })} />
            <TextField label="Branch" value={companyForm.branch_label} disabled={!isAdmin} onChange={(value) => setCompanyForm({ ...companyForm, branch_label: value })} />
            <TextField label="Phone" value={companyForm.phone} disabled={!isAdmin} onChange={(value) => setCompanyForm({ ...companyForm, phone: value })} />
            <TextField label="Email" value={companyForm.email} disabled={!isAdmin} onChange={(value) => setCompanyForm({ ...companyForm, email: value })} />
            <TextField label="Website" value={companyForm.website} disabled={!isAdmin} onChange={(value) => setCompanyForm({ ...companyForm, website: value })} />
            <TextField label="Quotation prefix" value={companyForm.quotation_prefix} disabled={!isAdmin} onChange={(value) => setCompanyForm({ ...companyForm, quotation_prefix: value })} />
            <label style={wideLabelStyle}>Address
              <textarea value={companyForm.address_th} disabled={!isAdmin} onChange={(event) => setCompanyForm({ ...companyForm, address_th: event.target.value })} style={textareaStyle} />
            </label>
            <label style={wideLabelStyle}>Description
              <textarea value={companyForm.description} disabled={!isAdmin} onChange={(event) => setCompanyForm({ ...companyForm, description: event.target.value })} style={textareaStyle} />
            </label>
          </div>
          <div style={assetRowStyle}>
            <AssetPreview path={companyForm.logo_storage_path} urls={assetUrls} fallback="VP" />
            <div>
              <div style={mutedTextStyle}>Current logo: {companyForm.logo_storage_path || "-"}</div>
              {isAdmin ? <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={uploadLogo} /> : null}
            </div>
          </div>
          {isAdmin ? <button type="button" onClick={saveCompanyProfile} disabled={saving} style={primaryButtonStyle}>{saving ? "Saving..." : "Save Company Profile"}</button> : null}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Authorized Signers</h2>
          <div style={signerListStyle}>
            {signers.map((signer) => (
              <div key={signer.signer_key} style={signerCardStyle}>
                <div style={sectionHeaderStyle}>
                  <div>
                    <strong>{signer.display_name}</strong>
                    <div style={mutedTextStyle}>{signer.nickname || "-"} · {[signer.position_th, signer.position_en].filter(Boolean).join(" / ") || "-"}</div>
                    <div style={mutedTextStyle}>{signer.email || "-"}</div>
                  </div>
                  <div style={actionGroupStyle}>
                    {signer.is_default ? <span style={badgeStyle}>Default</span> : null}
                    {!signer.is_active ? <span style={dangerBadgeStyle}>Inactive</span> : null}
                  </div>
                </div>
                <div style={assetRowStyle}>
                  <AssetPreview path={signer.signature_storage_path} urls={assetUrls} fallback="Signature" />
                  <div style={actionGroupStyle}>
                    <button type="button" onClick={() => setSignerForm(signer)} style={secondaryButtonStyle}>Edit</button>
                    {signer.id ? <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => uploadSignature(signer, event)} /> : null}
                    {signer.signature_storage_path ? <button type="button" onClick={() => removeSignature(signer)} style={dangerButtonStyle}>Remove Signature</button> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={formPanelStyle}>
            <h3 style={sectionTitleStyle}>{signerForm.id ? "Edit Signer" : "Add Signer"}</h3>
            <div style={formGridStyle}>
              <TextField label="Signer key" value={signerForm.signer_key} onChange={(value) => setSignerForm({ ...signerForm, signer_key: value })} />
              <TextField label="Display name" value={signerForm.display_name} onChange={(value) => setSignerForm({ ...signerForm, display_name: value })} />
              <TextField label="Nickname" value={signerForm.nickname} onChange={(value) => setSignerForm({ ...signerForm, nickname: value })} />
              <TextField label="Position TH" value={signerForm.position_th} onChange={(value) => setSignerForm({ ...signerForm, position_th: value })} />
              <TextField label="Position EN" value={signerForm.position_en} onChange={(value) => setSignerForm({ ...signerForm, position_en: value })} />
              <TextField label="Email" value={signerForm.email} onChange={(value) => setSignerForm({ ...signerForm, email: value })} />
              <TextField label="Sort order" value={String(signerForm.sort_order)} onChange={(value) => setSignerForm({ ...signerForm, sort_order: Number(value || 0) })} />
            </div>
            <div style={checkRowStyle}>
              <label><input type="checkbox" checked={signerForm.is_active} onChange={(event) => setSignerForm({ ...signerForm, is_active: event.target.checked })} /> Active</label>
              <label><input type="checkbox" checked={signerForm.is_default} onChange={(event) => setSignerForm({ ...signerForm, is_default: event.target.checked })} /> Default</label>
            </div>
            <div style={actionGroupStyle}>
              <button type="button" onClick={saveSigner} disabled={saving} style={primaryButtonStyle}>{saving ? "Saving..." : "Save Signer"}</button>
              <button type="button" onClick={() => setSignerForm(emptySignerForm())} style={secondaryButtonStyle}>Clear</button>
            </div>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}

function TextField({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <label style={labelStyle}>{label}
      <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
    </label>
  );
}

function AssetPreview({ path, urls, fallback }: { path: string; urls: Record<string, string>; fallback: string }) {
  const url = path ? urls[path] : "";
  if (!url) return <div style={assetFallbackStyle}>{fallback}</div>;
  return <div style={{ ...assetPreviewStyle, backgroundImage: `url("${url}")` }} />;
}

function getFallbackCompanyForm(): CompanyForm {
  const profile = normalizeCompanyProfile(null);
  return {
    company_name_th: profile.companyNameTh,
    company_name_en: profile.companyNameEn,
    tax_id: profile.taxId,
    branch_label: profile.branchLabel,
    address_th: profile.addressTh,
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    description: profile.description,
    quotation_prefix: profile.quotationPrefix,
    logo_storage_path: profile.logoStoragePath || "",
  };
}

function emptySignerForm(): SignerForm {
  return {
    id: "",
    signer_key: "",
    display_name: "",
    nickname: "",
    position_th: "",
    position_en: "",
    email: "",
    signature_storage_path: "",
    is_active: true,
    is_default: false,
    sort_order: 0,
  };
}

function toSignerForm(signer: ReturnType<typeof normalizeAuthorizedSigner> | (typeof AUTHORIZED_SIGNERS)[number]): SignerForm {
  return {
    id: signer.id || "",
    signer_key: signer.key,
    display_name: signer.displayName,
    nickname: signer.nickname || "",
    position_th: signer.positionTh || "",
    position_en: signer.positionEn || "",
    email: signer.email || "",
    signature_storage_path: signer.signatureStoragePath || "",
    is_active: signer.isActive !== false,
    is_default: signer.isDefault === true || signer.default === true,
    sort_order: signer.sortOrder || 0,
  };
}

function validateImage(file: File, allowedTypes: string[]) {
  if (!allowedTypes.includes(file.type)) return "Unsupported image type.";
  if (file.size > 2 * 1024 * 1024) return "Image must be 2 MB or smaller.";
  return "";
}

class SignatureCropError extends Error {}

async function cropSignatureImage(file: File) {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();

    if (!image.naturalWidth || !image.naturalHeight) throw new SignatureCropError("ไม่พบเส้นลายเซ็นในไฟล์ กรุณาเลือกภาพลายเซ็นใหม่");

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new SignatureCropError("ไม่สามารถเตรียมไฟล์ลายเซ็นได้ กรุณาเลือกภาพลายเซ็นใหม่");

    sourceContext.drawImage(image, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const bounds = findSignatureBounds(pixels, file.type === "image/jpeg");
    if (!bounds) throw new SignatureCropError("ไม่พบเส้นลายเซ็นในไฟล์ กรุณาเลือกภาพลายเซ็นใหม่");

    const padding = Math.ceil(Math.max(bounds.width, bounds.height) * 0.06);
    const crop = {
      left: Math.max(0, bounds.left - padding),
      top: Math.max(0, bounds.top - padding),
      right: Math.min(sourceCanvas.width, bounds.right + padding),
      bottom: Math.min(sourceCanvas.height, bounds.bottom + padding),
    };
    const cropWidth = crop.right - crop.left;
    const cropHeight = crop.bottom - crop.top;
    const scale = Math.min(1, 1200 / cropWidth, 600 / cropHeight);
    const outputWidth = Math.max(1, Math.round(cropWidth * scale));
    const outputHeight = Math.max(1, Math.round(cropHeight * scale));
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new SignatureCropError("ไม่สามารถเตรียมไฟล์ลายเซ็นได้ กรุณาเลือกภาพลายเซ็นใหม่");

    outputContext.drawImage(sourceCanvas, crop.left, crop.top, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
    const outputBlob = await canvasToPng(outputCanvas);
    if (outputBlob.size > 2 * 1024 * 1024) throw new SignatureCropError("ไฟล์ลายเซ็นหลังครอปมีขนาดใหญ่เกินไป กรุณาเลือกภาพที่เล็กลง");

    return new File([outputBlob], toPngFileName(file.name), { type: "image/png" });
  } catch (error) {
    if (error instanceof SignatureCropError) throw error;
    throw new SignatureCropError("ไม่สามารถเตรียมไฟล์ลายเซ็นได้ กรุณาเลือกภาพลายเซ็นใหม่");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function findSignatureBounds(imageData: ImageData, treatWhiteAsBackground: boolean) {
  const { data, width, height } = imageData;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha <= 12) continue;

      const isNearWhite = data[offset] >= 250 && data[offset + 1] >= 250 && data[offset + 2] >= 250;
      if (treatWhiteAsBackground && isNearWhite) continue;

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  return right < left || bottom < top ? null : {
    left,
    top,
    right: right + 1,
    bottom: bottom + 1,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new SignatureCropError("ไม่สามารถเตรียมไฟล์ลายเซ็นได้ กรุณาเลือกภาพลายเซ็นใหม่"));
    }, "image/png");
  });
}

function sanitizeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "asset";
}

function toPngFileName(value: string) {
  return `${value.replace(/\.[^.]+$/, "") || "signature"}.png`;
}

function makeStoragePath(prefix: string, fileName: string) {
  return `${prefix}/${new Date().getTime()}-${sanitizeFileName(fileName)}`;
}

function isSafeAssetPath(path: string, expectedPrefix: string) {
  return Boolean(path) && path.startsWith(`${expectedPrefix}/`) && !path.includes("..");
}

async function safeRemoveAsset(path: string, expectedPrefix: string) {
  if (!isSafeAssetPath(path, expectedPrefix)) return false;
  const { error } = await supabase.storage.from(ASSET_BUCKET).remove([path]);
  if (error) {
    console.warn("Private asset cleanup failed.", { expectedPrefix });
    return false;
  }
  return true;
}

const pageStyle: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24 };
const cardStyle: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, marginBottom: 16 };
const sectionHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 };
const pageTitleStyle: CSSProperties = { margin: 0, fontSize: 26, color: "#111827" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: 18, color: "#111827" };
const mutedTextStyle: CSSProperties = { color: "#6b7280", margin: "4px 0", fontSize: 13 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, color: "#374151", fontSize: 13, fontWeight: 700 };
const wideLabelStyle: CSSProperties = { ...labelStyle, gridColumn: "1 / -1" };
const inputStyle: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "9px 10px", fontSize: 14 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 80, resize: "vertical" };
const primaryButtonStyle: CSSProperties = { border: "1px solid #15803d", background: "#16a344", color: "#fff", borderRadius: 6, padding: "9px 12px", fontWeight: 800, cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { border: "1px solid #d1d5db", background: "#fff", color: "#111827", borderRadius: 6, padding: "8px 10px", fontWeight: 700, cursor: "pointer" };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, borderColor: "#b91c1c", color: "#b91c1c" };
const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: 999, background: "#dcfce7", color: "#166534", padding: "4px 9px", fontSize: 12, fontWeight: 900 };
const dangerBadgeStyle: CSSProperties = { ...badgeStyle, background: "#fee2e2", color: "#991b1b" };
const actionGroupStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const assetRowStyle: CSSProperties = { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", margin: "14px 0" };
const assetFallbackStyle: CSSProperties = { width: 120, height: 68, border: "1px dashed #9ca3af", borderRadius: 8, display: "grid", placeItems: "center", color: "#6b7280", fontWeight: 900 };
const assetPreviewStyle: CSSProperties = { width: 120, height: 68, border: "1px solid #d1d5db", borderRadius: 8, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundColor: "#fff" };
const signerListStyle: CSSProperties = { display: "grid", gap: 12, marginBottom: 18 };
const signerCardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 };
const formPanelStyle: CSSProperties = { borderTop: "1px solid #e5e7eb", paddingTop: 16 };
const checkRowStyle: CSSProperties = { display: "flex", gap: 18, margin: "14px 0", color: "#374151", fontWeight: 700 };
