"use client";

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
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
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
      setErrorText(friendlyError(templatesResult.error, "ไม่สามารถโหลดรายการแม่แบบเอกสารได้"));
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
      setErrorText(friendlyError(versionsResult.error, "ไม่สามารถโหลดเวอร์ชันแม่แบบเอกสารได้"));
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
        setErrorText(friendlyError(sectionsResult.error, "ไม่สามารถโหลดโครงสร้างแม่แบบเอกสารได้"));
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
          setErrorText(friendlyError(slotsResult.error, "ไม่สามารถโหลดข้อสัญญาในแม่แบบได้"));
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
    <DocumentPlatformPage title="Settings" subtitle="Document Template Management">
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>แม่แบบเอกสาร</h1>
              <p className={styles.pageDescription}>
                จัดการโครงสร้างและเวอร์ชันของเอกสารสำนักงาน โดยแยกออกจากการตั้งค่าหัวเอกสารและตราสัญลักษณ์
              </p>
            </div>
            <button type="button" className={styles.button} onClick={() => void loadTemplates()} disabled={loading}>
              รีเฟรช
            </button>
          </header>

          {errorText ? <div className={styles.error}>{errorText}</div> : null}
          {loading ? <div className={styles.emptyState}>กำลังโหลดแม่แบบเอกสาร...</div> : null}
          {!loading && !errorText && summaries.length === 0 ? (
            <div className={styles.emptyState}>ยังไม่มีแม่แบบเอกสาร</div>
          ) : null}

          {!loading && summaries.length > 0 ? (
            <section className={styles.surface}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>แม่แบบ</th>
                      <th>ประเภท</th>
                      <th>ภาษา / เวอร์ชัน</th>
                      <th>สถานะ</th>
                      <th>โครงสร้าง</th>
                      <th>ตรวจล่าสุด</th>
                      <th>ดำเนินการ</th>
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
                          <td>{documentTypeLabel(template.document_type)}</td>
                          <td>
                            {languageLabel(template.latestVersion?.language_code || template.language_code)}
                            <div className={styles.muted}>
                              เวอร์ชัน {template.latestVersion?.version_no || "-"}
                            </div>
                          </td>
                          <td>
                            <div className={styles.badgeRow}>
                              <StatusBadge status={template.latestVersion?.status || template.status} />
                              <StatusBadge status={inactive ? "inactive" : "active"} />
                            </div>
                          </td>
                          <td>
                            <div>{template.sectionCount} ส่วน</div>
                            <div className={styles.muted}>{template.slotCount} ข้อสัญญา</div>
                          </td>
                          <td>{formatDateTime(reviewedAt)}</td>
                          <td>
                            <Link href={`/settings/document-templates/${template.id}`} className={styles.linkButton}>
                              เปิดแม่แบบ
                            </Link>
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
