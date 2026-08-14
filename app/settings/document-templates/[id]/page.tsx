"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AccessState,
  DocumentPlatformPage,
  RiskBadge,
  StatusBadge,
  canApproveDocumentPlatform,
  documentTypeLabel,
  formatDateTime,
  friendlyError,
  languageLabel,
  riskLabel,
  useDocumentPlatformAccess,
} from "../../document-platform-shared";
import { supabase } from "../../../../lib/supabase";
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

export default function DocumentTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const templateId = typeof params.id === "string" ? params.id : "";
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
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
  const canApprove = canApproveDocumentPlatform(access.role);
  const inactiveShell = template?.metadata_json?.inactive_shell === true
    || template?.metadata_json?.legal_wording_approved !== true
    || selectedVersion?.definition_json?.inactive_shell === true
    || selectedVersion?.definition_json?.legal_wording_approved !== true;

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
      setErrorText(friendlyError(templateResult.error || versionsResult.error, "ไม่สามารถโหลดแม่แบบเอกสารนี้ได้"));
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
      setErrorText(friendlyError(sectionsResult.error, "ไม่สามารถโหลดส่วนของเอกสารได้"));
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
        setErrorText(friendlyError(slotsResult.error, "ไม่สามารถโหลดข้อสัญญาในแม่แบบได้"));
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
      setErrorText(friendlyError(publishedClausesResult.error, "ไม่สามารถโหลดคลังข้อสัญญาได้"));
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
      setErrorText(friendlyError(error, "บันทึกข้อมูลแม่แบบไม่สำเร็จ"));
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
      setErrorText(friendlyError(error, "บันทึกข้อมูลเวอร์ชันไม่สำเร็จ"));
    } else {
      setEditingVersion(false);
      await loadWorkspace(selectedVersion.id);
    }
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
      setErrorText(friendlyError(error, "บันทึกส่วนของเอกสารไม่สำเร็จ โปรดตรวจลำดับและข้อมูลอีกครั้ง"));
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
      setErrorText(friendlyError(error, "บันทึกตำแหน่งข้อสัญญาไม่สำเร็จ โปรดตรวจลำดับและข้อมูลอีกครั้ง"));
    } else {
      setSlotForm(null);
      await loadWorkspace(selectedVersion.id);
    }
    setSaving(false);
  };

  const transitionVersion = async (nextStatus: string) => {
    if (!selectedVersion || saving) return;
    if ((nextStatus === "published" || nextStatus === "retired") && !canApprove) return;
    if (nextStatus === "published" && inactiveShell) return;
    const label = nextStatus === "under_review"
      ? "ส่งแม่แบบเวอร์ชันนี้ให้ตรวจ"
      : nextStatus === "draft"
        ? "ส่งแม่แบบกลับเป็นร่าง"
        : nextStatus === "published"
          ? "เผยแพร่แม่แบบเวอร์ชันนี้"
          : "ยกเลิกการใช้งานแม่แบบเวอร์ชันนี้";
    if (!window.confirm(`${label} หรือไม่?`)) return;

    setSaving(true);
    const { error } = await supabase.rpc("set_document_template_version_status", {
      p_template_version_id: selectedVersion.id,
      p_next_status: nextStatus,
      p_approval_note: null,
      p_approval_reference: null,
    });
    if (error) {
      setErrorText(friendlyError(error, "เปลี่ยนสถานะแม่แบบไม่สำเร็จ"));
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
    <DocumentPlatformPage title="Settings" subtitle="Document Template Workspace">
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <div className={styles.toolbar}>
            <Link href="/settings/document-templates" className={styles.linkButton}>กลับรายการแม่แบบ</Link>
            <button type="button" className={styles.button} onClick={() => void loadWorkspace(selectedVersionId)} disabled={loading}>รีเฟรช</button>
          </div>

          {errorText ? <div className={styles.error}>{errorText}</div> : null}
          {loading ? <div className={styles.emptyState}>กำลังโหลดพื้นที่จัดการแม่แบบ...</div> : null}
          {!loading && !template ? <div className={styles.emptyState}>ไม่พบแม่แบบเอกสาร</div> : null}

          {!loading && template ? (
            <>
              <header className={styles.pageHeader}>
                <div>
                  <h1 className={styles.pageTitle}>{template.name}</h1>
                  <p className={styles.pageDescription}>{template.template_code} · {documentTypeLabel(template.document_type)}</p>
                </div>
                <div className={styles.actionRow}>
                  <StatusBadge status={selectedVersion?.status || template.status} />
                  <StatusBadge status={inactiveShell ? "inactive" : template.status} />
                  {selectedVersion && ["draft", "under_review"].includes(selectedVersion.status) ? (
                    <Link
                      href={`/settings/document-templates/${template.id}/preview?version=${selectedVersion.id}`}
                      className={styles.buttonPrimary}
                    >
                      ดูตัวอย่างแม่แบบ
                    </Link>
                  ) : null}
                </div>
              </header>

              <div className={styles.summaryGrid}>
                <Summary label="ประเภทเอกสาร" value={documentTypeLabel(template.document_type)} />
                <Summary label="ภาษา" value={languageLabel(selectedVersion?.language_code || template.language_code)} />
                <Summary label="เวอร์ชัน" value={selectedVersion ? String(selectedVersion.version_no) : "-"} />
                <Summary label="รูปแบบการแสดงผล" value={selectedVersion ? `รุ่น ${selectedVersion.renderer_schema_version}` : "-"} />
                <Summary label="ส่วนของเอกสาร" value={`${sections.length} ส่วน`} />
                <Summary label="ข้อสัญญา" value={`${slots.length} ข้อ`} />
                <Summary label="ตรวจล่าสุด" value={formatDateTime(selectedVersion?.reviewed_at || selectedVersion?.updated_at || template.updated_at)} />
                <Summary label="เผยแพร่ล่าสุด" value={formatDateTime(selectedVersion?.published_at)} />
              </div>

              {inactiveShell ? (
                <div className={styles.notice}>
                  แม่แบบนี้เป็นโครงสร้างเริ่มต้นที่ยังไม่มีถ้อยคำทางกฎหมายที่อนุมัติ จึงยังไม่เปิดให้เผยแพร่
                </div>
              ) : null}

              {versions.length > 0 ? (
                <div className={styles.versionTabs} aria-label="เวอร์ชันแม่แบบ">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      className={version.id === selectedVersionId ? styles.versionTabActive : styles.versionTab}
                      onClick={() => void loadWorkspace(version.id)}
                    >
                      รุ่น {version.version_no} · {languageLabel(version.language_code)} · {version.status === "under_review" ? "ส่งตรวจ" : version.status === "published" ? "เผยแพร่" : version.status === "retired" ? "ยกเลิกใช้" : "ร่าง"}
                    </button>
                  ))}
                </div>
              ) : null}

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>ข้อมูลแม่แบบและเวอร์ชัน</h2>
                    <div className={styles.helperText}>แก้ไขได้เฉพาะแม่แบบและเวอร์ชันที่ยังเป็นร่าง</div>
                  </div>
                  {isDraft ? (
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.button} onClick={toggleFamilyEditor}>แก้ชื่อแม่แบบ</button>
                      <button type="button" className={styles.button} onClick={toggleVersionEditor}>แก้ช่วงวันที่</button>
                    </div>
                  ) : null}
                </div>

                {editingFamily ? (
                  <div ref={familyEditorRef} className={`${styles.formPanel} ${styles.editorScrollTarget}`}>
                    <label className={styles.fieldWide}>ชื่อแม่แบบ
                      <input className={styles.input} value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
                    </label>
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.buttonPrimary} onClick={() => void saveFamily()} disabled={saving || !familyName.trim()}>บันทึกชื่อแม่แบบ</button>
                      <button type="button" className={styles.button} onClick={() => setEditingFamily(false)}>ยกเลิก</button>
                    </div>
                  </div>
                ) : null}

                {editingVersion ? (
                  <div ref={versionEditorRef} className={`${styles.formPanel} ${styles.editorScrollTarget}`}>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>เริ่มใช้วันที่
                        <input type="date" className={styles.input} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
                      </label>
                      <label className={styles.field}>สิ้นสุดวันที่
                        <input type="date" className={styles.input} value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} />
                      </label>
                    </div>
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.buttonPrimary} onClick={() => void saveVersion()} disabled={saving}>บันทึกข้อมูลเวอร์ชัน</button>
                      <button type="button" className={styles.button} onClick={() => setEditingVersion(false)}>ยกเลิก</button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>ส่วนของเอกสาร</h2>
                    <div className={styles.helperText}>เรียงตามลำดับที่บันทึกไว้ในแม่แบบ</div>
                  </div>
                  {isDraft ? <button type="button" className={styles.buttonPrimary} onClick={openNewSection}>เพิ่มส่วนของเอกสาร</button> : null}
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

                {sections.length === 0 ? <div className={styles.emptyState}>ยังไม่มีส่วนของเอกสารในเวอร์ชันนี้</div> : (
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
                                <span className={styles.badge}>{section.is_required ? "บังคับ" : "เลือกใช้"}</span>
                                <span className={styles.badge}>{sectionKindLabel(section.section_kind)}</span>
                                <RiskBadge risk={section.risk_level} />
                                <span className={styles.badge}>{slotCountBySection.get(section.id) || 0} ข้อสัญญา</span>
                              </div>
                            </div>
                            {isDraft ? (
                              <div className={styles.actionRow}>
                                <button type="button" className={styles.button} onClick={() => openSectionEditor(section)}>แก้ไขส่วน</button>
                                <button type="button" className={styles.button} onClick={() => openNewSlot(section)}>เพิ่มข้อสัญญา</button>
                              </div>
                            ) : null}
                          </div>
                          <div className={styles.sectionBody}>
                            {sectionSlots.length === 0 ? (
                              <div className={styles.emptyState}>ยังไม่มีข้อสัญญาในส่วนนี้</div>
                            ) : (
                              <div className={styles.slotList}>
                                {sectionSlots.map((slot) => {
                                  const clause = clauseVersions.find((item) => item.id === slot.clause_version_id);
                                  const family = clauseFamilies.find((item) => item.id === clause?.clause_id);
                                  return (
                                    <div key={slot.id} className={styles.slotRow}>
                                      <div>
                                        <div className={styles.primaryText}>{slot.display_label || slot.display_number || slot.slot_code}</div>
                                        <div>{clause?.title || "ยังไม่ได้เลือกข้อสัญญาจากคลัง"}</div>
                                        <div className={styles.muted}>
                                          {family?.clause_code || slot.slot_code}
                                          {clause ? ` · รุ่น ${clause.version_no} · ${languageLabel(clause.language_code)}` : ""}
                                        </div>
                                        <div className={styles.badgeRow}>
                                          <span className={styles.badge}>{slot.is_required ? "บังคับ" : "เลือกใช้"}</span>
                                          <span className={styles.badge}>{clauseTypeLabel(slot.clause_type)}</span>
                                          <RiskBadge risk={slot.risk_level} />
                                          {slot.allow_override ? <span className={styles.badge}>แก้เฉพาะเอกสารได้</span> : null}
                                          {slot.allow_suppress ? <span className={styles.badge}>ซ่อนได้</span> : null}
                                          {slot.allow_custom_after ? <span className={styles.badge}>เพิ่มข้อความต่อท้ายได้</span> : null}
                                        </div>
                                      </div>
                                      {isDraft ? <button type="button" className={styles.button} onClick={() => openSlotEditor(slot)}>แก้ไขข้อสัญญา</button> : null}
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
                    <h2 className={styles.sectionTitle}>สถานะเวอร์ชัน</h2>
                    <div className={styles.helperText}>การเผยแพร่และยกเลิกการใช้งานเป็นอำนาจของ Admin และ Partner</div>
                  </div>
                  <div className={styles.actionRow}>
                    {selectedVersion?.status === "draft" ? <button type="button" className={styles.buttonPrimary} onClick={() => void transitionVersion("under_review")} disabled={saving}>ส่งตรวจ</button> : null}
                    {selectedVersion?.status === "under_review" ? <button type="button" className={styles.button} onClick={() => void transitionVersion("draft")} disabled={saving}>ส่งกลับเป็นร่าง</button> : null}
                    {selectedVersion?.status === "under_review" && canApprove ? <button type="button" className={styles.buttonPrimary} onClick={() => void transitionVersion("published")} disabled={saving || inactiveShell}>เผยแพร่</button> : null}
                    {selectedVersion?.status === "published" && canApprove ? <button type="button" className={styles.buttonDanger} onClick={() => void transitionVersion("retired")} disabled={saving}>ยกเลิกการใช้งาน</button> : null}
                  </div>
                </div>
                {selectedVersion && selectedVersion.status !== "draft" ? <div className={styles.notice}>เวอร์ชันสถานะนี้เป็นแบบอ่านอย่างเดียว โครงสร้างและข้อสัญญาไม่สามารถแก้ไขได้</div> : null}
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
  return (
    <div className={styles.formPanel}>
      <div className={styles.sectionHeader}><h3 className={styles.sectionTitle}>{form.id ? "แก้ไขส่วนของเอกสาร" : "เพิ่มส่วนของเอกสาร"}</h3><button type="button" className={styles.button} onClick={() => setForm(null)}>ปิด</button></div>
      <div className={styles.formGrid}>
        <label className={styles.field}>รหัสส่วน<input className={styles.input} value={form.section_code} onChange={(event) => setForm({ ...form, section_code: event.target.value.toUpperCase() })} /></label>
        <label className={styles.fieldWide}>ชื่อส่วนภาษาไทย<input className={styles.input} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className={styles.field}>ลำดับ<input type="number" min="1" className={styles.input} value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value || 0) })} /></label>
        <label className={styles.field}>ส่วนหลัก<select className={styles.select} value={form.parent_section_id} onChange={(event) => setForm({ ...form, parent_section_id: event.target.value })}><option value="">ไม่มี</option>{sections.filter((section) => section.id !== form.id).map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
        <label className={styles.field}>เลขที่แสดง<input className={styles.input} value={form.display_number} onChange={(event) => setForm({ ...form, display_number: event.target.value })} /></label>
        <label className={styles.field}>ป้ายกำกับ<input className={styles.input} value={form.display_label} onChange={(event) => setForm({ ...form, display_label: event.target.value })} /></label>
        <label className={styles.field}>รูปแบบเลข<select className={styles.select} value={form.numbering_style} onChange={(event) => setForm({ ...form, numbering_style: event.target.value })}>{numberingStyles.map((value) => <option key={value} value={value}>{numberingStyleLabel(value)}</option>)}</select></label>
        <label className={styles.field}>ระดับเลข<input type="number" min="0" max="8" className={styles.input} value={form.numbering_depth} onChange={(event) => setForm({ ...form, numbering_depth: Number(event.target.value || 0) })} /></label>
        <label className={styles.field}>ประเภทส่วน<select className={styles.select} value={form.section_kind} onChange={(event) => setForm({ ...form, section_kind: event.target.value })}>{sectionKinds.map((value) => <option key={value} value={value}>{sectionKindLabel(value)}</option>)}</select></label>
        <label className={styles.field}>ระดับความสำคัญ<select className={styles.select} value={form.risk_level} onChange={(event) => setForm({ ...form, risk_level: event.target.value })}>{riskLevels.map((value) => <option key={value || "none"} value={value}>{value ? riskLabel(value) : "ไม่ระบุ"}</option>)}</select></label>
      </div>
      <div className={styles.checkRow}>
        <label><input type="checkbox" checked={form.is_required} onChange={(event) => setForm({ ...form, is_required: event.target.checked })} /> บังคับใช้</label>
        <label><input type="checkbox" checked={form.allow_custom_after} onChange={(event) => setForm({ ...form, allow_custom_after: event.target.checked })} /> อนุญาตข้อความเพิ่มเติมต่อท้าย</label>
      </div>
      <div className={styles.actionRow}><button type="button" className={styles.buttonPrimary} onClick={() => void onSave()} disabled={saving || !form.section_code.trim() || !form.title.trim() || form.sort_order < 1}>บันทึกส่วนของเอกสาร</button></div>
    </div>
  );
}

function SlotEditor({ form, setForm, clauseVersions, clauseFamilies, sections, slots, templateCode, saving, onSave }: { form: SlotForm; setForm: (form: SlotForm | null) => void; clauseVersions: ClauseVersionRow[]; clauseFamilies: ClauseFamilyRow[]; sections: SectionRow[]; slots: SlotRow[]; templateCode: string; saving: boolean; onSave: () => Promise<void> }) {
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
      return `${clauseCode || "ข้อสัญญา"} · ${clause.title} · รุ่น ${clause.version_no}${clause.status !== "published" ? ` (${clause.status})` : ""}`;
    }
    const logicalEntry = vpLegalServicesClauseSequence.find((item) => item.clauseCode === clauseCode);
    const logicalSection = logicalEntry
      ? sections.find((section) => section.section_code === logicalEntry.sectionCode)
      : null;
    const sectionLabel = logicalEntry
      ? logicalSection?.display_label || logicalSection?.display_number || `ข้อ ${logicalEntry.sectionNumber}`
      : "";
    const prefix = sectionLabel ? `${sectionLabel} · ` : "";
    return `${prefix}${clauseCode || "ข้อสัญญา"} · ${clause.title} · รุ่น ${clause.version_no}${clause.status !== "published" ? ` (${clause.status})` : ""}`;
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
    ? `${currentSection.display_label || currentSection.display_number || `ลำดับ ${currentSection.sort_order}`} ${currentSection.title}`
    : "ไม่พบข้อมูล Section";
  const expectedSectionLabel = expectedSection
    ? `${expectedSection.display_label || expectedSection.display_number || `ลำดับ ${expectedSection.sort_order}`} ${expectedSection.title}`
    : "";

  return (
    <div className={styles.formPanel}>
      <div className={styles.sectionHeader}><h3 className={styles.sectionTitle}>{form.id ? "แก้ไขตำแหน่งข้อสัญญา" : "เพิ่มตำแหน่งข้อสัญญา"}</h3><button type="button" className={styles.button} onClick={() => setForm(null)}>ปิด</button></div>
      <div className={styles.targetContext}>{form.id ? "กำลังแก้ไขข้อสัญญาใน:" : "กำลังเพิ่มข้อสัญญาใน:"} <strong>{currentSectionLabel}</strong></div>
      <div className={styles.formGrid}>
        <label className={styles.fieldWide}>ข้อสัญญาจากคลัง<select className={styles.select} value={form.clause_version_id} onChange={(event) => handleClauseChange(event.target.value)}><option value="">ยังไม่เลือกข้อสัญญา</option>{clauseOptions.map(({ clause, clauseCode }) => <option key={clause.id} value={clause.id}>{optionLabel(clauseCode, clause)}</option>)}</select></label>
        <label className={styles.field}>ประเภทข้อ<select className={styles.select} value={form.clause_type} onChange={(event) => setForm({ ...form, clause_type: event.target.value })}>{clauseTypes.map((value) => <option key={value} value={value}>{clauseTypeLabel(value)}</option>)}</select></label>
        <label className={styles.field}>ระดับความสำคัญ<select className={styles.select} value={form.risk_level} onChange={(event) => { setRiskEdited(true); setForm({ ...form, risk_level: event.target.value }); }}>{riskLevels.map((value) => <option key={value || "none"} value={value}>{value ? riskLabel(value) : "ไม่ระบุ"}</option>)}</select></label>
      </div>
      {sectionMismatch ? <div className={styles.formWarning}>ข้อสัญญานี้โดยปกติใช้กับ <strong>{expectedSectionLabel}</strong> แต่ยังสามารถเลือกใช้ข้าม Section ได้</div> : null}
      <div className={styles.checkRow}>
        <label><input type="checkbox" checked={form.is_required} onChange={(event) => setForm({ ...form, is_required: event.target.checked, allow_suppress: event.target.checked ? false : form.allow_suppress })} /> บังคับใช้</label>
      </div>
      <details className={styles.advancedPanel} open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
        <summary className={styles.advancedSummary}>ตัวเลือกขั้นสูง</summary>
        <div className={styles.advancedBody}>
          <div className={styles.formGrid}>
            <label className={styles.field}>รหัสตำแหน่ง<input className={styles.input} value={form.slot_code} onChange={(event) => { setSlotCodeEdited(true); setForm({ ...form, slot_code: event.target.value.toUpperCase() }); }} /><span className={styles.helperText}>รหัสภายในของตำแหน่งข้อสัญญา ระบบสร้างให้อัตโนมัติจากข้อสัญญาที่เลือก โดยทั่วไปไม่ต้องแก้</span></label>
            <label className={styles.field}>ลำดับ<input type="number" min="1" className={styles.input} value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value || 0) })} /><span className={styles.helperText}>ลำดับของข้อสัญญาภายในส่วนนี้ เช่น 1, 2, 3</span></label>
            <label className={styles.field}>เลขที่แสดง<input className={styles.input} value={form.display_number} onChange={(event) => setForm({ ...form, display_number: event.target.value })} /></label>
            <label className={styles.field}>ป้ายกำกับ<input className={styles.input} value={form.display_label} onChange={(event) => setForm({ ...form, display_label: event.target.value })} /><span className={styles.helperText}>ข้อความกำกับเฉพาะตำแหน่ง เช่น (ก), (ข) หรือชื่อย่อย หากไม่ต้องการให้เว้นว่าง</span></label>
            <label className={styles.field}>รูปแบบเลข<select className={styles.select} value={form.numbering_style} onChange={(event) => setForm({ ...form, numbering_style: event.target.value })}>{numberingStyles.map((value) => <option key={value} value={value}>{numberingStyleLabel(value)}</option>)}</select>{form.numbering_style === "none" ? <span className={styles.helperText}>ใช้เมื่อ Section เป็นผู้แสดงเลขข้ออยู่แล้ว เพื่อไม่ให้เลขซ้ำ</span> : null}</label>
            <label className={styles.field}>ระดับเลข<input type="number" min="0" max="8" className={styles.input} value={form.numbering_depth} onChange={(event) => setForm({ ...form, numbering_depth: Number(event.target.value || 0) })} /><span className={styles.helperText}>ระดับชั้นของเลขข้อ เช่น 1 → ข้อหลัก, 2 → ข้อย่อย, 3 → ข้อย่อยชั้นถัดไป</span>{form.numbering_style === "none" ? <span className={styles.helperText}>ระดับเลขนี้จะไม่แสดงในเอกสารฉบับสุดท้าย</span> : null}</label>
          </div>
          <div className={styles.checkRow}>
            <label><input type="checkbox" checked={form.allow_override} onChange={(event) => setForm({ ...form, allow_override: event.target.checked })} /> แก้เฉพาะเอกสารได้</label>
            <label><input type="checkbox" checked={form.allow_suppress} disabled={form.is_required} onChange={(event) => setForm({ ...form, allow_suppress: event.target.checked })} /> ซ่อนได้</label>
            <label><input type="checkbox" checked={form.allow_custom_after} onChange={(event) => setForm({ ...form, allow_custom_after: event.target.checked })} /> เพิ่มข้อความต่อท้ายได้</label>
          </div>
        </div>
      </details>
      {slotCodeConflict ? <div className={styles.formWarning}>รหัสตำแหน่ง <strong>{form.slot_code}</strong> มีอยู่แล้วใน Section นี้ กรุณากำหนดรหัสอื่นในตัวเลือกขั้นสูง</div> : null}
      <div className={styles.actionRow}><button type="button" className={styles.buttonPrimary} onClick={() => void onSave()} disabled={saving || !form.slot_code.trim() || form.sort_order < 1 || slotCodeConflict}>บันทึกตำแหน่งข้อสัญญา</button></div>
    </div>
  );
}

