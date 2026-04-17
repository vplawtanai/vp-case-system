"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import AppTopNav from "../components/AppTopNav";

type FirestoreTimestampLike = {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
};

type CaseItem = {
  id: string;
  fileNo?: string;
  title?: string;
  clientName?: string;
  courtName?: string;
  caseNumber?: string;
  phase?: string;
  caseStatus?: string;
  ownerName?: string;
  riskLevel?: "overdue" | "today" | "dueSoon" | "clear";
  nextAlertText?: string;
  nextAlertDate?: string;
  enforcementPeriodDays?: string;
  enforcementNoticeResult?: string;
  enforcementNoticeMethod?: string;
  enforcementNoticeDate?: string;
  enforcementDueDate?: string;
  enforcementReady?: boolean;
  enforcementReadyText?: string;
  enforcementReadyDate?: string;
  enforcementIssued?: boolean;
  enforcementIssuedDate?: string;
  updatedAt?: FirestoreTimestampLike;
};

type DeadlineItem = {
  id: string;
  caseId: string;
  deadlineType?: string;
  dueDate?: string;
  status?: string;
  note?: string;
  done?: boolean;
  updatedAt?: FirestoreTimestampLike;
};

type TaskItem = {
  id: string;
  caseId: string;
  title?: string;
  assigneeName?: string;
  startDate?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  done?: boolean;
  updatedAt?: FirestoreTimestampLike;
};

type TimelineItem = {
  id: string;
  caseId: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  appointment?: string;
  done?: boolean;
  updatedAt?: FirestoreTimestampLike;
};

type ActionRow = {
  id: string;
  caseId: string;
  sourceId?: string;
  sourceType: "deadline" | "task" | "timeline" | "enforcement";
  fileNo: string;
  title: string;
  clientName: string;
  ownerName: string;
  phase: string;
  category: "risk" | "enforcement";
  level: "overdue" | "today" | "dueSoon" | "ready";
  text: string;
  date: string;
  hash: string;
  updatedAt?: FirestoreTimestampLike;
};

