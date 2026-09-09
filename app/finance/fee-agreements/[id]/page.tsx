"use client";

import { useI18n } from "../../../../lib/i18n/provider";
import { uiMessage, uiDate, type UiMessage, type UiLocale, type MessageParameters } from "../../../../lib/i18n/core";
import { translate } from "../../../../lib/i18n/catalog";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  normalizeFeeAgreementExecutionMode,
} from "../execution";
import {
  feeAgreementActionDescription,
  feeAgreementLifecycleActionLabel,
  feeAgreementLifecycleConfirmation,
  type FeeAgreementLifecycleTarget,
  feeAgreementStatusDescription,
  feeAgreementStatusLabel,
  feeAgreementVersionEventLabel,
} from "../lifecycle";
import {
  buildFeeAgreementEvidencePath,
  calculateSha256,
  FEE_AGREEMENT_EVIDENCE_BUCKET,
  formatEvidenceFileSize,
  feeAgreementEvidenceFileError,
} from "../signing-evidence";
import { buildBillingPlanDraftFromFeeAgreement } from "../../billing-plans/draft";

type Json = Record<string, unknown>;
type Agreement = { id: string; agreement_no: string | null; title: string; client_id: string; case_id: number | null; advisory_matter_id: string | null; source_quotation_id: string | null; source_reference: string | null; status: string; agreement_date: string | null; effective_date: string | null; commencement_date: string | null; expiry_date: string | null; currency: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; billing_method: string; language_code: string; execution_mode: string | null; legal_terms_json: Json | null; signatories_json: unknown[] | null; custom_clauses_json: unknown[] | null; selected_template_version_id: string | null; client_snapshot_json: Json | null; matter_snapshot_json: Json | null; source_document_snapshot_json: Json | null; commercial_terms_snapshot_json: Json | null; allocation_snapshot_json: Json | null; resolved_document_snapshot_json: Json | null; signed_document_snapshot_json: Json | null; executed_on: string | null; signed_at: string | null; signed_by_user_id: string | null; signed_evidence_reference: string | null; signed_evidence_json: Json | null; document_version: number | null; engagement_basis: "formal_agreement" | "accepted_quotation" | null; engagement_confirmed_on: string | null; engagement_confirmed_at: string | null; engagement_confirmed_by_user_id: string | null; engagement_confirmation_channel: string | null; engagement_confirmation_note: string | null; engagement_confirmation_snapshot_json: Json | null; cancelled_at: string | null; cancel_reason: string | null; updated_at: string };
type Item = { id: string; source_quotation_item_id: string | null; description: string; unit: string | null; economic_classification: string | null; quantity: number | string; unit_price: number | string; vat_applicable: boolean; vat_rate: number | string; amount_before_tax: number | string; vat_amount: number | string; line_total: number | string; sort_order: number };
type Quote = { id: string; quotation_no: string; status: string; issue_date: string | null; valid_until: string | null };
type BillingPlanReference = { id: string; status: string };
type Version = { id: string; version_no: number; event_type: string; reason: string | null; actor_name: string | null; actor_email: string | null; created_at: string };
type Template = { id: string; language_code: string; version_no: number; document_templates?: { name?: string; template_code?: string } | null };
type CustomClause = { title: string; content: string; sort_order: number };
type LegalForm = { language: string; commencementDate: string; templateVersionId: string; scopeClarification: string; clientObligations: string; firmObligations: string; exclusions: string; expenses: string; confidentiality: string; termination: string; dispute: string; additionalTerms: string; internalNote: string; signatories: FeeAgreementSignatory[]; clauses: CustomClause[]; warnings: UiMessage[] };
type MetadataForm = { title: string; agreementDate: string; effectiveDate: string; expiryDate: string; billingMethod: string; executionMode: "paper" | "electronic" };
type ClientRow = { id: string; name: string | null; client_type: string | null; contact_name: string | null };
type PaperSigningForm = { executedOn: string; verificationConfirmed: boolean; note: string; reference: string };
type PaperSigningErrorKey = "executedOn" | "evidenceFile" | "signatories" | "verification";
type PaperSigningErrors = Partial<Record<PaperSigningErrorKey, UiMessage | string>>;

const defaultTitle = "สัญญาว่าจ้างให้บริการทางกฎหมาย";
const emptyPaperSigningForm: PaperSigningForm = { executedOn: "", verificationConfirmed: false, note: "", reference: "" };
const billingLabels = (locale: UiLocale): Record<string, string> => ({ single: translate(locale, "finance.feeAgreement.workspace.billing.single"), installments: translate(locale, "finance.feeAgreement.workspace.billing.installments"), milestone: translate(locale, "finance.feeAgreement.workspace.billing.milestone"), recurring: translate(locale, "finance.feeAgreement.workspace.billing.recurring"), manual: translate(locale, "finance.billingPlan.method.manual") });
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = "-") => typeof value === "string" && value.trim() ? value : fallback;
const amount = (value: unknown) => Number(value || 0);
const satang = (value: unknown) => Math.round(amount(value) * 100);
const money = (value: unknown, currency = "THB", locale: UiLocale = "th") => `${amount(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "THB" ? translate(locale, "finance.feeAgreement.workspace.currency.baht") : currency}`;
const date = (value: unknown, locale: UiLocale = "th") => uiDate(typeof value === "string" ? value : null, locale);
const dateTime = (value: unknown, locale: UiLocale = "th") => uiDate(typeof value === "string" ? value : null, locale, true);
const isDefaultTitle = (value: string) => !value.trim() || /^Fee Agreement\s*-\s*/i.test(value);
const sourceStatusLabels = (locale: UiLocale): Record<string, string> => ({ accepted: translate(locale, "finance.feeAgreement.workspace.quotation.accepted"), sent: translate(locale, "finance.feeAgreement.workspace.quotation.sent"), draft: translate(locale, "finance.feeAgreement.status.draft"), cancelled: translate(locale, "finance.feeAgreement.status.cancelled"), expired: translate(locale, "finance.feeAgreement.workspace.quotation.expired") });
const quoteStatus = (status: unknown, locale: UiLocale = "th") => sourceStatusLabels(locale)[text(status, "")] || text(status);
const legacyLegalKeys = ["scope_clarification", "client_obligations", "firm_obligations", "exclusions", "expenses_disbursements", "confidentiality", "termination_provisions", "dispute_jurisdiction", "additional_terms"];
const selectStoredDocument = (agreement: Agreement): Json => {
  if (["signed", "completed"].includes(agreement.status) && agreement.signed_document_snapshot_json) return agreement.signed_document_snapshot_json;
  if (["sent", "signed", "completed", "cancelled"].includes(agreement.status) && agreement.resolved_document_snapshot_json) return agreement.resolved_document_snapshot_json;
  return {};
};
const isGeneratedInstallmentTitle = (value: unknown, installmentNo: number) => { const title = text(value, "").toLowerCase().replace(/\s+/g, " ").trim(); return !title || new RegExp(`^(งวดที่\\s*${installmentNo}|installment\\s*${installmentNo})(\\s*[/—-]\\s*(งวดที่\\s*${installmentNo}|installment\\s*${installmentNo}))?$`, "i").test(title); };
const dueDescription = (installment: Json, locale: UiLocale = "th") => {
  if (installment.due_date) return translate(locale, "finance.feeAgreement.workspace.due.date", { date: date(installment.due_date, locale) });
  const days = Number(installment.payment_due_days);
  const hasPeriod = Number.isFinite(days) && days > 0;
  const trigger = text(installment.trigger_type, "");
  if (trigger === "quotation_acceptance") return translate(locale, hasPeriod ? "finance.feeAgreement.workspace.due.acceptance" : "finance.feeAgreement.workspace.due.afterAcceptance", hasPeriod ? { days } : undefined);
  if (trigger === "agreement_effective") return translate(locale, hasPeriod ? "finance.feeAgreement.workspace.due.effective" : "finance.feeAgreement.workspace.due.afterEffective", hasPeriod ? { days } : undefined);
  if (["case_milestone", "recurring_period", "manual"].includes(trigger) && text(installment.trigger_description, "")) return hasPeriod ? translate(locale, "finance.feeAgreement.workspace.due.trigger", { days, trigger: text(installment.trigger_description) }) : text(installment.trigger_description);
  return hasPeriod ? translate(locale, "finance.feeAgreement.workspace.due.days", { days }) : text(installment.trigger_description, "");
};

export default function FeeAgreementDetailPage() { return <QuotationGuard>{(access) => <Detail permissions={access.permissions} />}</QuotationGuard>; }

