"use client";

import AuthGuard from "../components/AuthGuard";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Plus, Search, SlidersHorizontal, FolderOpen, Clock3, CalendarDays, CalendarClock, CalendarRange, ShieldCheck, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import AppTopNav from "../components/AppTopNav";
import DetailModal from "../components/DetailModal";
import { PageHeader, FieldGroup, Callout, EmptyState } from "../components/ui/patterns";
import ui from "../components/ui/vp-ui.module.css";
import css from "./cases.module.css";
import { useI18n } from "../../lib/i18n/provider";
import { buildPermissions, type UserPermissions } from "../../lib/permissions";
import { getDueStatusScore } from "../../lib/dueStatus";
import { buildAlertCandidates, buildAlertMapFromCandidates, casePreview, type CaseItem, type CaseTask, type CaseDeadline, type CaseTimeline, type CaseEnforcement, type AlertCandidate, type RiskFilter, type RiskLevel, type SortMode, type ClientOption, type UserProfile } from "./case-list-model";
import { caseText, caseTerm, type CaseLabel } from "./labels";
import { CaseList, CaseQuickViewBody, RiskBadge } from "./CaseListView";

export default function CasesPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = (key: CaseLabel, values: Record<string, string | number> = {}) => caseText(locale, key, values);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<{ tasks: CaseTask[]; deadlines: CaseDeadline[]; timeline: CaseTimeline[] }>({ tasks: [], deadlines: [], timeline: [] });
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedCreateClientId, setSelectedCreateClientId] = useState("");
  const [showAddCaseForm, setShowAddCaseForm] = useState(false);
  const [alertItems, setAlertItems] = useState<AlertCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);


  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [clientFilter, setClientFilter] = useState("All");
  const [storageFilter, setStorageFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("highestRisk");

  /* =========================================================
     LOAD CURRENT USER PROFILE / PERMISSIONS
  ========================================================= */

  useEffect(() => {
    const loadCurrentUserProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setProfile({
          role: "",
          financial_access: false,
        });
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("role, financial_access")
        .eq("id", userData.user.id)
        .single();

      if (error || !data) {
        setProfile({
          role: "",
          financial_access: false,
        });
        return;
      }

      setProfile({
        role: data.role || "",
        financial_access: data.financial_access === true,
      });
    };

    loadCurrentUserProfile();
  }, []);

  /* =========================================================
     LOAD CASES + REAL ALERTS
  ========================================================= */

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);

      const { data: caseData, error: caseError } = await supabase
        .from("cases")
        .select("*")
        .order("created_at", { ascending: false });


      if (caseError) {
        setLoadError(true);
        return;
      }

      const baseCases = (caseData || []) as CaseItem[];
      const caseIds = baseCases.map((c) => c.id);

      if (caseIds.length === 0) {
        setCases([]);
        setAlertItems([]);
        return;
      }

      const [tasksRes, deadlinesRes, timelineRes, enforcementRes] =
        await Promise.all([
          supabase
            .from("case_tasks")
            .select("case_id, task_type, task_other, due_date, status")
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_deadlines")
            .select(
              "case_id, deadline_type, deadline_other, current_due_date, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_timeline")
            .select(
              "case_id, event_type, event_date, event_time, appointment_type, appointment_other, order_no, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),

          supabase
            .from("case_enforcements")
            .select(
              "case_id, party_label, party_other, final_due_date, writ_request_date, writ_issued_date, status"
            )
            .in("case_id", caseIds)
            .is("deleted_at", null),
        ]);

      if (tasksRes.error || deadlinesRes.error || timelineRes.error || enforcementRes.error) {
        setLoadError(true);
        return;
      }

      const tasks = (tasksRes.data || []) as CaseTask[];
      const deadlines = (deadlinesRes.data || []) as CaseDeadline[];
      const timeline = (timelineRes.data || []) as CaseTimeline[];
      const enforcements = (enforcementRes.data || []) as CaseEnforcement[];

      setPreviewData({ tasks, deadlines, timeline });

      const allAlerts = buildAlertCandidates(
        tasks,
        deadlines,
        timeline,
        enforcements
      );

      const alertMap = buildAlertMapFromCandidates(allAlerts);

      setAlertItems(allAlerts);

      const enrichedCases = baseCases.map((item) => {
        const alerts = alertMap.get(item.id) || [];
        const alert = alerts[0];

        if (!alert) {
          return {
            ...item,
            risk_level: "clear" as RiskLevel,
            next_alert_text: "-",
            next_alert_date: "",
            next_alerts: [],
          };
        }

        return {
          ...item,
          risk_level: alert.level,
          next_alert_text: alert.text,
          next_alert_date: alert.date,
          next_alerts: alerts,
        };
      });

      setCases(enrichedCases);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    const loadClients = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("LOAD CLIENTS ERROR:", error);
        return;
      }

      setClients((data || []) as ClientOption[]);
    };

    loadClients();
  }, []);

  /* =========================================================
     CREATE CASE WITH AUTO FILE NO
  ========================================================= */

  const createCase = async () => {
    if (!permissions.canCreateCase) {
      alert(t("denied"));
      return;
    }

    const confirmed = window.confirm(
      t("confirmCreate")
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const selectedClient =
        clients.find((item) => item.id === selectedCreateClientId) || null;

      const { data: createdCase, error } = await supabase.rpc(
        "create_case_with_number",
        { p_client_id: selectedClient?.id || null }
      );

      if (error || !createdCase) {
        alert(t("createFailed"));
        return;
      }

      alert(`${t("created")}\n${t("fileNo")}: ${createdCase.file_no}`);

      setSelectedCreateClientId("");
      setShowAddCaseForm(false);
      await fetchCases();

      router.push(`/cases/${createdCase.id}`);
    } catch (err: unknown) {
      console.error("CREATE CASE ERROR:", err);
      alert(t("createFailed"));
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     RISK LOGIC
  ========================================================= */



  /* =========================================================
     FILTER OPTIONS
  ========================================================= */

  const owners = useMemo(() => {
    const values = cases
      .map((c) => c.owner_name)
      .filter((v): v is string => !!v && v.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const statuses = useMemo(() => {
    const values = cases
      .map((c) => c.status)
      .filter((v): v is string => !!v && v.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const phases = useMemo(() => {
    const values = cases
      .map((c) => c.phase)
      .filter((v): v is string => !!v && v.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const storages = useMemo(() => {
    const values = cases
      .map((c) => c.physical_storage_type)
      .filter((v): v is string => !!v && v.trim() !== "");

    return ["All", ...Array.from(new Set(values))];
  }, [cases]);

  const clearFilters = () => {
    setSearchText("");
    setStatusFilter("All");
    setPhaseFilter("All");
    setOwnerFilter("All");
    setClientFilter("All");
    setStorageFilter("All");
    setRiskFilter("all");
    setSortMode("highestRisk");
  };

  /* =========================================================
     FILTERED CASES
  ========================================================= */

  const filteredCases = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    let result = cases.filter((c) => {
      const searchableText = [
        c.file_no,
        c.title,
        c.client_name,
        c.owner_name,
        c.court_name,
        c.case_number,
        c.next_alert_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchSearch = !keyword || searchableText.includes(keyword);
      const matchStatus = statusFilter === "All" || c.status === statusFilter;
      const matchPhase = phaseFilter === "All" || c.phase === phaseFilter;
      const matchOwner = ownerFilter === "All" || c.owner_name === ownerFilter;
      const matchClient =
        clientFilter === "All" ||
        (clientFilter === "__no_client__" ? !c.client_id : c.client_id === clientFilter);
      const matchStorage =
        storageFilter === "All" || c.physical_storage_type === storageFilter;
      const matchRisk = riskFilter === "all" || (c.risk_level || "clear") === riskFilter;

      return (
        matchSearch &&
        matchStatus &&
        matchPhase &&
        matchOwner &&
        matchClient &&
        matchStorage &&
        matchRisk
      );
    });

    result = [...result].sort((a, b) => {
      if (sortMode === "highestRisk") {
        const riskDiff =
          getDueStatusScore((a.risk_level || "clear")) - getDueStatusScore((b.risk_level || "clear"));
        if (riskDiff !== 0) return riskDiff;

        return (a.next_alert_date || "9999-12-31").localeCompare(
          b.next_alert_date || "9999-12-31"
        );
      }

      if (sortMode === "latestUpdated") {
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      }

      if (sortMode === "fileNo") {
        return (a.file_no || "").localeCompare(b.file_no || "");
      }

      if (sortMode === "nextAlertDate") {
        return (a.next_alert_date || "9999-12-31").localeCompare(
          b.next_alert_date || "9999-12-31"
        );
      }

      return 0;
    });

    return result;
  }, [
    cases,
    searchText,
    statusFilter,
    phaseFilter,
    ownerFilter,
    clientFilter,
    storageFilter,
    riskFilter,
    sortMode,
  ]);

  /* =========================================================
     SUMMARY
  ========================================================= */

  const summary = useMemo(() => {
    const overdue = alertItems.filter((item) => item.level === "overdue").length;
    const today = alertItems.filter((item) => item.level === "today").length;
    const dueSoon = alertItems.filter((item) => item.level === "dueSoon").length;
    const upcoming = alertItems.filter((item) => item.level === "upcoming").length;
    const planned = alertItems.filter((item) => item.level === "planned").length;

    const caseIdsWithAlert = new Set(alertItems.map((item) => item.case_id));
    const clear = cases.filter((item) => !caseIdsWithAlert.has(item.id)).length;
    const active = cases.filter((item) => item.status === "Active").length;

    return {
      total: cases.length,
      active,
      overdue,
      today,
      dueSoon,
      upcoming,
      planned,
      clear,
    };
  }, [cases, alertItems]);

  const selected = cases.find(c => c.id === selectedId);
  const metricItems = [
    { key: "all", label: "total", count: summary.total, unit: "caseUnit", Icon: FolderOpen },
    { key: "overdue", label: "overdue", count: summary.overdue, unit: "itemUnit", Icon: Clock3 },
    { key: "today", label: "today", count: summary.today, unit: "itemUnit", Icon: CalendarDays },
    { key: "dueSoon", label: "dueSoon", count: summary.dueSoon, unit: "soonRange", Icon: CalendarClock },
    { key: "upcoming", label: "upcoming", count: summary.upcoming, unit: "upcomingRange", Icon: CalendarDays },
    { key: "planned", label: "planned", count: summary.planned, unit: "plannedRange", Icon: CalendarRange },
    { key: "clear", label: "clear", count: summary.clear, unit: "caseUnit", Icon: ShieldCheck },
  ] as const;
  function options(values: string[], translate = true) {
    return values.map(value => <option key={value} value={value}>{value === "All" ? t("all") : translate ? caseTerm(value,locale) : value}</option>);
  }
  return <AuthGuard><main className={`${ui.scope} ${css.page}`}>
    <AppTopNav title={t("cases")} activePage="cases"/>
    <div className={css.workspace}>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<div className={css.actions}>
        <button type="button" className={ui.secondary} disabled={loading} onClick={() => void fetchCases()}><RefreshCw size={16}/>{t(loading ? "refreshing" : "refresh")}</button>
        {permissions.canCreateCase && <button type="button" className={ui.primary} disabled={saving} onClick={() => setShowAddCaseForm(true)}><Plus size={18}/>{t("add")}</button>}
      </div>}/>
      <section className={css.summary} aria-label={t("title")}>
        {metricItems.map(({ key, label, count, unit, Icon }) => <button type="button" className={css.metric} key={key} data-tone={key} aria-pressed={riskFilter === key} onClick={() => setRiskFilter(key)}>
          <span className={css.metricIcon}><Icon size={23}/></span><div><h2>{t(label)}</h2><strong>{count}</strong><small>{t(unit)}</small></div>
        </button>)}
      </section>
      <section className={`${css.panel} ${css.filters}`} aria-label={t("filters")}>
        <div className={css.filterGrid}>
          <div className={ui.field}><label htmlFor="case-search">{t("search")}</label><div className={css.search}><Search size={17}/><input id="case-search" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder={t("searchHint")} type="search"/></div></div>
          <FieldGroup id="case-risk" label={t("risk")}><select value={riskFilter} onChange={e => setRiskFilter(e.target.value as RiskFilter)}>{(["all","overdue","today","dueSoon","upcoming","planned","future","clear"] as const).map(k => <option key={k} value={k}>{t(k)}</option>)}</select></FieldGroup>
          <FieldGroup id="case-status" label={t("status")}><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>{options(statuses)}</select></FieldGroup>
          <FieldGroup id="case-phase" label={t("phase")}><select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)}>{options(phases)}</select></FieldGroup>
          <FieldGroup id="case-owner" label={t("owner")}><select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>{options(owners,false)}</select></FieldGroup>
        </div>
        <div className={css.filterFoot}><button type="button" className={css.textButton} aria-expanded={showMoreFilters} aria-controls="case-extra-filters" onClick={() => setShowMoreFilters(!showMoreFilters)}><SlidersHorizontal size={14}/>{t("moreFilters")}</button><button type="button" className={css.textButton} onClick={clearFilters}>{t("clearFilters")}</button></div>
        <div id="case-extra-filters" hidden={!showMoreFilters}>{showMoreFilters && <div className={css.extraFilters}>
          <FieldGroup id="case-client" label={t("client")}><select value={clientFilter} onChange={e => setClientFilter(e.target.value)}><option value="All">{t("all")}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__no_client__">{t("noClient")}</option></select></FieldGroup>
          <FieldGroup id="case-storage" label={t("storage")}><select value={storageFilter} onChange={e => setStorageFilter(e.target.value)}>{options(storages)}</select></FieldGroup>
          <FieldGroup id="case-sort" label={t("sort")}><select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>{(["highestRisk","latestUpdated","fileNo","nextAlertDate"] as const).map(k => <option key={k} value={k}>{t(k)}</option>)}</select></FieldGroup>
        </div>}</div>
      </section>
      {loadError && <Callout tone="negative" role="alert">{t("loadFailed")}</Callout>}
      <section className={css.panel} aria-label={t("list")} aria-busy={loading}>
        <div className={css.listHead}><div><h2>{t("list")}</h2><p aria-live="polite">{t("results",{shown:filteredCases.length,total:cases.length})}</p></div>{riskFilter !== "all" && <RiskBadge level={riskFilter}/>}</div>
        {loading ? <div className={css.empty}><EmptyState>{t("loading")}</EmptyState></div> : filteredCases.length ? <CaseList cases={filteredCases} onPreview={c => setSelectedId(c.id)}/> : <div className={css.empty}><EmptyState>{t("empty")}</EmptyState></div>}
      </section>
    </div>
    <DetailModal open={!!selected} title={t("preview")} size="edit" className={css.modal} closeLabel={t("close")} onClose={() => setSelectedId(null)} footer={selected && <div className={css.modalFooter}><button type="button" className={ui.secondary} onClick={() => setSelectedId(null)}>{t("close")}</button><Link className={ui.primary} href={`/cases/${selected.id}`}>{t("openFull")}<ArrowRight size={16}/></Link></div>}>
      {selected && <CaseQuickViewBody item={selected} preview={casePreview(selected.id,previewData.tasks,previewData.deadlines,previewData.timeline)}/>}
    </DetailModal>
    <DetailModal open={permissions.canCreateCase && showAddCaseForm} title={t("add")} subtitle={t("createHint")} size="edit" onClose={() => { if (!saving) {setShowAddCaseForm(false);setSelectedCreateClientId("");} }} footer={<div className={css.modalFooter}><button type="button" className={ui.secondary} disabled={saving} onClick={() => {setShowAddCaseForm(false);setSelectedCreateClientId("");}}>{t("cancel")}</button><button type="button" className={ui.primary} disabled={saving} onClick={() => void createCase()}>{t(saving ? "creating" : "create")}</button></div>}>
      <div className={css.createForm}><FieldGroup id="new-case-client" label={t("client")} help={!clients.length ? t("noClients") : undefined}><select value={selectedCreateClientId} onChange={e => setSelectedCreateClientId(e.target.value)}><option value="">{t("noClient")}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FieldGroup></div>
    </DetailModal>
  </main></AuthGuard>;
}
