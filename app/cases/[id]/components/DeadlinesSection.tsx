"use client";

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
}: Props) {
  const caseIdNumber = Number(caseId);

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

  const formRef = useRef<HTMLDivElement | null>(null);
  const extensionFormRef = useRef<HTMLDivElement | null>(null);

  const scrollToForm = () => {
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const scrollToExtensionForm = () => {
    window.setTimeout(() => {
      extensionFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const loadDeadlines = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data: deadlineData, error: deadlineError } = await supabase
        .from("case_deadlines")
        .select("*")
        .eq("case_id", caseIdNumber)
        .is("deleted_at", null)
        .order("order_no", { ascending: true })
        .order("created_at", { ascending: true });

      if (deadlineError) {
        alert("Load deadlines failed:\n" + JSON.stringify(deadlineError, null, 2));
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
          "Load deadline extensions failed:\n" +
            JSON.stringify(extensionError, null, 2)
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
  }, [caseId]);

  const sortedDeadlines = useMemo(() => {
    return [...items].sort((a, b) => {
      const aScore = getDeadlineStatusScore(a);
      const bScore = getDeadlineStatusScore(b);

      if (aScore !== bScore) return aScore - bScore;

      const aDue = a.current_due_date || "9999-12-31";
      const bDue = b.current_due_date || "9999-12-31";

      if (aDue !== bDue) return aDue.localeCompare(bDue);

      return (a.order_no || 0) - (b.order_no || 0);
    });
  }, [items]);

  const summary = useMemo(() => {
    const active = items.filter((item) => item.status !== "Done" && item.status !== "Cancelled").length;
    const done = items.filter((item) => item.status === "Done").length;
    const cancelled = items.filter((item) => item.status === "Cancelled").length;

    const overdue = items.filter((item) =>
      getDeadlineDueStatus(item).startsWith("Overdue")
    ).length;

    const today = items.filter((item) =>
      getDeadlineDueStatus(item).startsWith("Today")
    ).length;

    const dueSoon = items.filter((item) =>
      getDeadlineDueStatus(item).startsWith("Due Soon")
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
  }, [items, extensions]);

  const getNextOrderNo = () => {
    const maxOrder = items.reduce((max, item) => {
      const order = item.order_no || 0;
      return order > max ? order : max;
    }, 0);

    return maxOrder + 1;
  };

  const startAdd = () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เพิ่ม Legal Deadline");
      return;
    }

    setEditingId(null);
    setForm({
      ...emptyForm,
      order_no: String(getNextOrderNo()),
    });
    setShowForm(true);
    scrollToForm();
  };

  const startEdit = (item: DeadlineItem) => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไข Legal Deadline");
      return;
    }

    setEditingId(item.id);
    setShowForm(true);
    scrollToForm();

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
      alert("Missing case id");
      return false;
    }

    if (!form.deadline_type) {
      alert("กรุณาเลือกประเภทกำหนดเวลา");
      return false;
    }

    if (form.deadline_type === "other" && !form.deadline_other.trim()) {
      alert("กรุณากรอกกำหนดเวลาอื่นๆ");
      return false;
    }

    if (form.party_label === "อื่นๆ" && !form.party_other.trim()) {
      alert("กรุณากรอกผู้เกี่ยวข้องอื่นๆ");
      return false;
    }

    if (!form.trigger_date) {
      alert("กรุณาเลือกวันที่ตั้งต้น / วันครบกำหนด");
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
      alert("คุณไม่มีสิทธิ์เพิ่ม Legal Deadline");
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
        alert("Create deadline failed:\n" + JSON.stringify(error, null, 2));
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

      cancelForm();
      await loadDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const updateDeadline = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไข Legal Deadline");
      cancelForm();
      return;
    }

    if (!editingId) return;
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
        alert("Update deadline failed:\n" + JSON.stringify(error, null, 2));
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

      cancelForm();
      await loadDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const deleteDeadline = async (id: string) => {
    if (!canDelete) {
      alert("คุณไม่มีสิทธิ์ลบ Legal Deadline");
      return;
    }

    const confirmed = window.confirm(
      "ต้องการลบกำหนดเวลานี้หรือไม่?\n\nระบบจะซ่อนกำหนดเวลานี้ออกจากหน้าใช้งาน แต่ยังเก็บข้อมูลและประวัติการขยายเวลาไว้ในฐานข้อมูลเพื่อใช้ตรวจสอบย้อนหลัง"
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
        alert("Soft delete deadline failed:\n" + JSON.stringify(error, null, 2));
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

      if (editingId === id) cancelForm();
      if (extensionDeadlineId === id) cancelExtensionForm();

      await loadDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (item: DeadlineItem) => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เปลี่ยนสถานะ Legal Deadline");
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
      alert("Update deadline status failed:\n" + JSON.stringify(error, null, 2));
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

    await loadDeadlines();
  };

  const startAddExtension = (deadlineId: string) => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เพิ่มการขยายเวลา");
      return;
    }

    setExtensionDeadlineId(deadlineId);
    setEditingExtensionId(null);
    setExtensionForm(emptyExtensionForm);
    scrollToExtensionForm();
  };

  const startEditExtension = (extension: DeadlineExtension) => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขการขยายเวลา");
      return;
    }

    setExtensionDeadlineId(extension.deadline_id);
    setEditingExtensionId(extension.id);
    setExtensionForm({
      requested_date: extension.requested_date || "",
      granted_until_date: extension.granted_until_date || "",
      note: extension.note || "",
    });
    scrollToExtensionForm();
  };

  const cancelExtensionForm = () => {
    setExtensionDeadlineId(null);
    setEditingExtensionId(null);
    setExtensionForm(emptyExtensionForm);
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
      alert("คุณไม่มีสิทธิ์เพิ่มการขยายเวลา");
      cancelExtensionForm();
      return;
    }

    if (!extensionDeadlineId) return;

    if (!extensionForm.granted_until_date) {
      alert("กรุณาเลือกวันที่ศาลอนุญาตให้ขยายถึง");
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
          "Create extension failed:\n" + JSON.stringify(insertError, null, 2)
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
          "Update current due date failed:\n" +
            JSON.stringify(updateError, null, 2)
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

      cancelExtensionForm();
      await loadDeadlines();
    } finally {
      setSavingExtension(false);
    }
  };

  const updateExtension = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขการขยายเวลา");
      cancelExtensionForm();
      return;
    }

    if (!extensionDeadlineId || !editingExtensionId) return;

    if (!extensionForm.granted_until_date) {
      alert("กรุณาเลือกวันที่ศาลอนุญาตให้ขยายถึง");
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
          "Update extension failed:\n" +
            JSON.stringify(updateExtensionError, null, 2)
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
            "Recalculate current due date failed:\n" +
              JSON.stringify(updateDeadlineError, null, 2)
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
      }

      cancelExtensionForm();
      await loadDeadlines();
    } finally {
      setSavingExtension(false);
    }
  };

  const deleteExtension = async (extension: DeadlineExtension) => {
    if (!canDelete) {
      alert("คุณไม่มีสิทธิ์ลบการขยายเวลา");
      return;
    }

    const confirmed = window.confirm(
      "ต้องการลบการขยายเวลานี้หรือไม่?\n\nระบบจะซ่อนรายการนี้และคำนวณวันครบกำหนดปัจจุบันใหม่"
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
      alert("Cannot recalculate current due date after deleting extension.");
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
          "Delete extension failed:\n" +
            JSON.stringify(deleteExtensionError, null, 2)
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
            "Recalculate current due date failed:\n" +
              JSON.stringify(updateDeadlineError, null, 2)
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

  return (
    <div id="deadlines" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Legal Deadlines</h3>
          <div style={subTitleStyle}>
            กำหนดเวลาทางกฎหมายและการขยายเวลา · รวม {summary.total} รายการ
          </div>
        </div>

        {!showForm ? (
          canEdit ? (
            <button type="button" onClick={startAdd} style={primaryButtonStyle}>
              + Add Deadline
            </button>
          ) : null
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard label="Active" value={String(summary.active)} />
        <SummaryCard label="Today" value={String(summary.today)} />
        <SummaryCard label="Due Soon" value={String(summary.dueSoon)} />
        <SummaryCard label="Overdue" value={String(summary.overdue)} />
        <SummaryCard label="Extended" value={String(summary.extensions)} />
        <SummaryCard label="Done" value={String(summary.done)} />
      </div>

      {showForm && (
        <div ref={formRef} style={formCardStyle}>
          <div style={formHeaderStyle}>
            <div>
              <h4 style={formTitleStyle}>
                {editingId ? "Edit Deadline" : "Add Deadline"}
              </h4>
              <div style={formSubTitleStyle}>
                บันทึกประเภทกำหนดเวลา ฝ่ายที่เกี่ยวข้อง วิธีส่งหมาย และวันครบกำหนด
              </div>
            </div>

            {editingId && <span style={editBadgeStyle}>Editing</span>}
          </div>

          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>ลำดับกำหนดเวลา</label>
              <div style={readonlyBoxStyle}>
                Deadline {form.order_no || "-"}
              </div>
            </div>

            <Select
              label="ประเภทกำหนดเวลา"
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
                label="ระบุกำหนดเวลาอื่นๆ"
                value={form.deadline_other}
                onChange={(value) =>
                  setForm({ ...form, deadline_other: value })
                }
                placeholder="เช่น ครบกำหนดยื่นบัญชีระบุพยาน"
              />
            )}

            <Select
              label="ฝ่าย / ผู้เกี่ยวข้อง"
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
                label="ระบุฝ่าย / ผู้เกี่ยวข้องอื่นๆ"
                value={form.party_other}
                onChange={(value) => setForm({ ...form, party_other: value })}
              />
            )}

            <Select
              label="ประเภทคดี / Procedure"
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
                  label="วิธีส่งหมาย"
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
              <label style={labelStyle}>วันครบกำหนดที่ระบบคำนวณ</label>
              <div style={readonlyBoxStyle}>
                {calculateDueDate(form)
                  ? formatDisplayDate(calculateDueDate(form))
                  : "-"}
              </div>
            </div>

            <Select
              label="Status"
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
              options={statusOptions}
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="Note"
                value={form.note}
                onChange={(value) => setForm({ ...form, note: value })}
                placeholder="หมายเหตุเพิ่มเติม"
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
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={cancelForm}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={emptyStyle}>Loading deadlines...</div>
      ) : sortedDeadlines.length === 0 ? (
        <div style={emptyStyle}>No deadlines added.</div>
      ) : (
        <div style={deadlineListStyle}>
          {sortedDeadlines.map((item) => (
            <DeadlineCard
              key={item.id}
              item={item}
              extensions={extensions.filter((ex) => ex.deadline_id === item.id)}
              extensionDeadlineId={extensionDeadlineId}
              editingExtensionId={editingExtensionId}
              extensionForm={extensionForm}
              savingExtension={savingExtension}
              canEdit={canEdit}
              canDelete={canDelete}
              extensionFormRef={extensionFormRef}
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
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function DeadlineCard({
  item,
  extensions,
  extensionDeadlineId,
  editingExtensionId,
  extensionForm,
  savingExtension,
  canEdit,
  canDelete,
  extensionFormRef,
  onEdit,
  onDelete,
  onToggleDone,
  onStartAddExtension,
  onStartEditExtension,
  onDeleteExtension,
  onCancelExtension,
  onChangeExtensionForm,
  onCreateExtension,
  onUpdateExtension,
}: {
  item: DeadlineItem;
  extensions: DeadlineExtension[];
  extensionDeadlineId: string | null;
  editingExtensionId: string | null;
  extensionForm: ExtensionForm;
  savingExtension: boolean;
  canEdit: boolean;
  canDelete: boolean;
  extensionFormRef: React.RefObject<HTMLDivElement | null>;
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
  const deadlineText =
    item.deadline_type === "other"
      ? item.deadline_other || "อื่นๆ"
      : renderDeadlineType(item.deadline_type);

  const partyText =
    item.party_label === "อื่นๆ"
      ? item.party_other || "อื่นๆ"
      : item.party_label || "-";

  const dueStatus = getDeadlineDueStatus(item);
  const isDone = item.status === "Done";
  const isAddingExtension = extensionDeadlineId === item.id;
  const isEditingExtension = isAddingExtension && !!editingExtensionId;
  const showActions = canEdit || canDelete;

  return (
    <div
      style={{
        ...deadlineCardStyle,
        background: isDone ? "#f7f7f7" : getDeadlineBackground(dueStatus),
      }}
    >
      <div style={deadlineHeaderStyle}>
        <div>
          <div style={deadlineTitleStyle}>
            Deadline {item.order_no || "-"} : {deadlineText}
          </div>

          <div style={deadlineMatterStyle}>{partyText}</div>

          <div style={badgeRowStyle}>
            <span style={getStatusBadgeStyle(item.status)}>
              {renderStatus(item.status)}
            </span>
            <span style={getDueStatusBadgeStyle(dueStatus)}>{dueStatus}</span>
            {extensions.length > 0 && (
              <span style={extensionBadgeStyle}>
                Extended {extensions.length} time(s)
              </span>
            )}
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => onToggleDone(item)}
            style={isDone ? doneButtonStyle : smallButtonStyle}
          >
            {isDone ? "Undo" : "Done"}
          </button>
        )}
      </div>

      <div style={deadlineMetaGridStyle}>
        <InfoLine
          label="Procedure"
          value={renderProcedureType(item.procedure_type)}
        />
        <InfoLine
          label="Service / Trigger"
          value={renderServiceMethod(item.service_method)}
        />
        <InfoLine
          label="Trigger Date"
          value={formatDisplayDate(item.trigger_date)}
        />
        <InfoLine
          label="Original Due Date"
          value={formatDisplayDate(item.original_due_date)}
        />
        <InfoLine
          label="Current Due Date"
          value={formatDisplayDate(item.current_due_date)}
        />
      </div>

      {item.note && (
        <div style={noteBlockStyle}>
          <div style={infoLabelStyle}>Note</div>
          <div style={infoValueStyle}>{item.note}</div>
        </div>
      )}

      {extensions.length > 0 && (
        <div style={extensionListStyle}>
          <div style={extensionTitleStyle}>Extensions</div>
          {extensions.map((ex) => (
            <div key={ex.id} style={extensionItemStyle}>
              <div style={extensionRowHeaderStyle}>
                <div style={infoValueStyle}>
                  ขยายครั้งที่ {ex.extension_no || "-"} ถึงวันที่{" "}
                  {formatDisplayDate(ex.granted_until_date)}
                </div>
                {(canEdit || canDelete) && (
                  <div style={extensionActionWrapStyle}>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onStartEditExtension(ex)}
                        style={tinyButtonStyle}
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteExtension(ex)}
                        style={tinyDangerButtonStyle}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
              {ex.requested_date && (
                <div style={infoLabelStyle}>
                  Requested: {formatDisplayDate(ex.requested_date)}
                </div>
              )}
              {ex.note && <div style={infoLabelStyle}>{ex.note}</div>}
            </div>
          ))}
        </div>
      )}

      {isAddingExtension && canEdit && (
        <div ref={extensionFormRef} style={extensionFormStyle}>
          <div style={extensionFormHeaderStyle}>
            <div>
              <div style={extensionTitleStyle}>
                {isEditingExtension ? "Edit Extension" : "Add Extension"}
              </div>
              <div style={extensionSubTitleStyle}>
                บันทึกวันที่ยื่นคำร้องและวันที่ศาลอนุญาตให้ขยาย
              </div>
            </div>
            <span style={extensionBadgeStyle}>Extension</span>
          </div>

          <div style={formGridStyle}>
            <Input
              label="วันที่ยื่นคำร้องขยายเวลา"
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
              label="ศาลอนุญาตถึงวันที่"
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
                label="หมายเหตุการขยายเวลา"
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
                ? "Saving..."
                : isEditingExtension
                  ? "Update Extension"
                  : "Save Extension"}
            </button>

            <button
              type="button"
              onClick={onCancelExtension}
              disabled={savingExtension}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showActions && (
        <div style={actionWrapStyle}>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => onEdit(item)}
                style={smallButtonStyle}
              >
                Edit
              </button>

              <button
                type="button"
                onClick={() => onStartAddExtension(item.id)}
                style={smallButtonStyle}
              >
                + Extension
              </button>
            </>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              style={dangerButtonStyle}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoLineStyle}>
      <div style={infoLabelStyle}>{label}</div>
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
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
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
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
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

function getDeadlineDueStatus(item: DeadlineItem) {
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

function getDeadlineStatusScore(item: DeadlineItem) {
  const dueStatus = getDeadlineDueStatus(item);

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

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/* =========================================================
   STYLES
========================================================= */

const sectionStyle: CSSProperties = {
  border: "1px solid #dddddd",
  padding: "clamp(12px, 2vw, 16px)",
  borderRadius: 14,
  background: "#ffffff",
  color: "#111111",
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
  color: "#111111",
  fontSize: 18,
  fontWeight: 900,
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
  fontWeight: 800,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#ffffff",
  color: "#111111",
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
  background: "#fafafa",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 4,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const summaryValueStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: "#111111",
};

const formCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 14,
  padding: 14,
  background: "#fafafa",
  marginBottom: 16,
  scrollMarginTop: 105,
};

const formHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 12,
  flexWrap: "wrap",
};

const formTitleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
  fontSize: 16,
  fontWeight: 900,
};

const formSubTitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#666666",
  fontSize: 12,
  lineHeight: 1.45,
};

const editBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#fff8e1",
  color: "#b54708",
  border: "1px solid #eedc9a",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
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
  fontWeight: 800,
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
  color: "#111111",
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
  color: "#111111",
  boxSizing: "border-box",
  fontWeight: 800,
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
  color: "#111111",
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
  fontWeight: 900,
  color: "#111111",
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const deadlineMatterStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 13,
  color: "#222222",
  fontWeight: 800,
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
  fontWeight: 900,
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
  background: "#fafafa",
  minWidth: 0,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 2,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#111111",
  fontWeight: 800,
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const noteBlockStyle: CSSProperties = {
  padding: "8px 9px",
  borderRadius: 10,
  background: "#fafafa",
  border: "1px solid #eeeeee",
  marginTop: 8,
};

const extensionListStyle: CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
};

const extensionTitleStyle: CSSProperties = {
  fontWeight: 900,
  marginBottom: 6,
  color: "#111111",
  fontSize: 14,
};

const extensionSubTitleStyle: CSSProperties = {
  color: "#666666",
  fontSize: 12,
  lineHeight: 1.45,
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

const extensionFormStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#fafafa",
  scrollMarginTop: 105,
};

const extensionFormHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 10,
  flexWrap: "wrap",
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
  color: "#111111",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const tinyButtonStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 7,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#111111",
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
  fontWeight: 800,
  fontSize: 13,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
};
