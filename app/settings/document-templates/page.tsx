"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { uiMessage, type UiMessage } from "../../../lib/i18n/core";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AccessState,
  DocumentPlatformPage,
  StatusBadge,
  documentTypeLabel,
  formatDateTime,
  friendlyError,
  languageLabel,
  useDocumentPlatformAccess,
} from "../document-platform-shared";
import { supabase } from "../../../lib/supabase";
import styles from "../document-platform.module.css";

type TemplateRow = {
  id: string;
  name: string;
  template_code: string;
  document_type: string;
  language_code: string;
  status: string;
  metadata_json: Record<string, unknown> | null;
  updated_at: string | null;
};

type VersionRow = {
  id: string;
  template_id: string;
  version_no: number;
  language_code: string;
  status: string;
  reviewed_at: string | null;
  published_at: string | null;
  updated_at: string | null;
};

type SectionRow = {
  id: string;
  template_version_id: string;
};

type SlotRow = {
  id: string;
  template_section_id: string;
};

type TemplateSummary = TemplateRow & {
  latestVersion: VersionRow | null;
  sectionCount: number;
  slotCount: number;
};

export default function DocumentTemplatesPage() {
  const { t, text, locale } = useI18n();
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<UiMessage | string>("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);

  const loadTemplates = useCallback(async () => {
    if (!access.allowed) return;
    setLoading(true);
    setErrorText("");

    const templatesResult = await supabase
      .from("document_templates")
      .select("id, name, template_code, document_type, language_code, status, metadata_json, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (templatesResult.error) {
      setErrorText(friendlyError(templatesResult.error, uiMessage("settings.documents.templates.error.load")));
      setLoading(false);
      return;
    }

    const templateRows = (templatesResult.data || []) as TemplateRow[];
    const templateIds = templateRows.map((template) => template.id);
    if (templateIds.length === 0) {
      setTemplates([]);
      setVersions([]);
      setSections([]);
      setSlots([]);
      setLoading(false);
      return;
    }

    const versionsResult = await supabase
      .from("document_template_versions")
      .select("id, template_id, version_no, language_code, status, reviewed_at, published_at, updated_at")
      .in("template_id", templateIds)
      .order("version_no", { ascending: false })
      .limit(1000);

    if (versionsResult.error) {
      setErrorText(friendlyError(versionsResult.error, uiMessage("settings.documents.templates.error.versions")));
      setLoading(false);
      return;
    }

    const versionRows = (versionsResult.data || []) as VersionRow[];
    const versionIds = versionRows.map((version) => version.id);
    let sectionRows: SectionRow[] = [];
    let slotRows: SlotRow[] = [];

    if (versionIds.length > 0) {
      const sectionsResult = await supabase
        .from("document_template_sections")
        .select("id, template_version_id")
        .in("template_version_id", versionIds)
        .limit(5000);
      if (sectionsResult.error) {
        setErrorText(friendlyError(sectionsResult.error, uiMessage("settings.documents.templates.error.structure")));
        setLoading(false);
        return;
      }
      sectionRows = (sectionsResult.data || []) as SectionRow[];

      const sectionIds = sectionRows.map((section) => section.id);
      if (sectionIds.length > 0) {
        const slotsResult = await supabase
          .from("document_template_clause_slots")
          .select("id, template_section_id")
          .in("template_section_id", sectionIds)
          .limit(10000);
        if (slotsResult.error) {
          setErrorText(friendlyError(slotsResult.error, uiMessage("settings.documents.templates.error.slots")));
          setLoading(false);
          return;
        }
        slotRows = (slotsResult.data || []) as SlotRow[];
      }
    }

    setTemplates(templateRows);
    setVersions(versionRows);
    setSections(sectionRows);
    setSlots(slotRows);
    setLoading(false);
  }, [access.allowed]);

  useEffect(() => {
    if (access.loading) return;
    if (!access.allowed) return;
    const timer = window.setTimeout(() => {
      void loadTemplates();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [access.allowed, access.loading, loadTemplates]);

  const summaries = useMemo<TemplateSummary[]>(() => templates.map((template) => {
    const familyVersions = versions
      .filter((version) => version.template_id === template.id)
      .sort((left, right) => right.version_no - left.version_no);
    const latestVersion = familyVersions[0] || null;
    const latestSections = latestVersion
      ? sections.filter((section) => section.template_version_id === latestVersion.id)
      : [];
    const latestSectionIds = new Set(latestSections.map((section) => section.id));

    return {
      ...template,
      latestVersion,
      sectionCount: latestSections.length,
      slotCount: slots.filter((slot) => latestSectionIds.has(slot.template_section_id)).length,
    };
  }), [sections, slots, templates, versions]);

  return (
    <DocumentPlatformPage title={t("settings.documents.title")} subtitle={t("settings.documents.subtitle.templates")}>
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>{t("settings.documents.nav.templates")}</h1>
              <p className={styles.pageDescription}>
                {t("settings.documents.templates.description")}</p>
            </div>
            <button type="button" className={styles.button} onClick={() => void loadTemplates()} disabled={loading}>
              {t("settings.documents.actions.refresh")}</button>
          </header>

          {errorText ? <div className={styles.error}>{text(errorText)}</div> : null}
          {loading ? <div className={styles.emptyState}>{t("settings.documents.templates.loading")}</div> : null}
          {!loading && !errorText && summaries.length === 0 ? (
            <div className={styles.emptyState}>{t("settings.documents.templates.empty")}</div>
          ) : null}

          {!loading && summaries.length > 0 ? (
            <section className={styles.surface}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("settings.documents.templates.template")}</th>
                      <th>{t("settings.documents.fields.type")}</th>
                      <th>{t("settings.documents.fields.languageVersion")}</th>
                      <th>{t("settings.documents.fields.status")}</th>
                      <th>{t("settings.documents.fields.structure")}</th>
                      <th>{t("settings.documents.fields.reviewed")}</th>
                      <th>{t("settings.documents.fields.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((template) => {
                      const inactive = template.metadata_json?.inactive_shell === true
                        || template.status !== "active";
                      const reviewedAt = template.latestVersion?.reviewed_at
                        || template.latestVersion?.published_at
                        || template.latestVersion?.updated_at
                        || template.updated_at;

                      return (
                        <tr key={template.id}>
                          <td>
                            <div className={styles.primaryText}>{template.name}</div>
                            <div className={styles.codeText}>{template.template_code}</div>
                          </td>
                          <td>{documentTypeLabel(template.document_type, locale)}</td>
                          <td>
                            {languageLabel(template.latestVersion?.language_code || template.language_code, locale)}
                            <div className={styles.muted}>
                              {t("settings.documents.count.version", { number: template.latestVersion?.version_no || "-" })}
                            </div>
                          </td>
                          <td>
                            <div className={styles.badgeRow}>
                              <StatusBadge status={template.latestVersion?.status || template.status} />
                              <StatusBadge status={inactive ? "inactive" : "active"} />
                            </div>
                          </td>
                          <td>
                            <div>{t("settings.documents.count.sections", { count: template.sectionCount })}</div>
                            <div className={styles.muted}>{t("settings.documents.count.clauses", { count: template.slotCount })}</div>
                          </td>
                          <td>{formatDateTime(reviewedAt, locale)}</td>
                          <td>
                            <Link href={`/settings/document-templates/${template.id}`} className={styles.linkButton}>
                              {t("settings.documents.templates.open")}</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </DocumentPlatformPage>
  );
}
