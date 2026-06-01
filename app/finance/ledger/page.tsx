"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
  entry_type: "income" | "expense" | string;
  category: string | null;
  amount: number | string | null;
  client_id: string | null;
  case_id: number | null;
  advisory_matter_id: string | null;
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

type LedgerForm = {
  id: string;
  transaction_date: string;
  entry_type: "income" | "expense";
  category: string;
  amount: string;
  client_id: string;
  case_id: string;
  advisory_matter_id: string;
  payment_method: string;
  reference_no: string;
  description: string;
  note: string;
};

const emptyForm: LedgerForm = {
  id: "",
  transaction_date: getDateKey(new Date()),
  entry_type: "income",
  category: "",
  amount: "",
  client_id: "",
  case_id: "",
  advisory_matter_id: "",
  payment_method: "",
  reference_no: "",
  description: "",
  note: "",
};

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

      const [ledgerRes, clientsRes, casesRes, mattersRes] = await Promise.all([
        supabase
          .from("finance_company_ledger")
          .select("*")
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("clients").select("id, name").order("name", { ascending: true }),
        supabase.from("cases").select("id, file_no, title, client_name").order("id", { ascending: false }),
        supabase.from("advisory_matters").select("id, matter_no, title").order("created_at", { ascending: false }),
      ]);

      if (ledgerRes.error) {
        setErrorText(ledgerRes.error.message);
        return;
      }

      setRows((ledgerRes.data || []) as LedgerRow[]);
      setClients((clientsRes.data || []) as ClientRow[]);
      setCases((casesRes.data || []) as CaseRow[]);
      setMatters((mattersRes.data || []) as MatterRow[]);
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
    };
  }, [filteredRows]);

  const resetForm = () => {
    setForm({ ...emptyForm, transaction_date: getDateKey(new Date()) });
    setIsEditing(false);
  };

  const startEdit = (row: LedgerRow) => {
    if (row.status !== "active") return;
    setForm({
      id: row.id,
      transaction_date: row.transaction_date || getDateKey(new Date()),
      entry_type: row.entry_type === "expense" ? "expense" : "income",
      category: row.category || "",
      amount: String(row.amount || ""),
      client_id: row.client_id || "",
      case_id: row.case_id ? String(row.case_id) : "",
      advisory_matter_id: row.advisory_matter_id || "",
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
    if (!form.category.trim()) return alert("Category is required");
    if (!amount || amount <= 0) return alert("Amount must be greater than zero");

    const payload = {
      transaction_date: form.transaction_date,
      entry_type: form.entry_type,
      category: form.category.trim(),
      amount,
      client_id: form.client_id || null,
      case_id: form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.advisory_matter_id || null,
      payment_method: form.payment_method.trim() || null,
      reference_no: form.reference_no.trim() || null,
      description: form.description.trim() || null,
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
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

        {errorText ? <div style={errorStyle}>{errorText}</div> : null}

        <section style={summaryGridStyle}>
          <SummaryCard label="Total Income" value={formatMoney(summary.income)} />
          <SummaryCard label="Total Expense" value={formatMoney(summary.expense)} />
          <SummaryCard label="Net Balance" value={formatMoney(summary.net)} />
          <SummaryCard label="Active Entries" value={String(summary.activeCount)} />
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
              <label style={labelStyle}>Type<select value={form.entry_type} onChange={(event) => setForm({ ...form, entry_type: event.target.value as "income" | "expense" })} style={inputStyle}><option value="income">Income</option><option value="expense">Expense</option></select></label>
              <label style={labelStyle}>Category<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Amount<input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} style={inputStyle} placeholder="0.00" /></label>
              <label style={labelStyle}>Payment Method<input value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Reference No.<input value={form.reference_no} onChange={(event) => setForm({ ...form, reference_no: event.target.value })} style={inputStyle} /></label>
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
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Matter</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{formatDate(row.transaction_date)}</td>
                    <td style={tdStyle}>{row.entry_type}</td>
                    <td style={tdStyle}>{row.category || "-"}</td>
                    <td style={tdStyle}>{formatMoney(toAmount(row.amount))}</td>
                    <td style={tdStyle}>{row.reference_no || row.payment_method || "-"}</td>
                    <td style={tdStyle}>{renderRelation(row, clients, cases, matters)}</td>
                    <td style={tdStyle}>{row.status}</td>
                    <td style={tdStyle}>
                      {row.status === "active" && permissions.canEditFinanceModule ? (
                        <button type="button" onClick={() => startEdit(row)} style={smallButtonStyle}>Edit</button>
                      ) : null}
                      {row.status === "active" && permissions.canVoidFinanceEntry ? (
                        <button type="button" onClick={() => voidLedger(row)} style={dangerButtonStyle}>Void</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={tdStyle}>No ledger entries.</td>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
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

function renderRelation(row: LedgerRow, clients: ClientRow[], cases: CaseRow[], matters: MatterRow[]) {
  const caseItem = cases.find((item) => item.id === row.case_id);
  if (caseItem) return renderCaseLabel(caseItem);
  const matter = matters.find((item) => item.id === row.advisory_matter_id);
  if (matter) return renderMatterLabel(matter);
  const client = clients.find((item) => item.id === row.client_id);
  return client?.name || "-";
}

const pageStyle: CSSProperties = { minHeight: "100vh", padding: 24, background: "#f7f7f8", color: "#111111" };
const panelStyle: CSSProperties = { border: "1px solid #dddddd", borderRadius: 8, background: "#ffffff", padding: 16, marginBottom: 16 };
const noAccessStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const errorStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 };
const summaryCardStyle: CSSProperties = { ...panelStyle, marginBottom: 0 };
const summaryLabelStyle: CSSProperties = { color: "#666666", fontSize: 12, fontWeight: 700 };
const summaryValueStyle: CSSProperties = { color: "#111111", fontSize: 24, fontWeight: 900, marginTop: 6 };
const filterGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 700 };
const wideLabelStyle: CSSProperties = { ...labelStyle, gridColumn: "1 / -1" };
const inputStyle: CSSProperties = { padding: 10, border: "1px solid #cccccc", borderRadius: 6, fontSize: 14 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 70 };
const sectionTitleStyle: CSSProperties = { margin: "0 0 12px", fontSize: 18, fontWeight: 900 };
const actionRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const primaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #111111", borderRadius: 6, background: "#111111", color: "#ffffff", cursor: "pointer", fontWeight: 800 };
const secondaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #cccccc", borderRadius: 6, background: "#ffffff", cursor: "pointer", fontWeight: 800 };
const tableWrapStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #dddddd", textAlign: "left", fontSize: 12 };
const tdStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #eeeeee", fontSize: 13, verticalAlign: "top" };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 9px", marginRight: 6 };
const dangerButtonStyle: CSSProperties = { padding: "6px 9px", border: "1px solid #a40000", borderRadius: 6, background: "#fff5f5", color: "#a40000", cursor: "pointer", fontWeight: 800 };
const emptyStyle: CSSProperties = { padding: 12, border: "1px dashed #cccccc", borderRadius: 6, color: "#666666" };
