"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  AccessState,
  DocumentPlatformPage,
  useDocumentPlatformAccess,
} from "../../../document-platform-shared";
import {
  DocumentIdentityFooter,
  DocumentIdentityHeader,
} from "../../../../components/DocumentIdentity";
import {
  type DocumentIdentity,
  loadCurrentDocumentIdentity,
  normalizeDocumentIdentity,
} from "../../../../../lib/documentIdentity";
import { supabase } from "../../../../../lib/supabase";
import {
  type FeeAgreementSignatory,
  normalizeFeeAgreementSignatories,
} from "../../../../finance/fee-agreements/signatories";
import styles from "./preview.module.css";

type JsonObject = Record<string, unknown>;

type TemplateRow = {
  id: string;
  template_code: string;
  name: string;
  document_type: string;
};

type VersionRow = {
  id: string;
  template_id: string;
  version_no: number;
  language_code: string;
  status: string;
  renderer_schema_version: number;
  signature_requirements_json: JsonObject;
};

type SectionRow = {
  id: string;
  section_code: string;
  title: string;
  sort_order: number;
  display_number: string | null;
  display_label: string | null;
  section_kind: string;
};

type SlotRow = {
  id: string;
  template_section_id: string;
  clause_version_id: string | null;
  sort_order: number;
  display_number: string | null;
  display_label: string | null;
  numbering_style: string;
};

type ClauseVersionRow = {
  id: string;
  title: string;
  content: string;
  version_no: number;
  status: string;
};

type VariableBindingRow = {
  variable_definition_id: string;
  is_required: boolean;
};

type VariableDefinitionRow = {
  id: string;
  variable_key: string;
  display_name_th: string;
  data_type: string;
  resolver_key: string;
  default_required: boolean;
};

type AgreementContextRow = {
  id: string;
  agreement_no: string | null;
  title: string;
  status: string;
  language_code: string;
  effective_date: string | null;
  commencement_date: string | null;
  expiry_date: string | null;
  currency: string;
  amount_before_tax: number | string;
  vat_amount: number | string;
  total_amount: number | string;
  client_snapshot_json: JsonObject | null;
  matter_snapshot_json: JsonObject | null;
  source_document_snapshot_json: JsonObject | null;
  commercial_terms_snapshot_json: JsonObject | null;
  signatories_json: unknown[] | null;
  created_at: string;
};

type ResolvedVariable = {
  key: string;
  label: string;
  required: boolean;
  value: string;
  resolved: boolean;
};

const asObject = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value)
  ? value as JsonObject
  : {};
const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const hasValue = (value: unknown) => value !== null && value !== undefined && value !== "";

