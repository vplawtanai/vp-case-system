"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissions, UserRole } from "../../../lib/permissions";
import CaseSectionNav from "../../components/CaseSectionNav";
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

/* =========================================================
   TYPES
========================================================= */

type CaseItem = {
  id?: number;

  file_no?: string | null;
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

type FeeItem = {
  id: string;
  feeType?: string;
  description?: string;
  amount?: number;
  paidAmount?: number;
  dueDate?: string;
  status?: string;
  note?: string;
};

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
};

/* =========================================================
   STYLE
========================================================= */

const pageStyle: React.CSSProperties = {
  padding: "clamp(12px, 2.5vw, 24px)",
  fontFamily: "system-ui",
  maxWidth: 1280,
  margin: "0 auto",
  background: "#ffffff",
};

const sectionWrapStyle: React.CSSProperties = {
  scrollMarginTop: 100,
  marginBottom: 18,
};

const backLinkStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 10,
  fontSize: 14,
  fontWeight: 700,
};

const caseHeaderCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  padding: "clamp(14px, 2.2vw, 20px)",
  background: "#ffffff",
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  marginBottom: 14,
};

const caseHeaderTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
};

const fileNoTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(26px, 4vw, 38px)",
  fontWeight: 900,
  letterSpacing: "-0.04em",
  color: "#111111",
  lineHeight: 1.05,
};

const caseTitleStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#333333",
  fontSize: "clamp(14px, 2.2vw, 16px)",
  fontWeight: 700,
  lineHeight: 1.5,
};

const caseMetaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const metaBoxStyle: React.CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#fafafa",
  minWidth: 0,
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#777777",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 4,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111111",
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const statusPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 11px",
  borderRadius: 999,
  background: "#e6f4ea",
  color: "#067647",
  border: "1px solid #b9dfc3",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const backToTopButtonStyle: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  zIndex: 80,
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #cccccc",
  background: "#000000",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 900,
  boxShadow: "0 8px 24px rgba(0,0,0,0.20)",
};

/* =========================================================
   MAIN PAGE
========================================================= */

export default function CaseDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const caseIdNumber = Number(id);

  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [timeline] = useState<TimelineItem[]>([]);
  const [tasks] = useState<TaskItem[]>([]);
  const [fees] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const didScrollRef = useRef(false);

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
     LOAD CASE FROM SUPABASE
  ========================================================= */

  useEffect(() => {
    if (!id) return;
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    didScrollRef.current = false;

    const loadCase = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("cases")
          .select("*")
          .eq("id", caseIdNumber)
          .single();

        console.log("CASE DATA:", data);
        console.log("CASE ERROR:", error);

        if (error || !data) {
          console.error("LOAD CASE ERROR:", error);
          setCaseItem(null);
          return;
        }

        const mappedCase: CaseItem = {
          id: data.id,
          file_no: data.file_no,
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
  }, [id, caseIdNumber]);

  /* =========================================================
     SCROLL TO HASH
  ========================================================= */

  useEffect(() => {
    if (loading) return;
    if (didScrollRef.current) return;

    const hash = window.location.hash;
    if (!hash) return;

    const timer = setTimeout(() => {
      const el = document.querySelector(hash);

      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        didScrollRef.current = true;
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [loading]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /* =========================================================
     RENDER STATES
  ========================================================= */

  if (loading) {
    return (
      <AuthGuard>
        <main style={pageStyle}>Loading...</main>
      </AuthGuard>
    );
  }

  if (!caseItem) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <p style={backLinkStyle}>
            <Link href="/cases">← Back to Cases</Link>
          </p>

          <div>Case not found.</div>

          <button type="button" onClick={scrollToTop} style={backToTopButtonStyle}>
            ↑ Top
          </button>
        </main>
      </AuthGuard>
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <p style={backLinkStyle}>
          <Link href="/cases">← Back to Cases</Link>
        </p>

        <div style={caseHeaderCardStyle}>
          <div style={caseHeaderTopStyle}>
            <div>
              <h1 style={fileNoTitleStyle}>
                {caseItem.file_no || caseItem.fileNo || "-"}
              </h1>

              <div style={caseTitleStyle}>{caseItem.title || "-"}</div>
            </div>

            <span style={statusPillStyle}>
              {caseItem.status || caseItem.caseStatus || "-"}
            </span>
          </div>

          <div style={caseMetaGridStyle}>
            <div style={metaBoxStyle}>
              <div style={metaLabelStyle}>Client</div>
              <div style={metaValueStyle}>
                {caseItem.client_name || caseItem.clientName || "-"}
              </div>
            </div>

            <div style={metaBoxStyle}>
              <div style={metaLabelStyle}>Owner</div>
              <div style={metaValueStyle}>
                {caseItem.owner_name || caseItem.ownerName || "-"}
              </div>
            </div>

            <div style={metaBoxStyle}>
              <div style={metaLabelStyle}>Court</div>
              <div style={metaValueStyle}>
                {caseItem.court_name || caseItem.courtName || "-"}
              </div>
            </div>

            <div style={metaBoxStyle}>
              <div style={metaLabelStyle}>Black Case No.</div>
              <div style={metaValueStyle}>
                {caseItem.case_number || caseItem.caseNumber || "-"}
              </div>
            </div>
          </div>

        </div>

        <CaseSectionNav canViewFees={permissions.canViewFees} />

        <div id="info" style={sectionWrapStyle}>
          <CaseInfoSection
            caseId={id}
            caseItem={caseItem}
            canEdit={permissions.canEditCaseInfo}
          />
        </div>

        <div id="parties" style={sectionWrapStyle}>
          <PartiesSection
            caseId={caseIdNumber}
            canEdit={permissions.canEditParties}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div id="timeline" style={sectionWrapStyle}>
          <TimelineSection
            caseId={id}
            timeline={timeline}
            canEdit={permissions.canEditTimeline}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div id="judgments" style={sectionWrapStyle}>
          <JudgmentsSection
            caseId={id}
            canEdit={permissions.canEditJudgments}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div id="enforcement" style={sectionWrapStyle}>
          <EnforcementSection
            caseId={id}
            canEdit={permissions.canEditEnforcement}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div id="tasks" style={sectionWrapStyle}>
          <TasksSection
            caseId={id}
            tasks={tasks}
            canEdit={permissions.canEditTasks}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div id="deadlines" style={sectionWrapStyle}>
          <DeadlinesSection
            caseId={id}
            canEdit={permissions.canEditDeadlines}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        <div id="timelogs" style={sectionWrapStyle}>
          <TimeLogsSection
            caseId={id}
            canEdit={permissions.canEditTimeLogs}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        {permissions.canViewFees && (
          <div id="fees" style={sectionWrapStyle}>
            <FeesSection
              caseId={id}
              fees={fees}
              canEdit={permissions.canEditFees}
              canDelete={permissions.canSoftDelete}
            />
          </div>
        )}

        <div id="notes" style={sectionWrapStyle}>
          <NotesSection
            caseId={id}
            canEdit={permissions.canEditNotes}
            canDelete={permissions.canSoftDelete}
          />
        </div>

        {permissions.canViewHistory && (
          <div id="history" style={sectionWrapStyle}>
            <AuditLogSection caseId={id} canRestore={permissions.canRestore} />
          </div>
        )}

        <button type="button" onClick={scrollToTop} style={backToTopButtonStyle}>
          ↑ Top
        </button>
      </main>
    </AuthGuard>
  );
}
