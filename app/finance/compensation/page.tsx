"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { createAuditLog } from "../../../lib/auditLog";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissions, UserRole } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";

type Profile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  full_name?: string | null;
  staff_name?: string | null;
  can_view_lawyer_compensation?: boolean | null;
  can_edit_lawyer_compensation?: boolean | null;
  can_void_lawyer_compensation?: boolean | null;
  can_submit_expense_claim?: boolean | null;
  can_view_own_expense_claims?: boolean | null;
  can_view_all_expense_claims?: boolean | null;
  can_approve_expense_claims?: boolean | null;
  can_pay_expense_claims?: boolean | null;
  can_view_company_ledger?: boolean | null;
  can_edit_company_ledger?: boolean | null;
  can_void_company_ledger?: boolean | null;
};
type ClientRow = { id: string; name: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };
type UserProfileRow = { id: string; full_name: string | null; staff_name: string | null; email: string | null };
type BankAccountRow = { id: string; short_name: string | null; bank_name: string | null };
type FormulaCode = "pao_line" | "tun_line" | "source_worker_qc" | "travel_fee" | "custom";

type BatchRow = {
  id: string;
  received_date: string;
  received_amount: number | string | null;
  revenue_type: string | null;
  formula_code: FormulaCode | string | null;
  client_id: string | null;
  case_id: number | null;
  advisory_matter_id: string | null;
  description: string | null;
  note: string | null;
  status: string;
  posted_to_ledger_at: string | null;
  ledger_entry_id?: string | null;
};

type AllocationRow = {
  id?: string;
  batch_id?: string;
  recipient_type: string;
  recipient_user_id: string;
  recipient_name: string;
  role_label: string;
  custom_role?: string;
  percent: string;
  amount: string;
  is_company_share: boolean;
  payment_status?: string | null;
  paid_at?: string | null;
  note: string;
};

type BatchForm = {
  received_date: string;
  received_amount: string;
  revenue_type: string;
  formula_code: FormulaCode;
  client_id: string;
  case_id: string;
  advisory_matter_id: string;
  description: string;
  note: string;
};

const otherValue = "__other__";
const emptyForm: BatchForm = {
  received_date: getDateKey(new Date()),
  received_amount: "",
  revenue_type: "professional_fee",
  formula_code: "pao_line",
  client_id: "",
  case_id: "",
  advisory_matter_id: "",
  description: "",
  note: "",
};

const roleLabels = [
  "Client Source / Broker",
  "Company Share",
  "Lead Lawyer / Case Owner",
  "Co-Lawyer / Co-Worker",
  "Assistant",
  "Quality Controller",
  "Other",
];
const recipientTypes = ["company", "source", "lawyer", "lead_lawyer", "worker", "assistant", "qc", "other"];

