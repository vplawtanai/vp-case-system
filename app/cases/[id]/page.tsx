"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

import CaseSectionNav from "../../components/CaseSectionNav";
import CaseInfoSection from "./components/CaseInfoSection";
import PartiesSection from "./components/PartiesSection";
import TimelineSection from "./components/TimelineSection";
import TasksSection from "./components/TasksSection";
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

  idNumber?: string;
  phone?: string;

  addressNo?: string;
  moo?: string;
  villageName?: string;
  building?: string;
  floor?: string;
  room?: string;
  soi?: string;
  road?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
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

const sectionWrapStyle: React.CSSProperties = {
  scrollMarginTop: 120,
  marginBottom: 24,
};

export default function CaseDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const caseIdNumber = Number(id);

  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [parties, setParties] = useState<PartyItem[]>([]);
  const [timeline] = useState<TimelineItem[]>([]);
  const [tasks] = useState<TaskItem[]>([]);
  const [fees] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const didScrollRef = useRef(false);

  // =========================
  // LOAD CASE FROM SUPABASE
  // =========================
  useEffect(() => {
    if (!id) return;

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
          console.error(error);
          setCaseItem(null);
          return;
        }

        setCaseItem({
          fileNo: data.file_no,
          title: data.title,
          clientName: data.client_name,
          courtName: data.court_name,
          caseNumber: data.case_number,
          phase: data.phase,
          caseStatus: data.status,
          ownerName: data.owner_name,

          caseType: data.case_type,
          caseSubtype: data.case_subtype,
          issueText: data.issue_text,
          claimAmount: data.claim_amount,
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
        });
      } catch (error) {
        console.error(error);
        setCaseItem(null);
      } finally {
        setLoading(false);
      }
    };

    loadCase();
  }, [id, caseIdNumber]);

  // =========================
  // LOAD PARTIES FROM SUPABASE
  // =========================
  useEffect(() => {
    if (!caseIdNumber) return;

    const loadParties = async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("case_id", caseIdNumber)
        .order("order_no", { ascending: true });

      console.log("PARTIES DATA:", data);
      console.log("PARTIES ERROR:", error);

      if (error) {
        console.error(error);
        setParties([]);
        return;
      }

      const mappedParties = (data || []).map((p: any) => ({
        id: p.id,
        role: p.role,
        entityType: p.entity_type,
        title: p.title,
        firstName: p.first_name,
        lastName: p.last_name,
        companyName: p.company_name,
        orderNo: p.order_no,

        idNumber: p.id_number,
        phone: p.phone,

        addressNo: p.address_no,
        moo: p.moo,
        villageName: p.village_name,
        building: p.building,
        floor: p.floor,
        room: p.room,
        soi: p.soi,
        road: p.road,
        subdistrict: p.subdistrict,
        district: p.district,
        province: p.province,
        postalCode: p.postal_code,
      })) as PartyItem[];

      setParties(mappedParties);
    };

    loadParties();
  }, [caseIdNumber]);

  // =========================
  // SCROLL TO HASH
  // =========================
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

  if (loading) {
    return <main style={{ padding: 24 }}>Loading...</main>;
  }

  if (!caseItem) {
    return <main style={{ padding: 24 }}>Case not found.</main>;
  }

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
        <PartiesSection caseId={caseIdNumber} parties={parties} />
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