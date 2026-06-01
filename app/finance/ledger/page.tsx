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

type Profile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  full_name?: string | null;
  staff_name?: string | null;
};

type LedgerRow = {
  id: string;
  transaction_date: string;
  entry_type: EntryType | string;
  category: string | null;
  amount: number | string | null;
  bank_account_id: string | null;
  transfer_group_id: string | null;
  client_id: string | null;
  case_id: number | null;
  advisory_matter_id: string | null;
  expense_claimant_user_id: string | null;
  expense_claimant_name: string | null;
  payment_method: string | null;
  reference_no: string | null;
  description: string | null;
  note: string | null;
  status: "active" | "voided" | string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ClientRow = { id: string; name: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };
type BankAccountRow = { id: string; short_name: string | null; bank_name: string | null };
type UserProfileRow = { id: string; full_name: string | null; staff_name: string | null; email: string | null };
type EntryType = "income" | "expense" | "transfer";
const otherClaimantValue = "__other__";

type LedgerForm = {
  id: string;
  transaction_date: string;
  entry_type: EntryType;
  category: string;
  custom_category: string;
  amount: string;
  bank_account_id: string;
  from_bank_account_id: string;
  to_bank_account_id: string;
  client_id: string;
  case_id: string;
  advisory_matter_id: string;
  expense_claimant_user_id: string;
  expense_claimant_name: string;
  payment_method: string;
  reference_no: string;
  description: string;
  note: string;
};

const emptyForm: LedgerForm = {
  id: "",
  transaction_date: getDateKey(new Date()),
  entry_type: "income",
  category: "เงินเข้าบริษัทจากคดี",
  custom_category: "",
  amount: "",
  bank_account_id: "",
  from_bank_account_id: "",
  to_bank_account_id: "",
  client_id: "",
  case_id: "",
  advisory_matter_id: "",
  expense_claimant_user_id: "",
  expense_claimant_name: "",
  payment_method: "",
  reference_no: "",
  description: "",
  note: "",
};

const incomeCategories = [
  "ยอดยกมาก่อนเริ่มระบบ",
  "เงินเข้าบริษัทจากคดี",
  "เงินเข้าบริษัทจาก Advisory",
  "ค่าเดินทางรับจากลูกค้า",
  "เงินคืนค่าใช้จ่าย",
  "รายรับอื่น",
  "Other",
];

const expenseCategories = [
  "เงินเดือน / ค่าจ้าง",
  "ค่าตอบแทนผู้ช่วย / ฟรีแลนซ์",
  "ค่าเดินทาง",
  "ค่าน้ำมัน / ทางด่วน / ที่จอดรถ",
  "ค่าส่งเอกสาร",
  "ค่าถ่ายเอกสาร / ค่าเอกสาร",
  "ค่าธรรมเนียมศาล / ค่าธรรมเนียมราชการ",
  "ค่าอากร / ภาษี",
  "ค่าเช่า / ค่าใช้จ่ายสำนักงาน",
  "อุปกรณ์สำนักงาน",
  "ค่า Software / System",
  "ค่าเว็บไซต์ / Hosting / Domain",
  "ค่าการตลาด / โฆษณา",
  "ค่าบัญชี / ภาษี / ที่ปรึกษา",
  "ค่าธรรมเนียมธนาคาร",
  "รับรองลูกค้า / ประชุมงาน",
  "ค่าใช้จ่ายทั่วไป",
  "Other",
];

const transferCategories = ["โอนย้ายระหว่างบัญชีบริษัท"];

const claimantRequiredCategories = [
  "ค่าเดินทาง",
  "ค่าน้ำมัน / ทางด่วน / ที่จอดรถ",
  "ค่าส่งเอกสาร",
  "ค่าถ่ายเอกสาร / ค่าเอกสาร",
  "ค่าธรรมเนียมศาล / ค่าธรรมเนียมราชการ",
  "อุปกรณ์สำนักงาน",
  "รับรองลูกค้า / ประชุมงาน",
  "ค่าใช้จ่ายทั่วไป",
];

export default function FinanceLedgerPage() {
  const [profile, setProfile] = useState<Profile>({ role: "", financial_access: false });
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [matters, setMatters] = useState<MatterRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([]);
  const [claimantUsers, setClaimantUsers] = useState<UserProfileRow[]>([]);
  const [form, setForm] = useState<LedgerForm>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [monthFilter, setMonthFilter] = useState(getMonthKey(new Date()));
  const [entryTypeFilter, setEntryTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [errorText, setErrorText] = useState("");

  const permissions: UserPermissions = useMemo(() => buildPermissions(profile), [profile]);
  const actorName = profile.full_name || profile.staff_name || userEmail;

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) return;

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

  const loadLedger = useCallback(async () => {
    if (!permissions.canViewFinanceModule) return;

    try {
      setLoading(true);
      setErrorText("");

      const [ledgerRes, clientsRes, casesRes, mattersRes, bankAccountsRes, usersRes] = await Promise.all([
        supabase
          .from("finance_company_ledger")
          .select("*")
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("clients").select("id, name").order("name", { ascending: true }),
        supabase.from("cases").select("id, file_no, title, client_name").order("id", { ascending: false }),
        supabase.from("advisory_matters").select("id, matter_no, title").order("created_at", { ascending: false }),
        supabase
          .from("finance_bank_accounts")
          .select("id, short_name, bank_name")
          .eq("is_active", true)
          .order("short_name", { ascending: true }),
        supabase
          .from("user_profiles")
          .select("id, full_name, staff_name, email")
          .eq("active", true)
          .order("full_name", { ascending: true }),
      ]);

      if (ledgerRes.error) {
        setErrorText(ledgerRes.error.message);
        return;
      }

      setRows((ledgerRes.data || []) as LedgerRow[]);
      setClients((clientsRes.data || []) as ClientRow[]);
      setCases((casesRes.data || []) as CaseRow[]);
      setMatters((mattersRes.data || []) as MatterRow[]);
      setBankAccounts((bankAccountsRes.data || []) as BankAccountRow[]);
      setClaimantUsers(((usersRes.data || []) as UserProfileRow[]).filter(isRealUserProfile));
    } finally {
      setLoading(false);
    }
  }, [permissions.canViewFinanceModule]);

  useEffect(() => {
    if (loadingProfile) return;
    loadLedger();
  }, [loadingProfile, loadLedger]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (monthFilter && !String(row.transaction_date || "").startsWith(monthFilter)) return false;
      if (entryTypeFilter !== "all" && row.entry_type !== entryTypeFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [entryTypeFilter, monthFilter, rows, statusFilter]);

  const summary = useMemo(() => {
    const activeRows = filteredRows.filter((row) => row.status === "active");
    const income = activeRows
      .filter((row) => row.entry_type === "income")
      .reduce((sum, row) => sum + toAmount(row.amount), 0);
    const expense = activeRows
      .filter((row) => row.entry_type === "expense")
      .reduce((sum, row) => sum + toAmount(row.amount), 0);

    return {
      income,
      expense,
      net: income - expense,
      activeCount: activeRows.length,
      bankBalances: bankAccounts.map((account) => ({
        account,
        balance: activeRows
          .filter((row) => row.bank_account_id === account.id)
          .reduce((sum, row) => sum + getBankSignedAmount(row), 0),
      })),
      totalBankBalance: activeRows.reduce(
        (sum, row) => sum + getBankSignedAmount(row),
        0
      ),
    };
  }, [bankAccounts, filteredRows]);

  const resetForm = () => {
    setForm({ ...emptyForm, transaction_date: getDateKey(new Date()) });
    setIsEditing(false);
  };

  const startEdit = (row: LedgerRow) => {
    if (row.status !== "active") return;
    if (row.entry_type === "transfer_in" || row.entry_type === "transfer_out") {
      alert("Transfer entries cannot be edited. Void the transfer and create a new one.");
      return;
    }
    const entryType = normalizeEntryType(row.entry_type);
    const hasRealClaimantUser =
      row.expense_claimant_user_id &&
      claimantUsers.some((user) => user.id === row.expense_claimant_user_id);
    const claimantSelector = hasRealClaimantUser
      ? row.expense_claimant_user_id || ""
      : row.expense_claimant_name
        ? otherClaimantValue
        : "";
    setForm({
      id: row.id,
      transaction_date: row.transaction_date || getDateKey(new Date()),
      entry_type: entryType,
      ...resolveEditCategory(entryType, row.category || ""),
      amount: String(row.amount || ""),
      bank_account_id: row.bank_account_id || "",
      from_bank_account_id: "",
      to_bank_account_id: "",
      client_id: row.client_id || "",
      case_id: row.case_id ? String(row.case_id) : "",
      advisory_matter_id: row.advisory_matter_id || "",
      expense_claimant_user_id: claimantSelector,
      expense_claimant_name: row.expense_claimant_name || "",
      payment_method: row.payment_method || "",
      reference_no: row.reference_no || "",
      description: row.description || "",
      note: row.note || "",
    });
    setIsEditing(true);
  };

  const saveLedger = async () => {
    if (!permissions.canEditFinanceModule) return;

    const amount = parseMoney(form.amount);
    if (!form.transaction_date) return alert("Transaction date is required");
    if (!amount || amount <= 0) return alert("Amount must be greater than zero");
    if (form.entry_type === "transfer") {
      if (isEditing) return alert("Transfer entries cannot be edited. Void the transfer and create a new one.");
      if (!form.from_bank_account_id) return alert("From Bank Account is required");
      if (!form.to_bank_account_id) return alert("To Bank Account is required");
      if (form.from_bank_account_id === form.to_bank_account_id) return alert("From Bank and To Bank must be different");
    } else if (!form.bank_account_id) {
      return alert("Bank account is required");
    }
    if (!form.category.trim()) return alert("Category is required");
    const category = form.entry_type === "transfer" ? transferCategories[0] : getCategoryForSave(form);
    if (!category) return alert("Custom Category is required");
    if (
      form.entry_type === "expense" &&
      form.expense_claimant_user_id === otherClaimantValue &&
      !form.expense_claimant_name.trim()
    ) {
      return alert("Claimant Name is required");
    }
    if (isClaimantRequired(form) && !getClaimantName(form, claimantUsers)) {
      return alert("Expense claimant is required for this category");
    }

    const basePayload = {
      transaction_date: form.transaction_date,
      category,
      amount,
      client_id: form.client_id || null,
      case_id: form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.advisory_matter_id || null,
      expense_claimant_user_id:
        form.entry_type === "expense" &&
        form.expense_claimant_user_id &&
        form.expense_claimant_user_id !== otherClaimantValue
          ? form.expense_claimant_user_id
          : null,
      expense_claimant_name:
        form.entry_type === "expense"
          ? getClaimantName(form, claimantUsers) || null
          : null,
      payment_method: form.payment_method.trim() || null,
      reference_no: form.reference_no.trim() || null,
      description: form.description.trim() || null,
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const payload = {
      ...basePayload,
      entry_type: form.entry_type,
      bank_account_id: form.bank_account_id,
    };

    try {
      setSaving(true);

      if (isEditing) {
        const oldData = rows.find((row) => row.id === form.id) || null;
        if (oldData?.status !== "active") return alert("Only active entries can be edited.");

        const { data, error } = await supabase
          .from("finance_company_ledger")
          .update(payload)
          .eq("id", form.id)
          .eq("status", "active")
          .select("*")
          .single();

        if (error || !data) return alert(error?.message || "Update ledger failed");

        await auditLedger("update", data.id, oldData, data, "Update company ledger entry");
      } else {
        if (form.entry_type === "transfer") {
          const transferGroupId = crypto.randomUUID();
          const transferRows = [
            {
              ...basePayload,
              entry_type: "transfer_out",
              bank_account_id: form.from_bank_account_id,
              transfer_group_id: transferGroupId,
              status: "active",
              created_by_user_id: userId || null,
              created_by_email: userEmail || null,
              created_by_name: actorName || null,
            },
            {
              ...basePayload,
              entry_type: "transfer_in",
              bank_account_id: form.to_bank_account_id,
              transfer_group_id: transferGroupId,
              status: "active",
              created_by_user_id: userId || null,
              created_by_email: userEmail || null,
              created_by_name: actorName || null,
            },
          ];
          const { data, error } = await supabase.from("finance_company_ledger").insert(transferRows).select("*");
          if (error || !data) {
            await loadLedger();
            return alert(error?.message || "Create transfer failed");
          }
          await auditLedger("create", transferGroupId, null, data, "Create company ledger transfer pair");
        } else {
        const { data, error } = await supabase
          .from("finance_company_ledger")
          .insert([
            {
              ...payload,
              status: "active",
              created_by_user_id: userId || null,
              created_by_email: userEmail || null,
              created_by_name: actorName || null,
            },
          ])
          .select("*")
          .single();

        if (error || !data) return alert(error?.message || "Create ledger failed");

        await auditLedger("create", data.id, null, data, "Create company ledger entry");
        }
      }

      resetForm();
      await loadLedger();
    } finally {
      setSaving(false);
    }
  };

  const voidLedger = async (row: LedgerRow) => {
    if (!permissions.canVoidFinanceEntry || row.status !== "active") return;
    const reason = window.prompt("Void reason");
    if (!reason?.trim()) return;

    const payload = {
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: actorName || userEmail || null,
      void_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    };

    if (row.transfer_group_id) {
      const oldGroupRows = rows.filter((item) => item.transfer_group_id === row.transfer_group_id);
      const { data, error } = await supabase
        .from("finance_company_ledger")
        .update(payload)
        .eq("transfer_group_id", row.transfer_group_id)
        .eq("status", "active")
        .select("*");

      if (error || !data) return alert(error?.message || "Void transfer failed");
      await auditLedger("update", row.transfer_group_id, oldGroupRows, data, "Void company ledger transfer pair");
      await loadLedger();
      return;
    }

    const { data, error } = await supabase
      .from("finance_company_ledger")
      .update(payload)
      .eq("id", row.id)
      .eq("status", "active")
      .select("*")
      .single();

    if (error || !data) return alert(error?.message || "Void ledger failed");

    await auditLedger("update", row.id, row, data, "Void company ledger entry");
    await loadLedger();
  };

  const auditLedger = async (
    action: "create" | "update",
    recordId: string,
    oldData: unknown,
    newData: unknown,
    note: string
  ) => {
    try {
      await createAuditLog({
        caseId: null,
        tableName: "finance_company_ledger",
        recordId,
        action,
        oldData,
        newData,
        note,
      });
    } catch (error) {
      console.error("CREATE FINANCE AUDIT LOG FAILED:", error);
    }
  };

  const categoryOptions = getCategoryOptions(form.entry_type);

  const updateEntryType = (entryType: EntryType) => {
    setForm({
      ...form,
      entry_type: entryType,
      category: getCategoryOptions(entryType)[0] || "",
      custom_category: "",
      bank_account_id: entryType === "transfer" ? "" : form.bank_account_id,
      from_bank_account_id: "",
      to_bank_account_id: "",
      expense_claimant_user_id:
        entryType === "expense" ? form.expense_claimant_user_id : "",
      expense_claimant_name: entryType === "expense" ? form.expense_claimant_name : "",
    });
  };

  const updateClaimantUser = (userIdValue: string) => {
    if (!userIdValue) {
      setForm({
        ...form,
        expense_claimant_user_id: "",
        expense_claimant_name: "",
      });
      return;
    }

    if (userIdValue === otherClaimantValue) {
      setForm({
        ...form,
        expense_claimant_user_id: otherClaimantValue,
        expense_claimant_name: "",
      });
      return;
    }

    const selectedUser = claimantUsers.find((user) => user.id === userIdValue);
    setForm({
      ...form,
      expense_claimant_user_id: userIdValue,
      expense_claimant_name: selectedUser ? renderUserLabel(selectedUser) : form.expense_claimant_name,
    });
  };

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <div style={panelStyle}>Loading permission...</div>
        </main>
      </AuthGuard>
    );
  }

  if (!permissions.canViewFinanceModule) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="Company Ledger"
            subtitle="Company income and expenses"
            activePage="finance"
          />
          <div style={noAccessStyle}>No access</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav
          title="Company Ledger"
          subtitle="Company income and expenses recorded independently from case fees."
          activePage="finance"
        />

        <FinanceSubNav activePage="ledger" />

        {errorText ? <div style={errorStyle}>{errorText}</div> : null}

        <section style={summaryGridStyle}>
          <SummaryCard label="Operating Income" value={formatMoney(summary.income)} />
          <SummaryCard label="Operating Expense" value={formatMoney(summary.expense)} />
          <SummaryCard label="Operating Net" value={formatMoney(summary.net)} />
          <SummaryCard
            label="Total Bank Balance"
            value={formatMoney(summary.totalBankBalance)}
            tone="totalBank"
          />
          <SummaryCard label="Active Entries" value={String(summary.activeCount)} />
        </section>

        <section style={summaryGridStyle}>
          {summary.bankBalances.map(({ account, balance }) => (
            <SummaryCard
              key={account.id}
              label={`${account.short_name || "-"} Balance`}
              value={formatMoney(balance)}
              tone={getBankTone(account.short_name)}
            />
          ))}
        </section>

        <section style={panelStyle}>
          <div style={filterGridStyle}>
            <label style={labelStyle}>
              Month
              <input value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} type="month" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Type
              <select value={entryTypeFilter} onChange={(event) => setEntryTypeFilter(event.target.value)} style={inputStyle}>
                <option value="all">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer_in">Transfer In</option>
                <option value="transfer_out">Transfer Out</option>
              </select>
            </label>
            <label style={labelStyle}>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle}>
                <option value="active">Active</option>
                <option value="voided">Voided</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
        </section>

        {permissions.canEditFinanceModule ? (
          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>{isEditing ? "Edit ledger entry" : "Create ledger entry"}</h2>
            <div style={formGridStyle}>
              <label style={labelStyle}>Date<input type="date" value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Type<select value={form.entry_type} onChange={(event) => updateEntryType(event.target.value as EntryType)} style={inputStyle}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label>
              {form.entry_type === "transfer" ? (
                <>
                  <label style={labelStyle}>From Bank Account<select value={form.from_bank_account_id} onChange={(event) => setForm({ ...form, from_bank_account_id: event.target.value })} style={inputStyle}><option value="">Select from bank</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{renderBankLabel(account)}</option>)}</select></label>
                  <label style={labelStyle}>To Bank Account<select value={form.to_bank_account_id} onChange={(event) => setForm({ ...form, to_bank_account_id: event.target.value })} style={inputStyle}><option value="">Select to bank</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{renderBankLabel(account)}</option>)}</select></label>
                </>
              ) : (
                <label style={labelStyle}>Bank Account<select value={form.bank_account_id} onChange={(event) => setForm({ ...form, bank_account_id: event.target.value })} style={inputStyle}><option value="">Select bank</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{renderBankLabel(account)}</option>)}</select></label>
              )}
              <label style={labelStyle}>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} style={inputStyle}>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              {form.category === "Other" ? (
                <label style={labelStyle}>Custom Category<input value={form.custom_category} onChange={(event) => setForm({ ...form, custom_category: event.target.value })} style={inputStyle} placeholder="ระบุหมวดรายการเอง" /></label>
              ) : null}
              <label style={labelStyle}>Amount<input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} style={inputStyle} placeholder="0.00" /></label>
              <label style={labelStyle}>Payment Method<input value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Reference No.<input value={form.reference_no} onChange={(event) => setForm({ ...form, reference_no: event.target.value })} style={inputStyle} /></label>
              {form.entry_type === "expense" ? (
                <>
                  <label style={labelStyle}>Claimant User<select value={form.expense_claimant_user_id} onChange={(event) => updateClaimantUser(event.target.value)} style={inputStyle}><option value="">-</option>{claimantUsers.map((user) => <option key={user.id} value={user.id}>{renderUserLabel(user)}</option>)}<option value={otherClaimantValue}>Other</option></select></label>
                  {form.expense_claimant_user_id === otherClaimantValue ? (
                    <label style={labelStyle}>Claimant Name<input value={form.expense_claimant_name} onChange={(event) => setForm({ ...form, expense_claimant_name: event.target.value })} style={inputStyle} placeholder="ระบุชื่อผู้เบิก" /></label>
                  ) : null}
                </>
              ) : null}
              <label style={labelStyle}>Client<select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} style={inputStyle}><option value="">-</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}</select></label>
              <label style={labelStyle}>Case<select value={form.case_id} onChange={(event) => setForm({ ...form, case_id: event.target.value })} style={inputStyle}><option value="">-</option>{cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}</select></label>
              <label style={labelStyle}>Advisory Matter<select value={form.advisory_matter_id} onChange={(event) => setForm({ ...form, advisory_matter_id: event.target.value })} style={inputStyle}><option value="">-</option>{matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}</select></label>
              <label style={labelStyle}>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} style={inputStyle} /></label>
              <label style={wideLabelStyle}>Note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} style={textareaStyle} /></label>
            </div>
            <div style={actionRowStyle}>
              <button type="button" onClick={saveLedger} disabled={saving} style={primaryButtonStyle}>{saving ? "Saving..." : isEditing ? "Update Entry" : "Create Entry"}</button>
              <button type="button" onClick={resetForm} style={secondaryButtonStyle}>Clear</button>
            </div>
          </section>
        ) : null}

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Ledger Entries</h2>
          {loading ? <div style={emptyStyle}>Loading ledger...</div> : null}
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Bank</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Claimant</th>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Matter</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const entryTextStyle = getEntryTextStyle(row.entry_type);
                  const amountTextStyle = { ...entryTextStyle, fontWeight: 800 };
                  return (
                  <tr key={row.id}>
                    <td style={tdStyle}>{formatDate(row.transaction_date)}</td>
                    <td style={{ ...tdStyle, ...entryTextStyle }}>{renderEntryType(row.entry_type)}</td>
                    <td style={{ ...tdStyle, ...entryTextStyle }}>{renderBankName(row.bank_account_id, bankAccounts)}</td>
                    <td style={{ ...tdStyle, ...entryTextStyle }}>{renderCategoryDetail(row)}</td>
                    <td style={{ ...tdStyle, ...amountTextStyle }}>{formatMoney(toAmount(row.amount))}</td>
                    <td style={{ ...tdStyle, ...entryTextStyle }}>{row.expense_claimant_name || "-"}</td>
                    <td style={{ ...tdStyle, ...entryTextStyle }}>{row.reference_no || row.payment_method || "-"}</td>
                    <td style={{ ...tdStyle, ...entryTextStyle }}>{renderRelation(row, clients, cases, matters)}</td>
                    <td style={{ ...tdStyle, ...entryTextStyle }}>{row.status}</td>
                    <td style={tdStyle}>
                      {row.status === "active" && permissions.canEditFinanceModule && row.entry_type !== "transfer_in" && row.entry_type !== "transfer_out" ? (
                        <button type="button" onClick={() => startEdit(row)} style={smallButtonStyle}>Edit</button>
                      ) : null}
                      {row.status === "active" && permissions.canVoidFinanceEntry ? (
                        <button type="button" onClick={() => voidLedger(row)} style={dangerButtonStyle}>Void</button>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={tdStyle}>No ledger entries.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}

type SummaryTone = "default" | "bay" | "kbank" | "ktb" | "totalBank";

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: SummaryTone;
}) {
  const toneStyle = summaryToneStyles[tone] || summaryToneStyles.default;

  return (
    <div style={{ ...summaryCardStyle, ...toneStyle.card }}>
      <div style={{ ...summaryLabelStyle, ...toneStyle.label }}>{label}</div>
      <div style={{ ...summaryValueStyle, ...toneStyle.value }}>{value}</div>
    </div>
  );
}

