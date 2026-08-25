/* eslint-disable @next/next/no-img-element -- private signed document assets must remain reliable in Browser Print */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { QuotationGuard } from "../../../quotations/shared";
import {
  DocumentIdentityFooter,
  DocumentIdentityHeader,
} from "../../../../components/DocumentIdentity";
import {
  DOCUMENT_ASSET_BUCKET,
  type DocumentIdentity,
  loadCurrentDocumentIdentity,
  loadDocumentLogoUrl,
  normalizeDocumentIdentity,
  resolveDocumentIdentity,
} from "../../../../../lib/documentIdentity";
import { supabase } from "../../../../../lib/supabase";
import {
  feeAgreementSignatoryContext,
  type FeeAgreementSignatory,
  normalizeFeeAgreementSignatories,
} from "../../signatories";
import { FeeAgreementPreamble } from "../../preamble";
import {
  feeAgreementClosingCopy,
  normalizeFeeAgreementExecutionMode,
  type FeeAgreementExecutionMode,
} from "../../execution";
import {
  ResolvedTemplateSections,
  resolvedVariableMap,
} from "../../template-sections";
import { ThaiLegalText } from "../../thai-legal-text";

type Json = Record<string, unknown>;
type Agreement = { id: string; agreement_no: string | null; title: string; status: string; language_code: string; execution_mode: string | null; agreement_date: string | null; effective_date: string | null; commencement_date: string | null; expiry_date: string | null; currency: string; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string; client_snapshot_json: Json | null; matter_snapshot_json: Json | null; company_snapshot_json: Json | null; source_document_snapshot_json: Json | null; commercial_terms_snapshot_json: Json | null; legal_terms_json: Json | null; signatories_json: unknown[] | null; custom_clauses_json: unknown[] | null; selected_template_version_id: string | null; resolved_document_snapshot_json: Json | null; signed_document_snapshot_json: Json | null; created_at: string };
type Item = { id: string; description: string; quantity: number | string; unit_price: number | string; vat_applicable: boolean; vat_rate: number | string; amount_before_tax: number | string; vat_amount: number | string; line_total: number | string; sort_order: number };
type FeeColumnKey = "index" | "description" | "quantity" | "unitPrice" | "vat" | "beforeVat" | "total";
type FeeColumn = { key: FeeColumnKey; label: string; width: string; align: CSSProperties["textAlign"] };

const FEE_COLUMNS: readonly FeeColumn[] = [
  { key: "index", label: "ลำดับ", width: "6%", align: "center" },
  { key: "description", label: "รายละเอียด", width: "28%", align: "left" },
  { key: "quantity", label: "จำนวน", width: "8%", align: "center" },
  { key: "unitPrice", label: "ราคาต่อหน่วย", width: "17%", align: "right" },
  { key: "vat", label: "VAT", width: "10%", align: "center" },
  { key: "beforeVat", label: "ก่อน VAT", width: "15%", align: "right" },
  { key: "total", label: "รวม", width: "16%", align: "right" },
];

