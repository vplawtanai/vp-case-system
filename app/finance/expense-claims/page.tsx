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
  can_submit_expense_claim?: boolean | null;
  can_view_own_expense_claims?: boolean | null;
  can_view_all_expense_claims?: boolean | null;
  can_approve_expense_claims?: boolean | null;
  can_pay_expense_claims?: boolean | null;
  can_view_company_ledger?: boolean | null;
  can_edit_company_ledger?: boolean | null;
  can_void_company_ledger?: boolean | null;
  can_view_lawyer_compensation?: boolean | null;
  can_edit_lawyer_compensation?: boolean | null;
  can_void_lawyer_compensation?: boolean | null;
};

type ClaimRow = {
  id: string;
  claim_date: string;
  claimant_user_id: string | null;
  claimant_name: string | null;
  category: string | null;
  amount: number | string | null;
  client_id: string | null;
  case_id: number | null;
  advisory_matter_id: string | null;
  description: string | null;
  note: string | null;
  status: string;
  reject_reason: string | null;
  void_reason: string | null;
  ledger_entry_id: string | null;
  created_by_user_id?: string | null;
};

type ClientRow = { id: string; name: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };
type BankAccountRow = { id: string; short_name: string | null; bank_name: string | null; is_active?: boolean | null };
type BankAccountAccessRow = { bank_account_id: string | null; can_view?: boolean | null };
type UserProfileRow = { id: string; full_name: string | null; staff_name: string | null; email: string | null };

type ClaimForm = {
  claim_date: string;
  claimant_user_id: string;
  claimant_name: string;
  category: string;
  custom_category: string;
  amount: string;
  client_id: string;
  case_id: string;
  advisory_matter_id: string;
  description: string;
  note: string;
};

type PaidForm = {
  paid_date: string;
  bank_account_id: string;
  payment_reference_no: string;
  payment_note: string;
};

const otherValue = "__other__";

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

const emptyClaimForm: ClaimForm = {
  claim_date: getDateKey(new Date()),
  claimant_user_id: "",
  claimant_name: "",
  category: expenseCategories[0],
  custom_category: "",
  amount: "",
  client_id: "",
  case_id: "",
  advisory_matter_id: "",
  description: "",
  note: "",
};

