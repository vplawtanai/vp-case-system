"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AccessState,
  DocumentPlatformPage,
  RiskBadge,
  StatusBadge,
  formatDateTime,
  languageLabel,
  useDocumentPlatformAccess,
} from "../document-platform-shared";
import { supabase } from "../../../lib/supabase";
import styles from "../document-platform.module.css";

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
  status: string;
  metadata_json: JsonObject | null;
  reviewed_at: string | null;
  published_at: string | null;
  updated_at: string | null;
};

const initialFamily = {
  clauseCode: "",
  displayNameTh: "",
  category: "",
  jurisdiction: "ประเทศไทย",
};

export default function DocumentClausesPage() {
  const router = useRouter();
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [families, setFamilies] = useState<ClauseFamilyRow[]>([]);
  const [versions, setVersions] = useState<ClauseVersionRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newFamily, setNewFamily] = useState(initialFamily);

  const loadClauses = useCallback(async () => {
    if (!access.allowed) return;
    setLoading(true);
    setErrorText("");

    const familiesResult = await supabase
      .from("document_clause_libraries")
      .select("id, clause_code, category, jurisdiction, metadata_json, is_active, updated_at")
      .order("clause_code", { ascending: true })
      .limit(1000);
    if (familiesResult.error) {
      console.error("Load clause families failed", familiesResult.error);
      setErrorText("ไม่สามารถโหลดคลังข้อสัญญาได้");
      setLoading(false);
      return;
    }

    const familyRows = (familiesResult.data || []) as ClauseFamilyRow[];
    const familyIds = familyRows.map((family) => family.id);
    let versionRows: ClauseVersionRow[] = [];
    if (familyIds.length > 0) {
      const versionsResult = await supabase
        .from("document_clause_versions")
        .select("id, clause_id, version_no, language_code, title, status, metadata_json, reviewed_at, published_at, updated_at")
        .in("clause_id", familyIds)
        .order("version_no", { ascending: false })
        .limit(5000);
      if (versionsResult.error) {
        console.error("Load clause versions failed", versionsResult.error);
        setErrorText("ไม่สามารถโหลดเวอร์ชันข้อสัญญาได้");
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
    if (access.loading || !access.allowed) return;
    const timer = window.setTimeout(() => void loadClauses(), 0);
    return () => window.clearTimeout(timer);
  }, [access.allowed, access.loading, loadClauses]);

  const rows = useMemo(() => families.map((family) => {
    const familyVersions = versions
      .filter((version) => version.clause_id === family.id)
      .sort((left, right) => right.version_no - left.version_no);
    const latestVersion = familyVersions[0] || null;
    return {
      ...family,
      displayName: metadataText(family.metadata_json, "display_name_th") || latestVersion?.title || "ยังไม่ได้ตั้งชื่อข้อสัญญา",
      latestVersion,
      versionCount: familyVersions.length,
      languages: Array.from(new Set(familyVersions.map((version) => version.language_code))).sort(),
      statuses: Array.from(new Set(familyVersions.map((version) => version.status))),
      riskLevel: metadataText(latestVersion?.metadata_json, "risk_level") || "informational",
    };
  }), [families, versions]);

  const categories = useMemo(
    () => Array.from(new Set(families.map((family) => family.category).filter(Boolean) as string[])).sort(),
    [families]
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th");
    return rows.filter((family) => {
      const matchesSearch = !query || [family.displayName, family.clause_code, family.category, family.jurisdiction, family.latestVersion?.title]
        .some((value) => String(value || "").toLocaleLowerCase("th").includes(query));
      const matchesStatus = statusFilter === "all"
        || family.statuses.includes(statusFilter)
        || (statusFilter === "no_version" && family.versionCount === 0);
      const matchesLanguage = languageFilter === "all" || family.languages.includes(languageFilter);
      const matchesCategory = categoryFilter === "all" || family.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesLanguage && matchesCategory;
    });
  }, [categoryFilter, languageFilter, rows, search, statusFilter]);

  const createFamily = async () => {
    if (!access.allowed || saving) return;
    const code = newFamily.clauseCode.trim().toUpperCase();
    const displayName = newFamily.displayNameTh.trim();
    if (!code || !displayName) {
      setErrorText("กรุณาระบุรหัสและชื่อข้อสัญญา");
      return;
    }

    setSaving(true);
    setErrorText("");
    const { data, error } = await supabase.rpc("save_document_clause_family_draft", {
      p_clause_id: null,
      p_clause_code: code,
      p_category: newFamily.category.trim() || null,
      p_jurisdiction: newFamily.jurisdiction.trim() || null,
      p_metadata_json: { display_name_th: displayName },
    });
    if (error || typeof data !== "string") {
      console.error("Create clause family failed", error);
      setErrorText(error?.message?.toLowerCase().includes("duplicate")
        ? "รหัสข้อสัญญานี้มีอยู่แล้ว กรุณาใช้รหัสอื่น"
        : "สร้างข้อสัญญามาตรฐานไม่สำเร็จ");
      setSaving(false);
      return;
    }

    setNewFamily(initialFamily);
    setShowCreate(false);
    setSaving(false);
    router.push(`/settings/document-clauses/${data}`);
  };

  return (
    <DocumentPlatformPage title="Settings" subtitle="Clause Library">
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>คลังข้อสัญญา</h1>
              <p className={styles.pageDescription}>จัดทำ ตรวจทาน และเก็บเวอร์ชันถ้อยคำกฎหมายมาตรฐานสำหรับใช้ในแม่แบบเอกสาร</p>
            </div>
            <div className={styles.actionRow}>
              <button type="button" className={styles.button} onClick={() => void loadClauses()} disabled={loading}>รีเฟรช</button>
              <button type="button" className={styles.buttonPrimary} onClick={() => setShowCreate((current) => !current)}>สร้างข้อสัญญามาตรฐาน</button>
            </div>
          </header>

          <div className={styles.notice}>เฉพาะเวอร์ชันที่ผ่านการตรวจและเผยแพร่แล้วเท่านั้น จึงจะนำไปผูกกับตำแหน่งข้อสัญญาในแม่แบบเอกสารได้</div>

          {showCreate ? (
            <section className={styles.formPanel}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>สร้างข้อสัญญามาตรฐาน</h2>
                  <div className={styles.helperText}>สร้างเฉพาะหัวข้อในคลัง ขั้นตอนนี้ยังไม่มีการเผยแพร่ถ้อยคำกฎหมาย</div>
                </div>
                <button type="button" className={styles.button} onClick={() => setShowCreate(false)}>ปิด</button>
              </div>
              <div className={styles.formGrid}>
                <label className={styles.field}>รหัสข้อสัญญา
                  <input className={styles.input} value={newFamily.clauseCode} onChange={(event) => setNewFamily({ ...newFamily, clauseCode: event.target.value.toUpperCase() })} placeholder="เช่น SERVICE-SCOPE" />
                </label>
                <label className={styles.fieldWide}>ชื่อข้อสัญญาภาษาไทย
                  <input className={styles.input} value={newFamily.displayNameTh} onChange={(event) => setNewFamily({ ...newFamily, displayNameTh: event.target.value })} />
                </label>
                <label className={styles.field}>หมวด
                  <input className={styles.input} value={newFamily.category} onChange={(event) => setNewFamily({ ...newFamily, category: event.target.value })} />
                </label>
                <label className={styles.field}>เขตอำนาจ / ประเทศ
                  <input className={styles.input} value={newFamily.jurisdiction} onChange={(event) => setNewFamily({ ...newFamily, jurisdiction: event.target.value })} />
                </label>
              </div>
              <div className={styles.actionRow}>
                <button type="button" className={styles.buttonPrimary} onClick={() => void createFamily()} disabled={saving || !newFamily.clauseCode.trim() || !newFamily.displayNameTh.trim()}>{saving ? "กำลังสร้าง..." : "สร้างและเปิดพื้นที่เขียน"}</button>
                <button type="button" className={styles.button} onClick={() => { setNewFamily(initialFamily); setShowCreate(false); }}>ยกเลิก</button>
              </div>
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={styles.filterBar}>
              <label className={styles.fieldWide}>ค้นหา
                <input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ชื่อ รหัส หมวด หรือเขตอำนาจ" />
              </label>
              <label className={styles.field}>สถานะ
                <select className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">ทุกสถานะ</option><option value="draft">ฉบับร่าง</option><option value="under_review">ส่งตรวจ</option><option value="published">เผยแพร่แล้ว</option><option value="retired">ยกเลิกการใช้งาน</option><option value="no_version">ยังไม่มีเวอร์ชัน</option>
                </select>
              </label>
              <label className={styles.field}>ภาษา
                <select className={styles.select} value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
                  <option value="all">ทุกภาษา</option><option value="th">ไทย</option><option value="en">อังกฤษ</option>
                </select>
              </label>
              <label className={styles.field}>หมวด
                <select className={styles.select} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">ทุกหมวด</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>
          </section>

          {errorText ? <div className={styles.error}>{errorText}</div> : null}
          {loading ? <div className={styles.emptyState}>กำลังโหลดคลังข้อสัญญา...</div> : null}
          {!loading && !errorText && rows.length === 0 ? <div className={styles.emptyState}>ยังไม่มีข้อสัญญามาตรฐานในคลัง</div> : null}
          {!loading && rows.length > 0 && filteredRows.length === 0 ? <div className={styles.emptyState}>ไม่พบข้อสัญญาที่ตรงกับการค้นหา</div> : null}

          {!loading && filteredRows.length > 0 ? (
            <section className={styles.surface}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>ข้อสัญญามาตรฐาน</th><th>หมวด / เขตอำนาจ</th><th>ภาษา</th><th>เวอร์ชันล่าสุด</th><th>สถานะ</th><th>ความเสี่ยง</th><th>ตรวจ/เผยแพร่ล่าสุด</th><th>ดำเนินการ</th></tr></thead>
                  <tbody>{filteredRows.map((family) => {
                    const latest = family.latestVersion;
                    return <tr key={family.id}>
                      <td><div className={styles.primaryText}>{family.displayName}</div><div className={styles.codeText}>{family.clause_code}</div><StatusBadge status={family.is_active ? "active" : "inactive"} /></td>
                      <td>{family.category || "-"}<div className={styles.muted}>{family.jurisdiction || "-"}</div></td>
                      <td>{family.languages.length ? family.languages.map(languageLabel).join(" / ") : "-"}</td>
                      <td>{latest ? `รุ่น ${latest.version_no}` : "-"}<div className={styles.muted}>{family.versionCount} เวอร์ชัน</div></td>
                      <td>{latest ? <StatusBadge status={latest.status} /> : <span className={styles.muted}>ยังไม่มีเวอร์ชัน</span>}</td>
                      <td><RiskBadge risk={family.riskLevel} /></td>
                      <td>{formatDateTime(latest?.reviewed_at || latest?.published_at || latest?.updated_at || family.updated_at)}</td>
                      <td><Link href={`/settings/document-clauses/${family.id}`} className={styles.linkButton}>เปิดข้อสัญญา</Link></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </DocumentPlatformPage>
  );
}

function metadataText(metadata: JsonObject | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}
