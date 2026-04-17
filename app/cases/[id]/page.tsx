"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";

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

  useEffect(() => {
    if (!id) return;

    didScrollRef.current = false;

    const loadCase = async () => {
      try {
        const ref = doc(db, "cases", id);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setCaseItem(snap.data() as CaseItem);
        } else {
          setCaseItem(null);
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
    if (!id) return;

    const q = query(
      collection(db, "cases", id, "timeline"),
      orderBy("eventDate", "asc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setTimeline(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as TimelineItem[]
      );
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "cases", id, "tasks"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setTasks(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as TaskItem[]
      );
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "cases", id, "timeLogs"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setTimeLogs(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as TimeLogItem[]
      );
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "cases", id, "deadlines"),
      orderBy("dueDate", "asc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setDeadlines(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as DeadlineItem[]
      );
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "cases", id, "services"),
      orderBy("serviceDate", "asc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setServices(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as ServiceItem[]
      );
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "cases", id, "fees"),
      orderBy("dueDate", "asc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setFees(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as FeeItem[]
      );
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (loading) return;
    if (didScrollRef.current) return;

    const hash = window.location.hash;
    if (!hash) return;

    const scrollToHash = () => {
      const el = document.querySelector(hash);
      if (!el) return;

      el.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      didScrollRef.current = true;
    };

    const timer = setTimeout(scrollToHash, 250);
    return () => clearTimeout(timer);
  }, [
    loading,
    id,
    caseItem,
    parties,
    timeline,
    tasks,
    timeLogs,
    deadlines,
    services,
    fees,
  ]);

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

      <div style={{ marginBottom: 24 }}>
        <CaseAlertsSection
          deadlines={deadlines}
          tasks={tasks}
          timeline={timeline}
        />
      </div>

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

      <div id="timelogs" style={sectionWrapStyle}>
        <TimeLogsSection caseId={id} timeLogs={timeLogs} />
      </div>

      <div id="deadlines" style={sectionWrapStyle}>
        <DeadlinesSection caseId={id} deadlines={deadlines} />
      </div>

      <div id="service" style={sectionWrapStyle}>
        <ServiceSection
          caseId={id}
          services={services}
          defendants={defendants}
          timeline={timeline}
          initialRule={caseItem.serviceRule}
        />
      </div>

      <div id="notes" style={sectionWrapStyle}>
        <NotesSection caseId={id} noteText={caseItem.noteText} />
      </div>

      <div id="fees" style={sectionWrapStyle}>
        <FeesSection caseId={id} fees={fees} />
      </div>
    </main>
  );
}