const asObject = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const string = (value: unknown, fallback = "-") => typeof value === "string" && value.trim() ? value : fallback;
const amount = (value: unknown) => Number(value || 0);
const money = (value: unknown, currency = "THB") => `${amount(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const date = (value: unknown) => typeof value === "string" && value ? value.slice(0, 10) : "-";
const isGeneratedInstallmentTitle = (value: unknown, installmentNo: number) => { const title = string(value, "").toLowerCase().replace(/\s+/g, " ").trim(); return !title || new RegExp(`^(งวดที่\\s*${installmentNo}|installment\\s*${installmentNo})(\\s*[/—-]\\s*(งวดที่\\s*${installmentNo}|installment\\s*${installmentNo}))?$`, "i").test(title); };
const dueDescription = (installment: Json) => { if (installment.due_date) return `ครบกำหนดวันที่ ${date(installment.due_date)}`; const days = Number(installment.payment_due_days); const period = Number.isFinite(days) && days > 0 ? `ชำระภายใน ${days} วัน` : ""; const trigger = string(installment.trigger_type, ""); if (trigger === "quotation_acceptance") return period ? `${period}นับแต่ผู้ว่าจ้างตอบรับใบเสนอราคา` : "นับแต่ผู้ว่าจ้างตอบรับใบเสนอราคา"; if (trigger === "agreement_effective") return period ? `${period}นับแต่สัญญามีผล` : "นับแต่สัญญามีผล"; if (["case_milestone", "recurring_period", "manual"].includes(trigger) && string(installment.trigger_description, "")) return period ? `${period}นับแต่${string(installment.trigger_description)}` : string(installment.trigger_description); return period || string(installment.trigger_description, ""); };
const selectStoredDocument = (agreement: Agreement): Json => {
  if (agreement.status === "signed" && agreement.signed_document_snapshot_json) return agreement.signed_document_snapshot_json;
  if (["sent", "signed", "completed", "cancelled"].includes(agreement.status) && agreement.resolved_document_snapshot_json) return agreement.resolved_document_snapshot_json;
  return {};
};

export default function FeeAgreementPreviewPage() {
  const params = useParams(); const id = Array.isArray(params.id) ? params.id[0] : params.id || "";
  return <QuotationGuard>{() => <Preview id={id} />}</QuotationGuard>;
}

function Preview({ id }: { id: string }) {
  const params = useSearchParams(); const printed = useRef(false);
  const [agreement, setAgreement] = useState<Agreement | null>(null); const [items, setItems] = useState<Item[]>([]); const [liveTemplate, setLiveTemplate] = useState<Json>({}); const [documentIdentity, setDocumentIdentity] = useState<DocumentIdentity>(() => normalizeDocumentIdentity(null)); const [logoUrl, setLogoUrl] = useState(""); const [signatureUrls, setSignatureUrls] = useState<Record<string, string>>({}); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!id) { setError("ไม่พบ Fee Agreement"); setLoading(false); return; }
    const header = await supabase.from("finance_fee_agreements").select("id,agreement_no,title,status,language_code,execution_mode,agreement_date,effective_date,commencement_date,expiry_date,currency,amount_before_tax,vat_amount,total_amount,client_snapshot_json,matter_snapshot_json,company_snapshot_json,source_document_snapshot_json,commercial_terms_snapshot_json,legal_terms_json,signatories_json,custom_clauses_json,selected_template_version_id,resolved_document_snapshot_json,signed_document_snapshot_json,created_at").eq("id", id).maybeSingle();
    if (header.error || !header.data) { setError("ไม่สามารถโหลด Fee Agreement ได้"); setLoading(false); return; }
    const row = header.data as Agreement;
    const [itemRes, templateRes, currentIdentityResult] = await Promise.all([
      supabase.from("finance_fee_agreement_items").select("id,description,quantity,unit_price,vat_applicable,vat_rate,amount_before_tax,vat_amount,line_total,sort_order").eq("fee_agreement_id", id).order("sort_order").order("id"),
      row.selected_template_version_id && ["draft", "under_review"].includes(row.status)
        ? supabase.rpc("get_finance_fee_agreement_template_preview", { p_fee_agreement_id: id })
        : Promise.resolve({ data: null, error: null }),
      loadCurrentDocumentIdentity(supabase),
    ]);
    if (itemRes.error) setError("ไม่สามารถโหลดรายการค่าบริการได้");
    if (templateRes.error) console.warn("Unable to load live Fee Agreement template preview", templateRes.error);
    if (currentIdentityResult.error) console.warn("Unable to load Document Settings identity for Fee Agreement preview", currentIdentityResult.error);
    const storedDocument = selectStoredDocument(row);
    const storedCompany = asObject(asObject(storedDocument.source_snapshots).company);
    const identity = Object.keys(storedCompany).length
      ? resolveDocumentIdentity(storedCompany, currentIdentityResult.identity)
      : currentIdentityResult.identity;
    const resolvedLogoUrl = identity.logoStoragePath === currentIdentityResult.identity.logoStoragePath
      ? currentIdentityResult.logoUrl
      : await loadDocumentLogoUrl(supabase, identity.logoStoragePath);
    const storedSignatories = Array.isArray(storedDocument.signatories) ? storedDocument.signatories : (row.signatories_json || []);
    const storedAgreement = asObject(storedDocument.agreement);
    const legacyFrozenExecution = Object.keys(storedDocument).length > 0 && !("execution_mode" in storedAgreement);
    const signaturePaths = legacyFrozenExecution
      ? [...new Set(normalizeFeeAgreementSignatories(storedSignatories).map((signer) => string(signer.signature_storage_path, "")).filter((path) => path.startsWith("signers/")))]
      : [];
    const signedSignatureEntries = await Promise.all(signaturePaths.map(async (path) => {
      const result = await supabase.storage.from(DOCUMENT_ASSET_BUCKET).createSignedUrl(path, 60 * 10);
      if (result.error) { console.warn("Unable to load Fee Agreement signer asset", result.error); return [path, ""] as const; }
      return [path, result.data.signedUrl] as const;
    }));
    setAgreement(row); setItems((itemRes.data || []) as Item[]); setLiveTemplate(asObject(templateRes.data)); setDocumentIdentity(identity); setLogoUrl(resolvedLogoUrl); setSignatureUrls(Object.fromEntries(signedSignatureEntries)); setLoading(false);
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { if (params.get("print") === "1" && !loading && agreement && !printed.current) { printed.current = true; window.setTimeout(() => window.print(), 100); } }, [agreement, loading, params]);
  const document = useMemo(() => {
    return agreement ? selectStoredDocument(agreement) : {};
  }, [agreement]);
  if (loading) return <main style={shell}>Loading Fee Agreement preview...</main>; if (!agreement) return <main style={shell}>{error || "Fee Agreement not found."}</main>;
  const snapAgreement = asObject(document.agreement); const source = asObject(document.source_quotation_snapshot || agreement.source_document_snapshot_json); const commercialSnapshot = asObject(document.commercial_terms || agreement.commercial_terms_snapshot_json); const commercial = asObject(commercialSnapshot.commercial); const legal = asObject(document.legal_terms || agreement.legal_terms_json); const sourceSnapshots = asObject(document.source_snapshots); const client = asObject(document.source_snapshots ? sourceSnapshots.client : agreement.client_snapshot_json); const matter = asObject(document.source_snapshots ? sourceSnapshots.matter : agreement.matter_snapshot_json); const templateSnapshot = Object.keys(asObject(document.template)).length ? asObject(document.template) : liveTemplate; const snapshotItems = Array.isArray(document.agreement_items) ? document.agreement_items.map(asObject) : [];
  const renderedItems = snapshotItems.length ? snapshotItems : items;
  const signatories = normalizeFeeAgreementSignatories(Array.isArray(document.signatories) ? document.signatories : (agreement.signatories_json || []));
  const variables = resolvedVariableMap(templateSnapshot.variables);
  const frozenDocument = Object.keys(document).length > 0;
  const legacyFrozenExecution = frozenDocument && !("execution_mode" in snapAgreement);
  const executionMode = normalizeFeeAgreementExecutionMode(snapAgreement.execution_mode || agreement.execution_mode);
  const agreementDate = variables.AGREEMENT_DATE
    || string(snapAgreement.agreement_date, "")
    || (frozenDocument ? date(agreement.created_at) : string(agreement.agreement_date, ""));
  const preambleVariables = { ...variables, AGREEMENT_DATE: agreementDate };
  const templateSections = Array.isArray(templateSnapshot.sections) ? templateSnapshot.sections.map(asObject) : [];
  const rendererV3 = Number(templateSnapshot.renderer_schema_version || 0) === 3;
  const preambleSection = templateSections.find((entry) => string(entry.section_kind, "") === "preamble");
  const executionSection = templateSections.find((entry) => string(entry.section_kind, "") === "execution");
  const signatureRequirements = asObject(templateSnapshot.signature_requirements);
  const customClauses = Array.isArray(agreement.custom_clauses_json) ? agreement.custom_clauses_json : [];
  const templateMode = Boolean(agreement.selected_template_version_id);
  const templateAvailable = Object.keys(templateSnapshot).length > 0;
  const currency = string(snapAgreement.currency, agreement.currency); const total = snapAgreement.totals ? asObject(snapAgreement.totals) : agreement;
  const documentTitle = /^Fee Agreement\s*-\s*/i.test(agreement.title) || !agreement.title.trim() ? "สัญญาว่าจ้างให้บริการทางกฎหมาย" : string(snapAgreement.title, agreement.title);
  const coreLegalTerms = [legal.scope_clarification, legal.client_obligations, legal.firm_obligations, legal.confidentiality, legal.termination_provisions, legal.dispute_jurisdiction];
  const previewIncomplete = ["draft", "under_review"].includes(agreement.status) && (!agreement.agreement_no || !renderedItems.length || !agreement.agreement_date || !agreement.effective_date || !string(client.name, string(client.display_name, "")) || !signatories.some((entry) => entry.party_type === "client") || !signatories.some((entry) => entry.party_type === "firm") || (!agreement.selected_template_version_id && !coreLegalTerms.some((value) => string(value, ""))));
  return <main style={shell}><div className="screen-controls" style={controls}><Link href={`/finance/fee-agreements/${agreement.id}`}>Back to Fee Agreement</Link><button type="button" onClick={() => window.print()}>Print</button><span>เพื่อเอกสารที่สะอาด กรุณาปิด Headers and footers ในหน้าต่าง Print</span></div>{error ? <div className="fee-agreement-preview-readiness" style={readinessNotice}>{error}</div> : null}{previewIncomplete ? <div className="fee-agreement-preview-readiness" style={readinessNotice}>เอกสารฉบับนี้ยังอยู่ระหว่างจัดทำและอาจมีข้อมูลไม่ครบถ้วน</div> : null}
    <article className="fee-agreement-document" style={documentStyle} lang={agreement.language_code}><PreambleRenderer section={rendererV3 ? preambleSection : undefined} variables={preambleVariables} agreement={agreement} snapAgreement={snapAgreement} client={client} matter={matter} documentTitle={documentTitle} identity={documentIdentity} logoUrl={logoUrl} signatories={signatories} />
      {templateMode ? templateAvailable ? <ResolvedTemplateSections template={templateSnapshot} variables={variables} afterSection={(templateSection) => string(templateSection.section_code, "") === "FEES_PAYMENT" ? <CommercialTermsContent items={renderedItems} payment={asObject(source.payment_terms || commercialSnapshot.payment_terms)} total={asObject(total)} currency={currency} languageCode={agreement.language_code} /> : null} /> : <section style={section}><SectionTitle>ไม่สามารถแสดงข้อกำหนดจากแม่แบบ</SectionTitle><p style={pre}><ThaiLegalText text="กรุณากลับไปตรวจสอบแม่แบบเอกสารที่เลือกก่อนใช้เอกสารนี้กับผู้ว่าจ้าง" languageCode={agreement.language_code} /></p></section> : <>
        <section className="fee-agreement-content-section" style={section}><SectionTitle>ขอบเขตการให้บริการ</SectionTitle><p style={pre}><ThaiLegalText text={string(commercial.scope_of_legal_services, string(legal.scope_clarification, "-"))} languageCode={agreement.language_code} /></p>{([ ["งานที่รวมอยู่ในค่าบริการ", commercial.included_services], ["งานหรือค่าใช้จ่ายที่ไม่รวม", commercial.excluded_services] ] as Array<[string, unknown]>).filter(([, value]) => value).map(([label, value]) => <div key={label} style={term}><strong>{label}</strong><p style={pre}><ThaiLegalText text={string(value)} languageCode={agreement.language_code} /></p></div>)}</section>
        <CommercialTermsContent items={renderedItems} payment={asObject(source.payment_terms || commercialSnapshot.payment_terms)} total={asObject(total)} currency={currency} languageCode={agreement.language_code} standalone />
        <section className="fee-agreement-content-section" style={section}><SectionTitle>ข้อกำหนดของสัญญา</SectionTitle>{legalEntries(legal).map(([label, value]) => <div key={label} style={term}><strong>{label}</strong><p style={pre}><ThaiLegalText text={string(value)} languageCode={agreement.language_code} /></p></div>)}</section>
        {customClauses.length ? <section className="fee-agreement-content-section" style={section}><SectionTitle>ข้อกำหนดเพิ่มเติม</SectionTitle><ClauseList clauses={customClauses} languageCode={agreement.language_code} /></section> : null}
      </>}
      <ExecutionRenderer section={rendererV3 ? executionSection : undefined} requirements={signatureRequirements} signatories={signatories} variables={variables} signatureUrls={signatureUrls} clientName={string(client.name, string(client.display_name, ""))} languageCode={agreement.language_code} executionMode={executionMode} legacyFrozenExecution={legacyFrozenExecution} />
      <DocumentIdentityFooter identity={documentIdentity} />
    </article><style jsx global>{`
      @page { size: A4 portrait; margin: 11mm; }
      .fee-agreement-document,
      .fee-agreement-document p {
        word-break: normal;
        overflow-wrap: normal;
        line-break: auto;
        text-wrap: wrap;
      }
      .fee-agreement-document .thai-legal-token {
        display: inline;
        white-space: nowrap;
      }
      .fee-agreement-fee-table th,
      .fee-agreement-fee-table td { box-sizing: border-box; }
      @media print {
        body { background: #fff !important; }
        .screen-controls, .fee-agreement-preview-readiness, nav, header:not(.fee-agreement-document-header), aside, button, [role="dialog"] { display: none !important; }
        .fee-agreement-document { box-shadow: none !important; border: 0 !important; max-width: none !important; margin: 0 !important; padding: 0 !important; font-size: 10pt !important; line-height: 1.58 !important; }
        .fee-agreement-table-wrap { overflow: visible !important; }
        .fee-agreement-document table { width: 100% !important; min-width: 0 !important; }
        .fee-agreement-document thead { display: table-header-group; }
        .fee-agreement-document tr, .fee-agreement-payment-card, .fee-agreement-summary, .fee-agreement-principal-signatures, .fee-agreement-signature { break-inside: avoid; page-break-inside: avoid; }
        .fee-agreement-execution-attestation { break-after: avoid-page; page-break-after: avoid; }
        .fee-agreement-witness-signatures { break-inside: auto; page-break-inside: auto; }
        .fee-agreement-section-title { break-after: avoid; page-break-after: avoid; }
      }
    `}</style></main>;
}

function SectionTitle({ children }: { children: string }) { return <h2 className="fee-agreement-section-title" style={sectionTitle}>{children}</h2>; }
function variableValue(variables: Record<string, string>, key: string, fallback = "-") { return variables[key] || fallback; }
function PreambleRenderer({ section: templateSection, variables, agreement, snapAgreement, client, matter, documentTitle, identity, logoUrl, signatories }: { section?: Json; variables: Record<string, string>; agreement: Agreement; snapAgreement: Json; client: Json; matter: Json; documentTitle: string; identity: DocumentIdentity; logoUrl: string; signatories: FeeAgreementSignatory[] }) {
  const agreementNo = variableValue(variables, "AGREEMENT_NO", string(snapAgreement.agreement_no, agreement.agreement_no || "-"));
  return <>
    <DocumentIdentityHeader className="fee-agreement-document-header" identity={identity} logoUrl={logoUrl} title={variableValue(variables, "AGREEMENT_TITLE", documentTitle)} subtitle="Fee Agreement" documentNo={agreementNo} languageCode={agreement.language_code} />
    <FeeAgreementPreamble section={templateSection} variables={variables} client={client} matter={matter} identity={identity} signatories={signatories} languageCode={agreement.language_code} />
  </>;
}
function PaymentTerms({ payment, currency, languageCode }: { payment: Json; currency: string; languageCode: string }) { const installments = Array.isArray(payment.installments) ? payment.installments.map(asObject) : []; if (!installments.length) return <p style={muted}>ยังไม่มีเงื่อนไขการชำระเงินที่บันทึกไว้</p>; return <>{payment.client_summary ? <p style={pre}><ThaiLegalText text={string(payment.client_summary)} languageCode={languageCode} /></p> : null}<div style={paymentGrid}>{installments.map((installment, index) => { const no = Number(installment.installment_no || index + 1); const customTitle = string(installment.title, ""); const due = dueDescription(installment); return <div className="fee-agreement-payment-card" key={String(installment.installment_no || index)} style={paymentCard}><strong>งวดที่ {no}</strong>{!isGeneratedInstallmentTitle(customTitle, no) ? <div style={{ color: "#475569", marginTop: 2 }}>{customTitle}</div> : null}<div>จำนวนก่อน VAT: {money(installment.amount_before_tax, currency)}</div><div>VAT: {money(installment.vat_amount, currency)}</div><div>จำนวนรวม: {money(installment.total_amount, currency)}</div>{due ? <div><strong>ครบกำหนด:</strong> {due}</div> : null}{installment.client_note ? <div style={pre}><ThaiLegalText text={string(installment.client_note)} languageCode={languageCode} /></div> : null}{Array.isArray(installment.items) && installment.items.length ? <div style={{ marginTop: 6 }}><strong>รายการในงวดนี้</strong>{installment.items.map((entry, entryIndex) => { const row = asObject(entry); return <div key={`${string(row.description, "item")}-${entryIndex}`} style={allocated}><span>{string(row.description)}</span><span>{money(row.allocated_total || row.line_total, currency)}</span></div>; })}</div> : null}</div>; })}</div></>; }
function CommercialTermsContent({ items, payment, total, currency, languageCode, standalone = false }: { items: unknown[]; payment: Json; total: Json; currency: string; languageCode: string; standalone?: boolean }) {
  const feeItems = <div className="fee-agreement-table-wrap" style={tableWrap}><table className="fee-agreement-fee-table" style={table}><colgroup>{FEE_COLUMNS.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead><tr>{FEE_COLUMNS.map((column) => <th key={column.key} scope="col" style={feeHeaderStyle(column)}>{column.label}</th>)}</tr></thead><tbody>{items.map((item, index) => { const row = asObject(item); return <tr key={string(row.id, String(index))}>{FEE_COLUMNS.map((column) => <td key={column.key} style={feeBodyStyle(column)}>{feeCellValue(column.key, row, index, currency)}</td>)}</tr>; })}</tbody></table></div>;
  const totals = <section className="fee-agreement-summary" style={summary}><div>ก่อน VAT <strong>{money(total.amount_before_tax, currency)}</strong></div><div>VAT <strong>{money(total.vat_amount, currency)}</strong></div><div style={grand}>จำนวนเงินตามข้อตกลง <strong>{money(total.total_amount, currency)}</strong></div></section>;
  if (standalone) return <><section className="fee-agreement-content-section" style={section}><SectionTitle>รายการค่าบริการ</SectionTitle>{feeItems}</section><section className="fee-agreement-content-section" style={section}><SectionTitle>เงื่อนไขการชำระเงิน</SectionTitle><PaymentTerms payment={payment} currency={currency} languageCode={languageCode} /></section>{totals}</>;
  return <div style={commercialSupplement}><h3 style={supplementTitle}>รายการค่าบริการตามข้อตกลง</h3>{feeItems}<h3 style={supplementTitle}>กำหนดการชำระเงิน</h3><PaymentTerms payment={payment} currency={currency} languageCode={languageCode} />{totals}</div>;
}
function ClauseList({ clauses, languageCode }: { clauses: unknown[]; languageCode: string }) { return <>{clauses.length ? clauses.map((clause, index) => { const entry = asObject(clause); return <div key={String(entry.clause_version_id || index)} style={term}><strong>{string(entry.title, `ข้อกำหนด ${index + 1}`)}</strong><p style={pre}><ThaiLegalText text={string(entry.content, typeof clause === "string" ? clause : "-")} languageCode={languageCode} /></p></div>; }) : <p style={muted}>-</p>}</>; }
function ExecutionRenderer({ section: templateSection, requirements, signatories, variables, signatureUrls, clientName, languageCode, executionMode, legacyFrozenExecution }: { section?: Json; requirements: Json; signatories: FeeAgreementSignatory[]; variables: Record<string, string>; signatureUrls: Record<string, string>; clientName: string; languageCode: string; executionMode: FeeAgreementExecutionMode; legacyFrozenExecution: boolean }) {
  const withFallbacks = [...signatories];
  if (!withFallbacks.some((row) => row.party_type === "client") && variables.CLIENT_SIGNATORY_NAME) withFallbacks.push({ name: variables.CLIENT_SIGNATORY_NAME, capacity: variables.CLIENT_SIGNATORY_TITLE || "", party_type: "client", sort_order: withFallbacks.length + 1 });
  if (!withFallbacks.some((row) => row.party_type === "firm") && variables.LAW_FIRM_SIGNATORY_NAME) withFallbacks.push({ name: variables.LAW_FIRM_SIGNATORY_NAME, capacity: variables.LAW_FIRM_SIGNATORY_TITLE || "", party_type: "firm", sort_order: withFallbacks.length + 1 });
  const client = withFallbacks.filter((row) => row.party_type === "client"); const firm = withFallbacks.filter((row) => row.party_type === "firm"); const witness = withFallbacks.filter((row) => row.party_type === "witness");
  const minimumClient = Math.max(0, Number(requirements.minimum_client_signers || 0)); const minimumFirm = Math.max(0, Number(requirements.minimum_firm_signers || 0)); const minimumWitness = Math.max(requirements.witness_required === true ? 1 : 0, Number(requirements.minimum_witnesses || 0));
  return <section className="fee-agreement-execution" data-section-kind="execution" data-section-code={string(templateSection?.section_code, "EXECUTION")} style={section}>
    {legacyFrozenExecution ? <><SectionTitle>{string(templateSection?.title, "การลงนาม")}</SectionTitle><SignatoryList rows={withFallbacks} clientName={clientName} /></> : <p className="fee-agreement-execution-attestation" style={executionAttestation}><ThaiLegalText text={feeAgreementClosingCopy({ mode: executionMode, hasWitnesses: witness.length > 0 || minimumWitness > 0, languageCode })} languageCode={languageCode} /></p>}
    <div className="fee-agreement-principal-signatures" style={signatureGrid}>{client.length || minimumClient ? signatureSlots("ผู้ว่าจ้าง", client, minimumClient, legacyFrozenExecution ? signatureUrls : {}, clientName, languageCode, legacyFrozenExecution) : null}{firm.length || minimumFirm ? signatureSlots("ผู้ให้บริการ", firm, minimumFirm, legacyFrozenExecution ? signatureUrls : {}, clientName, languageCode, false) : null}</div>
    {witness.length || minimumWitness ? <div className="fee-agreement-witness-signatures" style={witnessSignatureGrid}>{signatureSlots("พยาน", witness, minimumWitness, legacyFrozenExecution ? signatureUrls : {}, clientName, languageCode, false)}</div> : null}
  </section>;
}
function signatureSlots(title: string, rows: FeeAgreementSignatory[], minimum: number, signatureUrls: Record<string, string>, clientName: string, languageCode: string, showContractualParty: boolean) { const entries: Array<FeeAgreementSignatory | null> = rows.length ? rows : Array.from({ length: Math.max(minimum, 1) }, () => null); return entries.map((signer, index) => <Signature key={`${title}-${index}`} title={entries.length > 1 ? `${title} ${index + 1}` : title} signer={signer} signatureUrl={signer ? signatureUrls[string(signer.signature_storage_path, "")] || "" : ""} clientName={clientName} languageCode={languageCode} showContractualParty={showContractualParty} />); }
function SignatoryList({ rows, clientName }: { rows: FeeAgreementSignatory[]; clientName: string }) { const entries = [...rows].filter((row) => row.name).sort((left, right) => left.sort_order - right.sort_order); return entries.length ? <div>{entries.map((row, index) => { const context = row.party_type === "client" ? feeAgreementSignatoryContext(row, clientName) : ""; return <div key={`${row.name}-${index}`} style={term}><strong>{row.name}</strong><div>{row.capacity || "-"} · {partyLabel[row.party_type] || "ไม่ระบุฝ่าย"}</div>{context ? <div style={muted}>{context}</div> : null}</div>; })}</div> : <p style={muted}>ยังไม่มีข้อมูลผู้ลงนาม</p>; }
function Signature({ title, signer, signatureUrl, clientName, languageCode, showContractualParty }: { title: string; signer: FeeAgreementSignatory | null; signatureUrl: string; clientName: string; languageCode: string; showContractualParty: boolean }) { const context = signer?.party_type === "client" ? feeAgreementSignatoryContext(signer, clientName) : ""; const capacity = signer ? (languageCode === "en" ? string(signer.position_en, signer.capacity) : string(signer.position_th, signer.capacity)) : "-"; const authorityReference = signer ? string(signer.authority_reference, string(signer.authority_note, "")) : ""; return <div className="fee-agreement-signature" style={signature}><strong>{title}</strong>{showContractualParty && signer?.party_type === "client" && (signer.contractual_party_name || clientName) ? <div>คู่สัญญา: {string(signer.contractual_party_name, clientName)}</div> : null}<div style={signatureMark}>{signatureUrl ? <img src={signatureUrl} alt={`ลายมือชื่อ ${signer?.name || ""}`} style={signatureImage} /> : null}</div><div style={line} /><div>ชื่อ: {signer?.name || "-"}</div><div>ตำแหน่ง/ฐานะ: {capacity || "-"}</div>{signer?.email ? <div>อีเมล: {String(signer.email)}</div> : null}{context ? <div>ฐานะการลงนาม: {context}</div> : null}{signer?.power_of_attorney_no ? <div>หนังสือมอบอำนาจเลขที่: {String(signer.power_of_attorney_no)}</div> : null}{signer?.power_of_attorney_date ? <div>ลงวันที่: {String(signer.power_of_attorney_date)}</div> : null}{authorityReference ? <div>อ้างอิงอำนาจ: {authorityReference}</div> : null}<div>วันที่: ____________________</div></div>; }
function legalEntries(legal: Json) { const labels: Record<string, string> = { client_obligations: "หน้าที่ของผู้ว่าจ้าง", firm_obligations: "หน้าที่ของผู้ให้บริการ", exclusions: "งานที่ไม่รวม", expenses_disbursements: "ค่าใช้จ่ายและเงินทดรอง", confidentiality: "การรักษาความลับ", termination_provisions: "การเลิกสัญญา", dispute_jurisdiction: "กฎหมายที่ใช้บังคับ/เขตอำนาจ", additional_terms: "ข้อกำหนดเพิ่มเติม" }; return Object.entries(labels).filter(([key]) => legal[key]).map(([key, label]) => [label, legal[key]] as [string, unknown]); }
const partyLabel: Record<string, string> = { client: "ผู้ว่าจ้าง", firm: "ผู้ให้บริการ", witness: "พยาน" };

function feeCellValue(key: FeeColumnKey, row: Json, index: number, currency: string): ReactNode {
  if (key === "index") return index + 1;
  if (key === "description") return string(row.description);
  if (key === "quantity") return String(row.quantity || "-");
  if (key === "unitPrice") return money(row.unit_price, currency);
  if (key === "vat") return row.vat_applicable ? `${row.vat_rate}%` : "ไม่มี VAT";
  if (key === "beforeVat") return money(row.amount_before_tax, currency);
  return money(row.line_total, currency);
}

function feeHeaderStyle(column: FeeColumn): CSSProperties {
  return { ...feeCell, ...feeHeaderCell, textAlign: column.align };
}

function feeBodyStyle(column: FeeColumn): CSSProperties {
  return {
    ...feeCell,
    textAlign: column.align,
    whiteSpace: ["unitPrice", "vat", "beforeVat", "total"].includes(column.key) ? "nowrap" : "normal",
    fontVariantNumeric: ["unitPrice", "beforeVat", "total"].includes(column.key) ? "tabular-nums" : undefined,
  };
}

const shell = { maxWidth: 1180, margin: "0 auto", padding: 24 }; const controls = { display: "flex", gap: 12, flexWrap: "wrap" as const, alignItems: "center", marginBottom: 16, color: "#475569", fontSize: 14 }; const readinessNotice = { maxWidth: 820, margin: "0 auto 14px", background: "#fff7ed", borderLeft: "3px solid #f59e0b", color: "#92400e", padding: "10px 12px", fontSize: 14 }; const documentStyle = { maxWidth: 820, margin: "0 auto", background: "#fff", border: "1px solid #e5e7eb", boxShadow: "0 6px 20px rgb(15 23 42 / .08)", padding: 36, color: "#1f2937", fontSize: 14, lineHeight: 1.72 }; const muted = { color: "#64748b", fontSize: 13 }; const section = { margin: "20px 0" }; const sectionTitle = { color: "#15803d", fontSize: 17, borderBottom: "1px solid #bbf7d0", paddingBottom: 6, margin: "0 0 10px", breakAfter: "avoid" as const }; const pre = { whiteSpace: "pre-wrap" as const, lineHeight: 1.68, margin: "7px 0", orphans: 3, widows: 3 }; const term = { padding: "8px 0", borderBottom: "1px solid #e5e7eb" }; const tableWrap = { overflowX: "auto" as const }; const table = { width: "100%", minWidth: 680, tableLayout: "fixed" as const, borderCollapse: "collapse" as const, fontSize: 12 }; const feeCell = { padding: "8px 6px", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" as const }; const feeHeaderCell = { background: "#f8fafc", color: "#334155", fontWeight: 700, borderTop: "1px solid #cbd5e1", borderBottom: "1px solid #94a3b8" }; const summary = { marginLeft: "auto", marginTop: 14, maxWidth: 380, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 14, display: "grid", gap: 8, textAlign: "right" as const, breakInside: "avoid" as const }; const grand = { borderTop: "1px solid #86efac", paddingTop: 8, fontSize: 16, color: "#166534" }; const executionAttestation = { margin: 0, lineHeight: 1.72, textAlign: "start" as const, overflowWrap: "normal" as const, orphans: 3, widows: 3, breakAfter: "avoid-page" as const }; const signatureGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 26, marginTop: 20 }; const witnessSignatureGrid = { ...signatureGrid, marginTop: 24 }; const signature = { minHeight: 130, borderTop: "1px solid #94a3b8", paddingTop: 10, fontSize: 13, lineHeight: 1.8, breakInside: "avoid" as const }; const signatureMark = { height: 54, display: "flex", alignItems: "flex-end" }; const signatureImage = { display: "block", maxWidth: 150, maxHeight: 50, objectFit: "contain" as const, objectPosition: "left bottom" }; const line = { borderBottom: "1px solid #64748b", marginBottom: 8 }; const paymentGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }; const paymentCard = { border: "1px solid #e5e7eb", borderRadius: 6, padding: 12, lineHeight: 1.6, breakInside: "avoid" as const }; const allocated = { display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", borderBottom: "1px solid #f1f5f9" }; const commercialSupplement = { marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb" }; const supplementTitle = { margin: "14px 0 8px", fontSize: 14, color: "#334155", breakAfter: "avoid" as const };
