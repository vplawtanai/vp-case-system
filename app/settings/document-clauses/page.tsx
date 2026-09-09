"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { uiMessage, type UiMessage } from "../../../lib/i18n/core";

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
  const { t, text, locale } = useI18n();
  const router = useRouter();
  const access = useDocumentPlatformAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<UiMessage | string>("");
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
      setErrorText(uiMessage("settings.documents.clauses.error.load"));
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
        setErrorText(uiMessage("settings.documents.clauses.error.versions"));
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
      displayName: metadataText(family.metadata_json, "display_name_th") || latestVersion?.title || t("settings.documents.clauses.untitled"),
      latestVersion,
      versionCount: familyVersions.length,
      languages: Array.from(new Set(familyVersions.map((version) => version.language_code))).sort(),
      statuses: Array.from(new Set(familyVersions.map((version) => version.status))),
      riskLevel: metadataText(latestVersion?.metadata_json, "risk_level") || "informational",
    };
  }), [families, versions, t]);

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
      setErrorText(uiMessage("settings.documents.clauses.validation.identity"));
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
        ? uiMessage("settings.documents.clauses.error.duplicate")
        : uiMessage("settings.documents.clauses.error.create"));
      setSaving(false);
      return;
    }

    setNewFamily(initialFamily);
    setShowCreate(false);
    setSaving(false);
    router.push(`/settings/document-clauses/${data}`);
  };

  return (
    <DocumentPlatformPage title={t("settings.documents.title")} subtitle={t("settings.documents.nav.clauses")}>
      <AccessState access={access} />
      {access.allowed ? (
        <>
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>{t("settings.documents.nav.clauses")}</h1>
              <p className={styles.pageDescription}>{t("settings.documents.clauses.description")}</p>
            </div>
            <div className={styles.actionRow}>
              <button type="button" className={styles.button} onClick={() => void loadClauses()} disabled={loading}>{t("settings.documents.actions.refresh")}</button>
              <button type="button" className={styles.buttonPrimary} onClick={() => setShowCreate((current) => !current)}>{t("settings.documents.clauses.create")}</button>
            </div>
          </header>

          <div className={styles.notice}>{t("settings.documents.clauses.publishedOnly")}</div>

          {showCreate ? (
            <section className={styles.formPanel}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>{t("settings.documents.clauses.create")}</h2>
                  <div className={styles.helperText}>{t("settings.documents.clauses.createHelp")}</div>
                </div>
                <button type="button" className={styles.button} onClick={() => setShowCreate(false)}>{t("settings.documents.actions.close")}</button>
              </div>
              <div className={styles.formGrid}>
                <label className={styles.field}>{t("settings.documents.clauses.code")}<input className={styles.input} value={newFamily.clauseCode} onChange={(event) => setNewFamily({ ...newFamily, clauseCode: event.target.value.toUpperCase() })} placeholder={t("settings.documents.clauses.codePlaceholder")} />
                </label>
                <label className={styles.fieldWide}>{t("settings.documents.clauses.nameTh")}<input className={styles.input} value={newFamily.displayNameTh} onChange={(event) => setNewFamily({ ...newFamily, displayNameTh: event.target.value })} />
                </label>
                <label className={styles.field}>{t("settings.documents.fields.category")}<input className={styles.input} value={newFamily.category} onChange={(event) => setNewFamily({ ...newFamily, category: event.target.value })} />
                </label>
                <label className={styles.field}>{t("settings.documents.fields.jurisdiction")}<input className={styles.input} value={newFamily.jurisdiction} onChange={(event) => setNewFamily({ ...newFamily, jurisdiction: event.target.value })} />
                </label>
              </div>
              <div className={styles.actionRow}>
                <button type="button" className={styles.buttonPrimary} onClick={() => void createFamily()} disabled={saving || !newFamily.clauseCode.trim() || !newFamily.displayNameTh.trim()}>{saving ? t("settings.documents.state.creating") : t("settings.documents.clauses.createOpen")}</button>
                <button type="button" className={styles.button} onClick={() => { setNewFamily(initialFamily); setShowCreate(false); }}>{t("settings.documents.actions.cancel")}</button>
              </div>
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={styles.filterBar}>
              <label className={styles.fieldWide}>{t("settings.documents.filter.search")}<input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("settings.documents.clauses.searchPlaceholder")} />
              </label>
              <label className={styles.field}>{t("settings.documents.fields.status")}<select className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">{t("settings.documents.filter.allStatuses")}</option><option value="draft">{t("settings.documents.clauses.draft")}</option><option value="under_review">{t("settings.documents.status.under_review")}</option><option value="published">{t("settings.documents.status.published")}</option><option value="retired">{t("settings.documents.status.retired")}</option><option value="no_version">{t("settings.documents.state.noVersion")}</option>
                </select>
              </label>
              <label className={styles.field}>{t("settings.documents.fields.language")}<select className={styles.select} value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
                  <option value="all">{t("settings.documents.filter.allLanguages")}</option><option value="th">{t("settings.documents.language.th")}</option><option value="en">{t("settings.documents.language.en")}</option>
                </select>
              </label>
              <label className={styles.field}>{t("settings.documents.fields.category")}<select className={styles.select} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">{t("settings.documents.filter.allCategories")}</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>
          </section>

          {errorText ? <div className={styles.error}>{text(errorText)}</div> : null}
          {loading ? <div className={styles.emptyState}>{t("settings.documents.clauses.loading")}</div> : null}
          {!loading && !errorText && rows.length === 0 ? <div className={styles.emptyState}>{t("settings.documents.clauses.empty")}</div> : null}
          {!loading && rows.length > 0 && filteredRows.length === 0 ? <div className={styles.emptyState}>{t("settings.documents.clauses.noMatches")}</div> : null}

          {!loading && filteredRows.length > 0 ? (
            <section className={styles.surface}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>{t("settings.documents.clauses.standardClause")}</th><th>{t("settings.documents.fields.categoryJurisdiction")}</th><th>{t("settings.documents.fields.language")}</th><th>{t("settings.documents.fields.latestVersion")}</th><th>{t("settings.documents.fields.status")}</th><th>{t("settings.documents.fields.risk")}</th><th>{t("settings.documents.fields.reviewedPublished")}</th><th>{t("settings.documents.fields.actions")}</th></tr></thead>
                  <tbody>{filteredRows.map((family) => {
                    const latest = family.latestVersion;
                    return <tr key={family.id}>
                      <td><div className={styles.primaryText}>{family.displayName}</div><div className={styles.codeText}>{family.clause_code}</div><StatusBadge status={family.is_active ? "active" : "inactive"} /></td>
                      <td>{family.category || "-"}<div className={styles.muted}>{family.jurisdiction || "-"}</div></td>
                      <td>{family.languages.length ? family.languages.map((language) => languageLabel(language, locale)).join(" / ") : "-"}</td>
                      <td>{latest ? t("settings.documents.count.version", { number: latest.version_no }) : "-"}<div className={styles.muted}>{t("settings.documents.count.versions", { count: family.versionCount })}</div></td>
                      <td>{latest ? <StatusBadge status={latest.status} /> : <span className={styles.muted}>{t("settings.documents.state.noVersion")}</span>}</td>
                      <td><RiskBadge risk={family.riskLevel} /></td>
                      <td>{formatDateTime(latest?.reviewed_at || latest?.published_at || latest?.updated_at || family.updated_at, locale)}</td>
                      <td><Link href={`/settings/document-clauses/${family.id}`} className={styles.linkButton}>{t("settings.documents.clauses.open")}</Link></td>
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
