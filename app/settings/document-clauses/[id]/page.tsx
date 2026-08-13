"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AccessState,
  DocumentPlatformPage,
  RiskBadge,
  StatusBadge,
  formatDateTime,
  languageLabel,
  riskLabel,
  useDocumentPlatformAccess,
} from "../../document-platform-shared";
import { supabase } from "../../../../lib/supabase";
import styles from "../../document-platform.module.css";

type JsonObject = Record<string, unknown>;

type ClauseFamilyRow = {
  id: string;
  clause_code: string;
  category: string | null;
  jurisdiction: string | null;
  metadata_json: JsonObject | null;
  is_active: boolean;
  updated_at: string | null;
};

type ClauseVersionRow = {
  id: string;
  clause_id: string;
  version_no: number;
  language_code: string;
  title: string;
  content: string;
  metadata_json: JsonObject | null;
  effective_from: string | null;
  effective_to: string | null;
  status: string;
  reviewed_at: string | null;
  published_at: string | null;
  retired_at: string | null;
  approval_note: string | null;
  approval_reference: string | null;
  content_format: string;
  previous_version_id: string | null;
  supersedes_version_id: string | null;
  updated_at: string | null;
};

type VariableBindingRow = {
  id: string;
  variable_definition_id: string;
  is_required: boolean;
  fallback_override: string | null;
};

type VariableDefinitionRow = {
  id: string;
  variable_key: string;
  display_name_th: string;
  display_name_en: string;
  data_type: string;
  status: string;
};

type VersionForm = {
  languageCode: string;
  title: string;
  content: string;
  riskLevel: string;
  effectiveFrom: string;
  effectiveTo: string;
  changeSummary: string;
  internalNote: string;
};

const emptyVersionForm: VersionForm = {
  languageCode: "th",
  title: "",
  content: "",
  riskLevel: "informational",
  effectiveFrom: "",
  effectiveTo: "",
  changeSummary: "",
  internalNote: "",
};

const riskLevels = ["informational", "low", "medium", "high", "critical"];