export default function CompensationPage() {
  const [profile, setProfile] = useState<Profile>({ role: "", financial_access: false });
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postingBatchId, setPostingBatchId] = useState("");
  const [payingAllocationId, setPayingAllocationId] = useState("");
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [allAllocations, setAllAllocations] = useState<AllocationRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [matters, setMatters] = useState<MatterRow[]>([]);
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([]);
  const [form, setForm] = useState<BatchForm>(emptyForm);
  const [editingBatchId, setEditingBatchId] = useState("");
  const [multipleWorkPool, setMultipleWorkPool] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date()));
  const [openActionMenuId, setOpenActionMenuId] = useState("");
  const formRef = useRef<HTMLElement | null>(null);
  const [errorText, setErrorText] = useState("");

  const permissions: UserPermissions = useMemo(() => buildPermissions(profile), [profile]);
  const actorName = profile.full_name || profile.staff_name || userEmail;
  const canCreateCompensationBatch = permissions.canCreateCompensationBatch || permissions.canEditLawyerCompensation;

  useEffect(() => {
    if (!openActionMenuId) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-action-menu-root='true']")) setOpenActionMenuId("");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenActionMenuId("");
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openActionMenuId]);
  const receivedAmount = parseMoney(form.received_amount);
  const isSourceWorkerQc = form.formula_code === "source_worker_qc";
  const workPoolAmount = receivedAmount * 0.4;
  const workPoolPercentTotal = allocations
    .filter((item) => isSourcePoolRow(item, form.formula_code))
    .reduce((sum, item) => sum + getPoolPercent(item), 0);
  const selectedMonthBatches = useMemo(() => {
    return batches.filter((item) => item.status !== "voided" && isBatchInSelectedMonth(item, selectedMonth));
  }, [batches, selectedMonth]);
  const visibleBatches = useMemo(() => {
    return batches.filter((item) => isBatchInSelectedMonth(item, selectedMonth));
  }, [batches, selectedMonth]);
  const selectedMonthBatchIds = useMemo(() => {
    return new Set(selectedMonthBatches.map((item) => item.id));
  }, [selectedMonthBatches]);
  const selectedMonthAllocations = useMemo(() => {
    return allAllocations.filter((item) => item.batch_id && selectedMonthBatchIds.has(item.batch_id));
  }, [allAllocations, selectedMonthBatchIds]);
  const selectedMonthRecipientAllocations = useMemo(() => {
    return selectedMonthAllocations.filter((item) => !item.is_company_share);
  }, [selectedMonthAllocations]);
  const userIdByNormalizedName = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => {
      map.set(normalizeRecipientName(renderUserLabel(user)), user.id);
    });
    return map;
  }, [users]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        setUserId(userData.user.id);
        setUserEmail(userData.user.email || "");
        const { data } = await supabase
          .from("user_profiles")
          .select("role, financial_access, full_name, staff_name, can_submit_expense_claim, can_view_own_expense_claims, can_view_all_expense_claims, can_approve_expense_claims, can_pay_expense_claims, can_view_company_ledger, can_edit_company_ledger, can_void_company_ledger, can_view_lawyer_compensation, can_edit_lawyer_compensation, can_void_lawyer_compensation")
          .eq("id", userData.user.id)
          .single();
        setProfile({
          role: data?.role || "",
          financial_access: data?.financial_access === true,
          full_name: data?.full_name || "",
          staff_name: data?.staff_name || "",
          can_view_lawyer_compensation: data?.can_view_lawyer_compensation === true,
          can_edit_lawyer_compensation: data?.can_edit_lawyer_compensation === true,
          can_void_lawyer_compensation: data?.can_void_lawyer_compensation === true,
          can_submit_expense_claim: data?.can_submit_expense_claim === true,
          can_view_own_expense_claims: data?.can_view_own_expense_claims === true,
          can_view_all_expense_claims: data?.can_view_all_expense_claims === true,
          can_approve_expense_claims: data?.can_approve_expense_claims === true,
          can_pay_expense_claims: data?.can_pay_expense_claims === true,
          can_view_company_ledger: data?.can_view_company_ledger === true,
          can_edit_company_ledger: data?.can_edit_company_ledger === true,
          can_void_company_ledger: data?.can_void_company_ledger === true,
        });
      } finally {
        setLoadingProfile(false);
      }
    };
    loadProfile();
  }, []);

  const loadData = useCallback(async () => {
    if (!permissions.canViewLawyerCompensation) return;
    try {
      setLoading(true);
      const [batchRes, allocRes, clientsRes, casesRes, mattersRes, usersRes, bankRes] = await Promise.all([
        supabase.from("finance_compensation_batches").select("*").order("received_date", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("finance_compensation_allocations").select("*"),
        supabase.from("clients").select("id, name").order("name", { ascending: true }),
        supabase.from("cases").select("id, file_no, title, client_name").order("id", { ascending: false }),
        supabase.from("advisory_matters").select("id, matter_no, title").order("created_at", { ascending: false }),
        supabase.from("user_profiles").select("id, full_name, staff_name, email").eq("active", true).order("full_name", { ascending: true }),
        supabase.from("finance_bank_accounts").select("id, short_name, bank_name").eq("is_active", true).order("short_name", { ascending: true }),
      ]);
      if (batchRes.error) {
        setErrorText(batchRes.error.message);
        return;
      }
      setBatches((batchRes.data || []) as BatchRow[]);
      setAllAllocations(((allocRes.data || []) as AllocationRow[]).map(normalizeAllocationForState));
      setClients((clientsRes.data || []) as ClientRow[]);
      setCases((casesRes.data || []) as CaseRow[]);
      setMatters((mattersRes.data || []) as MatterRow[]);
      setUsers(((usersRes.data || []) as UserProfileRow[]).filter(isRealUserProfile));
      setBankAccounts((bankRes.data || []) as BankAccountRow[]);
    } finally {
      setLoading(false);
    }
  }, [permissions.canViewLawyerCompensation]);

  useEffect(() => {
    if (!loadingProfile) loadData();
  }, [loadingProfile, loadData]);

  useEffect(() => {
    if (!editingBatchId) {
      setAllocations(generateAllocations(form.formula_code, receivedAmount));
      setMultipleWorkPool(false);
    }
  }, [editingBatchId, form.formula_code, receivedAmount]);

  const summary = useMemo(() => {
    const recipientPaid = selectedMonthRecipientAllocations
      .filter((item) => item.payment_status === "paid")
      .reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const recipientTotal = selectedMonthRecipientAllocations.reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const recipientKeys = new Set(selectedMonthRecipientAllocations.map((item) => getRecipientSummaryKey(item, userIdByNormalizedName)));

    return {
      draft: selectedMonthBatches.filter((item) => item.status === "draft").length,
      finalized: selectedMonthBatches.filter((item) => item.status === "finalized").length,
      posted: selectedMonthBatches.filter((item) => item.status === "posted").length,
      companyShare: selectedMonthAllocations
        .filter((item) => item.is_company_share)
        .reduce((sum, item) => sum + parseMoney(item.amount), 0),
      recipientTotal,
      recipientPaid,
      recipientUnpaid: recipientTotal - recipientPaid,
      recipientCount: recipientKeys.size,
    };
  }, [selectedMonthAllocations, selectedMonthBatches, selectedMonthRecipientAllocations, userIdByNormalizedName]);

  const recipientSummary = useMemo(() => {
    const grouped = new Map<string, { key: string; name: string; allocated: number; paid: number; items: number; roles: Set<string> }>();
    selectedMonthRecipientAllocations.forEach((item) => {
      const key = getRecipientSummaryKey(item, userIdByNormalizedName);
      const current = grouped.get(key) || {
        key,
        name: getRecipientDisplayName(item, users),
        allocated: 0,
        paid: 0,
        items: 0,
        roles: new Set<string>(),
      };
      const amount = parseMoney(item.amount);
      current.allocated += amount;
      if (item.payment_status === "paid") current.paid += amount;
      current.items += 1;
      if (item.role_label) current.roles.add(item.role_label);
      grouped.set(key, current);
    });
    return Array.from(grouped.values())
      .map((item) => ({ ...item, roles: Array.from(item.roles) }))
      .sort((a, b) => b.allocated - a.allocated || a.name.localeCompare(b.name));
  }, [selectedMonthRecipientAllocations, userIdByNormalizedName, users]);

  const saveDraft = async () => {
    if (!canCreateCompensationBatch) return;
    if (saving) return;
    const allocationRows = normalizeAllocationsForSave(receivedAmount, form.formula_code, allocations);
    const validation = validateAllocations(form, allocationRows);
    if (validation) return alert(validation);
    const safeguard = validateNormalizedRowsForSave(receivedAmount, form.formula_code, allocationRows);
    if (safeguard) return alert(safeguard);
    const payload = {
      received_date: form.received_date,
      received_amount: receivedAmount,
      revenue_type: form.revenue_type,
      formula_code: form.formula_code,
      client_id: form.client_id || null,
      case_id: form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.advisory_matter_id || null,
      description: form.description.trim() || null,
      note: form.note.trim() || null,
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    try {
      setSaving(true);
      if (editingBatchId) {
        const oldBatch = batches.find((item) => item.id === editingBatchId);
        if (oldBatch?.status !== "draft") return alert("Only draft batches can be edited.");
        const { error: deleteError } = await supabase.from("finance_compensation_allocations").delete().eq("batch_id", editingBatchId);
        if (deleteError) throw new Error(`Delete old allocations failed: ${deleteError.message}`);
        const { data: remainingRows, error: verifyDeleteError } = await supabase
          .from("finance_compensation_allocations")
          .select("id")
          .eq("batch_id", editingBatchId);
        if (verifyDeleteError) throw new Error(`Verify allocation delete failed: ${verifyDeleteError.message}`);
        if ((remainingRows || []).length > 0) throw new Error("Delete old allocations failed: existing allocations remain.");
        const { data, error } = await supabase.from("finance_compensation_batches").update(payload).eq("id", editingBatchId).eq("status", "draft").select("*").single();
        if (error || !data) return alert(error?.message || "Update batch failed");
        await insertAllocations(editingBatchId, allocationRows);
        await auditFinance("update", "finance_compensation_batches", editingBatchId, oldBatch, data, "Update compensation draft");
      } else {
        const { data, error } = await supabase.from("finance_compensation_batches").insert([{
          ...payload,
          created_by_user_id: userId || null,
          created_by_email: userEmail || null,
          created_by_name: actorName || null,
        }]).select("*").single();
        if (error || !data) return alert(error?.message || "Create batch failed");
        await insertAllocations(data.id, allocationRows);
        await auditFinance("create", "finance_compensation_batches", data.id, null, data, "Create compensation draft");
      }
      await loadData();
      resetForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Save draft failed");
    } finally {
      setSaving(false);
    }
  };

  const insertAllocations = async (batchId: string, rows: AllocationRow[]) => {
    const now = new Date().toISOString();
    const payload = rows.map((item) => ({
      batch_id: batchId,
      recipient_type: item.recipient_type,
      recipient_user_id: item.recipient_user_id && item.recipient_user_id !== otherValue ? item.recipient_user_id : null,
      recipient_name: getRecipientName(item, users),
      role_label: getRoleLabelForSave(item),
      percent: parseMoney(item.percent),
      amount: parseMoney(item.amount),
      is_company_share: item.is_company_share,
      payment_status: item.payment_status || "unpaid",
      paid_at: item.payment_status === "paid" ? item.paid_at || now : null,
      note: item.note.trim() || null,
      created_by_user_id: userId || null,
      created_by_email: userEmail || null,
      created_by_name: actorName || null,
      updated_at: now,
    }));
    const { error } = await supabase.from("finance_compensation_allocations").insert(payload);
    if (error) throw new Error(error.message || "Create allocations failed");
  };

  const editDraft = (batch: BatchRow) => {
    if (batch.status !== "draft") return;
    setOpenActionMenuId("");
    const batchAllocations = allAllocations.filter((item) => item.batch_id === batch.id);
    const formula = normalizeFormula(batch.formula_code);
    setEditingBatchId(batch.id);
    setForm({
      received_date: batch.received_date || getDateKey(new Date()),
      received_amount: String(batch.received_amount || ""),
      revenue_type: batch.revenue_type || "professional_fee",
      formula_code: formula,
      client_id: batch.client_id || "",
      case_id: batch.case_id ? String(batch.case_id) : "",
      advisory_matter_id: batch.advisory_matter_id || "",
      description: batch.description || "",
      note: batch.note || "",
    });
    setAllocations(batchAllocations.length ? batchAllocations.map(prepareAllocationForEdit) : []);
    setMultipleWorkPool(formula === "source_worker_qc" && batchAllocations.filter((item) => isSourcePoolRow(item, formula)).length > 1);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const finalizeBatch = async (batch: BatchRow) => {
    if (!permissions.canEditLawyerCompensation || batch.status !== "draft") return;
    const batchAllocations = allAllocations.filter((item) => item.batch_id === batch.id);
    const validation = validateAllocations(
      {
        ...emptyForm,
        received_amount: String(batch.received_amount || ""),
        formula_code: normalizeFormula(batch.formula_code),
      },
      batchAllocations
    );
    if (validation) return alert(validation);
    await updateBatch(batch, { status: "finalized" }, "Finalize compensation batch");
  };

  const postCompanyShare = async (batch: BatchRow) => {
    if (!permissions.canEditLawyerCompensation || batch.status !== "finalized") return;
    if (postingBatchId === batch.id) return;
    try {
      setPostingBatchId(batch.id);
      const { data: latestBatch, error: latestError } = await supabase.from("finance_compensation_batches").select("*").eq("id", batch.id).single();
      if (latestError || !latestBatch) return alert(latestError?.message || "Batch not found");
      const currentBatch = latestBatch as BatchRow;
      if (currentBatch.status !== "finalized") {
        await loadData();
        return alert("This batch is no longer finalized.");
      }
      if (currentBatch.ledger_entry_id) {
        await loadData();
        return alert("This batch is already posted to Ledger.");
      }
      const companyShare = allAllocations
        .filter((item) => item.batch_id === batch.id && item.is_company_share)
        .reduce((sum, item) => sum + parseMoney(item.amount), 0);
      const now = new Date().toISOString();
      if (companyShare <= 0) {
        if (normalizeFormula(currentBatch.formula_code) !== "custom") {
          return alert("Company share must be greater than zero");
        }

        const { data: postedBatch, error: postError } = await supabase
          .from("finance_compensation_batches")
          .update({
            status: "posted",
            posted_to_ledger_at: now,
            ledger_entry_id: null,
            updated_at: now,
          })
          .eq("id", batch.id)
          .eq("status", "finalized")
          .select("*")
          .single();

        if (postError || !postedBatch) {
          await loadData();
          return alert(postError?.message || "Batch post update failed.");
        }

        await auditFinance(
          "update",
          "finance_compensation_batches",
          batch.id,
          currentBatch,
          postedBatch,
          "No company share to post for this custom batch"
        );
        await loadData();
        return alert("No company share to post for this custom batch.");
      }

      const kbank = bankAccounts.find((account) => (account.short_name || "").toUpperCase() === "KBANK");
      if (!kbank) return alert("ไม่พบ KBANK bank account");
      const { data: ledgerData, error: ledgerError } = await supabase.from("finance_company_ledger").insert([{
        source_compensation_batch_id: batch.id,
        transaction_date: getDateKey(new Date()),
        entry_type: "income",
        bank_account_id: kbank.id,
        amount: companyShare,
        category: getLedgerCategory(currentBatch),
        client_id: currentBatch.client_id || null,
        case_id: currentBatch.case_id || null,
        advisory_matter_id: currentBatch.advisory_matter_id || null,
        description: currentBatch.description || null,
        note: currentBatch.note || null,
        status: "active",
        created_by_user_id: userId || null,
        created_by_email: userEmail || null,
        created_by_name: actorName || null,
        updated_at: now,
      }]).select("*").single();
      if (ledgerError || !ledgerData) {
        if (isDuplicatePostError(ledgerError)) {
          await loadData();
          return alert("This batch has already been posted to Ledger.");
        }
        return alert(ledgerError?.message || "Post ledger failed");
      }
      const { data: postedBatch, error: postError } = await supabase.from("finance_compensation_batches").update({
        status: "posted",
        posted_to_ledger_at: now,
        ledger_entry_id: ledgerData.id,
        updated_at: now,
      }).eq("id", batch.id).eq("status", "finalized").select("*").single();
      if (postError || !postedBatch) {
        await loadData();
        return alert(postError?.message || "Batch post update failed. Ledger entry was created; please review manually.");
      }
      await auditFinance("create", "finance_company_ledger", ledgerData.id, null, ledgerData, "Post company share from compensation to ledger");
      await auditFinance("update", "finance_compensation_batches", batch.id, currentBatch, postedBatch, "Post compensation company share");
      await loadData();
    } finally {
      setPostingBatchId("");
    }
  };

  const voidBatch = async (batch: BatchRow) => {
    if (!permissions.canVoidLawyerCompensation) return;
    if (batch.status === "posted" || batch.ledger_entry_id) return alert("Posted batches cannot be voided in this phase.");
    if (!["draft", "finalized"].includes(batch.status)) return;
    const reason = window.prompt("Void reason");
    if (!reason?.trim()) return;
    await updateBatch(batch, {
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: actorName || userEmail || null,
      void_reason: reason.trim(),
    }, "Void compensation batch");
  };

  const markAllocationPaid = async (allocation: AllocationRow, batch: BatchRow) => {
    if (!permissions.canEditLawyerCompensation || !allocation.id || allocation.is_company_share) return;
    if (batch.status === "voided" || allocation.payment_status === "paid") return;
    try {
      setPayingAllocationId(allocation.id);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("finance_compensation_allocations")
        .update({ payment_status: "paid", paid_at: now, updated_at: now })
        .eq("id", allocation.id)
        .select("*")
        .single();
      if (error || !data) return alert(error?.message || "Mark as paid failed");
      await auditFinance("update", "finance_compensation_allocations", allocation.id, allocation, data, "Mark recipient allocation as paid");
      await loadData();
    } finally {
      setPayingAllocationId("");
    }
  };

  const updateBatch = async (batch: BatchRow, payload: Record<string, unknown>, note: string) => {
    const { data, error } = await supabase.from("finance_compensation_batches").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", batch.id).select("*").single();
    if (error || !data) return alert(error?.message || "Update batch failed");
    await auditFinance("update", "finance_compensation_batches", batch.id, batch, data, note);
    await loadData();
  };

  const auditFinance = async (action: "create" | "update", tableName: string, recordId: string, oldData: unknown, newData: unknown, note: string) => {
    try {
      await createAuditLog({ caseId: null, tableName, recordId, action, oldData, newData, note });
    } catch (error) {
      console.error("CREATE FINANCE AUDIT LOG FAILED:", error);
    }
  };

  const resetForm = () => {
    setForm({ ...emptyForm, received_date: getDateKey(new Date()) });
    setEditingBatchId("");
    setMultipleWorkPool(false);
    setAllocations(generateAllocations("pao_line", 0));
  };

  const updateReceivedAmount = (value: string) => {
    const nextAmount = parseMoney(value);
    setForm({ ...form, received_amount: value });
    if (editingBatchId) {
      setAllocations(normalizeAllocationsForSave(nextAmount, form.formula_code, allocations));
    }
  };

  const updateAllocation = (index: number, patch: Partial<AllocationRow>) => {
    setAllocations(allocations.map((item, itemIndex) => itemIndex === index ? normalizeAllocationForState({ ...item, ...patch }) : item));
  };

  const addAllocation = () => {
    if (form.formula_code === "source_worker_qc" && !multipleWorkPool) return;
    if (form.formula_code === "source_worker_qc") {
      const next = [
        ...allocations,
        createAllocation("assistant", "", 4, false, "Assistant", receivedAmount),
      ];
      setAllocations(rebalanceOwnerWorkPool(next, receivedAmount, form.formula_code));
      return;
    }
    setAllocations([
      ...allocations,
      createAllocation("other", "", 0, false, "Other"),
    ]);
  };

  const updatePercent = (index: number, value: string) => {
    const row = allocations[index];
    if (isSourcePoolOwnerRow(row, form.formula_code)) return;
    const actualPercent = isSourcePoolRow(row, form.formula_code) ? (parseMoney(value) * 40) / 100 : parseMoney(value);
    const next = allocations.map((item, itemIndex) => itemIndex === index ? normalizeAllocationForState({
      ...item,
      percent: formatPercent(actualPercent),
      amount: receivedAmount ? String(roundMoney((receivedAmount * actualPercent) / 100)) : row.amount,
    }) : item);
    setAllocations(rebalanceOwnerWorkPool(next, receivedAmount, form.formula_code));
  };

  const updateAmount = (index: number, value: string) => {
    const row = allocations[index];
    if (isSourcePoolOwnerRow(row, form.formula_code)) return;
    const actualPercent = receivedAmount ? (parseMoney(value) / receivedAmount) * 100 : 0;
    const next = allocations.map((item, itemIndex) => itemIndex === index ? normalizeAllocationForState({ ...item, amount: value, percent: formatPercent(actualPercent) }) : item);
    setAllocations(rebalanceOwnerWorkPool(next, receivedAmount, form.formula_code));
  };

  const updateRecipientType = (index: number, value: string) => {
    if (value === "company") {
      updateAllocation(index, { recipient_type: value, recipient_name: "Company", role_label: "Company Share", is_company_share: true });
      return;
    }
    if (value === "source") {
      updateAllocation(index, { recipient_type: value, role_label: "Client Source / Broker", is_company_share: false });
      return;
    }
    updateAllocation(index, { recipient_type: value, is_company_share: false });
  };

  const updateRole = (index: number, value: string) => {
    const row = allocations[index];
    const patch: Partial<AllocationRow> = { role_label: value, custom_role: "" };
    if (form.formula_code === "source_worker_qc" && isSourcePoolRow(row, form.formula_code)) {
      patch.recipient_type = getWorkPoolRecipientType(value);
    }
    updateAllocation(index, patch);
  };

  const removeAllocation = (index: number) => {
    const row = allocations[index];
    if (form.formula_code === "source_worker_qc" && (row.recipient_type === "source" || row.is_company_share || isSourcePoolOwnerRow(row, form.formula_code))) return;
    setAllocations(rebalanceOwnerWorkPool(allocations.filter((_, itemIndex) => itemIndex !== index), receivedAmount, form.formula_code));
  };

  const updateMultipleWorkPool = (checked: boolean) => {
    setMultipleWorkPool(checked);
    if (!checked && form.formula_code === "source_worker_qc") {
      setAllocations(generateAllocations("source_worker_qc", receivedAmount));
    }
  };

  if (loadingProfile) {
    return <AuthGuard><main style={pageStyle}><div style={panelStyle}>Loading permission...</div></main></AuthGuard>;
  }

  if (!permissions.canViewLawyerCompensation) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav title="Lawyer Compensation" subtitle="Compensation allocation" activePage="finance" />
          <div style={noAccessStyle}>No access</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav title="Lawyer Compensation" subtitle="Allocate received fees before posting company share to KBANK." activePage="finance" />
        <FinanceSubNav activePage="compensation" permissions={permissions} />
        {errorText ? <div style={errorStyle}>{errorText}</div> : null}
        <section style={filterPanelStyle}>
          <label style={labelStyle}>
            Month
            <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} style={inputStyle} />
          </label>
          <button type="button" onClick={() => setSelectedMonth(getMonthKey(new Date()))} style={secondaryButtonStyle}>This Month</button>
        </section>
        <section style={summaryGridStyle}>
          <SummaryCard label="Draft" value={String(summary.draft)} />
          <SummaryCard label="Finalized" value={String(summary.finalized)} />
          <SummaryCard label="Posted" value={String(summary.posted)} />
          <SummaryCard label="Company Share Total" value={formatMoney(summary.companyShare)} />
          <SummaryCard label="Total Recipient Share" value={formatMoney(summary.recipientTotal)} />
          <SummaryCard label="Total Recipient Paid" value={formatMoney(summary.recipientPaid)} />
          <SummaryCard label="Total Recipient Unpaid" value={formatMoney(summary.recipientUnpaid)} />
          <SummaryCard label="Number of Recipients" value={String(summary.recipientCount)} />
        </section>

        {canCreateCompensationBatch ? (
        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Recipient Income Summary — {formatMonthLabel(selectedMonth)}</h2>
          <p style={mutedTextStyle}>Recipient Summary is filtered by selected month.</p>
          <div style={tableWrapStyle}>
            <table style={compactTableStyle}>
              <thead><tr><th style={thStyle}>Recipient</th><th style={thStyle}>Allocated</th><th style={thStyle}>Paid</th></tr></thead>
              <tbody>
                {recipientSummary.map((item) => (
                  <tr key={item.key}>
                    <td style={tdStyle}>
                      <div>{item.name}</div>
                      <div style={mutedTextStyle}>Items: {item.items} {item.roles.length ? `| Roles: ${item.roles.join(", ")}` : ""}</div>
                    </td>
                    <td style={tdStyle}>{formatMoney(item.allocated)}</td>
                    <td style={tdStyle}>{formatMoney(item.paid)}</td>
                  </tr>
                ))}
                {recipientSummary.length === 0 ? <tr><td colSpan={3} style={tdStyle}>No recipient income in this month.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {canCreateCompensationBatch ? (
        <section ref={formRef} style={panelStyle}>
          <h2 style={sectionTitleStyle}>{editingBatchId ? "Edit Draft" : "Create Compensation Batch"}</h2>
          <div style={formGridStyle}>
            <label style={labelStyle}>Received Date<input type="date" value={form.received_date} onChange={(event) => setForm({ ...form, received_date: event.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Received Amount<input value={form.received_amount} onChange={(event) => updateReceivedAmount(event.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>Revenue Type<select value={form.revenue_type} onChange={(event) => setForm({ ...form, revenue_type: event.target.value })} style={inputStyle}><option value="professional_fee">Professional Fee</option><option value="service_fee">Service Fee</option><option value="travel_fee">Travel Fee</option><option value="other">Other</option></select></label>
            <label style={labelStyle}>Formula<select value={form.formula_code} onChange={(event) => setForm({ ...form, formula_code: event.target.value as FormulaCode })} style={inputStyle}><option value="pao_line">Pao Line</option><option value="tun_line">Tun Line</option><option value="source_worker_qc">Source / Worker / QC</option><option value="travel_fee">Travel Fee</option><option value="custom">Custom</option></select></label>
            <label style={labelStyle}>Client<select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} style={inputStyle}><option value="">-</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}</select></label>
            <label style={labelStyle}>Case<select value={form.case_id} onChange={(event) => setForm({ ...form, case_id: event.target.value })} style={inputStyle}><option value="">-</option>{cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}</select></label>
            <label style={labelStyle}>Advisory Matter<select value={form.advisory_matter_id} onChange={(event) => setForm({ ...form, advisory_matter_id: event.target.value })} style={inputStyle}><option value="">-</option>{matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}</select></label>
            <label style={wideLabelStyle}>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} style={inputStyle} /></label>
            <label style={wideLabelStyle}>Note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} style={textareaStyle} /></label>
          </div>
        </section>
        ) : null}

        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <h2 style={sectionTitleStyle}>Allocation Editor</h2>
            <button type="button" onClick={addAllocation} disabled={isSourceWorkerQc && !multipleWorkPool} style={secondaryButtonStyle}>{isSourceWorkerQc ? "Add Work Pool Row" : "Add Row"}</button>
          </div>
          {isSourceWorkerQc ? (
            <div style={workPoolPanelStyle}>
              <div><strong>Source / เจ้าของสายลูกค้า:</strong> 20% of received amount</div>
              <div><strong>Company Share:</strong> 40% of received amount</div>
              <div><strong>Work Pool / ทีมทำงาน:</strong> 40% of received amount = 100% inside work pool</div>
              <div style={workPoolSummaryStyle}>
                <span>Received Amount: {formatMoney(receivedAmount)}</span>
                <span>Work Pool 40%: {formatMoney(workPoolAmount)}</span>
                <span>Work Pool Allocation: {formatPercent(workPoolPercentTotal)}%</span>
              </div>
              <label style={checkboxLabelStyle}>
                <input type="checkbox" checked={multipleWorkPool} onChange={(event) => updateMultipleWorkPool(event.target.checked)} />
                Multiple work pool recipients
              </label>
            </div>
          ) : null}
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Type</th><th style={thStyle}>Recipient</th><th style={thStyle}>Role</th><th style={thStyle}>{isSourceWorkerQc ? "Work Pool %" : "Percent"}</th><th style={thStyle}>Amount</th><th style={thStyle}>Company</th><th style={thStyle}>Note</th><th style={thStyle}>Actions</th></tr></thead>
              <tbody>
                {allocations.map((row, index) => (
                  <tr key={`${index}-${row.recipient_type}`}>
                    <td style={tdStyle}><select value={row.recipient_type} onChange={(event) => updateRecipientType(index, event.target.value)} style={inputStyle}>{recipientTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></td>
                    <td style={tdStyle}><RecipientEditor row={row} users={users} onChange={(patch) => updateAllocation(index, patch)} /></td>
                    <td style={tdStyle}>
                      <select value={row.role_label} onChange={(event) => updateRole(index, event.target.value)} style={inputStyle}><option value="">-</option>{roleLabels.map((label) => <option key={label} value={label}>{label}</option>)}</select>
                      {row.role_label === "Other" ? (
                        <input value={row.custom_role || ""} onChange={(event) => updateAllocation(index, { custom_role: event.target.value })} style={inputStyle} placeholder="Custom Role / ระบุบทบาทเอง" />
                      ) : null}
                    </td>
                    <td style={tdStyle}>
                      <input value={getDisplayPercent(row, form.formula_code)} onChange={(event) => updatePercent(index, event.target.value)} disabled={isFixedSourceWorkerRow(row, form.formula_code)} style={inputStyle} />
                      {isSourcePoolRow(row, form.formula_code) ? <div style={mutedTextStyle}>Actual: {formatPercent(parseMoney(row.percent))}% of received amount</div> : null}
                    </td>
                    <td style={tdStyle}><input value={row.amount} onChange={(event) => updateAmount(index, event.target.value)} disabled={isFixedSourceWorkerRow(row, form.formula_code)} style={inputStyle} /></td>
                    <td style={tdStyle}><input type="checkbox" checked={row.is_company_share} onChange={(event) => updateAllocation(index, { is_company_share: event.target.checked })} /></td>
                    <td style={tdStyle}><input value={row.note} onChange={(event) => updateAllocation(index, { note: event.target.value })} style={inputStyle} /></td>
                    <td style={tdStyle}><button type="button" onClick={() => removeAllocation(index)} disabled={isSourceWorkerQc && (row.recipient_type === "source" || row.is_company_share || isSourcePoolOwnerRow(row, form.formula_code))} style={dangerButtonStyle}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={actionRowStyle}>
            <button type="button" onClick={saveDraft} disabled={saving} style={primaryButtonStyle}>{saving ? "Saving..." : "Save Draft"}</button>
            <button type="button" onClick={resetForm} style={secondaryButtonStyle}>Clear</button>
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Batches</h2>
          {loading ? <div style={emptyStyle}>Loading batches...</div> : null}
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Date</th><th style={thStyle}>Client / Matter</th><th style={thStyle}>Formula</th><th style={thStyle}>Amount</th><th style={thStyle}>Company Share</th><th style={thStyle}>Status</th><th style={thStyle}>Ledger</th><th style={thStyle}>Actions</th></tr></thead>
              <tbody>
                {visibleBatches.map((batch) => {
                  const companyShare = getCompanyShare(batch.id, allAllocations);
                  return (
                    <tr key={batch.id}>
                      <td style={tdStyle}>{batch.received_date}</td>
                      <td style={tdStyle}>{renderBatchContext(batch, clients, cases, matters)}</td>
                      <td style={tdStyle}>{renderFormula(batch.formula_code)}{renderAllocationDetails(batch, allAllocations, permissions.canEditLawyerCompensation, payingAllocationId, markAllocationPaid)}</td>
                      <td style={tdStyle}>{formatMoney(toAmount(batch.received_amount))}</td>
                      <td style={tdStyle}>{formatMoney(companyShare)}</td>
                      <td style={tdStyle}>{renderBatchStatus(batch)}</td>
                      <td style={tdStyle}>{batch.ledger_entry_id ? `Posted: ${batch.ledger_entry_id}` : batch.status === "posted" ? "No company share" : "-"}</td>
                      <td style={tdStyle}>
                        <div style={actionStackStyle}>
                          {batch.status === "draft" && permissions.canEditLawyerCompensation ? <button type="button" onClick={() => editDraft(batch)} style={smallButtonStyle}>Edit</button> : null}
                          {batch.status === "draft" && permissions.canEditLawyerCompensation ? <button type="button" onClick={() => finalizeBatch(batch)} style={smallButtonStyle}>Finalize</button> : null}
                          {batch.status === "finalized" && !batch.ledger_entry_id ? <div style={helpTextStyle}>ส่วนของบริษัทจะเข้าบัญชี KBANK เท่านั้น</div> : null}
                          {batch.status === "finalized" && !batch.ledger_entry_id && permissions.canEditLawyerCompensation ? <button type="button" onClick={() => postCompanyShare(batch)} disabled={postingBatchId === batch.id} style={primarySmallButtonStyle}>{postingBatchId === batch.id ? "Posting..." : "Post Company Share"}</button> : null}
                          {["draft", "finalized"].includes(batch.status) && permissions.canVoidLawyerCompensation ? (
                            <details data-action-menu-root="true" open={openActionMenuId === batch.id} style={moreMenuStyle}>
                              <summary
                                aria-label="More actions"
                                title="More actions"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setOpenActionMenuId((current) => current === batch.id ? "" : batch.id);
                                }}
                                style={moreButtonStyle}
                              >
                                ...
                              </summary>
                              <div style={moreMenuContentStyle}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId("");
                                    voidBatch(batch);
                                  }}
                                  style={dangerMenuButtonStyle}
                                >
                                  Void
                                </button>
                              </div>
                            </details>
                          ) : null}
                          {batch.status === "posted" ? <div style={postedStyle}>{batch.ledger_entry_id ? "Posted to Ledger" : "No company share to post"}</div> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleBatches.length === 0 ? <tr><td colSpan={8} style={tdStyle}>No compensation batches.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}

function RecipientEditor({ row, users, onChange }: { row: AllocationRow; users: UserProfileRow[]; onChange: (patch: Partial<AllocationRow>) => void }) {
  return (
    <div style={recipientGridStyle}>
      <select value={row.recipient_user_id} onChange={(event) => {
        const value = event.target.value;
        if (!value) return onChange({ recipient_user_id: "", recipient_name: "" });
        if (value === otherValue) return onChange({ recipient_user_id: otherValue, recipient_name: "" });
        const user = users.find((item) => item.id === value);
        onChange({ recipient_user_id: value, recipient_name: user ? renderUserLabel(user) : "" });
      }} style={inputStyle}>
        <option value="">-</option>
        {users.map((user) => <option key={user.id} value={user.id}>{renderUserLabel(user)}</option>)}
        <option value={otherValue}>Other</option>
      </select>
      {row.recipient_user_id === otherValue ? <input value={row.recipient_name} onChange={(event) => onChange({ recipient_name: event.target.value })} style={inputStyle} placeholder="Recipient name" /> : null}
    </div>
  );
}

function FinanceSubNav({ activePage, permissions }: { activePage: "ledger" | "claims" | "compensation"; permissions: UserPermissions }) {
  return (
    <nav style={subNavStyle}>
      {permissions.canViewCompanyLedger ? <Link href="/finance/ledger" style={activePage === "ledger" ? subNavActiveLinkStyle : subNavLinkStyle}>Ledger</Link> : null}
      {permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims ? <Link href="/finance/expense-claims" style={activePage === "claims" ? subNavActiveLinkStyle : subNavLinkStyle}>Expense Claims</Link> : null}
      {permissions.canViewLawyerCompensation ? <Link href="/finance/compensation" style={activePage === "compensation" ? subNavActiveLinkStyle : subNavLinkStyle}>Lawyer Compensation</Link> : null}
    </nav>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div style={summaryCardStyle}><div style={summaryLabelStyle}>{label}</div><div style={summaryValueStyle}>{value}</div></div>;
}

function generateAllocations(formula: FormulaCode, total: number) {
  if (!total || total <= 0) return [];
  if (formula === "pao_line") return [
    createAllocation("company", "Company", 20, true, "Company", total),
    createAllocation("lawyer", "ทนายเป้า", 55, false, "Lawyer", total),
    createAllocation("lawyer", "ทนายตุลย์", 25, false, "Lawyer", total),
  ];
  if (formula === "tun_line") return [
    createAllocation("company", "Company", 20, true, "Company", total),
    createAllocation("lawyer", "ทนายเป้า", 40, false, "Lawyer", total),
    createAllocation("lawyer", "ทนายตุลย์", 40, false, "Lawyer", total),
  ];
  if (formula === "source_worker_qc") return [
    createAllocation("source", "", 20, false, "Client Source / Broker", total),
    createAllocation("company", "Company", 40, true, "Company Share", total),
    createAllocation("worker", "", 40, false, "Lead Lawyer / Case Owner", total),
  ];
  if (formula === "travel_fee") return [createAllocation("company", "Company", 100, true, "Company", total)];
  return [];
}

function createAllocation(type: string, name: string, percent: number | string, isCompany: boolean, roleLabel = "", total = 0): AllocationRow {
  const percentNumber = Number(percent) || 0;
  return {
    recipient_type: type,
    recipient_user_id: "",
    recipient_name: name,
    role_label: roleLabel,
    percent: String(percent),
    amount: total ? String(roundMoney((total * percentNumber) / 100)) : "",
    is_company_share: isCompany,
    payment_status: "unpaid",
    paid_at: null,
    note: "",
  };
}

function validateAllocations(form: BatchForm, rows: AllocationRow[]) {
  const total = parseMoney(form.received_amount);
  if (total <= 0) return "Received amount must be greater than zero";
  if (rows.length === 0) return "Allocation rows are required";
  const allocationTotal = rows.reduce((sum, item) => sum + parseMoney(item.amount), 0);
  if (Math.abs(allocationTotal - total) > 0.01) return "Allocation total must equal received amount";
  if (rows.some((item) => parseMoney(item.amount) <= 0)) return "Every allocation row needs amount greater than zero";
  if (form.formula_code === "custom") {
    const percentTotal = rows.reduce((sum, item) => sum + parseMoney(item.percent), 0);
    if (Math.abs(percentTotal - 100) > 0.01) return "Custom allocation percent must equal 100%";
  }
  if (form.formula_code !== "custom" && !rows.some((item) => item.is_company_share)) return "At least one company allocation is required";
  if (rows.some((item) => item.is_company_share && item.recipient_type !== "company")) return "Company allocation must use recipient_type company";
  if (rows.some((item) => !item.payment_status)) return "Every allocation row needs payment status";
  if (rows.some((item) => item.recipient_type === "source" && !item.role_label)) return "Source row needs Client Source / Broker role";
  if (rows.some((item) => item.role_label === "Other" && !item.custom_role?.trim())) return "Custom Role is required when role is Other";
  if (rows.some((item) => !getRecipientName(item, []))) return "Every allocation row needs recipient name";
  if (form.formula_code === "travel_fee" && (rows.length !== 1 || !rows[0].is_company_share || parseMoney(rows[0].amount) !== total)) return "Travel Fee must be company 100%";
  if (form.formula_code === "source_worker_qc") {
    const source = rows.filter((item) => item.recipient_type === "source").reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const company = rows.filter((item) => item.is_company_share).reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const pool = allocationTotal - source - company;
    const sourceRows = rows.filter((item) => item.recipient_type === "source");
    const companyRows = rows.filter((item) => item.is_company_share);
    const ownerRows = rows.filter((item) => isSourcePoolOwnerRow(item, form.formula_code));
    const poolPercent = rows
      .filter((item) => isSourcePoolRow(item, form.formula_code))
      .reduce((sum, item) => sum + getPoolPercent(item), 0);
    if (sourceRows.length !== 1) return "Source / Worker / QC needs exactly one source row";
    if (companyRows.length !== 1) return "Source / Worker / QC needs exactly one company share row";
    if (ownerRows.length !== 1) return "Work Pool needs exactly one Lead Lawyer / Case Owner row";
    if (getPoolPercent(ownerRows[0]) < 0) return "Owner work pool percent cannot be negative";
    if (Math.abs(source - total * 0.2) > 0.01) return "Source must be 20%";
    if (Math.abs(company - total * 0.4) > 0.01) return "Company must be 40%";
    if (Math.abs(pool - total * 0.4) > 0.01) return "Work Pool must be 40%";
    if (Math.abs(poolPercent - 100) > 0.01) return "Work Pool percent must equal 100%";
  }
  return "";
}

function getRecipientName(row: AllocationRow, users: UserProfileRow[]) {
  if (row.recipient_type === "company") return row.recipient_name.trim() || "Company";
  if (row.recipient_user_id && row.recipient_user_id !== otherValue) {
    const user = users.find((item) => item.id === row.recipient_user_id);
    return user ? renderUserLabel(user) : row.recipient_name.trim();
  }
  return row.recipient_name.trim();
}

function getRoleLabelForSave(row: AllocationRow) {
  if (row.role_label === "Other" && row.custom_role?.trim()) return row.custom_role.trim();
  return row.role_label || null;
}

function getWorkPoolRecipientType(roleLabel: string) {
  if (roleLabel === "Lead Lawyer / Case Owner") return "lead_lawyer";
  if (roleLabel === "Co-Lawyer / Co-Worker") return "worker";
  if (roleLabel === "Assistant") return "assistant";
  if (roleLabel === "Quality Controller") return "qc";
  return "other";
}

function dedupeAllocationRows(rows: AllocationRow[]) {
  const seen = new Set<string>();
  return rows.map(normalizeAllocationForState).filter((row) => {
    const key = [
      row.recipient_type,
      row.recipient_user_id && row.recipient_user_id !== otherValue ? row.recipient_user_id : "",
      getRecipientName(row, []),
      getRoleLabelForSave(row) || "",
      formatPercent(parseMoney(row.percent)),
      String(roundMoney(parseMoney(row.amount))),
      row.is_company_share ? "company" : "recipient",
    ].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAllocationsForSave(receivedAmount: number, formula: FormulaCode, rows: AllocationRow[]) {
  if (formula === "custom") {
    return dedupeAllocationRows(
      rows.map((item) => ({
        ...normalizeAllocationForState(item),
        payment_status: item.payment_status || "unpaid",
        paid_at: item.payment_status === "paid" ? item.paid_at || null : null,
      }))
    );
  }
  const normalized = rows.map((item) => normalizeAllocationForState(item));
  if (formula !== "source_worker_qc") {
    return dedupeAllocationRows(normalized.map((item) => ({
      ...item,
      amount: String(roundMoney((receivedAmount * parseMoney(item.percent)) / 100)),
      payment_status: item.payment_status || "unpaid",
    })));
  }

  const sourceRow = normalized.find((item) => item.recipient_type === "source") || createAllocation("source", "", 20, false, "Client Source / Broker");
  const companyRow = normalized.find((item) => item.is_company_share) || createAllocation("company", "Company", 40, true, "Company Share");
  const poolRows = normalized.filter((item) => isSourcePoolRow(item, formula));
  return dedupeAllocationRows([
    {
      ...sourceRow,
      percent: "20",
      amount: String(roundMoney(receivedAmount * 0.2)),
      role_label: sourceRow.role_label || "Client Source / Broker",
      payment_status: sourceRow.payment_status || "unpaid",
    },
    {
      ...companyRow,
      recipient_type: "company",
      recipient_name: "Company",
      role_label: "Company Share",
      percent: "40",
      amount: String(roundMoney(receivedAmount * 0.4)),
      is_company_share: true,
      payment_status: companyRow.payment_status || "unpaid",
    },
    ...poolRows.map((item) => {
      const poolPercent = getPoolPercent(item);
      const actualPercent = (poolPercent * 40) / 100;
      return {
        ...item,
        percent: formatPercent(actualPercent),
        amount: String(roundMoney((receivedAmount * actualPercent) / 100)),
        is_company_share: false,
        payment_status: item.payment_status || "unpaid",
      };
    }),
  ]);
}

function validateNormalizedRowsForSave(receivedAmount: number, formula: FormulaCode, rows: AllocationRow[]) {
  if (formula !== "source_worker_qc") return "";
  const companyAmount = rows
    .filter((item) => item.is_company_share)
    .reduce((sum, item) => sum + parseMoney(item.amount), 0);
  const expectedCompanyAmount = roundMoney(receivedAmount * 0.4);
  if (Math.abs(companyAmount - expectedCompanyAmount) > 0.01) {
    return `Company share must be ${formatMoney(expectedCompanyAmount)} for received amount ${formatMoney(receivedAmount)}`;
  }
  return "";
}

function isSourcePoolRow(row: AllocationRow, formula: FormulaCode) {
  return formula === "source_worker_qc" && row.recipient_type !== "source" && !row.is_company_share;
}

function isSourcePoolOwnerRow(row: AllocationRow, formula: FormulaCode) {
  return isSourcePoolRow(row, formula) && row.role_label === "Lead Lawyer / Case Owner";
}

function isFixedSourceWorkerRow(row: AllocationRow, formula: FormulaCode) {
  return formula === "source_worker_qc" && (row.recipient_type === "source" || row.is_company_share || isSourcePoolOwnerRow(row, formula));
}

function getPoolPercent(row: AllocationRow) {
  return (parseMoney(row.percent) / 40) * 100;
}

function getDisplayPercent(row: AllocationRow, formula: FormulaCode) {
  return isSourcePoolRow(row, formula) ? formatPercent(getPoolPercent(row)) : row.percent;
}

function rebalanceOwnerWorkPool(rows: AllocationRow[], receivedAmount: number, formula: FormulaCode) {
  if (formula !== "source_worker_qc") return rows;
  const nonOwnerPoolPercent = rows
    .filter((item) => isSourcePoolRow(item, formula) && !isSourcePoolOwnerRow(item, formula))
    .reduce((sum, item) => sum + getPoolPercent(item), 0);
  const ownerPoolPercent = 100 - nonOwnerPoolPercent;
  const ownerActualPercent = (ownerPoolPercent * 40) / 100;
  return rows.map((item) => {
    if (!isSourcePoolOwnerRow(item, formula)) return item;
    return normalizeAllocationForState({
      ...item,
      percent: formatPercent(ownerActualPercent),
      amount: String(roundMoney((receivedAmount * ownerActualPercent) / 100)),
    });
  });
}

function normalizeAllocationForState(row: AllocationRow): AllocationRow {
  const isPresetRole = !row.role_label || roleLabels.includes(row.role_label);
  return {
    ...row,
    recipient_user_id: row.recipient_user_id || "",
    recipient_name: row.recipient_name || (row.recipient_type === "company" ? "Company" : ""),
    role_label: isPresetRole ? row.role_label || "" : "Other",
    custom_role: isPresetRole ? row.custom_role || "" : row.role_label,
    percent: String(row.percent || ""),
    amount: String(row.amount || ""),
    payment_status: row.payment_status || "unpaid",
    paid_at: row.paid_at || null,
    note: row.note || "",
  };
}

function prepareAllocationForEdit(row: AllocationRow): AllocationRow {
  return { ...normalizeAllocationForState(row), recipient_user_id: row.recipient_user_id || (row.recipient_name ? otherValue : "") };
}

function getCompanyShare(batchId: string, rows: AllocationRow[]) {
  return rows.filter((item) => item.batch_id === batchId && item.is_company_share).reduce((sum, item) => sum + parseMoney(item.amount), 0);
}

function getRecipientSummaryKey(row: AllocationRow, userIdByNormalizedName: Map<string, string>) {
  if (row.recipient_user_id && row.recipient_user_id !== otherValue) {
    return `user:${row.recipient_user_id}`;
  }
  const normalizedName = normalizeRecipientName(row.recipient_name);
  const matchedUserId = userIdByNormalizedName.get(normalizedName);
  return matchedUserId ? `user:${matchedUserId}` : `name:${normalizedName}`;
}

function normalizeRecipientName(value: string | null | undefined) {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.toLocaleLowerCase("en-US") : "unknown recipient";
}

function getRecipientDisplayName(row: AllocationRow, users: UserProfileRow[]) {
  if (row.recipient_user_id && row.recipient_user_id !== otherValue) {
    const user = users.find((item) => item.id === row.recipient_user_id);
    if (user) return renderUserLabel(user);
  }
  const name = (row.recipient_name || "").trim().replace(/\s+/g, " ");
  return name || "Unknown Recipient";
}

function renderBatchStatus(batch: BatchRow) {
  if (batch.status === "posted") return <div style={postedStyle}>Company Share Posted to Ledger</div>;
  return batch.status;
}

function renderBatchContext(
  batch: BatchRow,
  clients: ClientRow[],
  cases: CaseRow[],
  matters: MatterRow[]
) {
  const client = clients.find((item) => item.id === batch.client_id);
  const caseItem = cases.find((item) => String(item.id) === String(batch.case_id));
  const matter = matters.find((item) => item.id === batch.advisory_matter_id);
  const clientName = client?.name || caseItem?.client_name || "-";
  const matterLabel = caseItem
    ? `Case: ${renderCaseLabel(caseItem)}`
    : matter
      ? `Advisory: ${renderMatterLabel(matter)}`
      : "Matter: Manual / Unlinked";

  return (
    <div style={batchContextStyle}>
      <div>Client: {clientName}</div>
      <div style={mutedTextStyle}>{matterLabel}</div>
    </div>
  );
}

function renderAllocationDetails(
  batch: BatchRow,
  rows: AllocationRow[],
  canEdit: boolean,
  payingAllocationId: string,
  onMarkPaid: (allocation: AllocationRow, batch: BatchRow) => void
) {
  const batchRows = rows.filter((item) => item.batch_id === batch.id);
  if (batchRows.length === 0) return null;

  return (
    <div style={allocationDetailStyle}>
      {batchRows.map((item) => {
        const paid = item.payment_status === "paid";
        const statusLabel = item.is_company_share ? "Company Share" : paid ? "Paid" : item.payment_status === "voided" ? "Voided" : "Unpaid";
        return (
          <div key={item.id || `${item.recipient_name}-${item.amount}`} style={allocationRowStyle}>
            <div>
              <strong>{item.recipient_name || "-"}</strong>
              {item.role_label ? <span style={mutedInlineStyle}> {item.role_label}</span> : null}
              {item.percent ? <span style={mutedInlineStyle}> {item.percent}%</span> : null}
              <span style={item.is_company_share ? companyTagStyle : recipientTagStyle}> {statusLabel}</span>
              <div style={mutedTextStyle}>{formatMoney(parseMoney(item.amount))}</div>
            </div>
            {!item.is_company_share && !paid && batch.status !== "voided" && item.payment_status !== "voided" && canEdit ? (
              <button
                type="button"
                onClick={() => onMarkPaid(item, batch)}
                disabled={payingAllocationId === item.id}
                style={smallButtonStyle}
              >
                {payingAllocationId === item.id ? "Paying..." : "Mark as Paid"}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function getLedgerCategory(batch: BatchRow) {
  if (batch.revenue_type === "travel_fee") return "ค่าเดินทางรับจากลูกค้า";
  if (batch.case_id) return "เงินเข้าบริษัทจากคดี";
  if (batch.advisory_matter_id) return "เงินเข้าบริษัทจาก Advisory";
  return "รายรับอื่น";
}

function isDuplicatePostError(error: { code?: string; message?: string } | null) {
  const message = (error?.message || "").toLowerCase();
  return error?.code === "23505" || message.includes("duplicate") || message.includes("source_compensation_batch_id");
}

function normalizeFormula(value?: string | null): FormulaCode {
  if (value === "tun_line" || value === "source_worker_qc" || value === "travel_fee" || value === "custom") return value;
  return "pao_line";
}

function renderFormula(value?: string | null) {
  if (value === "pao_line") return "Pao Line";
  if (value === "tun_line") return "Tun Line";
  if (value === "source_worker_qc") return "Source / Worker / QC";
  if (value === "travel_fee") return "Travel Fee";
  if (value === "custom") return "Custom";
  return value || "-";
}

function isRealUserProfile(user: UserProfileRow) {
  const email = (user.email || "").trim().toLowerCase();
  const fullName = (user.full_name || "").trim().toLowerCase();
  const staffName = (user.staff_name || "").trim().toLowerCase();
  if (email.includes("test") || email.endsWith("@example.com")) return false;
  if (fullName.startsWith("test") || staffName.startsWith("test")) return false;
  return true;
}

function renderUserLabel(user: UserProfileRow) { return user.staff_name || user.full_name || user.email || user.id; }
function renderCaseLabel(item: CaseRow) { return [item.file_no, item.title || item.client_name].filter(Boolean).join(" - ") || String(item.id); }
function renderMatterLabel(item: MatterRow) { return [item.matter_no, item.title].filter(Boolean).join(" - ") || item.id; }
function parseMoney(value: number | string | null | undefined) { const amount = Number(String(value || "").replace(/,/g, "").trim()); return Number.isFinite(amount) ? amount : 0; }
function toAmount(value: number | string | null) { return parseMoney(value); }
function roundMoney(value: number) { return Math.round(value * 100) / 100; }
function formatPercent(value: number) { return String(Math.round(value * 10000) / 10000); }
function formatMoney(value: number) { return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function getDateKey(value: Date) { return value.toISOString().slice(0, 10); }
function getMonthKey(value: Date) { return value.toISOString().slice(0, 7); }
function isBatchInSelectedMonth(batch: BatchRow, selectedMonth: string) {
  if (!selectedMonth) return true;
  return String(batch.received_date || "").startsWith(selectedMonth);
}
function formatMonthLabel(value: string) {
  if (!value) return "All Time";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const pageStyle: CSSProperties = { minHeight: "100vh", padding: 24, background: "#f7f7f8", color: "#111111", overflowX: "hidden" };
const panelStyle: CSSProperties = { border: "1px solid #dddddd", borderRadius: 8, background: "#ffffff", padding: 18, marginBottom: 16 };
const filterPanelStyle: CSSProperties = { ...panelStyle, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" };
const noAccessStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const errorStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 };
const summaryCardStyle: CSSProperties = { ...panelStyle, marginBottom: 0 };
const summaryLabelStyle: CSSProperties = { color: "#666666", fontSize: 12, fontWeight: 700 };
const summaryValueStyle: CSSProperties = { color: "#111111", fontSize: 24, fontWeight: 900, marginTop: 6 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 14 };
const labelStyle: CSSProperties = { display: "grid", gap: 7, minWidth: 0, fontSize: 13, fontWeight: 700 };
const wideLabelStyle: CSSProperties = { ...labelStyle, gridColumn: "1 / -1" };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cccccc", borderRadius: 6, fontSize: 14 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 70 };
const sectionTitleStyle: CSSProperties = { margin: "0 0 12px", fontSize: 18, fontWeight: 900 };
const toolbarStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" };
const actionRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const actionStackStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center", minWidth: 220 };
const primaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #111111", borderRadius: 6, background: "#111111", color: "#ffffff", cursor: "pointer", fontWeight: 800 };
const primarySmallButtonStyle: CSSProperties = { ...primaryButtonStyle, padding: "6px 9px" };
const secondaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #cccccc", borderRadius: 6, background: "#ffffff", cursor: "pointer", fontWeight: 800 };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 9px" };
const dangerButtonStyle: CSSProperties = { padding: "6px 9px", border: "1px solid #a40000", borderRadius: 6, background: "#fff5f5", color: "#a40000", cursor: "pointer", fontWeight: 800 };
const moreMenuStyle: CSSProperties = { position: "relative" };
const moreButtonStyle: CSSProperties = { ...smallButtonStyle, listStyle: "none", padding: "6px 10px" };
const moreMenuContentStyle: CSSProperties = { position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20, display: "grid", gap: 4, minWidth: 132, padding: 6, border: "1px solid #dddddd", borderRadius: 8, background: "#ffffff", boxShadow: "0 10px 20px rgba(15, 23, 42, 0.12)" };
const dangerMenuButtonStyle: CSSProperties = { ...dangerButtonStyle, textAlign: "left" };
const tableWrapStyle: CSSProperties = { overflowX: "auto", maxWidth: "100%" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1100 };
const compactTableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 640 };
const thStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #dddddd", textAlign: "left", fontSize: 12 };
const tdStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #eeeeee", fontSize: 13, verticalAlign: "top" };
const emptyStyle: CSSProperties = { padding: 12, border: "1px dashed #cccccc", borderRadius: 6, color: "#666666" };
const helpTextStyle: CSSProperties = { color: "#0f2743", fontSize: 12, fontWeight: 800, flexBasis: "100%" };
const postedStyle: CSSProperties = { color: "#14532d", fontWeight: 800, flexBasis: "100%" };
const batchContextStyle: CSSProperties = { display: "grid", gap: 4 };
const recipientGridStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 180 };
const workPoolPanelStyle: CSSProperties = { display: "grid", gap: 8, padding: 12, border: "1px solid #d7e3f0", borderRadius: 8, background: "#f8fbff", marginBottom: 12, fontSize: 13 };
const workPoolSummaryStyle: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", color: "#0f2743", fontWeight: 800 };
const checkboxLabelStyle: CSSProperties = { display: "flex", gap: 8, alignItems: "center", fontWeight: 800 };
const allocationDetailStyle: CSSProperties = { display: "grid", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #eeeeee" };
const allocationRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" };
const mutedInlineStyle: CSSProperties = { color: "#666666", fontSize: 12, fontWeight: 600 };
const mutedTextStyle: CSSProperties = { color: "#555555", fontSize: 12, marginTop: 2 };
const companyTagStyle: CSSProperties = { display: "inline-block", marginLeft: 6, padding: "2px 6px", borderRadius: 999, background: "#0f2743", color: "#ffffff", fontSize: 11, fontWeight: 800 };
const recipientTagStyle: CSSProperties = { display: "inline-block", marginLeft: 6, padding: "2px 6px", borderRadius: 999, background: "#eef2f7", color: "#0f2743", fontSize: 11, fontWeight: 800 };
const subNavStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 };
const subNavLinkStyle: CSSProperties = { padding: "9px 12px", border: "1px solid #cccccc", borderRadius: 6, color: "#111111", textDecoration: "none", fontWeight: 800, background: "#ffffff" };
const subNavActiveLinkStyle: CSSProperties = { ...subNavLinkStyle, background: "#111111", color: "#ffffff", borderColor: "#111111" };