function FinanceSubNav({ activePage }: { activePage: "ledger" | "claims" | "compensation" }) {
  return (
    <nav style={subNavStyle}>
      <Link
        href="/finance/ledger"
        style={activePage === "ledger" ? subNavActiveLinkStyle : subNavLinkStyle}
      >
        Ledger
      </Link>
      <Link
        href="/finance/expense-claims"
        style={activePage === "claims" ? subNavActiveLinkStyle : subNavLinkStyle}
      >
        Expense Claims
      </Link>
      <Link
        href="/finance/compensation"
        style={activePage === "compensation" ? subNavActiveLinkStyle : subNavLinkStyle}
      >
        Lawyer Compensation
      </Link>
    </nav>
  );
}

function getDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getMonthKey(value: Date) {
  return value.toISOString().slice(0, 7);
}

function parseMoney(value: string) {
  const amount = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function toAmount(value: number | string | null) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function getBankSignedAmount(row: LedgerRow) {
  const amount = toAmount(row.amount);
  if (row.entry_type === "income" || row.entry_type === "transfer_in") return amount;
  if (row.entry_type === "expense" || row.entry_type === "transfer_out") return -amount;
  return 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | null) {
  return value || "-";
}

function renderCaseLabel(item: CaseRow) {
  return [item.file_no, item.title || item.client_name].filter(Boolean).join(" - ") || String(item.id);
}

function renderMatterLabel(item: MatterRow) {
  return [item.matter_no, item.title].filter(Boolean).join(" - ") || item.id;
}

function renderBankLabel(item: BankAccountRow) {
  return [item.short_name, item.bank_name].filter(Boolean).join(" - ") || item.id;
}

function renderBankName(bankAccountId: string | null, bankAccounts: BankAccountRow[]) {
  const account = bankAccounts.find((item) => item.id === bankAccountId);
  return account?.short_name || "-";
}

function isRealUserProfile(user: UserProfileRow) {
  const email = (user.email || "").trim().toLowerCase();
  const fullName = (user.full_name || "").trim().toLowerCase();
  const staffName = (user.staff_name || "").trim().toLowerCase();

  if (email.includes("test") || email.endsWith("@example.com")) return false;
  if (fullName.startsWith("test") || staffName.startsWith("test")) return false;

  return true;
}

function getBankTone(shortName?: string | null): SummaryTone {
  const normalized = (shortName || "").trim().toUpperCase();
  if (normalized === "BAY") return "bay";
  if (normalized === "KBANK") return "kbank";
  if (normalized === "KTB") return "ktb";
  return "default";
}

function renderUserLabel(user: UserProfileRow) {
  return user.staff_name || user.full_name || user.email || user.id;
}

function renderEntryType(value: string) {
  if (value === "income") return "Income";
  if (value === "expense") return "Expense";
  if (value === "transfer_in") return "Transfer In";
  if (value === "transfer_out") return "Transfer Out";
  return value || "-";
}

function getEntryTextStyle(value: string): CSSProperties {
  if (value === "income" || value === "transfer_in") return { color: "#166534" };
  if (value === "expense" || value === "transfer_out") return { color: "#7f1d1d" };
  return {};
}

function normalizeEntryType(value: string): EntryType {
  if (value === "expense") return "expense";
  if (value === "transfer_in" || value === "transfer_out" || value === "transfer") return "transfer";
  return "income";
}

function getCategoryOptions(entryType: EntryType) {
  if (entryType === "income") return incomeCategories;
  if (entryType === "expense") return expenseCategories;
  return transferCategories;
}

function resolveEditCategory(entryType: EntryType, category: string) {
  const options = getCategoryOptions(entryType);

  if (options.includes(category)) {
    return { category, custom_category: "" };
  }

  if (entryType === "transfer") {
    return { category: options[0] || "", custom_category: "" };
  }

  return { category: "Other", custom_category: category };
}

function getCategoryForSave(form: LedgerForm) {
  if (form.category !== "Other") return form.category.trim();
  return form.custom_category.trim();
}

function isClaimantRequired(form: LedgerForm) {
  return (
    form.entry_type === "expense" &&
    claimantRequiredCategories.includes(form.category)
  );
}

function getClaimantName(form: LedgerForm, users: UserProfileRow[]) {
  if (form.expense_claimant_user_id === otherClaimantValue) {
    return form.expense_claimant_name.trim();
  }

  if (form.expense_claimant_user_id) {
    const user = users.find((item) => item.id === form.expense_claimant_user_id);
    return user ? renderUserLabel(user) : form.expense_claimant_name.trim();
  }

  return form.expense_claimant_name.trim();
}

function renderRelation(row: LedgerRow, clients: ClientRow[], cases: CaseRow[], matters: MatterRow[]) {
  const caseItem = cases.find((item) => item.id === row.case_id);
  if (caseItem) return renderCaseLabel(caseItem);
  const matter = matters.find((item) => item.id === row.advisory_matter_id);
  if (matter) return renderMatterLabel(matter);
  const client = clients.find((item) => item.id === row.client_id);
  return client?.name || "-";
}

function renderCategoryDetail(row: LedgerRow) {
  return (
    <div style={detailStackStyle}>
      <div>{row.category || "-"}</div>
      {row.transfer_group_id ? (
        <div style={noteTextStyle}>Transfer group: {row.transfer_group_id}</div>
      ) : null}
      {row.description ? (
        <div style={descriptionTextStyle}>Description: {row.description}</div>
      ) : null}
      {row.note ? <div style={noteTextStyle}>Note: {row.note}</div> : null}
      {row.status === "voided" && row.void_reason ? (
        <div style={voidReasonTextStyle}>Void reason: {row.void_reason}</div>
      ) : null}
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: "100vh", padding: 24, background: "#f7f7f8", color: "#111111", overflowX: "hidden" };
const panelStyle: CSSProperties = { border: "1px solid #dddddd", borderRadius: 8, background: "#ffffff", padding: 16, marginBottom: 16 };
const noAccessStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const errorStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 };
const summaryCardStyle: CSSProperties = { ...panelStyle, marginBottom: 0 };
const summaryLabelStyle: CSSProperties = { color: "#666666", fontSize: 12, fontWeight: 700 };
const summaryValueStyle: CSSProperties = { color: "#111111", fontSize: 24, fontWeight: 900, marginTop: 6 };
const summaryToneStyles: Record<
  SummaryTone,
  { card: CSSProperties; label: CSSProperties; value: CSSProperties }
> = {
  default: { card: {}, label: {}, value: {} },
  bay: {
    card: { background: "#FFF7E6", borderColor: "#F6C76A" },
    label: { color: "#7A4B00" },
    value: { color: "#7A4B00" },
  },
  kbank: {
    card: { background: "#EAF7EE", borderColor: "#8BD29A" },
    label: { color: "#14532D" },
    value: { color: "#14532D" },
  },
  ktb: {
    card: { background: "#EAF3FF", borderColor: "#93C5FD" },
    label: { color: "#0F3A6B" },
    value: { color: "#0F3A6B" },
  },
  totalBank: {
    card: { background: "#0F2743", borderColor: "#C5A46D" },
    label: { color: "#E9DDBF" },
    value: { color: "#FFFFFF" },
  },
};
const subNavStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 };
const subNavLinkStyle: CSSProperties = { padding: "9px 12px", border: "1px solid #cccccc", borderRadius: 6, color: "#111111", textDecoration: "none", fontWeight: 800, background: "#ffffff" };
const subNavActiveLinkStyle: CSSProperties = { ...subNavLinkStyle, background: "#111111", color: "#ffffff", borderColor: "#111111" };
const filterGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", columnGap: 16, rowGap: 14, alignItems: "start" };
const labelStyle: CSSProperties = { display: "grid", gap: 7, fontSize: 13, fontWeight: 700, minWidth: 0 };
const wideLabelStyle: CSSProperties = { ...labelStyle, gridColumn: "1 / -1" };
const inputStyle: CSSProperties = { width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cccccc", borderRadius: 6, fontSize: 14, minWidth: 0 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 70 };
const sectionTitleStyle: CSSProperties = { margin: "0 0 12px", fontSize: 18, fontWeight: 900 };
const actionRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const primaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #111111", borderRadius: 6, background: "#111111", color: "#ffffff", cursor: "pointer", fontWeight: 800 };
const secondaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #cccccc", borderRadius: 6, background: "#ffffff", cursor: "pointer", fontWeight: 800 };
const tableWrapStyle: CSSProperties = { overflowX: "auto", maxWidth: "100%" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #dddddd", textAlign: "left", fontSize: 12 };
const tdStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #eeeeee", fontSize: 13, verticalAlign: "top" };
const detailStackStyle: CSSProperties = { display: "grid", gap: 4 };
const descriptionTextStyle: CSSProperties = { color: "#4b5563", fontSize: 12, lineHeight: 1.35 };
const noteTextStyle: CSSProperties = { color: "#6b7280", fontSize: 12, lineHeight: 1.35 };
const voidReasonTextStyle: CSSProperties = { color: "#991b1b", fontSize: 12, lineHeight: 1.35, fontWeight: 700 };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 9px", marginRight: 6 };
const dangerButtonStyle: CSSProperties = { padding: "6px 9px", border: "1px solid #a40000", borderRadius: 6, background: "#fff5f5", color: "#a40000", cursor: "pointer", fontWeight: 800 };
const emptyStyle: CSSProperties = { padding: 12, border: "1px dashed #cccccc", borderRadius: 6, color: "#666666" };