export default function DashboardPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [loadingSubData, setLoadingSubData] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "cases"), orderBy("updatedAt", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      })) as CaseItem[];

      setCases(data);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const loadSubcollections = async () => {
      if (cases.length === 0) {
        setDeadlines([]);
        setTasks([]);
        setTimeline([]);
        setLoadingSubData(false);
        return;
      }

      setLoadingSubData(true);

      try {
        const deadlineResults = await Promise.all(
          cases.map(async (caseItem) => {
            const snap = await getDocs(
              query(
                collection(db, "cases", caseItem.id, "deadlines"),
                orderBy("dueDate", "asc")
              )
            );

            return snap.docs.map((d) => ({
              id: d.id,
              caseId: caseItem.id,
              ...(d.data() as any),
            })) as DeadlineItem[];
          })
        );

        const taskResults = await Promise.all(
          cases.map(async (caseItem) => {
            const snap = await getDocs(
              query(
                collection(db, "cases", caseItem.id, "tasks"),
                orderBy("createdAt", "desc")
              )
            );

            return snap.docs.map((d) => ({
              id: d.id,
              caseId: caseItem.id,
              ...(d.data() as any),
            })) as TaskItem[];
          })
        );

        const timelineResults = await Promise.all(
          cases.map(async (caseItem) => {
            const snap = await getDocs(
              query(
                collection(db, "cases", caseItem.id, "timeline"),
                orderBy("eventDate", "asc")
              )
            );

            return snap.docs.map((d) => ({
              id: d.id,
              caseId: caseItem.id,
              ...(d.data() as any),
            })) as TimelineItem[];
          })
        );

        setDeadlines(deadlineResults.flat());
        setTasks(taskResults.flat());
        setTimeline(timelineResults.flat());
      } catch (error) {
        console.error(error);
        setDeadlines([]);
        setTasks([]);
        setTimeline([]);
      } finally {
        setLoadingSubData(false);
      }
    };

    loadSubcollections();
  }, [cases]);

  const casesMap = useMemo(() => {
    const map = new Map<string, CaseItem>();
    cases.forEach((item) => map.set(item.id, item));
    return map;
  }, [cases]);

  const toMillis = (value?: FirestoreTimestampLike) => {
    if (!value) return 0;
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    return 0;
  };

  const formatDateTime = (value?: FirestoreTimestampLike) => {
    const ms = toMillis(value);
    if (!ms) return "-";

    return new Date(ms).toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderPhase = (phase?: string) => {
    if (!phase) return "-";
    if (phase === "litigation") return "Litigation";
    if (phase === "judgment") return "Judgment";
    if (phase === "enforcement") return "Enforcement";
    if (phase === "closed") return "Closed";
    return phase;
  };

  const getRiskBadgeStyle = (risk?: string): React.CSSProperties => {
    if (risk === "overdue") return badgeDangerStyle;
    if (risk === "today") return badgeWarningStyle;
    if (risk === "dueSoon") return badgeSoonStyle;
    return badgeClearStyle;
  };

  const renderDeadlineType = (deadlineType?: string) => {
    if (!deadlineType) return "Deadline";
    if (deadlineType === "appeal") return "Appeal";
    if (deadlineType === "supreme") return "Supreme Court";
    if (deadlineType === "submission") return "Submission";
    if (deadlineType === "payment") return "Payment";
    return deadlineType;
  };

  const todayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getLevelScore = (level: "overdue" | "today" | "dueSoon" | "ready") => {
    if (level === "overdue") return 0;
    if (level === "today") return 1;
    if (level === "ready") return 2;
    return 3;
  };

  const getDeadlineUrgency = (item: DeadlineItem) => {
    if (item.done || item.status === "done") return "Done";
    if (!item.dueDate) return "-";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(item.dueDate);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays <= 3) return "Due Soon";
    return "Normal";
  };

  const getTaskUrgency = (item: TaskItem) => {
    if (item.done || item.status === "done") return "Done";
    if (!item.dueDate) return "No Due Date";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(item.dueDate);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays <= 3) return "Due Soon";
    return "Normal";
  };

  const getTimelineUrgency = (item: TimelineItem) => {
    if (item.done) return "Done";
    if (!item.eventDate) return "-";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventDate = new Date(item.eventDate);
    eventDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays <= 3) return "Upcoming";
    return "Normal";
  };

  const calculateEnforcementState = (caseData: CaseItem) => {
    const dueDate = caseData.enforcementDueDate || "";

    if (caseData.enforcementIssued) {
      return {
        enforcementReady: false,
        enforcementReadyText: "Enforcement issued",
        enforcementReadyDate: caseData.enforcementIssuedDate || dueDate || "",
      };
    }

    if (!dueDate) {
      return {
        enforcementReady: false,
        enforcementReadyText: "-",
        enforcementReadyDate: "",
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) {
      return {
        enforcementReady: true,
        enforcementReadyText: "Can apply for enforcement",
        enforcementReadyDate: dueDate,
      };
    }

    if (diffDays === 0) {
      return {
        enforcementReady: true,
        enforcementReadyText: "Can apply for enforcement today",
        enforcementReadyDate: dueDate,
      };
    }

    if (diffDays <= 3) {
      return {
        enforcementReady: false,
        enforcementReadyText: "Due soon",
        enforcementReadyDate: dueDate,
      };
    }

    return {
      enforcementReady: false,
      enforcementReadyText: "Not yet due",
      enforcementReadyDate: dueDate,
    };
  };

  const recomputeCaseState = async (caseId: string) => {
    const [caseSnap, deadlineSnap, taskSnap, timelineSnap] = await Promise.all([
      getDoc(doc(db, "cases", caseId)),
      getDocs(collection(db, "cases", caseId, "deadlines")),
      getDocs(collection(db, "cases", caseId, "tasks")),
      getDocs(collection(db, "cases", caseId, "timeline")),
    ]);

    if (!caseSnap.exists()) return;
    const caseData = caseSnap.data() as CaseItem;

    const caseDeadlines = deadlineSnap.docs.map((d) => ({
      id: d.id,
      caseId,
      ...(d.data() as any),
    })) as DeadlineItem[];

    const caseTasks = taskSnap.docs.map((d) => ({
      id: d.id,
      caseId,
      ...(d.data() as any),
    })) as TaskItem[];

    const caseTimeline = timelineSnap.docs.map((d) => ({
      id: d.id,
      caseId,
      ...(d.data() as any),
    })) as TimelineItem[];

    const candidates: {
      level: "overdue" | "today" | "dueSoon";
      text: string;
      date: string;
      score: number;
    }[] = [];

    caseDeadlines.forEach((item) => {
      const urgency = getDeadlineUrgency(item);
      if (!item.dueDate) return;

      if (urgency === "Overdue") {
        candidates.push({
          level: "overdue",
          text: `Deadline overdue: ${renderDeadlineType(item.deadlineType)}`,
          date: item.dueDate,
          score: 0,
        });
      } else if (urgency === "Today") {
        candidates.push({
          level: "today",
          text: `Deadline today: ${renderDeadlineType(item.deadlineType)}`,
          date: item.dueDate,
          score: 1,
        });
      } else if (urgency === "Due Soon") {
        candidates.push({
          level: "dueSoon",
          text: `Deadline due soon: ${renderDeadlineType(item.deadlineType)}`,
          date: item.dueDate,
          score: 2,
        });
      }
    });

    caseTasks.forEach((item) => {
      const urgency = getTaskUrgency(item);
      if (!item.dueDate) return;

      if (urgency === "Overdue") {
        candidates.push({
          level: "overdue",
          text: `Task overdue: ${item.title || "Task"}`,
          date: item.dueDate,
          score: 0,
        });
      } else if (urgency === "Today") {
        candidates.push({
          level: "today",
          text: `Task today: ${item.title || "Task"}`,
          date: item.dueDate,
          score: 1,
        });
      } else if (urgency === "Due Soon") {
        candidates.push({
          level: "dueSoon",
          text: `Task due soon: ${item.title || "Task"}`,
          date: item.dueDate,
          score: 2,
        });
      }
    });

    caseTimeline.forEach((item) => {
      const urgency = getTimelineUrgency(item);
      if (!item.eventDate) return;

      if (urgency === "Overdue") {
        candidates.push({
          level: "overdue",
          text: `Timeline overdue: ${item.appointment || "Appointment"}`,
          date: item.eventDate,
          score: 0,
        });
      } else if (urgency === "Today") {
        candidates.push({
          level: "today",
          text: `Timeline today: ${item.appointment || "Appointment"}`,
          date: item.eventDate,
          score: 1,
        });
      } else if (urgency === "Upcoming") {
        candidates.push({
          level: "dueSoon",
          text: `Timeline upcoming: ${item.appointment || "Appointment"}`,
          date: item.eventDate,
          score: 2,
        });
      }
    });

    candidates.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.date.localeCompare(b.date);
    });

    const top = candidates[0];
    const enforcementState = calculateEnforcementState(caseData);

    await updateDoc(doc(db, "cases", caseId), {
      riskLevel: top?.level || "clear",
      nextAlertText: top?.text || "-",
      nextAlertDate: top?.date || "",
      enforcementReady: enforcementState.enforcementReady,
      enforcementReadyText: enforcementState.enforcementReadyText,
      enforcementReadyDate: enforcementState.enforcementReadyDate,
      updatedAt: serverTimestamp(),
    });
  };

  const markDeadlineDone = async (row: ActionRow) => {
    if (!row.sourceId) return;
    setActingId(row.id);
    try {
      await updateDoc(doc(db, "cases", row.caseId, "deadlines", row.sourceId), {
        done: true,
        status: "done",
        updatedAt: serverTimestamp(),
      });
      await recomputeCaseState(row.caseId);
    } catch (error) {
      console.error(error);
      alert("Update deadline failed.");
    } finally {
      setActingId(null);
    }
  };

  const markTaskDone = async (row: ActionRow) => {
    if (!row.sourceId) return;
    setActingId(row.id);
    try {
      await updateDoc(doc(db, "cases", row.caseId, "tasks", row.sourceId), {
        done: true,
        status: "done",
        updatedAt: serverTimestamp(),
      });
      await recomputeCaseState(row.caseId);
    } catch (error) {
      console.error(error);
      alert("Update task failed.");
    } finally {
      setActingId(null);
    }
  };

  const markTimelineDone = async (row: ActionRow) => {
    if (!row.sourceId) return;
    setActingId(row.id);
    try {
      await updateDoc(doc(db, "cases", row.caseId, "timeline", row.sourceId), {
        done: true,
        updatedAt: serverTimestamp(),
      });
      await recomputeCaseState(row.caseId);
    } catch (error) {
      console.error(error);
      alert("Update timeline failed.");
    } finally {
      setActingId(null);
    }
  };

  const issueEnforcement = async (row: ActionRow) => {
    setActingId(row.id);
    try {
      await updateDoc(doc(db, "cases", row.caseId), {
        enforcementIssued: true,
        enforcementIssuedDate: todayDateString(),
        updatedAt: serverTimestamp(),
      });
      await recomputeCaseState(row.caseId);
    } catch (error) {
      console.error(error);
      alert("Issue enforcement failed.");
    } finally {
      setActingId(null);
    }
  };

  const runAction = async (row: ActionRow) => {
    const confirmed = window.confirm("Confirm this action?");
    if (!confirmed) return;

    if (row.sourceType === "deadline") {
      await markDeadlineDone(row);
      return;
    }

    if (row.sourceType === "task") {
      await markTaskDone(row);
      return;
    }

    if (row.sourceType === "timeline") {
      await markTimelineDone(row);
      return;
    }

    if (row.sourceType === "enforcement") {
      await issueEnforcement(row);
    }
  };

  const getActionLabel = (row: ActionRow) => {
    if (row.sourceType === "enforcement") return "Issue Enforcement";
    return "Done";
  };

  const filteredCases = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return cases.filter((c) => {
      if (!keyword) return true;

      return (
        (c.fileNo || "").toLowerCase().includes(keyword) ||
        (c.title || "").toLowerCase().includes(keyword) ||
        (c.clientName || "").toLowerCase().includes(keyword) ||
        (c.ownerName || "").toLowerCase().includes(keyword) ||
        (c.nextAlertText || "").toLowerCase().includes(keyword)
      );
    });
  }, [cases, searchText]);

  const filteredCaseIds = useMemo(
    () => new Set(filteredCases.map((c) => c.id)),
    [filteredCases]
  );

  const allRiskRows = useMemo(() => {
    const rows: ActionRow[] = [];

    deadlines.forEach((item) => {
      if (!filteredCaseIds.has(item.caseId)) return;

      const urgency = getDeadlineUrgency(item);
      if (
        urgency !== "Overdue" &&
        urgency !== "Today" &&
        urgency !== "Due Soon"
      ) {
        return;
      }

      const caseData = casesMap.get(item.caseId);
      if (!caseData) return;

      rows.push({
        id: `deadline-${item.id}`,
        caseId: item.caseId,
        sourceId: item.id,
        sourceType: "deadline",
        fileNo: caseData.fileNo || "-",
        title: caseData.title || "-",
        clientName: caseData.clientName || "-",
        ownerName: caseData.ownerName || "-",
        phase: renderPhase(caseData.phase),
        category: "risk",
        level:
          urgency === "Overdue"
            ? "overdue"
            : urgency === "Today"
              ? "today"
              : "dueSoon",
        text: `Deadline ${
          urgency === "Overdue"
            ? "overdue"
            : urgency === "Today"
              ? "today"
              : "due soon"
        }: ${renderDeadlineType(item.deadlineType)}`,
        date: item.dueDate || "",
        hash: "#deadlines",
        updatedAt: item.updatedAt || caseData.updatedAt,
      });
    });

    tasks.forEach((item) => {
      if (!filteredCaseIds.has(item.caseId)) return;

      const urgency = getTaskUrgency(item);
      if (
        urgency !== "Overdue" &&
        urgency !== "Today" &&
        urgency !== "Due Soon"
      ) {
        return;
      }

      const caseData = casesMap.get(item.caseId);
      if (!caseData) return;

      rows.push({
        id: `task-${item.id}`,
        caseId: item.caseId,
        sourceId: item.id,
        sourceType: "task",
        fileNo: caseData.fileNo || "-",
        title: caseData.title || "-",
        clientName: caseData.clientName || "-",
        ownerName: caseData.ownerName || "-",
        phase: renderPhase(caseData.phase),
        category: "risk",
        level:
          urgency === "Overdue"
            ? "overdue"
            : urgency === "Today"
              ? "today"
              : "dueSoon",
        text: `Task ${
          urgency === "Overdue"
            ? "overdue"
            : urgency === "Today"
              ? "today"
              : "due soon"
        }: ${item.title || "Task"}`,
        date: item.dueDate || "",
        hash: "#tasks",
        updatedAt: item.updatedAt || caseData.updatedAt,
      });
    });

    timeline.forEach((item) => {
      if (!filteredCaseIds.has(item.caseId)) return;

      const urgency = getTimelineUrgency(item);
      if (
        urgency !== "Overdue" &&
        urgency !== "Today" &&
        urgency !== "Upcoming"
      ) {
        return;
      }

      const caseData = casesMap.get(item.caseId);
      if (!caseData) return;

      rows.push({
        id: `timeline-${item.id}`,
        caseId: item.caseId,
        sourceId: item.id,
        sourceType: "timeline",
        fileNo: caseData.fileNo || "-",
        title: caseData.title || "-",
        clientName: caseData.clientName || "-",
        ownerName: caseData.ownerName || "-",
        phase: renderPhase(caseData.phase),
        category: "risk",
        level:
          urgency === "Overdue"
            ? "overdue"
            : urgency === "Today"
              ? "today"
              : "dueSoon",
        text: `Timeline ${
          urgency === "Overdue"
            ? "overdue"
            : urgency === "Today"
              ? "today"
              : "upcoming"
        }: ${item.appointment || "Appointment"}`,
        date: item.eventDate || "",
        hash: "#timeline",
        updatedAt: item.updatedAt || caseData.updatedAt,
      });
    });

    rows.sort((a, b) => {
      const scoreCompare = getLevelScore(a.level) - getLevelScore(b.level);
      if (scoreCompare !== 0) return scoreCompare;

      const dateA = a.date || "9999-99-99";
      const dateB = b.date || "9999-99-99";
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;

      return toMillis(b.updatedAt) - toMillis(a.updatedAt);
    });

    return rows;
  }, [deadlines, tasks, timeline, casesMap, filteredCaseIds]);

  const riskRowsByCase = useMemo(() => {
    const map = new Map<string, ActionRow>();

    allRiskRows.forEach((row) => {
      const existing = map.get(row.caseId);
      if (!existing) {
        map.set(row.caseId, row);
        return;
      }

      const scoreCompare =
        getLevelScore(row.level) - getLevelScore(existing.level);
      if (scoreCompare < 0) {
        map.set(row.caseId, row);
        return;
      }

      if (scoreCompare === 0) {
        const dateA = row.date || "9999-99-99";
        const dateB = existing.date || "9999-99-99";
        if (dateA.localeCompare(dateB) < 0) {
          map.set(row.caseId, row);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const scoreCompare = getLevelScore(a.level) - getLevelScore(b.level);
      if (scoreCompare !== 0) return scoreCompare;

      const dateA = a.date || "9999-99-99";
      const dateB = b.date || "9999-99-99";
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;

      return toMillis(b.updatedAt) - toMillis(a.updatedAt);
    });
  }, [allRiskRows]);

  const summary = useMemo(() => {
    let overdue = 0;
    let today = 0;
    let dueSoon = 0;
    let clear = 0;
    let enforcementReady = 0;
    let active = 0;
    let waiting = 0;
    let done = 0;

    const riskMap = new Map<string, "overdue" | "today" | "dueSoon">();

    riskRowsByCase.forEach((row) => {
      riskMap.set(row.caseId, row.level as "overdue" | "today" | "dueSoon");
    });

    filteredCases.forEach((c) => {
      const risk = riskMap.get(c.id);

      if (risk === "overdue") overdue += 1;
      else if (risk === "today") today += 1;
      else if (risk === "dueSoon") dueSoon += 1;
      else clear += 1;

      if (c.enforcementReady && !c.enforcementIssued) {
        enforcementReady += 1;
      }

      if (c.caseStatus === "Active") active += 1;
      else if (c.caseStatus === "Waiting") waiting += 1;
      else if (c.caseStatus === "Done") done += 1;
    });

    return {
      total: filteredCases.length,
      overdue,
      today,
      dueSoon,
      clear,
      enforcementReady,
      active,
      waiting,
      done,
    };
  }, [filteredCases, riskRowsByCase]);

  const topRiskRows = useMemo(() => {
    return riskRowsByCase.slice(0, 8);
  }, [riskRowsByCase]);

  const enforcementRows = useMemo(() => {
    const rows: ActionRow[] = [];

    filteredCases.forEach((c) => {
      const readyText =
        c.enforcementReadyText && c.enforcementReadyText !== "-"
          ? c.enforcementReadyText
          : "";

      if (!c.enforcementIssued && c.enforcementReady && readyText) {
        rows.push({
          id: `enforcement-${c.id}`,
          caseId: c.id,
          sourceType: "enforcement",
          fileNo: c.fileNo || "-",
          title: c.title || "-",
          clientName: c.clientName || "-",
          ownerName: c.ownerName || "-",
          phase: renderPhase(c.phase),
          category: "enforcement",
          level: "ready",
          text: readyText,
          date: c.enforcementReadyDate || c.enforcementDueDate || "",
          hash: "#case-info",
          updatedAt: c.updatedAt,
        });
      }
    });

    rows.sort((a, b) => {
      const dateA = a.date || "9999-99-99";
      const dateB = b.date || "9999-99-99";
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;

      return toMillis(b.updatedAt) - toMillis(a.updatedAt);
    });

    return rows.slice(0, 8);
  }, [filteredCases]);

  const phaseSummary = useMemo(() => {
    const map = new Map<string, number>();

    filteredCases.forEach((c) => {
      const label = renderPhase(c.phase);
      map.set(label, (map.get(label) || 0) + 1);
    });

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredCases]);

  const ownerSummary = useMemo(() => {
    const map = new Map<string, number>();

    filteredCases.forEach((c) => {
      const label = (c.ownerName || "-").trim() || "-";
      map.set(label, (map.get(label) || 0) + 1);
    });

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredCases]);

  const recentCases = useMemo(() => {
    return [...filteredCases]
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
      .slice(0, 8);
  }, [filteredCases]);

  const getActionHref = (row: ActionRow) => {
    return `/cases/${row.caseId}${row.hash}`;
  };

  if (loadingSubData) {
    return <main style={{ padding: 24 }}>Loading dashboard...</main>;
  }

  return (
    <main style={pageStyle}>
      <AppTopNav
        title="Dashboard"
        subtitle="Executive overview across all cases"
        activePage="dashboard"
      />

      <div style={searchWrapStyle}>
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search file no, title, client, owner, alert text"
          style={searchInputStyle}
        />
      </div>

      <div style={heroGridStyle}>
        <div style={{ ...heroCardStyle, background: "#f8f9fa" }}>
          <div style={heroNumberStyle}>{summary.total}</div>
          <div>Total Cases</div>
        </div>

        <div style={{ ...heroCardStyle, background: "#ffe5e5" }}>
          <div style={heroNumberStyle}>{summary.overdue}</div>
          <div>Overdue</div>
        </div>

        <div style={{ ...heroCardStyle, background: "#fff3cd" }}>
          <div style={heroNumberStyle}>{summary.today}</div>
          <div>Today</div>
        </div>

        <div style={{ ...heroCardStyle, background: "#fff8e1" }}>
          <div style={heroNumberStyle}>{summary.dueSoon}</div>
          <div>Due Soon</div>
        </div>

        <div style={{ ...heroCardStyle, background: "#e0f2fe" }}>
          <div style={heroNumberStyle}>{summary.enforcementReady}</div>
          <div>Enforcement Ready</div>
        </div>

        <div style={{ ...heroCardStyle, background: "#e6f4ea" }}>
          <div style={heroNumberStyle}>{summary.clear}</div>
          <div>Clear</div>
        </div>
      </div>

      <div style={miniGridStyle}>
        <div style={miniCardStyle}>
          <div style={miniTitleStyle}>Case Status</div>
          <div style={miniRowStyle}>
            <span>Active</span>
            <strong>{summary.active}</strong>
          </div>
          <div style={miniRowStyle}>
            <span>Waiting</span>
            <strong>{summary.waiting}</strong>
          </div>
          <div style={miniRowStyle}>
            <span>Done</span>
            <strong>{summary.done}</strong>
          </div>
        </div>

        <div style={miniCardStyle}>
          <div style={miniTitleStyle}>Phase Distribution</div>
          {phaseSummary.length === 0 ? (
            <div style={{ color: "#666" }}>No data</div>
          ) : (
            phaseSummary.map(([label, count]) => (
              <div key={label} style={miniRowStyle}>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))
          )}
        </div>

        <div style={miniCardStyle}>
          <div style={miniTitleStyle}>Owner Distribution</div>
          {ownerSummary.length === 0 ? (
            <div style={{ color: "#666" }}>No data</div>
          ) : (
            ownerSummary.map(([label, count]) => (
              <div key={label} style={miniRowStyle}>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={sectionGridStyle}>
        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={{ margin: 0 }}>Top Risk Cases</h3>
            <Link href="/alerts" style={sectionLinkStyle}>
              View all alerts
            </Link>
          </div>

          {topRiskRows.length === 0 ? (
            <div style={{ color: "#666" }}>No risk cases</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>File No</th>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Risk</th>
                  <th style={thStyle}>Next Alert</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {topRiskRows.map((row) => (
                  <tr key={row.id} style={rowStyle}>
                    <td style={tdStyle}>{row.fileNo}</td>
                    <td style={tdStyle}>{row.clientName}</td>
                    <td style={tdStyle}>
                      <span style={getRiskBadgeStyle(row.level)}>
                        {row.level === "overdue"
                          ? "Overdue"
                          : row.level === "today"
                            ? "Today"
                            : "Due Soon"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {row.text}
                      {row.date ? ` • ${row.date}` : ""}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link href={getActionHref(row)} style={openLinkStyle}>
                          Open & Fix
                        </Link>
                        <button
                          onClick={() => runAction(row)}
                          disabled={actingId === row.id}
                          style={actionButtonStyle}
                        >
                          {actingId === row.id
                            ? "Working..."
                            : getActionLabel(row)}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={{ margin: 0 }}>Enforcement Ready</h3>
            <Link href="/alerts" style={sectionLinkStyle}>
              View queue
            </Link>
          </div>

          {enforcementRows.length === 0 ? (
            <div style={allClearStyle}>
              ✓ All clear — no enforcement action required
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>File No</th>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enforcementRows.map((row) => (
                  <tr key={row.id} style={rowStyle}>
                    <td style={tdStyle}>{row.fileNo}</td>
                    <td style={tdStyle}>{row.clientName}</td>
                    <td style={tdStyle}>{row.text}</td>
                    <td style={tdStyle}>{row.date || "-"}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link href={getActionHref(row)} style={openLinkStyle}>
                          Open & Fix
                        </Link>
                        <button
                          onClick={() => runAction(row)}
                          disabled={actingId === row.id}
                          style={actionButtonStyle}
                        >
                          {actingId === row.id
                            ? "Working..."
                            : getActionLabel(row)}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <h3 style={{ margin: 0 }}>Recently Updated Cases</h3>
          <Link href="/cases" style={sectionLinkStyle}>
            View all cases
          </Link>
        </div>

        {recentCases.length === 0 ? (
          <div style={{ color: "#666" }}>No cases found</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>File No</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Owner</th>
                <th style={thStyle}>Last Updated</th>
                <th style={thStyle}>Open</th>
              </tr>
            </thead>
            <tbody>
              {recentCases.map((c) => (
                <tr key={c.id} style={rowStyle}>
                  <td style={tdStyle}>{c.fileNo || "-"}</td>
                  <td style={tdStyle}>{c.title || "-"}</td>
                  <td style={tdStyle}>{c.clientName || "-"}</td>
                  <td style={tdStyle}>{c.ownerName || "-"}</td>
                  <td style={tdStyle}>{formatDateTime(c.updatedAt)}</td>
                  <td style={tdStyle}>
                    <Link href={`/cases/${c.id}`} style={openLinkStyle}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: "system-ui",
};

const searchWrapStyle: React.CSSProperties = {
  marginBottom: 20,
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
};

const heroGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 1fr)",
  gap: 12,
  marginBottom: 20,
};

const heroCardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  border: "1px solid #ddd",
};

const heroNumberStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  marginBottom: 8,
};

const miniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 12,
  marginBottom: 20,
};

const miniCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
};

const miniTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 10,
};

const miniRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "6px 0",
  borderTop: "1px solid #f0f0f0",
};

const sectionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginBottom: 20,
};

const sectionCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
};

const sectionLinkStyle: React.CSSProperties = {
  color: "#111",
  textDecoration: "none",
  fontSize: 14,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #eee",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  verticalAlign: "top",
};

const rowStyle: React.CSSProperties = {
  borderTop: "1px solid #f3f3f3",
};

const badgeDangerStyle: React.CSSProperties = {
  background: "#ffe5e5",
  color: "#b42318",
  fontWeight: 600,
  borderRadius: 999,
  padding: "4px 10px",
  display: "inline-block",
};

const badgeWarningStyle: React.CSSProperties = {
  background: "#fff3cd",
  color: "#b54708",
  fontWeight: 600,
  borderRadius: 999,
  padding: "4px 10px",
  display: "inline-block",
};

const badgeSoonStyle: React.CSSProperties = {
  background: "#fff8e1",
  color: "#b54708",
  fontWeight: 600,
  borderRadius: 999,
  padding: "4px 10px",
  display: "inline-block",
};

const badgeClearStyle: React.CSSProperties = {
  background: "#e6f4ea",
  color: "#067647",
  fontWeight: 600,
  borderRadius: 999,
  padding: "4px 10px",
  display: "inline-block",
};

const openLinkStyle: React.CSSProperties = {
  color: "#111",
  textDecoration: "none",
  fontWeight: 600,
};

const actionButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "black",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const allClearStyle: React.CSSProperties = {
  color: "#067647",
  fontWeight: 600,
  padding: "6px 0",
};