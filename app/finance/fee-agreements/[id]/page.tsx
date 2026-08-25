"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FinanceSubNav, QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";
import {
  type AuthorizedSigner,
  type DbAuthorizedSigner,
  normalizeAuthorizedSigner,
} from "../../../../lib/companyProfile";
import {
  feeAgreementSignatoryContext,
  type FeeAgreementSignatory,
  normalizeFeeAgreementSignatories,
  resequenceFeeAgreementSignatories,
} from "../signatories";
import {
  buildInitialFeeAgreementSignatories,
  type FeeAgreementClientContext,
  FeeAgreementSignatoryEditor,
} from "../signer-editor";
import {
  ResolvedTemplateSections,
  TemplateAgreementChanges,
  resolvedVariableMap,
  templateDisplayName,
} from "../template-sections";
import {
  feeAgreementExecutionModeLabel,
  normalizeFeeAgreementExecutionMode,
} from "../execution";

type Json = Record<string, unknown>;
type Agreement = { id: string; agreement_no: string | null; title: string; client_id: string; case_id: number | null; advisory_matter_id: string | null; source_quotation_id: string | null; source_reference: string | null; status: string; agreement_date: string | null; effective_date: string | null; commencement_date: string | null; expiry_date: string | null; currency: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; billing_method: string; language_code: string; execution_mode: string | null; legal_terms_json: Json | null; signatories_json: unknown[] | null; custom_clauses_json: unknown[] | null; selected_template_version_id: string | null; client_snapshot_json: Json | null; matter_snapshot_json: Json | null; source_document_snapshot_json: Json | null; commercial_terms_snapshot_json: Json | null; allocation_snapshot_json: Json | null; resolved_document_snapshot_json: Json | null; signed_document_snapshot_json: Json | null; document_version: number; updated_at: string };
type Item = { id: string; description: string; quantity: number | string; unit_price: number | string; vat_applicable: boolean; vat_rate: number | string; amount_before_tax: number | string; vat_amount: number | string; line_total: number | string; sort_order: number };
type Quote = { id: string; quotation_no: string; status: string; issue_date: string | null; valid_until: string | null };
type Version = { id: string; version_no: number; event_type: string; reason: string | null; actor_name: string | null; actor_email: string | null; created_at: string };
type Template = { id: string; language_code: string; version_no: number; document_templates?: { name?: string; template_code?: string } | null };
type CustomClause = { title: string; content: string; sort_order: number };
type LegalForm = { language: string; commencementDate: string; templateVersionId: string; scopeClarification: string; clientObligations: string; firmObligations: string; exclusions: string; expenses: string; confidentiality: string; termination: string; dispute: string; additionalTerms: string; internalNote: string; signatories: FeeAgreementSignatory[]; clauses: CustomClause[]; warnings: string[] };
type MetadataForm = { title: string; agreementDate: string; effectiveDate: string; expiryDate: string; billingMethod: string; executionMode: "paper" | "electronic" };
type ClientRow = { id: string; name: string | null; client_type: string | null; contact_name: string | null };

const defaultTitle = "สัญญาว่าจ้างให้บริการทางกฎหมาย";
const statusLabel: Record<string, string> = { draft: "ร่าง", under_review: "อยู่ระหว่างตรวจทาน", sent: "ส่งแล้ว", signed: "ลงนามแล้ว", completed: "เสร็จสมบูรณ์", cancelled: "ยกเลิก", active: "Active เดิม" };
const billingLabel: Record<string, string> = { single: "ชำระงวดเดียว", installments: "ชำระหลายงวด", milestone: "ชำระตามเหตุการณ์", recurring: "ชำระเป็นรอบ", manual: "กำหนดเอง" };
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = "-") => typeof value === "string" && value.trim() ? value : fallback;
const amount = (value: unknown) => Number(value || 0);
const satang = (value: unknown) => Math.round(amount(value) * 100);
const money = (value: unknown, currency = "THB") => `${amount(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "THB" ? "บาท" : currency}`;
const date = (value: unknown) => typeof value === "string" && value ? value.slice(0, 10) : "-";
const isDefaultTitle = (value: string) => !value.trim() || /^Fee Agreement\s*-\s*/i.test(value);
const sourceStatusLabel: Record<string, string> = { accepted: "ตอบรับแล้ว", sent: "ส่งแล้ว", draft: "ร่าง", cancelled: "ยกเลิก", expired: "หมดอายุ" };
const quoteStatus = (status: unknown) => sourceStatusLabel[text(status, "")] || text(status);
const legacyLegalKeys = ["scope_clarification", "client_obligations", "firm_obligations", "exclusions", "expenses_disbursements", "confidentiality", "termination_provisions", "dispute_jurisdiction", "additional_terms"];
const selectStoredDocument = (agreement: Agreement): Json => {
  if (agreement.status === "signed" && agreement.signed_document_snapshot_json) return agreement.signed_document_snapshot_json;
  if (["sent", "signed", "completed", "cancelled"].includes(agreement.status) && agreement.resolved_document_snapshot_json) return agreement.resolved_document_snapshot_json;
  return {};
};
const isGeneratedInstallmentTitle = (value: unknown, installmentNo: number) => { const title = text(value, "").toLowerCase().replace(/\s+/g, " ").trim(); return !title || new RegExp(`^(งวดที่\\s*${installmentNo}|installment\\s*${installmentNo})(\\s*[/—-]\\s*(งวดที่\\s*${installmentNo}|installment\\s*${installmentNo}))?$`, "i").test(title); };
const dueDescription = (installment: Json) => { if (installment.due_date) return `ครบกำหนดวันที่ ${date(installment.due_date)}`; const days = Number(installment.payment_due_days); const period = Number.isFinite(days) && days > 0 ? `ชำระภายใน ${days} วัน` : ""; const trigger = text(installment.trigger_type, ""); if (trigger === "quotation_acceptance") return period ? `${period}นับแต่ลูกค้าตอบรับใบเสนอราคา` : "นับแต่ลูกค้าตอบรับใบเสนอราคา"; if (trigger === "agreement_effective") return period ? `${period}นับแต่สัญญามีผล` : "นับแต่สัญญามีผล"; if (["case_milestone", "recurring_period", "manual"].includes(trigger) && text(installment.trigger_description, "")) return period ? `${period}นับแต่${text(installment.trigger_description)}` : text(installment.trigger_description); return period || text(installment.trigger_description, ""); };

export default function FeeAgreementDetailPage() { return <QuotationGuard>{(access) => <Detail permissions={access.permissions} />}</QuotationGuard>; }

