"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissions, UserRole } from "../../../lib/permissions";
import { FolderOpen, Landmark, UserRound, Building2, CalendarDays, Clock3 } from "lucide-react";
import CaseCore from "./CaseCore";
import { CaseStatus } from "../CaseListView";
import { useCaseDetailText } from "./labels";
import css from "./case-detail.module.css";
import CaseInfoSection from "./components/CaseInfoSection";
import PartiesSection from "./components/PartiesSection";
import TimelineSection from "./components/TimelineSection";
import JudgmentsSection from "./components/JudgmentsSection";
import EnforcementSection from "./components/EnforcementSection";
import TasksSection from "./components/TasksSection";
import DeadlinesSection from "./components/DeadlinesSection";
import TimeLogsSection from "./components/TimeLogsSection";
import FeesSection from "./components/FeesSection";
import AuditLogSection from "./components/AuditLogSection";
import AuthGuard from "../../components/AuthGuard";
import NotesSection from "./components/NotesSection";
import AppTopNav from "../../components/AppTopNav";
import FinanceQuotationsSection from "../../components/FinanceQuotationsSection";

/* =========================================================
   TYPES
========================================================= */

type CaseItem = {
  id?: number;

  file_no?: string | null;
  client_id?: string | null;
  title?: string | null;
  client_name?: string | null;
  court_name?: string | null;
  case_number?: string | null;
  phase?: string | null;
  status?: string | null;
  owner_name?: string | null;

  case_type?: string | null;
  case_subtype?: string | null;
  issue_text?: string | null;
  claim_amount?: string | null;
  note_text?: string | null;
  physical_storage_type?: string | null;
  physical_storage_detail?: string | null;

  created_at?: string | null;
  updated_at?: string | null;

  fileNo?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  courtName?: string | null;
  caseNumber?: string | null;
  caseStatus?: string | null;
  ownerName?: string | null;
  caseType?: string | null;
  caseSubtype?: string | null;
  issueText?: string | null;
  claimAmount?: string | null;
  noteText?: string | null;
  physicalStorageType?: string | null;
  physicalStorageDetail?: string | null;

  judgmentFirstInstance?: string | null;
  judgmentAppeal?: string | null;
  judgmentSupreme?: string | null;

  enforcementPeriodDays?: string | null;
  enforcementNoticeResult?: string | null;
  enforcementNoticeMethod?: string | null;
  enforcementNoticeDate?: string | null;
  enforcementDueDate?: string | null;
  enforcementReadyText?: string | null;
  enforcementIssued?: boolean | null;
  enforcementIssuedDate?: string | null;

  serviceRule?: "civilOrdinary" | "summaryOrSimple" | "consumer" | "other";
};

type TimelineItem = {
  id: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  appointment?: string;
  done?: boolean;
};

type TaskItem = {
  id: string;
  title?: string;
  assigneeName?: string;
  startDate?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  done?: boolean;
};

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  can_manage_finance_billable_charges?: boolean | null;
};

type ClientOption = {
  id: string;
  name: string;
};

