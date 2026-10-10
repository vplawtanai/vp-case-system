"use client";
import { useCaseDetailText } from "../labels";

import CaseEditModal from "../CaseEditModal";
import { useCaseBusinessDate } from "../use-case-business-date";
import { answerDeadlineState, confirmedDeadlineOverdueDays, linkedServiceDeadline, type ServiceDeadlineLink, type AnswerExtensionRequest } from "../service-model";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";
import { createAuditLog } from "../../../../lib/auditLog";

type DeadlineItem = {
  id: string;
  case_id: number;

  order_no?: number | null;

  deadline_type?: string | null;
  deadline_other?: string | null;

  party_label?: string | null;
  party_other?: string | null;

  procedure_type?: string | null;
  service_method?: string | null;

  trigger_date?: string | null;
  original_due_date?: string | null;
  current_due_date?: string | null;

  status?: string | null;
  note?: string | null;

  created_at?: string | null;
  updated_at?: string | null;

  deleted_at?: string | null;
  deleted_by?: string | null;
};

type DeadlineExtension = {
  id: string;
  deadline_id: string;
  extension_no?: number | null;
  requested_date?: string | null;
  granted_until_date?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

type DeadlineForm = {
  order_no: string;

  deadline_type: string;
  deadline_other: string;

  party_label: string;
  party_other: string;

  procedure_type: string;
  service_method: string;

  trigger_date: string;

  status: string;
  note: string;
};

type ExtensionForm = {
  requested_date: string;
  granted_until_date: string;
  note: string;
};

type Props = {
  caseId: string;
  deadlines?: unknown[];
  revision?: number;
  onAnswer?: (partyId: string) => void;
  extensionRequest?: AnswerExtensionRequest | null;
  onExtensionClosed?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
};

const deadlineTypeOptions = [
  { value: "answer", label: "ครบกำหนดยื่นคำให้การ" },
  { value: "appeal", label: "ครบกำหนดอุทธรณ์" },
  { value: "appeal_answer", label: "ครบกำหนดแก้อุทธรณ์" },
  { value: "supreme", label: "ครบกำหนดฎีกา" },
  { value: "supreme_answer", label: "ครบกำหนดแก้ฎีกา" },
  { value: "other", label: "อื่นๆ" },
];

const partyOptions = [
  "จำเลย",
  "จำเลยที่ 1",
  "จำเลยที่ 2",
  "จำเลยที่ 3",
  "โจทก์",
  "โจทก์ที่ 1",
  "โจทก์ที่ 2",
  "โจทก์ที่ 3",
  "ผู้ร้อง",
  "ผู้คัดค้าน",
  "อื่นๆ",
];

const procedureOptions = [
  { value: "ordinary_civil", label: "คดีแพ่งสามัญ" },
  {
    value: "small_or_simple",
    label: "คดีมโนสาเร่/ไม่มีข้อยุ่งยาก",
  },
  { value: "consumer", label: "คดีผู้บริโภค" },
];

const serviceMethodOptions = [
  { value: "personal", label: "รับหมายเอง" },
  { value: "posting", label: "ปิดหมาย" },
];

const statusOptions = [
  { value: "Active", label: "Active (ยังต้องติดตาม)" },
  { value: "Done", label: "Done (เสร็จแล้ว)" },
  { value: "Cancelled", label: "Cancelled (ยกเลิก)" },
];

const emptyForm: DeadlineForm = {
  order_no: "1",

  deadline_type: "answer",
  deadline_other: "",

  party_label: "จำเลย",
  party_other: "",

  procedure_type: "ordinary_civil",
  service_method: "personal",

  trigger_date: "",

  status: "Active",
  note: "",
};

const emptyExtensionForm: ExtensionForm = {
  requested_date: "",
  granted_until_date: "",
  note: "",
};

export default function DeadlinesSection({
  caseId,
  canEdit = false,
  canDelete = false,
  revision = 0, onAnswer, extensionRequest, onExtensionClosed,
}: Props) {
  const { tr, date } = useCaseDetailText();
  const businessDate = useCaseBusinessDate();
  const caseIdNumber = Number(caseId);

  const [links, setLinks] = useState<ServiceDeadlineLink[]>([]);
  const [linksReady, setLinksReady] = useState(false);
  const handledExtension = useRef<number | null>(null);
  const linked = (id: string) => linkedServiceDeadline(links, id);
  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [extensions, setExtensions] = useState<DeadlineExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DeadlineForm>(emptyForm);

  const [extensionDeadlineId, setExtensionDeadlineId] = useState<string | null>(
    null
  );
  const [editingExtensionId, setEditingExtensionId] = useState<string | null>(
    null
  );
  const [extensionForm, setExtensionForm] =
    useState<ExtensionForm>(emptyExtensionForm);
  const [savingExtension, setSavingExtension] = useState(false);


  const loadDeadlines = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);
      setLinksReady(false);
      const {data: linkData, error: linkError} = await supabase.from("case_service_controls")
        .select("party_id,answer_deadline_id,default_deadline_id,answer_filed_on,party:parties!party_id(entity_type,company_name,title,first_name,last_name,deleted_at),attempt:case_service_attempts!case102_lawful_party(method,attempted_on)")
        .eq("case_id", caseIdNumber);
      if (!linkError) {setLinks((linkData || []) as unknown as ServiceDeadlineLink[]);setLinksReady(true);}


      const { data: deadlineData, error: deadlineError } = await supabase
        .from("case_deadlines")
        .select("*")
        .eq("case_id", caseIdNumber)
        .is("deleted_at", null)
        .order("order_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (deadlineError) {
        alert(tr("Load deadlines failed:\n" + JSON.stringify(deadlineError, null, 2)));
        setItems([]);
        setExtensions([]);
        return;
      }

      const loadedDeadlines = (deadlineData || []) as DeadlineItem[];
      setItems(loadedDeadlines);

      const deadlineIds = loadedDeadlines.map((item) => item.id);

      if (deadlineIds.length === 0) {
        setExtensions([]);
        return;
      }

      const { data: extensionData, error: extensionError } = await supabase
        .from("case_deadline_extensions")
        .select("*")
        .in("deadline_id", deadlineIds)
        .is("deleted_at", null)
        .order("extension_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (extensionError) {
        alert(
          tr("Load deadline extensions failed:\n" +
            JSON.stringify(extensionError, null, 2))
        );
        setExtensions([]);
        return;
      }

      setExtensions((extensionData || []) as DeadlineExtension[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeadlines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, revision]);

  const sortedDeadlines = useMemo(() => {
    return [...items].sort((a, b) => {
      const aScore = getDeadlineStatusScore(a, linkedServiceDeadline(links,a.id), businessDate);
      const bScore = getDeadlineStatusScore(b, linkedServiceDeadline(links,b.id), businessDate);

      if (aScore !== bScore) return aScore - bScore;

      const aDue = a.current_due_date || "9999-12-31";
      const bDue = b.current_due_date || "9999-12-31";

      if (aDue !== bDue) return aDue.localeCompare(bDue);

      return (a.order_no || 0) - (b.order_no || 0);
    });
  }, [items, links, businessDate]);

  const summary = useMemo(() => {
    const active = items.filter((item) => item.status !== "Done" && item.status !== "Cancelled").length;
    const done = items.filter((item) => item.status === "Done").length;
    const cancelled = items.filter((item) => item.status === "Cancelled").length;

    const overdue = items.filter((item) =>
      getDeadlineDueStatus(item, linkedServiceDeadline(links,item.id), businessDate).startsWith("Overdue")
    ).length;

    const today = items.filter((item) =>
      getDeadlineDueStatus(item, linkedServiceDeadline(links,item.id), businessDate).startsWith("Today")
    ).length;

    const dueSoon = items.filter((item) =>
      getDeadlineDueStatus(item, linkedServiceDeadline(links,item.id), businessDate).startsWith("Due Soon")
    ).length;

    return {
      total: items.length,
      active,
      overdue,
      today,
      dueSoon,
      done,
      cancelled,
      extensions: extensions.length,
    };
  }, [items, extensions, links, businessDate]);

  const getNextOrderNo = () => {
    const maxOrder = items.reduce((max, item) => {
      const order = item.order_no || 0;
      return order > max ? order : max;
    }, 0);

    return maxOrder + 1;
  };

  const startAdd = () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่ม Legal Deadline"));
      return;
    }

    setEditingId(null);
    setForm({
      ...emptyForm,
      order_no: String(getNextOrderNo()),
    });
    setShowForm(true);

  };

  const startEdit = (item: DeadlineItem) => {
    if (!linksReady || linked(item.id)) return;
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไข Legal Deadline"));
      return;
    }

    setEditingId(item.id);
    setShowForm(true);


    setForm({
      order_no: item.order_no ? String(item.order_no) : "1",

      deadline_type: item.deadline_type || "answer",
      deadline_other: item.deadline_other || "",

      party_label: item.party_label || "จำเลย",
      party_other: item.party_other || "",

      procedure_type: item.procedure_type || "ordinary_civil",
      service_method: item.service_method || "personal",

      trigger_date: item.trigger_date || "",

      status: item.status || "Active",
      note: item.note || "",
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  };

  const validateDeadline = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert(tr("Missing case id"));
      return false;
    }

    if (!form.deadline_type) {
      alert(tr("กรุณาเลือกประเภทกำหนดเวลา"));
      return false;
    }

    if (form.deadline_type === "other" && !form.deadline_other.trim()) {
      alert(tr("กรุณากรอกกำหนดเวลาอื่นๆ"));
      return false;
    }

    if (form.party_label === "อื่นๆ" && !form.party_other.trim()) {
      alert(tr("กรุณากรอกผู้เกี่ยวข้องอื่นๆ"));
      return false;
    }

    if (!form.trigger_date) {
      alert(tr("กรุณาเลือกวันที่ตั้งต้น / วันครบกำหนด"));
      return false;
    }

    return true;
  };

  const buildPayload = () => {
    const now = new Date().toISOString();
    const dueDate = calculateDueDate(form);

    return {
      case_id: caseIdNumber,
      order_no: form.order_no ? Number(form.order_no) : null,

      deadline_type: form.deadline_type,
      deadline_other:
        form.deadline_type === "other" ? form.deadline_other : "",

      party_label: form.party_label,
      party_other: form.party_label === "อื่นๆ" ? form.party_other : "",

      procedure_type: form.procedure_type,
      service_method:
        form.deadline_type === "answer" &&
        form.procedure_type === "ordinary_civil"
          ? form.service_method
          : "",

      trigger_date: form.trigger_date,
      original_due_date: dueDate,
      current_due_date: dueDate,

      status: form.status,
      note: form.note,

      updated_at: now,
    };
  };

  const createDeadline = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่ม Legal Deadline"));
      cancelForm();
      return;
    }

    if (!validateDeadline()) return;

    try {
      setSaving(true);

      const payload = {
        ...buildPayload(),
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };

      const { data, error } = await supabase
        .from("case_deadlines")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        alert(tr("Create deadline failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_deadlines",
        recordId: data?.id,
        action: "create",
        oldData: null,
        newData: data || payload,
        note: "Create legal deadline",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      cancelForm();
      await loadDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const updateDeadline = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไข Legal Deadline"));
      cancelForm();
      return;
    }

    if (!editingId || !linksReady || linked(editingId)) return;
    if (!validateDeadline()) return;

    try {
      setSaving(true);

      const oldData = items.find((item) => item.id === editingId) || null;
      const payload = buildPayload();

      const { data, error } = await supabase
        .from("case_deadlines")
        .update(payload)
        .eq("id", editingId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(tr("Update deadline failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_deadlines",
        recordId: editingId,
        action: "update",
        oldData,
        newData: data || payload,
        note: "Update legal deadline",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      cancelForm();
      await loadDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const deleteDeadline = async (id: string) => {
    if (!linksReady || linked(id)) return;
    if (!canDelete) {
      alert(tr("คุณไม่มีสิทธิ์ลบ Legal Deadline"));
      return;
    }

    const confirmed = window.confirm(
      tr("ต้องการลบกำหนดเวลานี้หรือไม่?\n\nระบบจะซ่อนกำหนดเวลานี้ออกจากหน้าใช้งาน แต่ยังเก็บข้อมูลและประวัติการขยายเวลาไว้ในฐานข้อมูลเพื่อใช้ตรวจสอบย้อนหลัง")
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const oldDeadline = items.find((item) => item.id === id) || null;
      const oldExtensions = extensions.filter((item) => item.deadline_id === id);

      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: "current_user",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("case_deadlines")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(tr("Soft delete deadline failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_deadlines",
        recordId: id,
        action: "soft_delete",
        oldData: {
          deadline: oldDeadline,
          extensions: oldExtensions,
        },
        newData: {
          deadline:
            data || (oldDeadline ? { ...oldDeadline, ...payload } : payload),
          extensions: oldExtensions,
        },
        note: "Soft delete legal deadline and keep related extensions",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      if (editingId === id) cancelForm();
      if (extensionDeadlineId === id) cancelExtensionForm();

      await loadDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (item: DeadlineItem) => {
    if (!linksReady || linked(item.id)) return;
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เปลี่ยนสถานะ Legal Deadline"));
      return;
    }

    const nextStatus = item.status === "Done" ? "Active" : "Done";
    const oldData = item;

    const payload = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("case_deadlines")
      .update(payload)
      .eq("id", item.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      alert(tr("Update deadline status failed:\n" + JSON.stringify(error, null, 2)));
      return;
    }

    await createAuditLog({
      caseId: caseIdNumber,
      tableName: "case_deadlines",
      recordId: item.id,
      action: "update",
      oldData,
      newData: data || {
        ...item,
        ...payload,
      },
      note:
        item.status === "Done" ? "Undo deadline status" : "Mark deadline as done",
    });
      window.dispatchEvent(new Event("case-detail-updated"));

    await loadDeadlines();
  };

  const startAddExtension = (deadlineId: string) => {
    if (!linksReady || linked(deadlineId)) return;
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่มการขยายเวลา"));
      return;
    }

    setExtensionDeadlineId(deadlineId);
    setEditingExtensionId(null);
    setExtensionForm(emptyExtensionForm);

  };

  const startEditExtension = (extension: DeadlineExtension) => {
    if (!linksReady || linked(extension.deadline_id)) return;
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไขการขยายเวลา"));
      return;
    }

    setExtensionDeadlineId(extension.deadline_id);
    setEditingExtensionId(extension.id);
    setExtensionForm({
      requested_date: extension.requested_date || "",
      granted_until_date: extension.granted_until_date || "",
      note: extension.note || "",
    });

  };

  const cancelExtensionForm = () => {
    setExtensionDeadlineId(null);
    setEditingExtensionId(null);
    setExtensionForm(emptyExtensionForm);
    if (extensionRequest) onExtensionClosed?.();
  };

  const getLatestExtensionDueDate = (
    deadlineId: string,
    nextExtensions: DeadlineExtension[]
  ) => {
    const latest = nextExtensions
      .filter((item) => item.deadline_id === deadlineId)
      .sort((a, b) => (b.extension_no || 0) - (a.extension_no || 0))[0];

    return latest?.granted_until_date || "";
  };

  const recalculateDueDateAfterExtensionDelete = (
    deadline: DeadlineItem | null,
    nextExtensions: DeadlineExtension[]
  ) => {
    if (!deadline) return "";

    return (
      getLatestExtensionDueDate(deadline.id, nextExtensions) ||
      deadline.original_due_date ||
      ""
    );
  };

  const createExtension = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่มการขยายเวลา"));
      cancelExtensionForm();
      return;
    }

    if (!extensionDeadlineId || !linksReady) return;
    const source = linked(extensionDeadlineId);
    if (source && (source.kind !== 'answer' || source.answer_filed_on || source.party?.deleted_at || source.party_id !== extensionRequest?.partyId || extensionDeadlineId !== extensionRequest.deadlineId || items.find(d=>d.id===extensionDeadlineId)?.status !== 'Active')) return;

    if (!extensionForm.granted_until_date) {
      alert(tr("กรุณาเลือกวันที่ศาลอนุญาตให้ขยายถึง"));
      return;
    }

    try {
      setSavingExtension(true);

      const oldDeadline =
        items.find((item) => item.id === extensionDeadlineId) || null;

      const existing = extensions.filter(
        (item) => item.deadline_id === extensionDeadlineId
      );

      const nextNo =
        existing.reduce((max, item) => {
          const no = item.extension_no || 0;
          return no > max ? no : max;
        }, 0) + 1;

      const now = new Date().toISOString();

      const extensionPayload = {
        deadline_id: extensionDeadlineId,
        extension_no: nextNo,
        requested_date: extensionForm.requested_date || null,
        granted_until_date: extensionForm.granted_until_date,
        note: extensionForm.note,
        created_at: now,
        updated_at: now,
      };

      const { data: insertedExtension, error: insertError } = await supabase
        .from("case_deadline_extensions")
        .insert([extensionPayload])
        .select("*")
        .single();

      if (insertError) {
        alert(
          tr("Create extension failed:\n" + JSON.stringify(insertError, null, 2))
        );
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_deadline_extensions",
        recordId: insertedExtension?.id,
        action: "create",
        oldData: null,
        newData: insertedExtension || extensionPayload,
        note: "Create deadline extension",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      const deadlineUpdatePayload = {
        current_due_date: extensionForm.granted_until_date,
        status: "Active",
        updated_at: now,
      };

      const { data: updatedDeadline, error: updateError } = await supabase
        .from("case_deadlines")
        .update(deadlineUpdatePayload)
        .eq("id", extensionDeadlineId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (updateError) {
        alert(
          tr("Update current due date failed:\n" +
            JSON.stringify(updateError, null, 2))
        );
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_deadlines",
        recordId: extensionDeadlineId,
        action: "update",
        oldData: oldDeadline,
        newData:
          updatedDeadline ||
          (oldDeadline
            ? {
                ...oldDeadline,
                ...deadlineUpdatePayload,
              }
            : deadlineUpdatePayload),
        note: "Update current due date after extension",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      cancelExtensionForm();
      await loadDeadlines();
    } finally {
      setSavingExtension(false);
    }
  };

  const updateExtension = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไขการขยายเวลา"));
      cancelExtensionForm();
      return;
    }

    if (!extensionDeadlineId || !editingExtensionId || !linksReady || linked(extensionDeadlineId)) return;

    if (!extensionForm.granted_until_date) {
      alert(tr("กรุณาเลือกวันที่ศาลอนุญาตให้ขยายถึง"));
      return;
    }

    try {
      setSavingExtension(true);

      const oldExtension =
        extensions.find((item) => item.id === editingExtensionId) || null;
      const oldDeadline =
        items.find((item) => item.id === extensionDeadlineId) || null;
      const now = new Date().toISOString();

      const extensionPayload = {
        requested_date: extensionForm.requested_date || null,
        granted_until_date: extensionForm.granted_until_date,
        note: extensionForm.note,
        updated_at: now,
      };

      const { data: updatedExtension, error: updateExtensionError } =
        await supabase
          .from("case_deadline_extensions")
          .update(extensionPayload)
          .eq("id", editingExtensionId)
          .select("*")
          .single();

      if (updateExtensionError) {
        alert(
          tr("Update extension failed:\n" +
            JSON.stringify(updateExtensionError, null, 2))
        );
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_deadline_extensions",
        recordId: editingExtensionId,
        action: "update",
        oldData: oldExtension,
        newData: updatedExtension || {
          ...oldExtension,
          ...extensionPayload,
        },
        note: "Update deadline extension",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      const nextExtensions = extensions.map((item) =>
        item.id === editingExtensionId
          ? ({
              ...item,
              ...extensionPayload,
            } as DeadlineExtension)
          : item
      );
      const nextDueDate = getLatestExtensionDueDate(
        extensionDeadlineId,
        nextExtensions
      );

      if (nextDueDate && oldDeadline?.current_due_date !== nextDueDate) {
        const deadlineUpdatePayload = {
          current_due_date: nextDueDate,
          status: "Active",
          updated_at: now,
        };

        const { data: updatedDeadline, error: updateDeadlineError } =
          await supabase
            .from("case_deadlines")
            .update(deadlineUpdatePayload)
            .eq("id", extensionDeadlineId)
            .is("deleted_at", null)
            .select("*")
            .single();

        if (updateDeadlineError) {
          alert(
            tr("Recalculate current due date failed:\n" +
              JSON.stringify(updateDeadlineError, null, 2))
          );
          return;
        }

        await createAuditLog({
          caseId: caseIdNumber,
          tableName: "case_deadlines",
          recordId: extensionDeadlineId,
          action: "update",
          oldData: oldDeadline,
          newData:
            updatedDeadline ||
            (oldDeadline
              ? {
                  ...oldDeadline,
                  ...deadlineUpdatePayload,
                }
              : deadlineUpdatePayload),
          note: "Recalculate current due date after extension update",
        });
      window.dispatchEvent(new Event("case-detail-updated"));
      }

      cancelExtensionForm();
      await loadDeadlines();
    } finally {
      setSavingExtension(false);
    }
  };

  const deleteExtension = async (extension: DeadlineExtension) => {
    if (!linksReady || linked(extension.deadline_id)) return;
    if (!canDelete) {
      alert(tr("คุณไม่มีสิทธิ์ลบการขยายเวลา"));
      return;
    }

    const confirmed = window.confirm(
      tr("ต้องการลบการขยายเวลานี้หรือไม่?\n\nระบบจะซ่อนรายการนี้และคำนวณวันครบกำหนดปัจจุบันใหม่")
    );

    if (!confirmed) return;

    const oldExtension =
      extensions.find((item) => item.id === extension.id) || extension;
    const oldDeadline =
      items.find((item) => item.id === extension.deadline_id) || null;
    const nextExtensions = extensions.filter((item) => item.id !== extension.id);
    const nextDueDate = recalculateDueDateAfterExtensionDelete(
      oldDeadline,
      nextExtensions
    );

    if (!nextDueDate) {
      alert(tr("Cannot recalculate current due date after deleting extension."));
      return;
    }

    try {
      setSavingExtension(true);

      const { data: userData } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const actor =
        userData.user?.email || userData.user?.id || "current_user";

      const extensionDeletePayload = {
        deleted_at: now,
        deleted_by: actor,
        updated_at: now,
      };

      const { data: deletedExtension, error: deleteExtensionError } =
        await supabase
          .from("case_deadline_extensions")
          .update(extensionDeletePayload)
          .eq("id", extension.id)
          .is("deleted_at", null)
          .select("*")
          .single();

      if (deleteExtensionError) {
        alert(
          tr("Delete extension failed:\n" +
            JSON.stringify(deleteExtensionError, null, 2))
        );
        return;
      }

      try {
        await createAuditLog({
          caseId: caseIdNumber,
          tableName: "case_deadline_extensions",
          recordId: extension.id,
          action: "soft_delete",
          oldData: oldExtension,
          newData: deletedExtension || {
            ...oldExtension,
            ...extensionDeletePayload,
          },
          note: "Soft delete deadline extension",
        });
      window.dispatchEvent(new Event("case-detail-updated"));
      } catch (auditError) {
        console.error("CREATE EXTENSION DELETE AUDIT LOG FAILED:", auditError);
      }

      if (oldDeadline?.current_due_date !== nextDueDate) {
        const deadlineUpdatePayload = {
          current_due_date: nextDueDate,
          updated_at: now,
        };

        const { data: updatedDeadline, error: updateDeadlineError } =
          await supabase
            .from("case_deadlines")
            .update(deadlineUpdatePayload)
            .eq("id", extension.deadline_id)
            .is("deleted_at", null)
            .select("*")
            .single();

        if (updateDeadlineError) {
          alert(
            tr("Recalculate current due date failed:\n" +
              JSON.stringify(updateDeadlineError, null, 2))
          );
          return;
        }

        try {
          await createAuditLog({
            caseId: caseIdNumber,
            tableName: "case_deadlines",
            recordId: extension.deadline_id,
            action: "update",
            oldData: oldDeadline,
            newData:
              updatedDeadline ||
              (oldDeadline
                ? {
                    ...oldDeadline,
                    ...deadlineUpdatePayload,
                  }
                : deadlineUpdatePayload),
            note: "Recalculate current due date after extension delete",
          });
      window.dispatchEvent(new Event("case-detail-updated"));
        } catch (auditError) {
          console.error(
            "CREATE DEADLINE RECALC AUDIT LOG FAILED:",
            auditError
          );
        }
      }

      if (editingExtensionId === extension.id) cancelExtensionForm();
      await loadDeadlines();
    } finally {
      setSavingExtension(false);
    }
  };

  useEffect(() => {
    if (!extensionRequest || !linksReady || loading || handledExtension.current === extensionRequest.key) return;
    const source = linkedServiceDeadline(links, extensionRequest.deadlineId);
    const deadline = items.find(d=>d.id===extensionRequest.deadlineId);
    if (!canEdit || source?.kind !== 'answer' || source.party_id !== extensionRequest.partyId || source.answer_filed_on || source.party?.deleted_at || deadline?.status !== 'Active') return;
    handledExtension.current = extensionRequest.key;
    setExtensionDeadlineId(extensionRequest.deadlineId);
    setEditingExtensionId(null);
    setExtensionForm(emptyExtensionForm);
  }, [extensionRequest, linksReady, loading, links, items, canEdit]);

  return (
    <div id="deadlines" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>{tr("Legal Deadlines")} </h3>
          <div style={subTitleStyle}>
            {tr("กำหนดเวลาทางกฎหมายและการขยายเวลา · รวม")} {summary.total} {tr("รายการ")} </div>
        </div>

        {!showForm ? (
          canEdit ? (
            <button type="button" onClick={startAdd} style={primaryButtonStyle}>
              {tr("+ Add Deadline")} </button>
          ) : null
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            {tr("Cancel")} </button>
        )}
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard label={tr("Active")} value={String(summary.active)} />
        <SummaryCard label={tr("Today")} value={String(summary.today)} />
        <SummaryCard label={tr("Due Soon")} value={String(summary.dueSoon)} />
        <SummaryCard label={tr("Overdue")} value={String(summary.overdue)} />
        <SummaryCard label={tr("Extended")} value={String(summary.extensions)} />
        <SummaryCard label={tr("Done")} value={String(summary.done)} />
      </div>

      {showForm && (
        <CaseEditModal title={editingId ? tr("Edit Deadline") : tr("Add Deadline")} onClose={cancelForm} busy={saving}>


          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>{tr("ลำดับกำหนดเวลา")} </label>
              <div style={readonlyBoxStyle}>
                {tr("Deadline")} {form.order_no || "-"}
              </div>
            </div>

            <Select
              label={tr("ประเภทกำหนดเวลา")}
              value={form.deadline_type}
              onChange={(value) =>
                setForm({
                  ...form,
                  deadline_type: value,
                  deadline_other: value === "other" ? form.deadline_other : "",
                })
              }
              options={deadlineTypeOptions}
            />

            {form.deadline_type === "other" && (
              <Input
                label={tr("ระบุกำหนดเวลาอื่นๆ")}
                value={form.deadline_other}
                onChange={(value) =>
                  setForm({ ...form, deadline_other: value })
                }
                placeholder={tr("เช่น ครบกำหนดยื่นบัญชีระบุพยาน")}
              />
            )}

            <Select
              label={tr("ฝ่าย / ผู้เกี่ยวข้อง")}
              value={form.party_label}
              onChange={(value) =>
                setForm({
                  ...form,
                  party_label: value,
                  party_other: value === "อื่นๆ" ? form.party_other : "",
                })
              }
              options={partyOptions.map((option) => ({
                value: option,
                label: option,
              }))}
            />

            {form.party_label === "อื่นๆ" && (
              <Input
                label={tr("ระบุฝ่าย / ผู้เกี่ยวข้องอื่นๆ")}
                value={form.party_other}
                onChange={(value) => setForm({ ...form, party_other: value })}
              />
            )}

            <Select
              label={tr("ประเภทคดี / Procedure")}
              value={form.procedure_type}
              onChange={(value) =>
                setForm({
                  ...form,
                  procedure_type: value,
                  service_method:
                    value === "ordinary_civil"
                      ? form.service_method || "personal"
                      : "",
                })
              }
              options={procedureOptions}
            />

            {form.deadline_type === "answer" &&
              form.procedure_type === "ordinary_civil" && (
                <Select
                  label={tr("วิธีส่งหมาย")}
                  value={form.service_method}
                  onChange={(value) =>
                    setForm({ ...form, service_method: value })
                  }
                  options={serviceMethodOptions}
                />
              )}

            <Input
              label={getTriggerDateLabel(form)}
              type="date"
              value={form.trigger_date}
              onChange={(value) => setForm({ ...form, trigger_date: value })}
            />

            <div>
              <label style={labelStyle}>{tr("วันครบกำหนดที่ระบบคำนวณ")} </label>
              <div style={readonlyBoxStyle}>
                {calculateDueDate(form)
                  ? date(calculateDueDate(form))
                  : "-"}
              </div>
            </div>

            <Select
              label={tr("Status")}
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
              options={statusOptions}
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label={tr("Note")}
                value={form.note}
                onChange={(value) => setForm({ ...form, note: value })}
                placeholder={tr("หมายเหตุเพิ่มเติม")}
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={editingId ? updateDeadline : createDeadline}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? tr("Saving...") : tr("Save")}
            </button>

            <button
              type="button"
              onClick={cancelForm}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              {tr("Cancel")} </button>
          </div>
        </CaseEditModal>
      )}

      {!linksReady && !loading && <p role="alert">{tr("answer.deadlineLinksError")}</p>}
      {loading ? (
        <div style={emptyStyle}>{tr("Loading deadlines...")} </div>
      ) : sortedDeadlines.length === 0 ? (
        <div style={emptyStyle}>{tr("No deadlines added.")} </div>
      ) : (
        <div style={deadlineListStyle}>
          {sortedDeadlines.map((item) => (
            <DeadlineCard
              key={item.id}
              item={item}
              businessDate={businessDate}
              extensions={extensions.filter((ex) => ex.deadline_id === item.id)}
              extensionDeadlineId={extensionDeadlineId}
              editingExtensionId={editingExtensionId}
              extensionForm={extensionForm}
              savingExtension={savingExtension}
              canEdit={canEdit && linksReady}
              canDelete={canDelete && linksReady}
              link={linked(item.id)}
              onAnswer={onAnswer}
              answerExtension={extensionRequest?.deadlineId === item.id && extensionRequest?.partyId === linked(item.id)?.party_id}

              onEdit={startEdit}
              onDelete={deleteDeadline}
              onToggleDone={toggleDone}
              onStartAddExtension={startAddExtension}
              onStartEditExtension={startEditExtension}
              onDeleteExtension={deleteExtension}
              onCancelExtension={cancelExtensionForm}
              onChangeExtensionForm={setExtensionForm}
              onCreateExtension={createExtension}
              onUpdateExtension={updateExtension}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function SummaryCard({ label, value }: { label: string; value: string }) {
  const { tr } = useCaseDetailText();
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{tr(label)}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function DeadlineCard({
  item, businessDate,
  extensions,
  extensionDeadlineId,
  editingExtensionId,
  extensionForm,
  savingExtension,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onToggleDone,
  link, onAnswer, answerExtension = false,
  onStartAddExtension,
  onStartEditExtension,
  onDeleteExtension,
  onCancelExtension,
  onChangeExtensionForm,
  onCreateExtension,
  onUpdateExtension,
}: {
  item: DeadlineItem;
  businessDate: string;
  link?: ReturnType<typeof linkedServiceDeadline>;
  onAnswer?: (partyId: string) => void;
  answerExtension?: boolean;
  extensions: DeadlineExtension[];
  extensionDeadlineId: string | null;
  editingExtensionId: string | null;
  extensionForm: ExtensionForm;
  savingExtension: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (item: DeadlineItem) => void;
  onDelete: (id: string) => void;
  onToggleDone: (item: DeadlineItem) => void;
  onStartAddExtension: (id: string) => void;
  onStartEditExtension: (extension: DeadlineExtension) => void;
  onDeleteExtension: (extension: DeadlineExtension) => void;
  onCancelExtension: () => void;
  onChangeExtensionForm: (form: ExtensionForm) => void;
  onCreateExtension: () => void;
  onUpdateExtension: () => void;
}) {
  const { tr, date } = useCaseDetailText();
  const deadlineText = link?.kind === 'default' ? 'service.defaultDue' :
    item.deadline_type === "other"
      ? item.deadline_other || "อื่นๆ"
      : renderDeadlineType(item.deadline_type);

  const partyText =
    item.party_label === "อื่นๆ"
      ? item.party_other || "อื่นๆ"
      : item.party_label || "-";

  const answerState = link?.kind === 'answer' ? answerDeadlineState(link,item,businessDate) : null;
  const overdueDays = answerState?.overdueDays ?? confirmedDeadlineOverdueDays(item,link?.default_deadline_id,businessDate);
  const dueStatus = getDeadlineDueStatus(item,link,businessDate);
  const isDone = item.status === "Done";
  const isAddingExtension = extensionDeadlineId === item.id;
  const isEditingExtension = isAddingExtension && !!editingExtensionId;
  const showActions = !link && (canEdit || canDelete);

  return (
    <div
      id={`case-deadline-${item.id}`}
      tabIndex={-1}
      style={{
        ...deadlineCardStyle,
        background: isDone ? "#f7f7f7" : getDeadlineBackground(dueStatus),
      }}
    >
      <div style={deadlineHeaderStyle}>
        <div>
          <div style={deadlineTitleStyle}>
            {tr("Deadline")} {item.order_no || "-"} : {tr(deadlineText)}
          </div>

          <div style={deadlineMatterStyle}>{link ? link.name || tr('service.unnamed') : tr(partyText)}</div>
          {link && <p style={infoLabelStyle}>{tr('answer.linkedDeadlineHint')}</p>}

          <div style={badgeRowStyle}>
            <span style={getStatusBadgeStyle(item.status)}>
              {tr(answerState ? 'answer.status.'+answerState.status : renderStatus(item.status))}
            </span>
            {(!answerState || overdueDays>0) && <span style={getDueStatusBadgeStyle(dueStatus)}>{overdueDays>0 ? tr('answer.overdueDays').replace('{days}',String(overdueDays)) : tr(dueStatus)}</span>}
            {extensions.length > 0 && (
              <span style={extensionBadgeStyle}>
                {tr("Extended")} {extensions.length} {tr("time(s)")} </span>
            )}
          </div>
        </div>

        {canEdit && !link && (
          <button
            type="button"
            onClick={() => onToggleDone(item)}
            style={isDone ? doneButtonStyle : smallButtonStyle}
          >
            {isDone ? tr("Undo") : tr("Done")}
          </button>
        )}
      </div>

      {answerState && overdueDays>0 && <p style={{...noteBlockStyle,background:'#fff7e9',color:'#8c5d23',fontSize:13,lineHeight:1.7}}>{tr('answer.overdueHint')}</p>}
      {link && <div style={deadlineMetaGridStyle}>
        <InfoLine label={tr('answer.deadlineSource')} value={link.kind === 'answer' ? `${tr(link.attempt?.method ? 'service.method.'+link.attempt.method : 'service.methodUnknown')} · ${date(link.attempt?.attempted_on)}` : tr('service.defaultDue')}/>
        {link.kind === 'answer' && link.answer_filed_on && <InfoLine label={tr('service.answeredOn')} value={date(link.answer_filed_on)}/>}
      </div>}
      <div style={deadlineMetaGridStyle}>
        {!link && <><InfoLine
          label={tr("Procedure")}
          value={tr(renderProcedureType(item.procedure_type))}
        />
        <InfoLine
          label={tr("Service / Trigger")}
          value={tr(renderServiceMethod(item.service_method))}
        />
        <InfoLine
          label={tr("Trigger Date")}
          value={date(item.trigger_date)}
        /></>}
        {(!link || extensions.length>0) && <InfoLine
          label={tr("Original Due Date")}
          value={date(item.original_due_date)}
        />}
        <InfoLine
          label={tr(link && !extensions.length ? "Due Date" : "Current Due Date")}
          value={date(item.current_due_date)}
        />
      </div>

      {item.note && (
        <div style={noteBlockStyle}>
          <div style={infoLabelStyle}>{tr("Note")} </div>
          <div style={infoValueStyle}>{item.note}</div>
        </div>
      )}

      {extensions.length > 0 && (
        <div style={extensionListStyle}>
          <div style={extensionTitleStyle}>{tr("Extensions")} </div>
          {extensions.map((ex) => (
            <div key={ex.id} style={extensionItemStyle}>
              <div style={extensionRowHeaderStyle}>
                <div style={infoValueStyle}>
                  {tr("ขยายครั้งที่")} {ex.extension_no || "-"} {tr("ถึงวันที่")} {" "}
                  {date(ex.granted_until_date)}
                </div>
                {!link && (canEdit || canDelete) && (
                  <div style={extensionActionWrapStyle}>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onStartEditExtension(ex)}
                        style={tinyButtonStyle}
                      >
                        {tr("Edit")} </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteExtension(ex)}
                        style={tinyDangerButtonStyle}
                      >
                        {tr("Delete")} </button>
                    )}
                  </div>
                )}
              </div>
              {ex.requested_date && (
                <div style={infoLabelStyle}>
                  {tr("Requested:")} {date(ex.requested_date)}
                </div>
              )}
              {ex.note && <div style={infoLabelStyle}>{ex.note}</div>}
            </div>
          ))}
        </div>
      )}

      {isAddingExtension && canEdit && (!link || answerExtension) && (
        <CaseEditModal title={isEditingExtension ? tr("Edit Extension") : tr("Add Extension")} onClose={onCancelExtension} busy={savingExtension}>


          {link && <p>{link.name || tr('service.unnamed')} · {tr('service.answerDue')}: {date(item.current_due_date)}</p>}
          <div style={formGridStyle}>
            <Input
              label={tr("วันที่ยื่นคำร้องขยายเวลา")}
              type="date"
              value={extensionForm.requested_date}
              onChange={(value) =>
                onChangeExtensionForm({
                  ...extensionForm,
                  requested_date: value,
                })
              }
            />

            <Input
              label={tr("ศาลอนุญาตถึงวันที่")}
              type="date"
              value={extensionForm.granted_until_date}
              onChange={(value) =>
                onChangeExtensionForm({
                  ...extensionForm,
                  granted_until_date: value,
                })
              }
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label={tr("หมายเหตุการขยายเวลา")}
                value={extensionForm.note}
                onChange={(value) =>
                  onChangeExtensionForm({
                    ...extensionForm,
                    note: value,
                  })
                }
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={isEditingExtension ? onUpdateExtension : onCreateExtension}
              disabled={savingExtension}
              style={primaryButtonStyle}
            >
              {savingExtension
                ? tr("Saving...")
                : isEditingExtension
                  ? tr("Update Extension")
                  : tr("Save Extension")}
            </button>

            <button
              type="button"
              onClick={onCancelExtension}
              disabled={savingExtension}
              style={secondaryButtonStyle}
            >
              {tr("Cancel")} </button>
          </div>
        </CaseEditModal>
      )}

      {link && onAnswer && !link.party?.deleted_at && <button type="button" style={smallButtonStyle} onClick={()=>onAnswer(link.party_id)}>{tr('answer.goToAnswer')}</button>}
      {showActions && (
        <div style={actionWrapStyle}>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => onEdit(item)}
                style={smallButtonStyle}
              >
                {tr("Edit")} </button>

              <button
                type="button"
                onClick={() => onStartAddExtension(item.id)}
                style={smallButtonStyle}
              >
                {tr("+ Extension")} </button>
            </>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              style={dangerButtonStyle}
            >
              {tr("Delete")} </button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { tr } = useCaseDetailText();
  return (
    <div style={infoLineStyle}>
      <div style={infoLabelStyle}>{tr(label)}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <input aria-label={tr(label)}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <select aria-label={tr(label)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {tr(option.label)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <textarea aria-label={tr(label)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={textareaStyle}
      />
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function calculateDueDate(form: DeadlineForm) {
  if (!form.trigger_date) return "";

  if (form.deadline_type === "answer") {
    if (form.procedure_type === "ordinary_civil") {
      if (form.service_method === "personal") {
        return addDays(form.trigger_date, 15);
      }

      if (form.service_method === "posting") {
        return addDays(form.trigger_date, 30);
      }
    }

    if (
      form.procedure_type === "small_or_simple" ||
      form.procedure_type === "consumer"
    ) {
      return form.trigger_date;
    }
  }

  return form.trigger_date;
}

function addDays(dateString: string, days: number) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTriggerDateLabel(form: DeadlineForm) {
  if (form.deadline_type === "answer") {
    if (form.procedure_type === "ordinary_civil") {
      if (form.service_method === "posting") return "วันที่ปิดหมาย";
      return "วันที่ได้รับหมาย";
    }

    return "วันนัดแรก";
  }

  return "วันครบกำหนด";
}

function renderDeadlineType(type?: string | null) {
  if (type === "answer") return "ครบกำหนดยื่นคำให้การ";
  if (type === "appeal") return "ครบกำหนดอุทธรณ์";
  if (type === "appeal_answer") return "ครบกำหนดแก้อุทธรณ์";
  if (type === "supreme") return "ครบกำหนดฎีกา";
  if (type === "supreme_answer") return "ครบกำหนดแก้ฎีกา";
  if (type === "other") return "อื่นๆ";
  return "-";
}

function renderProcedureType(type?: string | null) {
  if (type === "ordinary_civil") return "คดีแพ่งสามัญ";
  if (type === "small_or_simple") return "คดีมโนสาเร่/ไม่มีข้อยุ่งยาก";
  if (type === "consumer") return "คดีผู้บริโภค";
  return "-";
}

function renderServiceMethod(method?: string | null) {
  if (method === "personal") return "รับหมายเอง";
  if (method === "posting") return "ปิดหมาย";
  return "-";
}

function renderStatus(status?: string | null) {
  if (status === "Active") return "Active (ยังต้องติดตาม)";
  if (status === "Done") return "Done (เสร็จแล้ว)";
  if (status === "Cancelled") return "Cancelled (ยกเลิก)";
  return "Active (ยังต้องติดตาม)";
}

function getDeadlineDueStatus(item: DeadlineItem, link?: ReturnType<typeof linkedServiceDeadline>, businessDate?: string) {
  if (link && businessDate) {
    const state = link.kind==='answer' ? answerDeadlineState(link,item,businessDate) : null;
    if (state?.status==='answered' || item.status==='Done') return "Done (เสร็จแล้ว)";
    if (item.status==='Cancelled' || item.deleted_at) return "Cancelled (ยกเลิก)";
    if (!item.current_due_date || item.status!=='Active') return "No Due Date (ไม่กำหนดวัน)";
    const overdue = state?.overdueDays ?? confirmedDeadlineOverdueDays(item,link.default_deadline_id,businessDate);
    if (overdue>0) return "Overdue (เกินกำหนด)";
    const days = (Date.parse(item.current_due_date+'T00:00:00Z')-Date.parse(businessDate+'T00:00:00Z'))/86400000;
    return days===0 ? "Today (ครบกำหนดวันนี้)" : days>0 && days<=3 ? "Due Soon (ใกล้ครบกำหนด)" : "Normal (ปกติ)";
  }
  if (item.status === "Done") return "Done (เสร็จแล้ว)";
  if (item.status === "Cancelled") return "Cancelled (ยกเลิก)";
  if (!item.current_due_date) return "No Due Date (ไม่กำหนดวัน)";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(item.current_due_date);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "Overdue (เกินกำหนด)";
  if (diffDays === 0) return "Today (ครบกำหนดวันนี้)";
  if (diffDays <= 3) return "Due Soon (ใกล้ครบกำหนด)";
  return "Normal (ปกติ)";
}

function getDeadlineStatusScore(item: DeadlineItem, link?: ReturnType<typeof linkedServiceDeadline>, businessDate?: string) {
  const dueStatus = getDeadlineDueStatus(item,link,businessDate);

  if (dueStatus.startsWith("Overdue")) return 1;
  if (dueStatus.startsWith("Today")) return 2;
  if (dueStatus.startsWith("Due Soon")) return 3;
  if (dueStatus.startsWith("Normal")) return 4;
  if (dueStatus.startsWith("No Due Date")) return 5;
  if (dueStatus.startsWith("Cancelled")) return 6;
  if (dueStatus.startsWith("Done")) return 7;

  return 9;
}

function getDeadlineBackground(dueStatus: string) {
  if (dueStatus.startsWith("Overdue")) return "#fff5f5";
  if (dueStatus.startsWith("Today")) return "#fff8e1";
  if (dueStatus.startsWith("Due Soon")) return "#fffaf0";
  if (dueStatus.startsWith("Cancelled")) return "#f8fafc";
  return "#ffffff";
}

function getStatusBadgeStyle(status?: string | null): CSSProperties {
  if (status === "Done") {
    return {
      ...badgeBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  if (status === "Cancelled") {
    return {
      ...badgeBaseStyle,
      background: "#f1f5f9",
      color: "#475467",
      border: "1px solid #d0d5dd",
    };
  }

  return {
    ...badgeBaseStyle,
    background: "#fff8e1",
    color: "#b54708",
    border: "1px solid #eedc9a",
  };
}

function getDueStatusBadgeStyle(dueStatus: string): CSSProperties {
  if (dueStatus.startsWith("Overdue")) {
    return {
      ...badgeBaseStyle,
      background: "#ffe5e5",
      color: "#b42318",
      border: "1px solid #f1b5b5",
    };
  }

  if (dueStatus.startsWith("Today")) {
    return {
      ...badgeBaseStyle,
      background: "#fff3cd",
      color: "#b54708",
      border: "1px solid #f0d58a",
    };
  }

  if (dueStatus.startsWith("Due Soon")) {
    return {
      ...badgeBaseStyle,
      background: "#fff8e1",
      color: "#b54708",
      border: "1px solid #eedc9a",
    };
  }

  if (dueStatus.startsWith("Done")) {
    return {
      ...badgeBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  if (dueStatus.startsWith("Cancelled")) {
    return {
      ...badgeBaseStyle,
      background: "#f1f5f9",
      color: "#475467",
      border: "1px solid #d0d5dd",
    };
  }

  return {
    ...badgeBaseStyle,
    background: "#f8fafc",
    color: "#475467",
    border: "1px solid #dde3ea",
  };
}


/* =========================================================
   STYLES
========================================================= */

const sectionStyle: CSSProperties = {
  border: "1px solid #dddddd",
  padding: "clamp(12px, 2vw, 16px)",
  borderRadius: 14,
  background: "#ffffff",
  color: "#183854",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#183854",
  fontSize: 18,
  fontWeight: 700,
};

const subTitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#666666",
  fontSize: 13,
  lineHeight: 1.45,
};

const primaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#000000",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#ffffff",
  color: "#183854",
  borderRadius: 8,
  border: "1px solid #cccccc",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 11,
  background: "#f7f9fc",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 4,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const summaryValueStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#183854",
};


const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 3,
  color: "#777777",
  fontWeight: 700,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  background: "#ffffff",
  color: "#183854",
  colorScheme: "light",
  boxSizing: "border-box",
  fontSize: 13,
};

const readonlyBoxStyle: CSSProperties = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#eeeeee",
  color: "#183854",
  boxSizing: "border-box",
  fontWeight: 700,
  fontSize: 13,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 76,
  resize: "vertical",
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  flexWrap: "wrap",
};

const emptyStyle: CSSProperties = {
  padding: 14,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
};

const deadlineListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
  gap: 10,
};

const deadlineCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 12,
  color: "#183854",
  boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
};

const deadlineHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 10,
};

const deadlineTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#183854",
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const deadlineMatterStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 13,
  color: "#222222",
  fontWeight: 700,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 7,
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};

const extensionBadgeStyle: CSSProperties = {
  ...badgeBaseStyle,
  background: "#edf4ff",
  color: "#175cd3",
  border: "1px solid #b2ccff",
};

const deadlineMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 8,
  marginBottom: 8,
};

const infoLineStyle: CSSProperties = {
  padding: "7px 8px",
  border: "1px solid #eeeeee",
  borderRadius: 10,
  background: "#f7f9fc",
  minWidth: 0,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 2,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#183854",
  fontWeight: 700,
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const noteBlockStyle: CSSProperties = {
  padding: "8px 9px",
  borderRadius: 10,
  background: "#f7f9fc",
  border: "1px solid #eeeeee",
  marginTop: 8,
};

const extensionListStyle: CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
};

const extensionTitleStyle: CSSProperties = {
  fontWeight: 700,
  marginBottom: 6,
  color: "#183854",
  fontSize: 14,
};


const extensionItemStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 10,
  padding: 9,
  background: "#ffffff",
  marginBottom: 8,
};

const extensionRowHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "flex-start",
};

const extensionActionWrapStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};


const actionWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
  flexWrap: "wrap",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#183854",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const tinyButtonStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 7,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#183854",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
};

const tinyDangerButtonStyle: CSSProperties = {
  ...tinyButtonStyle,
  border: "1px solid #f0c4c4",
  background: "#fff5f5",
  color: "#a40000",
};

const doneButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #b9dfc3",
  background: "#e6f4ea",
  color: "#067647",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};