function emptySectionForm(sortOrder: number): SectionForm {
  return { id: "", section_code: "", title: "", sort_order: sortOrder, parent_section_id: "", display_number: "", display_label: "", numbering_style: "explicit", numbering_depth: 1, section_kind: "normal", is_required: true, allow_custom_after: false, risk_level: "", condition_rule_json: null, metadata_json: {} };
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

function sectionKindLabel(value: string) {
  if (value === "preamble") return "บทนำ";
  if (value === "schedule") return "ตารางแนบท้าย";
  if (value === "appendix") return "ภาคผนวก";
  if (value === "execution") return "การลงนาม";
  return "ส่วนทั่วไป";
}

function clauseTypeLabel(value: string) {
  if (value === "optional") return "ข้อเลือกใช้";
  if (value === "placeholder") return "ตำแหน่งรอข้อสัญญา";
  if (value === "conditional") return "ใช้ตามเงื่อนไข";
  if (value === "alternative") return "ข้อทางเลือก";
  return "ข้อบังคับ";
}

function numberingStyleLabel(value: string) {
  if (value === "thai_clause") return "ข้อภาษาไทย";
  if (value === "thai_appendix") return "ภาคผนวกภาษาไทย";
  if (value === "decimal") return "เลขทศนิยม";
  if (value === "roman") return "เลขโรมัน";
  if (value === "none") return "ไม่แสดงเลข";
  return "ระบุเอง";
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