export default function DocumentClauseDetailPage() {
  const params = useParams<{ id: string }>();
  const clauseId = typeof params.id === "string" ? params.id : "";
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [family, setFamily] = useState<ClauseFamilyRow | null>(null);
  const [versions, setVersions] = useState<ClauseVersionRow[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [familyCategory, setFamilyCategory] = useState("");
  const [familyJurisdiction, setFamilyJurisdiction] = useState("");
  const [editingFamily, setEditingFamily] = useState(false);
  const [versionForm, setVersionForm] = useState<VersionForm>(emptyVersionForm);
  const [bindings, setBindings] = useState<VariableBindingRow[]>([]);
  const [variableDefinitions, setVariableDefinitions] = useState<VariableDefinitionRow[]>([]);
  const [showPublishReview, setShowPublishReview] = useState(false);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalReference, setApprovalReference] = useState("");

  const selectedVersion = versions.find((version) => version.id === selectedVersionId) || null;
  const isDraft = !selectedVersion || selectedVersion.status === "draft";
  const isPartner = access.role === "partner";

  const setEditorFromVersion = useCallback((version: ClauseVersionRow | null) => {
    if (!version) {
      setVersionForm(emptyVersionForm);
      return;
    }
    setVersionForm({
      languageCode: version.language_code,
      title: version.title,
      content: version.content,
      riskLevel: metadataText(version.metadata_json, "risk_level") || "informational",
      effectiveFrom: version.effective_from || "",
      effectiveTo: version.effective_to || "",
      changeSummary: metadataText(version.metadata_json, "change_summary"),
      internalNote: metadataText(version.metadata_json, "internal_note"),
    });
  }, []);

  const loadVariables = useCallback(async (versionId: string) => {
    if (!versionId) {
      setBindings([]);
      setVariableDefinitions([]);
      return;
    }
    const bindingsResult = await supabase
      .from("document_clause_version_variable_bindings")
      .select("id, variable_definition_id, is_required, fallback_override")
      .eq("clause_version_id", versionId)
      .limit(500);
    if (bindingsResult.error) {
      console.error("Load clause variable bindings failed", bindingsResult.error);
      setBindings([]);
      setVariableDefinitions([]);
      return;
    }
    const bindingRows = (bindingsResult.data || []) as VariableBindingRow[];
    setBindings(bindingRows);
    const definitionIds = bindingRows.map((binding) => binding.variable_definition_id);
    if (definitionIds.length === 0) {
      setVariableDefinitions([]);
      return;
    }
    const definitionsResult = await supabase
      .from("document_variable_definitions")
      .select("id, variable_key, display_name_th, display_name_en, data_type, status")
      .in("id", definitionIds)
      .limit(500);
    if (definitionsResult.error) {
      console.error("Load variable definitions failed", definitionsResult.error);
      setVariableDefinitions([]);
      return;
    }
    setVariableDefinitions((definitionsResult.data || []) as VariableDefinitionRow[]);
  }, []);

  const loadWorkspace = useCallback(async (preferredVersionId?: string) => {
    if (!access.allowed || !clauseId) return;
    setLoading(true);
    setErrorText("");
    const [familyResult, versionsResult] = await Promise.all([
      supabase
        .from("document_clause_libraries")
        .select("id, clause_code, category, jurisdiction, metadata_json, is_active, updated_at")
        .eq("id", clauseId)
        .maybeSingle(),
      supabase
        .from("document_clause_versions")
        .select("id, clause_id, version_no, language_code, title, content, metadata_json, effective_from, effective_to, status, reviewed_at, published_at, retired_at, approval_note, approval_reference, content_format, previous_version_id, supersedes_version_id, updated_at")
        .eq("clause_id", clauseId)
        .order("version_no", { ascending: false })
        .limit(200),
    ]);
    if (familyResult.error || versionsResult.error || !familyResult.data) {
      console.error("Load clause workspace failed", familyResult.error || versionsResult.error);
      setErrorText("ไม่พบหรือไม่สามารถโหลดข้อสัญญานี้ได้");
      setLoading(false);
      return;
    }
    const familyRow = familyResult.data as ClauseFamilyRow;
    const versionRows = (versionsResult.data || []) as ClauseVersionRow[];
    const activeId = versionRows.some((version) => version.id === preferredVersionId)
      ? preferredVersionId || ""
      : versionRows[0]?.id || "";
    const activeVersion = versionRows.find((version) => version.id === activeId) || null;
    setFamily(familyRow);
    setFamilyName(metadataText(familyRow.metadata_json, "display_name_th") || activeVersion?.title || "");
    setFamilyCategory(familyRow.category || "");
    setFamilyJurisdiction(familyRow.jurisdiction || "");
    setVersions(versionRows);
    setSelectedVersionId(activeId);
    setEditorFromVersion(activeVersion);
    setApprovalNote(activeVersion?.approval_note || "");
    setApprovalReference(activeVersion?.approval_reference || "");
    setShowPublishReview(false);
    await loadVariables(activeId);
    setLoading(false);
  }, [access.allowed, clauseId, loadVariables, setEditorFromVersion]);

  useEffect(() => {
    if (access.loading || !access.allowed) return;
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [access.allowed, access.loading, loadWorkspace]);

  const dirty = useMemo(() => {
    if (!selectedVersion) return Boolean(versionForm.title || versionForm.content);
    return versionForm.languageCode !== selectedVersion.language_code
      || versionForm.title !== selectedVersion.title
      || versionForm.content !== selectedVersion.content
      || versionForm.riskLevel !== (metadataText(selectedVersion.metadata_json, "risk_level") || "informational")
      || versionForm.effectiveFrom !== (selectedVersion.effective_from || "")
      || versionForm.effectiveTo !== (selectedVersion.effective_to || "")
      || versionForm.changeSummary !== metadataText(selectedVersion.metadata_json, "change_summary")
      || versionForm.internalNote !== metadataText(selectedVersion.metadata_json, "internal_note");
  }, [selectedVersion, versionForm]);

  const metrics = useMemo(() => {
    const text = versionForm.content.trim();
    return {
      characters: versionForm.content.length,
      words: text ? text.split(/\s+/u).length : 0,
      paragraphs: text ? text.split(/\n\s*\n/u).filter(Boolean).length : 0,
    };
  }, [versionForm.content]);

  const saveFamily = async () => {
    if (!family || saving || !familyName.trim()) return;
    setSaving(true);
    setErrorText("");
    const { error } = await supabase.rpc("save_document_clause_family_draft", {
      p_clause_id: family.id,
      p_clause_code: family.clause_code,
      p_category: familyCategory.trim() || null,
      p_jurisdiction: familyJurisdiction.trim() || null,
      p_metadata_json: { ...(family.metadata_json || {}), display_name_th: familyName.trim() },
    });
    if (error) {
      console.error("Save clause family failed", error);
      setErrorText("บันทึกข้อมูลข้อสัญญามาตรฐานไม่สำเร็จ");
    } else {
      setEditingFamily(false);
      setSuccessText("บันทึกข้อมูลข้อสัญญามาตรฐานแล้ว");
      await loadWorkspace(selectedVersionId);
    }
    setSaving(false);
  };

  const saveVersion = async () => {
    if (!family || !isDraft || saving) return;
    if (!versionForm.title.trim() || !versionForm.content.trim()) {
      setErrorText("กรุณาระบุชื่อและถ้อยคำข้อสัญญา");
      return;
    }
    if (versionForm.effectiveFrom && versionForm.effectiveTo && versionForm.effectiveTo < versionForm.effectiveFrom) {
      setErrorText("วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่มใช้");
      return;
    }
    setSaving(true);
    setErrorText("");
    const metadata = {
      ...(selectedVersion?.metadata_json || {}),
      risk_level: versionForm.riskLevel,
      change_summary: versionForm.changeSummary.trim() || null,
      internal_note: versionForm.internalNote.trim() || null,
    };
    const { data, error } = await supabase.rpc("save_document_clause_version_draft", {
      p_clause_version_id: selectedVersion?.id || null,
      p_clause_id: family.id,
      p_language_code: versionForm.languageCode,
      p_title: versionForm.title.trim(),
      p_content: versionForm.content.trim(),
      p_metadata_json: metadata,
      p_effective_from: versionForm.effectiveFrom || null,
      p_effective_to: versionForm.effectiveTo || null,
    });
    if (error || typeof data !== "string") {
      console.error("Save clause version failed", error);
      setErrorText("บันทึกเวอร์ชันข้อสัญญาไม่สำเร็จ");
    } else {
      setSuccessText(selectedVersion ? "บันทึกฉบับร่างแล้ว" : "สร้างเวอร์ชันฉบับร่างแล้ว");
      await loadWorkspace(data);
    }
    setSaving(false);
  };

  const createNewVersion = async () => {
    if (!family || !selectedVersion || saving) return;
    const existingDraft = versions.find((version) => version.language_code === selectedVersion.language_code && version.status === "draft");
    if (existingDraft) {
      await selectVersion(existingDraft);
      setSuccessText(`มีฉบับร่างภาษา${languageLabel(existingDraft.language_code)}อยู่แล้ว ระบบเปิดรุ่น ${existingDraft.version_no} ให้แก้ไขแทนการสร้างซ้ำ`);
      return;
    }
    if (!window.confirm(`สร้างเวอร์ชันใหม่จากรุ่น ${selectedVersion.version_no} หรือไม่? รุ่นเดิมจะไม่ถูกแก้ไข`)) return;
    setSaving(true);
    setErrorText("");
    const { data, error } = await supabase.rpc("save_document_clause_version_draft", {
      p_clause_version_id: null,
      p_clause_id: family.id,
      p_language_code: selectedVersion.language_code,
      p_title: selectedVersion.title,
      p_content: selectedVersion.content,
      p_metadata_json: selectedVersion.metadata_json || {},
      p_effective_from: null,
      p_effective_to: null,
    });
    if (error || typeof data !== "string") {
      console.error("Create next clause version failed", error);
      setErrorText("สร้างเวอร์ชันใหม่ไม่สำเร็จ");
    } else {
      setSuccessText("สร้างเวอร์ชันใหม่เป็นฉบับร่างแล้ว");
      await loadWorkspace(data);
    }
    setSaving(false);
  };

  const transitionVersion = async (nextStatus: string, note?: string, reference?: string) => {
    if (!selectedVersion || saving) return;
    if ((nextStatus === "published" || nextStatus === "retired") && !isPartner) return;
    const action = nextStatus === "under_review" ? "ส่งเวอร์ชันนี้ให้ตรวจ"
      : nextStatus === "draft" ? "ส่งเวอร์ชันนี้กลับเป็นฉบับร่าง"
        : nextStatus === "published" ? "เผยแพร่ถ้อยคำเวอร์ชันนี้"
          : "ยกเลิกการใช้งานเวอร์ชันนี้";
    if (!window.confirm(`${action} หรือไม่?`)) return;
    setSaving(true);
    setErrorText("");
    const { error } = await supabase.rpc("set_document_clause_version_status", {
      p_clause_version_id: selectedVersion.id,
      p_next_status: nextStatus,
      p_approval_note: note?.trim() || null,
      p_approval_reference: reference?.trim() || null,
    });
    if (error) {
      console.error("Transition clause version failed", error);
      setErrorText("เปลี่ยนสถานะเวอร์ชันข้อสัญญาไม่สำเร็จ");
    } else {
      setSuccessText("เปลี่ยนสถานะเวอร์ชันแล้ว");
      await loadWorkspace(selectedVersion.id);
    }
    setSaving(false);
  };

  const selectVersion = async (version: ClauseVersionRow) => {
    setSelectedVersionId(version.id);
    setEditorFromVersion(version);
    setApprovalNote(version.approval_note || "");
    setApprovalReference(version.approval_reference || "");
    setShowPublishReview(false);
    setErrorText("");
    setSuccessText("");
    await loadVariables(version.id);
  };

  const displayName = familyName || selectedVersion?.title || "ข้อสัญญามาตรฐาน";

  return (
    <DocumentPlatformPage title="Settings" subtitle="Clause Library">
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <div className={styles.breadcrumb}><Link href="/settings/document-clauses">คลังข้อสัญญา</Link><span>/</span><span>{displayName}</span></div>
          {loading ? <div className={styles.emptyState}>กำลังโหลดพื้นที่ทำงานข้อสัญญา...</div> : null}
          {errorText ? <div className={styles.error}>{errorText}</div> : null}
          {successText ? <div className={styles.success}>{successText}</div> : null}

          {!loading && family ? (
            <>
              <header className={styles.pageHeader}>
                <div>
                  <div className={styles.badgeRow}><span className={styles.codeText}>{family.clause_code}</span><StatusBadge status={family.is_active ? "active" : "inactive"} />{selectedVersion ? <StatusBadge status={selectedVersion.status} /> : null}</div>
                  <h1 className={styles.pageTitle}>{displayName}</h1>
                  <p className={styles.pageDescription}>พื้นที่จัดทำและตรวจทานถ้อยคำกฎหมายมาตรฐาน โดยแต่ละเวอร์ชันมีประวัติแยกจากกัน</p>
                </div>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.button} onClick={() => setEditingFamily((current) => !current)}>ข้อมูลข้อสัญญา</button>
                  {selectedVersion && ["published", "retired"].includes(selectedVersion.status) ? <button type="button" className={styles.buttonPrimary} onClick={() => void createNewVersion()} disabled={saving}>สร้างเวอร์ชันใหม่</button> : null}
                </div>
              </header>

              {editingFamily ? (
                <section className={styles.formPanel}>
                  <div className={styles.formGrid}>
                    <label className={styles.fieldWide}>ชื่อข้อสัญญาภาษาไทย<input className={styles.input} value={familyName} onChange={(event) => setFamilyName(event.target.value)} /></label>
                    <label className={styles.field}>หมวด<input className={styles.input} value={familyCategory} onChange={(event) => setFamilyCategory(event.target.value)} /></label>
                    <label className={styles.field}>เขตอำนาจ / ประเทศ<input className={styles.input} value={familyJurisdiction} onChange={(event) => setFamilyJurisdiction(event.target.value)} /></label>
                  </div>
                  <div className={styles.actionRow}><button type="button" className={styles.buttonPrimary} onClick={() => void saveFamily()} disabled={saving || !familyName.trim()}>บันทึกข้อมูล</button><button type="button" className={styles.button} onClick={() => setEditingFamily(false)}>ยกเลิก</button></div>
                </section>
              ) : null}

              {versions.length > 0 ? (
                <div className={styles.versionTabs} aria-label="ประวัติเวอร์ชัน">
                  {versions.map((version) => <button type="button" key={version.id} className={version.id === selectedVersionId ? styles.versionTabActive : styles.versionTab} onClick={() => void selectVersion(version)}>รุ่น {version.version_no} · {languageLabel(version.language_code)} · {version.status === "under_review" ? "ส่งตรวจ" : version.status === "published" ? "เผยแพร่" : version.status === "retired" ? "เลิกใช้" : "ร่าง"}</button>)}
                </div>
              ) : null}

              <section className={styles.editorGrid}>
                <div className={styles.editorMain}>
                  <div className={styles.sectionHeader}>
                    <div><h2 className={styles.sectionTitle}>{selectedVersion ? `ถ้อยคำเวอร์ชัน ${selectedVersion.version_no}` : "สร้างเวอร์ชันแรก"}</h2><div className={styles.helperText}>{isDraft ? "บันทึกเป็นฉบับร่างก่อนส่งให้ผู้ตรวจ" : "เวอร์ชันนี้เป็นแบบอ่านอย่างเดียว"}</div></div>
                    {selectedVersion ? <div className={styles.badgeRow}><StatusBadge status={selectedVersion.status} /><RiskBadge risk={versionForm.riskLevel} /></div> : null}
                  </div>

                  <div className={styles.formGrid}>
                    <label className={styles.fieldWide}>ชื่อเวอร์ชัน / ชื่อข้อสัญญา<input className={styles.input} value={versionForm.title} onChange={(event) => setVersionForm({ ...versionForm, title: event.target.value })} disabled={!isDraft} /></label>
                    <label className={styles.field}>ภาษา<select className={styles.select} value={versionForm.languageCode} onChange={(event) => setVersionForm({ ...versionForm, languageCode: event.target.value })} disabled={Boolean(selectedVersion) || !isDraft}><option value="th">ไทย</option><option value="en">อังกฤษ</option></select></label>
                    <label className={styles.field}>ระดับความเสี่ยง<select className={styles.select} value={versionForm.riskLevel} onChange={(event) => setVersionForm({ ...versionForm, riskLevel: event.target.value })} disabled={!isDraft}>{riskLevels.map((risk) => <option key={risk} value={risk}>{riskLabel(risk)}</option>)}</select></label>
                    <label className={styles.field}>วันที่เริ่มใช้<input type="date" className={styles.input} value={versionForm.effectiveFrom} onChange={(event) => setVersionForm({ ...versionForm, effectiveFrom: event.target.value })} disabled={!isDraft} /></label>
                    <label className={styles.field}>วันที่สิ้นสุด<input type="date" className={styles.input} value={versionForm.effectiveTo} onChange={(event) => setVersionForm({ ...versionForm, effectiveTo: event.target.value })} disabled={!isDraft} /></label>
                  </div>

                  <label className={styles.field}>ถ้อยคำข้อสัญญา
                    <textarea className={styles.wordingEditor} value={versionForm.content} onChange={(event) => setVersionForm({ ...versionForm, content: event.target.value })} disabled={!isDraft} spellCheck lang={versionForm.languageCode} placeholder="พิมพ์ถ้อยคำที่ผ่านการจัดทำโดยผู้รับผิดชอบด้านกฎหมาย ระบบจะไม่สร้างถ้อยคำให้อัตโนมัติ" />
                  </label>
                  <div className={styles.metricRow}><span>{metrics.characters.toLocaleString("th-TH")} ตัวอักษร</span><span>{metrics.words.toLocaleString("th-TH")} คำ</span><span>{metrics.paragraphs.toLocaleString("th-TH")} ย่อหน้า</span></div>

                  <div className={styles.formGrid}>
                    <label className={styles.fieldWide}>สรุปการเปลี่ยนแปลง<textarea className={styles.textarea} value={versionForm.changeSummary} onChange={(event) => setVersionForm({ ...versionForm, changeSummary: event.target.value })} disabled={!isDraft} /></label>
                    <label className={styles.fieldWide}>บันทึกภายใน<textarea className={styles.textarea} value={versionForm.internalNote} onChange={(event) => setVersionForm({ ...versionForm, internalNote: event.target.value })} disabled={!isDraft} /><span className={styles.helperText}>ใช้เพื่อการทำงานภายใน ไม่ใช่ส่วนหนึ่งของถ้อยคำข้อสัญญา</span></label>
                  </div>

                  {isDraft ? (
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.buttonPrimary} onClick={() => void saveVersion()} disabled={saving || !versionForm.title.trim() || !versionForm.content.trim()}>{saving ? "กำลังบันทึก..." : "บันทึกฉบับร่าง"}</button>
                      {selectedVersion ? <button type="button" className={styles.button} onClick={() => void transitionVersion("under_review")} disabled={saving || dirty}>ส่งตรวจ</button> : null}
                      {dirty && selectedVersion ? <span className={styles.helperText}>กรุณาบันทึกการแก้ไขก่อนส่งตรวจ</span> : null}
                    </div>
                  ) : null}

                  {selectedVersion?.status === "under_review" ? (
                    <div className={styles.lifecyclePanel}>
                      <div><strong>อยู่ระหว่างการตรวจทาน</strong><div className={styles.helperText}>ถ้อยคำถูกล็อกระหว่างตรวจ หากต้องแก้ไขให้ส่งกลับเป็นฉบับร่าง</div></div>
                      <div className={styles.actionRow}>
                        <button type="button" className={styles.button} onClick={() => void transitionVersion("draft")} disabled={saving}>ส่งกลับเป็นร่าง</button>
                        {isPartner ? <button type="button" className={styles.buttonPrimary} onClick={() => setShowPublishReview(true)} disabled={saving}>ตรวจเพื่อเผยแพร่</button> : <span className={styles.helperText}>Partner เท่านั้นที่เผยแพร่ได้</span>}
                      </div>
                    </div>
                  ) : null}

                  {selectedVersion?.status === "published" && isPartner ? <div className={styles.actionRow}><button type="button" className={styles.buttonDanger} onClick={() => void transitionVersion("retired", approvalNote, approvalReference)} disabled={saving}>ยกเลิกการใช้งานเวอร์ชันนี้</button></div> : null}
                </div>

                <aside className={styles.editorAside}>
                  <section className={styles.sectionBlock}>
                    <div className={styles.sectionBlockHeader}><div><strong>ตัวแปรที่อนุมัติ</strong><div className={styles.helperText}>แสดงแบบอ่านอย่างเดียวในรอบนี้</div></div></div>
                    <div className={styles.sectionBody}>{bindings.length === 0 ? <div className={styles.muted}>ยังไม่มีตัวแปรผูกกับเวอร์ชันนี้</div> : <div className={styles.variableList}>{bindings.map((binding) => {
                      const definition = variableDefinitions.find((item) => item.id === binding.variable_definition_id);
                      return <div key={binding.id} className={styles.variableRow}><div><div className={styles.primaryText}>{definition?.display_name_th || "ไม่พบข้อมูลตัวแปร"}</div><div className={styles.codeText}>{definition?.variable_key || binding.variable_definition_id}</div></div><div className={styles.muted}>{binding.is_required ? "จำเป็น" : "ไม่บังคับ"}</div></div>;
                    })}</div>}</div>
                  </section>

                  <section className={styles.sectionBlock}>
                    <div className={styles.sectionBlockHeader}><div><strong>ข้อมูลเวอร์ชัน</strong></div></div>
                    <div className={styles.sectionBody}><div className={styles.compactList}>
                      <div><span>รูปแบบเนื้อหา</span><strong>{selectedVersion?.content_format === "plain_text" || !selectedVersion ? "ข้อความธรรมดา" : selectedVersion.content_format}</strong></div>
                      <div><span>แก้ไขล่าสุด</span><strong>{formatDateTime(selectedVersion?.updated_at || family.updated_at)}</strong></div>
                      <div><span>ตรวจทาน</span><strong>{formatDateTime(selectedVersion?.reviewed_at)}</strong></div>
                      <div><span>เผยแพร่</span><strong>{formatDateTime(selectedVersion?.published_at)}</strong></div>
                      {hasConditionMetadata(selectedVersion?.metadata_json) ? <div><span>เงื่อนไขขั้นสูง</span><strong>มีข้อมูลเดิม (อ่านอย่างเดียว)</strong></div> : null}
                    </div></div>
                  </section>
                </aside>
              </section>

              {showPublishReview && selectedVersion?.status === "under_review" && isPartner ? (
                <section className={styles.reviewPanel}>
                  <div className={styles.sectionHeader}><div><h2 className={styles.sectionTitle}>ตรวจทานครั้งสุดท้ายก่อนเผยแพร่</h2><div className={styles.helperText}>การเผยแพร่จะล็อกถ้อยคำเวอร์ชันนี้อย่างถาวร หากต้องแก้ภายหลังต้องสร้างเวอร์ชันใหม่</div></div><button type="button" className={styles.button} onClick={() => setShowPublishReview(false)}>ปิด</button></div>
                  <div className={styles.summaryGrid}>
                    <Summary label="ข้อสัญญา" value={`${displayName} (${family.clause_code})`} />
                    <Summary label="ภาษา / เวอร์ชัน" value={`${languageLabel(selectedVersion.language_code)} / รุ่น ${selectedVersion.version_no}`} />
                    <Summary label="ความเสี่ยง" value={riskLabel(versionForm.riskLevel)} />
                    <Summary label="วันที่เริ่มใช้" value={versionForm.effectiveFrom || "ไม่กำหนด"} />
                  </div>
                  <div className={styles.wordingPreview}>{selectedVersion.content}</div>
                  <div className={styles.formGrid}>
                    <label className={styles.fieldWide}>บันทึกการอนุมัติ<textarea className={styles.textarea} value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} /></label>
                    <label className={styles.fieldWide}>เอกสารอ้างอิงการอนุมัติ<input className={styles.input} value={approvalReference} onChange={(event) => setApprovalReference(event.target.value)} /></label>
                  </div>
                  <button type="button" className={styles.buttonPrimary} onClick={() => void transitionVersion("published", approvalNote, approvalReference)} disabled={saving}>ยืนยันเผยแพร่เวอร์ชันนี้</button>
                </section>
              ) : null}

              <section className={styles.section}>
                <div className={styles.sectionHeader}><div><h2 className={styles.sectionTitle}>ประวัติเวอร์ชัน</h2><div className={styles.helperText}>เวอร์ชันที่เผยแพร่หรือยกเลิกแล้วจะไม่ถูกแก้ไขในตำแหน่งเดิม</div></div></div>
                {versions.length === 0 ? <div className={styles.emptyState}>ยังไม่มีเวอร์ชันถ้อยคำ</div> : <div className={styles.historyList}>{versions.map((version) => <button type="button" key={version.id} className={styles.historyRow} onClick={() => void selectVersion(version)}><div><strong>รุ่น {version.version_no} · {version.title}</strong><div className={styles.muted}>{languageLabel(version.language_code)} · แก้ไข {formatDateTime(version.updated_at)}</div></div><div className={styles.badgeRow}><RiskBadge risk={metadataText(version.metadata_json, "risk_level")} /><StatusBadge status={version.status} /></div></button>)}</div>}
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

function metadataText(metadata: JsonObject | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasConditionMetadata(metadata: JsonObject | null | undefined) {
  if (!metadata) return false;
  return Object.keys(metadata).some((key) => key.includes("condition"));
}