export default function CaseDetailPage() {
  const { tr, date } = useCaseDetailText();
  const [section, setSection] = useState("info");
  const [revision, setRevision] = useState(0);
  const params = useParams();
  const id = params?.id as string;
  const caseIdNumber = Number(id);

  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [timeline] = useState<TimelineItem[]>([]);
  const [tasks] = useState<TaskItem[]>([]);
  const [hasLegacyFees, setHasLegacyFees] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const navigateSection = (next: string) => {
    if (next === "fees") next = "history";
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
  };
  useEffect(() => {
    const syncHash = () => { const hash = window.location.hash.slice(1); setSection(hash === "fees" ? "history" : hash || "info"); };
    const refresh = () => setRevision(value => value + 1);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("case-detail-updated", refresh);
    return () => { window.removeEventListener("hashchange", syncHash); window.removeEventListener("case-detail-updated", refresh); };
  }, []);

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
        .select("role, financial_access, can_manage_finance_billable_charges")
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
        can_manage_finance_billable_charges: data.can_manage_finance_billable_charges === true,
      });
    };

    loadCurrentUserProfile();
  }, []);

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
     LOAD CASE FROM SUPABASE
  ========================================================= */

  useEffect(() => {
    if (!id) return;
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;



    const loadCase = async () => {
      try {
        if (!revision) setLoading(true);

        const { data, error } = await supabase
          .from("cases")
          .select("*")
          .eq("id", caseIdNumber)
          .single();




        if (error || !data) {
          console.error("LOAD CASE ERROR:", error);
          setCaseItem(null);
          return;
        }

        const mappedCase: CaseItem = {
          id: data.id,
          file_no: data.file_no,
          client_id: data.client_id,
          title: data.title,
          client_name: data.client_name,
          court_name: data.court_name,
          case_number: data.case_number,
          status: data.status,
          owner_name: data.owner_name,

          case_type: data.case_type,
          case_subtype: data.case_subtype,
          issue_text: data.issue_text,
          claim_amount: data.claim_amount,
          note_text: data.note_text,
          physical_storage_type: data.physical_storage_type,
          physical_storage_detail: data.physical_storage_detail,

          created_at: data.created_at,
          updated_at: data.updated_at,

          fileNo: data.file_no,
          clientId: data.client_id,
          clientName: data.client_name,
          courtName: data.court_name,
          caseNumber: data.case_number,
          phase: data.phase,
          caseStatus: data.status,
          ownerName: data.owner_name,

          caseType: data.case_type,
          caseSubtype: data.case_subtype,
          issueText: data.issue_text,
          claimAmount:
            data.claim_amount !== null && data.claim_amount !== undefined
              ? String(data.claim_amount)
              : "",
          noteText: data.note_text,
          physicalStorageType: data.physical_storage_type,
          physicalStorageDetail: data.physical_storage_detail,

          judgmentFirstInstance: data.judgment_first_instance,
          judgmentAppeal: data.judgment_appeal,
          judgmentSupreme: data.judgment_supreme,

          enforcementPeriodDays: data.enforcement_period_days,
          enforcementNoticeResult: data.enforcement_notice_result,
          enforcementNoticeMethod: data.enforcement_notice_method,
          enforcementNoticeDate: data.enforcement_notice_date,
          enforcementDueDate: data.enforcement_due_date,
          enforcementReadyText: data.enforcement_ready_text,
          enforcementIssued: data.enforcement_issued,
          enforcementIssuedDate: data.enforcement_issued_date,

          serviceRule: data.service_rule,
        };

        setCaseItem(mappedCase);
      } catch (error) {
        console.error("LOAD CASE CATCH ERROR:", error);
        setCaseItem(null);
      } finally {
        setLoading(false);
      }
    };

    loadCase();
  }, [id, caseIdNumber, revision]);

  const linkedClientName = caseItem?.client_id
    ? clients.find((client) => client.id === caseItem.client_id)?.name
    : "";

  const displayClientName =
    linkedClientName || caseItem?.client_name || caseItem?.clientName || "-";

  const tabs = [["info","Overview"],["parties","Parties"],["timeline","Hearings & proceedings"],["judgments","Judgments & Filings"],["enforcement","Enforcement"],["tasks","Tasks"],["deadlines","Legal Deadlines"],["timelogs","Time Logs"],["finance-documents","Finance documents"],["notes","Notes"],...(permissions.canViewHistory || (permissions.canViewFees && hasLegacyFees) ? [["history",permissions.canViewHistory ? "History / Audit Log" : "Legacy history"]] : [])];
  const activeSection = tabs.some(([key]) => key === section) ? section : "info";
  return (
    <AuthGuard><main className={css.page}>
      <AppTopNav title={tr("Case Detail")} subtitle={caseItem?.file_no || ""} activePage="cases"/>
      <nav className={css.breadcrumb} aria-label={tr("Cases")}><Link href="/cases">{tr("Cases")}</Link><span>›</span><strong>{caseItem?.file_no || "—"}</strong></nav>
      {loading ? <p role="status">{tr("Loading...")}</p> : !caseItem ? <p role="alert">{tr("Case not found.")}</p> : <>
      <header className={css.header}>
        <div className={css.identity}>
          <div className={css.identityRow}><div className={css.fileIdentity}><FolderOpen/><div><small>{tr("VP file no.")}</small><strong>{caseItem.file_no || "—"}</strong></div></div><div className={css.courtIdentity}><Landmark/><div><small>{tr("Court / Black case no.")}</small><h1>{caseItem.court_name || tr("Not recorded")}<span>{caseItem.case_number || tr("Not recorded")}</span></h1></div></div></div>
          <small className={css.label}>{tr("Title")}</small><p className={css.title}>{caseItem.title || tr("Not recorded")}</p>
          <div className={css.badges}><CaseStatus value={caseItem.status}/><span>{tr(caseItem.case_type)}</span>{caseItem.case_subtype && <span>{caseItem.case_subtype}</span>}</div>
        </div>
        <dl className={css.facts}>
          {[[Building2,"Client",displayClientName],[UserRound,"Owner",caseItem.owner_name || tr("Not recorded")],[CalendarDays,"Created",date(caseItem.created_at)],[Clock3,"Last updated",date(caseItem.updated_at,true)]].map(([Icon,label,value]) => { const FactIcon = Icon as typeof UserRound; return <div key={String(label)}><FactIcon size={17}/><dt>{tr(String(label))}</dt><dd>{String(value)}</dd></div>; })}
          {permissions.canManageFinanceBillableCharges && caseItem.client_id && <Link className={css.secondary} href={`/finance/billable-charges?new=1&client=${encodeURIComponent(caseItem.client_id)}&case=${encodeURIComponent(String(caseItem.id || id))}`}>{tr("Add billable charge")}</Link>}
        </dl>
      </header>
      <CaseCore caseId={caseIdNumber} revision={revision} canManage={permissions.canEditCaseInfo} canNext={permissions.canEditTasks} onSection={navigateSection}/>
      <nav className={css.tabs} aria-label={tr("Case Detail")}>{tabs.map(([key,label])=><button type="button" key={key} aria-current={activeSection===key ? "page" : undefined} onClick={()=>navigateSection(key)}>{tr(label)}</button>)}</nav>
        <div className={css.section} hidden={activeSection !== "info"}>
          <CaseInfoSection
            caseId={id}
            caseItem={caseItem}
            canEdit={permissions.canEditCaseInfo}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "parties"}>
          <PartiesSection
            caseId={caseIdNumber}
            canEdit={permissions.canEditParties}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "timeline"}>
          <TimelineSection
            caseId={id}
            timeline={timeline}
            canEdit={permissions.canEditTimeline}
            canViewHistory={permissions.canViewHistory}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "judgments"}>
          <JudgmentsSection
            caseId={id}
            canEdit={permissions.canEditJudgments}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "enforcement"}>
          <EnforcementSection
            caseId={id}
            canEdit={permissions.canEditEnforcement}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "tasks"}>
          <TasksSection
            caseId={id}
            tasks={tasks}
            canEdit={permissions.canEditTasks}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "deadlines"}>
          <DeadlinesSection
            caseId={id}
            canEdit={permissions.canEditDeadlines}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "timelogs"}>
          <TimeLogsSection
            caseId={id}
            canEdit={permissions.canEditTimeLogs}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "finance-documents"}>
          <FinanceQuotationsSection caseId={caseIdNumber || id} />
        </div>

        <div className={css.section} hidden={activeSection !== "notes"}>
          <NotesSection
            caseId={id}
            canEdit={permissions.canEditNotes}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div className={css.section} hidden={activeSection !== "history"}>
          {permissions.canViewFees && <FeesSection caseId={id} onAvailability={setHasLegacyFees} />}
          {permissions.canViewHistory && <AuditLogSection caseId={id} canRestore={permissions.canRestore} />}
        </div>

      </>}
    </main></AuthGuard>
  );
}
