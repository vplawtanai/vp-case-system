import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { createElement } from "react";
import sharp from "sharp";
import {
  AUTHORIZED_SIGNERS,
  type CompanyProfile,
  type DbAuthorizedSigner,
  type DbCompanyProfile,
  formatSignerPosition,
  getSignerByKey,
  normalizeAuthorizedSigner,
  normalizeCompanyProfile,
} from "../../../../../../lib/companyProfile";
import { buildPermissions } from "../../../../../../lib/permissions";

export const runtime = "nodejs";
export const maxDuration = 30;

const FONT_FAMILY = "VP-Noto-Sans-Thai";
const THAI_REGULAR_FONT_PATH = `${process.cwd()}/assets/fonts/noto-sans-thai/NotoSansThai-Regular.ttf`;
const THAI_BOLD_FONT_PATH = `${process.cwd()}/assets/fonts/noto-sans-thai/NotoSansThai-Bold.ttf`;

Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: THAI_REGULAR_FONT_PATH, fontWeight: 400 },
    { src: THAI_BOLD_FONT_PATH, fontWeight: 700 },
  ],
});

type QuotationRow = {
  id: string;
  quotation_no: string | null;
  client_id: string | null;
  case_id: number | null;
  advisory_matter_id: string | null;
  issue_date: string | null;
  valid_until: string | null;
  status: string | null;
  subtotal_vatable: number | string | null;
  subtotal_non_vatable: number | string | null;
  vat_amount: number | string | null;
  grand_total: number | string | null;
  scope_of_legal_services: string | null;
  included_services: string | null;
  excluded_services: string | null;
  authorized_signer_key: string | null;
  authorized_signer_name: string | null;
  authorized_signer_position: string | null;
  authorized_signer_email: string | null;
  note: string | null;
  client_snapshot_json: Record<string, unknown> | null;
  matter_snapshot_json: Record<string, unknown> | null;
  document_data_snapshot_json: Record<string, unknown> | null;
};