function Detail({ permissions }: { permissions: { canEditFinanceQuotation: boolean } }) {
  const { t: tr, text: uiText, locale } = useI18n();

  const params = useParams(); const id = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const router = useRouter();
  const [agreement, setAgreement] = useState<Agreement | null>(null); const [items, setItems] = useState<Item[]>([]); const [quote, setQuote] = useState<Quote | null>(null); const [versions, setVersions] = useState<Version[]>([]); const [templates, setTemplates] = useState<Template[]>([]); const [templateContent, setTemplateContent] = useState<Json>({});
  const [billingPlan, setBillingPlan] = useState<BillingPlanReference | null>(null); const [billingPlanCreating, setBillingPlanCreating] = useState(false);
  const [authorizedSigners, setAuthorizedSigners] = useState<AuthorizedSigner[]>([]); const [clientContext, setClientContext] = useState<FeeAgreementClientContext>({ id: "", name: "", clientType: "", contactName: "" });
  const [metadata, setMetadata] = useState<MetadataForm>({ title: "", agreementDate: "", effectiveDate: "", expiryDate: "", billingMethod: "single", executionMode: "paper" }); const [legal, setLegal] = useState<LegalForm>(emptyLegalForm);
  const [savedBaseline, setSavedBaseline] = useState("");
  const [loading, setLoading] = useState(true); const [error, setError] = useState<UiMessage | string>(""); const [saving, setSaving] = useState(false); const [lifecycleSaving, setLifecycleSaving] = useState(false); const [message, setMessage] = useState<UiMessage | string>("");
  const [paperSigningOpen, setPaperSigningOpen] = useState(false); const [paperSigning, setPaperSigning] = useState<PaperSigningForm>(emptyPaperSigningForm); const [paperSigningErrors, setPaperSigningErrors] = useState<PaperSigningErrors>({}); const [evidenceFile, setEvidenceFile] = useState<File | null>(null); const [paperSigningSaving, setPaperSigningSaving] = useState(false); const [evidenceOpening, setEvidenceOpening] = useState(false);
  const saveLock = useRef(false);
  const billingPlanCreateLock = useRef(false);
  const acceptedEngagementCancelLock = useRef(false);
  const paperSigningLock = useRef(false); const paperSigningPanelRef = useRef<HTMLDivElement>(null); const executedOnInputRef = useRef<HTMLInputElement>(null); const evidenceFileInputRef = useRef<HTMLInputElement>(null); const signingPartySummaryRef = useRef<HTMLDivElement>(null); const verificationInputRef = useRef<HTMLInputElement>(null);
  const editable = Boolean(agreement && permissions.canEditFinanceQuotation && ["draft", "under_review"].includes(agreement.status));
  const dirty = Boolean(agreement && savedBaseline && agreementFingerprint(metadata, legal, agreement) !== savedBaseline);

  const load = useCallback(async () => {
    if (!id) { setError(uiMessage("finance.feeAgreement.workspace.error.notFound")); setLoading(false); return; }
    setLoading(true); setError("");
    const header = await supabase.from("finance_fee_agreements").select("id,agreement_no,title,client_id,case_id,advisory_matter_id,source_quotation_id,source_reference,status,agreement_date,effective_date,commencement_date,expiry_date,currency,amount_before_tax,vat_amount,total_amount,billing_method,language_code,execution_mode,legal_terms_json,signatories_json,custom_clauses_json,selected_template_version_id,client_snapshot_json,matter_snapshot_json,source_document_snapshot_json,commercial_terms_snapshot_json,allocation_snapshot_json,resolved_document_snapshot_json,signed_document_snapshot_json,executed_on,signed_at,signed_by_user_id,signed_evidence_reference,signed_evidence_json,document_version,engagement_basis,engagement_confirmed_on,engagement_confirmed_at,engagement_confirmed_by_user_id,engagement_confirmation_channel,engagement_confirmation_note,engagement_confirmation_snapshot_json,cancelled_at,cancel_reason,updated_at").eq("id", id).maybeSingle();
    if (header.error || !header.data) { setError(header.error ? uiMessage("finance.feeAgreement.workspace.error.load") : uiMessage("finance.feeAgreement.workspace.error.notFound")); setLoading(false); return; }
    const row = header.data as Agreement;
    const acceptedQuotationBasis = row.engagement_basis === "accepted_quotation";
    const storedDocument = selectStoredDocument(row);
    const storedTemplate = object(storedDocument.template);
    const [itemRes, quoteRes, versionRes, templateRes, templateContentRes, signerRes, clientRes, billingPlanRes] = await Promise.all([
      supabase.from("finance_fee_agreement_items").select("id,source_quotation_item_id,description,unit,economic_classification,quantity,unit_price,vat_applicable,vat_rate,amount_before_tax,vat_amount,line_total,sort_order").eq("fee_agreement_id", id).order("sort_order").order("id"),
      row.source_quotation_id ? supabase.from("finance_quotations").select("id,quotation_no,status,issue_date,valid_until").eq("id", row.source_quotation_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      acceptedQuotationBasis ? Promise.resolve({ data: [], error: null }) : supabase.from("finance_fee_agreement_versions").select("id,version_no,event_type,reason,actor_name,actor_email,created_at").eq("fee_agreement_id", id).order("version_no", { ascending: false }),
      acceptedQuotationBasis ? Promise.resolve({ data: [], error: null }) : supabase.from("document_template_versions").select("id,language_code,version_no,document_templates!inner(name,template_code,document_type)").eq("status", "published").eq("document_templates.document_type", "fee_agreement").order("version_no", { ascending: false }),
      !acceptedQuotationBasis && row.selected_template_version_id && ["draft", "under_review"].includes(row.status)
        ? supabase.rpc("get_finance_fee_agreement_template_preview", { p_fee_agreement_id: id })
        : Promise.resolve({ data: storedTemplate, error: null }),
      acceptedQuotationBasis ? Promise.resolve({ data: [], error: null }) : supabase.from("finance_authorized_signers").select("id,signer_key,display_name,nickname,position_th,position_en,email,signature_storage_path,is_active,is_default,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
      row.client_id ? supabase.from("clients").select("id,name,client_type,contact_name").eq("id", row.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("finance_billing_plans").select("id,status").eq("fee_agreement_id", id).neq("status", "cancelled").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (itemRes.error || quoteRes.error || versionRes.error || templateRes.error || templateContentRes.error || signerRes.error || clientRes.error || billingPlanRes.error) setError(uiMessage("finance.feeAgreement.workspace.error.partialLoad"));
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
    const proposedSignatories = acceptedQuotationBasis ? nextLegal.signatories : nextLegal.signatories.length ? nextLegal.signatories : buildInitialFeeAgreementSignatories(nextClientContext, activeSigners);
    setAgreement(row); setItems((itemRes.data || []) as Item[]); setQuote((quoteRes.data || null) as Quote | null); setVersions((versionRes.data || []) as Version[]); setTemplates((templateRes.data || []) as Template[]);
    setBillingPlan((billingPlanRes.data || null) as BillingPlanReference | null);
    setTemplateContent(object(templateContentRes.data)); setAuthorizedSigners(activeSigners); setClientContext(nextClientContext);
    const nextLegalState = { ...nextLegal, signatories: proposedSignatories };
    setMetadata(nextMetadata); setLegal(nextLegalState);
    setSavedBaseline(agreementFingerprint(nextMetadata, nextLegalState, row)); setLoading(false);
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const setMeta = (next: MetadataForm) => { setMetadata(next); };
  const setLegalForm = (next: LegalForm) => { setLegal(next); };
  const saveAgreement = async () => {
    if (!agreement || !editable || saveLock.current) return;
    if (!dirty) { setMessage(uiMessage("finance.feeAgreement.workspace.save.noChanges")); return; }
    if (!metadata.title.trim()) { setError(uiMessage("finance.feeAgreement.workspace.error.titleRequired")); return; }
    if (metadata.effectiveDate && metadata.expiryDate && metadata.expiryDate < metadata.effectiveDate) { setError(uiMessage("finance.feeAgreement.workspace.error.expiryBeforeEffective")); return; }
    const templateSelected = Boolean(legal.templateVersionId);
    const signatoryError = validateSignatories(legal.signatories, clientContext); const clauseError = templateSelected ? "" : validateClauses(legal.clauses);
    if (signatoryError || clauseError) { setError(signatoryError || clauseError || ""); return; }
    const payload = agreementSavePayload(metadata, legal, agreement);
    saveLock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("save_finance_fee_agreement_draft_atomic", { p_fee_agreement_id: agreement.id, ...payload });
      if (result.error) setError(mapRpcError(result.error.message));
      else { await load(); setMessage(uiMessage("finance.invoice.ui.saved")); }
    } catch (saveError) {
      console.error("Failed to save fee agreement draft", saveError);
      setError(uiMessage("finance.feeAgreement.workspace.error.save"));
    } finally {
      saveLock.current = false; setSaving(false);
    }
  };
  const openOrCreateBillingPlan = async () => {
    const eligible = agreement?.engagement_basis === "accepted_quotation" ? agreement.status === "engagement_confirmed" : Boolean(agreement && ["signed", "completed"].includes(agreement.status));
    if (!agreement || !permissions.canEditFinanceQuotation || !eligible || billingPlanCreateLock.current) return;
    if (billingPlan) { router.push(`/finance/billing-plans/${billingPlan.id}`); return; }

    billingPlanCreateLock.current = true; setBillingPlanCreating(true); setError(""); setMessage("");
    try {
      const existing = await supabase.from("finance_billing_plans").select("id,status").eq("fee_agreement_id", agreement.id).neq("status", "cancelled").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) { router.push(`/finance/billing-plans/${existing.data.id}`); return; }

      const draft = buildBillingPlanDraftFromFeeAgreement({
        agreementNo: agreement.agreement_no,
        agreementTitle: agreement.title,
        billingMethod: agreement.billing_method,
        engagementBasis: agreement.engagement_basis,
        sourceDocumentSnapshot: agreement.source_document_snapshot_json,
        agreementItems: items,
      });
      if (!draft.ok) { setError(draft.message); return; }

      const created = await supabase.rpc("save_finance_billing_plan_draft", {
        p_billing_plan_id: null,
        p_fee_agreement_id: agreement.id,
        p_title: draft.payload.title,
        p_description: draft.payload.description,
        p_billing_method: draft.payload.billingMethod,
        p_recurring_config_json: draft.payload.recurringConfig,
        p_installments: draft.payload.installments,
      });
      if (created.error) {
        const resolved = await supabase.from("finance_billing_plans").select("id,status").eq("fee_agreement_id", agreement.id).neq("status", "cancelled").order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (!resolved.error && resolved.data) { router.push(`/finance/billing-plans/${resolved.data.id}`); return; }
        throw created.error;
      }
      router.push(`/finance/billing-plans/${String(created.data)}`);
    } catch (billingPlanError) {
      console.error("Failed to create or resolve Billing Plan", billingPlanError);
      setError(mapBillingPlanError(billingPlanError));
    } finally {
      billingPlanCreateLock.current = false; setBillingPlanCreating(false);
    }
  };
  const cancelAcceptedQuotationEngagement = async () => {
    if (!agreement || agreement.engagement_basis !== "accepted_quotation" || agreement.status !== "engagement_confirmed" || acceptedEngagementCancelLock.current) return;
    const reason = window.prompt(tr("finance.feeAgreement.workspace.engagement.cancelReason"));
    if (!reason?.trim()) return;
    if (!window.confirm(tr("finance.feeAgreement.workspace.engagement.cancelConfirmation"))) return;
    acceptedEngagementCancelLock.current = true; setLifecycleSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("cancel_finance_accepted_quotation_engagement", { p_fee_agreement_id: agreement.id, p_reason: reason.trim() });
      if (result.error) throw result.error;
      await load(); setMessage(uiMessage("finance.feeAgreement.workspace.engagement.cancelled"));
    } catch (cancelError) {
      console.error("Failed to cancel accepted quotation engagement", cancelError);
      setError(mapAcceptedEngagementCancellationError(cancelError));
    } finally {
      acceptedEngagementCancelLock.current = false; setLifecycleSaving(false);
    }
  };
  const changeStatus = async (next: FeeAgreementLifecycleTarget) => {
    if (!agreement || !permissions.canEditFinanceQuotation || lifecycleSaving || paperSigningLock.current) return;
    if (next === "signed") { openPaperSigning(); return; }
    if (dirty) { setError(uiMessage("finance.feeAgreement.workspace.error.saveBeforeReview")); return; }
    if (next === "sent" && readinessIssues.length) { setError(uiMessage("finance.feeAgreement.workspace.error.notReadyToSend")); return; }
    if (!window.confirm(feeAgreementLifecycleConfirmation(next, locale))) return;
    setLifecycleSaving(true); setError(""); setMessage("");
    const result = await supabase.rpc("set_finance_fee_agreement_status", { p_fee_agreement_id: agreement.id, p_next_status: next });
    if (result.error) setError(mapRpcError(result.error.message)); else { await load(); setMessage(uiMessage(next === "sent" || next === "completed" ? "finance.feeAgreement.success." + next : "finance.feeAgreement.workspace.lifecycleSaved." + next)); }
    setLifecycleSaving(false);
  };
  const setPaperSigningFieldError = (key: PaperSigningErrorKey, value: UiMessage | string = "") => {
    setPaperSigningErrors((current) => {
      const next = { ...current };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
  };
  const resetPaperSigning = () => {
    setPaperSigning(emptyPaperSigningForm); setPaperSigningErrors({}); setEvidenceFile(null); setPaperSigningOpen(false);
    if (evidenceFileInputRef.current) evidenceFileInputRef.current.value = "";
  };
  const openPaperSigning = () => {
    if (!agreement || agreement.status !== "sent") return;
    if (normalizeFeeAgreementExecutionMode(agreement.execution_mode) !== "paper") {
      setError(uiMessage("finance.feeAgreement.workspace.error.electronicUnavailable"));
      return;
    }
    setError(""); setMessage(""); setPaperSigning(emptyPaperSigningForm); setPaperSigningErrors({}); setEvidenceFile(null); setPaperSigningOpen(true);
    window.setTimeout(() => paperSigningPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const recordPaperSigning = async () => {
    if (!agreement || agreement.status !== "sent" || paperSigningLock.current) return;
    const nextErrors: PaperSigningErrors = {};
    if (!paperSigning.executedOn) nextErrors.executedOn = uiMessage("finance.feeAgreement.workspace.error.signingDateRequired");
    if (evidenceFile) {
      const fileError = feeAgreementEvidenceFileError(evidenceFile);
      if (fileError) nextErrors.evidenceFile = fileError;
    }
    const namedSignerCount = (partyType: "client" | "firm" | "witness") => legal.signatories.filter((signatory) => signatory.party_type === partyType && signatory.name.trim()).length;
    const missingSigners = {
      client: Math.max(0, minimumClientSigners - namedSignerCount("client")),
      firm: Math.max(0, minimumFirmSigners - namedSignerCount("firm")),
      witness: Math.max(0, minimumWitnesses - namedSignerCount("witness")),
    };
    if (Object.values(missingSigners).some((count) => count > 0)) nextErrors.signatories = uiMessage("finance.feeAgreement.workspace.signing.missingCounts", missingSigners);
    if (!paperSigning.verificationConfirmed) nextErrors.verification = uiMessage("finance.feeAgreement.workspace.error.verificationRequired");
    if (Object.keys(nextErrors).length) {
      setPaperSigningErrors(nextErrors); setError("");
      const firstInvalid = (["executedOn", "evidenceFile", "signatories", "verification"] as PaperSigningErrorKey[]).find((key) => nextErrors[key]);
      window.setTimeout(() => {
        const target = firstInvalid === "executedOn" ? executedOnInputRef.current : firstInvalid === "evidenceFile" ? evidenceFileInputRef.current : firstInvalid === "signatories" ? signingPartySummaryRef.current : verificationInputRef.current;
        target?.focus?.({ preventScroll: true }); target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }
    setPaperSigningErrors({});

    paperSigningLock.current = true; setPaperSigningSaving(true); setError(""); setMessage("");
    const storagePath = evidenceFile ? buildFeeAgreementEvidencePath(agreement.id, evidenceFile.type) : null;
    let uploaded = false;
    try {
      let sha256: string | null = null;
      if (evidenceFile && storagePath) {
        sha256 = await calculateSha256(evidenceFile);
        const upload = await supabase.storage.from(FEE_AGREEMENT_EVIDENCE_BUCKET).upload(storagePath, evidenceFile, { contentType: evidenceFile.type, upsert: false });
        if (upload.error) { setError(uiMessage("finance.feeAgreement.workspace.error.upload")); console.error("Failed to upload Fee Agreement signing evidence", upload.error); return; }
        uploaded = true;
      }
      const result = await supabase.rpc("record_finance_fee_agreement_paper_signed", {
        p_fee_agreement_id: agreement.id,
        p_executed_on: paperSigning.executedOn,
        p_evidence_storage_path: storagePath,
        p_evidence_filename: evidenceFile?.name || null,
        p_evidence_mime_type: evidenceFile?.type || null,
        p_evidence_size_bytes: evidenceFile?.size || null,
        p_evidence_sha256: sha256,
        p_verification_confirmed: paperSigning.verificationConfirmed,
        p_evidence_note: paperSigning.note.trim() || null,
        p_evidence_reference: paperSigning.reference.trim() || null,
      });
      if (result.error) {
        console.error("Failed to record Fee Agreement paper signing evidence", result.error);
        setError(mapSigningError(result.error.message));
        const cleanup = storagePath ? await supabase.storage.from(FEE_AGREEMENT_EVIDENCE_BUCKET).remove([storagePath]) : null;
        if (cleanup?.error) console.warn("Unable to remove orphan Fee Agreement signing evidence", { storagePath, error: cleanup.error });
        return;
      }
      uploaded = false;
      resetPaperSigning(); await load(); setMessage(uiMessage("finance.feeAgreement.workspace.signing.saved"));
    } catch (signingError) {
      console.error("Unexpected Fee Agreement paper signing failure", signingError);
      setError(uiMessage("finance.feeAgreement.workspace.error.signingSave"));
      if (uploaded && storagePath) {
        const cleanup = await supabase.storage.from(FEE_AGREEMENT_EVIDENCE_BUCKET).remove([storagePath]);
        if (cleanup.error) console.warn("Unable to remove orphan Fee Agreement signing evidence", { storagePath, error: cleanup.error });
      }
    } finally {
      paperSigningLock.current = false; setPaperSigningSaving(false);
    }
  };
  const openSignedEvidence = async () => {
    if (!agreement || evidenceOpening) return;
    const evidenceFileData = object(object(agreement.signed_evidence_json).evidence_file);
    const storagePath = text(evidenceFileData.storage_path, "");
    if (!storagePath) { setError(uiMessage("finance.feeAgreement.workspace.error.evidenceNotFound")); return; }
    setEvidenceOpening(true); setError("");
    const result = await supabase.storage.from(FEE_AGREEMENT_EVIDENCE_BUCKET).createSignedUrl(storagePath, 60 * 5);
    setEvidenceOpening(false);
    if (result.error) { console.error("Unable to open Fee Agreement signing evidence", result.error); setError(uiMessage("finance.feeAgreement.workspace.error.evidenceOpen")); return; }
    const anchor = window.document.createElement("a"); anchor.href = result.data.signedUrl; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.click();
  };
  const mismatch = useMemo(() => agreement ? satang(items.reduce((sum, item) => sum + amount(item.line_total), 0)) !== satang(agreement.total_amount) : false, [agreement, items]);
  const templateMode = Boolean(legal.templateVersionId);
  const templateContentMatchesSelection = templateMode && text(templateContent.template_version_id, "") === legal.templateVersionId;
  const selectedTemplate = templates.find((template) => template.id === legal.templateVersionId);
  const selectedTemplateName = templateContentMatchesSelection
    ? templateDisplayName(templateContent, locale)
    : selectedTemplate
      ? `${selectedTemplate.document_templates?.template_code || tr("settings.documents.templates.template")} v${selectedTemplate.version_no} — ${selectedTemplate.document_templates?.name || ""}`
      : tr("finance.feeAgreement.workspace.template.selected");
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
    if (dirty) issues.push(tr("finance.feeAgreement.workspace.readiness.save"));
    if (!agreement.title.trim()) issues.push(tr("finance.feeAgreement.workspace.readiness.title"));
    if (!text(agreement.client_snapshot_json?.name, text(agreement.client_snapshot_json?.display_name, ""))) issues.push(tr("finance.feeAgreement.workspace.readiness.client"));
    if (!agreement.agreement_no) issues.push(tr("finance.feeAgreement.workspace.readiness.number"));
    if (!agreement.agreement_date) issues.push(tr("finance.feeAgreement.workspace.readiness.agreementDate"));
    if (!items.length) issues.push(tr("finance.feeAgreement.workspace.readiness.items"));
    if (!Number.isFinite(amount(agreement.total_amount)) || amount(agreement.total_amount) < 0) issues.push(tr("finance.feeAgreement.workspace.readiness.amount"));
    if (mismatch) issues.push(tr("finance.feeAgreement.workspace.readiness.totals"));
    if (!agreement.language_code) issues.push(tr("finance.feeAgreement.workspace.readiness.language"));
    if (!agreement.effective_date) issues.push(tr("finance.feeAgreement.workspace.readiness.effectiveDate"));
    const namedSigners = (partyType: "client" | "firm" | "witness") => signatories.filter((row) => row.party_type === partyType && row.name.trim()).length;
    if (namedSigners("client") < minimumClientSigners) issues.push(tr("finance.feeAgreement.workspace.readiness.clientSigners", { count: minimumClientSigners }));
    if (namedSigners("firm") < minimumFirmSigners) issues.push(tr("finance.feeAgreement.workspace.readiness.firmSigners", { count: minimumFirmSigners }));
    if (namedSigners("witness") < minimumWitnesses) issues.push(tr("finance.feeAgreement.workspace.readiness.witnesses", { count: minimumWitnesses }));
    if (!legal.templateVersionId && !coreTerms.some((value) => value.trim())) issues.push(tr("finance.feeAgreement.workspace.readiness.terms"));
    return issues;
  })();
  if (loading) return <main style={page}>{tr("finance.feeAgreement.list.loading")}</main>; if (!agreement) return <main style={page}>{uiText(error) || tr("finance.feeAgreement.workspace.error.notFound")}</main>;
  const source = object(agreement.source_document_snapshot_json); const commercialSnapshot = object(agreement.commercial_terms_snapshot_json); const commercial = object(commercialSnapshot.commercial); const sourceQuotationNo = text(source.quotation_no, quote?.quotation_no || text(agreement.source_reference)); const client = text(agreement.client_snapshot_json?.name, text(agreement.client_snapshot_json?.display_name)); const matter = text(agreement.matter_snapshot_json?.title, text(agreement.matter_snapshot_json?.file_no, agreement.case_id || agreement.advisory_matter_id ? "-" : tr("finance.feeAgreement.workspace.matter.client"))); const title = isDefaultTitle(agreement.title) ? defaultTitle : agreement.title;
  const signingEvidence = object(agreement.signed_evidence_json); const signingEvidenceFile = object(signingEvidence.evidence_file); const signingRecordedBy = object(signingEvidence.recorded_by); const hasSigningEvidenceFile = text(signingEvidenceFile.storage_path, "") !== "";
  const availableLifecycleActions = lifecycleActions(agreement.status, locale);
  const forwardLifecycleActions = availableLifecycleActions.filter((action) => action.status !== "cancelled");
  const destructiveLifecycleActions = availableLifecycleActions.filter((action) => action.status === "cancelled");
  const primaryLifecycleActions = agreement.status === "signed" ? [] : forwardLifecycleActions;
  const signedClosureAction = agreement.status === "signed" ? forwardLifecycleActions.find((action) => action.status === "completed") : undefined;
  const billingPlanDescription = billingPlanNextStepDescription(billingPlan, undefined, locale);
  if (agreement.engagement_basis === "accepted_quotation") {
    return <AcceptedQuotationEngagementWorkspace
      agreement={agreement}
      items={items}
      quote={quote}
      billingPlan={billingPlan}
      permissions={permissions}
      error={uiText(error)}
      message={uiText(message)}
      billingPlanCreating={billingPlanCreating}
      cancelling={lifecycleSaving}
      onOpenBillingPlan={() => void openOrCreateBillingPlan()}
      onCancel={() => void cancelAcceptedQuotationEngagement()}
    />;
  }
  return <main style={page}><FinanceSubNav activePage="fee-agreements" permissions={permissions as never} /><nav className="fee-agreement-navigation-toolbar" style={navigationToolbar} aria-label={tr("finance.feeAgreement.workspace.nav.label")}><div className="fee-agreement-navigation-group" style={navigationGroup}><Link className="fee-agreement-navigation-link fee-agreement-navigation-back" style={{ ...navigationLink, ...navigationBackLink }} href="/finance/fee-agreements"><NavigationIcon name="back" /><span>{tr("finance.feeAgreement.workspace.nav.back")}</span></Link>{agreement.source_quotation_id ? <Link className="fee-agreement-navigation-link fee-agreement-navigation-source" style={{ ...navigationLink, ...navigationSourceLink }} href={`/finance/quotations/${agreement.source_quotation_id}`}><NavigationIcon name="source" /><span>{tr("finance.invoice.ui.openQuotation")}</span></Link> : null}</div><div className="fee-agreement-navigation-group fee-agreement-output-group" style={{ ...navigationGroup, ...outputGroup }} aria-label={tr("finance.feeAgreement.workspace.nav.preview")}><Link className="fee-agreement-navigation-link fee-agreement-navigation-preview" style={{ ...navigationLink, ...navigationPreviewLink }} href={`/finance/fee-agreements/${agreement.id}/preview`}><NavigationIcon name="preview" /><span>{tr("finance.invoice.ui.preview")}</span></Link><Link className="fee-agreement-navigation-link fee-agreement-navigation-print" style={{ ...navigationLink, ...navigationPrintLink }} href={`/finance/fee-agreements/${agreement.id}/preview?print=1`}><NavigationIcon name="print" /><span>{tr("finance.invoice.ui.print")}</span></Link></div></nav>{error ? <div style={warning}>{uiText(error)}</div> : null}{message ? <div style={success}>{uiText(message)}</div> : null}
    <header className="fee-agreement-document-header" style={documentHeader}><div><p style={eyebrow}>{tr("finance.feeAgreement.workspace.header")}</p><h1 style={documentTitle}>{title}</h1><p style={documentNumber}>{agreement.agreement_no || tr("finance.feeAgreement.unnumbered")}</p></div><div style={headerMeta}><StatusBadge status={agreement.status} /><span>{tr("finance.feeAgreement.workspace.version.value", { number: agreement.document_version || 0 })}</span><span>{agreement.language_code === "en" ? tr("finance.feeAgreement.language.en") : tr("finance.feeAgreement.workspace.language.thai")}</span><span>{tr("finance.feeAgreement.workspace.updated.value", { date: date(agreement.updated_at, locale) })}</span>{agreement.source_quotation_id ? <Link href={`/finance/quotations/${agreement.source_quotation_id}`}>{tr("finance.feeAgreement.workspace.source.value", { number: sourceQuotationNo })}</Link> : <span>{tr("finance.feeAgreement.workspace.source.value", { number: sourceQuotationNo })}</span>}</div></header>
    {editable ? <div style={saveBar}><span style={dirty ? savePending : saveComplete}>{dirty ? tr("finance.payment.ui.unsaved") : tr("finance.taxInvoice.ui.latestSaved")}</span><button style={{ ...primarySaveButton, ...(saving || !dirty ? disabledPrimarySaveButton : {}) }} disabled={saving || !dirty} onClick={() => void saveAgreement()}>{saveButtonLabel(dirty, saving, locale)}</button></div> : null}
    <section style={card}>
      <h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.documentInformation")}</h2>
      <div style={grid}><Field label={tr("finance.taxInvoice.ui.status")} value={<StatusBadge status={agreement.status} />} /><Field label={tr("finance.invoice.ui.language")} value={agreement.language_code === "en" ? tr("finance.feeAgreement.language.en") : tr("finance.invoice.ui.thai")} /><Field label={tr("finance.feeAgreement.workspace.documentVersion")} value={agreement.document_version} /><Field label={tr("finance.feeAgreement.signers.signingMode")} value={tr("finance.feeAgreement.workspace.execution." + normalizeFeeAgreementExecutionMode(agreement.execution_mode))} /><Field label={tr("finance.feeAgreement.workspace.agreementDate")} value={date(agreement.agreement_date, locale)} /><Field label={tr("finance.feeAgreement.effectiveDate")} value={date(agreement.effective_date, locale)} /><Field label={tr("finance.feeAgreement.workspace.commencementDate")} value={date(agreement.commencement_date, locale)} /><Field label={tr("finance.feeAgreement.workspace.expiryDate")} value={date(agreement.expiry_date, locale)} /></div>
      {editable ? <>
        <div className="fee-agreement-document-info-grid" style={documentInformationGrid}>
          <Input label={tr("finance.feeAgreement.workspace.agreementTitle")} value={metadata.title} disabled={saving} onChange={(title) => setMeta({ ...metadata, title })} />
          <Input label={tr("finance.feeAgreement.workspace.agreementDate")} type="date" value={metadata.agreementDate} disabled={saving} onChange={(agreementDate) => setMeta({ ...metadata, agreementDate })} />
          <Input label={tr("finance.feeAgreement.effectiveDate")} type="date" value={metadata.effectiveDate} disabled={saving} onChange={(effectiveDate) => setMeta({ ...metadata, effectiveDate })} />
          <Input label={tr("finance.feeAgreement.workspace.commencementDate")} type="date" value={legal.commencementDate} disabled={saving} onChange={(commencementDate) => setLegalForm({ ...legal, commencementDate })} />
          <div className="fee-agreement-expiry-field">
            <Input label={tr("finance.feeAgreement.workspace.expiryDate")} type="date" value={metadata.expiryDate} disabled={saving} onChange={(expiryDate) => setMeta({ ...metadata, expiryDate })} />
          </div>
          <div className="fee-agreement-execution-mode-field" style={executionModeField}>
            <label style={labelStyle}>{tr("finance.feeAgreement.signers.signingMode")}<select style={input} value={metadata.executionMode} disabled={saving} onChange={(event) => setMeta({ ...metadata, executionMode: event.target.value as MetadataForm["executionMode"] })}>
                <option value="paper">{tr("finance.feeAgreement.workspace.execution.paper")}</option>
                <option value="electronic" disabled>{tr("finance.feeAgreement.workspace.execution.electronic")}</option>
              </select>
            </label>
            <div style={executionModeHelp}>
              <span>{tr("finance.feeAgreement.workspace.execution.help")}</span>
              <strong style={comingSoonText}>{tr("finance.feeAgreement.workspace.execution.comingSoon")}</strong>
            </div>
          </div>
        </div>
        <p style={dateHelp}>{tr("finance.feeAgreement.workspace.dates.help")}</p>
        {metadata.executionMode === "electronic" ? <div style={warning}>{tr("finance.feeAgreement.workspace.execution.historical")}</div> : null}
      </> : null}
    </section>
    <section style={card}><h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.source.heading")}</h2><p style={notice}>{tr("finance.feeAgreement.workspace.source.readOnly")}</p><div style={grid}><Field label={tr("finance.payment.ui.client")} value={client} /><Field label={tr("finance.billingPlan.matter")} value={matter} /><Field label={tr("finance.invoice.sourceQuotation")} value={agreement.source_quotation_id ? <Link href={`/finance/quotations/${agreement.source_quotation_id}`}>{sourceQuotationNo}</Link> : sourceQuotationNo} /><Field label={tr("finance.feeAgreement.workspace.source.quotationStatus")} value={quoteStatus(quote?.status || source.status, locale)} /></div></section>
    <section style={card}><h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.scope.heading")}</h2><SnapshotText label={tr("finance.feeAgreement.workspace.scope.work")} value={commercial.scope_of_legal_services || source.scope_of_legal_services} /><SnapshotText label={tr("finance.feeAgreement.workspace.scope.included")} value={commercial.included_services || source.included_services} /><SnapshotText label={tr("finance.feeAgreement.workspace.scope.excluded")} value={commercial.excluded_services || source.excluded_services} /></section>
    <section style={card}><h2 style={sectionTitle}>{tr("finance.invoice.ui.feeItems")}</h2>{items.length ? <ItemsTable items={items} currency={agreement.currency} /> : <div style={warning}>{tr("finance.feeAgreement.workspace.items.empty")}</div>}</section>
    <section style={card}><h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.totals.heading")}</h2>{mismatch ? <div style={warning}>{tr("finance.feeAgreement.workspace.totals.mismatch")}</div> : null}<div style={summaryGrid}><SummaryCard label={tr("finance.feeAgreement.workspace.totals.beforeVat")} value={money(agreement.amount_before_tax, agreement.currency, locale)} /><SummaryCard label="VAT" value={money(agreement.vat_amount, agreement.currency, locale)} /><SummaryCard label={tr("finance.feeAgreement.workspace.totals.agreement")} value={money(agreement.total_amount, agreement.currency, locale)} prominent /></div></section>
    <section style={card}><h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.paymentTerms")}</h2><PaymentTerms payment={object(source.payment_terms)} currency={agreement.currency} /></section>
    <section style={card}><h2 style={sectionTitle}>{templateMode ? tr("finance.feeAgreement.workspace.terms.template") : tr("finance.feeAgreement.workspace.terms.heading")}</h2>{editable ? <LegalTermsEditor value={legal} templates={templates} disabled={saving} onChange={setLegalForm} /> : null}{templateMode ? <><p style={notice}>{tr("finance.feeAgreement.workspace.template.provenance")}<strong>{selectedTemplateName}</strong></p>{hiddenLegacyWording || hiddenLegacyClauses ? <div style={warning}>{tr("finance.feeAgreement.workspace.template.legacyWording")}</div> : null}{templateContentMatchesSelection ? <ResolvedTemplateSections template={templateContent} variables={templateVariables} showProvenance uiLocale={locale} /> : dirty ? null : <div style={warning}>{tr("finance.feeAgreement.workspace.error.templateLoad")}</div>}</> : editable ? null : <LegalTermsReadOnly legal={agreement.legal_terms_json} />}</section>
    <section style={card}><h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.signatories")}</h2>{editable ? <FeeAgreementSignatoryEditor value={legal.signatories} client={clientContext} authorizedSigners={authorizedSigners} signatureRequirements={effectiveSignatureRequirements} disabled={saving} onChange={(signatories) => setLegalForm({ ...legal, signatories })} /> : <SignatoryList value={agreement.signatories_json || []} clientName={clientContext.name} />}</section>
    <section style={card}><h2 style={sectionTitle}>{templateMode ? tr("finance.feeAgreement.workspace.clauses.overrides") : tr("finance.feeAgreement.workspace.clauses.additional")}</h2>{templateMode ? <><p style={notice}>{tr("finance.feeAgreement.workspace.clauses.templateHelp")}</p>{templateContentMatchesSelection ? <TemplateAgreementChanges template={templateContent} uiLocale={locale} /> : null}</> : editable ? <ClauseEditor value={legal.clauses} disabled={saving} onChange={(clauses) => setLegalForm({ ...legal, clauses })} /> : <ClauseList value={agreement.custom_clauses_json || []} />}</section>
    <section style={card}><h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.internalNote.heading")}</h2>{editable ? <TextArea label={tr("finance.feeAgreement.workspace.internalNote.placeholder")} value={legal.internalNote} disabled={saving} onChange={(internalNote) => setLegalForm({ ...legal, internalNote })} /> : <p style={muted}>{tr("finance.feeAgreement.workspace.internalNote.hidden")}</p>}</section>
    {["signed", "completed"].includes(agreement.status) ? <section style={{ ...card, ...signingEvidenceSummary }}><div style={signingEvidenceHeading}><div><h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.signing.evidence")}</h2><p style={signingEvidenceIntro}>{tr("finance.feeAgreement.workspace.signing.evidenceHelp")}</p></div>{hasSigningEvidenceFile ? <button type="button" style={secondaryButton} disabled={evidenceOpening} onClick={() => void openSignedEvidence()}>{evidenceOpening ? tr("finance.feeAgreement.workspace.signing.opening") : tr("finance.feeAgreement.workspace.signing.openEvidence")}</button> : null}</div>{Object.keys(signingEvidence).length ? <><div style={grid}><Field label={tr("finance.feeAgreement.workspace.signing.actualDate")} value={date(agreement.executed_on || signingEvidence.executed_on, locale)} /><Field label={tr("finance.feeAgreement.workspace.signing.recordedBy")} value={text(signingRecordedBy.name, text(signingRecordedBy.email))} /><Field label={tr("finance.feeAgreement.workspace.signing.recordedAt")} value={dateTime(agreement.signed_at || signingEvidence.recorded_at, locale)} />{hasSigningEvidenceFile ? <><Field label={tr("finance.feeAgreement.workspace.signing.file")} value={text(signingEvidenceFile.file_name)} /><Field label={tr("finance.feeAgreement.workspace.signing.fileTypeSize")} value={`${text(signingEvidenceFile.mime_type)} · ${formatEvidenceFileSize(signingEvidenceFile.size_bytes)}`} /></> : null}<Field label={tr("finance.feeAgreement.workspace.signing.reference")} value={text(signingEvidence.reference, text(agreement.signed_evidence_reference))} /></div>{!hasSigningEvidenceFile ? <div style={optionalEvidenceNotice}>{tr("finance.feeAgreement.workspace.signing.noFile")}</div> : null}{text(signingEvidence.note, "") ? <div style={signingEvidenceNote}><strong>{tr("finance.feeAgreement.workspace.signing.note")}</strong><span>{text(signingEvidence.note)}</span></div> : null}</> : <div style={legacyEvidenceNotice}>{tr("finance.feeAgreement.workspace.signing.noHistorical")}</div>}</section> : null}
    <section style={{ ...card, ...workflowPanel }}><h2 style={sectionTitle}>{tr("finance.invoice.ui.documentStatus")}</h2>
      <div className="fee-agreement-workflow-overview" style={workflowOverview}>
        <div style={workflowStatusBlock}>
          <div style={workflowStatusHeading}><span style={workflowEyebrow}>{tr("finance.feeAgreement.workspace.lifecycle.currentStatus")}</span><StatusBadge status={agreement.status} prominent /></div>
          <p style={workflowDescription}>{feeAgreementStatusDescription(agreement.status, locale)}</p>
        </div>
        <div style={workflowPermission}><WorkflowIcon name="lock" /><span>{editable ? tr("finance.feeAgreement.workspace.lifecycle.editable") : tr("finance.feeAgreement.workspace.lifecycle.readOnly")}</span></div>
      </div>
      {dirty ? <div style={warning}>{tr("finance.feeAgreement.workspace.error.saveBeforeReview")}</div> : null}
      {agreement.status === "under_review" && readinessIssues.length ? <div style={warning}><strong>{tr("finance.feeAgreement.workspace.readiness.heading")}</strong><ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
      {permissions.canEditFinanceQuotation && agreement.status === "signed" ? <div className="fee-agreement-workflow-next" style={{ ...workflowNext, ...workflowFinanceNext }}>
        <div style={workflowNextCopy}><span style={{ ...workflowNextLabel, color: "#1d4ed8" }}>{tr("finance.billingPlan.nextStep")}</span><strong style={workflowNextTitle}>{billingPlan ? tr("finance.feeAgreement.workspace.billingPlan.continue") : tr("finance.feeAgreement.workspace.billingPlan.prepare")}</strong><span style={workflowNextDescription}>{billingPlanDescription}</span>{billingPlan ? <span style={financePlanStatus}>{tr("finance.feeAgreement.workspace.billingPlan.statusPrefix")}{" "}{billingPlanStatusLabel(billingPlan.status, locale)}</span> : null}</div>
        <div className="fee-agreement-workflow-primary-actions" style={workflowPrimaryActions}><button className="fee-agreement-finance-button" type="button" style={financeButton} disabled={billingPlanCreating} onClick={() => void openOrCreateBillingPlan()}><BillingPlanIcon />{billingPlanCreating ? tr("finance.feeAgreement.workspace.billingPlan.preparing") : billingPlan ? tr("finance.feeAgreement.workspace.billingPlan.open") : tr("finance.feeAgreement.workspace.billingPlan.create")}</button></div>
      </div> : null}
      {permissions.canEditFinanceQuotation && primaryLifecycleActions.length ? <div className="fee-agreement-workflow-next" style={workflowNext}>
        <div style={workflowNextCopy}><span style={workflowNextLabel}>{tr("finance.billingPlan.nextStep")}</span><strong style={workflowNextTitle}>{primaryLifecycleActions[0].label}</strong><span style={workflowNextDescription}>{feeAgreementActionDescription(primaryLifecycleActions[0].status, locale)}</span></div>
        <div className="fee-agreement-workflow-primary-actions" style={workflowPrimaryActions}>{primaryLifecycleActions.map((action) => <button className="fee-agreement-workflow-primary-button" key={action.status} style={workflowPrimaryButton} disabled={lifecycleSaving || paperSigningSaving || dirty || (action.status === "sent" && readinessIssues.length > 0) || (action.status === "signed" && normalizeFeeAgreementExecutionMode(agreement.execution_mode) !== "paper")} onClick={() => void changeStatus(action.status)}><WorkflowIcon name={workflowActionIcon(action.status)} />{lifecycleSaving || paperSigningSaving ? tr("finance.taxInvoice.ui.processing") : action.label}</button>)}</div>
      </div> : null}
      {agreement.status === "sent" && normalizeFeeAgreementExecutionMode(agreement.execution_mode) !== "paper" ? <div style={warning}>{tr("finance.feeAgreement.workspace.signing.electronicUnavailable")}</div> : null}
      {paperSigningOpen && agreement.status === "sent" ? <div ref={paperSigningPanelRef} className="fee-agreement-paper-signing-panel" style={paperSigningPanel}>
        <div><h3 style={paperSigningTitle}>{tr("finance.feeAgreement.workspace.signing.heading")}</h3><p style={paperSigningDescription}>{tr("finance.feeAgreement.workspace.signing.help")}</p></div>
        {Object.keys(paperSigningErrors).length ? <div role="alert" aria-live="assertive" style={paperSigningValidationSummary}><strong>{tr("finance.feeAgreement.workspace.signing.validationSummary")}</strong><ul style={paperSigningValidationList}>{Object.values(paperSigningErrors).map((validationError) => <li key={uiText(validationError || "")}>{uiText(validationError || "")}</li>)}</ul></div> : null}
        <div className="fee-agreement-paper-signing-grid" style={paperSigningGrid}>
          <label style={labelStyle}>{tr("finance.feeAgreement.workspace.signing.dateRequired")}<input ref={executedOnInputRef} style={{ ...input, ...(paperSigningErrors.executedOn ? invalidInput : {}) }} type="date" value={paperSigning.executedOn} aria-invalid={Boolean(paperSigningErrors.executedOn)} aria-describedby={paperSigningErrors.executedOn ? "paper-signing-executed-on-error" : undefined} disabled={paperSigningSaving} onChange={(event) => { const executedOn = event.target.value; setPaperSigning({ ...paperSigning, executedOn }); if (executedOn) setPaperSigningFieldError("executedOn"); }} />{paperSigningErrors.executedOn ? <span id="paper-signing-executed-on-error" style={fieldErrorText}>{uiText(paperSigningErrors.executedOn || "")}</span> : null}</label>
          <label style={labelStyle}>{tr("finance.feeAgreement.workspace.signing.optionalFile")}<input ref={evidenceFileInputRef} style={{ ...input, ...(paperSigningErrors.evidenceFile ? invalidInput : {}) }} type="file" accept="application/pdf,image/jpeg,image/png" aria-invalid={Boolean(paperSigningErrors.evidenceFile)} aria-describedby={paperSigningErrors.evidenceFile ? "paper-signing-evidence-file-error" : "paper-signing-evidence-file-help"} disabled={paperSigningSaving} onChange={(event) => { const file = event.target.files?.[0] || null; setEvidenceFile(file); setPaperSigningFieldError("evidenceFile", file ? feeAgreementEvidenceFileError(file) : ""); }} /><span id="paper-signing-evidence-file-help" style={fieldHelp}>{tr("finance.feeAgreement.workspace.signing.fileHelp")}</span>{paperSigningErrors.evidenceFile ? <span id="paper-signing-evidence-file-error" style={fieldErrorText}>{uiText(paperSigningErrors.evidenceFile || "")}</span> : null}</label>
          <label style={labelStyle}>{tr("finance.feeAgreement.workspace.signing.optionalReference")}<input style={input} value={paperSigning.reference} maxLength={500} disabled={paperSigningSaving} onChange={(event) => setPaperSigning({ ...paperSigning, reference: event.target.value })} /><span style={fieldHelp}>{tr("finance.feeAgreement.workspace.signing.referencePlaceholder")}</span></label>
          <label style={labelStyle}>{tr("finance.feeAgreement.workspace.signing.optionalNote")}<textarea style={{ ...input, minHeight: 82, resize: "vertical" }} value={paperSigning.note} maxLength={4000} disabled={paperSigningSaving} onChange={(event) => setPaperSigning({ ...paperSigning, note: event.target.value })} /></label>
        </div>
        <div ref={signingPartySummaryRef} tabIndex={-1} style={paperSigningErrors.signatories ? invalidSection : undefined}><SigningPartySummary signatories={legal.signatories} minimumClient={minimumClientSigners} minimumFirm={minimumFirmSigners} minimumWitness={minimumWitnesses} />{paperSigningErrors.signatories ? <div style={fieldErrorText}>{uiText(paperSigningErrors.signatories || "")}</div> : null}</div>
        <label style={{ ...verificationConfirmation, ...(paperSigningErrors.verification ? invalidConfirmation : {}) }}><input ref={verificationInputRef} type="checkbox" checked={paperSigning.verificationConfirmed} aria-invalid={Boolean(paperSigningErrors.verification)} aria-describedby={paperSigningErrors.verification ? "paper-signing-verification-error" : undefined} disabled={paperSigningSaving} onChange={(event) => { const verificationConfirmed = event.target.checked; setPaperSigning({ ...paperSigning, verificationConfirmed }); if (verificationConfirmed) setPaperSigningFieldError("verification"); }} /><span>{tr("finance.feeAgreement.workspace.signing.verification")}{paperSigningErrors.verification ? <span id="paper-signing-verification-error" style={fieldErrorText}>{uiText(paperSigningErrors.verification || "")}</span> : null}</span></label>
        <div style={paperSigningActions}><button type="button" style={secondaryButton} disabled={paperSigningSaving} onClick={resetPaperSigning}>{tr("finance.payment.ui.cancel")}</button><button className="fee-agreement-workflow-primary-button" type="button" style={workflowPrimaryButton} disabled={paperSigningSaving} onClick={() => void recordPaperSigning()}>{paperSigningSaving ? tr("finance.feeAgreement.workspace.signing.saving") : tr("finance.feeAgreement.workspace.signing.confirm")}</button></div>
      </div> : null}
      {permissions.canEditFinanceQuotation && destructiveLifecycleActions.length ? <div className="fee-agreement-workflow-destructive" style={workflowDestructive}><span style={workflowDestructiveLabel}>{tr("finance.taxInvoice.ui.otherActions")}</span><div>{destructiveLifecycleActions.map((action) => <button className="fee-agreement-workflow-cancel-button" key={action.status} style={workflowCancelButton} disabled={lifecycleSaving || paperSigningSaving || dirty} onClick={() => void changeStatus(action.status)}><WorkflowIcon name="cancel" />{lifecycleSaving || paperSigningSaving ? tr("finance.taxInvoice.ui.processing") : action.label}</button>)}</div></div> : null}
      {permissions.canEditFinanceQuotation && signedClosureAction ? <div className="fee-agreement-workflow-secondary" style={workflowSecondary}>
        <div style={workflowSecondaryCopy}><span style={workflowDestructiveLabel}>{tr("finance.taxInvoice.ui.otherActions")}</span><span style={workflowSecondaryDescription}>{tr("finance.feeAgreement.workspace.lifecycle.closeHelp")}</span></div>
        <button className="fee-agreement-workflow-secondary-button" type="button" style={workflowSecondaryButton} disabled={lifecycleSaving || paperSigningSaving || dirty} onClick={() => void changeStatus(signedClosureAction.status)}><WorkflowIcon name="completed" />{lifecycleSaving || paperSigningSaving ? tr("finance.taxInvoice.ui.processing") : signedClosureAction.label}</button>
      </div> : null}
    </section>
    {permissions.canEditFinanceQuotation && agreement.status === "completed" ? <section className="fee-agreement-finance-panel" style={{ ...card, ...financePanel }}>
      <div className="fee-agreement-finance-panel-content" style={financePanelContent}>
        <div><span style={financeEyebrow}>{tr("finance.feeAgreement.workspace.financeWork")}</span><h2 style={financeTitle}>{billingPlan ? tr("finance.feeAgreement.workspace.billingPlan.continue") : tr("finance.feeAgreement.workspace.billingPlan.create")}</h2><p style={financeDescription}>{billingPlanDescription}</p>{billingPlan ? <span style={financePlanStatus}>{tr("finance.feeAgreement.workspace.billingPlan.statusPrefix")}{" "}{billingPlanStatusLabel(billingPlan.status, locale)}</span> : null}</div>
        <button className="fee-agreement-finance-button" type="button" style={financeButton} disabled={billingPlanCreating} onClick={() => void openOrCreateBillingPlan()}><BillingPlanIcon />{billingPlanCreating ? tr("finance.feeAgreement.workspace.billingPlan.preparing") : billingPlan ? tr("finance.feeAgreement.workspace.billingPlan.open") : tr("finance.feeAgreement.workspace.billingPlan.create")}</button>
      </div>
    </section> : null}
    <section style={card}><h2 style={sectionTitle}>{tr("finance.feeAgreement.workspace.history.heading")}</h2>{versions.length ? <div style={scroll}><table style={table}><thead><tr><th>{tr("finance.feeAgreement.workspace.version")}</th><th>{tr("finance.feeAgreement.workspace.history.event")}</th><th>{tr("finance.feeAgreement.workspace.history.actor")}</th><th>{tr("finance.feeAgreement.workspace.history.date")}</th><th>{tr("finance.receipt.reason")}</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td>v{version.version_no}</td><td>{feeAgreementVersionEventLabel(version.event_type, locale)}</td><td>{version.actor_name || version.actor_email || "-"}</td><td>{dateTime(version.created_at, locale)}</td><td>{version.reason || "-"}</td></tr>)}</tbody></table></div> : <p style={muted}>{tr("finance.feeAgreement.workspace.history.empty")}</p>}</section>
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
    .fee-agreement-paper-signing-panel { scroll-margin-top: 84px; }
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
      .fee-agreement-paper-signing-grid { grid-template-columns: minmax(0, 1fr) !important; }
      .fee-agreement-workflow-primary-actions, .fee-agreement-workflow-primary-button { width: 100%; }
      .fee-agreement-finance-panel-content { align-items: stretch !important; flex-direction: column; }
      .fee-agreement-finance-button { width: 100%; }
      .fee-agreement-workflow-destructive, .fee-agreement-workflow-secondary { align-items: stretch !important; flex-direction: column; }
      .fee-agreement-workflow-cancel-button, .fee-agreement-workflow-secondary-button { width: 100%; }
    }
    .fee-agreement-workflow-primary-button, .fee-agreement-workflow-cancel-button, .fee-agreement-workflow-secondary-button { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
    .fee-agreement-workflow-primary-button:hover:not(:disabled) { background: #26334c !important; }
    .fee-agreement-workflow-cancel-button:hover:not(:disabled) { background: #fef2f2 !important; border-color: #fca5a5 !important; }
    .fee-agreement-workflow-secondary-button:hover:not(:disabled) { background: #f8fafc !important; border-color: #94a3b8 !important; }
    .fee-agreement-workflow-primary-button:focus-visible, .fee-agreement-workflow-cancel-button:focus-visible, .fee-agreement-workflow-secondary-button:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
    .fee-agreement-workflow-primary-button:disabled, .fee-agreement-workflow-cancel-button:disabled, .fee-agreement-workflow-secondary-button:disabled { cursor: not-allowed !important; opacity: .58; }
  `}</style></main>;
}

function AcceptedQuotationEngagementWorkspace({ agreement, items, quote, billingPlan, permissions, error, message, billingPlanCreating, cancelling, onOpenBillingPlan, onCancel }: { agreement: Agreement; items: Item[]; quote: Quote | null; billingPlan: BillingPlanReference | null; permissions: { canEditFinanceQuotation: boolean }; error: UiMessage | string; message: UiMessage | string; billingPlanCreating: boolean; cancelling: boolean; onOpenBillingPlan: () => void; onCancel: () => void }) {
  const { t: tr, text: uiText, locale } = useI18n();

  const source = object(agreement.source_document_snapshot_json);
  const commercialSnapshot = object(agreement.commercial_terms_snapshot_json);
  const commercial = object(commercialSnapshot.commercial);
  const sourceQuotationNo = text(source.quotation_no, quote?.quotation_no || text(agreement.source_reference));
  const client = text(agreement.client_snapshot_json?.name, text(agreement.client_snapshot_json?.display_name));
  const matter = text(agreement.matter_snapshot_json?.title, text(agreement.matter_snapshot_json?.file_no, agreement.case_id || agreement.advisory_matter_id ? "-" : tr("finance.invoice.ui.unlinkedMatter")));
  const billingDescription = billingPlanNextStepDescription(billingPlan, true, locale);
  const active = agreement.status === "engagement_confirmed";
  return <main className="accepted-engagement-workspace" style={page}>
    <FinanceSubNav activePage="fee-agreements" permissions={permissions as never} />
    <nav className="fee-agreement-navigation-toolbar" style={navigationToolbar} aria-label={tr("finance.feeAgreement.workspace.engagement.nav")}>
      <div className="fee-agreement-navigation-group" style={navigationGroup}>
        <Link className="fee-agreement-navigation-link fee-agreement-navigation-back" style={{ ...navigationLink, ...navigationBackLink }} href="/finance/fee-agreements"><NavigationIcon name="back" /><span>{tr("finance.feeAgreement.workspace.engagement.back")}</span></Link>
        {agreement.source_quotation_id ? <Link className="fee-agreement-navigation-link fee-agreement-navigation-source" style={{ ...navigationLink, ...navigationSourceLink }} href={`/finance/quotations/${agreement.source_quotation_id}`}><NavigationIcon name="source" /><span>{tr("finance.invoice.ui.openQuotation")}</span></Link> : null}
      </div>
    </nav>
    {error ? <div style={warning}>{uiText(error)}</div> : null}{message ? <div style={success}>{uiText(message)}</div> : null}
    <header className="accepted-engagement-hero" style={acceptedHero}>
      <div style={acceptedHeroIdentity}><p style={eyebrow}>{tr("finance.feeAgreement.workspace.engagement.eyebrow")}</p><h1 style={acceptedHeroTitle}>{tr("finance.invoice.ui.quotationEngagement")}</h1><p style={acceptedHeroReference}>{tr("finance.invoice.sourceQuotation")}{" "}<strong>{sourceQuotationNo}</strong></p></div>
      <div className="accepted-engagement-hero-status" style={acceptedHeroStatus}><StatusBadge status={agreement.status} prominent /><div style={acceptedHeroMeta}><span>{tr("finance.feeAgreement.workspace.engagement.confirmedOnPrefix")}{" "}{dateTime(agreement.engagement_confirmed_at, locale)}</span><span>{tr("finance.payment.ui.updated")}{" "}{dateTime(agreement.updated_at, locale)}</span></div></div>
    </header>
    <section style={{ ...card, ...acceptedEvidenceCard }}>
      <div style={acceptedSectionHeading}><div><span style={financeEyebrow}>{tr("finance.feeAgreement.workspace.engagement.evidence")}</span><h2 style={acceptedSectionTitle}>{tr("finance.feeAgreement.workspace.engagement.confirmation")}</h2></div><StatusBadge status={agreement.status} prominent /></div>
      <div className="accepted-engagement-evidence-grid" style={acceptedEvidenceGrid}>
        <Field label={tr("finance.payment.ui.client")} value={client} />
        <Field label={tr("finance.invoice.ui.matter")} value={agreement.case_id ? <Link href={`/cases/${agreement.case_id}`}>{matter}</Link> : agreement.advisory_matter_id ? <Link href={`/advisory/${agreement.advisory_matter_id}`}>{matter}</Link> : matter} />
        <Field label={tr("finance.feeAgreement.workspace.engagement.date")} value={date(agreement.engagement_confirmed_on, locale)} />
        <Field label={tr("finance.feeAgreement.workspace.engagement.channel")} value={engagementChannelLabel(agreement.engagement_confirmation_channel, locale)} />
        <Field label={tr("finance.invoice.sourceQuotation")} value={agreement.source_quotation_id ? <Link href={`/finance/quotations/${agreement.source_quotation_id}`}>{sourceQuotationNo}</Link> : sourceQuotationNo} />
        <Field label={tr("finance.feeAgreement.workspace.source.quotationStatus")} value={quoteStatus(quote?.status || source.status, locale)} />
      </div>
      {agreement.engagement_confirmation_note ? <div style={acceptedConfirmationNote}><strong>{tr("finance.feeAgreement.workspace.engagement.note")}</strong><span>{agreement.engagement_confirmation_note}</span></div> : null}
      <p style={acceptedEvidenceNotice}>{tr("finance.feeAgreement.workspace.engagement.help")}</p>
      {agreement.status === "cancelled" ? <div style={acceptedCancellationNotice}><strong>{tr("finance.invoice.ui.voidedAt")}{dateTime(agreement.cancelled_at, locale)}</strong><span>{agreement.cancel_reason || "-"}</span></div> : null}
    </section>
    <section style={acceptedWorkspaceSection}>
      <div style={acceptedWorkspaceHeading}><span style={acceptedSectionEyebrow}>{tr("finance.feeAgreement.workspace.engagement.scope")}</span><h2 style={acceptedWorkspaceTitle}>{tr("finance.feeAgreement.workspace.engagement.services")}</h2></div>
      <div style={acceptedScopeList}>
        <AcceptedScopeItem label={tr("finance.feeAgreement.workspace.scope.work")} value={commercial.scope_of_legal_services || source.scope_of_legal_services} />
        <AcceptedScopeItem label={tr("finance.feeAgreement.workspace.scope.included")} value={commercial.included_services || source.included_services} />
        <AcceptedScopeItem label={tr("finance.feeAgreement.workspace.scope.excluded")} value={commercial.excluded_services || source.excluded_services} />
      </div>
    </section>
    <section style={acceptedWorkspaceSection}>
      <div style={acceptedWorkspaceHeading}><span style={acceptedSectionEyebrow}>{tr("finance.feeAgreement.workspace.engagement.commercial")}</span><h2 style={acceptedWorkspaceTitle}>{tr("finance.feeAgreement.workspace.engagement.items")}</h2></div>
      {items.length ? <ItemsTable items={items} currency={agreement.currency} presentation="engagement" /> : <div style={warning}>{tr("finance.feeAgreement.workspace.engagement.noItems")}</div>}
      <div style={acceptedSummaryBlock}><h3 style={acceptedSummaryTitle}>{tr("finance.feeAgreement.workspace.totals.heading")}</h3><div className="accepted-engagement-summary-grid" style={acceptedSummaryGrid}><SummaryCard label={tr("finance.taxInvoice.vatSummary.beforeVat")} value={money(agreement.amount_before_tax, agreement.currency, locale)} /><SummaryCard label="VAT" value={money(agreement.vat_amount, agreement.currency, locale)} /><SummaryCard label={tr("finance.invoice.ui.total")} value={money(agreement.total_amount, agreement.currency, locale)} prominent /></div></div>
    </section>
    <section style={acceptedWorkspaceSection}>
      <div style={acceptedWorkspaceHeading}><span style={acceptedSectionEyebrow}>{tr("finance.feeAgreement.workspace.engagement.schedule")}</span><h2 style={acceptedWorkspaceTitle}>{tr("finance.feeAgreement.workspace.paymentTerms")}</h2></div>
      <PaymentTerms payment={object(source.payment_terms)} currency={agreement.currency} presentation="engagement" />
    </section>
    {permissions.canEditFinanceQuotation && active ? <section className="fee-agreement-finance-panel" style={{ ...card, ...financePanel, ...acceptedFinalAction }}><div className="fee-agreement-finance-panel-content" style={financePanelContent}><div><span style={financeEyebrow}>{tr("finance.billingPlan.nextStep")}</span><h2 style={financeTitle}>{billingPlan ? tr("finance.feeAgreement.workspace.billingPlan.continue") : tr("finance.feeAgreement.workspace.billingPlan.prepare")}</h2><p style={financeDescription}>{billingDescription}</p>{billingPlan ? <span style={financePlanStatus}>{tr("finance.feeAgreement.workspace.billingPlan.statusPrefix")}{" "}{billingPlanStatusLabel(billingPlan.status, locale)}</span> : null}</div><button className="fee-agreement-finance-button" type="button" style={financeButton} disabled={billingPlanCreating} onClick={onOpenBillingPlan}><BillingPlanIcon />{billingPlanCreating ? tr("finance.feeAgreement.workspace.billingPlan.preparing") : billingPlan ? tr("finance.feeAgreement.workspace.billingPlan.open") : tr("finance.feeAgreement.workspace.billingPlan.create")}</button></div></section> : null}
    {permissions.canEditFinanceQuotation && active ? <section className="accepted-engagement-other-actions" style={acceptedOtherActions}><div><span style={workflowDestructiveLabel}>{tr("finance.taxInvoice.ui.otherActions")}</span><p style={acceptedOtherActionCopy}>{tr("finance.feeAgreement.workspace.engagement.cancelHelp")}</p></div><button className="fee-agreement-workflow-cancel-button" type="button" style={workflowCancelButton} disabled={cancelling} onClick={onCancel}><WorkflowIcon name="cancel" />{cancelling ? tr("finance.taxInvoice.ui.processing") : tr("finance.feeAgreement.workspace.engagement.cancel")}</button></section> : null}
    <style jsx global>{`
      .fee-agreement-navigation-link { transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
      .fee-agreement-navigation-back:hover { background: #f8fafc !important; border-color: #94a3b8 !important; color: #172033 !important; }
      .fee-agreement-navigation-source:hover { background: #e0e7ff !important; border-color: #a5b4fc !important; color: #312e81 !important; }
      .fee-agreement-navigation-link:focus-visible, .fee-agreement-finance-button:focus-visible, .fee-agreement-workflow-cancel-button:focus-visible { outline: 3px solid rgba(37, 99, 235, .24); outline-offset: 2px; }
      .accepted-engagement-fee-table { table-layout: fixed; }
      .accepted-engagement-fee-table th { background: #f8fafc; color: #475569; font-size: 12px; font-weight: 750; line-height: 1.35; }
      .accepted-engagement-fee-table th, .accepted-engagement-fee-table td { padding: 10px 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .accepted-engagement-fee-table .is-index, .accepted-engagement-fee-table .is-quantity { text-align: center; }
      .accepted-engagement-fee-table .is-money { text-align: right; white-space: nowrap; }
      .accepted-engagement-fee-table .is-vat { text-align: center; white-space: nowrap; }
      .accepted-engagement-fee-table .is-description { overflow-wrap: anywhere; }
      .accepted-engagement-installments > * { min-width: 0; }
      @media (max-width: 720px) {
        .accepted-engagement-workspace { padding: 16px !important; }
        .fee-agreement-navigation-toolbar, .fee-agreement-finance-panel-content { align-items: stretch !important; flex-direction: column; }
        .fee-agreement-navigation-group { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; width: 100%; }
        .fee-agreement-navigation-link, .fee-agreement-finance-button, .fee-agreement-workflow-cancel-button { width: 100%; white-space: normal; }
        .accepted-engagement-hero, .accepted-engagement-evidence-grid, .accepted-engagement-summary-grid, .accepted-engagement-installments { grid-template-columns: minmax(0, 1fr) !important; }
        .accepted-engagement-hero-status { justify-items: start !important; text-align: left !important; }
        .accepted-engagement-other-actions { align-items: stretch !important; flex-direction: column; }
      }
      @media (max-width: 480px) {
        .accepted-engagement-installment-header { align-items: stretch !important; flex-direction: column; }
        .accepted-engagement-installment-total { justify-items: start !important; }
        .accepted-engagement-installment-conditions { grid-template-columns: minmax(0, 1fr) !important; }
      }
    `}</style>
  </main>;
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
function saveButtonLabel(isDirty: boolean, isSaving: boolean, locale: UiLocale = "th") { const tr = (key: string, parameters?: MessageParameters) => translate(locale, key, parameters);  if (isSaving) return tr("finance.payment.ui.saving"); return isDirty ? tr("finance.payment.ui.saveChanges") : tr("finance.payment.ui.savedState"); }
function legalFrom(agreement: Agreement): LegalForm { const legal = object(agreement.legal_terms_json); const signs = parseSignatories(agreement.signatories_json); const clauses = parseClauses(agreement.custom_clauses_json); return { language: agreement.language_code || "th", commencementDate: agreement.commencement_date || "", templateVersionId: agreement.selected_template_version_id || "", scopeClarification: text(legal.scope_clarification, ""), clientObligations: text(legal.client_obligations, ""), firmObligations: text(legal.firm_obligations, ""), exclusions: text(legal.exclusions, ""), expenses: text(legal.expenses_disbursements, ""), confidentiality: text(legal.confidentiality, ""), termination: text(legal.termination_provisions, ""), dispute: text(legal.dispute_jurisdiction, ""), additionalTerms: text(legal.additional_terms, ""), internalNote: text(legal.internal_note, ""), signatories: signs.rows, clauses: clauses.rows, warnings: [...signs.warnings, ...clauses.warnings] }; }
function parseSignatories(value: unknown) { const warnings: UiMessage[] = []; const rows = normalizeFeeAgreementSignatories(value); if (array(value).length !== rows.length || rows.some((row) => !row.name || !row.party_type)) warnings.push(uiMessage("finance.feeAgreement.workspace.warning.oldSignatories")); return { rows, warnings }; }
function parseClauses(value: unknown) { const warnings: UiMessage[] = []; const rows = array(value).flatMap((item, index) => { const row = object(item); const content = text(row.content, ""); const title = text(row.title, ""); if ((!title || !content) && Object.keys(row).length) warnings.push(uiMessage("finance.feeAgreement.workspace.warning.oldClauses")); return title || content ? [{ title, content, sort_order: Number(row.sort_order || row.order || index + 1) || index + 1 }] : []; }); return { rows, warnings }; }
function blank(value: string) { return value.trim() || null; }
function validateSignatories(rows: FeeAgreementSignatory[], client: FeeAgreementClientContext) { const orders = new Set<number>(); const individual = client.clientType.trim().toLowerCase() === "individual"; for (const row of rows) { if (!row.name.trim()) return row.signing_mode === "attorney_in_fact" ? uiMessage("finance.feeAgreement.workspace.error.attorneyName") : uiMessage("finance.feeAgreement.workspace.error.signatoryName"); if (!["client", "firm", "witness"].includes(row.party_type)) return uiMessage("finance.feeAgreement.workspace.error.signatoryParty"); if (!Number.isInteger(row.sort_order) || row.sort_order < 1) return uiMessage("finance.feeAgreement.workspace.error.signatoryOrder"); if (orders.has(row.sort_order)) return uiMessage("finance.feeAgreement.workspace.error.duplicateSignatoryOrder"); if (row.party_type === "client" && !individual && row.name.trim() === client.name.trim()) return uiMessage("finance.feeAgreement.workspace.error.companySigner"); if (row.party_type === "client" && row.signing_mode === "self" && row.name.trim() !== client.name.trim()) return uiMessage("finance.feeAgreement.workspace.error.selfSigner"); orders.add(row.sort_order); } return ""; }
function validateClauses(rows: CustomClause[]) { for (const row of rows) { if (!row.title.trim() || !row.content.trim()) return uiMessage("finance.feeAgreement.workspace.error.clauseContent"); if (!Number.isFinite(row.sort_order) || row.sort_order < 1) return uiMessage("finance.feeAgreement.workspace.error.clauseOrder"); } return ""; }
function mapBillingPlanError(value: unknown) { const message = value && typeof value === "object" && "message" in value ? String(value.message) : String(value || ""); if (message.includes("signed, completed, or legacy active")) return uiMessage("finance.feeAgreement.workspace.error.billingPlanAgreementStatus"); if (message.includes("eligible commercial engagement")) return uiMessage("finance.feeAgreement.workspace.error.billingPlanEligibility"); if (message.includes("non-cancelled billing plan") || message.includes("uq_finance_billing_plans_active_agreement")) return uiMessage("finance.feeAgreement.workspace.error.billingPlanExists"); if (message.includes("VAT allocation") || message.includes("preserve each fee agreement item")) return uiMessage("finance.feeAgreement.workspace.error.billingPlanAllocation"); if (message.includes("Not allowed")) return uiMessage("finance.billingPlan.error.managePermission"); return uiMessage("finance.feeAgreement.workspace.error.billingPlanCreate"); }
function mapAcceptedEngagementCancellationError(value: unknown) { const message = value && typeof value === "object" && "message" in value ? String(value.message) : String(value || ""); if (message.includes("Cancel the Billing Plan")) return uiMessage("finance.feeAgreement.workspace.error.cancelPlanFirst"); if (message.includes("Only a confirmed")) return uiMessage("finance.feeAgreement.workspace.error.engagementStatus"); if (message.includes("Not allowed")) return uiMessage("finance.feeAgreement.workspace.error.cancelPermission"); return uiMessage("finance.feeAgreement.workspace.error.cancelEngagement"); }
function engagementChannelLabel(value: string | null, locale: UiLocale = "th") { const tr = (key: string, parameters?: MessageParameters) => translate(locale, key, parameters);  return ({ line: "LINE", email: tr("finance.feeAgreement.workspace.channel.email"), phone: tr("finance.feeAgreement.workspace.channel.phone"), meeting: tr("finance.feeAgreement.workspace.channel.meeting"), written: tr("finance.feeAgreement.workspace.channel.written"), other: tr("finance.invoice.classification.other") } as Record<string, string>)[value || ""] || "-"; }
function billingPlanStatusLabel(status: string, locale: UiLocale = "th") { const tr = (key: string, parameters?: MessageParameters) => translate(locale, key, parameters);  return ({ draft: tr("finance.billingPlan.status.draft"), active: tr("finance.billingPlan.status.active"), completed: tr("finance.billingPlan.status.completed"), cancelled: tr("finance.payment.ui.cancel") } as Record<string, string>)[status] || status; }
function billingPlanNextStepDescription(plan: BillingPlanReference | null, acceptedQuotationBasis = false, locale: UiLocale = "th") { const tr = (key: string, parameters?: MessageParameters) => translate(locale, key, parameters);
  if (!plan) return acceptedQuotationBasis ? tr("finance.feeAgreement.workspace.billingPlan.acceptedHelp") : tr("finance.feeAgreement.workspace.billingPlan.agreementHelp");
  if (plan.status === "draft") return tr("finance.feeAgreement.workspace.billingPlan.draftHelp");
  if (plan.status === "active") return tr("finance.feeAgreement.workspace.billingPlan.activeHelp");
  if (plan.status === "completed") return tr("finance.feeAgreement.workspace.billingPlan.completedHelp");
  return tr("finance.feeAgreement.workspace.billingPlan.defaultHelp");
}
function mapRpcError(value: string) { if (value.includes("กรุณาบันทึกหลักฐานการลงนาม")) return uiMessage("finance.feeAgreement.workspace.error.signingEvidenceRequired"); if (value.includes("วันที่ทำสัญญา")) return uiMessage("finance.feeAgreement.workspace.error.agreementDateBeforeSend"); if (value.includes("Only draft or under review")) return uiMessage("finance.feeAgreement.workspace.error.documentNotEditable"); if (value.includes("Not allowed")) return uiMessage("finance.feeAgreement.workspace.error.permission"); if (value.includes("template")) return uiMessage("finance.feeAgreement.workspace.error.template"); if (value.includes("legal document data")) return uiMessage("finance.feeAgreement.workspace.error.legalData"); if (value.includes("Billing Plan")) return uiMessage("finance.feeAgreement.workspace.error.effectivePlan"); if (value.includes("Invalid")) return uiMessage("finance.feeAgreement.workspace.error.invalidStatus"); console.error("Fee Agreement RPC failed", { message: value }); return uiMessage("finance.feeAgreement.workspace.error.saveFallback"); }
function mapSigningError(value: string) { if (value.includes("Only a Sent")) return uiMessage("finance.feeAgreement.workspace.error.signingStatus"); if (value.includes("electronic agreement")) return uiMessage("finance.feeAgreement.workspace.error.paperEvidenceMode"); if (value.includes("Actual signing date is required")) return uiMessage("finance.feeAgreement.workspace.error.signingDateRequired"); if (value.includes("cannot be in the future")) return uiMessage("finance.feeAgreement.workspace.error.futureSigningDate"); if (value.includes("verification confirmation")) return uiMessage("finance.feeAgreement.workspace.error.signingVerification"); if (value.includes("client signer")) return uiMessage("finance.feeAgreement.workspace.error.clientSignerMissing"); if (value.includes("firm signer")) return uiMessage("finance.feeAgreement.workspace.error.firmSignerMissing"); if (value.includes("witness identity")) return uiMessage("finance.feeAgreement.workspace.error.witnessMissing"); if (value.includes("Sent document snapshot")) return uiMessage("finance.feeAgreement.workspace.error.sentSnapshotMissing"); if (value.includes("Uploaded executed document")) return uiMessage("finance.feeAgreement.workspace.error.uploadedEvidenceMissing"); if (value.includes("Not allowed")) return uiMessage("finance.feeAgreement.workspace.error.signingPermission"); return uiMessage("finance.feeAgreement.workspace.error.signingFallback"); }
function lifecycleActions(status: string, locale: UiLocale = "th"): Array<{ status: FeeAgreementLifecycleTarget; label: string }> { if (status === "draft") return [lifecycleAction("under_review", locale), lifecycleAction("cancelled", locale)]; if (status === "under_review") return [lifecycleAction("sent", locale), lifecycleAction("cancelled", locale)]; if (status === "sent") return [lifecycleAction("signed", locale), lifecycleAction("cancelled", locale)]; if (status === "signed") return [lifecycleAction("completed", locale)]; return []; }
function lifecycleAction(status: FeeAgreementLifecycleTarget, locale: UiLocale = "th") { return { status, label: feeAgreementLifecycleActionLabel(status, locale) }; }
function workflowActionIcon(status: "under_review" | "sent" | "signed" | "completed" | "cancelled"): "review" | "send" | "signed" | "completed" | "cancel" { if (status === "under_review") return "review"; if (status === "sent") return "send"; if (status === "signed") return "signed"; if (status === "completed") return "completed"; return "cancel"; }
function SigningPartySummary({ signatories, minimumClient, minimumFirm, minimumWitness }: { signatories: FeeAgreementSignatory[]; minimumClient: number; minimumFirm: number; minimumWitness: number }) {
  const { t: tr } = useI18n();
 const groups: Array<{ party: "client" | "firm" | "witness"; label: string; minimum: number }> = [{ party: "client", label: tr("finance.feeAgreement.signers.clientSignatory"), minimum: Math.max(1, minimumClient) }, { party: "firm", label: tr("finance.feeAgreement.signers.firmSignatory"), minimum: Math.max(1, minimumFirm) }, { party: "witness", label: tr("finance.feeAgreement.signers.witness"), minimum: minimumWitness }]; return <div style={signingPartySummary}><strong>{tr("finance.feeAgreement.workspace.signing.parties")}</strong><div style={signingPartyGrid}>{groups.map((group) => { const names = signatories.filter((signatory) => signatory.party_type === group.party && signatory.name.trim()).map((signatory) => signatory.name); if (group.party === "witness" && group.minimum === 0 && !names.length) return <div key={group.party} style={signingPartyRow}><span>{group.label}</span><span style={muted}>{tr("finance.feeAgreement.workspace.signing.noWitnessRequired")}</span></div>; return <div key={group.party} style={signingPartyRow}><span>{tr("finance.feeAgreement.workspace.signing.minimum", { party: group.label, count: group.minimum })}</span><strong>{names.length ? names.join(" · ") : tr("finance.feeAgreement.workspace.signing.noData")}</strong></div>; })}</div></div>; }
function Field({ label, value }: { label: string; value: ReactNode }) { return <div><small style={muted}>{label}</small><div>{value}</div></div>; }
function NavigationIcon({ name }: { name: "back" | "source" | "preview" | "print" }) { const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; if (name === "back") return <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; if (name === "source") return <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" /></svg>; if (name === "preview") return <svg {...common}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>; return <svg {...common}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" /></svg>; }
function WorkflowIcon({ name }: { name: "lock" | "review" | "send" | "signed" | "completed" | "cancel" }) { const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; if (name === "lock") return <svg {...common} style={{ flex: "0 0 auto" }}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>; if (name === "review") return <svg {...common}><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12l2 2 4-4M9 18h6" /></svg>; if (name === "send") return <svg {...common}><path d="m3 11 18-8-8 18-2-8-8-2Z" /><path d="m11 13 4-4" /></svg>; if (name === "signed") return <svg {...common}><path d="M4 20h16M6 16l9-9 3 3-9 9H6v-3Z" /></svg>; if (name === "completed") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>; return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></svg>; }
function StatusBadge({ status, prominent = false }: { status: string; prominent?: boolean }) {
  const { locale } = useI18n();
 return <span style={{ ...badge, ...(badgeColor[status] || {}), ...(prominent ? workflowStatusBadge : {}) }}>{feeAgreementStatusLabel(status, locale)}</span>; }
function BillingPlanIcon() { return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h9l3 3v17H6z" /><path d="M14 2v4h4M9 11h6M9 15h6M9 19h4" /></svg>; }
function SummaryCard({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) { return <div style={{ ...summaryCard, ...(prominent ? summaryCardProminent : {}) }}><small style={prominent ? { color: "#166534" } : muted}>{label}</small><strong style={prominent ? summaryValueProminent : summaryValue}>{value}</strong></div>; }
function SnapshotText({ label, value }: { label: string; value: unknown }) { return text(value, "") !== "" ? <div style={term}><strong>{label}</strong><div style={pre}>{text(value)}</div></div> : null; }
function AcceptedScopeItem({ label, value }: { label: string; value: unknown }) {
  const { t: tr } = useI18n();
 return <article style={acceptedScopeItem}><h3 style={acceptedScopeTitle}>{label}</h3><div style={acceptedScopeText}>{text(value, tr("finance.feeAgreement.workspace.scope.noData"))}</div></article>; }
function ItemsTable({ items, currency, presentation = "default" }: { items: Item[]; currency: string; presentation?: "default" | "engagement" }) {
  const { t: tr, locale } = useI18n();

  const engagement = presentation === "engagement";
  return <div className={engagement ? "accepted-engagement-table-wrap" : undefined} style={scroll}>
    <table className={`fee-agreement-detail-table${engagement ? " accepted-engagement-fee-table" : ""}`} style={{ ...table, ...(engagement ? acceptedFeeTable : {}) }}>
      {engagement ? <colgroup><col style={{ width: "6%" }} /><col style={{ width: "28%" }} /><col style={{ width: "7%" }} /><col style={{ width: "13%" }} /><col style={{ width: "9%" }} /><col style={{ width: "13%" }} /><col style={{ width: "10%" }} /><col style={{ width: "14%" }} /></colgroup> : null}
      <thead><tr><th className="is-index" scope="col">{tr("finance.feeAgreement.workspace.items.order")}</th><th className="is-description" scope="col">{tr("finance.feeAgreement.workspace.items.description")}</th><th className="is-quantity" scope="col">{tr("finance.charge.ui.quantity")}</th><th className="is-money" scope="col">{tr("finance.charge.ui.unitRate")}</th><th className="is-vat" scope="col">{tr("finance.feeAgreement.workspace.items.vatRate")}</th><th className="is-money" scope="col">{tr("finance.taxInvoice.ui.beforeVat")}</th><th className="is-money" scope="col">VAT</th><th className="is-money" scope="col">{tr("finance.payment.ui.total")}</th></tr></thead>
      <tbody>{items.map((item, index) => <tr key={item.id}><td className="is-index">{index + 1}</td><td className="is-description">{item.description}</td><td className="is-quantity">{item.quantity}</td><td className="is-money">{money(item.unit_price, currency, locale)}</td><td className="is-vat">{item.vat_applicable ? `${item.vat_rate}%` : tr("finance.payment.vat.none")}</td><td className="is-money">{money(item.amount_before_tax, currency, locale)}</td><td className="is-money">{money(item.vat_amount, currency, locale)}</td><td className="is-money"><strong>{money(item.line_total, currency, locale)}</strong></td></tr>)}</tbody>
    </table>
  </div>;
}
function PaymentTerms({ payment, currency, presentation = "default" }: { payment: Json; currency: string; presentation?: "default" | "engagement" }) {
  const { t: tr, locale } = useI18n();

  const installments = array(payment.installments).map(object);
  if (!Object.keys(payment).length || !installments.length) return <p style={muted}>{tr("finance.feeAgreement.workspace.terms.empty")}</p>;
  if (presentation === "engagement") return <AcceptedEngagementPaymentTerms payment={payment} installments={installments} currency={currency} />;
  return <><Field label={tr("finance.feeAgreement.workspace.terms.method")} value={billingLabels(locale)[text(payment.payment_method_type, "")] || text(payment.payment_method_type)} />{text(payment.client_summary, "") !== "" ? <p style={notice}>{text(payment.client_summary)}</p> : null}<div style={installmentGrid}>{installments.map((installment, index) => { const no = Number(installment.installment_no || index + 1); const customTitle = text(installment.title, ""); return <div key={`${installment.installment_no || index}`} style={installmentCard}><strong>{tr("finance.feeAgreement.workspace.installmentNumber", { number: no })}</strong>{!isGeneratedInstallmentTitle(customTitle, no) ? <div style={{ color: "#475569", marginTop: 2 }}>{customTitle}</div> : null}<div>{tr("finance.feeAgreement.workspace.terms.beforeVatPrefix")}{" "}{money(installment.amount_before_tax, currency, locale)}</div><div>VAT: {money(installment.vat_amount, currency, locale)}</div><div>{tr("finance.feeAgreement.workspace.terms.totalPrefix")}{" "}{money(installment.total_amount, currency, locale)}</div><InstallmentDue installment={installment} /><SnapshotText label={tr("finance.feeAgreement.workspace.terms.clientNote")} value={installment.client_note} /><AllocatedItems value={array(installment.items)} currency={currency} /></div>; })}</div></>;
}
function AcceptedEngagementPaymentTerms({ payment, installments, currency }: { payment: Json; installments: Json[]; currency: string }) {
  const { t: tr, locale } = useI18n();

  const method = billingLabels(locale)[text(payment.payment_method_type, "")] || text(payment.payment_method_type);
  const clientSummary = text(payment.client_summary, "");
  return <div style={acceptedPaymentTerms}>
    <div style={acceptedPaymentMethod}><small style={muted}>{tr("finance.feeAgreement.workspace.terms.method")}</small><strong>{method}</strong></div>
    {clientSummary ? <div style={acceptedClientSummary}><small style={acceptedClientSummaryLabel}>{tr("finance.feeAgreement.workspace.terms.clientSummary")}</small><p style={acceptedClientSummaryText}>{clientSummary}</p></div> : null}
    <div className="accepted-engagement-installments" style={acceptedInstallmentGrid}>{installments.map((installment, index) => {
      const no = Number(installment.installment_no || index + 1);
      const customTitle = text(installment.title, "");
      return <article key={`${installment.installment_no || index}`} style={acceptedInstallmentCard}>
        <div className="accepted-engagement-installment-header" style={acceptedInstallmentHeader}><div><span style={acceptedInstallmentNumber}>{tr("finance.feeAgreement.workspace.installmentNumber", { number: no })}</span>{!isGeneratedInstallmentTitle(customTitle, no) ? <div style={acceptedInstallmentCustomTitle}>{customTitle}</div> : null}</div><div className="accepted-engagement-installment-total" style={acceptedInstallmentTotal}><small>{tr("finance.invoice.ui.total")}</small><strong>{money(installment.total_amount, currency, locale)}</strong></div></div>
        <div style={acceptedInstallmentBreakdown}><span>{tr("finance.taxInvoice.ui.beforeVat")}<strong>{money(installment.amount_before_tax, currency, locale)}</strong></span><span>VAT <strong>{money(installment.vat_amount, currency, locale)}</strong></span></div>
        <div className="accepted-engagement-installment-conditions" style={acceptedInstallmentConditions}><div style={acceptedInstallmentCondition}><small style={muted}>{tr("finance.invoice.ui.trigger")}</small><strong>{installmentTriggerDescription(installment, locale)}</strong></div><div style={acceptedInstallmentCondition}><small style={muted}>{tr("finance.feeAgreement.workspace.terms.due")}</small><strong>{installmentPaymentDueDescription(installment, locale)}</strong></div></div>
        {text(installment.client_note, "") ? <div style={acceptedInstallmentNote}><small style={muted}>{tr("finance.feeAgreement.workspace.terms.clientNote")}</small><span>{text(installment.client_note)}</span></div> : null}
        <AllocatedItems value={array(installment.items)} currency={currency} />
      </article>;
    })}</div>
  </div>;
}
function installmentTriggerDescription(installment: Json, locale: UiLocale = "th") { const tr = (key: string, parameters?: MessageParameters) => translate(locale, key, parameters);  const trigger = text(installment.trigger_type, ""); const detail = text(installment.trigger_description, ""); if (detail) return detail; if (trigger === "quotation_acceptance") return tr("finance.feeAgreement.workspace.trigger.acceptance"); if (trigger === "agreement_effective") return tr("finance.invoice.trigger.agreement_effective"); if (trigger === "date") return installment.due_date ? tr("finance.feeAgreement.workspace.trigger.onDate", { date: date(installment.due_date, locale) }) : tr("finance.feeAgreement.workspace.trigger.date"); if (trigger === "case_milestone") return tr("finance.feeAgreement.workspace.trigger.milestone"); if (trigger === "recurring_period") return tr("finance.feeAgreement.workspace.trigger.recurring"); return tr("finance.feeAgreement.workspace.trigger.manual"); }
function installmentPaymentDueDescription(installment: Json, locale: UiLocale = "th") { const tr = (key: string, parameters?: MessageParameters) => translate(locale, key, parameters);  if (installment.due_date) return tr("finance.feeAgreement.workspace.terms.date", { date: date(installment.due_date, locale) }); const days = Number(installment.payment_due_days); if (!Number.isFinite(days)) return "-"; return days > 0 ? tr("finance.feeAgreement.workspace.terms.withinDays", { days }) : tr("finance.feeAgreement.workspace.terms.onTrigger"); }
function InstallmentDue({ installment }: { installment: Json }) {
  const { t: tr, locale } = useI18n();
 const description = dueDescription(installment, locale); return description ? <div style={{ marginTop: 6 }}><strong>{tr("finance.feeAgreement.workspace.terms.duePrefix")}</strong> {description}</div> : null; }
function AllocatedItems({ value, currency }: { value: unknown[]; currency: string }) {
  const { t: tr, locale } = useI18n();
 if (!value.length) return null; return <div style={{ marginTop: 8 }}><strong>{tr("finance.billingPlan.installmentItems")}</strong>{value.map((entry, index) => { const item = object(entry); return <div key={`${text(item.description, "item")}-${index}`} style={allocated}><span>{text(item.description)}</span><span>{money(item.allocated_total || item.line_total, currency, locale)}</span></div>; })}</div>; }
function LegalTermsEditor({ value, templates, disabled, onChange }: { value: LegalForm; templates: Template[]; disabled: boolean; onChange: (next: LegalForm) => void }) {
  const { t: tr, text: uiText } = useI18n();
 const update = (key: keyof LegalForm, next: string) => onChange({ ...value, [key]: next }); const templateMode = Boolean(value.templateVersionId); return <><div style={formGrid}><label style={labelStyle}>{tr("finance.invoice.ui.language")}<select style={input} value={value.language} disabled={disabled} onChange={(event) => update("language", event.target.value)}><option value="th">{tr("finance.invoice.ui.thai")}</option><option value="en">{tr("finance.feeAgreement.language.en")}</option></select></label><label style={labelStyle}>{tr("finance.feeAgreement.workspace.template.version")}<select style={input} value={value.templateVersionId} disabled={disabled} onChange={(event) => update("templateVersionId", event.target.value)}><option value="">{tr("finance.feeAgreement.workspace.legal.noTemplate")}</option>{templates.filter((template) => template.language_code === value.language).map((template) => <option key={template.id} value={template.id}>{template.document_templates?.template_code || tr("settings.documents.templates.template")} v{template.version_no} — {template.document_templates?.name || ""}</option>)}</select></label></div>{templateMode ? null : <><TermsGroup title={tr("finance.feeAgreement.workspace.legal.scopeDuties")}><TextArea label={tr("finance.feeAgreement.workspace.legal.scopeClarification")} value={value.scopeClarification} disabled={disabled} onChange={(next) => update("scopeClarification", next)} /><TextArea label={tr("finance.feeAgreement.workspace.legal.clientObligations")} value={value.clientObligations} disabled={disabled} onChange={(next) => update("clientObligations", next)} /><TextArea label={tr("finance.feeAgreement.workspace.legal.firmObligations")} value={value.firmObligations} disabled={disabled} onChange={(next) => update("firmObligations", next)} /><TextArea label={tr("finance.feeAgreement.workspace.legal.exclusions")} value={value.exclusions} disabled={disabled} onChange={(next) => update("exclusions", next)} /></TermsGroup><TermsGroup title={tr("finance.feeAgreement.workspace.legal.expensesPrivacy")}><TextArea label={tr("finance.feeAgreement.workspace.legal.expenses")} value={value.expenses} disabled={disabled} onChange={(next) => update("expenses", next)} /><TextArea label={tr("finance.feeAgreement.workspace.legal.confidentiality")} value={value.confidentiality} disabled={disabled} onChange={(next) => update("confidentiality", next)} /></TermsGroup><TermsGroup title={tr("finance.feeAgreement.workspace.legal.terminationDisputes")}><TextArea label={tr("finance.feeAgreement.workspace.legal.termination")} value={value.termination} disabled={disabled} onChange={(next) => update("termination", next)} /><TextArea label={tr("finance.feeAgreement.workspace.legal.jurisdiction")} value={value.dispute} disabled={disabled} onChange={(next) => update("dispute", next)} /></TermsGroup><TermsGroup title={tr("finance.feeAgreement.workspace.legal.otherTerms")}><TextArea label={tr("finance.feeAgreement.workspace.clauses.additional")} value={value.additionalTerms} disabled={disabled} onChange={(next) => update("additionalTerms", next)} /></TermsGroup></>}{value.warnings.length ? <div style={warning}>{value.warnings.map(uiText).join(" ")}</div> : null}</>; }
function TermsGroup({ title, children }: { title: string; children: ReactNode }) { return <section style={termsGroup}><h3 style={termsGroupTitle}>{title}</h3><div style={formGrid}>{children}</div></section>; }
function LegalTermsReadOnly({ legal }: { legal: Json | null }) {
  const { t: tr } = useI18n();
 const entries: Array<[string, string]> = [[tr("finance.feeAgreement.workspace.legal.scopeClarification"), "scope_clarification"], [tr("finance.feeAgreement.workspace.legal.clientObligations"), "client_obligations"], [tr("finance.feeAgreement.workspace.legal.firmObligations"), "firm_obligations"], [tr("finance.feeAgreement.workspace.legal.exclusions"), "exclusions"], [tr("finance.feeAgreement.workspace.legal.expenses"), "expenses_disbursements"], [tr("finance.feeAgreement.workspace.legal.confidentiality"), "confidentiality"], [tr("finance.feeAgreement.workspace.legal.termination"), "termination_provisions"], [tr("finance.feeAgreement.workspace.legal.jurisdiction"), "dispute_jurisdiction"], [tr("finance.feeAgreement.workspace.clauses.additional"), "additional_terms"]]; const source = object(legal); return <>{entries.map(([label, key]) => <SnapshotText key={key} label={label} value={source[key]} />)}{!entries.some(([, key]) => text(source[key], "") !== "") ? <p style={muted}>{tr("finance.feeAgreement.workspace.legal.empty")}</p> : null}</>; }
function ClauseEditor({ value, disabled, onChange }: { value: CustomClause[]; disabled: boolean; onChange: (next: CustomClause[]) => void }) {
  const { t: tr } = useI18n();
 return <><button style={secondaryButton} type="button" disabled={disabled} onClick={() => onChange([...value, { title: "", content: "", sort_order: value.length + 1 }])}>{tr("finance.feeAgreement.workspace.clauses.add")}</button>{value.length ? <div style={rowList}>{value.map((row, index) => <div className="fee-agreement-clause-grid" style={clauseGrid} key={`${row.sort_order}-${index}`}><Input label={tr("finance.feeAgreement.workspace.clauses.title")} value={row.title} disabled={disabled} onChange={(title) => onChange(replace(value, index, { ...row, title }))} /><Input label={tr("finance.feeAgreement.workspace.items.order")} type="number" value={String(row.sort_order)} disabled={disabled} onChange={(raw) => onChange(replace(value, index, { ...row, sort_order: Number(raw) || 0 }))} /><TextArea label={tr("finance.feeAgreement.workspace.clauses.content")} value={row.content} disabled={disabled} onChange={(content) => onChange(replace(value, index, { ...row, content }))} /><button style={removeButton} type="button" disabled={disabled} onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>{tr("common.actions.remove")}</button></div>)}</div> : <p style={muted}>{tr("finance.feeAgreement.workspace.clauses.empty")}</p>}</>; }
function SignatoryList({ value, clientName }: { value: unknown[]; clientName: string }) {
  const { t: tr, locale } = useI18n();
 const parsed = parseSignatories(value); return parsed.rows.length ? <div style={rowList}>{parsed.rows.sort((a, b) => a.sort_order - b.sort_order).map((row) => { const context = row.party_type === "client" ? feeAgreementSignatoryContext(row, clientName, locale) : ""; return <div key={`${row.party_type}-${row.sort_order}`} style={term}><strong>{row.name}</strong><div>{row.capacity || "-"} · {partyLabels(locale)[row.party_type] || tr("finance.feeAgreement.workspace.party.unspecified")}</div>{context ? <div style={muted}>{context}</div> : null}</div>; })}</div> : <p style={muted}>{tr("finance.feeAgreement.workspace.signatories.empty")}</p>; }
function ClauseList({ value }: { value: unknown[] }) {
  const { t: tr } = useI18n();
 const parsed = parseClauses(value); return parsed.rows.length ? <div style={rowList}>{parsed.rows.sort((a, b) => a.sort_order - b.sort_order).map((row) => <div key={`${row.title}-${row.sort_order}`} style={term}><strong>{row.title}</strong><div style={pre}>{row.content}</div></div>)}</div> : <p style={muted}>{tr("finance.feeAgreement.workspace.clauses.empty")}</p>; }
function Input({ label, value, disabled, onChange, type = "text" }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; type?: string }) { return <label style={labelStyle}>{label}<input style={input} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextArea({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) { return <label style={labelStyle}>{label}<textarea style={{ ...input, minHeight: 104, resize: "vertical" }} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
const replace = <T,>(rows: T[], index: number, row: T) => rows.map((current, currentIndex) => currentIndex === index ? row : current);
const partyLabels = (locale: UiLocale): Record<string, string> => ({ client: translate(locale, "finance.payment.ui.client"), firm: translate(locale, "finance.feeAgreement.workspace.party.firm"), witness: translate(locale, "finance.feeAgreement.signers.witness") });

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
const workflowFinanceNext: CSSProperties = { borderColor: "#93c5fd", background: "#eff6ff" };
const workflowNextCopy: CSSProperties = { display: "grid", gap: 3, minWidth: 0 };
const workflowNextLabel: CSSProperties = { color: "#6366f1", fontSize: 11, fontWeight: 800, textTransform: "uppercase" };
const workflowNextTitle: CSSProperties = { color: "#172033", fontSize: 16 };
const workflowNextDescription: CSSProperties = { color: "#475569", fontSize: 13, lineHeight: 1.45 };
const workflowPrimaryActions: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 };
const workflowPrimaryButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 42, boxSizing: "border-box", padding: "10px 15px", border: "1px solid #172033", borderRadius: 6, background: "#172033", color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 750 };
const paperSigningPanel: CSSProperties = { display: "grid", gap: 16, marginTop: 14, padding: 16, border: "1px solid #a5b4fc", borderRadius: 7, background: "#fff", boxShadow: "0 8px 22px rgba(15,23,42,.08)" };
const paperSigningTitle: CSSProperties = { margin: 0, color: "#172033", fontSize: 17 };
const paperSigningDescription: CSSProperties = { margin: "5px 0 0", color: "#475569", fontSize: 13, lineHeight: 1.55 };
const paperSigningGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 };
const fieldHelp: CSSProperties = { color: "#64748b", fontSize: 12, lineHeight: 1.4 };
const paperSigningValidationSummary: CSSProperties = { padding: "11px 12px", border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 13, lineHeight: 1.5 };
const paperSigningValidationList: CSSProperties = { margin: "6px 0 0", paddingLeft: 20 };
const invalidInput: CSSProperties = { borderColor: "#dc2626", boxShadow: "0 0 0 2px rgba(220,38,38,.1)" };
const invalidSection: CSSProperties = { padding: 2, border: "1px solid #fca5a5", borderRadius: 7, outline: "none" };
const invalidConfirmation: CSSProperties = { borderColor: "#fca5a5", background: "#fef2f2", color: "#991b1b" };
const fieldErrorText: CSSProperties = { display: "block", color: "#b91c1c", fontSize: 12, fontWeight: 650, lineHeight: 1.4 };
const signingPartySummary: CSSProperties = { display: "grid", gap: 9, padding: 12, border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc", color: "#334155", fontSize: 13 };
const signingPartyGrid: CSSProperties = { display: "grid", gap: 7 };
const signingPartyRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, paddingTop: 7, borderTop: "1px solid #e2e8f0" };
const verificationConfirmation: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, padding: 12, border: "1px solid #bbf7d0", borderRadius: 6, background: "#f0fdf4", color: "#14532d", fontSize: 14, lineHeight: 1.5 };
const paperSigningActions: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 };
const signingEvidenceSummary: CSSProperties = { borderColor: "#bbf7d0", background: "#fbfffc" };
const signingEvidenceHeading: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 };
const signingEvidenceIntro: CSSProperties = { margin: "-7px 0 0", color: "#64748b", fontSize: 13 };
const signingEvidenceNote: CSSProperties = { display: "grid", gap: 4, marginTop: 14, paddingTop: 12, borderTop: "1px solid #dcfce7", color: "#334155", fontSize: 13, whiteSpace: "pre-wrap" };
const optionalEvidenceNotice: CSSProperties = { marginTop: 12, padding: "10px 12px", borderRadius: 6, background: "#f8fafc", color: "#475569", fontSize: 13 };
const legacyEvidenceNotice: CSSProperties = { padding: 12, borderRadius: 6, background: "#f8fafc", color: "#64748b", fontSize: 13 };
const workflowDestructive: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" };
const workflowDestructiveLabel: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 700 };
const workflowCancelButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 36, boxSizing: "border-box", padding: "8px 11px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#b91c1c", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700 };
const workflowSecondary: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" };
const workflowSecondaryCopy: CSSProperties = { display: "grid", gap: 4, maxWidth: 760 };
const workflowSecondaryDescription: CSSProperties = { color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const workflowSecondaryButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, flex: "0 0 auto", minHeight: 36, boxSizing: "border-box", padding: "8px 11px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#475569", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700 };
const financePanel: CSSProperties = { borderColor: "#bfdbfe", background: "#f8fbff" };
const financePanelContent: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 };
const financeEyebrow: CSSProperties = { color: "#1d4ed8", fontSize: 12, fontWeight: 800 };
const financeTitle: CSSProperties = { margin: "3px 0 5px", color: "#172033", fontSize: 18 };
const financeDescription: CSSProperties = { maxWidth: 680, margin: 0, color: "#475569", fontSize: 14, lineHeight: 1.55 };
const financePlanStatus: CSSProperties = { display: "inline-block", marginTop: 8, color: "#1e40af", fontSize: 13, fontWeight: 700 };
const financeButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, flex: "0 0 auto", minHeight: 42, padding: "10px 15px", border: "1px solid #1d4ed8", borderRadius: 6, background: "#1d4ed8", color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 700 };
const acceptedHero: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(260px,.55fr)", gap: 32, alignItems: "center", padding: "20px 0 26px", marginBottom: 24, borderBottom: "2px solid #166534" };
const acceptedHeroIdentity: CSSProperties = { minWidth: 0 };
const acceptedHeroTitle: CSSProperties = { maxWidth: 720, margin: "7px 0 8px", color: "#172033", fontSize: 32, lineHeight: 1.2 };
const acceptedHeroReference: CSSProperties = { margin: 0, color: "#475569", fontSize: 15 };
const acceptedHeroStatus: CSSProperties = { display: "grid", justifyItems: "end", gap: 10, minWidth: 0, textAlign: "right" };
const acceptedHeroMeta: CSSProperties = { display: "grid", gap: 4, color: "#64748b", fontSize: 12, lineHeight: 1.45 };
const acceptedEvidenceCard: CSSProperties = { borderColor: "#bbf7d0", background: "#fbfffc", padding: 20, boxShadow: "0 1px 2px rgba(15,23,42,.03)" };
const acceptedSectionHeading: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 10 };
const acceptedSectionTitle: CSSProperties = { margin: "3px 0 0", color: "#172033", fontSize: 19 };
const acceptedEvidenceGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "16px 24px", padding: "16px 0 4px", borderTop: "1px solid #dcfce7" };
const acceptedEvidenceNotice: CSSProperties = { margin: "16px 0 0", padding: "11px 12px", borderLeft: "3px solid #60a5fa", background: "#eff6ff", color: "#334155", fontSize: 13, lineHeight: 1.55 };
const acceptedConfirmationNote: CSSProperties = { display: "grid", gap: 5, marginTop: 16, paddingTop: 14, borderTop: "1px solid #dcfce7", color: "#334155", fontSize: 13, whiteSpace: "pre-wrap" };
const acceptedCancellationNotice: CSSProperties = { display: "grid", gap: 4, marginTop: 16, padding: 12, borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 13 };
const acceptedWorkspaceSection: CSSProperties = { padding: "26px 2px", borderBottom: "1px solid #dbe3ee" };
const acceptedWorkspaceHeading: CSSProperties = { display: "grid", gap: 4, marginBottom: 18 };
const acceptedSectionEyebrow: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" };
const acceptedWorkspaceTitle: CSSProperties = { margin: 0, color: "#14532d", fontSize: 21, lineHeight: 1.3 };
const acceptedScopeList: CSSProperties = { display: "grid", gap: 12 };
const acceptedScopeItem: CSSProperties = { padding: "15px 18px", borderLeft: "3px solid #a7c4b1", background: "#f8faf9" };
const acceptedScopeTitle: CSSProperties = { margin: "0 0 7px", color: "#1e293b", fontSize: 15 };
const acceptedScopeText: CSSProperties = { maxWidth: 980, color: "#334155", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
const acceptedFeeTable: CSSProperties = { minWidth: 980 };
const acceptedSummaryBlock: CSSProperties = { marginTop: 20, paddingTop: 18, borderTop: "1px solid #e2e8f0" };
const acceptedSummaryTitle: CSSProperties = { margin: "0 0 10px", color: "#475569", fontSize: 14 };
const acceptedSummaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 };
const acceptedPaymentTerms: CSSProperties = { display: "grid", gap: 14 };
const acceptedPaymentMethod: CSSProperties = { display: "grid", gap: 4, width: "fit-content", minWidth: 220, padding: "10px 12px", border: "1px solid #e2e8f0", background: "#f8fafc" };
const acceptedClientSummary: CSSProperties = { padding: "13px 15px", borderLeft: "3px solid #6366f1", background: "#f5f7ff" };
const acceptedClientSummaryLabel: CSSProperties = { color: "#4f46e5", fontSize: 11, fontWeight: 800 };
const acceptedClientSummaryText: CSSProperties = { margin: "4px 0 0", color: "#334155", fontSize: 14, lineHeight: 1.6 };
const acceptedInstallmentGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 };
const acceptedInstallmentCard: CSSProperties = { display: "grid", alignContent: "start", gap: 12, minWidth: 0, padding: 16, border: "1px solid #dbe3ee", borderRadius: 6, background: "#fff" };
const acceptedInstallmentHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, paddingBottom: 11, borderBottom: "1px solid #e2e8f0" };
const acceptedInstallmentNumber: CSSProperties = { color: "#172033", fontSize: 16, fontWeight: 800 };
const acceptedInstallmentCustomTitle: CSSProperties = { marginTop: 3, color: "#64748b", fontSize: 13 };
const acceptedInstallmentTotal: CSSProperties = { display: "grid", justifyItems: "end", gap: 1, flex: "0 0 auto", color: "#166534" };
const acceptedInstallmentBreakdown: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "6px 16px", color: "#64748b", fontSize: 12 };
const acceptedInstallmentConditions: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, padding: "11px 12px", background: "#f8fafc" };
const acceptedInstallmentCondition: CSSProperties = { display: "grid", gap: 3, minWidth: 0, color: "#334155", fontSize: 13, lineHeight: 1.5 };
const acceptedInstallmentNote: CSSProperties = { display: "grid", gap: 3, color: "#334155", fontSize: 13, lineHeight: 1.5 };
const acceptedFinalAction: CSSProperties = { marginTop: 28, marginBottom: 10, padding: 22, boxShadow: "0 8px 24px rgba(30,64,175,.08)" };
const acceptedOtherActions: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, padding: "16px 2px 0", marginBottom: 8 };
const acceptedOtherActionCopy: CSSProperties = { maxWidth: 720, margin: "5px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const documentInformationGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(240px,1.55fr) repeat(3,minmax(150px,1fr))", gap: 14, alignItems: "start", margin: "18px 0 10px" };
const executionModeField: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px,.85fr) minmax(260px,1.15fr)", gap: 16, alignItems: "end", padding: "12px 14px", borderLeft: "3px solid #86a995", background: "#f8faf9" };
const executionModeHelp: CSSProperties = { display: "grid", gap: 4, color: "#64748b", fontSize: 13, lineHeight: 1.45 };
const comingSoonText: CSSProperties = { color: "#475569", fontWeight: 600 };
const dateHelp: CSSProperties = { color: "#64748b", fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 };
const page: CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 24 }; const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, marginBottom: 16 }; const documentHeader: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(270px,.7fr)", gap: 28, padding: "12px 0 24px", marginBottom: 20, borderBottom: "2px solid #166534" }; const eyebrow: CSSProperties = { margin: 0, color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: 1.1 }; const documentTitle: CSSProperties = { margin: "6px 0", color: "#172033", fontSize: 30, lineHeight: 1.25 }; const documentNumber: CSSProperties = { margin: 0, color: "#166534", fontWeight: 700, fontSize: 17 }; const headerMeta: CSSProperties = { display: "flex", flexWrap: "wrap", alignContent: "start", gap: "8px 14px", color: "#475569", fontSize: 13, paddingTop: 8 }; const saveBar: CSSProperties = { position: "sticky", top: 12, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: 12, marginBottom: 16, border: "1px solid #bbf7d0", borderRadius: 8, background: "#f0fdf4", boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)" }; const primarySaveButton: CSSProperties = { border: 0, borderRadius: 6, padding: "10px 14px", background: "#166534", color: "#fff", cursor: "pointer", fontWeight: 700 }; const disabledPrimarySaveButton: CSSProperties = { background: "#94a3b8", cursor: "default" }; const savePending: CSSProperties = { color: "#9a3412", fontWeight: 700 }; const saveComplete: CSSProperties = { color: "#166534", fontWeight: 700 }; const sectionTitle: CSSProperties = { margin: "0 0 14px", fontSize: 18, color: "#14532d" }; const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }; const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14, margin: "16px 0" }; const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }; const summaryCard: CSSProperties = { display: "grid", gap: 7, padding: 16, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" }; const summaryCardProminent: CSSProperties = { background: "#f0fdf4", borderColor: "#86efac" }; const summaryValue: CSSProperties = { fontSize: 19, color: "#1e293b" }; const summaryValueProminent: CSSProperties = { fontSize: 23, color: "#166534" }; const termsGroup: CSSProperties = { margin: "20px 0", paddingTop: 2 }; const termsGroupTitle: CSSProperties = { margin: 0, fontSize: 15, color: "#334155" }; const clauseGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px,1fr) 90px", gap: 10, alignItems: "end" }; const rowList: CSSProperties = { display: "grid", gap: 12, marginTop: 14 }; const muted: CSSProperties = { color: "#64748b", fontSize: 13 }; const warning: CSSProperties = { background: "#fff7ed", color: "#9a3412", padding: 12, borderRadius: 6, marginBottom: 12 }; const success: CSSProperties = { background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 6, marginBottom: 12 }; const notice: CSSProperties = { background: "#f8fafc", borderLeft: "3px solid #64748b", color: "#334155", padding: 12, margin: "10px 0" }; const scroll: CSSProperties = { overflowX: "auto" }; const table: CSSProperties = { width: "100%", minWidth: 780, borderCollapse: "collapse" }; const term: CSSProperties = { padding: "10px 0", borderBottom: "1px solid #e5e7eb" }; const pre: CSSProperties = { whiteSpace: "pre-wrap", lineHeight: 1.55, marginTop: 6 }; const labelStyle: CSSProperties = { display: "grid", gap: 6, color: "#334155", fontSize: 14 }; const input: CSSProperties = { boxSizing: "border-box", width: "100%", minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px", background: "#fff", font: "inherit" }; const secondaryButton: CSSProperties = { border: "1px solid #94a3b8", borderRadius: 6, padding: "9px 12px", background: "#fff", color: "#334155", cursor: "pointer" }; const removeButton: CSSProperties = { border: 0, background: "transparent", color: "#b91c1c", cursor: "pointer", padding: "8px 2px" }; const badge: CSSProperties = { display: "inline-block", padding: "3px 8px", borderRadius: 999, fontSize: 12 }; const badgeColor: Record<string, CSSProperties> = { draft: { background: "#e5e7eb", color: "#374151" }, under_review: { background: "#fef3c7", color: "#92400e" }, sent: { background: "#dbeafe", color: "#1d4ed8" }, signed: { background: "#dcfce7", color: "#166534" }, completed: { background: "#e0e7ff", color: "#3730a3" }, engagement_confirmed: { background: "#dcfce7", color: "#166534" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, active: { background: "#f3f4f6", color: "#4b5563" } }; const installmentGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12, marginTop: 14 }; const installmentCard: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 6, padding: 12, lineHeight: 1.6 }; const allocated: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", borderBottom: "1px solid #f1f5f9" };
