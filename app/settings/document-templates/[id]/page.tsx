"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AccessState,
  DocumentPlatformPage,
  RiskBadge,
  StatusBadge,
  statusLabel,
  canApproveDocumentPlatform,
  documentTypeLabel,
  formatDateTime,
  friendlyError,
  languageLabel,
  riskLabel,
  useDocumentPlatformAccess,
} from "../../document-platform-shared";
import { supabase } from "../../../../lib/supabase";
import { useI18n } from "@/lib/i18n/provider";
import { uiMessage, type UiMessage, type UiLocale } from "@/lib/i18n/core";
import { translate } from "@/lib/i18n/catalog";
import styles from "../../document-platform.module.css";

type JsonObject = Record<string, unknown>;

type TemplateRow = {
  id: string;
  name: string;
  template_code: string;
  document_type: string;
  language_code: string;
  status: string;
  metadata_json: JsonObject | null;
  updated_at: string | null;
};

type VersionRow = {
  id: string;
  template_id: string;
  version_no: number;
  language_code: string;
  status: string;
  definition_json: JsonObject;
  signature_requirements_json: JsonObject;
  renderer_schema_version: number;
  effective_from: string | null;
  effective_to: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  retired_at: string | null;
  updated_at: string | null;
};

type SectionRow = {
  id: string;
  template_version_id: string;
  section_code: string;
  title: string;
  sort_order: number;
  parent_section_id: string | null;
  display_number: string | null;
  display_label: string | null;
  numbering_style: string;
  numbering_depth: number;
  section_kind: string;
  condition_rule_json: JsonObject | null;
  is_required: boolean;
  allow_custom_after: boolean;
  risk_level: string | null;
  metadata_json: JsonObject;
};

type SlotRow = {
  id: string;
  template_section_id: string;
  slot_code: string;
  clause_version_id: string | null;
  sort_order: number;
  parent_slot_id: string | null;
  display_number: string | null;
  display_label: string | null;
  numbering_style: string;
  numbering_depth: number;
  clause_type: string;
  alternative_group_id: string | null;
  condition_rule_json: JsonObject | null;
  is_required: boolean;
  allow_override: boolean;
  allow_suppress: boolean;
  allow_custom_after: boolean;
  risk_level: string | null;
  metadata_json: JsonObject;
};

type ClauseVersionRow = {
  id: string;
  clause_id: string;
  version_no: number;
  language_code: string;
  title: string;
  status: string;
  metadata_json: JsonObject | null;
};

type ClauseFamilyRow = {
  id: string;
  clause_code: string;
};

type SectionForm = {
  id: string;
  section_code: string;
  title: string;
  sort_order: number;
  parent_section_id: string;
  display_number: string;
  display_label: string;
  numbering_style: string;
  numbering_depth: number;
  section_kind: string;
  is_required: boolean;
  allow_custom_after: boolean;
  risk_level: string;
  condition_rule_json: JsonObject | null;
  metadata_json: JsonObject;
};

type SlotForm = {
  id: string;
  template_section_id: string;
  slot_code: string;
  clause_version_id: string;
  sort_order: number;
  parent_slot_id: string;
  display_number: string;
  display_label: string;
  numbering_style: string;
  numbering_depth: number;
  clause_type: string;
  alternative_group_id: string;
  is_required: boolean;
  allow_override: boolean;
  allow_suppress: boolean;
  allow_custom_after: boolean;
  risk_level: string;
  condition_rule_json: JsonObject | null;
  metadata_json: JsonObject;
};

const sectionKinds = ["normal", "preamble", "schedule", "appendix", "execution"];
const numberingStyles = ["explicit", "decimal", "roman", "thai_clause", "thai_appendix", "none"];
const riskLevels = ["", "informational", "low", "medium", "high", "critical"];
const clauseTypes = ["mandatory", "optional", "placeholder", "conditional"];
const vpLegalServicesClauseSequence = [
  { sectionCode: "SCOPE", clauseCode: "SCOPE-GENERAL-TH", sectionNumber: 2 },
  { sectionCode: "INCLUDED_SERVICES", clauseCode: "INCLUDED-SERVICES-GENERAL-TH", sectionNumber: 3 },
  { sectionCode: "EXCLUDED_SERVICES", clauseCode: "EXCLUDED-SERVICES-GENERAL-TH", sectionNumber: 4 },
  { sectionCode: "FEES_PAYMENT", clauseCode: "FEES-PAYMENT-GENERAL-TH", sectionNumber: 5 },
  { sectionCode: "CLIENT_OBLIGATIONS", clauseCode: "CLIENT-OBLIGATIONS-GENERAL-TH", sectionNumber: 6 },
  { sectionCode: "FIRM_OBLIGATIONS", clauseCode: "FIRM-OBLIGATIONS-GENERAL-TH", sectionNumber: 7 },
  { sectionCode: "EXPENSES", clauseCode: "EXPENSES-ADVANCES-GENERAL-TH", sectionNumber: 8 },
  { sectionCode: "CONFIDENTIALITY", clauseCode: "CONFIDENTIALITY-DOCUMENTS-GENERAL-TH", sectionNumber: 9 },
  { sectionCode: "COOPERATION_RELIANCE", clauseCode: "RELIANCE-INFORMATION-GENERAL-TH", sectionNumber: 10 },
  { sectionCode: "TERMINATION", clauseCode: "TERMINATION-GENERAL-TH", sectionNumber: 11 },
  { sectionCode: "GOVERNING_LAW", clauseCode: "GOVERNING-LAW-DISPUTES-TH", sectionNumber: 12 },
  { sectionCode: "NOTICES_GENERAL", clauseCode: "NOTICES-GENERAL-TERMS-TH", sectionNumber: 13 },
] as const;