type QuotationItemRow = {
  id: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  amount_before_tax: number | string | null;
  vat_amount: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type ClientRow = { id: string; name: string | null; tax_id: string | null; email: string | null; phone: string | null; address: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };

type PdfData = {
  quotation: QuotationRow;
  items: QuotationItemRow[];
  client: ClientRow | null;
  caseItem: CaseRow | null;
  matter: MatterRow | null;
  company: CompanyProfile;
  signer: { name: string; position: string; email: string };
  logoDataUri: string | null;
  signatureDataUri: string | null;
};

type AssetStorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresIn: number) => Promise<{
        data: { signedUrl: string } | null;
        error: unknown;
      }>;
    };
  };
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return safeError("Unauthorized", 401);

    const quotationId = (await context.params).id;
    if (!isUuid(quotationId)) return safeError("Quotation not found.", 404);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Quotation PDF configuration is incomplete");
      return safeError("Unable to generate quotation PDF.", 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return safeError("Unauthorized", 401);

    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("active, role, financial_access, can_submit_expense_claim, can_view_own_expense_claims, can_view_all_expense_claims, can_view_company_ledger, can_view_lawyer_compensation")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileData?.active !== true || !buildPermissions(profileData).canViewFinanceQuotations) return safeError("Forbidden", 403);

    const quotationRes = await supabase
      .from("finance_quotations")
      .select("*")
      .eq("id", quotationId)
      .maybeSingle();
    if (quotationRes.error || !quotationRes.data) {
      if (quotationRes.error) console.error("Unable to load quotation PDF", quotationRes.error);
      return safeError("Quotation not found.", 404);
    }

    const quotation = quotationRes.data as QuotationRow;
    const [itemsRes, clientRes, caseRes, matterRes, companyRes, signersRes] = await Promise.all([
      supabase.from("finance_quotation_items").select("*").eq("quotation_id", quotationId).order("sort_order", { ascending: true }),
      quotation.client_id
        ? supabase.from("clients").select("id, name, tax_id, email, phone, address").eq("id", quotation.client_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      quotation.case_id
        ? supabase.from("cases").select("id, file_no, title, client_name").eq("id", quotation.case_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      quotation.advisory_matter_id
        ? supabase.from("advisory_matters").select("id, matter_no, title").eq("id", quotation.advisory_matter_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("finance_company_profiles").select("*").eq("id", "default").maybeSingle(),
      supabase.from("finance_authorized_signers").select("*").order("sort_order", { ascending: true }),
    ]);

    if (itemsRes.error) {
      console.error("Unable to load quotation PDF items", itemsRes.error);
      return safeError("Unable to generate quotation PDF.", 500);
    }

    for (const [name, result] of [["client", clientRes], ["case", caseRes], ["advisory matter", matterRes], ["company profile", companyRes], ["signers", signersRes]] as const) {
      if (result.error) console.warn(`Unable to load quotation PDF ${name}`, result.error);
    }

    const snapshot = objectOrEmpty(quotation.document_data_snapshot_json);
    const companySnapshot = objectOrNull(snapshot.company_profile) as DbCompanyProfile | null;
    const currentCompany = normalizeCompanyProfile((companyRes.data || null) as DbCompanyProfile | null);
    const company = resolveCompanyProfile(companySnapshot, currentCompany);
    const signerSnapshot = objectOrEmpty(snapshot.authorized_signer);
    const signers = signersRes.error
      ? AUTHORIZED_SIGNERS
      : ((signersRes.data || []) as DbAuthorizedSigner[]).map(normalizeAuthorizedSigner).filter((signer) => signer.key);
    const activeSigners = signers.length > 0 ? signers : AUTHORIZED_SIGNERS;
    const currentSigner = getSignerByKey(activeSigners, quotation.authorized_signer_key);
    const signer = {
      name: quotation.authorized_signer_name || textValue(signerSnapshot.name) || currentSigner.displayName,
      position: quotation.authorized_signer_position || textValue(signerSnapshot.position) || formatSignerPosition(currentSigner),
      email: quotation.authorized_signer_email || textValue(signerSnapshot.email) || currentSigner.email,
    };

    const logoPath = textValue(companySnapshot?.logo_storage_path) || currentCompany.logoStoragePath || "";
    const signaturePath = textValue(signerSnapshot.signature_storage_path) || currentSigner.signatureStoragePath || "";
    const [logoDataUri, signatureDataUri] = await Promise.all([
      loadPrivateImage(supabase, logoPath, "company/logo/"),
      loadPrivateImage(supabase, signaturePath, "signers/"),
    ]);

    const pdfData: PdfData = {
      quotation,
      items: (itemsRes.data || []) as QuotationItemRow[],
      client: (clientRes.data || null) as ClientRow | null,
      caseItem: (caseRes.data || null) as CaseRow | null,
      matter: (matterRes.data || null) as MatterRow | null,
      company,
      signer,
      logoDataUri,
      signatureDataUri,
    };
    const pdf = await renderToBuffer(
      createElement(QuotationPdfDocument, { data: pdfData }) as Parameters<typeof renderToBuffer>[0],
    );
    const filename = `${safeFilename(quotation.quotation_no || "quotation")}.pdf`;

    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Quotation PDF generation failed", error);
    return safeError("Unable to generate quotation PDF.", 500);
  }
}

function QuotationPdfDocument({ data }: { data: PdfData }) {
  const { quotation, items, client, caseItem, matter, company, signer, logoDataUri, signatureDataUri } = data;
  const documentSnapshot = objectOrEmpty(quotation.document_data_snapshot_json);
  const scope = textValue(documentSnapshot.scope_of_legal_services) || cleanText(quotation.scope_of_legal_services) || getMatterDescription(quotation, caseItem, matter);
  const included = textValue(documentSnapshot.included_services) || cleanText(quotation.included_services);
  const excluded = textValue(documentSnapshot.excluded_services) || cleanText(quotation.excluded_services);
  const clientSnapshot = objectOrEmpty(quotation.client_snapshot_json);

  return createElement(
    Document,
    { title: quotation.quotation_no || "Quotation", author: company.companyNameEn, subject: "Quotation", language: "th-TH" },
    createElement(
      Page,
      { size: "A4", style: pdfStyles.page },
      createElement(View, { style: pdfStyles.header },
        createElement(View, { style: pdfStyles.providerBrand },
          logoDataUri
            ? createElement(Image, { src: logoDataUri, style: pdfStyles.logo })
            : createElement(View, { style: pdfStyles.logoFallback }, createElement(Text, null, "VP")),
          createElement(View, null,
            createElement(Text, { style: pdfStyles.companyTh }, company.companyNameTh),
            createElement(Text, { style: pdfStyles.companyEn }, company.companyNameEn),
            createElement(Text, { style: pdfStyles.muted }, company.description),
          ),
        ),
        createElement(View, { style: pdfStyles.titleBlock },
          createElement(Text, { style: pdfStyles.title }, "ใบเสนอราคา"),
          createElement(Text, { style: pdfStyles.subtitle }, "Quotation"),
          createElement(Text, { style: [pdfStyles.status, statusStyle(quotation.status)] }, quotation.status || "draft"),
        ),
      ),
      createElement(View, { style: pdfStyles.mainDivider }),
      createElement(View, { style: pdfStyles.twoColumns, minPresenceAhead: 80 },
        createElement(InfoPanel, { title: "ผู้ให้บริการ / Service Provider", lines: [
          ["Company", company.companyNameTh],
          ["English Name", company.companyNameEn],
          ["Tax ID", `${company.taxId}${company.branchLabel ? ` (${company.branchLabel})` : ""}`],
          ["Address", company.addressTh], ["Phone", company.phone], ["Email", company.email], ["Website", company.website],
        ] }),
        createElement(InfoPanel, { title: "ข้อมูลเอกสาร / Document Information", lines: [
          ["Quotation No.", quotation.quotation_no || "-", true], ["Status", quotation.status || "draft"],
          ["Issue Date", formatDate(quotation.issue_date)], ["Valid Until", formatDate(quotation.valid_until)],
          ["Reference / Linked Matter", getMatterLabel(quotation, caseItem, matter)],
        ] }),
      ),
      createElement(InfoPanel, { title: "ลูกค้า / Client", fullWidth: true, hideEmptyValues: true, lines: [
        ["Client Name", textValue(clientSnapshot.name) || client?.name || quotation.client_id || "-"],
        ["Tax ID", textValue(clientSnapshot.tax_id) || client?.tax_id || "-"],
        ["Phone", textValue(clientSnapshot.phone) || client?.phone || "-"],
        ["Email", textValue(clientSnapshot.email) || client?.email || "-"],
        ["Address", textValue(clientSnapshot.address) || client?.address || "-"],
      ] }),
      createElement(DocumentTextSection, { title: "ขอบเขตงาน / Scope of Legal Services", value: scope || "-" }),
      included ? createElement(DocumentTextSection, { title: "งานที่รวมอยู่ในค่าบริการ / Included Services", value: included }) : null,
      excluded ? createElement(DocumentTextSection, { title: "งานหรือค่าใช้จ่ายที่ไม่รวม / Excluded Services", value: excluded }) : null,
      createElement(View, { style: pdfStyles.section, minPresenceAhead: 78 },
        createElement(SectionHeading, { title: "รายการค่าบริการ / Fee Items" }),
        createElement(View, { style: pdfStyles.table },
          createElement(View, { style: [pdfStyles.tableRow, pdfStyles.tableHeader] },
            createElement(TableCell, { value: "No.", style: pdfStyles.cellNo, header: true }),
            createElement(TableCell, { value: "Description", style: pdfStyles.cellDescription, header: true }),
            createElement(TableCell, { value: "Qty", style: pdfStyles.cellQuantity, right: true, header: true }),
            createElement(TableCell, { value: "Unit Price", style: pdfStyles.cellMoney, right: true, header: true }),
            createElement(TableCell, { value: "VAT", style: pdfStyles.cellMoney, right: true, header: true }),
            createElement(TableCell, { value: "Before Tax", style: pdfStyles.cellMoney, right: true, header: true }),
            createElement(TableCell, { value: "Total", style: pdfStyles.cellMoney, right: true, header: true }),
          ),
          ...(items.length > 0
            ? items.map((item, index) => createElement(View, { key: item.id || index, style: pdfStyles.tableRow, wrap: false },
              createElement(TableCell, { value: String(index + 1), style: pdfStyles.cellNo }),
              createElement(TableCell, { value: item.description || "-", style: pdfStyles.cellDescription }),
              createElement(TableCell, { value: formatQuantity(item.quantity), style: pdfStyles.cellQuantity, right: true }),
              createElement(TableCell, { value: formatMoney(item.unit_price), style: pdfStyles.cellMoney, right: true }),
              createElement(TableCell, { value: formatMoney(item.vat_amount), style: pdfStyles.cellMoney, right: true }),
              createElement(TableCell, { value: formatMoney(item.amount_before_tax), style: pdfStyles.cellMoney, right: true }),
              createElement(TableCell, { value: formatMoney(item.line_total), style: pdfStyles.cellMoney, right: true }),
            ))
            : [createElement(View, { key: "empty", style: pdfStyles.tableRow }, createElement(TableCell, { value: "No line items.", style: [pdfStyles.cellDescription, { width: "100%" }] }))]),
        ),
      ),
      createElement(View, { style: pdfStyles.bottomGrid },
        createElement(View, { style: pdfStyles.termsBox },
          createElement(SectionHeading, { title: "หมายเหตุและเงื่อนไข / Notes and Conditions" }),
          quotation.note ? createElement(Text, { style: pdfStyles.note }, quotation.note) : null,
          createElement(Text, { style: pdfStyles.term }, "• ใบเสนอราคานี้ไม่ใช่ใบแจ้งหนี้หรือใบเสร็จรับเงิน"),
          createElement(Text, { style: pdfStyles.term }, "• ค่าธรรมเนียมศาล ค่าธรรมเนียมราชการ ค่าเดินทาง ค่าที่พัก ค่าถ่ายเอกสาร ค่าจัดส่ง ค่าแปลเอกสาร และค่าใช้จ่ายนอกกระเป๋าอื่น ๆ ไม่รวมอยู่ในใบเสนอราคานี้ เว้นแต่ระบุไว้โดยชัดแจ้ง"),
          createElement(Text, { style: pdfStyles.term }, "• การเริ่มงานขึ้นอยู่กับการยืนยันจากลูกความและ/หรือเงื่อนไขการชำระเงินที่คู่สัญญาตกลงกัน"),
          createElement(Text, { style: pdfStyles.term }, "• ใบเสนอราคานี้มีผลถึงวันที่ Valid Until ที่ระบุไว้ข้างต้น"),
        ),
        createElement(View, { style: pdfStyles.totalBox, wrap: false },
          createElement(TotalLine, { label: "รวมรายการที่มี VAT / Vatable Subtotal", value: quotation.subtotal_vatable }),
          createElement(TotalLine, { label: "รวมรายการที่ไม่มี VAT / Non-Vatable Subtotal", value: quotation.subtotal_non_vatable }),
          createElement(TotalLine, { label: "ภาษีมูลค่าเพิ่ม / VAT", value: quotation.vat_amount }),
          createElement(TotalLine, { label: "จำนวนเงินตามใบเสนอราคา / Quotation Total", value: quotation.grand_total, strong: true }),
        ),
      ),
      createElement(View, { style: pdfStyles.signatureGrid, wrap: false },
        createElement(SignatureBlock, { title: "ผู้เสนอราคา / Service Provider", name: signer.name, position: signer.position, email: signer.email, signatureDataUri }),
        createElement(SignatureBlock, { title: "ผู้ยอมรับใบเสนอราคา / Client Acceptance", name: "____________________", position: "____________________", email: "", signatureDataUri: null }),
      ),
    ),
  );
}

function InfoPanel({ title, lines, fullWidth = false, hideEmptyValues = false }: { title: string; lines: [string, string, boolean?][]; fullWidth?: boolean; hideEmptyValues?: boolean }) {
  const visibleLines = hideEmptyValues
    ? lines.filter(([label, value]) => label === "Client Name" || hasDisplayValue(value))
    : lines;

  return createElement(View, { style: fullWidth ? [pdfStyles.panel, pdfStyles.fullWidthPanel] : pdfStyles.panel },
    createElement(SectionHeading, { title }),
    ...visibleLines.map(([label, value, strong]) => createElement(View, { key: label, style: pdfStyles.infoLine },
      createElement(Text, { style: pdfStyles.infoLabel }, label),
      createElement(Text, { style: strong ? pdfStyles.infoValueStrong : pdfStyles.infoValue }, value || "-"),
    )),
  );
}

function DocumentTextSection({ title, value }: { title: string; value: string }) {
  return createElement(View, { style: pdfStyles.section, minPresenceAhead: 42 },
    createElement(SectionHeading, { title }),
    createElement(Text, { style: pdfStyles.documentText }, value),
  );
}

function SectionHeading({ title }: { title: string }) {
  return createElement(View, { style: pdfStyles.sectionHeading },
    createElement(Text, { style: pdfStyles.sectionHeadingText }, title),
    createElement(View, { style: pdfStyles.sectionDivider }),
  );
}

function TableCell({ value, style, right = false, header = false }: { value: string; style: Style | Style[]; right?: boolean; header?: boolean }) {
  const styles = [pdfStyles.tableCell, style, header ? pdfStyles.tableHeaderText : null, right ? pdfStyles.rightText : null].filter(Boolean);
  return createElement(Text, { style: styles as never }, value);
}

function TotalLine({ label, value, strong = false }: { label: string; value: number | string | null; strong?: boolean }) {
  return createElement(View, { style: strong ? pdfStyles.totalStrongLine : pdfStyles.totalLine },
    createElement(Text, { style: strong ? pdfStyles.totalStrongLabel : pdfStyles.totalLabel }, label),
    createElement(Text, { style: strong ? pdfStyles.totalStrongValue : pdfStyles.totalValue }, formatMoney(value)),
  );
}

function SignatureBlock({ title, name, position, email, signatureDataUri }: { title: string; name: string; position: string; email: string; signatureDataUri: string | null }) {
  return createElement(View, { style: pdfStyles.signatureBlock },
    createElement(Text, { style: pdfStyles.signatureTitle }, title),
    signatureDataUri ? createElement(Image, { src: signatureDataUri, style: pdfStyles.signatureImage }) : createElement(View, { style: pdfStyles.signatureSpacer }),
    createElement(View, { style: pdfStyles.signatureLine }),
    createElement(Text, { style: pdfStyles.signatureName }, `Name: ${name}`),
    createElement(Text, { style: pdfStyles.signatureText }, `Position: ${position}`),
    email ? createElement(Text, { style: pdfStyles.signatureText }, `Email: ${email}`) : null,
    createElement(Text, { style: pdfStyles.signatureText }, "Date: ____________________"),
  );
}

async function loadPrivateImage(supabase: AssetStorageClient, path: string, requiredPrefix: string) {
  if (!isSafeAssetPath(path, requiredPrefix)) return null;
  try {
    const { data, error } = await supabase.storage.from("vp-document-assets").createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) return null;
    const response = await fetch(data.signedUrl, { signal: AbortSignal.timeout(10_000) });
    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() || "";
    if (!response.ok || !["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(contentType)) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) return null;
    const source = Buffer.from(bytes);
    const image = contentType === "image/png" || contentType === "image/jpeg"
      ? { contentType, bytes: source }
      : { contentType: "image/png", bytes: await sharp(source, { limitInputPixels: 16_000_000 }).png().toBuffer() };
    return `data:${image.contentType};base64,${image.bytes.toString("base64")}`;
  } catch (error) {
    console.warn("Unable to load private quotation PDF asset", error);
    return null;
  }
}

function resolveCompanyProfile(snapshot: DbCompanyProfile | null, current: CompanyProfile) {
  if (!snapshot) return current;
  return normalizeCompanyProfile({
    company_name_th: textValue(snapshot.company_name_th) || current.companyNameTh,
    company_name_en: textValue(snapshot.company_name_en) || current.companyNameEn,
    tax_id: textValue(snapshot.tax_id) || current.taxId,
    branch_label: textValue(snapshot.branch_label) || current.branchLabel,
    address_th: textValue(snapshot.address_th) || current.addressTh,
    phone: textValue(snapshot.phone) || current.phone,
    email: textValue(snapshot.email) || current.email,
    website: textValue(snapshot.website) || current.website,
    description: textValue(snapshot.description) || current.description,
    quotation_prefix: textValue(snapshot.quotation_prefix) || current.quotationPrefix,
    logo_storage_path: textValue(snapshot.logo_storage_path) || current.logoStoragePath || null,
  });
}

function getMatterLabel(quotation: QuotationRow, caseItem: CaseRow | null, matter: MatterRow | null) {
  const snapshot = objectOrEmpty(quotation.matter_snapshot_json);
  if (textValue(snapshot.type) === "case") return [textValue(snapshot.file_no), textValue(snapshot.title)].filter(Boolean).join(" - ") || String(quotation.case_id || "Case");
  if (textValue(snapshot.type) === "advisory") return [textValue(snapshot.matter_no), textValue(snapshot.title)].filter(Boolean).join(" - ") || String(quotation.advisory_matter_id || "Advisory");
  if (caseItem) return [caseItem.file_no, caseItem.title || caseItem.client_name].filter(Boolean).join(" - ") || String(caseItem.id);
  if (matter) return [matter.matter_no, matter.title].filter(Boolean).join(" - ") || matter.id;
  return quotation.case_id ? `Case: ${quotation.case_id}` : quotation.advisory_matter_id ? `Advisory: ${quotation.advisory_matter_id}` : "-";
}

function getMatterDescription(quotation: QuotationRow, caseItem: CaseRow | null, matter: MatterRow | null) {
  const snapshot = objectOrEmpty(quotation.matter_snapshot_json);
  return textValue(snapshot.title) || caseItem?.title || matter?.title || "";
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function objectOrNull(value: unknown) {
  const object = objectOrEmpty(value);
  return Object.keys(object).length > 0 ? object : null;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value: string | null) {
  return value?.trim() || "";
}

function hasDisplayValue(value: string) {
  return Boolean(value.trim()) && value.trim() !== "-";
}

function formatMoney(value: number | string | null) {
  return `${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}

function formatQuantity(value: number | string | null) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusStyle(status: string | null) {
  const normalized = String(status || "draft").toLowerCase();
  if (normalized === "sent") return { color: "#1e40af", backgroundColor: "#dbeafe", borderColor: "#93c5fd" };
  if (normalized === "accepted") return { color: "#166534", backgroundColor: "#dcfce7", borderColor: "#86efac" };
  if (normalized === "cancelled") return { color: "#991b1b", backgroundColor: "#fee2e2", borderColor: "#fca5a5" };
  return { color: "#374151", backgroundColor: "#f3f4f6", borderColor: "#d1d5db" };
}

function safeFilename(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[_\.]+/, "");
  return normalized || "quotation";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSafeAssetPath(path: string, prefix: string) {
  return Boolean(path) && path.startsWith(prefix) && !path.includes("..") && !path.startsWith("/");
}

function safeError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

const pdfStyles = StyleSheet.create({
  page: { paddingTop: 32, paddingRight: 34, paddingBottom: 32, paddingLeft: 34, backgroundColor: "#FFFFFF", fontFamily: FONT_FAMILY, fontSize: 9.7, color: "#1F2937", lineHeight: 1.26 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 11 },
  providerBrand: { flexDirection: "row", alignItems: "center", width: "58%", minWidth: 0, flexShrink: 1, paddingRight: 16 },
  logo: { width: 42, height: 42, objectFit: "contain", marginRight: 10, flexShrink: 0 },
  logoFallback: { width: 42, height: 42, marginRight: 10, borderWidth: 1.5, borderColor: "#15803D", borderRadius: 4, color: "#15803D", justifyContent: "center", alignItems: "center", fontSize: 17, fontWeight: 700, flexShrink: 0 },
  companyTh: { fontSize: 13.2, fontWeight: 700, lineHeight: 1.16 }, companyEn: { fontSize: 10, fontWeight: 700, lineHeight: 1.16 }, muted: { marginTop: 1.5, color: "#6B7280", fontSize: 8.4, fontWeight: 400, lineHeight: 1.24 },
  titleBlock: { width: "42%", minWidth: 0, flexShrink: 1, alignItems: "flex-end" }, title: { color: "#15803D", fontSize: 21, fontWeight: 700, lineHeight: 1.15 }, subtitle: { color: "#6B7280", fontSize: 10.4, marginTop: 2, lineHeight: 1.2 },
  status: { marginTop: 5, borderWidth: 1, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7, fontSize: 8.2, lineHeight: 1.2, textTransform: "capitalize" },
  mainDivider: { borderBottomWidth: 2, borderBottomColor: "#16A344", marginBottom: 12 },
  twoColumns: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 }, panel: { flexGrow: 1, flexBasis: 0, minWidth: 0, flexShrink: 1, borderWidth: 1, borderColor: "#E5E7EB", padding: 7, borderRadius: 3 }, fullWidthPanel: { width: "100%", flexGrow: 0, marginBottom: 16 },
  sectionHeading: { marginBottom: 7 }, sectionHeadingText: { fontSize: 10.4, fontWeight: 700, color: "#15803D", lineHeight: 1.16 }, sectionDivider: { borderBottomWidth: 1, borderBottomColor: "#DCFCE7", marginTop: 2 },
  infoLine: { flexDirection: "row", alignItems: "flex-start", marginBottom: 2, gap: 5, minWidth: 0 }, infoLabel: { color: "#6B7280", width: "31%", flexShrink: 0, fontSize: 9.2, fontWeight: 400, lineHeight: 1.24 }, infoValue: { width: "69%", flexGrow: 1, flexShrink: 1, minWidth: 0, fontSize: 9.4, fontWeight: 400, lineHeight: 1.26 }, infoValueStrong: { width: "69%", flexGrow: 1, flexShrink: 1, minWidth: 0, fontSize: 9.4, fontWeight: 700, lineHeight: 1.26 },
  section: { marginBottom: 16 }, documentText: { whiteSpace: "pre-wrap", lineHeight: 1.32, color: "#374151", fontWeight: 400 },
  table: { borderWidth: 1, borderColor: "#E5E7EB" }, tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E5E7EB", alignItems: "stretch", minWidth: 0 }, tableHeader: { backgroundColor: "#F0FDF4", borderBottomColor: "#BBF7D0" }, tableCell: { paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 8.1, lineHeight: 1.25, fontWeight: 400, minWidth: 0 }, tableHeaderText: { fontWeight: 700, color: "#15803D" }, cellNo: { width: "5%" }, cellDescription: { width: "31%" }, cellQuantity: { width: "8%" }, cellMoney: { width: "14%" }, rightText: { textAlign: "right" },
  bottomGrid: { flexDirection: "row", gap: 12, marginTop: 1, marginBottom: 16 }, termsBox: { flexGrow: 1.35, flexBasis: 0, minWidth: 0, flexShrink: 1, borderWidth: 1, borderColor: "#E5E7EB", padding: 7, borderRadius: 3 }, note: { marginBottom: 4, whiteSpace: "pre-wrap", lineHeight: 1.32, fontWeight: 400 }, term: { fontSize: 8.3, lineHeight: 1.3, fontWeight: 400, marginBottom: 1.5 },
  totalBox: { flexGrow: 0.85, flexBasis: 0, minWidth: 0, flexShrink: 1, borderWidth: 1, borderColor: "#86EFAC", backgroundColor: "#F0FDF4", padding: 8, borderRadius: 3 }, totalLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 7, paddingVertical: 1.5 }, totalLabel: { fontSize: 8.3, fontWeight: 400, color: "#374151", maxWidth: "65%", lineHeight: 1.24 }, totalValue: { fontSize: 8.3, fontWeight: 400, textAlign: "right", lineHeight: 1.24 }, totalStrongLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 7, paddingTop: 5, marginTop: 2.5, borderTopWidth: 1.5, borderTopColor: "#16A344" }, totalStrongLabel: { fontSize: 9.6, fontWeight: 700, color: "#15803D", maxWidth: "62%", lineHeight: 1.25 }, totalStrongValue: { fontSize: 9.8, fontWeight: 700, color: "#15803D", textAlign: "right", lineHeight: 1.25 },
  signatureGrid: { flexDirection: "row", gap: 20, marginTop: 1 }, signatureBlock: { flexGrow: 1, flexBasis: 0, minWidth: 0, flexShrink: 1 }, signatureTitle: { color: "#15803D", fontSize: 9.8, fontWeight: 700, lineHeight: 1.16, marginBottom: 5 }, signatureImage: { width: 106, height: 36, objectFit: "contain", marginBottom: 1 }, signatureSpacer: { height: 36 }, signatureLine: { borderBottomWidth: 1, borderBottomColor: "#6B7280", marginBottom: 3 }, signatureName: { fontSize: 8.6, fontWeight: 700, color: "#374151", lineHeight: 1.24, marginBottom: 1 }, signatureText: { fontSize: 8.3, fontWeight: 400, color: "#374151", lineHeight: 1.24, marginBottom: 1 },
});