export default function ExpenseClaimsPage() {
  const [profile, setProfile] = useState<Profile>({ role: "", financial_access: false });
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [matters, setMatters] = useState<MatterRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([]);
  const [claimantUsers, setClaimantUsers] = useState<UserProfileRow[]>([]);
  const [form, setForm] = useState<ClaimForm>(emptyClaimForm);
  const [paidForms, setPaidForms] = useState<Record<string, PaidForm>>({});
  const [payingClaimId, setPayingClaimId] = useState("");
  const [errorText, setErrorText] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState("");

  const permissions: UserPermissions = useMemo(() => buildPermissions(profile), [profile]);
  const actorName = profile.full_name || profile.staff_name || userEmail;

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
          .select("role, financial_access, full_name, staff_name, can_submit_expense_claim, can_view_own_expense_claims, can_view_all_expense_claims, can_approve_expense_claims, can_pay_expense_claims, can_view_company_ledger, can_edit_company_ledger, can_void_company_ledger, can_view_lawyer_compensation, can_edit_lawyer_compensation, can_void_lawyer_compensation")
          .eq("id", userData.user.id)
          .single();

        setProfile({
          role: data?.role || "",
          financial_access: data?.financial_access === true,
          full_name: data?.full_name || "",
          staff_name: data?.staff_name || "",
          can_submit_expense_claim: data?.can_submit_expense_claim === true,
          can_view_own_expense_claims: data?.can_view_own_expense_claims === true,
          can_view_all_expense_claims: data?.can_view_all_expense_claims === true,
          can_approve_expense_claims: data?.can_approve_expense_claims === true,
          can_pay_expense_claims: data?.can_pay_expense_claims === true,
          can_view_company_ledger: data?.can_view_company_ledger === true,
          can_edit_company_ledger: data?.can_edit_company_ledger === true,
          can_void_company_ledger: data?.can_void_company_ledger === true,
          can_view_lawyer_compensation: data?.can_view_lawyer_compensation === true,
          can_edit_lawyer_compensation: data?.can_edit_lawyer_compensation === true,
          can_void_lawyer_compensation: data?.can_void_lawyer_compensation === true,
        });
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

  const loadClaims = useCallback(async () => {
    if (!permissions.canSubmitExpenseClaim && !permissions.canViewOwnExpenseClaims && !permissions.canViewAllExpenseClaims) return;
    if (!userId) return;

    try {
      setLoading(true);
      setErrorText("");

      const [claimsRes, clientsRes, casesRes, mattersRes, bankRes, bankAccessRes, usersRes] = await Promise.all([
        supabase
          .from("finance_expense_claims")
          .select("*")
          .order("claim_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("clients").select("id, name").order("name", { ascending: true }),
        supabase.from("cases").select("id, file_no, title, client_name").order("id", { ascending: false }),
        supabase.from("advisory_matters").select("id, matter_no, title").order("created_at", { ascending: false }),
        supabase.from("finance_bank_accounts").select("id, short_name, bank_name, is_active").eq("is_active", true).order("short_name", { ascending: true }),
        supabase
          .from("finance_bank_account_access")
          .select("bank_account_id, can_view")
          .eq("user_profile_id", userId)
          .eq("can_view", true),
        supabase.from("user_profiles").select("id, full_name, staff_name, email").eq("active", true).order("full_name", { ascending: true }),
      ]);

      if (claimsRes.error) {
        setErrorText(claimsRes.error.message);
        return;
      }
      if (bankRes.error) {
        setErrorText(bankRes.error.message);
        return;
      }
      if (bankAccessRes.error) {
        setErrorText(bankAccessRes.error.message);
        return;
      }

      const loadedClaims = (claimsRes.data || []) as ClaimRow[];
      setClaims(permissions.canViewAllExpenseClaims ? loadedClaims : loadedClaims.filter((claim) => claim.created_by_user_id === userId || claim.claimant_user_id === userId));
      setClients((clientsRes.data || []) as ClientRow[]);
      setCases((casesRes.data || []) as CaseRow[]);
      setMatters((mattersRes.data || []) as MatterRow[]);
      const activeBankAccounts = (bankRes.data || []) as BankAccountRow[];
      const accessRows = (bankAccessRes.data || []) as BankAccountAccessRow[];
      const allowedBankIds = new Set(accessRows.map((item) => item.bank_account_id).filter(Boolean));
      const visibleBankAccounts =
        accessRows.length > 0
          ? activeBankAccounts.filter((account) => allowedBankIds.has(account.id))
          : permissions.role === "admin"
            ? activeBankAccounts
            : [];
      setBankAccounts(visibleBankAccounts);
      setClaimantUsers(((usersRes.data || []) as UserProfileRow[]).filter(isRealUserProfile));
    } finally {
      setLoading(false);
    }
  }, [permissions.canSubmitExpenseClaim, permissions.canViewAllExpenseClaims, permissions.canViewOwnExpenseClaims, permissions.role, userId]);

  useEffect(() => {
    if (loadingProfile) return;
    loadClaims();
  }, [loadingProfile, loadClaims]);

  const summary = useMemo(() => {
    return {
      submitted: claims.filter((claim) => claim.status === "submitted").length,
      approved: claims.filter((claim) => claim.status === "approved").length,
      paid: claims.filter((claim) => claim.status === "paid").length,
      rejected: claims.filter((claim) => claim.status === "rejected").length,
    };
  }, [claims]);

  const updateClaimant = (value: string) => {
    if (!value) {
      setForm({ ...form, claimant_user_id: "", claimant_name: "" });
      return;
    }

    if (value === otherValue) {
      setForm({ ...form, claimant_user_id: otherValue, claimant_name: "" });
      return;
    }

    const user = claimantUsers.find((item) => item.id === value);
    setForm({ ...form, claimant_user_id: value, claimant_name: user ? renderUserLabel(user) : "" });
  };

  const createClaim = async () => {
    if (!permissions.canSubmitExpenseClaim) return;

    const amount = parseMoney(form.amount);
    const category = form.category === "Other" ? form.custom_category.trim() : form.category;
    const claimantName = getClaimantName(form, claimantUsers);

    if (!form.claim_date) return alert("Claim date is required");
    if (!claimantName) return alert("Claimant is required");
    if (!category) return alert("Category is required");
    if (!amount || amount <= 0) return alert("Amount must be greater than zero");

    const payload = {
      claim_date: form.claim_date,
      claimant_user_id:
        form.claimant_user_id && form.claimant_user_id !== otherValue
          ? form.claimant_user_id
          : null,
      claimant_name: claimantName,
      category,
      amount,
      client_id: form.client_id || null,
      case_id: form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.advisory_matter_id || null,
      description: form.description.trim() || null,
      note: form.note.trim() || null,
      status: "submitted",
      created_by_user_id: userId || null,
      created_by_email: userEmail || null,
      created_by_name: actorName || null,
      updated_at: new Date().toISOString(),
    };

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("finance_expense_claims")
        .insert([payload])
        .select("*")
        .single();

      if (error || !data) return alert(error?.message || "Create claim failed");

      await auditFinance("create", "finance_expense_claims", data.id, null, data, "Create expense claim");
      setForm({ ...emptyClaimForm, claim_date: getDateKey(new Date()) });
      await loadClaims();
    } finally {
      setSaving(false);
    }
  };

  const updateClaimStatus = async (
    claim: ClaimRow,
    payload: Record<string, unknown>,
    note: string
  ) => {
    const { data, error } = await supabase
      .from("finance_expense_claims")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", claim.id)
      .select("*")
      .single();

    if (error || !data) return alert(error?.message || "Update claim failed");

    await auditFinance("update", "finance_expense_claims", claim.id, claim, data, note);
    await loadClaims();
  };

  const approveClaim = async (claim: ClaimRow) => {
    if (!permissions.canApproveExpenseClaims || claim.status !== "submitted") return;
    await updateClaimStatus(
      claim,
      {
        status: "approved",
        approved_by_user_id: userId || null,
        approved_by_name: actorName || null,
        approved_at: new Date().toISOString(),
      },
      "Approve expense claim"
    );
  };

  const rejectClaim = async (claim: ClaimRow) => {
    if (!permissions.canApproveExpenseClaims || !["submitted", "approved"].includes(claim.status)) return;
    const reason = window.prompt("Reject reason");
    if (!reason?.trim()) return;

    await updateClaimStatus(
      claim,
      {
        status: "rejected",
        rejected_by_user_id: userId || null,
        rejected_by_name: actorName || null,
        rejected_at: new Date().toISOString(),
        reject_reason: reason.trim(),
      },
      "Reject expense claim"
    );
  };

  const voidClaim = async (claim: ClaimRow) => {
    if (!permissions.canApproveExpenseClaims || claim.status === "paid" || claim.ledger_entry_id) {
      alert("Paid claims cannot be voided in this phase.");
      return;
    }

    if (!["submitted", "approved", "rejected"].includes(claim.status)) return;
    const reason = window.prompt("Void reason");
    if (!reason?.trim()) return;

    await updateClaimStatus(
      claim,
      {
        status: "voided",
        voided_at: new Date().toISOString(),
        voided_by: actorName || userEmail || null,
        void_reason: reason.trim(),
      },
      "Void expense claim"
    );
  };

  const markPaid = async (claim: ClaimRow) => {
    if (!permissions.canPayExpenseClaims || claim.status !== "approved") return;
    if (claim.ledger_entry_id) return alert("This claim is already posted to ledger.");
    if (payingClaimId === claim.id) return;

    const paidForm = getPaidForm(claim.id);
    if (!paidForm.bank_account_id) return alert("Please select bank account.");
    if (!bankAccounts.some((account) => account.id === paidForm.bank_account_id)) {
      return alert("You do not have access to this bank account.");
    }

    try {
      setPayingClaimId(claim.id);

      const { data: latestClaim, error: latestClaimError } = await supabase
        .from("finance_expense_claims")
        .select("*")
        .eq("id", claim.id)
        .single();

      if (latestClaimError || !latestClaim) {
        alert(latestClaimError?.message || "Claim not found");
        return;
      }

      const currentClaim = latestClaim as ClaimRow;
      if (currentClaim.status !== "approved") {
        alert("This claim is no longer approved.");
        await loadClaims();
        return;
      }

      if (currentClaim.ledger_entry_id) {
        alert("This claim is already posted to Ledger.");
        await loadClaims();
        return;
      }

      const now = new Date().toISOString();
      const ledgerPayload = {
        source_expense_claim_id: currentClaim.id,
        transaction_date: paidForm.paid_date || getDateKey(new Date()),
        entry_type: "expense",
        category: currentClaim.category,
        amount: toAmount(currentClaim.amount),
        bank_account_id: paidForm.bank_account_id,
        client_id: currentClaim.client_id || null,
        case_id: currentClaim.case_id || null,
        advisory_matter_id: currentClaim.advisory_matter_id || null,
        expense_claimant_user_id: currentClaim.claimant_user_id || null,
        expense_claimant_name: currentClaim.claimant_name || null,
        reference_no: paidForm.payment_reference_no.trim() || null,
        description: currentClaim.description || null,
        note: [currentClaim.note, paidForm.payment_note.trim()].filter(Boolean).join("\n") || null,
        status: "active",
        created_by_user_id: userId || null,
        created_by_email: userEmail || null,
        created_by_name: actorName || null,
        updated_at: now,
      };

      const { data: ledgerData, error: ledgerError } = await supabase
        .from("finance_company_ledger")
        .insert([ledgerPayload])
        .select("*")
        .single();

      if (ledgerError || !ledgerData) {
        if (isDuplicateLedgerError(ledgerError)) {
          alert("This claim has already been posted to Ledger.");
          await loadClaims();
          return;
        }

        alert(ledgerError?.message || "Create ledger entry failed");
        return;
      }

      const { data: claimData, error: claimError } = await supabase
        .from("finance_expense_claims")
        .update({
          status: "paid",
          paid_by_user_id: userId || null,
          paid_by_name: actorName || null,
          paid_at: now,
          paid_bank_account_id: paidForm.bank_account_id,
          payment_reference_no: paidForm.payment_reference_no.trim() || null,
          payment_note: paidForm.payment_note.trim() || null,
          ledger_entry_id: ledgerData.id,
          updated_at: now,
        })
        .eq("id", currentClaim.id)
        .is("ledger_entry_id", null)
        .eq("status", "approved")
        .select("*")
        .single();

      if (claimError || !claimData) {
        alert(
          claimError?.message ||
            "Claim paid update failed. Ledger entry was created; please review manually."
        );
        await loadClaims();
        return;
      }

      await auditFinance("create", "finance_company_ledger", ledgerData.id, null, ledgerData, "Post paid expense claim to ledger");
      await auditFinance("update", "finance_expense_claims", currentClaim.id, currentClaim, claimData, "Mark expense claim as paid");
      await loadClaims();
    } finally {
      setPayingClaimId("");
    }
  };

  const auditFinance = async (
    action: "create" | "update",
    tableName: string,
    recordId: string,
    oldData: unknown,
    newData: unknown,
    note: string
  ) => {
    try {
      await createAuditLog({ caseId: null, tableName, recordId, action, oldData, newData, note });
    } catch (error) {
      console.error("CREATE FINANCE AUDIT LOG FAILED:", error);
    }
  };

  const getPaidForm = (claimId: string) => {
    return (
      paidForms[claimId] || {
        paid_date: getDateKey(new Date()),
        bank_account_id: "",
        payment_reference_no: "",
        payment_note: "",
      }
    );
  };

  const updatePaidForm = (claimId: string, nextForm: Partial<PaidForm>) => {
    setPaidForms({ ...paidForms, [claimId]: { ...getPaidForm(claimId), ...nextForm } });
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

  if (!permissions.canSubmitExpenseClaim && !permissions.canViewOwnExpenseClaims && !permissions.canViewAllExpenseClaims) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav title="Expense Claims" subtitle="Internal reimbursement requests" activePage="finance" />
          <div style={noAccessStyle}>No access</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav title="Expense Claims" subtitle="Internal reimbursement requests before posting to ledger." activePage="finance" />
        <FinanceSubNav activePage="claims" permissions={permissions} />
        {errorText ? <div style={errorStyle}>{errorText}</div> : null}

        <section style={summaryGridStyle}>
          <SummaryCard label="Submitted" value={String(summary.submitted)} />
          <SummaryCard label="Approved" value={String(summary.approved)} />
          <SummaryCard label="Paid" value={String(summary.paid)} />
          <SummaryCard label="Rejected" value={String(summary.rejected)} />
        </section>

        {permissions.canSubmitExpenseClaim ? (
        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Create Claim</h2>
          <div style={formGridStyle}>
            <label style={labelStyle}>Claim Date<input type="date" value={form.claim_date} onChange={(event) => setForm({ ...form, claim_date: event.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Claimant<select value={form.claimant_user_id} onChange={(event) => updateClaimant(event.target.value)} style={inputStyle}><option value="">-</option>{claimantUsers.map((user) => <option key={user.id} value={user.id}>{renderUserLabel(user)}</option>)}<option value={otherValue}>Other</option></select></label>
            {form.claimant_user_id === otherValue ? (
              <label style={labelStyle}>Claimant Name<input value={form.claimant_name} onChange={(event) => setForm({ ...form, claimant_name: event.target.value })} style={inputStyle} placeholder="ระบุชื่อผู้เบิก" /></label>
            ) : null}
            <label style={labelStyle}>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} style={inputStyle}>{expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            {form.category === "Other" ? (
              <label style={labelStyle}>Custom Category<input value={form.custom_category} onChange={(event) => setForm({ ...form, custom_category: event.target.value })} style={inputStyle} placeholder="ระบุหมวดรายการเอง" /></label>
            ) : null}
            <label style={labelStyle}>Amount<input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} style={inputStyle} placeholder="0.00" /></label>
            <label style={labelStyle}>Client<select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} style={inputStyle}><option value="">-</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}</select></label>
            <label style={labelStyle}>Case<select value={form.case_id} onChange={(event) => setForm({ ...form, case_id: event.target.value })} style={inputStyle}><option value="">-</option>{cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}</select></label>
            <label style={labelStyle}>Advisory Matter<select value={form.advisory_matter_id} onChange={(event) => setForm({ ...form, advisory_matter_id: event.target.value })} style={inputStyle}><option value="">-</option>{matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}</select></label>
            <label style={descriptionLabelStyle}>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} style={inputStyle} /></label>
            <label style={wideLabelStyle}>Note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} style={textareaStyle} /></label>
          </div>
          <div style={actionRowStyle}>
            <button type="button" onClick={createClaim} disabled={saving} style={primaryButtonStyle}>{saving ? "Saving..." : "Create Claim"}</button>
          </div>
        </section>
        ) : null}

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Claims</h2>
          {loading ? <div style={emptyStyle}>Loading claims...</div> : null}
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Claimant</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Matter</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Ledger</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id}>
                    <td style={tdStyle}>{claim.claim_date || "-"}</td>
                    <td style={tdStyle}>{claim.claimant_name || "-"}</td>
                    <td style={tdStyle}>{renderClaimDetail(claim)}</td>
                    <td style={tdStyle}>{formatMoney(toAmount(claim.amount))}</td>
                    <td style={tdStyle}>{renderRelation(claim, clients, cases, matters)}</td>
                    <td style={tdStyle}>{claim.status}</td>
                    <td style={tdStyle}>{claim.ledger_entry_id ? `Posted: ${claim.ledger_entry_id}` : "-"}</td>
                    <td style={tdStyle}>{renderActions(claim)}</td>
                  </tr>
                ))}
                {claims.length === 0 ? (
                  <tr><td colSpan={8} style={tdStyle}>No expense claims.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AuthGuard>
  );

  function renderActions(claim: ClaimRow) {
    const paidForm = getPaidForm(claim.id);
    const isPaying = payingClaimId === claim.id;

    if (claim.status === "paid") return <div style={postedStyle}>Posted to Ledger</div>;
    if (claim.status === "rejected" || claim.status === "voided") return null;

    return (
      <div style={actionStackStyle}>
        {claim.status === "submitted" && permissions.canApproveExpenseClaims ? (
          <button type="button" onClick={() => approveClaim(claim)} style={smallButtonStyle}>Approve</button>
        ) : null}
        {claim.status === "approved" && !claim.ledger_entry_id && permissions.canPayExpenseClaims ? (
          <div style={paidFormStyle}>
            <input type="date" value={paidForm.paid_date} onChange={(event) => updatePaidForm(claim.id, { paid_date: event.target.value })} style={inputStyle} />
            <select value={paidForm.bank_account_id} onChange={(event) => updatePaidForm(claim.id, { bank_account_id: event.target.value })} style={inputStyle}><option value="">Bank</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{renderBankLabel(account)}</option>)}</select>
            {bankAccounts.length === 0 ? <div style={bankAccessHintStyle}>No bank accounts available for your permission.</div> : null}
            <input value={paidForm.payment_reference_no} onChange={(event) => updatePaidForm(claim.id, { payment_reference_no: event.target.value })} style={inputStyle} placeholder="Reference" />
            <input value={paidForm.payment_note} onChange={(event) => updatePaidForm(claim.id, { payment_note: event.target.value })} style={inputStyle} placeholder="Payment note" />
            <button type="button" onClick={() => markPaid(claim)} disabled={isPaying || bankAccounts.length === 0} style={primarySmallButtonStyle}>{isPaying ? "Processing..." : "Mark as Paid"}</button>
          </div>
        ) : null}
        {["submitted", "approved", "rejected"].includes(claim.status) && permissions.canApproveExpenseClaims ? (
          <details data-action-menu-root="true" open={openActionMenuId === claim.id} style={moreMenuStyle}>
            <summary
              aria-label="More actions"
              title="More actions"
              onClick={(event) => {
                event.preventDefault();
                setOpenActionMenuId((current) => current === claim.id ? "" : claim.id);
              }}
              style={moreButtonStyle}
            >
              ...
            </summary>
            <div style={moreMenuContentStyle}>
              {["submitted", "approved"].includes(claim.status) ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionMenuId("");
                    rejectClaim(claim);
                  }}
                  style={menuButtonStyle}
                >
                  Reject
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setOpenActionMenuId("");
                  voidClaim(claim);
                }}
                style={dangerMenuButtonStyle}
              >
                Void
              </button>
            </div>
          </details>
        ) : null}
      </div>
    );
  }
}

