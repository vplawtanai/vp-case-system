"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";

import { supabase } from "../../../lib/supabase"; // ✅ เพิ่มตรงนี้

import CaseSectionNav from "../../components/CaseSectionNav";
import CaseAlertsSection from "./components/CaseAlertsSection";
import CaseInfoSection from "./components/CaseInfoSection";
import PartiesSection from "./components/PartiesSection";
import TimelineSection from "./components/TimelineSection";
import TasksSection from "./components/TasksSection";
import TimeLogsSection from "./components/TimeLogsSection";
import DeadlinesSection from "./components/DeadlinesSection";
import ServiceSection from "./components/ServiceSection";
import NotesSection from "./components/NotesSection";
import FeesSection from "./components/FeesSection";

type CaseItem = {
  fileNo?: string;
  title?: string;
  clientName?: string;
  courtName?: string;
  caseNumber?: string;
  phase?: string;
  caseStatus?: string;
  ownerName?: string;
  caseType?: string;
  caseSubtype?: string;
  issueText?: string;
  claimAmount?: string;
  noteText?: string;
  physicalStorageType?: string;
  physicalStorageDetail?: string;

  judgmentFirstInstance?: string;
  judgmentAppeal?: string;
  judgmentSupreme?: string;

  enforcementPeriodDays?: string;
  enforcementNoticeResult?: string;
  enforcementNoticeMethod?: string;
  enforcementNoticeDate?: string;
  enforcementDueDate?: string;
  enforcementReadyText?: string;
  enforcementIssued?: boolean;
  enforcementIssuedDate?: string;

  serviceRule?:
    | "civilOrdinary"
    | "summaryOrSimple"
    | "consumer"
    | "other";
};

type PartyRole = "plaintiff" | "defendant" | "petitioner" | "objector";
type PartyEntityType = "individual" | "company";

type PartyItem = {
  id: string;
  role?: PartyRole;
  entityType?: PartyEntityType;
  title?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  orderNo?: number;
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

type TimeLogItem = {
  id: string;
  workDate?: string;
  staffName?: string;
  minutes?: number;
  note?: string;
};

type DeadlineItem = {
  id: string;
  deadlineType?: string;
  dueDate?: string;
  status?: string;
  note?: string;
  done?: boolean;
};

type ServiceItem = {
  id: string;
  defendantId?: string;
  defendantLabel?: string;
  serviceDate?: string;
  method?: string;
  result?: string;
  answerDeadline?: string;
  note?: string;
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

const sectionWrapStyle: React.CSSProperties = {
  scrollMarginTop: 120,
  marginBottom: 24,
};

export default function CaseDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [parties, setParties] = useState<PartyItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLogItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const didScrollRef = useRef(false);

  // 🔥 แก้เฉพาะตรงนี้ (Firebase → Supabase)
  useEffect(() => {
    if (!id) return;

    didScrollRef.current = false;

    const loadCase = async () => {
      try {
        const { data, error } = await supabase
          .from("cases")
          .select("*")
          .eq("id", id)
          .single();

        if (error) {
          console.error(error);
          setCaseItem(null);
        } else {
          setCaseItem({
            ...data,
            fileNo: data.file_no,
            clientName: data.client_name,
            courtName: data.court_name,
            caseNumber: data.case_number,
            caseStatus: data.status,
            ownerName: data.owner_name,
          });
        }
      } catch (error) {
        console.error(error);
        setCaseItem(null);
      } finally {
        setLoading(false);
      }
    };

    loadCase();
  }, [id]);

  // ❗ ส่วนอื่นยังใช้ Firebase เหมือนเดิม (ยังไม่แตะ)

  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "cases", id, "parties"),
      orderBy("orderNo", "asc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setParties(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as PartyItem[]
      );
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (loading) return;
    if (didScrollRef.current) return;

    const hash = window.location.hash;
    if (!hash) return;

    const timer = setTimeout(() => {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        didScrollRef.current = true;
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return <main style={{ padding: 24 }}>Loading...</main>;
  }

  if (!caseItem) {
    return <main style={{ padding: 24 }}>Case not found.</main>;
  }

  const defendants = parties.filter((p) => p.role === "defendant");

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <p>
        <Link href="/cases">← Back to Cases</Link>
      </p>

      <h1 style={{ marginBottom: 16 }}>{caseItem.fileNo || "-"}</h1>

      <CaseSectionNav />

      <div id="info" style={sectionWrapStyle}>
        <CaseInfoSection caseId={id} caseItem={caseItem} />
      </div>

      <div id="parties" style={sectionWrapStyle}>
        <PartiesSection caseId={id} parties={parties} />
      </div>

      <div id="timeline" style={sectionWrapStyle}>
        <TimelineSection caseId={id} timeline={timeline} />
      </div>

      <div id="tasks" style={sectionWrapStyle}>
        <TasksSection caseId={id} tasks={tasks} />
      </div>

      <div id="fees" style={sectionWrapStyle}>
        <FeesSection caseId={id} fees={fees} />
      </div>
    </main>
  );
}