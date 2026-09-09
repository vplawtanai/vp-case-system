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
  formatDateTime,
  languageLabel,
  riskLabel,
  useDocumentPlatformAccess,
} from "../../document-platform-shared";
import { supabase } from "../../../../lib/supabase";
import { useI18n } from "@/lib/i18n/provider";
import { uiMessage, type UiMessage } from "@/lib/i18n/core";
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
  const { t, text, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const clauseId = typeof params.id === "string" ? params.id : "";
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<UiMessage | string>("");
  const [successText, setSuccessText] = useState<UiMessage | string>("");
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
  const publishReviewRef = useRef<HTMLElement | null>(null);

  const selectedVersion = versions.find((version) => version.id === selectedVersionId) || null;
  const isDraft = !selectedVersion || selectedVersion.status === "draft";
  const canApprove = canApproveDocumentPlatform(access.role);

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
      setErrorText(uiMessage("settings.documents.clause.loadError"));
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
      setErrorText(uiMessage("settings.documents.clause.saveFamilyError"));
    } else {
      setEditingFamily(false);
      setSuccessText(uiMessage("settings.documents.clause.saveFamilySuccess"));
      await loadWorkspace(selectedVersionId);
    }
    setSaving(false);
  };

  const saveVersion = async () => {
    if (!family || !isDraft || saving) return;
    if (!versionForm.title.trim() || !versionForm.content.trim()) {
      setErrorText(uiMessage("settings.documents.clause.wordingRequired"));
      return;
    }
    if (versionForm.effectiveFrom && versionForm.effectiveTo && versionForm.effectiveTo < versionForm.effectiveFrom) {
      setErrorText(uiMessage("settings.documents.clause.dateRange"));
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
      setErrorText(uiMessage("settings.documents.clause.saveVersionError"));
    } else {
      setSuccessText(selectedVersion ? uiMessage("settings.documents.clause.draftSaved") : uiMessage("settings.documents.clause.draftCreated"));
      await loadWorkspace(data);
    }
    setSaving(false);
  };

  const createNewVersion = async () => {
    if (!family || !selectedVersion || saving) return;
    const existingDraft = versions.find((version) => version.language_code === selectedVersion.language_code && version.status === "draft");
    if (existingDraft) {
      await selectVersion(existingDraft);
      setSuccessText(uiMessage("settings.documents.clause.existingDraft", { number: existingDraft.version_no }));
      return;
    }
    if (!window.confirm(t("settings.documents.clause.confirmNew", { number: selectedVersion.version_no }))) return;
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
      setErrorText(uiMessage("settings.documents.clause.createError"));
    } else {
      setSuccessText(uiMessage("settings.documents.clause.created"));
      await loadWorkspace(data);
    }
    setSaving(false);
  };

  const transitionVersion = async (nextStatus: string, note?: string, reference?: string) => {
    if (!selectedVersion || saving) return;
    if ((nextStatus === "published" || nextStatus === "retired") && !canApprove) return;
    const action = nextStatus === "under_review" ? t("settings.documents.clause.submit")
      : nextStatus === "draft" ? t("settings.documents.clause.return")
        : nextStatus === "published" ? t("settings.documents.clause.publish")
          : t("settings.documents.clause.retire");
    if (!window.confirm(t("settings.documents.clause.confirmAction", { action }))) return;
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
      setErrorText(uiMessage("settings.documents.clause.transitionError"));
    } else {
      setSuccessText(uiMessage("settings.documents.clause.transitionSuccess"));
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

  const openPublishReview = () => {
    setShowPublishReview(true);
    window.requestAnimationFrame(() => {
      publishReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const displayName = familyName || selectedVersion?.title || t("settings.documents.clause.defaultTitle");

  return (
    <DocumentPlatformPage title={t("settings.documents.title")} subtitle={t("settings.documents.nav.clauses")}>
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <div className={styles.breadcrumb}><Link href="/settings/document-clauses">{t("settings.documents.nav.clauses")}</Link><span>/</span><span>{displayName}</span></div>
          {loading ? <div className={styles.emptyState}>{t("settings.documents.clause.loading")}</div> : null}
          {errorText ? <div className={styles.error}>{text(errorText)}</div> : null}
          {successText ? <div className={styles.success}>{text(successText)}</div> : null}

          {!loading && family ? (
            <>
              <header className={styles.pageHeader}>
                <div>
                  <div className={styles.badgeRow}><span className={styles.codeText}>{family.clause_code}</span><StatusBadge status={family.is_active ? "active" : "inactive"} />{selectedVersion ? <StatusBadge status={selectedVersion.status} /> : null}</div>
                  <h1 className={styles.pageTitle}>{displayName}</h1>
                  <p className={styles.pageDescription}>{t("settings.documents.clause.description")}</p>
                </div>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.button} onClick={() => setEditingFamily((current) => !current)}>{t("settings.documents.clause.family")}</button>
                  {selectedVersion?.status === "under_review" && canApprove ? <button type="button" className={styles.buttonPrimary} onClick={openPublishReview} disabled={saving}>{t("settings.documents.clause.publishAction")}</button> : null}
                  {selectedVersion && ["published", "retired"].includes(selectedVersion.status) ? <button type="button" className={styles.buttonPrimary} onClick={() => void createNewVersion()} disabled={saving}>{t("settings.documents.clause.createVersion")}</button> : null}
                </div>
              </header>

              {editingFamily ? (
                <section className={styles.formPanel}>
                  <div className={styles.formGrid}>
                    <label className={styles.fieldWide}>{t("settings.documents.clause.thaiName")}<input className={styles.input} value={familyName} onChange={(event) => setFamilyName(event.target.value)} /></label>
                    <label className={styles.field}>{t("settings.documents.fields.category")}<input className={styles.input} value={familyCategory} onChange={(event) => setFamilyCategory(event.target.value)} /></label>
                    <label className={styles.field}>{t("settings.documents.fields.jurisdiction")}<input className={styles.input} value={familyJurisdiction} onChange={(event) => setFamilyJurisdiction(event.target.value)} /></label>
                  </div>
                  <div className={styles.actionRow}><button type="button" className={styles.buttonPrimary} onClick={() => void saveFamily()} disabled={saving || !familyName.trim()}>{t("settings.documents.clause.saveFamily")}</button><button type="button" className={styles.button} onClick={() => setEditingFamily(false)}>{t("settings.documents.actions.cancel")}</button></div>
                </section>
              ) : null}

              {versions.length > 0 ? (
                <div className={styles.versionTabs} aria-label={t("settings.documents.clause.history")}>
                  {versions.map((version) => <button type="button" key={version.id} className={version.id === selectedVersionId ? styles.versionTabActive : styles.versionTab} onClick={() => void selectVersion(version)}>{t("settings.documents.count.version", { number: version.version_no })} · {languageLabel(version.language_code, locale)} · {version.status === "under_review" ? t("settings.documents.status.under_review") : version.status === "published" ? t("settings.documents.clause.publishAction") : version.status === "retired" ? t("settings.documents.status.retired") : t("settings.documents.status.draft")}</button>)}
                </div>
              ) : null}

              <section className={styles.editorGrid}>
                <div className={styles.editorMain}>
                  <div className={styles.sectionHeader}>
                    <div><h2 className={styles.sectionTitle}>{selectedVersion ? t("settings.documents.clause.wordingVersion", { number: selectedVersion.version_no }) : t("settings.documents.clause.firstVersion")}</h2><div className={styles.helperText}>{isDraft ? t("settings.documents.clause.draftHelp") : t("settings.documents.clause.readOnly")}</div></div>
                    {selectedVersion ? <div className={styles.badgeRow}><StatusBadge status={selectedVersion.status} /><RiskBadge risk={versionForm.riskLevel} /></div> : null}
                  </div>

                  <div className={styles.formGrid}>
                    <label className={styles.fieldWide}>{t("settings.documents.clause.versionTitle")}<input className={styles.input} value={versionForm.title} onChange={(event) => setVersionForm({ ...versionForm, title: event.target.value })} disabled={!isDraft} /></label>
                    <label className={styles.field}>{t("settings.documents.fields.language")}<select className={styles.select} value={versionForm.languageCode} onChange={(event) => setVersionForm({ ...versionForm, languageCode: event.target.value })} disabled={Boolean(selectedVersion) || !isDraft}><option value="th">{t("settings.documents.language.th")}</option><option value="en">{t("settings.documents.language.en")}</option></select></label>
                    <label className={styles.field}>{t("settings.documents.clause.risk")}<select className={styles.select} value={versionForm.riskLevel} onChange={(event) => setVersionForm({ ...versionForm, riskLevel: event.target.value })} disabled={!isDraft}>{riskLevels.map((risk) => <option key={risk} value={risk}>{riskLabel(risk, locale)}</option>)}</select></label>
                    <label className={styles.field}>{t("settings.documents.clause.effectiveFrom")}<input type="date" className={styles.input} value={versionForm.effectiveFrom} onChange={(event) => setVersionForm({ ...versionForm, effectiveFrom: event.target.value })} disabled={!isDraft} /></label>
                    <label className={styles.field}>{t("settings.documents.clause.effectiveTo")}<input type="date" className={styles.input} value={versionForm.effectiveTo} onChange={(event) => setVersionForm({ ...versionForm, effectiveTo: event.target.value })} disabled={!isDraft} /></label>
                  </div>

                  <label className={styles.field}>{t("settings.documents.clause.wording")}
                    <textarea className={styles.wordingEditor} value={versionForm.content} onChange={(event) => setVersionForm({ ...versionForm, content: event.target.value })} disabled={!isDraft} spellCheck lang={versionForm.languageCode} placeholder={t("settings.documents.clause.wordingPlaceholder")} />
                  </label>
                  <div className={styles.metricRow}><span>{t("settings.documents.clause.metrics.characters", { count: metrics.characters.toLocaleString(locale === "en" ? "en-GB" : "th-TH") })}</span><span>{t("settings.documents.clause.metrics.words", { count: metrics.words.toLocaleString(locale === "en" ? "en-GB" : "th-TH") })}</span><span>{t("settings.documents.clause.metrics.paragraphs", { count: metrics.paragraphs.toLocaleString(locale === "en" ? "en-GB" : "th-TH") })}</span></div>

                  <div className={styles.formGrid}>
                    <label className={styles.fieldWide}>{t("settings.documents.clause.changeSummary")}<textarea className={styles.textarea} value={versionForm.changeSummary} onChange={(event) => setVersionForm({ ...versionForm, changeSummary: event.target.value })} disabled={!isDraft} /></label>
                    <label className={styles.fieldWide}>{t("settings.documents.clause.internalNote")}<textarea className={styles.textarea} value={versionForm.internalNote} onChange={(event) => setVersionForm({ ...versionForm, internalNote: event.target.value })} disabled={!isDraft} /><span className={styles.helperText}>{t("settings.documents.clause.internalHelp")}</span></label>
                  </div>

                  {isDraft ? (
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.buttonPrimary} onClick={() => void saveVersion()} disabled={saving || !versionForm.title.trim() || !versionForm.content.trim()}>{saving ? t("settings.documents.clause.saving") : t("settings.documents.clause.saveDraft")}</button>
                      {selectedVersion ? <button type="button" className={styles.button} onClick={() => void transitionVersion("under_review")} disabled={saving || dirty}>{t("settings.documents.status.under_review")}</button> : null}
                      {dirty && selectedVersion ? <span className={styles.helperText}>{t("settings.documents.clause.saveFirst")}</span> : null}
                    </div>
                  ) : null}

                  {selectedVersion?.status === "under_review" ? (
                    <div className={styles.lifecyclePanel}>
                      <div><strong>{t("settings.documents.clause.review")}</strong><div className={styles.helperText}>{t("settings.documents.clause.reviewHelp")}</div></div>
                      <div className={styles.actionRow}>
                        <button type="button" className={styles.button} onClick={() => void transitionVersion("draft")} disabled={saving}>{t("settings.documents.clause.returnDraft")}</button>
                        {canApprove ? <button type="button" className={styles.buttonPrimary} onClick={openPublishReview} disabled={saving}>{t("settings.documents.clause.publishAction")}</button> : null}
                      </div>
                    </div>
                  ) : null}

                  {selectedVersion?.status === "published" && canApprove ? <div className={styles.actionRow}><button type="button" className={styles.buttonDanger} onClick={() => void transitionVersion("retired", approvalNote, approvalReference)} disabled={saving}>{t("settings.documents.clause.retire")}</button></div> : null}
                </div>

                <aside className={styles.editorAside}>
                  <section className={styles.sectionBlock}>
                    <div className={styles.sectionBlockHeader}><div><strong>{t("settings.documents.clause.variables")}</strong><div className={styles.helperText}>{t("settings.documents.clause.variablesReadOnly")}</div></div></div>
                    <div className={styles.sectionBody}>{bindings.length === 0 ? <div className={styles.muted}>{t("settings.documents.clause.noVariables")}</div> : <div className={styles.variableList}>{bindings.map((binding) => {
                      const definition = variableDefinitions.find((item) => item.id === binding.variable_definition_id);
                      return <div key={binding.id} className={styles.variableRow}><div><div className={styles.primaryText}>{(locale === "en" ? definition?.display_name_en || definition?.display_name_th : definition?.display_name_th) || t("settings.documents.clause.variableMissing")}</div><div className={styles.codeText}>{definition?.variable_key || binding.variable_definition_id}</div></div><div className={styles.muted}>{binding.is_required ? t("settings.documents.clause.required") : t("settings.documents.clause.optional")}</div></div>;
                    })}</div>}</div>
                  </section>

                  <section className={styles.sectionBlock}>
                    <div className={styles.sectionBlockHeader}><div><strong>{t("settings.documents.clause.versionDetails")}</strong></div></div>
                    <div className={styles.sectionBody}><div className={styles.compactList}>
                      <div><span>{t("settings.documents.clause.contentFormat")}</span><strong>{selectedVersion?.content_format === "plain_text" || !selectedVersion ? t("settings.documents.clause.plainText") : selectedVersion.content_format}</strong></div>
                      <div><span>{t("settings.documents.clause.updated")}</span><strong>{formatDateTime(selectedVersion?.updated_at || family.updated_at, locale)}</strong></div>
                      <div><span>{t("settings.documents.clause.reviewed")}</span><strong>{formatDateTime(selectedVersion?.reviewed_at, locale)}</strong></div>
                      <div><span>{t("settings.documents.clause.publishAction")}</span><strong>{formatDateTime(selectedVersion?.published_at, locale)}</strong></div>
                      {hasConditionMetadata(selectedVersion?.metadata_json) ? <div><span>{t("settings.documents.clause.conditions")}</span><strong>{t("settings.documents.clause.legacyConditions")}</strong></div> : null}
                    </div></div>
                  </section>
                </aside>
              </section>

              {showPublishReview && selectedVersion?.status === "under_review" && canApprove ? (
                <section ref={publishReviewRef} className={styles.reviewPanel}>
                  <div className={styles.sectionHeader}><div><h2 className={styles.sectionTitle}>{t("settings.documents.clause.finalReview")}</h2><div className={styles.helperText}>{t("settings.documents.clause.publishHelp")}</div></div><button type="button" className={styles.button} onClick={() => setShowPublishReview(false)}>{t("settings.documents.actions.close")}</button></div>
                  <div className={styles.summaryGrid}>
                    <Summary label={t("settings.documents.clause.clause")} value={`${displayName} (${family.clause_code})`} />
                    <Summary label={t("settings.documents.clause.languageVersion")} value={`${languageLabel(selectedVersion.language_code, locale)} / ${t("settings.documents.count.version", { number: selectedVersion.version_no })}`} />
                    <Summary label={t("settings.documents.clause.riskSummary")} value={riskLabel(versionForm.riskLevel, locale)} />
                    <Summary label={t("settings.documents.clause.effectiveFrom")} value={versionForm.effectiveFrom || t("settings.documents.clause.unspecified")} />
                  </div>
                  <div className={styles.wordingPreview}>{selectedVersion.content}</div>
                  <div className={styles.formGrid}>
                    <label className={styles.fieldWide}>{t("settings.documents.clause.approvalNote")}<textarea className={styles.textarea} value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} /></label>
                    <label className={styles.fieldWide}>{t("settings.documents.clause.approvalReference")}<input className={styles.input} value={approvalReference} onChange={(event) => setApprovalReference(event.target.value)} /></label>
                  </div>
                  <button type="button" className={styles.buttonPrimary} onClick={() => void transitionVersion("published", approvalNote, approvalReference)} disabled={saving}>{t("settings.documents.clause.confirmPublish")}</button>
                </section>
              ) : null}

              <section className={styles.section}>
                <div className={styles.sectionHeader}><div><h2 className={styles.sectionTitle}>{t("settings.documents.clause.history")}</h2><div className={styles.helperText}>{t("settings.documents.clause.historyHelp")}</div></div></div>
                {versions.length === 0 ? <div className={styles.emptyState}>{t("settings.documents.clause.noVersions")}</div> : <div className={styles.historyList}>{versions.map((version) => <button type="button" key={version.id} className={styles.historyRow} onClick={() => void selectVersion(version)}><div><strong>{t("settings.documents.count.version", { number: version.version_no })} · {version.title}</strong><div className={styles.muted}>{languageLabel(version.language_code, locale)} · {t("settings.documents.clause.updated")} {formatDateTime(version.updated_at, locale)}</div></div><div className={styles.badgeRow}><RiskBadge risk={metadataText(version.metadata_json, "risk_level")} /><StatusBadge status={version.status} /></div></button>)}</div>}
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