function Detail({ permissions }: { permissions: { canEditFinanceQuotation: boolean } }) {
  const params = useParams(); const id = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const [agreement, setAgreement] = useState<Agreement | null>(null); const [items, setItems] = useState<Item[]>([]); const [quote, setQuote] = useState<Quote | null>(null); const [versions, setVersions] = useState<Version[]>([]); const [templates, setTemplates] = useState<Template[]>([]); const [templateContent, setTemplateContent] = useState<Json>({});
  const [authorizedSigners, setAuthorizedSigners] = useState<AuthorizedSigner[]>([]); const [clientContext, setClientContext] = useState<FeeAgreementClientContext>({ id: "", name: "", clientType: "", contactName: "" });
  const [metadata, setMetadata] = useState<MetadataForm>({ title: "", agreementDate: "", effectiveDate: "", expiryDate: "", billingMethod: "single", executionMode: "paper" }); const [legal, setLegal] = useState<LegalForm>(emptyLegalForm);
  const [savedBaseline, setSavedBaseline] = useState("");
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const [lifecycleSaving, setLifecycleSaving] = useState(false); const [message, setMessage] = useState("");
  const saveLock = useRef(false);
  const editable = Boolean(agreement && permissions.canEditFinanceQuotation && ["draft", "under_review"].includes(agreement.status));
  const dirty = Boolean(agreement && savedBaseline && agreementFingerprint(metadata, legal, agreement) !== savedBaseline);

  const load = useCallback(async () => {
    if (!id) { setError("ไม่พบสัญญาว่าจ้าง"); setLoading(false); return; }
    setLoading(true); setError("");
    const header = await supabase.from("finance_fee_agreements").select("id,agreement_no,title,client_id,case_id,advisory_matter_id,source_quotation_id,source_reference,status,agreement_date,effective_date,commencement_date,expiry_date,currency,amount_before_tax,vat_amount,total_amount,billing_method,language_code,execution_mode,legal_terms_json,signatories_json,custom_clauses_json,selected_template_version_id,client_snapshot_json,matter_snapshot_json,source_document_snapshot_json,commercial_terms_snapshot_json,allocation_snapshot_json,resolved_document_snapshot_json,signed_document_snapshot_json,document_version,updated_at").eq("id", id).maybeSingle();
    if (header.error || !header.data) { setError(header.error ? "ไม่สามารถโหลดสัญญาว่าจ้างได้" : "ไม่พบสัญญาว่าจ้าง"); setLoading(false); return; }
    const row = header.data as Agreement;
    const storedDocument = selectStoredDocument(row);
    const storedTemplate = object(storedDocument.template);
    const [itemRes, quoteRes, versionRes, templateRes, templateContentRes, signerRes, clientRes] = await Promise.all([
      supabase.from("finance_fee_agreement_items").select("id,description,quantity,unit_price,vat_applicable,vat_rate,amount_before_tax,vat_amount,line_total,sort_order").eq("fee_agreement_id", id).order("sort_order").order("id"),
      row.source_quotation_id ? supabase.from("finance_quotations").select("id,quotation_no,status,issue_date,valid_until").eq("id", row.source_quotation_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("finance_fee_agreement_versions").select("id,version_no,event_type,reason,actor_name,actor_email,created_at").eq("fee_agreement_id", id).order("version_no", { ascending: false }),
      supabase.from("document_template_versions").select("id,language_code,version_no,document_templates!inner(name,template_code,document_type)").eq("status", "published").eq("document_templates.document_type", "fee_agreement").order("version_no", { ascending: false }),
      row.selected_template_version_id && ["draft", "under_review"].includes(row.status)
        ? supabase.rpc("get_finance_fee_agreement_template_preview", { p_fee_agreement_id: id })
        : Promise.resolve({ data: storedTemplate, error: null }),
      supabase.from("finance_authorized_signers").select("id,signer_key,display_name,nickname,position_th,position_en,email,signature_storage_path,is_active,is_default,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
      row.client_id ? supabase.from("clients").select("id,name,client_type,contact_name").eq("id", row.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (itemRes.error || quoteRes.error || versionRes.error || templateRes.error || templateContentRes.error || signerRes.error || clientRes.error) setError("โหลดข้อมูลบางส่วนไม่สำเร็จ กรุณารีเฟรชอีกครั้ง");
    if (signerRes.error) console.error("Failed to load authorized signers", signerRes.error);
    const activeSigners = signerRes.error ? [] : ((signerRes.data || []) as DbAuthorizedSigner[]).map(normalizeAuthorizedSigner).filter((signer) => signer.key && signer.isActive !== false);
    const currentClient = (clientRes.data || null) as ClientRow | null;
    const clientSnapshot = object(row.client_snapshot_json);
    const nextClientContext = {
      id: row.client_id,
      name: text(clientSnapshot.name, text(clientSnapshot.display_name, currentClient?.name || "")),
      clientType: text(clientSnapshot.client_type, currentClient?.client_type || ""),
      contactName: currentClient?.contact_name || "",
    };
    const nextMetadata = { title: isDefaultTitle(row.title) ? defaultTitle : row.title, agreementDate: row.agreement_date || "", effectiveDate: row.effective_date || "", expiryDate: row.expiry_date || "", billingMethod: row.billing_method, executionMode: normalizeFeeAgreementExecutionMode(row.execution_mode) };
    const nextLegal = legalFrom(row);
    const proposedSignatories = nextLegal.signatories.length ? nextLegal.signatories : buildInitialFeeAgreementSignatories(nextClientContext, activeSigners);
    setAgreement(row); setItems((itemRes.data || []) as Item[]); setQuote((quoteRes.data || null) as Quote | null); setVersions((versionRes.data || []) as Version[]); setTemplates((templateRes.data || []) as Template[]);
    setTemplateContent(object(templateContentRes.data)); setAuthorizedSigners(activeSigners); setClientContext(nextClientContext);
    setMetadata(nextMetadata); setLegal({ ...nextLegal, signatories: proposedSignatories });
    setSavedBaseline(agreementFingerprint(nextMetadata, nextLegal, row)); setLoading(false);
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const setMeta = (next: MetadataForm) => { setMetadata(next); };
  const setLegalForm = (next: LegalForm) => { setLegal(next); };
  const saveAgreement = async () => {
    if (!agreement || !editable || saveLock.current) return;
    if (!dirty) { setMessage("ไม่มีการเปลี่ยนแปลงที่ต้องบันทึก"); return; }
    if (!metadata.title.trim()) { setError("กรุณาระบุชื่อสัญญา"); return; }
    if (metadata.effectiveDate && metadata.expiryDate && metadata.expiryDate < metadata.effectiveDate) { setError("วันที่สิ้นสุดต้องไม่ก่อนวันที่มีผล"); return; }
    const templateSelected = Boolean(legal.templateVersionId);
    const signatoryError = validateSignatories(legal.signatories, clientContext); const clauseError = templateSelected ? "" : validateClauses(legal.clauses);
    if (signatoryError || clauseError) { setError(signatoryError || clauseError || ""); return; }
    const payload = agreementSavePayload(metadata, legal, agreement);
    saveLock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("save_finance_fee_agreement_draft_atomic", { p_fee_agreement_id: agreement.id, ...payload });
      if (result.error) setError(mapRpcError(result.error.message));
      else { await load(); setMessage("บันทึกการเปลี่ยนแปลงแล้ว"); }
    } catch (saveError) {
      console.error("Failed to save fee agreement draft", saveError);
      setError("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองอีกครั้ง");
    } finally {
      saveLock.current = false; setSaving(false);
    }
  };
  const changeStatus = async (next: "under_review" | "sent" | "signed" | "completed" | "cancelled") => {
    if (!agreement || !permissions.canEditFinanceQuotation || lifecycleSaving) return;
    if (dirty) { setError("กรุณาบันทึกการเปลี่ยนแปลงก่อนส่งตรวจทาน"); return; }
    if (next === "sent" && readinessIssues.length) { setError("ยังไม่สามารถส่งเอกสารให้ลูกค้าได้ กรุณาตรวจสอบรายการที่แสดงในส่วนสถานะเอกสาร"); return; }
    if (!window.confirm(lifecycleConfirmation(next))) return;
    setLifecycleSaving(true); setError(""); setMessage("");
    const result = await supabase.rpc("set_finance_fee_agreement_status", { p_fee_agreement_id: agreement.id, p_next_status: next });
    if (result.error) setError(mapRpcError(result.error.message)); else { await load(); setMessage(`อัปเดตสถานะเป็น ${statusLabel[next]} และบันทึกเวอร์ชันแล้ว`); }
    setLifecycleSaving(false);
  };
  const mismatch = useMemo(() => agreement ? satang(items.reduce((sum, item) => sum + amount(item.line_total), 0)) !== satang(agreement.total_amount) : false, [agreement, items]);
  const templateMode = Boolean(legal.templateVersionId);
  const templateContentMatchesSelection = templateMode && text(templateContent.template_version_id, "") === legal.templateVersionId;
  const selectedTemplate = templates.find((template) => template.id === legal.templateVersionId);
  const selectedTemplateName = templateContentMatchesSelection
    ? templateDisplayName(templateContent)
    : selectedTemplate
      ? `${selectedTemplate.document_templates?.template_code || "Template"} v${selectedTemplate.version_no} — ${selectedTemplate.document_templates?.name || ""}`
      : "Template ที่เลือก";
  const hiddenLegacyWording = agreement ? legacyLegalKeys.some((key) => text(object(agreement.legal_terms_json)[key], "") !== "") : false;
  const hiddenLegacyClauses = Boolean(agreement && array(agreement.custom_clauses_json).length);
  const templateVariables = resolvedVariableMap(templateContent.variables);
  const signatureRequirements = templateContentMatchesSelection ? object(templateContent.signature_requirements) : {};
  const minimumClientSigners = templateContentMatchesSelection ? Math.max(0, Number(signatureRequirements.minimum_client_signers || 0)) : 1;
  const minimumFirmSigners = templateContentMatchesSelection ? Math.max(0, Number(signatureRequirements.minimum_firm_signers || 0)) : 1;
  const minimumWitnesses = templateContentMatchesSelection ? Math.max(signatureRequirements.witness_required === true ? 1 : 0, Number(signatureRequirements.minimum_witnesses || 0)) : 0;
  const effectiveSignatureRequirements = { ...signatureRequirements, minimum_client_signers: minimumClientSigners, minimum_firm_signers: minimumFirmSigners, minimum_witnesses: minimumWitnesses };
  const readinessIssues = (() => {
    if (!agreement) return [] as string[];
    const issues: string[] = [];
    const signatories = legal.signatories;
    const coreTerms = [legal.scopeClarification, legal.clientObligations, legal.firmObligations, legal.confidentiality, legal.termination, legal.dispute];
    if (dirty) issues.push("บันทึกข้อมูลที่แก้ไขก่อนส่งเอกสาร");
    if (!agreement.title.trim()) issues.push("ระบุชื่อสัญญา");
    if (!text(agreement.client_snapshot_json?.name, text(agreement.client_snapshot_json?.display_name, ""))) issues.push("ตรวจสอบข้อมูลลูกค้า");
    if (!agreement.agreement_no) issues.push("ตรวจสอบเลขที่สัญญา");
    if (!agreement.agreement_date) issues.push("ระบุวันที่ทำสัญญา");
    if (!items.length) issues.push("เพิ่มรายการค่าบริการอย่างน้อย 1 รายการ");
    if (!Number.isFinite(amount(agreement.total_amount)) || amount(agreement.total_amount) < 0) issues.push("ตรวจสอบจำนวนเงินตามสัญญา");
    if (mismatch) issues.push("ตรวจสอบยอดรวมรายการค่าบริการ");
    if (!agreement.language_code) issues.push("เลือกภาษาเอกสาร");
    if (!agreement.effective_date) issues.push("ระบุวันที่มีผล");
    const namedSigners = (partyType: "client" | "firm" | "witness") => signatories.filter((row) => row.party_type === partyType && row.name.trim()).length;
    if (namedSigners("client") < minimumClientSigners) issues.push(`เพิ่มผู้ลงนามฝ่ายลูกค้าอย่างน้อย ${minimumClientSigners} คน`);
    if (namedSigners("firm") < minimumFirmSigners) issues.push(`เพิ่มผู้ลงนามฝ่ายสำนักงานอย่างน้อย ${minimumFirmSigners} คน`);
    if (namedSigners("witness") < minimumWitnesses) issues.push(`เพิ่มพยานอย่างน้อย ${minimumWitnesses} คน`);
    if (!legal.templateVersionId && !coreTerms.some((value) => value.trim())) issues.push("กรอกข้อกำหนดหลักของสัญญา หรือเลือก Template ที่เผยแพร่แล้ว");
    return issues;
  })();
  if (loading) return <main style={page}>กำลังโหลดสัญญาว่าจ้าง...</main>; if (!agreement) return <main style={page}>{error || "ไม่พบสัญญาว่าจ้าง"}</main>;
  const source = object(agreement.source_document_snapshot_json); const commercialSnapshot = object(agreement.commercial_terms_snapshot_json); const commercial = object(commercialSnapshot.commercial); const sourceQuotationNo = text(source.quotation_no, quote?.quotation_no || text(agreement.source_reference)); const client = text(agreement.client_snapshot_json?.name, text(agreement.client_snapshot_json?.display_name)); const matter = text(agreement.matter_snapshot_json?.title, text(agreement.matter_snapshot_json?.file_no, agreement.case_id || agreement.advisory_matter_id ? "-" : "เรื่องของลูกค้า")); const title = isDefaultTitle(agreement.title) ? defaultTitle : agreement.title;
  const availableLifecycleActions = lifecycleActions(agreement.status);
  const forwardLifecycleActions = availableLifecycleActions.filter((action) => action.status !== "cancelled");
  const destructiveLifecycleActions = availableLifecycleActions.filter((action) => action.status === "cancelled");
  return <main style={page}><FinanceSubNav activePage="fee-agreements" permissions={permissions as never} /><nav className="fee-agreement-navigation-toolbar" style={navigationToolbar} aria-label="การนำทางและส่งออกเอกสาร"><div className="fee-agreement-navigation-group" style={navigationGroup}><Link className="fee-agreement-navigation-link fee-agreement-navigation-back" style={{ ...navigationLink, ...navigationBackLink }} href="/finance/fee-agreements"><NavigationIcon name="back" /><span>กลับไปหน้าสัญญาว่าจ้าง</span></Link>{agreement.source_quotation_id ? <Link className="fee-agreement-navigation-link fee-agreement-navigation-source" style={{ ...navigationLink, ...navigationSourceLink }} href={`/finance/quotations/${agreement.source_quotation_id}`}><NavigationIcon name="source" /><span>เปิดใบเสนอราคาต้นทาง</span></Link> : null}</div><div className="fee-agreement-navigation-group fee-agreement-output-group" style={{ ...navigationGroup, ...outputGroup }} aria-label="ดูตัวอย่างและพิมพ์เอกสาร"><Link className="fee-agreement-navigation-link fee-agreement-navigation-preview" style={{ ...navigationLink, ...navigationPreviewLink }} href={`/finance/fee-agreements/${agreement.id}/preview`}><NavigationIcon name="preview" /><span>ดูตัวอย่าง</span></Link><Link className="fee-agreement-navigation-link fee-agreement-navigation-print" style={{ ...navigationLink, ...navigationPrintLink }} href={`/finance/fee-agreements/${agreement.id}/preview?print=1`}><NavigationIcon name="print" /><span>พิมพ์</span></Link></div></nav>{error ? <div style={warning}>{error}</div> : null}{message ? <div style={success}>{message}</div> : null}
    <header className="fee-agreement-document-header" style={documentHeader}><div><p style={eyebrow}>FEE AGREEMENT</p><h1 style={documentTitle}>{title}</h1><p style={documentNumber}>{agreement.agreement_no || "ยังไม่มีเลขที่สัญญา"}</p></div><div style={headerMeta}><StatusBadge status={agreement.status} /><span>เวอร์ชัน {agreement.document_version}</span><span>{agreement.language_code === "en" ? "English" : "ภาษาไทย"}</span><span>แก้ไขล่าสุด {date(agreement.updated_at)}</span>{agreement.source_quotation_id ? <Link href={`/finance/quotations/${agreement.source_quotation_id}`}>ใบเสนอราคาต้นทาง {sourceQuotationNo}</Link> : <span>ใบเสนอราคาต้นทาง {sourceQuotationNo}</span>}</div></header>
    {editable ? <div style={saveBar}><span style={dirty ? savePending : saveComplete}>{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "ข้อมูลล่าสุดถูกบันทึกแล้ว"}</span><button style={{ ...primarySaveButton, ...(saving || !dirty ? disabledPrimarySaveButton : {}) }} disabled={saving || !dirty} onClick={() => void saveAgreement()}>{saveButtonLabel(dirty, saving)}</button></div> : null}
    <section style={card}>
      <h2 style={sectionTitle}>ข้อมูลเอกสาร</h2>
      <div style={grid}><Field label="สถานะ" value={<StatusBadge status={agreement.status} />} /><Field label="ภาษา" value={agreement.language_code === "en" ? "English" : "ไทย"} /><Field label="เวอร์ชันเอกสาร" value={agreement.document_version} /><Field label="รูปแบบการลงนาม" value={feeAgreementExecutionModeLabel(normalizeFeeAgreementExecutionMode(agreement.execution_mode))} /><Field label="วันที่ทำสัญญา" value={date(agreement.agreement_date)} /><Field label="วันที่มีผล" value={date(agreement.effective_date)} /><Field label="วันที่เริ่มงาน" value={date(agreement.commencement_date)} /><Field label="วันที่สิ้นสุด/เลิกสัญญา" value={date(agreement.expiry_date)} /></div>
      {editable ? <>
        <div className="fee-agreement-document-info-grid" style={documentInformationGrid}>
          <Input label="ชื่อสัญญา" value={metadata.title} disabled={saving} onChange={(title) => setMeta({ ...metadata, title })} />
          <Input label="วันที่ทำสัญญา" type="date" value={metadata.agreementDate} disabled={saving} onChange={(agreementDate) => setMeta({ ...metadata, agreementDate })} />
          <Input label="วันที่มีผล" type="date" value={metadata.effectiveDate} disabled={saving} onChange={(effectiveDate) => setMeta({ ...metadata, effectiveDate })} />
          <Input label="วันที่เริ่มงาน" type="date" value={legal.commencementDate} disabled={saving} onChange={(commencementDate) => setLegalForm({ ...legal, commencementDate })} />
          <div className="fee-agreement-expiry-field">
            <Input label="วันที่สิ้นสุด/เลิกสัญญา" type="date" value={metadata.expiryDate} disabled={saving} onChange={(expiryDate) => setMeta({ ...metadata, expiryDate })} />
          </div>
          <div className="fee-agreement-execution-mode-field" style={executionModeField}>
            <label style={labelStyle}>รูปแบบการลงนาม
              <select style={input} value={metadata.executionMode} disabled={saving} onChange={(event) => setMeta({ ...metadata, executionMode: event.target.value as MetadataForm["executionMode"] })}>
                <option value="paper">ลงนามบนเอกสาร</option>
                <option value="electronic" disabled>ลงนามทางอิเล็กทรอนิกส์</option>
              </select>
            </label>
            <div style={executionModeHelp}>
              <span>กำหนดข้อความปิดท้ายและรูปแบบพื้นที่ลงนามในเอกสาร</span>
              <strong style={comingSoonText}>เร็ว ๆ นี้ — ระบบลงนามอิเล็กทรอนิกส์อยู่ระหว่างการจัดเตรียม</strong>
            </div>
          </div>
        </div>
        <p style={dateHelp}>วันที่ทำสัญญา = วันที่ระบุในตัวสัญญา · วันที่มีผล = วันที่สัญญาเริ่มมีผล · วันที่เริ่มงาน = วันที่เริ่มให้บริการ</p>
        {metadata.executionMode === "electronic" ? <div style={warning}>ข้อตกลงนี้มีรูปแบบลงนามทางอิเล็กทรอนิกส์ที่บันทึกไว้เดิม ระบบยังแสดงเอกสารได้อย่างปลอดภัย แต่ยังไม่สามารถดำเนินการลงนามทางอิเล็กทรอนิกส์ในระบบได้</div> : null}
      </> : null}
    </section>
    <section style={card}><h2 style={sectionTitle}>ข้อมูลคู่สัญญาและแหล่งที่มา</h2><p style={notice}>ข้อมูลค่าบริการและเงื่อนไขทางการค้าส่วนนี้นำมาจากใบเสนอราคาที่ได้รับการตอบรับแล้ว จึงไม่สามารถแก้ไขจากหน้านี้ได้</p><div style={grid}><Field label="ลูกค้า" value={client} /><Field label="เรื่อง/คดี" value={matter} /><Field label="ใบเสนอราคาต้นทาง" value={agreement.source_quotation_id ? <Link href={`/finance/quotations/${agreement.source_quotation_id}`}>{sourceQuotationNo}</Link> : sourceQuotationNo} /><Field label="สถานะใบเสนอราคา" value={quoteStatus(quote?.status || source.status)} /></div></section>
    <section style={card}><h2 style={sectionTitle}>ขอบเขตการให้บริการ</h2><SnapshotText label="ขอบเขตงาน" value={commercial.scope_of_legal_services || source.scope_of_legal_services} /><SnapshotText label="งานที่รวมอยู่ในค่าบริการ" value={commercial.included_services || source.included_services} /><SnapshotText label="งานหรือค่าใช้จ่ายที่ไม่รวม" value={commercial.excluded_services || source.excluded_services} /></section>
    <section style={card}><h2 style={sectionTitle}>รายการค่าบริการ</h2>{items.length ? <ItemsTable items={items} currency={agreement.currency} /> : <div style={warning}>ไม่พบรายการค่าบริการในสัญญานี้</div>}</section>
    <section style={card}><h2 style={sectionTitle}>สรุปค่าบริการ</h2>{mismatch ? <div style={warning}>ยอดรวมรายการค่าบริการไม่ตรงกับจำนวนเงินตามสัญญา กรุณาตรวจสอบข้อมูลจากใบเสนอราคาต้นทาง</div> : null}<div style={summaryGrid}><SummaryCard label="รวมก่อน VAT" value={money(agreement.amount_before_tax, agreement.currency)} /><SummaryCard label="VAT" value={money(agreement.vat_amount, agreement.currency)} /><SummaryCard label="จำนวนเงินตามสัญญา" value={money(agreement.total_amount, agreement.currency)} prominent /></div></section>
    <section style={card}><h2 style={sectionTitle}>เงื่อนไขการชำระเงิน</h2><PaymentTerms payment={object(source.payment_terms)} currency={agreement.currency} /></section>
    <section style={card}><h2 style={sectionTitle}>{templateMode ? "ข้อกำหนดจากแม่แบบ" : "ข้อกำหนดของสัญญา"}</h2>{editable ? <LegalTermsEditor value={legal} templates={templates} disabled={saving} onChange={setLegalForm} /> : null}{templateMode ? <><p style={notice}>ถ้อยคำทางกฎหมายของข้อตกลงนี้ใช้ Published Template เป็นแหล่งข้อมูลหลัก: <strong>{selectedTemplateName}</strong></p>{hiddenLegacyWording || hiddenLegacyClauses ? <div style={warning}>พบถ้อยคำแบบเดิมที่เคยบันทึกไว้ ระบบยังเก็บข้อมูลนั้นไว้เพื่อการตรวจสอบ แต่ Template mode จะไม่ใช้หรือแสดงถ้อยคำดังกล่าวในเอกสารลูกค้า</div> : null}{templateContentMatchesSelection ? <ResolvedTemplateSections template={templateContent} variables={templateVariables} showProvenance /> : dirty ? null : <div style={warning}>ไม่สามารถโหลดข้อกำหนดจากแม่แบบได้ กรุณารีเฟรชก่อนดำเนินการต่อ</div>}</> : editable ? null : <LegalTermsReadOnly legal={agreement.legal_terms_json} />}</section>
    <section style={card}><h2 style={sectionTitle}>ผู้ลงนาม</h2>{editable ? <FeeAgreementSignatoryEditor value={legal.signatories} client={clientContext} authorizedSigners={authorizedSigners} signatureRequirements={effectiveSignatureRequirements} disabled={saving} onChange={(signatories) => setLegalForm({ ...legal, signatories })} /> : <SignatoryList value={agreement.signatories_json || []} clientName={clientContext.name} />}</section>
    <section style={card}><h2 style={sectionTitle}>{templateMode ? "ข้อยกเว้นหรือข้อความเฉพาะข้อตกลง" : "ข้อกำหนดเพิ่มเติม"}</h2>{templateMode ? <><p style={notice}>รายการนี้อ่านจากกลไก override และ custom clause ที่ผูกกับแม่แบบโดยตรง</p>{templateContentMatchesSelection ? <TemplateAgreementChanges template={templateContent} /> : null}</> : editable ? <ClauseEditor value={legal.clauses} disabled={saving} onChange={(clauses) => setLegalForm({ ...legal, clauses })} /> : <ClauseList value={agreement.custom_clauses_json || []} />}</section>
    <section style={card}><h2 style={sectionTitle}>หมายเหตุภายใน — ไม่แสดงในเอกสารลูกค้า</h2>{editable ? <TextArea label="ใช้สำหรับการทำงานภายในสำนักงานเท่านั้น" value={legal.internalNote} disabled={saving} onChange={(internalNote) => setLegalForm({ ...legal, internalNote })} /> : <p style={muted}>หมายเหตุภายในไม่แสดงในสถานะอ่านอย่างเดียวหรือเอกสารสำหรับลูกค้า</p>}</section>
    <section style={{ ...card, ...workflowPanel }}><h2 style={sectionTitle}>สถานะเอกสาร</h2>
      <div className="fee-agreement-workflow-overview" style={workflowOverview}>
        <div style={workflowStatusBlock}>
          <div style={workflowStatusHeading}><span style={workflowEyebrow}>สถานะปัจจุบัน</span><StatusBadge status={agreement.status} prominent /></div>
          <p style={workflowDescription}>{workflowStatusDescription(agreement.status)}</p>
        </div>
        <div style={workflowPermission}><WorkflowIcon name="lock" /><span>{editable ? "เอกสารสถานะร่างและตรวจทานยังแก้ไขได้ เฉพาะผู้มีสิทธิ์จัดการ Finance เท่านั้นที่เปลี่ยนสถานะได้" : "เอกสารสถานะนี้เป็นแบบอ่านอย่างเดียว และคงหลักฐานตาม snapshot ที่บันทึกไว้"}</span></div>
      </div>
      {dirty ? <div style={warning}>กรุณาบันทึกการเปลี่ยนแปลงก่อนส่งตรวจทาน</div> : null}
      {agreement.status === "under_review" && readinessIssues.length ? <div style={warning}><strong>ยังไม่สามารถส่งเอกสารให้ลูกค้าได้ กรุณาตรวจสอบ:</strong><ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
      {permissions.canEditFinanceQuotation && forwardLifecycleActions.length ? <div className="fee-agreement-workflow-next" style={workflowNext}>
        <div style={workflowNextCopy}><span style={workflowNextLabel}>ขั้นตอนถัดไป</span><strong style={workflowNextTitle}>{forwardLifecycleActions[0].label}</strong><span style={workflowNextDescription}>{workflowActionDescription(forwardLifecycleActions[0].status)}</span></div>
        <div className="fee-agreement-workflow-primary-actions" style={workflowPrimaryActions}>{forwardLifecycleActions.map((action) => <button className="fee-agreement-workflow-primary-button" key={action.status} style={workflowPrimaryButton} disabled={lifecycleSaving || dirty || (action.status === "sent" && readinessIssues.length > 0)} onClick={() => void changeStatus(action.status)}><WorkflowIcon name={workflowActionIcon(action.status)} />{lifecycleSaving ? "กำลังดำเนินการ..." : action.label}</button>)}</div>
      </div> : null}
      {permissions.canEditFinanceQuotation && destructiveLifecycleActions.length ? <div className="fee-agreement-workflow-destructive" style={workflowDestructive}><span style={workflowDestructiveLabel}>การดำเนินการอื่น</span><div>{destructiveLifecycleActions.map((action) => <button className="fee-agreement-workflow-cancel-button" key={action.status} style={workflowCancelButton} disabled={lifecycleSaving || dirty} onClick={() => void changeStatus(action.status)}><WorkflowIcon name="cancel" />{lifecycleSaving ? "กำลังดำเนินการ..." : action.label}</button>)}</div></div> : null}
    </section>
    <section style={card}><h2 style={sectionTitle}>ประวัติเวอร์ชัน</h2>{versions.length ? <div style={scroll}><table style={table}><thead><tr><th>เวอร์ชัน</th><th>รายการเปลี่ยนแปลง</th><th>ผู้ดำเนินการ</th><th>วันเวลา</th><th>เหตุผล</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td>v{version.version_no}</td><td>{versionEventLabel(version.event_type)}</td><td>{version.actor_name || version.actor_email || "-"}</td><td>{new Date(version.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</td><td>{version.reason || "-"}</td></tr>)}</tbody></table></div> : <p style={muted}>ยังไม่มีประวัติเวอร์ชันสำหรับข้อมูลเดิม</p>}</section>
  <style jsx global>{`
    .fee-agreement-navigation-link { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
    .fee-agreement-navigation-back:hover { background: #f8fafc !important; border-color: #94a3b8 !important; color: #172033 !important; }
    .fee-agreement-navigation-source:hover { background: #e0e7ff !important; border-color: #a5b4fc !important; color: #312e81 !important; }
    .fee-agreement-navigation-preview:hover { background: #e0e7ff !important; border-color: #818cf8 !important; color: #312e81 !important; }
    .fee-agreement-navigation-print:hover { background: #26334c !important; border-color: #26334c !important; }
    .fee-agreement-navigation-link:focus-visible { outline: 3px solid rgba(37, 99, 235, .28); outline-offset: 2px; }
    .fee-agreement-document-info-grid > * { min-width: 0; }
    .fee-agreement-expiry-field { grid-column: 1; }
    .fee-agreement-execution-mode-field { grid-column: 2 / -1; }
    @media (max-width: 900px) {
      .fee-agreement-document-info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .fee-agreement-expiry-field, .fee-agreement-execution-mode-field { grid-column: auto; }
      .fee-agreement-execution-mode-field { grid-template-columns: minmax(0, 1fr) !important; }
    }
    @media (max-width: 720px) {
      .fee-agreement-navigation-toolbar { align-items: stretch !important; }
      .fee-agreement-navigation-group { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; width: 100%; }
      .fee-agreement-output-group { border-left: 0 !important; border-top: 1px solid #dbe3ee; padding-left: 0 !important; padding-top: 8px; }
      .fee-agreement-navigation-link { width: 100%; justify-content: flex-start; white-space: normal; }
      .fee-agreement-document-header, .fee-agreement-document-info-grid { grid-template-columns: minmax(0, 1fr) !important; }
      .fee-agreement-expiry-field, .fee-agreement-execution-mode-field { grid-column: 1 / -1; }
      .fee-agreement-signatory-grid, .fee-agreement-clause-grid { grid-template-columns: minmax(0, 1fr) !important; }
      .fee-agreement-detail-table { min-width: 720px !important; }
      .fee-agreement-workflow-overview, .fee-agreement-workflow-next { grid-template-columns: minmax(0, 1fr) !important; }
      .fee-agreement-workflow-primary-actions, .fee-agreement-workflow-primary-button { width: 100%; }
      .fee-agreement-workflow-destructive { align-items: stretch !important; flex-direction: column; }
      .fee-agreement-workflow-cancel-button { width: 100%; }
    }
    .fee-agreement-workflow-primary-button, .fee-agreement-workflow-cancel-button { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
    .fee-agreement-workflow-primary-button:hover:not(:disabled) { background: #26334c !important; }
    .fee-agreement-workflow-cancel-button:hover:not(:disabled) { background: #fef2f2 !important; border-color: #fca5a5 !important; }
    .fee-agreement-workflow-primary-button:focus-visible, .fee-agreement-workflow-cancel-button:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
    .fee-agreement-workflow-primary-button:disabled, .fee-agreement-workflow-cancel-button:disabled { cursor: not-allowed !important; opacity: .58; }
  `}</style></main>;
}

const emptyLegalForm: LegalForm = { language: "th", commencementDate: "", templateVersionId: "", scopeClarification: "", clientObligations: "", firmObligations: "", exclusions: "", expenses: "", confidentiality: "", termination: "", dispute: "", additionalTerms: "", internalNote: "", signatories: [], clauses: [], warnings: [] };
function legalSavePayload(value: LegalForm, agreement: Agreement) {
  const templateSelected = Boolean(value.templateVersionId);
  const terms = templateSelected
    ? { ...object(agreement.legal_terms_json), internal_note: blank(value.internalNote) }
    : { scope_clarification: blank(value.scopeClarification), client_obligations: blank(value.clientObligations), firm_obligations: blank(value.firmObligations), exclusions: blank(value.exclusions), expenses_disbursements: blank(value.expenses), confidentiality: blank(value.confidentiality), termination_provisions: blank(value.termination), dispute_jurisdiction: blank(value.dispute), additional_terms: blank(value.additionalTerms), internal_note: blank(value.internalNote) };
  const clauses = templateSelected ? (agreement.custom_clauses_json || []) : [...value.clauses].sort((a, b) => a.sort_order - b.sort_order);
  return { p_legal_terms_json: terms, p_signatories_json: resequenceFeeAgreementSignatories(value.signatories), p_custom_clauses_json: clauses, p_template_version_id: value.templateVersionId || null, p_language_code: value.language, p_commencement_date: value.commencementDate || null };
}
function agreementSavePayload(metadata: MetadataForm, legal: LegalForm, agreement: Agreement) { return { p_title: metadata.title.trim(), p_agreement_date: metadata.agreementDate || null, p_effective_date: metadata.effectiveDate || null, p_expiry_date: metadata.expiryDate || null, p_billing_method: metadata.billingMethod, p_execution_mode: metadata.executionMode, ...legalSavePayload(legal, agreement) }; }
function agreementFingerprint(metadata: MetadataForm, legal: LegalForm, agreement: Agreement) { return JSON.stringify(agreementSavePayload(metadata, legal, agreement)); }
function saveButtonLabel(isDirty: boolean, isSaving: boolean) { if (isSaving) return "กำลังบันทึก..."; return isDirty ? "บันทึกการเปลี่ยนแปลง" : "บันทึกแล้ว"; }
function legalFrom(agreement: Agreement): LegalForm { const legal = object(agreement.legal_terms_json); const signs = parseSignatories(agreement.signatories_json); const clauses = parseClauses(agreement.custom_clauses_json); return { language: agreement.language_code || "th", commencementDate: agreement.commencement_date || "", templateVersionId: agreement.selected_template_version_id || "", scopeClarification: text(legal.scope_clarification, ""), clientObligations: text(legal.client_obligations, ""), firmObligations: text(legal.firm_obligations, ""), exclusions: text(legal.exclusions, ""), expenses: text(legal.expenses_disbursements, ""), confidentiality: text(legal.confidentiality, ""), termination: text(legal.termination_provisions, ""), dispute: text(legal.dispute_jurisdiction, ""), additionalTerms: text(legal.additional_terms, ""), internalNote: text(legal.internal_note, ""), signatories: signs.rows, clauses: clauses.rows, warnings: [...signs.warnings, ...clauses.warnings] }; }
function parseSignatories(value: unknown) { const warnings: string[] = []; const rows = normalizeFeeAgreementSignatories(value); if (array(value).length !== rows.length || rows.some((row) => !row.name || !row.party_type)) warnings.push("พบข้อมูลผู้ลงนามเดิมที่ไม่สมบูรณ์ โปรดตรวจสอบและบันทึกใหม่"); return { rows, warnings }; }
function parseClauses(value: unknown) { const warnings: string[] = []; const rows = array(value).flatMap((item, index) => { const row = object(item); const content = text(row.content, ""); const title = text(row.title, ""); if ((!title || !content) && Object.keys(row).length) warnings.push("พบข้อกำหนดเพิ่มเติมเดิมที่ไม่สมบูรณ์ โปรดตรวจสอบและบันทึกใหม่"); return title || content ? [{ title, content, sort_order: Number(row.sort_order || row.order || index + 1) || index + 1 }] : []; }); return { rows, warnings }; }
function blank(value: string) { return value.trim() || null; }
function validateSignatories(rows: FeeAgreementSignatory[], client: FeeAgreementClientContext) { const orders = new Set<number>(); const individual = client.clientType.trim().toLowerCase() === "individual"; for (const row of rows) { if (!row.name.trim()) return row.signing_mode === "attorney_in_fact" ? "กรุณาระบุชื่อผู้รับมอบอำนาจ" : "กรุณาระบุชื่อผู้ลงนาม"; if (!Object.hasOwn(partyLabel, row.party_type)) return "กรุณาเลือกฝ่ายของผู้ลงนามให้ถูกต้อง"; if (!Number.isInteger(row.sort_order) || row.sort_order < 1) return "ลำดับผู้ลงนามไม่ถูกต้อง กรุณาลองบันทึกอีกครั้ง"; if (orders.has(row.sort_order)) return "ลำดับผู้ลงนามซ้ำกัน กรุณาลองบันทึกอีกครั้ง"; if (row.party_type === "client" && !individual && row.name.trim() === client.name.trim()) return "ผู้ลงนามของนิติบุคคลต้องเป็นชื่อบุคคล ไม่ใช่ชื่อนิติบุคคล"; if (row.party_type === "client" && row.signing_mode === "self" && row.name.trim() !== client.name.trim()) return "ผู้ลงนามด้วยตนเองต้องตรงกับชื่อลูกค้า"; orders.add(row.sort_order); } return ""; }
function validateClauses(rows: CustomClause[]) { for (const row of rows) { if (!row.title.trim() || !row.content.trim()) return "กรุณาระบุหัวข้อและเนื้อหาของข้อกำหนดเพิ่มเติม"; if (!Number.isFinite(row.sort_order) || row.sort_order < 1) return "ลำดับข้อกำหนดต้องเป็นตัวเลขตั้งแต่ 1"; } return ""; }
function mapRpcError(value: string) { if (value.includes("วันที่ทำสัญญา")) return "กรุณาระบุวันที่ทำสัญญาก่อนส่งเอกสาร"; if (value.includes("Only draft or under review")) return "เอกสารนี้ไม่สามารถแก้ไขในสถานะปัจจุบันได้"; if (value.includes("Not allowed")) return "คุณไม่มีสิทธิ์ดำเนินการนี้"; if (value.includes("template")) return "Template ที่เลือกไม่พร้อมใช้งานหรือภาษาไม่ตรงกัน"; if (value.includes("legal document data")) return "กรุณาตรวจสอบข้อมูลเอกสารและผู้ลงนามก่อนส่ง"; if (value.includes("Billing Plan")) return "ต้องยกเลิกแผนเรียกเก็บเงินที่ยังมีผลก่อน"; if (value.includes("Invalid")) return "สถานะเอกสารไม่ถูกต้อง กรุณารีเฟรช"; return value || "ไม่สามารถบันทึกข้อมูลได้"; }
function lifecycleActions(status: string): Array<{ status: "under_review" | "sent" | "signed" | "completed" | "cancelled"; label: string }> { if (status === "draft") return [{ status: "under_review", label: "ส่งตรวจทาน" }, { status: "cancelled", label: "ยกเลิกเอกสาร" }]; if (status === "under_review") return [{ status: "sent", label: "ส่งให้ลูกค้า" }, { status: "cancelled", label: "ยกเลิกเอกสาร" }]; if (status === "sent") return [{ status: "signed", label: "บันทึกว่าลงนามแล้ว" }, { status: "cancelled", label: "ยกเลิกเอกสาร" }]; if (status === "signed") return [{ status: "completed", label: "ทำเครื่องหมายว่าเสร็จสมบูรณ์" }]; return []; }
function workflowStatusDescription(status: string) { const descriptions: Record<string, string> = { draft: "เอกสารยังแก้ไขได้ เมื่อข้อมูลและเอกสารถูกต้องแล้ว ให้ส่งเข้าสู่ขั้นตอนตรวจทาน", under_review: "เอกสารอยู่ระหว่างตรวจสอบความครบถ้วน ก่อนบันทึกฉบับที่จะส่งให้ลูกค้า", sent: "เอกสารถูกส่งให้ลูกค้าแล้วและเป็นแบบอ่านอย่างเดียว รอการลงนามตามขั้นตอน", signed: "เอกสารถูกบันทึกว่าลงนามแล้ว พร้อมปิดกระบวนการเมื่อดำเนินงานครบถ้วน", completed: "กระบวนการจัดทำและลงนามเอกสารเสร็จสมบูรณ์แล้ว", cancelled: "เอกสารถูกยกเลิกและเก็บไว้เพื่อการตรวจสอบ ไม่สามารถดำเนินการต่อในกระบวนการปกติ", active: "เอกสารเดิมที่ยังมีผล ระบบเก็บสถานะไว้เพื่อความเข้ากันได้กับข้อมูลเดิม" }; return descriptions[status] || "ตรวจสอบสถานะและข้อมูลเอกสารก่อนดำเนินการขั้นตอนถัดไป"; }
function workflowActionDescription(status: "under_review" | "sent" | "signed" | "completed" | "cancelled") { const descriptions = { under_review: "ส่งให้ผู้มีสิทธิ์ตรวจทานความครบถ้วนก่อนส่งให้ลูกค้า", sent: "ยืนยันความพร้อมและบันทึกเอกสารฉบับส่งให้ลูกค้า", signed: "บันทึกว่าเอกสารได้รับการลงนามเรียบร้อยแล้ว", completed: "ปิดกระบวนการจัดทำข้อตกลงเมื่อดำเนินการครบถ้วน", cancelled: "ยกเลิกเอกสารและเก็บไว้เพื่อการตรวจสอบ" }; return descriptions[status]; }
function workflowActionIcon(status: "under_review" | "sent" | "signed" | "completed" | "cancelled"): "review" | "send" | "signed" | "completed" | "cancel" { if (status === "under_review") return "review"; if (status === "sent") return "send"; if (status === "signed") return "signed"; if (status === "completed") return "completed"; return "cancel"; }
function lifecycleConfirmation(next: "under_review" | "sent" | "signed" | "completed" | "cancelled") { const messages = { under_review: "ส่งเอกสารเพื่อตรวจทาน?\n\nเอกสารจะเปลี่ยนเป็นสถานะอยู่ระหว่างตรวจทาน ผู้มีสิทธิ์ยังสามารถแก้ไขข้อกำหนดได้ และทุกการแก้ไขจะถูกบันทึกเป็นเวอร์ชันใหม่", sent: "ยืนยันการส่งเอกสารให้ลูกค้า?\n\nเมื่อเปลี่ยนเป็นสถานะส่งแล้ว เนื้อหาเอกสารจะถูกบันทึกเป็นหลักฐานและไม่สามารถแก้ไขได้ กรุณาตรวจสอบข้อมูลทั้งหมดก่อนดำเนินการ", signed: "ยืนยันว่าเอกสารลงนามแล้ว?\n\nระบบจะบันทึกเอกสารฉบับลงนามเป็นหลักฐานถาวร และไม่สามารถแก้ไขเนื้อหาย้อนหลังได้", completed: "ทำเครื่องหมายว่าเอกสารเสร็จสมบูรณ์?\n\nสถานะนี้ใช้เมื่อกระบวนการจัดทำและลงนามเอกสารเสร็จสิ้นแล้ว", cancelled: "ยืนยันการยกเลิกเอกสาร?\n\nเอกสารที่ยกเลิกจะยังคงอยู่ในระบบเพื่อการตรวจสอบ แต่ไม่สามารถนำกลับมาใช้ในกระบวนการปกติได้" }; return messages[next]; }
function versionEventLabel(event: string) { const labels: Record<string, string> = { created: "สร้างเอกสาร", draft_saved: "บันทึกการเปลี่ยนแปลงร่าง", under_review_saved: "บันทึกการเปลี่ยนแปลงระหว่างตรวจทาน", draft_metadata_saved: "แก้ไขข้อมูลเอกสาร", under_review_metadata_saved: "แก้ไขข้อมูลเอกสารระหว่างตรวจทาน", draft_legal_terms_saved: "แก้ไขข้อกำหนดสัญญา", under_review_legal_terms_saved: "แก้ไขข้อกำหนดระหว่างตรวจทาน", under_review: "ส่งตรวจทาน", sent: "ส่งเอกสาร", signed: "ลงนาม", completed: "เสร็จสมบูรณ์", cancelled: "ยกเลิก" }; return labels[event] || event.replaceAll("_", " "); }
function Field({ label, value }: { label: string; value: ReactNode }) { return <div><small style={muted}>{label}</small><div>{value}</div></div>; }
function NavigationIcon({ name }: { name: "back" | "source" | "preview" | "print" }) { const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; if (name === "back") return <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; if (name === "source") return <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" /></svg>; if (name === "preview") return <svg {...common}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>; return <svg {...common}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" /></svg>; }
function WorkflowIcon({ name }: { name: "lock" | "review" | "send" | "signed" | "completed" | "cancel" }) { const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; if (name === "lock") return <svg {...common} style={{ flex: "0 0 auto" }}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>; if (name === "review") return <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12l2 2 4-4M9 18h6" /></svg>; if (name === "send") return <svg {...common}><path d="m3 11 18-8-8 18-2-8-8-2Z" /><path d="m11 13 4-4" /></svg>; if (name === "signed") return <svg {...common}><path d="M4 20h16M6 16l9-9 3 3-9 9H6v-3Z" /></svg>; if (name === "completed") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>; return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></svg>; }
function StatusBadge({ status, prominent = false }: { status: string; prominent?: boolean }) { return <span style={{ ...badge, ...(badgeColor[status] || {}), ...(prominent ? workflowStatusBadge : {}) }}>{statusLabel[status] || status}</span>; }
function SummaryCard({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...summaryCard, ...(prominent ? summaryCardProminent : {}) }}><small style={prominent ? { color: "#166534" } : muted}>{label}</small><strong style={prominent ? summaryValueProminent : summaryValue}>{value}</strong></div>; }
function SnapshotText({ label, value }: { label: string; value: unknown }) { return text(value, "") !== "" ? <div style={term}><strong>{label}</strong><div style={pre}>{text(value)}</div></div> : null; }
function ItemsTable({ items, currency }: { items: Item[]; currency: string }) { return <div style={scroll}><table className="fee-agreement-detail-table" style={table}><thead><tr><th>ลำดับ</th><th>รายละเอียด</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>VAT</th><th>ก่อน VAT</th><th>VAT</th><th>รวม</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.unit_price, currency)}</td><td>{item.vat_applicable ? `${item.vat_rate}%` : "ไม่มี VAT"}</td><td>{money(item.amount_before_tax, currency)}</td><td>{money(item.vat_amount, currency)}</td><td>{money(item.line_total, currency)}</td></tr>)}</tbody></table></div>; }
function PaymentTerms({ payment, currency }: { payment: Json; currency: string }) { const installments = array(payment.installments).map(object); if (!Object.keys(payment).length || !installments.length) return <p style={muted}>ยังไม่มีเงื่อนไขการชำระเงินที่บันทึกไว้</p>; return <><Field label="รูปแบบการชำระเงิน" value={billingLabel[text(payment.payment_method_type, "")] || text(payment.payment_method_type)} />{text(payment.client_summary, "") !== "" ? <p style={notice}>{text(payment.client_summary)}</p> : null}<div style={installmentGrid}>{installments.map((installment, index) => { const no = Number(installment.installment_no || index + 1); const customTitle = text(installment.title, ""); return <div key={`${installment.installment_no || index}`} style={installmentCard}><strong>งวดที่ {no}</strong>{!isGeneratedInstallmentTitle(customTitle, no) ? <div style={{ color: "#475569", marginTop: 2 }}>{customTitle}</div> : null}<div>จำนวนก่อน VAT: {money(installment.amount_before_tax, currency)}</div><div>VAT: {money(installment.vat_amount, currency)}</div><div>จำนวนรวม: {money(installment.total_amount, currency)}</div><InstallmentDue installment={installment} /><SnapshotText label="หมายเหตุสำหรับลูกค้า" value={installment.client_note} /><AllocatedItems value={array(installment.items)} currency={currency} /></div>; })}</div></>; }
function InstallmentDue({ installment }: { installment: Json }) { const description = dueDescription(installment); return description ? <div style={{ marginTop: 6 }}><strong>ครบกำหนด:</strong> {description}</div> : null; }
function AllocatedItems({ value, currency }: { value: unknown[]; currency: string }) { if (!value.length) return null; return <div style={{ marginTop: 8 }}><strong>รายการค่าบริการในงวดนี้</strong>{value.map((entry, index) => { const item = object(entry); return <div key={`${text(item.description, "item")}-${index}`} style={allocated}><span>{text(item.description)}</span><span>{money(item.allocated_total || item.line_total, currency)}</span></div>; })}</div>; }
function LegalTermsEditor({ value, templates, disabled, onChange }: { value: LegalForm; templates: Template[]; disabled: boolean; onChange: (next: LegalForm) => void }) { const update = (key: keyof LegalForm, next: string) => onChange({ ...value, [key]: next }); const templateMode = Boolean(value.templateVersionId); return <><div style={formGrid}><label style={labelStyle}>ภาษา<select style={input} value={value.language} disabled={disabled} onChange={(event) => update("language", event.target.value)}><option value="th">ไทย</option><option value="en">English</option></select></label><label style={labelStyle}>Template version<select style={input} value={value.templateVersionId} disabled={disabled} onChange={(event) => update("templateVersionId", event.target.value)}><option value="">ไม่ใช้ Template / ใช้โครงสร้างมาตรฐาน</option>{templates.filter((template) => template.language_code === value.language).map((template) => <option key={template.id} value={template.id}>{template.document_templates?.template_code || "Template"} v{template.version_no} — {template.document_templates?.name || ""}</option>)}</select></label></div>{templateMode ? null : <><TermsGroup title="ขอบเขตและหน้าที่"><TextArea label="รายละเอียดขอบเขตเพิ่มเติม" value={value.scopeClarification} disabled={disabled} onChange={(next) => update("scopeClarification", next)} /><TextArea label="หน้าที่ของลูกค้า" value={value.clientObligations} disabled={disabled} onChange={(next) => update("clientObligations", next)} /><TextArea label="หน้าที่ของสำนักงาน" value={value.firmObligations} disabled={disabled} onChange={(next) => update("firmObligations", next)} /><TextArea label="งานที่ไม่รวม" value={value.exclusions} disabled={disabled} onChange={(next) => update("exclusions", next)} /></TermsGroup><TermsGroup title="ค่าใช้จ่ายและการคุ้มครองข้อมูล"><TextArea label="ค่าใช้จ่ายและเงินทดรอง" value={value.expenses} disabled={disabled} onChange={(next) => update("expenses", next)} /><TextArea label="การรักษาความลับ" value={value.confidentiality} disabled={disabled} onChange={(next) => update("confidentiality", next)} /></TermsGroup><TermsGroup title="การสิ้นสุดและข้อพิพาท"><TextArea label="การเลิกสัญญา" value={value.termination} disabled={disabled} onChange={(next) => update("termination", next)} /><TextArea label="กฎหมายที่ใช้บังคับ/เขตอำนาจ" value={value.dispute} disabled={disabled} onChange={(next) => update("dispute", next)} /></TermsGroup><TermsGroup title="ข้อกำหนดอื่น"><TextArea label="ข้อกำหนดเพิ่มเติม" value={value.additionalTerms} disabled={disabled} onChange={(next) => update("additionalTerms", next)} /></TermsGroup></>}{value.warnings.length ? <div style={warning}>{value.warnings.join(" ")}</div> : null}</>; }
function TermsGroup({ title, children }: { title: string; children: ReactNode }) { return <section style={termsGroup}><h3 style={termsGroupTitle}>{title}</h3><div style={formGrid}>{children}</div></section>; }
function LegalTermsReadOnly({ legal }: { legal: Json | null }) { const entries: Array<[string, string]> = [["รายละเอียดขอบเขตเพิ่มเติม", "scope_clarification"], ["หน้าที่ของลูกค้า", "client_obligations"], ["หน้าที่ของสำนักงาน", "firm_obligations"], ["งานที่ไม่รวม", "exclusions"], ["ค่าใช้จ่ายและเงินทดรอง", "expenses_disbursements"], ["การรักษาความลับ", "confidentiality"], ["การเลิกสัญญา", "termination_provisions"], ["กฎหมายที่ใช้บังคับ/เขตอำนาจ", "dispute_jurisdiction"], ["ข้อกำหนดเพิ่มเติม", "additional_terms"]]; const source = object(legal); return <>{entries.map(([label, key]) => <SnapshotText key={key} label={label} value={source[key]} />)}{!entries.some(([, key]) => text(source[key], "") !== "") ? <p style={muted}>ยังไม่มีข้อกำหนดสัญญาที่บันทึกไว้</p> : null}</>; }
function ClauseEditor({ value, disabled, onChange }: { value: CustomClause[]; disabled: boolean; onChange: (next: CustomClause[]) => void }) { return <><button style={secondaryButton} type="button" disabled={disabled} onClick={() => onChange([...value, { title: "", content: "", sort_order: value.length + 1 }])}>เพิ่มข้อกำหนดเพิ่มเติม</button>{value.length ? <div style={rowList}>{value.map((row, index) => <div className="fee-agreement-clause-grid" style={clauseGrid} key={`${row.sort_order}-${index}`}><Input label="หัวข้อ" value={row.title} disabled={disabled} onChange={(title) => onChange(replace(value, index, { ...row, title }))} /><Input label="ลำดับ" type="number" value={String(row.sort_order)} disabled={disabled} onChange={(raw) => onChange(replace(value, index, { ...row, sort_order: Number(raw) || 0 }))} /><TextArea label="เนื้อหาข้อกำหนด" value={row.content} disabled={disabled} onChange={(content) => onChange(replace(value, index, { ...row, content }))} /><button style={removeButton} type="button" disabled={disabled} onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>ลบ</button></div>)}</div> : <p style={muted}>ยังไม่มีข้อกำหนดเพิ่มเติม</p>}</>; }
function SignatoryList({ value, clientName }: { value: unknown[]; clientName: string }) { const parsed = parseSignatories(value); return parsed.rows.length ? <div style={rowList}>{parsed.rows.sort((a, b) => a.sort_order - b.sort_order).map((row) => { const context = row.party_type === "client" ? feeAgreementSignatoryContext(row, clientName) : ""; return <div key={`${row.party_type}-${row.sort_order}`} style={term}><strong>{row.name}</strong><div>{row.capacity || "-"} · {partyLabel[row.party_type] || "ไม่ระบุฝ่าย"}</div>{context ? <div style={muted}>{context}</div> : null}</div>; })}</div> : <p style={muted}>ยังไม่มีผู้ลงนาม</p>; }
function ClauseList({ value }: { value: unknown[] }) { const parsed = parseClauses(value); return parsed.rows.length ? <div style={rowList}>{parsed.rows.sort((a, b) => a.sort_order - b.sort_order).map((row) => <div key={`${row.title}-${row.sort_order}`} style={term}><strong>{row.title}</strong><div style={pre}>{row.content}</div></div>)}</div> : <p style={muted}>ยังไม่มีข้อกำหนดเพิ่มเติม</p>; }
function Input({ label, value, disabled, onChange, type = "text" }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; type?: string }) { return <label style={labelStyle}>{label}<input style={input} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextArea({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) { return <label style={labelStyle}>{label}<textarea style={{ ...input, minHeight: 104, resize: "vertical" }} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
const replace = <T,>(rows: T[], index: number, row: T) => rows.map((current, currentIndex) => currentIndex === index ? row : current);
const partyLabel: Record<string, string> = { client: "ลูกค้า", firm: "สำนักงาน", witness: "พยาน" };

const navigationToolbar: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: 8, marginBottom: 18, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" };
const navigationGroup: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 };
const outputGroup: CSSProperties = { borderLeft: "1px solid #dbe3ee", paddingLeft: 12 };
const navigationLink: CSSProperties = { boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minWidth: 0, minHeight: 38, padding: "8px 11px", border: "1px solid", borderRadius: 6, fontSize: 14, fontWeight: 650, lineHeight: 1.25, textDecoration: "none", whiteSpace: "nowrap" };
const navigationBackLink: CSSProperties = { background: "#fff", borderColor: "#cbd5e1", color: "#475569" };
const navigationSourceLink: CSSProperties = { background: "#eef2ff", borderColor: "#c7d2fe", color: "#3730a3" };
const navigationPreviewLink: CSSProperties = { background: "#fff", borderColor: "#a5b4fc", color: "#4338ca" };
const navigationPrintLink: CSSProperties = { background: "#172033", borderColor: "#172033", color: "#fff" };
const workflowPanel: CSSProperties = { borderColor: "#dbe3ee", boxShadow: "0 1px 3px rgba(15,23,42,.05)" };
const workflowOverview: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(270px,.68fr)", gap: 16, alignItems: "stretch", marginBottom: 14 };
const workflowStatusBlock: CSSProperties = { display: "grid", alignContent: "start", gap: 8, minWidth: 0, padding: "13px 14px", border: "1px solid #e2e8f0", borderRadius: 7, background: "#f8fafc" };
const workflowStatusHeading: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9 };
const workflowEyebrow: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 700 };
const workflowStatusBadge: CSSProperties = { padding: "5px 10px", fontSize: 13, fontWeight: 750 };
const workflowDescription: CSSProperties = { margin: 0, color: "#334155", fontSize: 14, lineHeight: 1.55 };
const workflowPermission: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 9, minWidth: 0, padding: "13px 14px", border: "1px solid #e2e8f0", borderRadius: 7, color: "#64748b", background: "#fff", fontSize: 12, lineHeight: 1.55 };
const workflowNext: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 18, alignItems: "center", marginTop: 14, padding: "15px 16px", border: "1px solid #c7d2fe", borderRadius: 7, background: "#eef2ff" };
const workflowNextCopy: CSSProperties = { display: "grid", gap: 3, minWidth: 0 };
const workflowNextLabel: CSSProperties = { color: "#6366f1", fontSize: 11, fontWeight: 800, textTransform: "uppercase" };
const workflowNextTitle: CSSProperties = { color: "#172033", fontSize: 16 };
const workflowNextDescription: CSSProperties = { color: "#475569", fontSize: 13, lineHeight: 1.45 };
const workflowPrimaryActions: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 };
const workflowPrimaryButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 42, boxSizing: "border-box", padding: "10px 15px", border: "1px solid #172033", borderRadius: 6, background: "#172033", color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 750 };
const workflowDestructive: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" };
const workflowDestructiveLabel: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 700 };
const workflowCancelButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 36, boxSizing: "border-box", padding: "8px 11px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#b91c1c", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700 };
const documentInformationGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(240px,1.55fr) repeat(3,minmax(150px,1fr))", gap: 14, alignItems: "start", margin: "18px 0 10px" };
const executionModeField: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px,.85fr) minmax(260px,1.15fr)", gap: 16, alignItems: "end", padding: "12px 14px", borderLeft: "3px solid #86a995", background: "#f8faf9" };
const executionModeHelp: CSSProperties = { display: "grid", gap: 4, color: "#64748b", fontSize: 13, lineHeight: 1.45 };
const comingSoonText: CSSProperties = { color: "#475569", fontWeight: 600 };
const dateHelp: CSSProperties = { color: "#64748b", fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 };
const page: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24 }; const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, marginBottom: 16 }; const documentHeader: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(270px,.7fr)", gap: 28, padding: "12px 0 24px", marginBottom: 20, borderBottom: "2px solid #166534" }; const eyebrow: CSSProperties = { margin: 0, color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: 1.1 }; const documentTitle: CSSProperties = { margin: "6px 0", color: "#172033", fontSize: 30, lineHeight: 1.25 }; const documentNumber: CSSProperties = { margin: 0, color: "#166534", fontWeight: 700, fontSize: 17 }; const headerMeta: CSSProperties = { display: "flex", flexWrap: "wrap", alignContent: "start", gap: "8px 14px", color: "#475569", fontSize: 13, paddingTop: 8 }; const saveBar: CSSProperties = { position: "sticky", top: 12, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: 12, marginBottom: 16, border: "1px solid #bbf7d0", borderRadius: 8, background: "#f0fdf4", boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)" }; const primarySaveButton: CSSProperties = { border: 0, borderRadius: 6, padding: "10px 14px", background: "#166534", color: "#fff", cursor: "pointer", fontWeight: 700 }; const disabledPrimarySaveButton: CSSProperties = { background: "#94a3b8", cursor: "default" }; const savePending: CSSProperties = { color: "#9a3412", fontWeight: 700 }; const saveComplete: CSSProperties = { color: "#166534", fontWeight: 700 }; const sectionTitle: CSSProperties = { margin: "0 0 14px", fontSize: 18, color: "#14532d" }; const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }; const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14, margin: "16px 0" }; const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }; const summaryCard: CSSProperties = { display: "grid", gap: 7, padding: 16, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" }; const summaryCardProminent: CSSProperties = { background: "#f0fdf4", borderColor: "#86efac" }; const summaryValue: CSSProperties = { fontSize: 19, color: "#1e293b" }; const summaryValueProminent: CSSProperties = { fontSize: 23, color: "#166534" }; const termsGroup: CSSProperties = { margin: "20px 0", paddingTop: 2 }; const termsGroupTitle: CSSProperties = { margin: 0, fontSize: 15, color: "#334155" }; const clauseGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px,1fr) 90px", gap: 10, alignItems: "end" }; const rowList: CSSProperties = { display: "grid", gap: 12, marginTop: 14 }; const muted: CSSProperties = { color: "#64748b", fontSize: 13 }; const warning: CSSProperties = { background: "#fff7ed", color: "#9a3412", padding: 12, borderRadius: 6, marginBottom: 12 }; const success: CSSProperties = { background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 6, marginBottom: 12 }; const notice: CSSProperties = { background: "#f8fafc", borderLeft: "3px solid #64748b", color: "#334155", padding: 12, margin: "10px 0" }; const scroll: CSSProperties = { overflowX: "auto" }; const table: CSSProperties = { width: "100%", minWidth: 780, borderCollapse: "collapse" }; const term: CSSProperties = { padding: "10px 0", borderBottom: "1px solid #e5e7eb" }; const pre: CSSProperties = { whiteSpace: "pre-wrap", lineHeight: 1.55, marginTop: 6 }; const labelStyle: CSSProperties = { display: "grid", gap: 6, color: "#334155", fontSize: 14 }; const input: CSSProperties = { boxSizing: "border-box", width: "100%", minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px", background: "#fff", font: "inherit" }; const secondaryButton: CSSProperties = { border: "1px solid #94a3b8", borderRadius: 6, padding: "9px 12px", background: "#fff", color: "#334155", cursor: "pointer" }; const removeButton: CSSProperties = { border: 0, background: "transparent", color: "#b91c1c", cursor: "pointer", padding: "8px 2px" }; const badge: CSSProperties = { display: "inline-block", padding: "3px 8px", borderRadius: 999, fontSize: 12 }; const badgeColor: Record<string, CSSProperties> = { draft: { background: "#e5e7eb", color: "#374151" }, under_review: { background: "#fef3c7", color: "#92400e" }, sent: { background: "#dbeafe", color: "#1d4ed8" }, signed: { background: "#dcfce7", color: "#166534" }, completed: { background: "#e0e7ff", color: "#3730a3" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, active: { background: "#f3f4f6", color: "#4b5563" } }; const installmentGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12, marginTop: 14 }; const installmentCard: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 6, padding: 12, lineHeight: 1.6 }; const allocated: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", borderBottom: "1px solid #f1f5f9" };
