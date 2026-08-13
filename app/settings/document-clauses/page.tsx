"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessState,
  DocumentPlatformPage,
  StatusBadge,
  formatDateTime,
  friendlyError,
  languageLabel,
  useDocumentPlatformAccess,
} from "../document-platform-shared";
import { supabase } from "../../../lib/supabase";
import styles from "../document-platform.module.css";

type ClauseFamilyRow = {
  id: string;
  clause_code: string;
  category: string | null;
  jurisdiction: string | null;
  is_active: boolean;
  updated_at: string | null;
};

type ClauseVersionRow = {
  id: string;
  clause_id: string;
  version_no: number;
  language_code: string;
  title: string;
  status: string;
  reviewed_at: string | null;
  published_at: string | null;
  updated_at: string | null;
};

export default function DocumentClausesPage() {
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [families, setFamilies] = useState<ClauseFamilyRow[]>([]);
  const [versions, setVersions] = useState<ClauseVersionRow[]>([]);

  const loadClauses = useCallback(async () => {
    if (!access.allowed) return;
    setLoading(true);
    setErrorText("");

    const familiesResult = await supabase
      .from("document_clause_libraries")
      .select("id, clause_code, category, jurisdiction, is_active, updated_at")
      .order("clause_code", { ascending: true })
      .limit(1000);
    if (familiesResult.error) {
      setErrorText(friendlyError(familiesResult.error, "ไม่สามารถโหลดคลังข้อสัญญาได้"));
      setLoading(false);
      return;
    }

    const familyRows = (familiesResult.data || []) as ClauseFamilyRow[];
    const familyIds = familyRows.map((family) => family.id);
    let versionRows: ClauseVersionRow[] = [];
    if (familyIds.length > 0) {
      const versionsResult = await supabase
        .from("document_clause_versions")
        .select("id, clause_id, version_no, language_code, title, status, reviewed_at, published_at, updated_at")
        .in("clause_id", familyIds)
        .order("version_no", { ascending: false })
        .limit(5000);
      if (versionsResult.error) {
        setErrorText(friendlyError(versionsResult.error, "ไม่สามารถโหลดเวอร์ชันข้อสัญญาได้"));
        setLoading(false);
        return;
      }
      versionRows = (versionsResult.data || []) as ClauseVersionRow[];
    }

    setFamilies(familyRows);
    setVersions(versionRows);
    setLoading(false);
  }, [access.allowed]);

  useEffect(() => {
    if (access.loading) return;
    if (!access.allowed) return;
    const timer = window.setTimeout(() => {
      void loadClauses();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [access.allowed, access.loading, loadClauses]);

  const rows = useMemo(() => families.map((family) => {
    const familyVersions = versions
      .filter((version) => version.clause_id === family.id)
      .sort((left, right) => right.version_no - left.version_no);
    return {
      ...family,
      latestVersion: familyVersions[0] || null,
      versionCount: familyVersions.length,
    };
  }), [families, versions]);

  return (
    <DocumentPlatformPage title="Settings" subtitle="Clause Library">
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>คลังข้อสัญญา</h1>
              <p className={styles.pageDescription}>
                รายการข้อสัญญาและเวอร์ชันถ้อยคำที่ใช้ประกอบแม่แบบเอกสาร โดยยังไม่มีการเพิ่มถ้อยคำทางกฎหมายในขั้นตอนนี้
              </p>
            </div>
            <button type="button" className={styles.button} onClick={() => void loadClauses()} disabled={loading}>รีเฟรช</button>
          </header>

          <div className={styles.notice}>
            หน้านี้เป็นฐานรายการสำหรับตรวจสอบคลังข้อสัญญา การสร้างและแก้ไขถ้อยคำจะเพิ่มในขั้นตอนถัดไปหลังการอนุมัติกระบวนการตรวจทานทางกฎหมาย
          </div>

          {errorText ? <div className={styles.error}>{errorText}</div> : null}
          {loading ? <div className={styles.emptyState}>กำลังโหลดคลังข้อสัญญา...</div> : null}
          {!loading && !errorText && rows.length === 0 ? <div className={styles.emptyState}>ยังไม่มีข้อสัญญาในคลัง</div> : null}

          {!loading && rows.length > 0 ? (
            <section className={styles.surface}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>รหัสข้อสัญญา</th>
                      <th>ชื่อข้อสัญญาล่าสุด</th>
                      <th>หมวด / เขตอำนาจ</th>
                      <th>ภาษา / เวอร์ชัน</th>
                      <th>สถานะ</th>
                      <th>แก้ไขล่าสุด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((family) => {
                      const latest = family.latestVersion;
                      return (
                        <tr key={family.id}>
                          <td><span className={styles.codeText}>{family.clause_code}</span></td>
                          <td>
                            <div className={styles.primaryText}>{latest?.title || "ยังไม่มีเวอร์ชันถ้อยคำ"}</div>
                            <div className={styles.muted}>{family.versionCount} เวอร์ชัน</div>
                          </td>
                          <td>{family.category || "-"}<div className={styles.muted}>{family.jurisdiction || "-"}</div></td>
                          <td>{latest ? languageLabel(latest.language_code) : "-"}<div className={styles.muted}>รุ่น {latest?.version_no || "-"}</div></td>
                          <td><div className={styles.badgeRow}><StatusBadge status={latest?.status || "draft"} /><StatusBadge status={family.is_active ? "active" : "inactive"} /></div></td>
                          <td>{formatDateTime(latest?.reviewed_at || latest?.published_at || latest?.updated_at || family.updated_at)}</td>
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