function certificationErrorMessage(error: unknown, fallback: UiMessage, scope: "family" | "version") {
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "";

  console.error(fallback, error);

  if (message.includes("Only draft document template families can be edited")) {
    return uiMessage("settings.documents.template.certification.familyChanged");
  }
  if (message.includes("Only draft template versions can be edited")) {
    return uiMessage("settings.documents.template.certification.versionChanged");
  }
  if (message.includes("Not allowed to save document template")) {
    return uiMessage("settings.documents.template.certification.denied");
  }
  if (message.includes("Invalid document template version data")) {
    return uiMessage("settings.documents.template.certification.invalid");
  }
  if (message.includes("Template effective date range is invalid")) {
    return uiMessage("settings.documents.template.certification.dates");
  }

  const sanitizedMessage = message
    .split(/\r?\n/, 1)[0]
    .replace(/\b(?:DETAIL|HINT|CONTEXT):.*$/i, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  if (sanitizedMessage) {
    return uiMessage(scope === "family" ? "settings.documents.template.certification.familyDiagnostic" : "settings.documents.template.certification.versionDiagnostic", { message: sanitizedMessage });
  }

  return fallback;
}

export default function DocumentTemplateDetailPage() {
  const { t, text, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const templateId = typeof params.id === "string" ? params.id : "";
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<UiMessage | string>("");
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [clauseVersions, setClauseVersions] = useState<ClauseVersionRow[]>([]);
  const [clauseFamilies, setClauseFamilies] = useState<ClauseFamilyRow[]>([]);
  const [editingFamily, setEditingFamily] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [editingVersion, setEditingVersion] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [sectionForm, setSectionForm] = useState<SectionForm | null>(null);
  const [slotForm, setSlotForm] = useState<SlotForm | null>(null);
  const familyEditorRef = useRef<HTMLDivElement | null>(null);
  const versionEditorRef = useRef<HTMLDivElement | null>(null);
  const sectionEditorRef = useRef<HTMLDivElement | null>(null);
  const slotEditorRef = useRef<HTMLDivElement | null>(null);

  const selectedVersion = versions.find((version) => version.id === selectedVersionId) || null;
  const isDraft = selectedVersion?.status === "draft";
  const isLatestLanguageVersion = selectedVersion
    ? versions.every((version) => version.language_code !== selectedVersion.language_code || version.version_no <= selectedVersion.version_no)
    : false;
  const canApprove = canApproveDocumentPlatform(access.role);
  const familyReadinessApproved = Boolean(template)
    && template?.metadata_json?.inactive_shell !== true
    && template?.metadata_json?.legal_wording_approved === true;
  const versionReadinessApproved = Boolean(selectedVersion)
    && selectedVersion?.definition_json?.inactive_shell !== true
    && selectedVersion?.definition_json?.legal_wording_approved === true;
  const readinessPending = !familyReadinessApproved || !versionReadinessApproved;
  const activeFamilyReadinessInconsistent = template?.status === "active" && !familyReadinessApproved;

  const loadWorkspace = useCallback(async (preferredVersionId?: string) => {
    if (!access.allowed || !templateId) return;
    setLoading(true);
    setErrorText("");

    const [templateResult, versionsResult] = await Promise.all([
      supabase
        .from("document_templates")
        .select("id, name, template_code, document_type, language_code, status, metadata_json, updated_at")
        .eq("id", templateId)
        .maybeSingle(),
      supabase
        .from("document_template_versions")
        .select("id, template_id, version_no, language_code, status, definition_json, signature_requirements_json, renderer_schema_version, effective_from, effective_to, reviewed_at, published_at, retired_at, updated_at")
        .eq("template_id", templateId)
        .order("version_no", { ascending: false })
        .limit(100),
    ]);

    if (templateResult.error || versionsResult.error || !templateResult.data) {
      setErrorText(friendlyError(templateResult.error || versionsResult.error, uiMessage("settings.documents.template.error.load")));
      setLoading(false);
      return;
    }

    const templateRow = templateResult.data as TemplateRow;
    const versionRows = (versionsResult.data || []) as VersionRow[];
    const activeVersionId = versionRows.some((version) => version.id === preferredVersionId)
      ? preferredVersionId || ""
      : versionRows[0]?.id || "";
    const activeVersion = versionRows.find((version) => version.id === activeVersionId) || null;

    setTemplate(templateRow);
    setFamilyName(templateRow.name);
    setVersions(versionRows);
    setSelectedVersionId(activeVersionId);
    setEffectiveFrom(activeVersion?.effective_from || "");
    setEffectiveTo(activeVersion?.effective_to || "");

    if (!activeVersion) {
      setSections([]);
      setSlots([]);
      setClauseVersions([]);
      setClauseFamilies([]);
      setLoading(false);
      return;
    }

    const sectionsResult = await supabase
      .from("document_template_sections")
      .select("id, template_version_id, section_code, title, sort_order, parent_section_id, display_number, display_label, numbering_style, numbering_depth, section_kind, condition_rule_json, is_required, allow_custom_after, risk_level, metadata_json")
      .eq("template_version_id", activeVersion.id)
      .order("sort_order", { ascending: true })
      .limit(1000);

    if (sectionsResult.error) {
      setErrorText(friendlyError(sectionsResult.error, uiMessage("settings.documents.template.error.sections")));
      setLoading(false);
      return;
    }

    const sectionRows = (sectionsResult.data || []) as SectionRow[];
    const sectionIds = sectionRows.map((section) => section.id);
    let slotRows: SlotRow[] = [];
    if (sectionIds.length > 0) {
      const slotsResult = await supabase
        .from("document_template_clause_slots")
        .select("id, template_section_id, slot_code, clause_version_id, sort_order, parent_slot_id, display_number, display_label, numbering_style, numbering_depth, clause_type, alternative_group_id, condition_rule_json, is_required, allow_override, allow_suppress, allow_custom_after, risk_level, metadata_json")
        .in("template_section_id", sectionIds)
        .order("sort_order", { ascending: true })
        .limit(5000);
      if (slotsResult.error) {
        setErrorText(friendlyError(slotsResult.error, uiMessage("settings.documents.template.error.slots")));
        setLoading(false);
        return;
      }
      slotRows = (slotsResult.data || []) as SlotRow[];
    }

    const publishedClausesResult = await supabase
      .from("document_clause_versions")
      .select("id, clause_id, version_no, language_code, title, status, metadata_json")
      .eq("language_code", activeVersion.language_code)
      .eq("status", "published")
      .order("title", { ascending: true })
      .limit(1000);
    if (publishedClausesResult.error) {
      setErrorText(friendlyError(publishedClausesResult.error, uiMessage("settings.documents.template.error.clauses")));
      setLoading(false);
      return;
    }

    let clauseRows = (publishedClausesResult.data || []) as ClauseVersionRow[];
    const attachedIds = Array.from(new Set(slotRows.map((slot) => slot.clause_version_id).filter(Boolean))) as string[];
    const missingAttachedIds = attachedIds.filter((id) => !clauseRows.some((clause) => clause.id === id));
    if (missingAttachedIds.length > 0) {
      const attachedResult = await supabase
        .from("document_clause_versions")
        .select("id, clause_id, version_no, language_code, title, status, metadata_json")
        .in("id", missingAttachedIds)
        .limit(1000);
      if (!attachedResult.error) {
        clauseRows = [...clauseRows, ...((attachedResult.data || []) as ClauseVersionRow[])];
      }
    }

    const familyIds = Array.from(new Set(clauseRows.map((clause) => clause.clause_id)));
    let familyRows: ClauseFamilyRow[] = [];
    if (familyIds.length > 0) {
      const familiesResult = await supabase
        .from("document_clause_libraries")
        .select("id, clause_code")
        .in("id", familyIds)
        .limit(1000);
      if (!familiesResult.error) {
        familyRows = (familiesResult.data || []) as ClauseFamilyRow[];
      }
    }

    setSections(sectionRows);
    setSlots(slotRows);
    setClauseVersions(clauseRows);
    setClauseFamilies(familyRows);
    setLoading(false);
  }, [access.allowed, templateId]);

  useEffect(() => {
    if (access.loading) return;
    if (!access.allowed) return;
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [access.allowed, access.loading, loadWorkspace]);

  const slotCountBySection = useMemo(() => {
    const counts = new Map<string, number>();
    slots.forEach((slot) => counts.set(slot.template_section_id, (counts.get(slot.template_section_id) || 0) + 1));
    return counts;
  }, [slots]);

  const saveFamily = async () => {
    if (!template || template.status !== "draft" || !familyName.trim() || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("save_document_template_family_draft", {
      p_template_id: template.id,
      p_document_type: template.document_type,
      p_template_code: template.template_code,
      p_name: familyName.trim(),
      p_language_code: template.language_code,
      p_metadata_json: template.metadata_json || {},
    });
    if (error) {
      setErrorText(friendlyError(error, uiMessage("settings.documents.template.error.family")));
    } else {
      setEditingFamily(false);
      await loadWorkspace(selectedVersionId);
    }
    setSaving(false);
  };

  const saveVersion = async () => {
    if (!template || !selectedVersion || !isDraft || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("save_document_template_version_draft", {
      p_template_version_id: selectedVersion.id,
      p_template_id: template.id,
      p_language_code: selectedVersion.language_code,
      p_definition_json: selectedVersion.definition_json,
      p_effective_from: effectiveFrom || null,
      p_effective_to: effectiveTo || null,
    });
    if (error) {
      setErrorText(friendlyError(error, uiMessage("settings.documents.template.error.version")));
    } else {
      setEditingVersion(false);
      await loadWorkspace(selectedVersion.id);
    }
    setSaving(false);
  };

  const clonePublishedVersion = async () => {
    if (!selectedVersion || selectedVersion.status !== "published" || saving) return;
    if (!window.confirm(t("settings.documents.template.confirmClone", { number: selectedVersion.version_no }))) return;

    setSaving(true);
    setErrorText("");
    const { data, error } = await supabase.rpc("clone_document_template_version", {
      p_source_template_version_id: selectedVersion.id,
    });
    if (error || !data) {
      setErrorText(friendlyError(error, uiMessage("settings.documents.template.error.clone")));
    } else {
      await loadWorkspace(String(data));
    }
    setSaving(false);
  };

  const certifyTemplateReadiness = async () => {
    if (!template || !selectedVersion || !isDraft || !readinessPending || !canApprove || saving) return;
    if (template.status === "active" && !familyReadinessApproved) {
      setErrorText(uiMessage("settings.documents.template.certification.inconsistent"));
      return;
    }
    if (!["draft", "active"].includes(template.status)) {
      setErrorText(uiMessage("settings.documents.template.certification.unsupported"));
      return;
    }
    const confirmed = window.confirm(
      t("settings.documents.template.certification.confirm"),
    );
    if (!confirmed) return;

    setSaving(true);
    setErrorText("");

    if (template.status === "draft") {
      const familyResult = await supabase.rpc("save_document_template_family_draft", {
        p_template_id: template.id,
        p_document_type: template.document_type,
        p_template_code: template.template_code,
        p_name: template.name,
        p_language_code: template.language_code,
        p_metadata_json: {
          ...(template.metadata_json || {}),
          inactive_shell: false,
          legal_wording_approved: true,
        },
      });

      if (familyResult.error) {
        await loadWorkspace(selectedVersion.id);
        setErrorText(certificationErrorMessage(familyResult.error, uiMessage("settings.documents.template.certification.familyFallback"), "family"));
        setSaving(false);
        return;
      }
    }

    const certifiedDefinitionJson = {
      ...selectedVersion.definition_json,
      inactive_shell: false,
      legal_wording_approved: true,
    };

    console.info("Template readiness certification request", {
      familyStatus: template.status,
      versionStatus: selectedVersion.status,
      versionNumber: selectedVersion.version_no,
      familyReadinessApproved,
      versionReadinessApproved,
      branch: template.status === "draft" ? "draft_family_then_version" : "active_family_version_only",
      definitionKeys: Object.keys(certifiedDefinitionJson).sort(),
      effectiveFromPresent: Boolean(selectedVersion.effective_from),
      effectiveToPresent: Boolean(selectedVersion.effective_to),
    });

    const versionResult = await supabase.rpc("save_document_template_version_draft", {
      p_template_version_id: selectedVersion.id,
      p_template_id: template.id,
      p_language_code: selectedVersion.language_code,
      p_definition_json: certifiedDefinitionJson,
      p_effective_from: selectedVersion.effective_from,
      p_effective_to: selectedVersion.effective_to,
    });

    if (versionResult.error) {
      await loadWorkspace(selectedVersion.id);
      setErrorText(certificationErrorMessage(versionResult.error, uiMessage("settings.documents.template.certification.versionFallback"), "version"));
      setSaving(false);
      return;
    }

    await loadWorkspace(selectedVersion.id);
    setSaving(false);
  };

  const saveSection = async () => {
    if (!selectedVersion || !sectionForm || !isDraft || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("save_document_template_section_draft", {
      p_section_id: sectionForm.id || null,
      p_template_version_id: selectedVersion.id,
      p_section_code: sectionForm.section_code,
      p_title: sectionForm.title,
      p_sort_order: sectionForm.sort_order,
      p_parent_section_id: sectionForm.parent_section_id || null,
      p_display_number: sectionForm.display_number || null,
      p_display_label: sectionForm.display_label || null,
      p_numbering_style: sectionForm.numbering_style,
      p_numbering_depth: sectionForm.numbering_depth,
      p_section_kind: sectionForm.section_kind,
      p_condition_rule_json: sectionForm.condition_rule_json,
      p_is_required: sectionForm.is_required,
      p_allow_custom_after: sectionForm.allow_custom_after,
      p_risk_level: sectionForm.risk_level || null,
      p_metadata_json: sectionForm.metadata_json,
    });
    if (error) {
      setErrorText(friendlyError(error, uiMessage("settings.documents.template.error.saveSection")));
    } else {
      setSectionForm(null);
      await loadWorkspace(selectedVersion.id);
    }
    setSaving(false);
  };

  const saveSlot = async () => {
    if (!selectedVersion || !slotForm || !isDraft || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("save_document_template_clause_slot_draft", {
      p_slot_id: slotForm.id || null,
      p_template_section_id: slotForm.template_section_id,
      p_slot_code: slotForm.slot_code,
      p_clause_version_id: slotForm.clause_version_id || null,
      p_sort_order: slotForm.sort_order,
      p_parent_slot_id: slotForm.parent_slot_id || null,
      p_display_number: slotForm.display_number || null,
      p_display_label: slotForm.display_label || null,
      p_numbering_style: slotForm.numbering_style,
      p_numbering_depth: slotForm.numbering_depth,
      p_clause_type: slotForm.clause_type,
      p_alternative_group_id: slotForm.alternative_group_id || null,
      p_condition_rule_json: slotForm.condition_rule_json,
      p_is_required: slotForm.is_required,
      p_allow_override: slotForm.allow_override,
      p_allow_suppress: slotForm.allow_suppress,
      p_allow_custom_after: slotForm.allow_custom_after,
      p_risk_level: slotForm.risk_level || null,
      p_metadata_json: slotForm.metadata_json,
    });
    if (error) {
      setErrorText(friendlyError(error, uiMessage("settings.documents.template.error.saveSlot")));
    } else {
      setSlotForm(null);
      await loadWorkspace(selectedVersion.id);
    }
    setSaving(false);
  };

  const transitionVersion = async (nextStatus: string) => {
    if (!selectedVersion || saving) return;
    if ((nextStatus === "published" || nextStatus === "retired") && !canApprove) return;
    if (nextStatus === "under_review" && readinessPending) return;
    if (nextStatus === "published" && readinessPending) return;
    const label = nextStatus === "under_review"
      ? t("settings.documents.template.submit")
      : nextStatus === "draft"
        ? t("settings.documents.template.return")
        : nextStatus === "published"
          ? t("settings.documents.template.publish")
          : t("settings.documents.template.retire");
    if (!window.confirm(t("settings.documents.clause.confirmAction", { action: label }))) return;

    setSaving(true);
    const { error } = await supabase.rpc("set_document_template_version_status", {
      p_template_version_id: selectedVersion.id,
      p_next_status: nextStatus,
      p_approval_note: null,
      p_approval_reference: null,
    });
    if (error) {
      setErrorText(friendlyError(error, uiMessage("settings.documents.template.error.transition")));
    } else {
      await loadWorkspace(selectedVersion.id);
    }
    setSaving(false);
  };

  const openNewSection = () => {
    setSectionForm(emptySectionForm(Math.max(0, ...sections.map((section) => section.sort_order)) + 1));
    setSlotForm(null);
    queueEditorScroll(() => sectionEditorRef.current);
  };

  const openNewSlot = (section: SectionRow) => {
    const sectionSlots = slots.filter((slot) => slot.template_section_id === section.id);
    setSlotForm(emptySlotForm(section.id, Math.max(0, ...sectionSlots.map((slot) => slot.sort_order)) + 1));
    setSectionForm(null);
    queueEditorScroll(() => slotEditorRef.current);
  };

  const openSectionEditor = (section: SectionRow) => {
    setSectionForm(toSectionForm(section));
    setSlotForm(null);
    queueEditorScroll(() => sectionEditorRef.current);
  };

  const openSlotEditor = (slot: SlotRow) => {
    setSlotForm(toSlotForm(slot));
    setSectionForm(null);
    queueEditorScroll(() => slotEditorRef.current);
  };

  const toggleFamilyEditor = () => {
    if (editingFamily) {
      setEditingFamily(false);
      return;
    }
    setEditingFamily(true);
    queueEditorScroll(() => familyEditorRef.current);
  };

  const toggleVersionEditor = () => {
    if (editingVersion) {
      setEditingVersion(false);
      return;
    }
    setEditingVersion(true);
    queueEditorScroll(() => versionEditorRef.current);
  };

  return (
    <DocumentPlatformPage title={t("settings.documents.title")} subtitle={t("settings.documents.template.workspace")}>
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <div className={styles.toolbar}>
            <Link href="/settings/document-templates" className={styles.linkButton}>{t("settings.documents.template.back")}</Link>
            <button type="button" className={styles.button} onClick={() => void loadWorkspace(selectedVersionId)} disabled={loading}>{t("settings.documents.actions.refresh")}</button>
          </div>

          {errorText ? <div className={styles.error}>{text(errorText)}</div> : null}
          {loading ? <div className={styles.emptyState}>{t("settings.documents.template.loading")}</div> : null}
          {!loading && !template ? <div className={styles.emptyState}>{t("settings.documents.template.notFound")}</div> : null}

          {!loading && template ? (
            <>
              <header className={styles.pageHeader}>
                <div>
                  <h1 className={styles.pageTitle}>{template.name}</h1>
                  <p className={styles.pageDescription}>{template.template_code} · {documentTypeLabel(template.document_type, locale)}</p>
                </div>
                <div className={styles.actionRow}>
                  <StatusBadge status={selectedVersion?.status || template.status} />
                  <StatusBadge status={readinessPending ? "inactive" : template.status} />
                  {selectedVersion && ["draft", "under_review"].includes(selectedVersion.status) ? (
                    <Link
                      href={`/settings/document-templates/${template.id}/preview?version=${selectedVersion.id}`}
                      className={styles.buttonPrimary}
                    >
                      {t("settings.documents.template.preview")}
                    </Link>
                  ) : null}
                </div>
              </header>

              <div className={styles.summaryGrid}>
                <Summary label={t("settings.documents.fields.type")} value={documentTypeLabel(template.document_type, locale)} />
                <Summary label={t("settings.documents.fields.language")} value={languageLabel(selectedVersion?.language_code || template.language_code, locale)} />
                <Summary label={t("settings.documents.template.version")} value={selectedVersion ? String(selectedVersion.version_no) : "-"} />
                <Summary label={t("settings.documents.template.renderer")} value={selectedVersion ? t("settings.documents.count.version", { number: selectedVersion.renderer_schema_version }) : "-"} />
                <Summary label={t("settings.documents.template.sections")} value={t("settings.documents.count.sections", { count: sections.length })} />
                <Summary label={t("settings.documents.clause.clause")} value={t("settings.documents.count.clauses", { count: slots.length })} />
                <Summary label={t("settings.documents.template.lastReviewed")} value={formatDateTime(selectedVersion?.reviewed_at || selectedVersion?.updated_at || template.updated_at, locale)} />
                <Summary label={t("settings.documents.template.lastPublished")} value={formatDateTime(selectedVersion?.published_at, locale)} />
              </div>

              {activeFamilyReadinessInconsistent ? (
                <div className={styles.notice}>
                  {t("settings.documents.template.certification.inconsistentReview")}
                </div>
              ) : null}

              {!activeFamilyReadinessInconsistent && isDraft && !versionReadinessApproved ? (
                <div className={styles.notice}>
                  {t("settings.documents.template.certification.pending")}
                </div>
              ) : null}

              {isDraft && !readinessPending ? (
                <div className={styles.notice}>
                  {t("settings.documents.template.certification.ready")}
                </div>
              ) : null}

              {versions.length > 0 ? (
                <div className={styles.versionTabs} aria-label={t("settings.documents.template.versions")}>
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      className={version.id === selectedVersionId ? styles.versionTabActive : styles.versionTab}
                      onClick={() => void loadWorkspace(version.id)}
                    >
                      {t("settings.documents.count.version", { number: version.version_no })} · {languageLabel(version.language_code, locale)} · {version.status === "under_review" ? t("settings.documents.status.under_review") : version.status === "published" ? t("settings.documents.clause.publishAction") : version.status === "retired" ? t("settings.documents.status.retired") : t("settings.documents.status.draft")}
                    </button>
                  ))}
                </div>
              ) : null}

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>{t("settings.documents.template.details")}</h2>
                    <div className={styles.helperText}>{t("settings.documents.template.detailsHelp")}</div>
                  </div>
                  {isDraft ? (
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.button} onClick={toggleFamilyEditor}>{t("settings.documents.template.rename")}</button>
                      <button type="button" className={styles.button} onClick={toggleVersionEditor}>{t("settings.documents.template.editDates")}</button>
                    </div>
                  ) : null}
                </div>

                {editingFamily ? (
                  <div ref={familyEditorRef} className={`${styles.formPanel} ${styles.editorScrollTarget}`}>
                    <label className={styles.fieldWide}>{t("settings.documents.template.name")}
                      <input className={styles.input} value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
                    </label>
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.buttonPrimary} onClick={() => void saveFamily()} disabled={saving || !familyName.trim()}>{t("settings.documents.template.saveName")}</button>
                      <button type="button" className={styles.button} onClick={() => setEditingFamily(false)}>{t("settings.documents.actions.cancel")}</button>
                    </div>
                  </div>
                ) : null}

                {editingVersion ? (
                  <div ref={versionEditorRef} className={`${styles.formPanel} ${styles.editorScrollTarget}`}>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>{t("settings.documents.template.startDate")}
                        <input type="date" className={styles.input} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
                      </label>
                      <label className={styles.field}>{t("settings.documents.template.endDate")}
                        <input type="date" className={styles.input} value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} />
                      </label>
                    </div>
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.buttonPrimary} onClick={() => void saveVersion()} disabled={saving}>{t("settings.documents.template.saveVersion")}</button>
                      <button type="button" className={styles.button} onClick={() => setEditingVersion(false)}>{t("settings.documents.actions.cancel")}</button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>{t("settings.documents.template.sections")}</h2>
                    <div className={styles.helperText}>{t("settings.documents.template.sectionOrder")}</div>
                  </div>
                  {isDraft ? <button type="button" className={styles.buttonPrimary} onClick={openNewSection}>{t("settings.documents.template.addSection")}</button> : null}
                </div>

                {sectionForm ? (
                  <div ref={sectionEditorRef} className={styles.editorScrollTarget}>
                    <SectionEditor form={sectionForm} setForm={setSectionForm} sections={sections} saving={saving} onSave={saveSection} />
                  </div>
                ) : null}
                {slotForm ? (
                  <div ref={slotEditorRef} className={styles.editorScrollTarget}>
                    <SlotEditor
                      key={slotForm.id || `new-${slotForm.template_section_id}`}
                      form={slotForm}
                      setForm={setSlotForm}
                      clauseVersions={clauseVersions}
                      clauseFamilies={clauseFamilies}
                      sections={sections}
                      slots={slots}
                      templateCode={template.template_code}
                      saving={saving}
                      onSave={saveSlot}
                    />
                  </div>
                ) : null}

                {sections.length === 0 ? <div className={styles.emptyState}>{t("settings.documents.template.noSections")}</div> : (
                  <div className={styles.sectionList}>
                    {sections.map((section) => {
                      const sectionSlots = slots.filter((slot) => slot.template_section_id === section.id);
                      return (
                        <article key={section.id} className={styles.sectionBlock}>
                          <div className={styles.sectionBlockHeader}>
                            <div className={styles.sectionNumber}>{section.display_label || section.display_number || section.sort_order}</div>
                            <div>
                              <div className={styles.primaryText}>{section.title}</div>
                              <div className={styles.codeText}>{section.section_code}</div>
                              <div className={styles.badgeRow}>
                                <span className={styles.badge}>{section.is_required ? t("settings.documents.template.mandatory") : t("settings.documents.template.optional")}</span>
                                <span className={styles.badge}>{sectionKindLabel(section.section_kind, locale)}</span>
                                <RiskBadge risk={section.risk_level} />
                                <span className={styles.badge}>{slotCountBySection.get(section.id) || 0} {t("settings.documents.clause.clause")}</span>
                              </div>
                            </div>
                            {isDraft ? (
                              <div className={styles.actionRow}>
                                <button type="button" className={styles.button} onClick={() => openSectionEditor(section)}>{t("settings.documents.template.editSection")}</button>
                                <button type="button" className={styles.button} onClick={() => openNewSlot(section)}>{t("settings.documents.template.addClause")}</button>
                              </div>
                            ) : null}
                          </div>
                          <div className={styles.sectionBody}>
                            {sectionSlots.length === 0 ? (
                              <div className={styles.emptyState}>{emptySectionClauseMessage(section.section_kind, locale)}</div>
                            ) : (
                              <div className={styles.slotList}>
                                {sectionSlots.map((slot) => {
                                  const clause = clauseVersions.find((item) => item.id === slot.clause_version_id);
                                  const family = clauseFamilies.find((item) => item.id === clause?.clause_id);
                                  return (
                                    <div key={slot.id} className={styles.slotRow}>
                                      <div>
                                        <div className={styles.primaryText}>{slot.display_label || slot.display_number || slot.slot_code}</div>
                                        <div>{clause?.title || t("settings.documents.template.noClause")}</div>
                                        <div className={styles.muted}>
                                          {family?.clause_code || slot.slot_code}
                                          {clause ? ` · ${t("settings.documents.count.version", { number: clause.version_no })} · ${languageLabel(clause.language_code, locale)}` : ""}
                                        </div>
                                        <div className={styles.badgeRow}>
                                          <span className={styles.badge}>{slot.is_required ? t("settings.documents.template.mandatory") : t("settings.documents.template.optional")}</span>
                                          <span className={styles.badge}>{clauseTypeLabel(slot.clause_type, locale)}</span>
                                          <RiskBadge risk={slot.risk_level} />
                                          {slot.allow_override ? <span className={styles.badge}>{t("settings.documents.template.override")}</span> : null}
                                          {slot.allow_suppress ? <span className={styles.badge}>{t("settings.documents.template.suppress")}</span> : null}
                                          {slot.allow_custom_after ? <span className={styles.badge}>{t("settings.documents.template.customAfter")}</span> : null}
                                        </div>
                                      </div>
                                      {isDraft ? <button type="button" className={styles.button} onClick={() => openSlotEditor(slot)}>{t("settings.documents.template.editClause")}</button> : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>{t("settings.documents.template.versionStatus")}</h2>
                    <div className={styles.helperText}>{t("settings.documents.template.approvalAuthority")}</div>
                  </div>
                  <div className={styles.actionRow}>
                    {selectedVersion?.status === "draft" && readinessPending && !activeFamilyReadinessInconsistent && canApprove ? (
                      <button type="button" className={styles.buttonPrimary} onClick={() => void certifyTemplateReadiness()} disabled={saving}>
                        {t("settings.documents.template.certify")}
                      </button>
                    ) : null}
                    {selectedVersion?.status === "draft" ? (
                      <button
                        type="button"
                        className={styles.buttonPrimary}
                        onClick={() => void transitionVersion("under_review")}
                        disabled={saving || readinessPending}
                        title={readinessPending ? t("settings.documents.template.certifyFirst") : undefined}
                      >
                        {t("settings.documents.status.under_review")}
                      </button>
                    ) : null}
                    {selectedVersion?.status === "under_review" ? <button type="button" className={styles.button} onClick={() => void transitionVersion("draft")} disabled={saving}>{t("settings.documents.clause.returnDraft")}</button> : null}
                    {selectedVersion?.status === "under_review" && canApprove ? <button type="button" className={styles.buttonPrimary} onClick={() => void transitionVersion("published")} disabled={saving || readinessPending}>{t("settings.documents.clause.publishAction")}</button> : null}
                    {selectedVersion?.status === "published" && isLatestLanguageVersion ? <button type="button" className={styles.buttonPrimary} onClick={() => void clonePublishedVersion()} disabled={saving}>{t("settings.documents.clause.createVersion")}</button> : null}
                    {selectedVersion?.status === "published" && canApprove ? <button type="button" className={styles.buttonDanger} onClick={() => void transitionVersion("retired")} disabled={saving}>{t("settings.documents.status.retired")}</button> : null}
                  </div>
                </div>
                {selectedVersion && selectedVersion.status !== "draft" ? <div className={styles.notice}>{t("settings.documents.template.readOnly")}</div> : null}
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </DocumentPlatformPage>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className={styles.summaryItem}><div className={styles.summaryLabel}>{label}</div><div className={styles.summaryValue}>{value}</div></div>;
}

function SectionEditor({ form, setForm, sections, saving, onSave }: { form: SectionForm; setForm: (form: SectionForm | null) => void; sections: SectionRow[]; saving: boolean; onSave: () => Promise<void> }) {
  const { t, locale } = useI18n();
  return (
    <div className={styles.formPanel}>
      <div className={styles.sectionHeader}><h3 className={styles.sectionTitle}>{form.id ? t("settings.documents.template.editSectionTitle") : t("settings.documents.template.addSection")}</h3><button type="button" className={styles.button} onClick={() => setForm(null)}>{t("settings.documents.actions.close")}</button></div>
      <div className={styles.formGrid}>
        <label className={styles.field}>{t("settings.documents.template.sectionCode")}<input className={styles.input} value={form.section_code} onChange={(event) => setForm({ ...form, section_code: event.target.value.toUpperCase() })} /></label>
        <label className={styles.fieldWide}>{t("settings.documents.template.sectionName")}<input className={styles.input} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className={styles.field}>{t("settings.documents.template.order")}<input type="number" min="1" className={styles.input} value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value || 0) })} /></label>
        <label className={styles.field}>{t("settings.documents.template.parent")}<select className={styles.select} value={form.parent_section_id} onChange={(event) => setForm({ ...form, parent_section_id: event.target.value })}><option value="">{t("settings.documents.template.none")}</option>{sections.filter((section) => section.id !== form.id).map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
        <label className={styles.field}>{t("settings.documents.template.displayNumber")}<input className={styles.input} value={form.display_number} onChange={(event) => setForm({ ...form, display_number: event.target.value })} /></label>
        <label className={styles.field}>{t("settings.documents.template.displayLabel")}<input className={styles.input} value={form.display_label} onChange={(event) => setForm({ ...form, display_label: event.target.value })} /></label>
        <label className={styles.field}>{t("settings.documents.template.numberStyle")}<select className={styles.select} value={form.numbering_style} onChange={(event) => setForm({ ...form, numbering_style: event.target.value })}>{numberingStyles.map((value) => <option key={value} value={value}>{numberingStyleLabel(value, locale)}</option>)}</select></label>
        <label className={styles.field}>{t("settings.documents.template.numberDepth")}<input type="number" min="0" max="8" className={styles.input} value={form.numbering_depth} onChange={(event) => setForm({ ...form, numbering_depth: Number(event.target.value || 0) })} /></label>
        <label className={styles.field}>{t("settings.documents.template.sectionKind")}<select className={styles.select} value={form.section_kind} onChange={(event) => setForm({ ...form, section_kind: event.target.value })}>{sectionKinds.map((value) => <option key={value} value={value}>{sectionKindLabel(value, locale)}</option>)}</select></label>
        <label className={styles.field}>{t("settings.documents.template.importance")}<select className={styles.select} value={form.risk_level} onChange={(event) => setForm({ ...form, risk_level: event.target.value })}>{riskLevels.map((value) => <option key={value || "none"} value={value}>{value ? riskLabel(value, locale) : t("settings.documents.template.unspecified")}</option>)}</select></label>
      </div>
      <div className={styles.checkRow}>
        <label><input type="checkbox" checked={form.is_required} onChange={(event) => setForm({ ...form, is_required: event.target.checked })} /> {t("settings.documents.template.required")}</label>
        <label><input type="checkbox" checked={form.allow_custom_after} onChange={(event) => setForm({ ...form, allow_custom_after: event.target.checked })} /> {t("settings.documents.template.allowAfter")}</label>
      </div>
      <div className={styles.actionRow}><button type="button" className={styles.buttonPrimary} onClick={() => void onSave()} disabled={saving || !form.section_code.trim() || !form.title.trim() || form.sort_order < 1}>{t("settings.documents.template.saveSection")}</button></div>
    </div>
  );
}

function SlotEditor({ form, setForm, clauseVersions, clauseFamilies, sections, slots, templateCode, saving, onSave }: { form: SlotForm; setForm: (form: SlotForm | null) => void; clauseVersions: ClauseVersionRow[]; clauseFamilies: ClauseFamilyRow[]; sections: SectionRow[]; slots: SlotRow[]; templateCode: string; saving: boolean; onSave: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [slotCodeEdited, setSlotCodeEdited] = useState(Boolean(form.id));
  const [riskEdited, setRiskEdited] = useState(Boolean(form.id));
  const familyById = useMemo(() => new Map(clauseFamilies.map((family) => [family.id, family])), [clauseFamilies]);
  const currentSection = sections.find((section) => section.id === form.template_section_id) || null;

  const clauseOptions = useMemo(() => {
    const currentSectionCode = sections.find((section) => section.id === form.template_section_id)?.section_code;
    const currentClauseCode = vpLegalServicesClauseSequence.find((item) => item.sectionCode === currentSectionCode)?.clauseCode;
    const logicalOrderByCode = new Map<string, number>(vpLegalServicesClauseSequence.map((item, index) => [item.clauseCode, index]));

    const options = clauseVersions
      .filter((clause) => clause.status === "published" || clause.id === form.clause_version_id)
      .map((clause, originalIndex) => ({
        clause,
        clauseCode: familyById.get(clause.clause_id)?.clause_code || "",
        originalIndex,
      }));

    if (templateCode !== "VP-FA-LEGAL-SERVICES") return options;

    return options.sort((left, right) => {
      const leftCurrent = left.clauseCode === currentClauseCode;
      const rightCurrent = right.clauseCode === currentClauseCode;
      if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;

      const leftOrder = logicalOrderByCode.get(left.clauseCode);
      const rightOrder = logicalOrderByCode.get(right.clauseCode);
      if (leftOrder !== rightOrder) {
        if (leftOrder === undefined) return 1;
        if (rightOrder === undefined) return -1;
        return leftOrder - rightOrder;
      }

      const codeOrder = left.clauseCode.localeCompare(right.clauseCode, "th");
      if (codeOrder !== 0) return codeOrder;
      const titleOrder = left.clause.title.localeCompare(right.clause.title, "th");
      if (titleOrder !== 0) return titleOrder;
      if (left.clause.version_no !== right.clause.version_no) return right.clause.version_no - left.clause.version_no;
      return left.originalIndex - right.originalIndex;
    });
  }, [clauseVersions, familyById, form.clause_version_id, form.template_section_id, sections, templateCode]);

  const selectedClauseOption = clauseOptions.find(({ clause }) => clause.id === form.clause_version_id) || null;
  const selectedLogicalEntry = templateCode === "VP-FA-LEGAL-SERVICES" && selectedClauseOption
    ? vpLegalServicesClauseSequence.find((item) => item.clauseCode === selectedClauseOption.clauseCode) || null
    : null;
  const expectedSection = selectedLogicalEntry
    ? sections.find((section) => section.section_code === selectedLogicalEntry.sectionCode) || null
    : null;
  const sectionMismatch = Boolean(expectedSection && currentSection && expectedSection.id !== currentSection.id);
  const slotCodeConflict = Boolean(form.slot_code.trim()) && slots.some((slot) => (
    slot.id !== form.id
    && slot.template_section_id === form.template_section_id
    && slot.slot_code.trim().toUpperCase() === form.slot_code.trim().toUpperCase()
  ));

  const optionLabel = (clauseCode: string, clause: ClauseVersionRow) => {
    if (templateCode !== "VP-FA-LEGAL-SERVICES") {
      return `${clauseCode || t("settings.documents.clause.clause")} · ${clause.title} · ${t("settings.documents.count.version", { number: clause.version_no })}${clause.status !== "published" ? ` (${statusLabel(clause.status, locale)})` : ""}`;
    }
    const logicalEntry = vpLegalServicesClauseSequence.find((item) => item.clauseCode === clauseCode);
    const logicalSection = logicalEntry
      ? sections.find((section) => section.section_code === logicalEntry.sectionCode)
      : null;
    const sectionLabel = logicalEntry
      ? logicalSection?.display_label || logicalSection?.display_number || t("settings.documents.template.sectionNumber", { number: logicalEntry.sectionNumber })
      : "";
    const prefix = sectionLabel ? `${sectionLabel} · ` : "";
    return `${prefix}${clauseCode || t("settings.documents.clause.clause")} · ${clause.title} · ${t("settings.documents.count.version", { number: clause.version_no })}${clause.status !== "published" ? ` (${statusLabel(clause.status, locale)})` : ""}`;
  };

  const handleClauseChange = (clauseVersionId: string) => {
    const selectedClause = clauseVersions.find((clause) => clause.id === clauseVersionId) || null;
    const selectedClauseCode = selectedClause ? familyById.get(selectedClause.clause_id)?.clause_code || "" : "";
    const selectedClauseRisk = selectedClause ? clauseRiskLevel(selectedClause) : "";
    const proposedSlotCode = selectedClause
      ? deriveSlotCode(selectedClauseCode, selectedClause.language_code)
      : "";
    const nextSlotCode = !form.id && !slotCodeEdited ? proposedSlotCode : form.slot_code;
    const nextCodeConflicts = Boolean(nextSlotCode.trim()) && slots.some((slot) => (
      slot.id !== form.id
      && slot.template_section_id === form.template_section_id
      && slot.slot_code.trim().toUpperCase() === nextSlotCode.trim().toUpperCase()
    ));
    if (nextCodeConflicts) setAdvancedOpen(true);
    setForm({
      ...form,
      clause_version_id: clauseVersionId,
      slot_code: nextSlotCode,
      risk_level: !form.id && !riskEdited && selectedClauseRisk ? selectedClauseRisk : form.risk_level,
    });
  };

  const currentSectionLabel = currentSection
    ? `${currentSection.display_label || currentSection.display_number || t("settings.documents.template.orderNumber", { number: currentSection.sort_order })} ${currentSection.title}`
    : t("settings.documents.template.sectionMissing");
  const expectedSectionLabel = expectedSection
    ? `${expectedSection.display_label || expectedSection.display_number || t("settings.documents.template.orderNumber", { number: expectedSection.sort_order })} ${expectedSection.title}`
    : "";

  return (
    <div className={styles.formPanel}>
      <div className={styles.sectionHeader}><h3 className={styles.sectionTitle}>{form.id ? t("settings.documents.template.editSlot") : t("settings.documents.template.addSlot")}</h3><button type="button" className={styles.button} onClick={() => setForm(null)}>{t("settings.documents.actions.close")}</button></div>
      <div className={styles.targetContext}>{form.id ? t("settings.documents.template.editingIn") : t("settings.documents.template.addingIn")} <strong>{currentSectionLabel}</strong></div>
      <div className={styles.formGrid}>
        <label className={styles.fieldWide}>{t("settings.documents.template.libraryClause")}<select className={styles.select} value={form.clause_version_id} onChange={(event) => handleClauseChange(event.target.value)}><option value="">{t("settings.documents.template.clauseUnselected")}</option>{clauseOptions.map(({ clause, clauseCode }) => <option key={clause.id} value={clause.id}>{optionLabel(clauseCode, clause)}</option>)}</select></label>
        <label className={styles.field}>{t("settings.documents.template.clauseType")}<select className={styles.select} value={form.clause_type} onChange={(event) => setForm({ ...form, clause_type: event.target.value })}>{clauseTypes.map((value) => <option key={value} value={value}>{clauseTypeLabel(value, locale)}</option>)}</select></label>
        <label className={styles.field}>{t("settings.documents.template.importance")}<select className={styles.select} value={form.risk_level} onChange={(event) => { setRiskEdited(true); setForm({ ...form, risk_level: event.target.value }); }}>{riskLevels.map((value) => <option key={value || "none"} value={value}>{value ? riskLabel(value, locale) : t("settings.documents.template.unspecified")}</option>)}</select></label>
      </div>
      {sectionMismatch ? <div className={styles.formWarning}>{t("settings.documents.template.usualSection")} <strong>{expectedSectionLabel}</strong> {t("settings.documents.template.crossSection")}</div> : null}
      <div className={styles.checkRow}>
        <label><input type="checkbox" checked={form.is_required} onChange={(event) => setForm({ ...form, is_required: event.target.checked, allow_suppress: event.target.checked ? false : form.allow_suppress })} /> {t("settings.documents.template.required")}</label>
      </div>
      <details className={styles.advancedPanel} open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
        <summary className={styles.advancedSummary}>{t("settings.documents.template.advanced")}</summary>
        <div className={styles.advancedBody}>
          <div className={styles.formGrid}>
            <label className={styles.field}>{t("settings.documents.template.slotCode")}<input className={styles.input} value={form.slot_code} onChange={(event) => { setSlotCodeEdited(true); setForm({ ...form, slot_code: event.target.value.toUpperCase() }); }} /><span className={styles.helperText}>{t("settings.documents.template.slotCodeHelp")}</span></label>
            <label className={styles.field}>{t("settings.documents.template.order")}<input type="number" min="1" className={styles.input} value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value || 0) })} /><span className={styles.helperText}>{t("settings.documents.template.orderHelp")}</span></label>
            <label className={styles.field}>{t("settings.documents.template.displayNumber")}<input className={styles.input} value={form.display_number} onChange={(event) => setForm({ ...form, display_number: event.target.value })} /></label>
            <label className={styles.field}>{t("settings.documents.template.displayLabel")}<input className={styles.input} value={form.display_label} onChange={(event) => setForm({ ...form, display_label: event.target.value })} /><span className={styles.helperText}>{t("settings.documents.template.labelHelp")}</span></label>
            <label className={styles.field}>{t("settings.documents.template.numberStyle")}<select className={styles.select} value={form.numbering_style} onChange={(event) => setForm({ ...form, numbering_style: event.target.value })}>{numberingStyles.map((value) => <option key={value} value={value}>{numberingStyleLabel(value, locale)}</option>)}</select>{form.numbering_style === "none" ? <span className={styles.helperText}>{t("settings.documents.template.noNumberHelp")}</span> : null}</label>
            <label className={styles.field}>{t("settings.documents.template.numberDepth")}<input type="number" min="0" max="8" className={styles.input} value={form.numbering_depth} onChange={(event) => setForm({ ...form, numbering_depth: Number(event.target.value || 0) })} /><span className={styles.helperText}>{t("settings.documents.template.depthHelp")}</span>{form.numbering_style === "none" ? <span className={styles.helperText}>{t("settings.documents.template.noDepthHelp")}</span> : null}</label>
          </div>
          <div className={styles.checkRow}>
            <label><input type="checkbox" checked={form.allow_override} onChange={(event) => setForm({ ...form, allow_override: event.target.checked })} /> {t("settings.documents.template.override")}</label>
            <label><input type="checkbox" checked={form.allow_suppress} disabled={form.is_required} onChange={(event) => setForm({ ...form, allow_suppress: event.target.checked })} /> {t("settings.documents.template.suppress")}</label>
            <label><input type="checkbox" checked={form.allow_custom_after} onChange={(event) => setForm({ ...form, allow_custom_after: event.target.checked })} /> {t("settings.documents.template.customAfter")}</label>
          </div>
        </div>
      </details>
      {slotCodeConflict ? <div className={styles.formWarning}>{t("settings.documents.template.slotCode")} <strong>{form.slot_code}</strong> {t("settings.documents.template.duplicateSlot")}</div> : null}
      <div className={styles.actionRow}><button type="button" className={styles.buttonPrimary} onClick={() => void onSave()} disabled={saving || !form.slot_code.trim() || form.sort_order < 1 || slotCodeConflict}>{t("settings.documents.template.saveSlot")}</button></div>
    </div>
  );
}

function emptySectionForm(sortOrder: number): SectionForm {
  return { id: "", section_code: "", title: "", sort_order: sortOrder, parent_section_id: "", display_number: "", display_label: "", numbering_style: "explicit", numbering_depth: 1, section_kind: "normal", is_required: true, allow_custom_after: false, risk_level: "", condition_rule_json: null, metadata_json: {} };
}

function emptySectionClauseMessage(sectionKind: string, locale: UiLocale = "th") {
  const t = (key: string) => translate(locale, key);
  if (sectionKind === "preamble") {
    return t("settings.documents.template.emptyPreamble");
  }
  if (sectionKind === "execution") {
    return t("settings.documents.template.emptyExecution");
  }
  return t("settings.documents.template.emptyNormal");
}

function toSectionForm(section: SectionRow): SectionForm {
  return { id: section.id, section_code: section.section_code, title: section.title, sort_order: section.sort_order, parent_section_id: section.parent_section_id || "", display_number: section.display_number || "", display_label: section.display_label || "", numbering_style: section.numbering_style, numbering_depth: section.numbering_depth, section_kind: section.section_kind, is_required: section.is_required, allow_custom_after: section.allow_custom_after, risk_level: section.risk_level || "", condition_rule_json: section.condition_rule_json, metadata_json: section.metadata_json || {} };
}

function emptySlotForm(sectionId: string, sortOrder: number): SlotForm {
  return { id: "", template_section_id: sectionId, slot_code: "", clause_version_id: "", sort_order: sortOrder, parent_slot_id: "", display_number: "", display_label: "", numbering_style: "none", numbering_depth: 1, clause_type: "mandatory", alternative_group_id: "", is_required: true, allow_override: false, allow_suppress: false, allow_custom_after: false, risk_level: "", condition_rule_json: null, metadata_json: {} };
}

function toSlotForm(slot: SlotRow): SlotForm {
  return { id: slot.id, template_section_id: slot.template_section_id, slot_code: slot.slot_code, clause_version_id: slot.clause_version_id || "", sort_order: slot.sort_order, parent_slot_id: slot.parent_slot_id || "", display_number: slot.display_number || "", display_label: slot.display_label || "", numbering_style: slot.numbering_style, numbering_depth: slot.numbering_depth, clause_type: slot.clause_type, alternative_group_id: slot.alternative_group_id || "", is_required: slot.is_required, allow_override: slot.allow_override, allow_suppress: slot.allow_suppress, allow_custom_after: slot.allow_custom_after, risk_level: slot.risk_level || "", condition_rule_json: slot.condition_rule_json, metadata_json: slot.metadata_json || {} };
}

function sectionKindLabel(value: string, locale: UiLocale = "th") {
  const t = (key: string) => translate(locale, key);
  if (value === "preamble") return t("settings.documents.template.kind.preamble");
  if (value === "schedule") return t("settings.documents.template.kind.schedule");
  if (value === "appendix") return t("settings.documents.template.kind.appendix");
  if (value === "execution") return t("settings.documents.template.kind.execution");
  return t("settings.documents.template.kind.normal");
}

function clauseTypeLabel(value: string, locale: UiLocale = "th") {
  const t = (key: string) => translate(locale, key);
  if (value === "optional") return t("settings.documents.template.type.optional");
  if (value === "placeholder") return t("settings.documents.template.type.placeholder");
  if (value === "conditional") return t("settings.documents.template.type.conditional");
  if (value === "alternative") return t("settings.documents.template.type.alternative");
  return t("settings.documents.template.type.mandatory");
}

function numberingStyleLabel(value: string, locale: UiLocale = "th") {
  const t = (key: string) => translate(locale, key);
  if (value === "thai_clause") return t("settings.documents.template.number.thai_clause");
  if (value === "thai_appendix") return t("settings.documents.template.number.thai_appendix");
  if (value === "decimal") return t("settings.documents.template.number.decimal");
  if (value === "roman") return t("settings.documents.template.number.roman");
  if (value === "none") return t("settings.documents.template.number.none");
  return t("settings.documents.template.number.explicit");
}

function deriveSlotCode(clauseCode: string, languageCode: string) {
  const normalizedCode = clauseCode.trim().toUpperCase();
  const normalizedLanguage = languageCode.trim().toUpperCase();
  if (!normalizedCode || !["TH", "EN"].includes(normalizedLanguage)) return normalizedCode;
  const languageSuffix = `-${normalizedLanguage}`;
  return normalizedCode.endsWith(languageSuffix)
    ? normalizedCode.slice(0, -languageSuffix.length)
    : normalizedCode;
}

function clauseRiskLevel(clause: ClauseVersionRow) {
  const riskLevel = clause.metadata_json?.risk_level;
  return typeof riskLevel === "string" && riskLevels.includes(riskLevel)
    ? riskLevel
    : "";
}

function queueEditorScroll(getTarget: () => HTMLElement | null) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      getTarget()?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