export default function DraftTemplatePreviewPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const templateId = typeof params.id === "string" ? params.id : "";
  const requestedVersionId = searchParams.get("version") || "";
  const requestedContextId = searchParams.get("context") || "";
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [version, setVersion] = useState<VersionRow | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [clauses, setClauses] = useState<ClauseVersionRow[]>([]);
  const [templateBindings, setTemplateBindings] = useState<VariableBindingRow[]>([]);
  const [clauseBindings, setClauseBindings] = useState<VariableBindingRow[]>([]);
  const [variableDefinitions, setVariableDefinitions] = useState<VariableDefinitionRow[]>([]);
  const [contexts, setContexts] = useState<AgreementContextRow[]>([]);
  const [contextId, setContextId] = useState("");
  const [companyProfile, setCompanyProfile] = useState<DocumentIdentity>(() => normalizeDocumentIdentity(null));
  const [logoUrl, setLogoUrl] = useState("");

  const loadPreview = useCallback(async () => {
    if (!access.allowed || !templateId) return;
    setLoading(true);
    setErrorText("");

    const [templateResult, versionsResult, contextsResult, companyResult] = await Promise.all([
      supabase
        .from("document_templates")
        .select("id, template_code, name, document_type")
        .eq("id", templateId)
        .maybeSingle(),
      supabase
        .from("document_template_versions")
        .select("id, template_id, version_no, language_code, status, renderer_schema_version, signature_requirements_json")
        .eq("template_id", templateId)
        .order("version_no", { ascending: false })
        .limit(100),
      supabase
        .from("finance_fee_agreements")
        .select("id, agreement_no, title, status, language_code, effective_date, commencement_date, expiry_date, currency, amount_before_tax, vat_amount, total_amount, client_snapshot_json, matter_snapshot_json, source_document_snapshot_json, commercial_terms_snapshot_json, signatories_json, created_at")
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(100),
      loadCurrentDocumentIdentity(supabase),
    ]);

    if (templateResult.error || versionsResult.error || !templateResult.data) {
      console.error("Unable to load Draft Template Preview", templateResult.error || versionsResult.error);
      setErrorText("ไม่สามารถโหลดแม่แบบสำหรับดูตัวอย่างได้");
      setLoading(false);
      return;
    }

    const templateRow = templateResult.data as TemplateRow;
    const versionRows = (versionsResult.data || []) as VersionRow[];
    const targetVersion = requestedVersionId
      ? versionRows.find((entry) => entry.id === requestedVersionId)
      : versionRows.find((entry) => ["draft", "under_review"].includes(entry.status));

    if (templateRow.document_type !== "fee_agreement" || !targetVersion) {
      setErrorText("ไม่พบเวอร์ชันร่างหรือเวอร์ชันที่อยู่ระหว่างตรวจสำหรับแม่แบบนี้");
      setLoading(false);
      return;
    }
    if (!["draft", "under_review"].includes(targetVersion.status)) {
      setErrorText("หน้า Preview นี้เปิดได้เฉพาะแม่แบบสถานะ Draft หรือ Under Review");
      setLoading(false);
      return;
    }

    const sectionsResult = await supabase
      .from("document_template_sections")
      .select("id, section_code, title, sort_order, display_number, display_label, section_kind")
      .eq("template_version_id", targetVersion.id)
      .order("sort_order", { ascending: true })
      .limit(1000);
    if (sectionsResult.error) {
      console.error("Unable to load Draft Template sections", sectionsResult.error);
      setErrorText("ไม่สามารถโหลดโครงสร้างแม่แบบได้");
      setLoading(false);
      return;
    }

    const sectionRows = (sectionsResult.data || []) as SectionRow[];
    const sectionIds = sectionRows.map((entry) => entry.id);
    const [slotsResult, templateBindingsResult] = await Promise.all([
      sectionIds.length
        ? supabase
          .from("document_template_clause_slots")
          .select("id, template_section_id, clause_version_id, sort_order, display_number, display_label, numbering_style")
          .in("template_section_id", sectionIds)
          .order("sort_order", { ascending: true })
          .limit(5000)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("document_template_variable_bindings")
        .select("variable_definition_id, is_required")
        .eq("template_version_id", targetVersion.id)
        .limit(1000),
    ]);
    if (slotsResult.error || templateBindingsResult.error) {
      console.error("Unable to load Draft Template slots or variables", slotsResult.error || templateBindingsResult.error);
      setErrorText("ไม่สามารถโหลดข้อสัญญาหรือตัวแปรของแม่แบบได้");
      setLoading(false);
      return;
    }

    const slotRows = (slotsResult.data || []) as SlotRow[];
    const clauseVersionIds = Array.from(new Set(slotRows.map((entry) => entry.clause_version_id).filter(Boolean))) as string[];
    const [clausesResult, clauseBindingsResult] = await Promise.all([
      clauseVersionIds.length
        ? supabase
          .from("document_clause_versions")
          .select("id, title, content, version_no, status")
          .in("id", clauseVersionIds)
          .eq("status", "published")
          .limit(5000)
        : Promise.resolve({ data: [], error: null }),
      clauseVersionIds.length
        ? supabase
          .from("document_clause_version_variable_bindings")
          .select("variable_definition_id, is_required")
          .in("clause_version_id", clauseVersionIds)
          .limit(5000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (clausesResult.error || clauseBindingsResult.error) {
      console.error("Unable to load Published Clause content", clausesResult.error || clauseBindingsResult.error);
      setErrorText("ไม่สามารถโหลดถ้อยคำข้อสัญญาที่เผยแพร่แล้วได้");
      setLoading(false);
      return;
    }

    const allBindings = [
      ...((templateBindingsResult.data || []) as VariableBindingRow[]),
      ...((clauseBindingsResult.data || []) as VariableBindingRow[]),
    ];
    const definitionIds = Array.from(new Set(allBindings.map((entry) => entry.variable_definition_id)));
    const definitionsResult = definitionIds.length
      ? await supabase
        .from("document_variable_definitions")
        .select("id, variable_key, display_name_th, data_type, resolver_key, default_required")
        .in("id", definitionIds)
        .eq("status", "active")
        .limit(1000)
      : { data: [], error: null };
    if (definitionsResult.error) {
      console.error("Unable to load controlled Document variables", definitionsResult.error);
      setErrorText("ไม่สามารถโหลดทะเบียนตัวแปรเอกสารได้");
      setLoading(false);
      return;
    }

    const contextRows = contextsResult.error
      ? []
      : ((contextsResult.data || []) as AgreementContextRow[]).filter((entry) => entry.language_code === targetVersion.language_code);
    if (contextsResult.error) console.warn("Draft Fee Agreement preview contexts are unavailable", contextsResult.error);
    if (companyResult.error) console.warn("Current Document Settings identity is unavailable for Draft Template Preview", companyResult.error);

    setTemplate(templateRow);
    setVersion(targetVersion);
    setSections(sectionRows);
    setSlots(slotRows);
    setClauses((clausesResult.data || []) as ClauseVersionRow[]);
    setTemplateBindings((templateBindingsResult.data || []) as VariableBindingRow[]);
    setClauseBindings((clauseBindingsResult.data || []) as VariableBindingRow[]);
    setVariableDefinitions((definitionsResult.data || []) as VariableDefinitionRow[]);
    setContexts(contextRows);
    setContextId(contextRows.some((entry) => entry.id === requestedContextId) ? requestedContextId : "");
    setCompanyProfile(companyResult.identity);
    setLogoUrl(companyResult.logoUrl);
    setLoading(false);
  }, [access.allowed, requestedContextId, requestedVersionId, templateId]);

  useEffect(() => {
    if (access.loading || !access.allowed) return;
    const timer = window.setTimeout(() => void loadPreview(), 0);
    return () => window.clearTimeout(timer);
  }, [access.allowed, access.loading, loadPreview]);

  const context = contexts.find((entry) => entry.id === contextId) || null;
  const signatories = useMemo(
    () => normalizeFeeAgreementSignatories(context?.signatories_json || []),
    [context],
  );
  const resolvedVariables = useMemo(
    () => resolveVariables(templateBindings, clauseBindings, variableDefinitions, context, companyProfile, signatories),
    [clauseBindings, companyProfile, context, signatories, templateBindings, variableDefinitions],
  );
  const variableMap = useMemo(
    () => Object.fromEntries(resolvedVariables.filter((entry) => entry.resolved).map((entry) => [entry.key, entry.value])),
    [resolvedVariables],
  );
  const clauseById = useMemo(() => new Map(clauses.map((entry) => [entry.id, entry])), [clauses]);
  const sortedSections = useMemo(() => [...sections].sort((left, right) => left.sort_order - right.sort_order), [sections]);
  const unresolvedRequired = resolvedVariables.filter((entry) => entry.required && !entry.resolved);
  const preambleDefinitionIds = new Set(templateBindings.map((entry) => entry.variable_definition_id));
  const preambleVariables = resolvedVariables.filter((entry) => preambleDefinitionIds.has(variableDefinitions.find((definition) => definition.variable_key === entry.key)?.id || ""));
  const requirements = asObject(version?.signature_requirements_json);
  const missingClauseSlots = slots.filter((slot) => !slot.clause_version_id || !clauseById.has(slot.clause_version_id));

  return (
    <DocumentPlatformPage title="Settings" subtitle="Draft Template Preview">
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <div className={styles.toolbar}>
            <Link href={`/settings/document-templates/${templateId}`} className={styles.backLink}>กลับไปแม่แบบ</Link>
            <label className={styles.contextField}>
              บริบทตัวอย่าง
              <select value={contextId} onChange={(event) => setContextId(event.target.value)}>
                <option value="">ข้อมูลตัวอย่างแบบไม่ผูกกับสัญญา</option>
                {contexts.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {contextLabel(entry)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.previewMode}>
            <strong>โหมดตัวอย่าง — ยังไม่ได้เผยแพร่หรือผูกกับสัญญาจริง</strong>
            <span>หน้านี้อ่านข้อมูลเพื่อประกอบภาพตัวอย่างเท่านั้น และไม่บันทึกการเปลี่ยนแปลงใด ๆ</span>
          </div>

          {errorText ? <div className={styles.error}>{errorText}</div> : null}
          {loading ? <div className={styles.loading}>กำลังประกอบตัวอย่างแม่แบบ...</div> : null}

          {!loading && template && version ? (
            <>
              <details className={styles.diagnostics}>
                <summary>ข้อมูลตรวจสอบ Renderer</summary>
                <div className={styles.diagnosticGrid}>
                  <Diagnostic label="แม่แบบ" value={`${template.template_code} · รุ่น ${version.version_no}`} />
                  <Diagnostic label="Renderer schema" value={String(version.renderer_schema_version)} />
                  <Diagnostic label="ส่วนของเอกสาร" value={`${sections.length} ส่วน`} />
                  <Diagnostic label="ตำแหน่งข้อสัญญา" value={`${slots.length} ตำแหน่ง`} />
                  <Diagnostic label="PREAMBLE variables" value={`${preambleVariables.filter((entry) => entry.resolved).length}/${preambleVariables.length} resolved`} />
                  <Diagnostic label="บริบท" value={context ? contextLabel(context) : "Synthetic placeholders (read-only)"} />
                  <Diagnostic label="ข้อกำหนดผู้ลงนาม" value={signatureSummary(requirements)} />
                  <Diagnostic label="ข้อสัญญาที่โหลดไม่ได้" value={missingClauseSlots.length ? `${missingClauseSlots.length} ตำแหน่ง` : "ไม่มี"} />
                </div>
                <div className={styles.unresolved}>
                  <strong>ตัวแปรจำเป็นที่ยังไม่มีข้อมูล</strong>
                  <span>{unresolvedRequired.length ? unresolvedRequired.map((entry) => `${entry.label} (${entry.key})`).join(", ") : "ไม่มี"}</span>
                </div>
              </details>

              {version.renderer_schema_version !== 3 ? (
                <div className={styles.error}>แม่แบบนี้ไม่ใช่ Renderer schema v3 จึงไม่สามารถแสดงตัวอย่างด้วย renderer นี้ได้</div>
              ) : (
                <article className={styles.document}>
                  {sortedSections.map((section) => {
                    if (section.section_kind === "preamble") {
                      return <Preamble key={section.id} template={template} section={section} variables={variableMap} identity={companyProfile} logoUrl={logoUrl} languageCode={version.language_code} />;
                    }
                    if (section.section_kind === "execution") {
                      return <Execution key={section.id} section={section} requirements={requirements} signatories={signatories} variables={variableMap} />;
                    }
                    const sectionSlots = slots
                      .filter((slot) => slot.template_section_id === section.id)
                      .sort((left, right) => left.sort_order - right.sort_order);
                    return (
                      <section key={section.id} className={styles.legalSection} data-section-code={section.section_code}>
                        <h2>{sectionTitle(section)}</h2>
                        {sectionSlots.length ? sectionSlots.map((slot) => {
                          const clause = slot.clause_version_id ? clauseById.get(slot.clause_version_id) : null;
                          return clause ? (
                            <div key={slot.id} className={styles.clause}>
                              <h3>{slotTitle(slot, clause)}</h3>
                              <p>{interpolateControlledVariables(clause.content, variableMap)}</p>
                            </div>
                          ) : (
                            <div key={slot.id} className={styles.missing}>ไม่พบ Published Clause ที่ตำแหน่งนี้</div>
                          );
                        }) : <div className={styles.missing}>ส่วนนี้ยังไม่มีข้อสัญญาที่แนบไว้</div>}
                      </section>
                    );
                  })}
                  <DocumentIdentityFooter identity={companyProfile} />
                </article>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </DocumentPlatformPage>
  );
}

function Preamble({ template, section, variables, identity, logoUrl, languageCode }: { template: TemplateRow; section: SectionRow; variables: Record<string, string>; identity: DocumentIdentity; logoUrl: string; languageCode: string }) {
  const value = (key: string, label: string, fallback = "") => variables[key] || fallback || `[ยังไม่มีข้อมูล: ${label}]`;
  return (
    <section className={styles.preamble} data-section-code={section.section_code}>
      <DocumentIdentityHeader
        identity={identity}
        logoUrl={logoUrl}
        title={value("AGREEMENT_TITLE", "ชื่อสัญญา", template.name)}
        subtitle="Fee Agreement Template Preview"
        documentNo={value("AGREEMENT_NO", "เลขที่สัญญา")}
        languageCode={languageCode}
      />
      <div className={styles.partyGrid}>
        <InfoBlock title="ผู้รับบริการ / ลูกค้า" rows={[
          ["ชื่อ", value("CLIENT_NAME", "ชื่อลูกค้า")],
          ["เลขประจำตัวผู้เสียภาษี", value("CLIENT_TAX_ID", "เลขประจำตัวผู้เสียภาษีลูกค้า")],
          ["ที่อยู่", value("CLIENT_ADDRESS", "ที่อยู่ลูกค้า")],
          ["ผู้ลงนาม", value("CLIENT_SIGNATORY_NAME", "ผู้ลงนามลูกค้า")],
          ["ตำแหน่ง/ฐานะ", value("CLIENT_SIGNATORY_TITLE", "ตำแหน่งผู้ลงนามลูกค้า")],
        ]} />
        <InfoBlock title="ข้อมูลเอกสารและเรื่องที่รับดำเนินการ" rows={[
          ["วันที่สัญญา", value("AGREEMENT_DATE", "วันที่สัญญา")],
          ["วันที่มีผล", value("EFFECTIVE_DATE", "วันที่มีผล")],
          ["เรื่อง/คดี", value("MATTER_NAME", "ชื่อเรื่องหรือคดี")],
          ["ใบเสนอราคาต้นทาง", value("SOURCE_QUOTATION_NO", "เลขที่ใบเสนอราคา")],
        ]} />
      </div>
    </section>
  );
}

function Execution({ section, requirements, signatories, variables }: { section: SectionRow; requirements: JsonObject; signatories: FeeAgreementSignatory[]; variables: Record<string, string> }) {
  const rows = [...signatories];
  if (!rows.some((entry) => entry.party_type === "client") && variables.CLIENT_SIGNATORY_NAME) {
    rows.push({ name: variables.CLIENT_SIGNATORY_NAME, capacity: variables.CLIENT_SIGNATORY_TITLE || "", party_type: "client", sort_order: rows.length + 1 });
  }
  if (!rows.some((entry) => entry.party_type === "firm") && variables.LAW_FIRM_SIGNATORY_NAME) {
    rows.push({ name: variables.LAW_FIRM_SIGNATORY_NAME, capacity: variables.LAW_FIRM_SIGNATORY_TITLE || "", party_type: "firm", sort_order: rows.length + 1 });
  }
  const client = rows.filter((entry) => entry.party_type === "client");
  const firm = rows.filter((entry) => entry.party_type === "firm");
  const witness = rows.filter((entry) => entry.party_type === "witness");
  const minimumClient = Math.max(1, Number(requirements.minimum_client_signers || 0));
  const minimumFirm = Math.max(1, Number(requirements.minimum_firm_signers || 0));
  const minimumWitness = Math.max(requirements.witness_required === true ? 1 : 0, Number(requirements.minimum_witnesses || 0));
  return (
    <section className={styles.execution} data-section-code={section.section_code}>
      <h2>{sectionTitle(section)}</h2>
      <p>คู่สัญญาได้อ่านและเข้าใจข้อกำหนดตามแม่แบบฉบับนี้แล้ว โดยพื้นที่ลงนามด้านล่างเป็นตัวอย่างรูปแบบเอกสารเท่านั้น</p>
      <div className={styles.signatureGrid}>
        {signatureSlots("ผู้ให้บริการ / สำนักงาน", firm, minimumFirm)}
        {signatureSlots("ผู้รับบริการ / ลูกค้า", client, minimumClient)}
        {witness.length || minimumWitness ? signatureSlots("พยาน", witness, minimumWitness) : null}
      </div>
    </section>
  );
}

function signatureSlots(title: string, rows: FeeAgreementSignatory[], minimum: number) {
  const entries: Array<FeeAgreementSignatory | null> = rows.length
    ? rows
    : Array.from({ length: Math.max(minimum, 1) }, () => null);
  return entries.map((entry, index) => (
    <div className={styles.signature} key={`${title}-${index}`}>
      <strong>{entries.length > 1 ? `${title} ${index + 1}` : title}</strong>
      <div className={styles.signatureLine} />
      <div>ชื่อ: {entry?.name || "[ยังไม่ได้ระบุ]"}</div>
      <div>ตำแหน่ง/ฐานะ: {entry?.capacity || "[ยังไม่ได้ระบุ]"}</div>
      <div>วันที่: ____________________</div>
    </div>
  ));
}

function InfoBlock({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <div className={styles.infoBlock}><strong>{title}</strong>{rows.map(([label, value]) => <div className={styles.infoRow} key={label}><span>{label}</span><span>{value}</span></div>)}</div>;
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function resolveVariables(templateBindings: VariableBindingRow[], clauseBindings: VariableBindingRow[], definitions: VariableDefinitionRow[], context: AgreementContextRow | null, currentCompany: DocumentIdentity, signatories: FeeAgreementSignatory[]): ResolvedVariable[] {
  const requiredById = new Map<string, boolean>();
  [...templateBindings, ...clauseBindings].forEach((binding) => {
    requiredById.set(binding.variable_definition_id, (requiredById.get(binding.variable_definition_id) || false) || binding.is_required);
  });
  return definitions.map((definition) => {
    const raw = resolveValue(definition.resolver_key, context, currentCompany, signatories);
    const resolved = hasValue(raw);
    return {
      key: definition.variable_key,
      label: definition.display_name_th,
      required: Boolean(requiredById.get(definition.id) || definition.default_required),
      value: resolved ? formatVariable(raw, definition.data_type, context?.currency || "THB") : "",
      resolved,
    };
  });
}

function resolveValue(resolverKey: string, agreement: AgreementContextRow | null, currentCompany: DocumentIdentity, signatories: FeeAgreementSignatory[]) {
  const client = asObject(agreement?.client_snapshot_json);
  const matter = asObject(agreement?.matter_snapshot_json);
  const source = asObject(agreement?.source_document_snapshot_json);
  const sourceQuotation = asObject(source.quotation);
  const commercial = asObject(agreement?.commercial_terms_snapshot_json);
  const paymentTerms = asObject(commercial.payment_terms || source.payment_terms);
  const clientSigner = signatories.find((entry) => entry.party_type === "client");
  const firmSigner = signatories.find((entry) => entry.party_type === "firm");
  const values: Record<string, unknown> = {
    "agreement.title": agreement?.title,
    "agreement.agreement_no": agreement?.agreement_no,
    "agreement.created_date": agreement?.created_at,
    "agreement.effective_date": agreement?.effective_date,
    "agreement.commencement_date": agreement?.commencement_date,
    "agreement.expiry_date": agreement?.expiry_date,
    "client.name": client.name || client.client_name || client.display_name,
    "client.address": client.address || client.address_th,
    "client.tax_id": client.tax_id,
    "company.name": currentCompany.companyNameTh,
    "company.address": currentCompany.addressTh,
    "company.tax_id": currentCompany.taxId,
    "source.quotation_no": source.quotation_no || sourceQuotation.quotation_no,
    "matter.name": matter.name || matter.title || matter.file_no || matter.matter_no,
    "matter.service_scope": matter.service_scope || matter.scope_of_legal_services,
    "commercial.subtotal": agreement?.amount_before_tax,
    "commercial.vat_amount": agreement?.vat_amount,
    "commercial.total": agreement?.total_amount,
    "commercial.currency": agreement?.currency,
    "commercial.payment_schedule": paymentTerms,
    "signatories.client_name": clientSigner?.name,
    "signatories.client_title": clientSigner?.capacity,
    "signatories.firm_name": firmSigner?.name,
    "signatories.firm_title": firmSigner?.capacity,
  };
  return values[resolverKey];
}

function formatVariable(value: unknown, dataType: string, currency: string) {
  if (dataType === "money") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : String(value);
  }
  if (dataType === "date" && typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(parsed);
  }
  if (dataType === "list") {
    const row = asObject(value);
    const installments = Array.isArray(row.installments) ? row.installments : [];
    return installments.length ? `${installments.length} งวด` : "";
  }
  return typeof value === "string" ? value : String(value);
}

function interpolateControlledVariables(content: string, variables: Record<string, string>) {
  return content.replace(/\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g, (_, key: string) => variables[key] || `[${key}: ยังไม่มีข้อมูล]`);
}

function sectionTitle(section: SectionRow) {
  const prefix = section.display_label || section.display_number || "";
  return prefix ? `${prefix} ${section.title}` : section.title;
}

function slotTitle(slot: SlotRow, clause: ClauseVersionRow) {
  if (slot.numbering_style === "none") return clause.title;
  const prefix = slot.display_label || slot.display_number || "";
  return prefix ? `${prefix} ${clause.title}` : clause.title;
}

function contextLabel(context: AgreementContextRow) {
  const client = asObject(context.client_snapshot_json);
  const clientName = asText(client.name || client.client_name || client.display_name);
  return [context.agreement_no || "Draft ไม่มีเลขที่", context.title, clientName].filter(Boolean).join(" · ");
}

function signatureSummary(requirements: JsonObject) {
  const client = Number(requirements.minimum_client_signers || 0);
  const firm = Number(requirements.minimum_firm_signers || 0);
  const witness = Math.max(requirements.witness_required === true ? 1 : 0, Number(requirements.minimum_witnesses || 0));
  return `ลูกค้า ${client} · สำนักงาน ${firm} · พยาน ${witness}${requirements.witness_required === true ? " (บังคับ)" : " (ไม่บังคับ)"}`;
}
