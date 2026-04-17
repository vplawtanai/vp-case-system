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

type AlertRow = {
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

export default function AlertsPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);

  const [searchText, setSearchText] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
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

  const ownerOptions = useMemo(() => {
    return Array.from(
      new Set(
        cases
          .map((c) => (c.ownerName || "").trim())
          .filter((name) => name !== "")
      )
    ).sort((a, b) => a.localeCompare(b, "th"));
  }, [cases]);

  const renderPhase = (phase?: string) => {
    if (!phase) return "-";
    if (phase === "litigation") return "Litigation";
    if (phase === "judgment") return "Judgment";
    if (phase === "enforcement") return "Enforcement";
    if (phase === "closed") return "Closed";
    return phase;
  };

  const renderDeadlineType = (deadlineType?: string) => {
    if (!deadlineType) return "Deadline";
    if (deadlineType === "appeal") return "Appeal";
    if (deadlineType === "supreme") return "Supreme Court";
    if (deadlineType === "submission") return "Submission";
    if (deadlineType === "payment") return "Payment";
    return deadlineType;
  };

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

  const todayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  const markDeadlineDone = async (row: AlertRow) => {
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

  const markTaskDone = async (row: AlertRow) => {
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

  const markTimelineDone = async (row: AlertRow) => {
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

  const issueEnforcement = async (row: AlertRow) => {
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

  const getAlertHref = (row: AlertRow) => {
    return `/cases/${row.caseId}${row.hash}`;
  };

  const allAlerts = useMemo(() => {
    const rows: AlertRow[] = [];

    deadlines.forEach((item) => {
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

    cases.forEach((c) => {
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
      const scoreA =
        a.level === "overdue"
          ? 0
          : a.level === "today"
            ? 1
            : a.level === "ready"
              ? 2
              : 3;
      const scoreB =
        b.level === "overdue"
          ? 0
          : b.level === "today"
            ? 1
            : b.level === "ready"
              ? 2
              : 3;

      if (scoreA !== scoreB) return scoreA - scoreB;

      const dateA = a.date || "9999-99-99";
      const dateB = b.date || "9999-99-99";
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;

      return toMillis(b.updatedAt) - toMillis(a.updatedAt);
    });

    return rows;
  }, [cases, deadlines, tasks, timeline, casesMap]);

  const filteredAlerts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return allAlerts.filter((row) => {
      const matchesSearch =
        keyword === "" ||
        row.fileNo.toLowerCase().includes(keyword) ||
        row.title.toLowerCase().includes(keyword) ||
        row.clientName.toLowerCase().includes(keyword) ||
        row.ownerName.toLowerCase().includes(keyword) ||
        row.text.toLowerCase().includes(keyword);

      const matchesOwner =
        ownerFilter === "all" || row.ownerName === ownerFilter;

      const matchesCategory =
        categoryFilter === "all" || row.category === categoryFilter;

      const matchesLevel = levelFilter === "all" || row.level === levelFilter;

      return (
        matchesSearch && matchesOwner && matchesCategory && matchesLevel
      );
    });
  }, [allAlerts, searchText, ownerFilter, categoryFilter, levelFilter]);

  const summary = useMemo(() => {
    let overdue = 0;
    let today = 0;
    let dueSoon = 0;
    let ready = 0;

    filteredAlerts.forEach((row) => {
      if (row.level === "overdue") overdue += 1;
      else if (row.level === "today") today += 1;
      else if (row.level === "dueSoon") dueSoon += 1;
      else if (row.level === "ready") ready += 1;
    });

    return { overdue, today, dueSoon, ready };
  }, [filteredAlerts]);

  const getBadgeStyle = (row: AlertRow): React.CSSProperties => {
    if (row.level === "overdue") {
      return {
        background: "#ffe5e5",
        color: "#b42318",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    if (row.level === "today") {
      return {
        background: "#fff3cd",
        color: "#b54708",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    if (row.level === "dueSoon") {
      return {
        background: "#fff8e1",
        color: "#b54708",
        fontWeight: 600,
        borderRadius: 999,
        padding: "4px 10px",
        display: "inline-block",
      };
    }

    return {
      background: "#e0f2fe",
      color: "#075985",
      fontWeight: 600,
      borderRadius: 999,
      padding: "4px 10px",
      display: "inline-block",
    };
  };

  const getLevelText = (row: AlertRow) => {
    if (row.level === "overdue") return "Overdue";
    if (row.level === "today") return "Today";
    if (row.level === "dueSoon") return "Due Soon";
    return "Ready";
  };

  const getCategoryText = (row: AlertRow) => {
    if (row.category === "risk") return "Risk";
    return "Enforcement";
  };

  const runAction = async (row: AlertRow) => {
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

  const getActionLabel = (row: AlertRow) => {
    if (row.sourceType === "enforcement") return "Issue Enforcement";
    return "Done";
  };

  if (loadingSubData) {
    return <main style={{ padding: 24 }}>Loading alerts...</main>;
  }

  return (
    <main style={pageStyle}>
      <AppTopNav
        title="Alerts"
        subtitle="Work queue across all cases"
        activePage="alerts"
      />

      <div style={summaryGridStyle}>
        <div style={{ ...summaryCardStyle, background: "#ffe5e5" }}>
          <div style={summaryNumberStyle}>{summary.overdue}</div>
          <div>Overdue</div>
        </div>

        <div style={{ ...summaryCardStyle, background: "#fff3cd" }}>
          <div style={summaryNumberStyle}>{summary.today}</div>
          <div>Today</div>
        </div>

        <div style={{ ...summaryCardStyle, background: "#fff8e1" }}>
          <div style={summaryNumberStyle}>{summary.dueSoon}</div>
          <div>Due Soon</div>
        </div>

        <div style={{ ...summaryCardStyle, background: "#e0f2fe" }}>
          <div style={summaryNumberStyle}>{summary.ready}</div>
          <div>Enforcement Ready</div>
        </div>
      </div>

      <div style={filterGridStyle}>
        <div>
          <label>Search</label>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search file no, title, client, owner, alert text"
            style={inputStyle}
          />
        </div>

        <div>
          <label>Owner</label>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All</option>
            {ownerOptions.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All</option>
            <option value="risk">Risk</option>
            <option value="enforcement">Enforcement</option>
          </select>
        </div>

        <div>
          <label>Level</label>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="dueSoon">Due Soon</option>
            <option value="ready">Ready</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16, color: "#555" }}>
        {filteredAlerts.length} alert(s)
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>File No</th>
            <th style={thStyle}>Title</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Owner</th>
            <th style={thStyle}>Phase</th>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Level</th>
            <th style={thStyle}>Alert</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Last Updated</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredAlerts.map((row) => (
            <tr key={row.id} style={rowStyle}>
              <td style={tdStyle}>
                <Link href={getAlertHref(row)}>{row.fileNo}</Link>
              </td>
              <td style={tdStyle}>{row.title}</td>
              <td style={tdStyle}>{row.clientName}</td>
              <td style={tdStyle}>{row.ownerName}</td>
              <td style={tdStyle}>{row.phase}</td>
              <td style={tdStyle}>{getCategoryText(row)}</td>
              <td style={tdStyle}>
                <span style={getBadgeStyle(row)}>{getLevelText(row)}</span>
              </td>
              <td style={tdStyle}>{row.text}</td>
              <td style={tdStyle}>{row.date || "-"}</td>
              <td style={tdStyle}>{formatDateTime(row.updatedAt)}</td>
              <td style={tdStyle}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link href={getAlertHref(row)} style={openLinkStyle}>
                    Open
                  </Link>

                  <button
                    onClick={() => runAction(row)}
                    disabled={actingId === row.id}
                    style={actionButtonStyle}
                  >
                    {actingId === row.id ? "Working..." : getActionLabel(row)}
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {filteredAlerts.length === 0 && (
            <tr>
              <td colSpan={11} style={{ padding: 16, color: "#666" }}>
                No alerts found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: "system-ui",
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr",
  gap: 12,
  marginTop: 20,
  marginBottom: 20,
  alignItems: "end",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  verticalAlign: "top",
};

const rowStyle: React.CSSProperties = {
  borderTop: "1px solid #eee",
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

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
  marginTop: 16,
  marginBottom: 20,
};

const summaryCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginBottom: 6,
};