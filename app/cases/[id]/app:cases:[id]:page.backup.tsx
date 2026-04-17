"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";

type CaseItem = {
  fileNo?: string;
  title?: string;
  clientName?: string;
  courtName?: string;
  caseNumber?: string;
  phase?: string;
  caseStatus?: string;
  storageCategory?: string;
  storageLocation?: string;
  ownerName?: string;
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
  eventTime?: string;
  appointment?: string;
  done?: boolean;
};

export default function CaseDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [loading, setLoading] = useState(true);

  const [isEditingCase, setIsEditingCase] = useState(false);
  const [savingCase, setSavingCase] = useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [timeLogs, setTimeLogs] = useState<TimeLogItem[]>([]);
  const [editingTimeLogId, setEditingTimeLogId] = useState<string | null>(null);

  const [parties, setParties] = useState<PartyItem[]>([]);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [editingTimelineId, setEditingTimelineId] = useState<string | null>(
    null
  );

  const [caseForm, setCaseForm] = useState({
    clientName: "",
    courtName: "",
    caseNumber: "",
    phase: "litigation",
    caseStatus: "Active",
    ownerName: "",
    storageCategory: "cabinet",
    storageLocation: "",
  });

  const emptyTaskForm = {
    title: "",
    assigneeName: "",
    startDate: "",
    dueDate: "",
    priority: "medium",
    status: "todo",
    done: false,
  };
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const emptyTimeLogForm = {
    workDate: "",
    staffName: "",
    minutes: "",
    note: "",
  };
  const [timeLogForm, setTimeLogForm] = useState(emptyTimeLogForm);

  const emptyPartyForm = {
    role: "plaintiff" as PartyRole,
    entityType: "individual" as PartyEntityType,
    title: "นาย",
    firstName: "",
    lastName: "",
    companyName: "",
  };
  const [partyForm, setPartyForm] = useState(emptyPartyForm);

  const emptyTimelineForm = {
    eventDate: "",
    eventTime: "",
    appointment: "",
    done: false,
  };
  const [timelineForm, setTimelineForm] = useState(emptyTimelineForm);

  useEffect(() => {
    if (!id) return;

    const loadCase = async () => {
      try {
        const ref = doc(db, "cases", id);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as CaseItem;
          setCaseItem(data);

          setCaseForm({
            clientName: data.clientName || "",
            courtName: data.courtName || "",
            caseNumber: data.caseNumber || "",
            phase: data.phase || "litigation",
            caseStatus: data.caseStatus || "Active",
            ownerName: data.ownerName || "",
            storageCategory: data.storageCategory || "cabinet",
            storageLocation: data.storageLocation || "",
          });
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
      collection(db, "cases", id, "tasks"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setTasks(data);
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
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setTimeLogs(data);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, "cases", id, "parties"),
      orderBy("orderNo", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setParties(data);
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
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setTimeline(data);
    });
    return () => unsub();
  }, [id]);

  const renderPhase = (phase?: string) => {
    if (!phase) return "-";
    if (phase === "litigation") return "Litigation";
    if (phase === "judgment") return "Judgment";
    if (phase === "enforcement") return "Enforcement";
    if (phase === "closed") return "Closed";
    return phase;
  };

  const renderStorage = (cat?: string) => {
    if (!cat) return "-";
    if (cat === "cabinet") return "Cabinet";
    if (cat === "activeBox") return "Active Box";
    if (cat === "archive") return "Archive";
    return cat;
  };

  const renderPriority = (priority?: string) => {
    if (!priority) return "-";
    if (priority === "low") return "Low";
    if (priority === "medium") return "Medium";
    if (priority === "high") return "High";
    if (priority === "critical") return "Critical";
    return priority;
  };

  const renderTaskStatus = (status?: string, done?: boolean) => {
    if (done) return "Done";
    if (!status) return "-";
    if (status === "todo") return "To Do";
    if (status === "doing") return "Doing";
    if (status === "done") return "Done";
    return status;
  };

  const priorityScore = (priority?: string) => {
    if (priority === "critical") return 4;
    if (priority === "high") return 3;
    if (priority === "medium") return 2;
    if (priority === "low") return 1;
    return 0;
  };

  const dueBucket = (
    startDate?: string,
    dueDate?: string,
    status?: string,
    done?: boolean
  ) => {
    if (done || status === "done") return 99;
    if (!dueDate) return 50;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const start = startDate ? new Date(startDate) : null;
    if (start) start.setHours(0, 0, 0, 0);

    const diffDue = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDue < 0) return 0;
    if (diffDue === 0) return 1;
    if (start && start.getTime() <= today.getTime() && diffDue <= 3) return 2;
    if (start && start.getTime() <= today.getTime()) return 3;
    if (diffDue <= 3) return 4;
    return 5;
  };

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDone = a.done || a.status === "done" ? 1 : 0;
      const bDone = b.done || b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aBucket = dueBucket(a.startDate, a.dueDate, a.status, a.done);
      const bBucket = dueBucket(b.startDate, b.dueDate, b.status, b.done);
      if (aBucket !== bBucket) return aBucket - bBucket;

      const aDue = a.dueDate
        ? new Date(a.dueDate).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate
        ? new Date(b.dueDate).getTime()
        : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;

      const aPriority = priorityScore(a.priority);
      const bPriority = priorityScore(b.priority);
      if (aPriority !== bPriority) return bPriority - aPriority;

      return 0;
    });
  }, [tasks]);

  const getUrgencyLabel = (task: TaskItem) => {
    if (task.done || task.status === "done") return "Done";
    if (!task.dueDate) return "No Due Date";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays <= 3) return "Due Soon";
    return "Normal";
  };

  const saveCaseChanges = async () => {
    try {
      setSavingCase(true);

      await updateDoc(doc(db, "cases", id), {
        clientName: caseForm.clientName,
        courtName: caseForm.courtName,
        caseNumber: caseForm.caseNumber,
        phase: caseForm.phase,
        caseStatus: caseForm.caseStatus,
        ownerName: caseForm.ownerName,
        storageCategory: caseForm.storageCategory,
        storageLocation: caseForm.storageLocation,
        updatedAt: serverTimestamp(),
      });

      setCaseItem((prev) =>
        prev
          ? {
              ...prev,
              clientName: caseForm.clientName,
              courtName: caseForm.courtName,
              caseNumber: caseForm.caseNumber,
              phase: caseForm.phase,
              caseStatus: caseForm.caseStatus,
              ownerName: caseForm.ownerName,
              storageCategory: caseForm.storageCategory,
              storageLocation: caseForm.storageLocation,
            }
          : prev
      );

      setIsEditingCase(false);
    } catch (error) {
      console.error(error);
      alert("Save case failed.");
    } finally {
      setSavingCase(false);
    }
  };

  const cancelEditCase = () => {
    if (caseItem) {
      setCaseForm({
        clientName: caseItem.clientName || "",
        courtName: caseItem.courtName || "",
        caseNumber: caseItem.caseNumber || "",
        phase: caseItem.phase || "litigation",
        caseStatus: caseItem.caseStatus || "Active",
        ownerName: caseItem.ownerName || "",
        storageCategory: caseItem.storageCategory || "cabinet",
        storageLocation: caseItem.storageLocation || "",
      });
    }
    setIsEditingCase(false);
  };

  const createTask = async () => {
    if (!taskForm.title) {
      alert("Please fill Task Title.");
      return;
    }

    try {
      await addDoc(collection(db, "cases", id, "tasks"), {
        title: taskForm.title,
        assigneeName: taskForm.assigneeName,
        startDate: taskForm.startDate,
        dueDate: taskForm.dueDate,
        priority: taskForm.priority,
        status: taskForm.done ? "done" : taskForm.status,
        done: taskForm.done,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTaskForm(emptyTaskForm);
    } catch (error) {
      console.error(error);
      alert("Create task failed.");
    }
  };

  const startEditTask = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title || "",
      assigneeName: task.assigneeName || "",
      startDate: task.startDate || "",
      dueDate: task.dueDate || "",
      priority: task.priority || "medium",
      status: task.done ? "done" : task.status || "todo",
      done: !!task.done,
    });
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setTaskForm(emptyTaskForm);
  };

  const saveTaskChanges = async () => {
    if (!editingTaskId) return;
    if (!taskForm.title) {
      alert("Please fill Task Title.");
      return;
    }

    try {
      await updateDoc(doc(db, "cases", id, "tasks", editingTaskId), {
        title: taskForm.title,
        assigneeName: taskForm.assigneeName,
        startDate: taskForm.startDate,
        dueDate: taskForm.dueDate,
        priority: taskForm.priority,
        status: taskForm.done ? "done" : taskForm.status,
        done: taskForm.done,
        updatedAt: serverTimestamp(),
      });

      cancelEditTask();
    } catch (error) {
      console.error(error);
      alert("Save task failed.");
    }
  };

  const toggleDoneTask = async (task: TaskItem) => {
    try {
      const nextDone = !(task.done || task.status === "done");
      await updateDoc(doc(db, "cases", id, "tasks", task.id), {
        done: nextDone,
        status: nextDone ? "done" : "todo",
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      alert("Update task failed.");
    }
  };

  const removeTask = async (taskId: string) => {
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", id, "tasks", taskId));
      if (editingTaskId === taskId) cancelEditTask();
    } catch (error) {
      console.error(error);
      alert("Delete task failed.");
    }
  };

  const totalMinutes = useMemo(() => {
    return timeLogs.reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
  }, [timeLogs]);

  const totalHoursText = useMemo(() => {
    const hours = totalMinutes / 60;
    return hours % 1 === 0 ? `${hours}` : hours.toFixed(1);
  }, [totalMinutes]);

  const createTimeLog = async () => {
    if (
      !timeLogForm.workDate ||
      !timeLogForm.staffName ||
      !timeLogForm.minutes
    ) {
      alert("Please fill Work Date, Staff, and Minutes.");
      return;
    }

    try {
      await addDoc(collection(db, "cases", id, "timeLogs"), {
        workDate: timeLogForm.workDate,
        staffName: timeLogForm.staffName,
        minutes: Number(timeLogForm.minutes),
        note: timeLogForm.note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTimeLogForm(emptyTimeLogForm);
    } catch (error) {
      console.error(error);
      alert("Create time log failed.");
    }
  };

  const startEditTimeLog = (log: TimeLogItem) => {
    setEditingTimeLogId(log.id);
    setTimeLogForm({
      workDate: log.workDate || "",
      staffName: log.staffName || "",
      minutes: String(log.minutes || ""),
      note: log.note || "",
    });
  };

  const cancelEditTimeLog = () => {
    setEditingTimeLogId(null);
    setTimeLogForm(emptyTimeLogForm);
  };

  const saveTimeLogChanges = async () => {
    if (!editingTimeLogId) return;
    if (
      !timeLogForm.workDate ||
      !timeLogForm.staffName ||
      !timeLogForm.minutes
    ) {
      alert("Please fill Work Date, Staff, and Minutes.");
      return;
    }

    try {
      await updateDoc(doc(db, "cases", id, "timeLogs", editingTimeLogId), {
        workDate: timeLogForm.workDate,
        staffName: timeLogForm.staffName,
        minutes: Number(timeLogForm.minutes),
        note: timeLogForm.note,
        updatedAt: serverTimestamp(),
      });

      cancelEditTimeLog();
    } catch (error) {
      console.error(error);
      alert("Save time log failed.");
    }
  };

  const removeTimeLog = async (logId: string) => {
    const confirmed = window.confirm("Delete this time log?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", id, "timeLogs", logId));
      if (editingTimeLogId === logId) cancelEditTimeLog();
    } catch (error) {
      console.error(error);
      alert("Delete time log failed.");
    }
  };

  const createParty = async () => {
    if (
      partyForm.entityType === "individual" &&
      (!partyForm.firstName || !partyForm.lastName)
    ) {
      alert("Please fill First Name and Last Name.");
      return;
    }

    if (partyForm.entityType === "company" && !partyForm.companyName) {
      alert("Please fill Company Name.");
      return;
    }

    try {
      const snap = await getDocs(collection(db, "cases", id, "parties"));
      const maxOrderNo =
        snap.docs.length === 0
          ? 0
          : Math.max(
              ...snap.docs.map((d) => Number((d.data() as any).orderNo) || 0)
            );

      await addDoc(collection(db, "cases", id, "parties"), {
        ...partyForm,
        orderNo: maxOrderNo + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setPartyForm(emptyPartyForm);
    } catch (error) {
      console.error(error);
      alert("Create party failed.");
    }
  };

  const startEditParty = (party: PartyItem) => {
    setEditingPartyId(party.id);
    setPartyForm({
      role: party.role || "plaintiff",
      entityType: party.entityType || "individual",
      title: party.title || "นาย",
      firstName: party.firstName || "",
      lastName: party.lastName || "",
      companyName: party.companyName || "",
    });
  };

  const cancelEditParty = () => {
    setEditingPartyId(null);
    setPartyForm(emptyPartyForm);
  };

  const savePartyChanges = async () => {
    if (!editingPartyId) return;

    if (
      partyForm.entityType === "individual" &&
      (!partyForm.firstName || !partyForm.lastName)
    ) {
      alert("Please fill First Name and Last Name.");
      return;
    }

    if (partyForm.entityType === "company" && !partyForm.companyName) {
      alert("Please fill Company Name.");
      return;
    }

    try {
      await updateDoc(doc(db, "cases", id, "parties", editingPartyId), {
        ...partyForm,
        updatedAt: serverTimestamp(),
      });

      cancelEditParty();
    } catch (error) {
      console.error(error);
      alert("Save party failed.");
    }
  };

  const removeParty = async (partyId: string) => {
    const confirmed = window.confirm("Delete this party?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", id, "parties", partyId));
      if (editingPartyId === partyId) cancelEditParty();
    } catch (error) {
      console.error(error);
      alert("Delete party failed.");
    }
  };

  const renderPartyName = (party: PartyItem) => {
    if (party.entityType === "individual") {
      return `${party.title || ""}${party.firstName || ""} ${
        party.lastName || ""
      }`.trim();
    }
    return `${party.title || ""} ${party.companyName || ""}`.trim();
  };

  const roleLabel = (role?: string) => {
    if (role === "plaintiff") return "PLAINTIFF";
    if (role === "defendant") return "DEFENDANT";
    if (role === "petitioner") return "PETITIONER";
    if (role === "objector") return "OBJECTOR";
    return "-";
  };

  const sortedParties = useMemo(() => {
    return [...parties].sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0));
  }, [parties]);

  const groupedParties = useMemo(() => {
    return {
      plaintiff: sortedParties.filter((p) => p.role === "plaintiff"),
      defendant: sortedParties.filter((p) => p.role === "defendant"),
      petitioner: sortedParties.filter((p) => p.role === "petitioner"),
      objector: sortedParties.filter((p) => p.role === "objector"),
    };
  }, [sortedParties]);

  const createTimeline = async () => {
    if (!timelineForm.eventDate || !timelineForm.appointment) {
      alert("Please fill Date and Appointment.");
      return;
    }

    try {
      await addDoc(collection(db, "cases", id, "timeline"), {
        eventDate: timelineForm.eventDate,
        eventTime: timelineForm.eventTime,
        appointment: timelineForm.appointment,
        done: timelineForm.done,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTimelineForm(emptyTimelineForm);
    } catch (error) {
      console.error(error);
      alert("Create timeline failed.");
    }
  };

  const startEditTimeline = (item: TimelineItem) => {
    setEditingTimelineId(item.id);
    setTimelineForm({
      eventDate: item.eventDate || "",
      eventTime: item.eventTime || "",
      appointment: item.appointment || "",
      done: !!item.done,
    });
  };

  const cancelEditTimeline = () => {
    setEditingTimelineId(null);
    setTimelineForm(emptyTimelineForm);
  };

  const saveTimelineChanges = async () => {
    if (!editingTimelineId) return;
    if (!timelineForm.eventDate || !timelineForm.appointment) {
      alert("Please fill Date and Appointment.");
      return;
    }

    try {
      await updateDoc(doc(db, "cases", id, "timeline", editingTimelineId), {
        eventDate: timelineForm.eventDate,
        eventTime: timelineForm.eventTime,
        appointment: timelineForm.appointment,
        done: timelineForm.done,
        updatedAt: serverTimestamp(),
      });

      cancelEditTimeline();
    } catch (error) {
      console.error(error);
      alert("Save timeline failed.");
    }
  };

  const removeTimeline = async (timelineId: string) => {
    const confirmed = window.confirm("Delete this timeline item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", id, "timeline", timelineId));
      if (editingTimelineId === timelineId) cancelEditTimeline();
    } catch (error) {
      console.error(error);
      alert("Delete timeline failed.");
    }
  };

  const toggleTimelineDone = async (item: TimelineItem) => {
    try {
      await updateDoc(doc(db, "cases", id, "timeline", item.id), {
        done: !item.done,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      alert("Update timeline failed.");
    }
  };

  const sortedTimeline = useMemo(() => {
    return [...timeline].sort((a, b) => {
      const aDateTime = `${a.eventDate || ""} ${a.eventTime || ""}`.trim();
      const bDateTime = `${b.eventDate || ""} ${b.eventTime || ""}`.trim();
      return aDateTime.localeCompare(bDateTime);
    });
  }, [timeline]);

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

      <h1 style={{ marginBottom: 4 }}>{caseItem.fileNo}</h1>
      <h2 style={{ marginTop: 0, fontWeight: 500 }}>{caseItem.title}</h2>

      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <h3 style={{ margin: 0 }}>Case Information</h3>
          {!isEditingCase ? (
            <button
              onClick={() => setIsEditingCase(true)}
              style={buttonSecondary}
            >
              Edit Case
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={saveCaseChanges}
                disabled={savingCase}
                style={buttonPrimary}
              >
  {savingCase ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={cancelEditCase}
                disabled={savingCase}
                style={buttonSecondary}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {!isEditingCase ? (
          <>
            <p>
              <strong>Client:</strong> {caseItem.clientName || "-"}
            </p>
            <p>
              <strong>Court:</strong> {caseItem.courtName || "-"}
            </p>
            <p>
              <strong>Case Number:</strong> {caseItem.caseNumber || "-"}
            </p>
            <p>
              <strong>Phase:</strong> {renderPhase(caseItem.phase)}
            </p>
            <p>
              <strong>Status:</strong> {caseItem.caseStatus || "-"}
            </p>
            <p>
              <strong>Owner:</strong> {caseItem.ownerName || "-"}
            </p>
          </>
        ) : (
          <div style={grid2Style}>
            <div>
              <label>Client</label>
              <input
                value={caseForm.clientName}
                onChange={(e) =>
                  setCaseForm({ ...caseForm, clientName: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Court</label>
              <input
                value={caseForm.courtName}
                onChange={(e) =>
                  setCaseForm({ ...caseForm, courtName: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Case Number</label>
              <input
                value={caseForm.caseNumber}
                onChange={(e) =>
                  setCaseForm({ ...caseForm, caseNumber: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Owner</label>
              <input
                value={caseForm.ownerName}
                onChange={(e) =>
                  setCaseForm({ ...caseForm, ownerName: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Phase</label>
              <select
                value={caseForm.phase}
                onChange={(e) =>
                  setCaseForm({ ...caseForm, phase: e.target.value })
                }
                style={inputStyle}
              >
                <option value="litigation">Litigation</option>
                <option value="judgment">Judgment</option>
                <option value="enforcement">Enforcement</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label>Status</label>
              <select
                value={caseForm.caseStatus}
                onChange={(e) =>
                  setCaseForm({ ...caseForm, caseStatus: e.target.value })
                }
                style={inputStyle}
              >
                <option value="Active">Active</option>
                <option value="Waiting">Waiting</option>
                <option value="Done">Done</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <h3 style={{ margin: 0 }}>
            {editingPartyId ? "Edit Party" : "Add Party"}
          </h3>
          {editingPartyId && (
            <button onClick={cancelEditParty} style={buttonSecondary}>
              Cancel Edit
            </button>
          )}
        </div>

        <div style={grid2Style}>
          <div>
            <label>Role</label>
            <select
              value={partyForm.role}
              onChange={(e) =>
                setPartyForm({
                  ...partyForm,
                  role: e.target.value as PartyRole,
                })
              }
              style={inputStyle}
            >
              <option value="plaintiff">Plaintiff</option>
              <option value="defendant">Defendant</option>
              <option value="petitioner">Petitioner</option>
              <option value="objector">Objector</option>
            </select>
          </div>

          <div>
            <label>Type</label>
            <select
              value={partyForm.entityType}
              onChange={(e) => {
                const nextType = e.target.value as PartyEntityType;
                setPartyForm({
                  ...partyForm,
                  entityType: nextType,
                  title: nextType === "individual" ? "นาย" : "บริษัท",
                  firstName: "",
                  lastName: "",
                  companyName: "",
                });
              }}
              style={inputStyle}
            >
              <option value="individual">Individual</option>
              <option value="company">Company</option>
            </select>
          </div>

          {partyForm.entityType === "individual" ? (
            <>
              <div>
                <label>Title</label>
                <select
                  value={partyForm.title}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, title: e.target.value })
                  }
                  style={inputStyle}
                >
                  <option value="นาย">นาย</option>
                  <option value="นาง">นาง</option>
                  <option value="นางสาว">นางสาว</option>
                </select>
              </div>

              <div>
                <label>First Name</label>
                <input
                  value={partyForm.firstName}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, firstName: e.target.value })
                  }
                  style={inputStyle}
                />
              </div>

              <div>
                <label>Last Name</label>
                <input
                  value={partyForm.lastName}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, lastName: e.target.value })
                  }
                  style={inputStyle}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label>Title</label>
                <select
                  value={partyForm.title}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, title: e.target.value })
                  }
                  style={inputStyle}
                >
                  <option value="บริษัท">บริษัท</option>
                  <option value="ห้างหุ้นส่วนจำกัด">ห้างหุ้นส่วนจำกัด</option>
                </select>
              </div>

              <div>
                <label>Company Name</label>
                <input
                  value={partyForm.companyName}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, companyName: e.target.value })
                  }
                  style={inputStyle}
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={editingPartyId ? savePartyChanges : createParty}
          style={{
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 8,
            background: "black",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {editingPartyId ? "Save Party Changes" : "+ Add Party"}
        </button>

        <div style={{ marginTop: 20 }}>
          {(["plaintiff", "defendant", "petitioner", "objector"] as const).map(
            (role) => {
              const list = groupedParties[role];
              if (list.length === 0) return null;

              return (
                <div key={role} style={{ marginTop: 16 }}>
                  <strong>{roleLabel(role)}</strong>

                  {list.map((party) => (
                    <div
                      key={party.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 0",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <span>
                        {party.orderNo || "-"}. {renderPartyName(party)}
                      </span>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => startEditParty(party)}
                          style={smallButtonStyle}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeParty(party.id)}
                          style={smallDangerStyle}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
          )}

          {parties.length === 0 && (
            <p style={{ marginTop: 12 }}>No parties yet.</p>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <h3 style={{ margin: 0 }}>
            {editingTimelineId ? "Edit Court Timeline" : "Add Court Timeline"}
          </h3>
          {editingTimelineId && (
            <button onClick={cancelEditTimeline} style={buttonSecondary}>
              Cancel Edit
            </button>
          )}
        </div>

        <div style={grid2Style}>
          <div>
            <label>Date</label>
            <input
              type="date"
              value={timelineForm.eventDate}
              onChange={(e) =>
                setTimelineForm({
                  ...timelineForm,
                  eventDate: e.target.value,
                })
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label>Time</label>
            <input
              type="time"
              value={timelineForm.eventTime}
              onChange={(e) =>
                setTimelineForm({
                  ...timelineForm,
                  eventTime: e.target.value,
                })
              }
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: "1 / span 2" }}>
            <label>Appointment</label>
            <input
              value={timelineForm.appointment}
              onChange={(e) =>
                setTimelineForm({
                  ...timelineForm,
                  appointment: e.target.value,
                })
              }
              style={inputStyle}
              placeholder="เช่น นัดไกล่เกลี่ย / นัดสืบพยาน / นัดฟังคำพิพากษา"
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={timelineForm.done}
              onChange={(e) =>
                setTimelineForm({
                  ...timelineForm,
                  done: e.target.checked,
                })
              }
            />
            <label>Done</label>
          </div>
        </div>

        <button
          onClick={editingTimelineId ? saveTimelineChanges : createTimeline}
          style={{
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 8,
            background: "black",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {editingTimelineId ? "Save Timeline Changes" : "+ Add Timeline"}
        </button>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Court Timeline</h3>

        {sortedTimeline.length === 0 ? (
          <p>No timeline yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f5f5" }}>
                <th style={{ padding: 12 }}>Done</th>
                <th style={{ padding: 12 }}>Date</th>
                <th style={{ padding: 12 }}>Time</th>
                <th style={{ padding: 12 }}>Appointment</th>
                <th style={{ padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTimeline.map((item) => (
                <tr key={item.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 12 }}>
                    <input
                      type="checkbox"
                      checked={!!item.done}
                      onChange={() => toggleTimelineDone(item)}
                    />
                  </td>
                  <td style={{ padding: 12 }}>{item.eventDate || "-"}</td>
                  <td style={{ padding: 12 }}>{item.eventTime || "-"}</td>
                  <td style={{ padding: 12 }}>{item.appointment || "-"}</td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => startEditTimeline(item)}
                        style={smallButtonStyle}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeTimeline(item.id)}
                        style={smallDangerStyle}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Storage Information</h3>

        {!isEditingCase ? (
          <>
            <p>
              <strong>Storage:</strong> {renderStorage(caseItem.storageCategory)}
            </p>
            <p>
              <strong>Location:</strong> {caseItem.storageLocation || "-"}
            </p>
          </>
        ) : (
          <div style={grid2Style}>
            <div>
              <label>Storage</label>
              <select
                value={caseForm.storageCategory}
                onChange={(e) =>
                  setCaseForm({ ...caseForm, storageCategory: e.target.value })
                }
                style={inputStyle}
              >
                <option value="cabinet">Cabinet</option>
                <option value="activeBox">Active Box</option>
                <option value="archive">Archive</option>
              </select>
            </div>

            <div>
              <label>Location</label>
              <input
                value={caseForm.storageLocation}
                onChange={(e) =>
                  setCaseForm({ ...caseForm, storageLocation: e.target.value })
                }
                style={inputStyle}
              />
            </div>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <h3 style={{ margin: 0 }}>
            {editingTaskId ? "Edit Task" : "Add Task"}
          </h3>
          {editingTaskId && (
            <button onClick={cancelEditTask} style={buttonSecondary}>
              Cancel Edit
            </button>
          )}
        </div>

        <div style={grid2Style}>
          <input
            placeholder="Task Title"
            value={taskForm.title}
            onChange={(e) =>
              setTaskForm({ ...taskForm, title: e.target.value })
            }
            style={inputStyle}
          />

          <input
            placeholder="Assigned To"
            value={taskForm.assigneeName}
            onChange={(e) =>
              setTaskForm({ ...taskForm, assigneeName: e.target.value })
            }
            style={inputStyle}
          />

          <div>
            <label>Start Date</label>
            <input
              type="date"
              value={taskForm.startDate}
              onChange={(e) =>
                setTaskForm({ ...taskForm, startDate: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label>Due Date</label>
            <input
              type="date"
              value={taskForm.dueDate}
              onChange={(e) =>
                setTaskForm({ ...taskForm, dueDate: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label>Priority</label>
            <select
              value={taskForm.priority}
              onChange={(e) =>
                setTaskForm({ ...taskForm, priority: e.target.value })
              }
              style={inputStyle}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label>Status</label>
            <select
              value={taskForm.status}
              onChange={(e) =>
                setTaskForm({
                  ...taskForm,
                  status: e.target.value,
                  done: e.target.value === "done",
                })
              }
              style={inputStyle}
            >
              <option value="todo">To Do</option>
              <option value="doing">Doing</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={taskForm.done}
              onChange={(e) =>
                setTaskForm({
                  ...taskForm,
                  done: e.target.checked,
                  status: e.target.checked ? "done" : "todo",
                })
              }
            />
            <label>Done</label>
          </div>
        </div>

        <button
          onClick={editingTaskId ? saveTaskChanges : createTask}
          style={{
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 8,
            background: "black",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {editingTaskId ? "Save Task Changes" : "+ Create Task"}
        </button>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Tasks</h3>

        {sortedTasks.length === 0 ? (
          <p>No tasks yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f5f5" }}>
                <th style={{ padding: 12 }}>Done</th>
                <th style={{ padding: 12 }}>Title</th>
                <th style={{ padding: 12 }}>Assigned To</th>
                <th style={{ padding: 12 }}>Start Date</th>
                <th style={{ padding: 12 }}>Due Date</th>
                <th style={{ padding: 12 }}>Priority</th>
                <th style={{ padding: 12 }}>Status</th>
                <th style={{ padding: 12 }}>Urgency</th>
                <th style={{ padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((task) => (
                <tr key={task.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 12 }}>
                    <input
                      type="checkbox"
                      checked={!!task.done || task.status === "done"}
                      onChange={() => toggleDoneTask(task)}
                    />
                  </td>
                  <td style={{ padding: 12 }}>{task.title || "-"}</td>
                  <td style={{ padding: 12 }}>{task.assigneeName || "-"}</td>
                  <td style={{ padding: 12 }}>{task.startDate || "-"}</td>
                  <td style={{ padding: 12 }}>{task.dueDate || "-"}</td>
                  <td style={{ padding: 12 }}>
                    {renderPriority(task.priority)}
                  </td>
                  <td style={{ padding: 12 }}>
                    {renderTaskStatus(task.status, task.done)}
                  </td>
                  <td style={{ padding: 12 }}>{getUrgencyLabel(task)}</td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => startEditTask(task)}
                        style={smallButtonStyle}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeTask(task.id)}
                        style={smallDangerStyle}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <h3 style={{ margin: 0 }}>
            {editingTimeLogId ? "Edit Time Log" : "Add Time Log"}
          </h3>
          {editingTimeLogId && (
            <button onClick={cancelEditTimeLog} style={buttonSecondary}>
              Cancel Edit
            </button>
          )}
        </div>

        <div style={grid2Style}>
          <div>
            <label>Work Date</label>
            <input
              type="date"
              value={timeLogForm.workDate}
              onChange={(e) =>
                setTimeLogForm({ ...timeLogForm, workDate: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label>Staff</label>
            <input
              placeholder="Staff Name"
              value={timeLogForm.staffName}
              onChange={(e) =>
                setTimeLogForm({ ...timeLogForm, staffName: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label>Minutes</label>
            <input
              type="number"
              placeholder="60"
              value={timeLogForm.minutes}
              onChange={(e) =>
                setTimeLogForm({ ...timeLogForm, minutes: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label>Note</label>
            <input
              placeholder="Work description"
              value={timeLogForm.note}
              onChange={(e) =>
                setTimeLogForm({ ...timeLogForm, note: e.target.value })
              }
              style={inputStyle}
            />
          </div>
        </div>

        <button
          onClick={editingTimeLogId ? saveTimeLogChanges : createTimeLog}
          style={{
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 8,
            background: "black",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {editingTimeLogId ? "Save Time Log Changes" : "+ Create Time Log"}
        </button>
      </div>

      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <h3 style={{ margin: 0 }}>Time Logs</h3>
          <div>
            <strong>
              Total: {totalMinutes} minutes ({totalHoursText} hours)
            </strong>
          </div>
        </div>

        {timeLogs.length === 0 ? (
          <p>No time logs yet.</p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}
          >
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f5f5" }}>
                <th style={{ padding: 12 }}>Work Date</th>
                <th style={{ padding: 12 }}>Staff</th>
                <th style={{ padding: 12 }}>Minutes</th>
                <th style={{ padding: 12 }}>Note</th>
                <th style={{ padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {timeLogs.map((log) => (
                <tr key={log.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 12 }}>{log.workDate || "-"}</td>
                  <td style={{ padding: 12 }}>{log.staffName || "-"}</td>
                  <td style={{ padding: 12 }}>{log.minutes || 0}</td>
                  <td style={{ padding: 12 }}>{log.note || "-"}</td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => startEditTimeLog(log)}
                        style={smallButtonStyle}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeTimeLog(log.id)}
                        style={smallDangerStyle}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

const inputStyle = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const cardStyle = {
  marginTop: 16,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
};

const grid2Style = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const buttonPrimary = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "black",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const buttonSecondary = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const smallButtonStyle = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const smallDangerStyle = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "white",
  color: "darkred",
  border: "1px solid #ccc",
  cursor: "pointer",
};