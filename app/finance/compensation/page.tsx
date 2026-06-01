"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { createAuditLog } from "../../../lib/auditLog";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissions, UserRole } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";

type Profile = { role?: UserRole | string | null; financial_access?: boolean | null; full_name?: string | null; staff_name?: string | null };
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
  const [errorText, setErrorText] = useState("");

  const permissions: UserPermissions = useMemo(() => buildPermissions(profile), [profile]);
  const actorName = profile.full_name || profile.staff_name || userEmail;
  const receivedAmount = parseMoney(form.received_amount);

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
          .select("role, financial_access, full_name, staff_name")
          .eq("id", userData.user.id)
          .single();
        setProfile({
          role: data?.role || "",
          financial_access: data?.financial_access === true,
          full_name: data?.full_name || "",
          staff_name: data?.staff_name || "",
        });
      } finally {
        setLoadingProfile(false);
      }
    };
    loadProfile();
  }, []);

  const loadData = useCallback(async () => {
    if (!permissions.canViewFinanceModule) return;
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
  }, [permissions.canViewFinanceModule]);

  useEffect(() => {
    if (!loadingProfile) loadData();
  }, [loadingProfile, loadData]);

  useEffect(() => {
    if (!editingBatchId) setAllocations(generateAllocations(form.formula_code, receivedAmount));
  }, [editingBatchId, form.formula_code, receivedAmount]);

  const summary = useMemo(() => {
    const activeBatchIds = new Set(batches.filter((item) => item.status !== "voided").map((item) => item.id));
    const activeAllocations = allAllocations.filter((item) => item.batch_id && activeBatchIds.has(item.batch_id));
    const recipientAllocations = activeAllocations.filter((item) => !item.is_company_share);
    const recipientPaid = recipientAllocations
      .filter((item) => item.payment_status === "paid")
      .reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const recipientTotal = recipientAllocations.reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const recipientKeys = new Set(recipientAllocations.map(getRecipientSummaryKey));

    return {
      draft: batches.filter((item) => item.status === "draft").length,
      finalized: batches.filter((item) => item.status === "finalized").length,
      posted: batches.filter((item) => item.status === "posted").length,
      companyShare: activeAllocations
        .filter((item) => item.is_company_share)
        .reduce((sum, item) => sum + parseMoney(item.amount), 0),
      recipientTotal,
      recipientPaid,
      recipientUnpaid: recipientTotal - recipientPaid,
      recipientCount: recipientKeys.size,
    };
  }, [allAllocations, batches]);

  const recipientSummary = useMemo(() => {
    const activeBatchIds = new Set(batches.filter((item) => item.status !== "voided").map((item) => item.id));
    const grouped = new Map<string, { name: string; allocated: number; paid: number }>();
    allAllocations
      .filter((item) => item.batch_id && activeBatchIds.has(item.batch_id) && !item.is_company_share)
      .forEach((item) => {
        const key = getRecipientSummaryKey(item);
        const current = grouped.get(key) || { name: item.recipient_name || "-", allocated: 0, paid: 0 };
        const amount = parseMoney(item.amount);
        current.allocated += amount;
        if (item.payment_status === "paid") current.paid += amount;
        grouped.set(key, current);
      });
    return Array.from(grouped.values()).map((item) => ({ ...item, unpaid: item.allocated - item.paid }));
  }, [allAllocations, batches]);

  const saveDraft = async () => {
    if (!permissions.canEditFinanceModule) return;
    const validation = validateAllocations(form, allocations);
    if (validation) return alert(validation);
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
        const { data, error } = await supabase.from("finance_compensation_batches").update(payload).eq("id", editingBatchId).eq("status", "draft").select("*").single();
        if (error || !data) return alert(error?.message || "Update batch failed");
        const { error: deleteError } = await supabase.from("finance_compensation_allocations").delete().eq("batch_id", editingBatchId);
        if (deleteError) return alert(deleteError.message || "Delete old allocations failed");
        await insertAllocations(editingBatchId);
        await auditFinance("update", "finance_compensation_batches", editingBatchId, oldBatch, data, "Update compensation draft");
      } else {
        const { data, error } = await supabase.from("finance_compensation_batches").insert([{
          ...payload,
          created_by_user_id: userId || null,
          created_by_email: userEmail || null,
          created_by_name: actorName || null,
        }]).select("*").single();
        if (error || !data) return alert(error?.message || "Create batch failed");
        await insertAllocations(data.id);
        await auditFinance("create", "finance_compensation_batches", data.id, null, data, "Create compensation draft");
      }
      resetForm();
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Save draft failed");
    } finally {
      setSaving(false);
    }
  };

  const insertAllocations = async (batchId: string) => {
    const now = new Date().toISOString();
    const payload = allocations.map((item) => ({
      batch_id: batchId,
      recipient_type: item.recipient_type,
      recipient_user_id: item.recipient_user_id && item.recipient_user_id !== otherValue ? item.recipient_user_id : null,
      recipient_name: getRecipientName(item, users),
      role_label: item.role_label || null,
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
    const batchAllocations = allAllocations.filter((item) => item.batch_id === batch.id);
    setEditingBatchId(batch.id);
    setForm({
      received_date: batch.received_date || getDateKey(new Date()),
      received_amount: String(batch.received_amount || ""),
      revenue_type: batch.revenue_type || "professional_fee",
      formula_code: normalizeFormula(batch.formula_code),
      client_id: batch.client_id || "",
      case_id: batch.case_id ? String(batch.case_id) : "",
      advisory_matter_id: batch.advisory_matter_id || "",
      description: batch.description || "",
      note: batch.note || "",
    });
    setAllocations(batchAllocations.length ? batchAllocations.map(prepareAllocationForEdit) : []);
  };

  const finalizeBatch = async (batch: BatchRow) => {
    if (!permissions.canEditFinanceModule || batch.status !== "draft") return;
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
    if (!permissions.canEditFinanceModule || batch.status !== "finalized") return;
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
      const kbank = bankAccounts.find((account) => (account.short_name || "").toUpperCase() === "KBANK");
      if (!kbank) return alert("ไม่พบ KBANK bank account");
      const companyShare = allAllocations
        .filter((item) => item.batch_id === batch.id && item.is_company_share)
        .reduce((sum, item) => sum + parseMoney(item.amount), 0);
      if (companyShare <= 0) return alert("Company share must be greater than zero");
      const now = new Date().toISOString();
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
    if (!permissions.canVoidFinanceEntry) return;
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
    if (!permissions.canEditFinanceModule || !allocation.id || allocation.is_company_share) return;
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
    setAllocations(generateAllocations("pao_line", 0));
  };

  const updateAllocation = (index: number, patch: Partial<AllocationRow>) => {
    setAllocations(allocations.map((item, itemIndex) => itemIndex === index ? normalizeAllocationForState({ ...item, ...patch }) : item));
  };

  const addAllocation = () => {
    setAllocations([
      ...allocations,
      form.formula_code === "source_worker_qc"
        ? createAllocation("assistant", "", 0, false, "Assistant")
        : createAllocation("other", "", 0, false, "Other"),
    ]);
  };

  const updatePercent = (index: number, value: string) => {
    const row = allocations[index];
    const actualPercent = isSourcePoolRow(row, form.formula_code) ? (parseMoney(value) * 40) / 100 : parseMoney(value);
    updateAllocation(index, {
      percent: formatPercent(actualPercent),
      amount: receivedAmount ? String(roundMoney((receivedAmount * actualPercent) / 100)) : row.amount,
    });
  };

  const updateAmount = (index: number, value: string) => {
    const actualPercent = receivedAmount ? (parseMoney(value) / receivedAmount) * 100 : 0;
    updateAllocation(index, { amount: value, percent: formatPercent(actualPercent) });
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

  const removeAllocation = (index: number) => {
    setAllocations(allocations.filter((_, itemIndex) => itemIndex !== index));
  };

  if (loadingProfile) {
    return <AuthGuard><main style={pageStyle}><div style={panelStyle}>Loading permission...</div></main></AuthGuard>;
  }

  if (!permissions.canViewFinanceModule) {
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
        <FinanceSubNav activePage="compensation" />
        {errorText ? <div style={errorStyle}>{errorText}</div> : null}
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

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Recipient Income Summary</h2>
          <div style={tableWrapStyle}>
            <table style={compactTableStyle}>
              <thead><tr><th style={thStyle}>Recipient</th><th style={thStyle}>Allocated</th><th style={thStyle}>Paid</th><th style={thStyle}>Unpaid</th></tr></thead>
              <tbody>
                {recipientSummary.map((item) => (
                  <tr key={item.name}>
                    <td style={tdStyle}>{item.name}</td>
                    <td style={tdStyle}>{formatMoney(item.allocated)}</td>
                    <td style={tdStyle}>{formatMoney(item.paid)}</td>
                    <td style={tdStyle}>{formatMoney(item.unpaid)}</td>
                  </tr>
                ))}
                {recipientSummary.length === 0 ? <tr><td colSpan={4} style={tdStyle}>No recipient income.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>{editingBatchId ? "Edit Draft" : "Create Compensation Batch"}</h2>
          <div style={formGridStyle}>
            <label style={labelStyle}>Received Date<input type="date" value={form.received_date} onChange={(event) => setForm({ ...form, received_date: event.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Received Amount<input value={form.received_amount} onChange={(event) => setForm({ ...form, received_amount: event.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Revenue Type<select value={form.revenue_type} onChange={(event) => setForm({ ...form, revenue_type: event.target.value })} style={inputStyle}><option value="professional_fee">Professional Fee</option><option value="service_fee">Service Fee</option><option value="travel_fee">Travel Fee</option><option value="other">Other</option></select></label>
            <label style={labelStyle}>Formula<select value={form.formula_code} onChange={(event) => setForm({ ...form, formula_code: event.target.value as FormulaCode })} style={inputStyle}><option value="pao_line">Pao Line</option><option value="tun_line">Tun Line</option><option value="source_worker_qc">Source / Worker / QC</option><option value="travel_fee">Travel Fee</option><option value="custom">Custom</option></select></label>
            <label style={labelStyle}>Client<select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} style={inputStyle}><option value="">-</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}</select></label>
            <label style={labelStyle}>Case<select value={form.case_id} onChange={(event) => setForm({ ...form, case_id: event.target.value })} style={inputStyle}><option value="">-</option>{cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}</select></label>
            <label style={labelStyle}>Advisory Matter<select value={form.advisory_matter_id} onChange={(event) => setForm({ ...form, advisory_matter_id: event.target.value })} style={inputStyle}><option value="">-</option>{matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}</select></label>
            <label style={wideLabelStyle}>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} style={inputStyle} /></label>
            <label style={wideLabelStyle}>Note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} style={textareaStyle} /></label>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <h2 style={sectionTitleStyle}>Allocation Editor</h2>
            <button type="button" onClick={addAllocation} style={secondaryButtonStyle}>{form.formula_code === "source_worker_qc" ? "Add Work Pool Row" : "Add Row"}</button>
          </div>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Type</th><th style={thStyle}>Recipient</th><th style={thStyle}>Role</th><th style={thStyle}>Percent</th><th style={thStyle}>Amount</th><th style={thStyle}>Company</th><th style={thStyle}>Note</th><th style={thStyle}>Actions</th></tr></thead>
              <tbody>
                {allocations.map((row, index) => (
                  <tr key={`${index}-${row.recipient_type}`}>
                    <td style={tdStyle}><select value={row.recipient_type} onChange={(event) => updateRecipientType(index, event.target.value)} style={inputStyle}>{recipientTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></td>
                    <td style={tdStyle}><RecipientEditor row={row} users={users} onChange={(patch) => updateAllocation(index, patch)} /></td>
                    <td style={tdStyle}><select value={row.role_label} onChange={(event) => updateAllocation(index, { role_label: event.target.value })} style={inputStyle}><option value="">-</option>{roleLabels.map((label) => <option key={label} value={label}>{label}</option>)}</select></td>
                    <td style={tdStyle}><input value={getDisplayPercent(row, form.formula_code)} onChange={(event) => updatePercent(index, event.target.value)} style={inputStyle} /></td>
                    <td style={tdStyle}><input value={row.amount} onChange={(event) => updateAmount(index, event.target.value)} style={inputStyle} /></td>
                    <td style={tdStyle}><input type="checkbox" checked={row.is_company_share} onChange={(event) => updateAllocation(index, { is_company_share: event.target.checked })} /></td>
                    <td style={tdStyle}><input value={row.note} onChange={(event) => updateAllocation(index, { note: event.target.value })} style={inputStyle} /></td>
                    <td style={tdStyle}><button type="button" onClick={() => removeAllocation(index)} style={dangerButtonStyle}>Remove</button></td>
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
              <thead><tr><th style={thStyle}>Date</th><th style={thStyle}>Formula</th><th style={thStyle}>Amount</th><th style={thStyle}>Company Share</th><th style={thStyle}>Status</th><th style={thStyle}>Ledger</th><th style={thStyle}>Actions</th></tr></thead>
              <tbody>
                {batches.map((batch) => {
                  const companyShare = getCompanyShare(batch.id, allAllocations);
                  return (
                    <tr key={batch.id}>
                      <td style={tdStyle}>{batch.received_date}</td>
                      <td style={tdStyle}>{renderFormula(batch.formula_code)}{renderAllocationDetails(batch, allAllocations, permissions.canEditFinanceModule, payingAllocationId, markAllocationPaid)}</td>
                      <td style={tdStyle}>{formatMoney(toAmount(batch.received_amount))}</td>
                      <td style={tdStyle}>{formatMoney(companyShare)}</td>
                      <td style={tdStyle}>{renderBatchStatus(batch)}</td>
                      <td style={tdStyle}>{batch.ledger_entry_id ? `Posted: ${batch.ledger_entry_id}` : "-"}</td>
                      <td style={tdStyle}>
                        <div style={actionStackStyle}>
                          {batch.status === "draft" ? <button type="button" onClick={() => editDraft(batch)} style={smallButtonStyle}>Edit</button> : null}
                          {batch.status === "draft" ? <button type="button" onClick={() => finalizeBatch(batch)} style={smallButtonStyle}>Finalize</button> : null}
                          {batch.status === "finalized" && !batch.ledger_entry_id ? <div style={helpTextStyle}>ส่วนของบริษัทจะเข้าบัญชี KBANK เท่านั้น</div> : null}
                          {batch.status === "finalized" && !batch.ledger_entry_id ? <button type="button" onClick={() => postCompanyShare(batch)} disabled={postingBatchId === batch.id} style={primarySmallButtonStyle}>{postingBatchId === batch.id ? "Posting..." : "Post Company Share"}</button> : null}
                          {["draft", "finalized"].includes(batch.status) ? <button type="button" onClick={() => voidBatch(batch)} style={dangerButtonStyle}>Void</button> : null}
                          {batch.status === "posted" ? <div style={postedStyle}>Posted to Ledger</div> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {batches.length === 0 ? <tr><td colSpan={7} style={tdStyle}>No compensation batches.</td></tr> : null}
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

function FinanceSubNav({ activePage }: { activePage: "ledger" | "claims" | "compensation" }) {
  return (
    <nav style={subNavStyle}>
      <Link href="/finance/ledger" style={activePage === "ledger" ? subNavActiveLinkStyle : subNavLinkStyle}>Ledger</Link>
      <Link href="/finance/expense-claims" style={activePage === "claims" ? subNavActiveLinkStyle : subNavLinkStyle}>Expense Claims</Link>
      <Link href="/finance/compensation" style={activePage === "compensation" ? subNavActiveLinkStyle : subNavLinkStyle}>Lawyer Compensation</Link>
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
  return [createAllocation("company", "Company", 0, true, "Company", total)];
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
  if (!rows.some((item) => item.is_company_share)) return "At least one company allocation is required";
  if (rows.some((item) => item.is_company_share && item.recipient_type !== "company")) return "Company allocation must use recipient_type company";
  if (rows.some((item) => !item.payment_status)) return "Every allocation row needs payment status";
  if (rows.some((item) => item.recipient_type === "source" && !item.role_label)) return "Source row needs Client Source / Broker role";
  if (rows.some((item) => !getRecipientName(item, []))) return "Every allocation row needs recipient name";
  if (form.formula_code === "travel_fee" && (rows.length !== 1 || !rows[0].is_company_share || parseMoney(rows[0].amount) !== total)) return "Travel Fee must be company 100%";
  if (form.formula_code === "source_worker_qc") {
    const source = rows.filter((item) => item.recipient_type === "source").reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const company = rows.filter((item) => item.is_company_share).reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const pool = allocationTotal - source - company;
    const poolPercent = rows
      .filter((item) => isSourcePoolRow(item, form.formula_code))
      .reduce((sum, item) => sum + getPoolPercent(item), 0);
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

function isSourcePoolRow(row: AllocationRow, formula: FormulaCode) {
  return formula === "source_worker_qc" && row.recipient_type !== "source" && !row.is_company_share;
}

function getPoolPercent(row: AllocationRow) {
  return (parseMoney(row.percent) / 40) * 100;
}

function getDisplayPercent(row: AllocationRow, formula: FormulaCode) {
  return isSourcePoolRow(row, formula) ? formatPercent(getPoolPercent(row)) : row.percent;
}

function normalizeAllocationForState(row: AllocationRow): AllocationRow {
  return {
    ...row,
    recipient_user_id: row.recipient_user_id || "",
    recipient_name: row.recipient_name || (row.recipient_type === "company" ? "Company" : ""),
    role_label: row.role_label || "",
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

function getRecipientSummaryKey(row: AllocationRow) {
  return row.recipient_user_id && row.recipient_user_id !== otherValue
    ? `user:${row.recipient_user_id}`
    : `name:${(row.recipient_name || "-").trim().toLowerCase()}`;
}

function renderBatchStatus(batch: BatchRow) {
  if (batch.status === "posted") return <div style={postedStyle}>Company Share Posted to Ledger</div>;
  return batch.status;
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

const pageStyle: CSSProperties = { minHeight: "100vh", padding: 24, background: "#f7f7f8", color: "#111111", overflowX: "hidden" };
const panelStyle: CSSProperties = { border: "1px solid #dddddd", borderRadius: 8, background: "#ffffff", padding: 18, marginBottom: 16 };
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
const actionStackStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 220 };
const primaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #111111", borderRadius: 6, background: "#111111", color: "#ffffff", cursor: "pointer", fontWeight: 800 };
const primarySmallButtonStyle: CSSProperties = { ...primaryButtonStyle, padding: "6px 9px" };
const secondaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #cccccc", borderRadius: 6, background: "#ffffff", cursor: "pointer", fontWeight: 800 };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 9px" };
const dangerButtonStyle: CSSProperties = { padding: "6px 9px", border: "1px solid #a40000", borderRadius: 6, background: "#fff5f5", color: "#a40000", cursor: "pointer", fontWeight: 800 };
const tableWrapStyle: CSSProperties = { overflowX: "auto", maxWidth: "100%" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1100 };
const compactTableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 640 };
const thStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #dddddd", textAlign: "left", fontSize: 12 };
const tdStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #eeeeee", fontSize: 13, verticalAlign: "top" };
const emptyStyle: CSSProperties = { padding: 12, border: "1px dashed #cccccc", borderRadius: 6, color: "#666666" };
const helpTextStyle: CSSProperties = { color: "#0f2743", fontSize: 12, fontWeight: 800 };
const postedStyle: CSSProperties = { color: "#14532d", fontWeight: 800 };
const recipientGridStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 180 };
const allocationDetailStyle: CSSProperties = { display: "grid", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #eeeeee" };
const allocationRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" };
const mutedInlineStyle: CSSProperties = { color: "#666666", fontSize: 12, fontWeight: 600 };
const mutedTextStyle: CSSProperties = { color: "#555555", fontSize: 12, marginTop: 2 };
const companyTagStyle: CSSProperties = { display: "inline-block", marginLeft: 6, padding: "2px 6px", borderRadius: 999, background: "#0f2743", color: "#ffffff", fontSize: 11, fontWeight: 800 };
const recipientTagStyle: CSSProperties = { display: "inline-block", marginLeft: 6, padding: "2px 6px", borderRadius: 999, background: "#eef2f7", color: "#0f2743", fontSize: 11, fontWeight: 800 };
const subNavStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 };
const subNavLinkStyle: CSSProperties = { padding: "9px 12px", border: "1px solid #cccccc", borderRadius: 6, color: "#111111", textDecoration: "none", fontWeight: 800, background: "#ffffff" };
const subNavActiveLinkStyle: CSSProperties = { ...subNavLinkStyle, background: "#111111", color: "#ffffff", borderColor: "#111111" };
