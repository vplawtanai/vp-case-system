"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

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
import NotesSection from "./components/NotesSection";

/* =========================================================
   TYPES
========================================================= */

type CaseItem = {
  id?: number;

  // Supabase / DB fields
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

  // Old camelCase fields, kept for compatibility
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

  // old fields, not used in Phase 1 but kept to avoid breaking existing components
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

/* =========================================================
   STYLE
========================================================= */

const pageStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: "system-ui",
  maxWidth: 1440,
  margin: "0 auto",
};

const sectionWrapStyle: React.CSSProperties = {
  scrollMarginTop: 120,
  marginBottom: 24,
};

const backLinkStyle: React.CSSProperties = {
  marginBottom: 8,
};

const fileNoTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: 24,
  fontWeight: 700,
};

const subHeaderStyle: React.CSSProperties = {
  marginTop: -8,
  marginBottom: 20,
  color: "#555",
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
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

  const didScrollRef = useRef(false);

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

        /*
          สำคัญ:
          ส่งข้อมูลไปทั้ง snake_case และ camelCase
          เพื่อให้ CaseInfoSection รุ่นเดิม/รุ่นใหม่อ่านได้หมด
        */
        const mappedCase: CaseItem = {
          // raw DB fields
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

          // camelCase compatibility
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

          // old fields, kept only for compatibility
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

  /* =========================================================
     RENDER STATES
  ========================================================= */

  if (loading) {
    return <main style={pageStyle}>Loading...</main>;
  }

  if (!caseItem) {
    return (
      <main style={pageStyle}>
        <p style={backLinkStyle}>
          <Link href="/cases">← Back to Cases</Link>
        </p>
        <div>Case not found.</div>
      </main>
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <main style={pageStyle}>
      <p style={backLinkStyle}>
        <Link href="/cases">← Back to Cases</Link>
      </p>

      <h1 style={fileNoTitleStyle}>{caseItem.file_no || caseItem.fileNo || "-"}</h1>

      <div style={subHeaderStyle}>
        <span>Client: {caseItem.client_name || caseItem.clientName || "-"}</span>
        <span>Owner: {caseItem.owner_name || caseItem.ownerName || "-"}</span>
        <span>Status: {caseItem.status || caseItem.caseStatus || "-"}</span>
      </div>

      <CaseSectionNav />

      <div id="info" style={sectionWrapStyle}>
        <CaseInfoSection caseId={id} caseItem={caseItem} />
      </div>

      <div id="parties" style={sectionWrapStyle}>
        <PartiesSection caseId={caseIdNumber} />
      </div>

      <div id="timeline" style={sectionWrapStyle}>
        <TimelineSection caseId={id} timeline={timeline} />
      </div>

     <div id="judgments" style={sectionWrapStyle}>
       <JudgmentsSection caseId={id} />
     </div>

     <div id="enforcement" style={sectionWrapStyle}>
      <EnforcementSection caseId={id} />
     </div>

      <div id="tasks" style={sectionWrapStyle}>
        <TasksSection caseId={id} tasks={tasks} />
      </div>

      <div id="deadlines" style={sectionWrapStyle}>
  	<DeadlinesSection caseId={id} />
      </div>

      <div id="timelogs" style={sectionWrapStyle}>
       <TimeLogsSection caseId={id} />
      </div>

      <div id="fees" style={sectionWrapStyle}>
        <FeesSection caseId={id} fees={fees} />
      </div>

     <div id="notes" style={sectionWrapStyle}>
      <NotesSection caseId={id} />
     </div>
    </main>
  );
}