function FinanceSubNav({ activePage, permissions }: { activePage: "ledger" | "claims" | "compensation" | "quotations"; permissions: UserPermissions }) {
  return (
    <nav style={subNavStyle}>
      {permissions.canViewFinanceQuotations ? <Link href="/finance/quotations" style={activePage === "quotations" ? subNavActiveLinkStyle : subNavLinkStyle}>Quotations</Link> : null}
      {permissions.canViewCompanyLedger ? <Link href="/finance/ledger" style={activePage === "ledger" ? subNavActiveLinkStyle : subNavLinkStyle}>Ledger</Link> : null}
      {permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims ? <Link href="/finance/expense-claims" style={activePage === "claims" ? subNavActiveLinkStyle : subNavLinkStyle}>Expense Claims</Link> : null}
      {permissions.canViewLawyerCompensation ? <Link href="/finance/compensation" style={activePage === "compensation" ? subNavActiveLinkStyle : subNavLinkStyle}>Lawyer Compensation</Link> : null}
    </nav>
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

function renderUserLabel(user: UserProfileRow) {
  return user.staff_name || user.full_name || user.email || user.id;
}

function getClaimantName(form: ClaimForm, users: UserProfileRow[]) {
  if (form.claimant_user_id === otherValue) return form.claimant_name.trim();
  if (!form.claimant_user_id) return "";
  const user = users.find((item) => item.id === form.claimant_user_id);
  return user ? renderUserLabel(user) : "";
}

function isRealUserProfile(user: UserProfileRow) {
  const email = (user.email || "").trim().toLowerCase();
  const fullName = (user.full_name || "").trim().toLowerCase();
  const staffName = (user.staff_name || "").trim().toLowerCase();
  if (email.includes("test") || email.endsWith("@example.com")) return false;
  if (fullName.startsWith("test") || staffName.startsWith("test")) return false;
  return true;
}

function isDuplicateLedgerError(error: { code?: string; message?: string } | null) {
  const message = (error?.message || "").toLowerCase();
  return (
    error?.code === "23505" ||
    message.includes("duplicate") ||
    message.includes("source_expense_claim_id") ||
    message.includes("uq_finance_ledger_source_expense_claim")
  );
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

function renderRelation(row: ClaimRow, clients: ClientRow[], cases: CaseRow[], matters: MatterRow[]) {
  const caseItem = cases.find((item) => item.id === row.case_id);
  if (caseItem) return renderCaseLabel(caseItem);
  const matter = matters.find((item) => item.id === row.advisory_matter_id);
  if (matter) return renderMatterLabel(matter);
  const client = clients.find((item) => item.id === row.client_id);
  return client?.name || "-";
}

function renderClaimDetail(claim: ClaimRow) {
  return (
    <div style={detailStackStyle}>
      <div>{claim.category || "-"}</div>
      {claim.description ? <div style={descriptionTextStyle}>Description: {claim.description}</div> : null}
      {claim.note ? <div style={noteTextStyle}>Note: {claim.note}</div> : null}
      {claim.reject_reason ? <div style={dangerTextStyle}>Reject reason: {claim.reject_reason}</div> : null}
      {claim.void_reason ? <div style={dangerTextStyle}>Void reason: {claim.void_reason}</div> : null}
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: "100vh", padding: 24, background: "#f7f7f8", color: "#111111", overflowX: "hidden" };
const panelStyle: CSSProperties = { border: "1px solid #dddddd", borderRadius: 8, background: "#ffffff", padding: 18, marginBottom: 16 };
const noAccessStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const errorStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 };
const summaryCardStyle: CSSProperties = { ...panelStyle, marginBottom: 0 };
const summaryLabelStyle: CSSProperties = { color: "#666666", fontSize: 12, fontWeight: 700 };
const summaryValueStyle: CSSProperties = { color: "#111111", fontSize: 24, fontWeight: 900, marginTop: 6 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", columnGap: 16, rowGap: 14, alignItems: "start" };
const labelStyle: CSSProperties = { display: "grid", gap: 7, fontSize: 13, fontWeight: 700, minWidth: 0 };
const descriptionLabelStyle: CSSProperties = { ...labelStyle, gridColumn: "1 / -1" };
const wideLabelStyle: CSSProperties = { ...labelStyle, gridColumn: "1 / -1" };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cccccc", borderRadius: 6, fontSize: 14 };
const bankAccessHintStyle: CSSProperties = { color: "#991b1b", fontSize: 12, fontWeight: 700 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 70 };
const sectionTitleStyle: CSSProperties = { margin: "0 0 12px", fontSize: 18, fontWeight: 900 };
const actionRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const actionStackStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center", minWidth: 220 };
const paidFormStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 220, flex: "1 1 220px" };
const primaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #111111", borderRadius: 6, background: "#111111", color: "#ffffff", cursor: "pointer", fontWeight: 800 };
const primarySmallButtonStyle: CSSProperties = { ...primaryButtonStyle, padding: "6px 9px" };
const secondaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #cccccc", borderRadius: 6, background: "#ffffff", cursor: "pointer", fontWeight: 800 };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 9px" };
const dangerButtonStyle: CSSProperties = { padding: "6px 9px", border: "1px solid #a40000", borderRadius: 6, background: "#fff5f5", color: "#a40000", cursor: "pointer", fontWeight: 800 };
const moreMenuStyle: CSSProperties = { position: "relative" };
const moreButtonStyle: CSSProperties = { ...smallButtonStyle, listStyle: "none", padding: "6px 10px" };
const moreMenuContentStyle: CSSProperties = { position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20, display: "grid", gap: 4, minWidth: 132, padding: 6, border: "1px solid #dddddd", borderRadius: 8, background: "#ffffff", boxShadow: "0 10px 20px rgba(15, 23, 42, 0.12)" };
const menuButtonStyle: CSSProperties = { ...smallButtonStyle, textAlign: "left" };
const dangerMenuButtonStyle: CSSProperties = { ...dangerButtonStyle, textAlign: "left" };
const tableWrapStyle: CSSProperties = { overflowX: "auto", maxWidth: "100%" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1000 };
const thStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #dddddd", textAlign: "left", fontSize: 12 };
const tdStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #eeeeee", fontSize: 13, verticalAlign: "top" };
const emptyStyle: CSSProperties = { padding: 12, border: "1px dashed #cccccc", borderRadius: 6, color: "#666666" };
const detailStackStyle: CSSProperties = { display: "grid", gap: 4 };
const descriptionTextStyle: CSSProperties = { color: "#4b5563", fontSize: 12, lineHeight: 1.35 };
const noteTextStyle: CSSProperties = { color: "#6b7280", fontSize: 12, lineHeight: 1.35 };
const dangerTextStyle: CSSProperties = { color: "#991b1b", fontSize: 12, lineHeight: 1.35, fontWeight: 700 };
const postedStyle: CSSProperties = { color: "#14532d", fontWeight: 800 };
const subNavStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 };
const subNavLinkStyle: CSSProperties = { padding: "9px 12px", border: "1px solid #cccccc", borderRadius: 6, color: "#111111", textDecoration: "none", fontWeight: 800, background: "#ffffff" };
const subNavActiveLinkStyle: CSSProperties = { ...subNavLinkStyle, background: "#111111", color: "#ffffff", borderColor: "#111111" };
