"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { buildPermissions } from "../../../lib/permissions";
import type { UserRole } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import FinanceSubNav from "../FinanceSubNav";
import styles from "./cash-transactions.module.css";

type Profile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  full_name?: string | null;
  staff_name?: string | null;
  can_view_company_ledger?: boolean | null;
  can_submit_expense_claim?: boolean | null;
  can_view_own_expense_claims?: boolean | null;
  can_view_all_expense_claims?: boolean | null;
  can_view_lawyer_compensation?: boolean | null;
  can_view_finance_cash_transactions?: boolean | null;
  can_manage_finance_cash_transactions?: boolean | null;
  can_confirm_finance_cash_transactions?: boolean | null;
  can_reverse_finance_cash_transactions?: boolean | null;
};

type BalanceSummary = {
  bank_account_id: string;
  short_name: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  is_active: boolean;
  currency: string;
  opening_balance_id: string | null;
  opening_balance_as_of: string | null;
  opening_balance_amount: number | string | null;
  opening_balance_confirmed_at: string | null;
  opening_balance_confirmed_by_user_id: string | null;
  is_initialized: boolean;
  confirmed_transaction_count_after_opening: number | string | null;
  confirmed_transaction_count_without_opening: number | string | null;
  confirmed_inflow_after_opening: number | string | null;
  confirmed_outflow_after_opening: number | string | null;
  current_balance: number | string | null;
};

type OpeningBalance = {
  id: string;
  bank_account_id: string;
  currency: string;
  as_of: string;
  balance_amount: number | string;
  status: "draft" | "confirmed" | "cancelled" | "superseded" | string;
  evidence_reference: string | null;
  note: string | null;
  supersedes_opening_balance_id: string | null;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

type CashTransaction = {
  id: string;
  occurred_at: string;
  direction: "inflow" | "outflow" | string;
  transaction_type: string;
  bank_account_id: string;
  cash_amount: number | string;
  currency: string;
  status: "draft" | "confirmed" | "cancelled" | string;
  source_payment_id: string | null;
  reference_no: string | null;
  description: string | null;
  note: string | null;
  reversal_of_transaction_id: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

type UserLabel = { id: string; full_name: string | null; staff_name: string | null; email: string | null };
type OpeningForm = { date: string; amount: string; evidenceReference: string; note: string };
type CashForm = {
  date: string;
  direction: "inflow" | "outflow";
  transactionType: string;
  bankAccountId: string;
  amount: string;
  referenceNo: string;
  description: string;
  note: string;
};

const emptyOpeningForm: OpeningForm = { date: "", amount: "", evidenceReference: "", note: "" };
const emptyCashForm = (): CashForm => ({
  date: bangkokToday(),
  direction: "inflow",
  transactionType: "manual_inflow",
  bankAccountId: "",
  amount: "",
  referenceNo: "",
  description: "",
  note: "",
});

export default function FinanceCashTransactionsPage() {
  const [profile, setProfile] = useState<Profile>({ role: "", financial_access: false });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<BalanceSummary[]>([]);
  const [openingBalances, setOpeningBalances] = useState<OpeningBalance[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [userLabels, setUserLabels] = useState<UserLabel[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");

  const [openingAccountId, setOpeningAccountId] = useState("");
  const [openingDraftId, setOpeningDraftId] = useState("");
  const [openingPriorId, setOpeningPriorId] = useState("");
  const [openingForm, setOpeningForm] = useState<OpeningForm>(emptyOpeningForm);
  const [openingBaseline, setOpeningBaseline] = useState("");
  const [openingAcknowledged, setOpeningAcknowledged] = useState(false);
  const [openingCancelReason, setOpeningCancelReason] = useState("");
  const [openingErrors, setOpeningErrors] = useState<Record<string, string>>({});
  const [openingSaving, setOpeningSaving] = useState(false);

  const [cashPanelOpen, setCashPanelOpen] = useState(false);
  const [cashDraftId, setCashDraftId] = useState("");
  const [cashForm, setCashForm] = useState<CashForm>(emptyCashForm);
  const [cashBaseline, setCashBaseline] = useState("");
  const [cashCancelReason, setCashCancelReason] = useState("");
  const [cashErrors, setCashErrors] = useState<Record<string, string>>({});
  const [cashSaving, setCashSaving] = useState(false);

  const openingPanelRef = useRef<HTMLElement | null>(null);
  const cashPanelRef = useRef<HTMLElement | null>(null);
  const openingActionLockRef = useRef(false);
  const cashActionLockRef = useRef(false);
  const permissions = useMemo(() => buildPermissions(profile), [profile]);
  const openingDirty = Boolean(openingAccountId && openingFingerprint(openingForm) !== openingBaseline);
  const cashDirty = Boolean(cashPanelOpen && cashFingerprint(cashForm) !== cashBaseline);
  const initializedAccounts = useMemo(() => balances.filter((item) => item.is_initialized && item.is_active), [balances]);

  useEffect(() => {
    const loadProfile = async () => {
      setLoadingProfile(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoadingProfile(false);
        return;
      }
      const { data } = await supabase
        .from("user_profiles")
        .select("role, financial_access, full_name, staff_name, can_view_company_ledger, can_submit_expense_claim, can_view_own_expense_claims, can_view_all_expense_claims, can_view_lawyer_compensation, can_view_finance_cash_transactions, can_manage_finance_cash_transactions, can_confirm_finance_cash_transactions, can_reverse_finance_cash_transactions")
        .eq("id", userData.user.id)
        .single();
      setProfile((data || { role: "" }) as Profile);
      setLoadingProfile(false);
    };
    void loadProfile();
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!permissions.canViewFinanceCashTransactions) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [balanceResult, openingResult, transactionResult, usersResult] = await Promise.all([
      supabase.from("finance_cash_account_balance_summary").select("*").eq("currency", "THB").order("short_name"),
      supabase.from("finance_account_opening_balances").select("*").order("created_at", { ascending: false }),
      supabase.from("finance_cash_transactions").select("*").order("occurred_at", { ascending: false }).limit(250),
      supabase.from("user_profiles").select("id, full_name, staff_name, email").eq("active", true),
    ]);
    const firstError = balanceResult.error || openingResult.error || transactionResult.error;
    if (firstError) {
      setError("โหลดข้อมูลรายการเงินรับ–จ่ายไม่สำเร็จ กรุณาลองใหม่");
      console.error("LOAD FINANCE CASH WORKSPACE FAILED", { balanceResult, openingResult, transactionResult });
    } else {
      setBalances((balanceResult.data || []) as BalanceSummary[]);
      setOpeningBalances((openingResult.data || []) as OpeningBalance[]);
      setTransactions((transactionResult.data || []) as CashTransaction[]);
      setUserLabels((usersResult.data || []) as UserLabel[]);
    }
    setLoading(false);
  }, [permissions.canViewFinanceCashTransactions]);

  useEffect(() => {
    if (!loadingProfile) void loadWorkspace();
  }, [loadingProfile, loadWorkspace]);

  const filteredTransactions = useMemo(() => transactions.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (accountFilter !== "all" && item.bank_account_id !== accountFilter) return false;
    return true;
  }), [accountFilter, statusFilter, transactions]);

  const openOpeningPanel = (account: BalanceSummary) => {
    const existingDraft = openingBalances.find((item) =>
      item.bank_account_id === account.bank_account_id &&
      item.currency === account.currency &&
      item.status === "draft" &&
      (account.is_initialized
        ? item.supersedes_opening_balance_id === account.opening_balance_id
        : item.supersedes_opening_balance_id === null)
    );
    const nextForm = existingDraft ? {
      date: bangkokDateKey(existingDraft.as_of),
      amount: String(existingDraft.balance_amount),
      evidenceReference: existingDraft.evidence_reference || "",
      note: existingDraft.note || "",
    } : emptyOpeningForm;
    setOpeningAccountId(account.bank_account_id);
    setOpeningDraftId(existingDraft?.id || "");
    setOpeningPriorId(account.is_initialized ? account.opening_balance_id || "" : "");
    setOpeningForm(nextForm);
    setOpeningBaseline(openingFingerprint(nextForm));
    setOpeningAcknowledged(false);
    setOpeningCancelReason("");
    setOpeningErrors({});
    setCashPanelOpen(false);
    setError("");
    setMessage("");
    window.requestAnimationFrame(() => openingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const closeOpeningPanel = () => {
    setOpeningAccountId("");
    setOpeningDraftId("");
    setOpeningPriorId("");
    setOpeningForm(emptyOpeningForm);
    setOpeningBaseline("");
    setOpeningAcknowledged(false);
    setOpeningErrors({});
  };

  const validateOpening = () => {
    const next: Record<string, string> = {};
    if (!openingForm.date) next.date = "กรุณาระบุวันที่เริ่มระบบใหม่";
    if (!openingForm.amount.trim() || !isValidMoney(openingForm.amount, true)) next.amount = "กรุณาระบุยอดเงินจริงไม่เกิน 2 ตำแหน่งทศนิยม";
    setOpeningErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveOpeningDraft = async () => {
    if (openingActionLockRef.current || !permissions.canManageFinanceCashTransactions || !validateOpening()) return;
    openingActionLockRef.current = true;
    setOpeningSaving(true);
    setError("");
    setMessage("");
    try {
      const common = {
        p_as_of: bangkokCompletedDayEnd(openingForm.date),
        p_balance_amount: Number(openingForm.amount),
        p_evidence_reference: openingForm.evidenceReference || null,
        p_note: openingForm.note || null,
      };
      const result = openingDraftId
        ? await supabase.rpc("save_finance_account_opening_balance_draft", {
            p_opening_balance_id: openingDraftId,
            p_bank_account_id: openingAccountId,
            p_currency: "THB",
            ...common,
          })
        : openingPriorId
          ? await supabase.rpc("create_finance_account_opening_balance_replacement_draft", {
              p_prior_opening_balance_id: openingPriorId,
              ...common,
            })
          : await supabase.rpc("create_finance_account_opening_balance_draft", {
              p_bank_account_id: openingAccountId,
              p_currency: "THB",
              ...common,
            });
      if (result.error) throw result.error;
      setOpeningDraftId(String(result.data));
      setOpeningBaseline(openingFingerprint(openingForm));
      setMessage("บันทึกร่างยอดเริ่มต้นแล้ว ยังไม่มีผลต่อยอดคงเหลือจนกว่าจะยืนยัน");
      await loadWorkspace();
    } catch (caught) {
      console.error("SAVE OPENING BALANCE DRAFT FAILED", caught);
      setError(financeCashError(caught, "บันทึกร่างยอดเริ่มต้นไม่สำเร็จ"));
    } finally {
      openingActionLockRef.current = false;
      setOpeningSaving(false);
    }
  };

  const confirmOpening = async () => {
    const next: Record<string, string> = {};
    if (!openingDraftId) next.confirm = "กรุณาบันทึกร่างก่อนยืนยันยอดเริ่มต้น";
    if (openingDirty) next.confirm = "มีข้อมูลที่ยังไม่ได้บันทึก กรุณาบันทึกร่างก่อนยืนยัน";
    if (!openingAcknowledged) next.acknowledgement = "กรุณายืนยันว่าได้ตรวจสอบยอดเงินจริงแล้ว";
    setOpeningErrors(next);
    if (openingActionLockRef.current || Object.keys(next).length || !permissions.canConfirmFinanceCashTransactions) return;
    openingActionLockRef.current = true;
    setOpeningSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("confirm_finance_account_opening_balance", {
        p_opening_balance_id: openingDraftId,
        p_independent_balance_acknowledged: true,
      });
      if (rpcError) throw rpcError;
      closeOpeningPanel();
      setMessage("ยืนยันยอดเริ่มต้นแล้ว บัญชีนี้เริ่มใช้งานในระบบเงินรับ–จ่ายใหม่");
      await loadWorkspace();
    } catch (caught) {
      console.error("CONFIRM OPENING BALANCE FAILED", caught);
      setError(financeCashError(caught, "ยืนยันยอดเริ่มต้นไม่สำเร็จ"));
    } finally {
      openingActionLockRef.current = false;
      setOpeningSaving(false);
    }
  };

  const cancelOpeningDraft = async () => {
    if (openingActionLockRef.current) return;
    if (!openingDraftId || !openingCancelReason.trim()) {
      setOpeningErrors((current) => ({ ...current, cancelReason: "กรุณาระบุเหตุผลที่ยกเลิกร่าง" }));
      return;
    }
    openingActionLockRef.current = true;
    setOpeningSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc("cancel_finance_account_opening_balance_draft", {
        p_opening_balance_id: openingDraftId,
        p_cancel_reason: openingCancelReason,
      });
      if (rpcError) throw rpcError;
      closeOpeningPanel();
      setMessage("ยกเลิกร่างยอดเริ่มต้นแล้ว");
      await loadWorkspace();
    } catch (caught) {
      console.error("CANCEL OPENING BALANCE DRAFT FAILED", caught);
      setError(financeCashError(caught, "ยกเลิกร่างยอดเริ่มต้นไม่สำเร็จ"));
    } finally {
      openingActionLockRef.current = false;
      setOpeningSaving(false);
    }
  };

  const openNewCashPanel = () => {
    if (!initializedAccounts.length) return;
    const next = { ...emptyCashForm(), bankAccountId: initializedAccounts[0].bank_account_id };
    setCashDraftId("");
    setCashForm(next);
    setCashBaseline(cashFingerprint(next));
    setCashErrors({});
    setCashCancelReason("");
    setCashPanelOpen(true);
    closeOpeningPanel();
    setMessage("");
    setError("");
    window.requestAnimationFrame(() => cashPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const editCashDraft = (item: CashTransaction) => {
    const next: CashForm = {
      date: bangkokDateKey(item.occurred_at),
      direction: item.direction === "outflow" ? "outflow" : "inflow",
      transactionType: item.transaction_type,
      bankAccountId: item.bank_account_id,
      amount: String(item.cash_amount),
      referenceNo: item.reference_no || "",
      description: item.description || "",
      note: item.note || "",
    };
    setCashDraftId(item.id);
    setCashForm(next);
    setCashBaseline(cashFingerprint(next));
    setCashErrors({});
    setCashCancelReason("");
    setCashPanelOpen(true);
    closeOpeningPanel();
    setMessage("");
    setError("");
    window.requestAnimationFrame(() => cashPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const updateCashDirection = (direction: "inflow" | "outflow") => {
    setCashForm((current) => ({
      ...current,
      direction,
      transactionType: direction === "inflow" ? "manual_inflow" : "manual_outflow",
    }));
    setCashErrors((current) => ({ ...current, direction: "", transactionType: "" }));
  };

  const validateCash = () => {
    const next: Record<string, string> = {};
    if (!cashForm.date) next.date = "กรุณาระบุวันที่รายการ";
    if (!cashForm.bankAccountId) next.bankAccount = "กรุณาเลือกบัญชี";
    if (!cashForm.amount.trim() || !isValidMoney(cashForm.amount, false)) next.amount = "กรุณาระบุจำนวนเงินจริงมากกว่า 0 และไม่เกิน 2 ตำแหน่งทศนิยม";
    if (!cashForm.transactionType) next.transactionType = "กรุณาเลือกประเภทรายการ";
    setCashErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveCashDraft = async () => {
    if (cashActionLockRef.current || !permissions.canManageFinanceCashTransactions || !validateCash()) return;
    cashActionLockRef.current = true;
    setCashSaving(true);
    setError("");
    setMessage("");
    const payload = {
      p_occurred_at: bangkokCashTimestamp(cashForm.date),
      p_direction: cashForm.direction,
      p_transaction_type: cashForm.transactionType,
      p_bank_account_id: cashForm.bankAccountId,
      p_cash_amount: Number(cashForm.amount),
      p_currency: "THB",
      p_reference_no: cashForm.referenceNo || null,
      p_description: cashForm.description || null,
      p_note: cashForm.note || null,
    };
    try {
      const result = cashDraftId
        ? await supabase.rpc("save_finance_cash_transaction_draft", { p_cash_transaction_id: cashDraftId, ...payload })
        : await supabase.rpc("create_finance_cash_transaction_draft", payload);
      if (result.error) throw result.error;
      setCashDraftId(String(result.data));
      setCashBaseline(cashFingerprint(cashForm));
      setMessage("บันทึกร่างรายการเงินแล้ว ยังไม่มีผลต่อยอดคงเหลือจนกว่าจะยืนยัน");
      await loadWorkspace();
    } catch (caught) {
      console.error("SAVE CASH TRANSACTION DRAFT FAILED", caught);
      setError(financeCashError(caught, "บันทึกร่างรายการเงินไม่สำเร็จ"));
    } finally {
      cashActionLockRef.current = false;
      setCashSaving(false);
    }
  };

  const selectedCashAccount = balances.find((item) => item.bank_account_id === cashForm.bankAccountId);
  const cashAfterCutover = Boolean(
    selectedCashAccount?.opening_balance_as_of &&
    cashForm.date &&
    cashForm.date > bangkokDateKey(selectedCashAccount.opening_balance_as_of)
  );

  const confirmCashDraft = async () => {
    const next: Record<string, string> = {};
    if (!cashDraftId) next.confirm = "กรุณาบันทึกร่างก่อนยืนยันรายการเงินจริง";
    if (cashDirty) next.confirm = "มีข้อมูลที่ยังไม่ได้บันทึก กรุณาบันทึกร่างก่อนยืนยัน";
    if (!selectedCashAccount?.is_initialized) next.confirm = "ต้องตั้งยอดเริ่มต้นของบัญชีนี้ก่อน จึงจะยืนยันรายการเงินจริงได้";
    else if (!cashAfterCutover) next.date = "วันที่รายการต้องอยู่หลังวันที่เริ่มระบบใหม่ของบัญชี";
    setCashErrors(next);
    if (cashActionLockRef.current || Object.keys(next).length || !permissions.canConfirmFinanceCashTransactions) return;
    cashActionLockRef.current = true;
    setCashSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc("confirm_finance_cash_transaction", { p_cash_transaction_id: cashDraftId });
      if (rpcError) throw rpcError;
      setCashPanelOpen(false);
      setMessage("ยืนยันรายการเงินจริงแล้ว ยอดคงเหลือได้รับการปรับปรุง");
      await loadWorkspace();
    } catch (caught) {
      console.error("CONFIRM CASH TRANSACTION FAILED", caught);
      setError(financeCashError(caught, "ยืนยันรายการเงินจริงไม่สำเร็จ"));
    } finally {
      cashActionLockRef.current = false;
      setCashSaving(false);
    }
  };

  const cancelCashDraft = async () => {
    if (cashActionLockRef.current) return;
    if (!cashDraftId || !cashCancelReason.trim()) {
      setCashErrors((current) => ({ ...current, cancelReason: "กรุณาระบุเหตุผลที่ยกเลิกร่าง" }));
      return;
    }
    cashActionLockRef.current = true;
    setCashSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc("cancel_finance_cash_transaction_draft", {
        p_cash_transaction_id: cashDraftId,
        p_cancel_reason: cashCancelReason,
      });
      if (rpcError) throw rpcError;
      setCashPanelOpen(false);
      setMessage("ยกเลิกร่างรายการเงินแล้ว");
      await loadWorkspace();
    } catch (caught) {
      console.error("CANCEL CASH TRANSACTION DRAFT FAILED", caught);
      setError(financeCashError(caught, "ยกเลิกร่างรายการเงินไม่สำเร็จ"));
    } finally {
      cashActionLockRef.current = false;
      setCashSaving(false);
    }
  };

  if (loadingProfile) return <AuthGuard><main className={styles.page}><div className={styles.notice}>กำลังตรวจสอบสิทธิ์...</div></main></AuthGuard>;

  return (
    <AuthGuard>
      <AppTopNav title="รายการเงินรับ–จ่าย" subtitle="ยอดเงินจริงและยอดคงเหลือของบัญชีบริษัท" activePage="finance" />
      <main className={styles.page}>
        <FinanceSubNav activePage="cash-transactions" permissions={permissions} />
        {!permissions.canViewFinanceCashTransactions ? <div className={styles.error}>คุณไม่มีสิทธิ์ดูรายการเงินรับ–จ่าย</div> : null}
        {permissions.canViewFinanceCashTransactions ? <>
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
          {message ? <div className={styles.success} role="status">{message}</div> : null}

          <header className={styles.workspaceHeader}>
            <div>
              <span className={styles.eyebrow}>ระบบเงินรับ–จ่ายใหม่</span>
              <h1>รายการเงินรับ–จ่าย</h1>
              <p>ระบบใหม่สำหรับยอดเงินจริงของแต่ละบัญชี แยกจากรายการรับ–จ่ายเดิมอย่างชัดเจน</p>
            </div>
            <button className={styles.primaryButton} type="button" disabled={!permissions.canManageFinanceCashTransactions || initializedAccounts.length === 0} onClick={openNewCashPanel}>
              <ActionIcon name="add" />บันทึกรายการเงิน
            </button>
          </header>

          <div className={styles.cutoverNotice}>
            <ActionIcon name="info" />
            <div><strong>ระบบเดิมยังคงใช้งานอยู่</strong><span>บัญชีที่ยังไม่มียอดเริ่มต้นจะไม่แสดงยอดคงเหลือ และข้อมูลจากระบบเดิมจะไม่ถูกนำมารวมในหน้านี้</span></div>
            {permissions.canViewCompanyLedger ? <Link href="/finance/ledger">เปิดรายการรับ–จ่ายเดิม</Link> : null}
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><div><h2>บัญชีบริษัท</h2><p>ยอดคงเหลือคำนวณจากยอดเริ่มต้นและรายการที่ยืนยันแล้วหลังวันเริ่มระบบใหม่เท่านั้น</p></div></div>
            {loading ? <div className={styles.notice}>กำลังโหลดบัญชี...</div> : null}
            <div className={styles.accountGrid}>
              {balances.map((account) => {
                const actor = userLabel(account.opening_balance_confirmed_by_user_id, userLabels);
                const draft = openingBalances.find((item) => item.bank_account_id === account.bank_account_id && item.status === "draft");
                return <article className={styles.accountCard} key={`${account.bank_account_id}-${account.currency}`}>
                  <div className={styles.accountIdentity}>
                    <div><strong>{account.short_name || "บัญชีบริษัท"}</strong><span>{account.bank_name || "ไม่ระบุธนาคาร"}</span><small>{account.account_number || "ยังไม่มีเลขที่บัญชีในข้อมูลหลัก"}</small></div>
                    <span className={account.is_active ? styles.activeBadge : styles.inactiveBadge}>{account.is_active ? "ใช้งาน" : "ไม่ใช้งาน"}</span>
                  </div>
                  {account.is_initialized ? <>
                    <div className={styles.balanceValue}><span>ยอดคงเหลือปัจจุบัน</span><strong>{money(account.current_balance, account.currency)}</strong></div>
                    <dl className={styles.metrics}>
                      <Metric label="ยอดเริ่มต้น" value={money(account.opening_balance_amount, account.currency)} />
                      <Metric label="ณ สิ้นวันที่" value={thaiDate(account.opening_balance_as_of)} />
                      <Metric label="เงินเข้าหลังเริ่มระบบ" value={money(account.confirmed_inflow_after_opening, account.currency)} />
                      <Metric label="เงินออกหลังเริ่มระบบ" value={money(account.confirmed_outflow_after_opening, account.currency)} />
                    </dl>
                    <p className={styles.confirmedMeta}>ยืนยัน {thaiDateTime(account.opening_balance_confirmed_at)}{actor ? ` โดย ${actor}` : ""}</p>
                  </> : <div className={styles.uninitializedState}><strong>ยังไม่ได้ตั้งยอดเริ่มต้น</strong><span>บัญชีนี้ยังไม่เริ่มใช้งานในระบบเงินรับ–จ่ายใหม่</span></div>}
                  {draft ? <div className={styles.draftNote}>มีร่างยอดเริ่มต้นที่ยังไม่ยืนยัน</div> : null}
                  {permissions.canManageFinanceCashTransactions && account.is_active ? <button className={styles.secondaryButton} type="button" onClick={() => openOpeningPanel(account)}>{account.is_initialized ? "เตรียมยอดทดแทน" : draft ? "ดำเนินการตั้งยอดเริ่มต้น" : "ตั้งยอดเริ่มต้น"}</button> : null}
                </article>;
              })}
            </div>
          </section>

          {openingAccountId ? <section ref={openingPanelRef} className={`${styles.section} ${styles.editorSection}`}>
            <div className={styles.editorHeader}><div><span className={styles.eyebrow}>ยอดเริ่มต้น</span><h2>{openingPriorId ? "เตรียมยอดเริ่มต้นทดแทน" : "ตั้งยอดเริ่มต้น"}</h2><p>ยอดเงินจริงของบัญชี ณ สิ้นวันที่เริ่มใช้ระบบใหม่ ระบบจะไม่คำนวณยอดนี้จากรายการรับ–จ่ายเดิม</p></div><button className={styles.iconButton} type="button" aria-label="ปิดแบบฟอร์มยอดเริ่มต้น" onClick={closeOpeningPanel}>×</button></div>
            <div className={styles.accountContext}><strong>{bankLabel(openingAccountId, balances)}</strong><span>สกุลเงิน THB</span></div>
            <div className={styles.formGrid}>
              <FormField label="วันที่เริ่มระบบใหม่" helper="ยอด ณ สิ้นวันตามเวลาไทย" error={openingErrors.date}><input type="date" value={openingForm.date} onChange={(event) => { setOpeningForm({ ...openingForm, date: event.target.value }); clearField(setOpeningErrors, "date"); }} /></FormField>
              <FormField label="ยอดเงินจริง ณ สิ้นวัน" error={openingErrors.amount}><input inputMode="decimal" value={openingForm.amount} onChange={(event) => { setOpeningForm({ ...openingForm, amount: event.target.value }); clearField(setOpeningErrors, "amount"); }} placeholder="0.00" /></FormField>
              <FormField label="หลักฐาน/เลขอ้างอิง" helper="ไม่บังคับ"><input value={openingForm.evidenceReference} onChange={(event) => setOpeningForm({ ...openingForm, evidenceReference: event.target.value })} /></FormField>
              <FormField label="หมายเหตุ" helper="ไม่บังคับ"><textarea rows={3} value={openingForm.note} onChange={(event) => setOpeningForm({ ...openingForm, note: event.target.value })} /></FormField>
            </div>
            <div className={styles.saveRow}><span className={openingDirty ? styles.unsavedState : styles.savedState}>{openingDirty ? "มีข้อมูลที่ยังไม่ได้บันทึก" : openingDraftId ? "บันทึกร่างแล้ว" : "ยังไม่สร้างข้อมูลในระบบ"}</span><button className={styles.secondaryButton} type="button" disabled={openingSaving || !openingDirty} onClick={() => void saveOpeningDraft()}>{openingSaving ? "กำลังบันทึก..." : "บันทึกร่าง"}</button></div>
            <div className={styles.confirmZone}>
              <div><h3>ตรวจสอบก่อนยืนยันยอดเริ่มต้น</h3><p>เมื่อยืนยันแล้ว ยอดนี้จะเป็นฐานของระบบเงินรับ–จ่ายใหม่ และแก้ไขได้ผ่านการทำยอดทดแทนเท่านั้น</p></div>
              {openingErrors.confirm ? <p className={styles.fieldError}>{openingErrors.confirm}</p> : null}
              <label className={openingErrors.acknowledgement ? styles.invalidCheck : styles.checkLabel}><input type="checkbox" checked={openingAcknowledged} onChange={(event) => { setOpeningAcknowledged(event.target.checked); clearField(setOpeningErrors, "acknowledgement"); }} /><span>ยืนยันว่าได้ตรวจสอบยอดเงินจริงของบัญชี ณ สิ้นวันที่ระบุแล้ว</span></label>
              {openingErrors.acknowledgement ? <p className={styles.fieldError}>{openingErrors.acknowledgement}</p> : null}
              <button className={styles.primaryButton} type="button" disabled={openingSaving || !permissions.canConfirmFinanceCashTransactions || !openingDraftId || openingDirty} onClick={() => void confirmOpening()}>ยืนยันยอดเริ่มต้น</button>
              {!permissions.canConfirmFinanceCashTransactions ? <p className={styles.permissionNote}>คุณจัดทำร่างได้ แต่ไม่มีสิทธิ์ยืนยันยอดเริ่มต้น</p> : null}
            </div>
            {openingDraftId ? <div className={styles.otherActions}><strong>การดำเนินการอื่น</strong><div className={styles.cancelGrid}><input value={openingCancelReason} onChange={(event) => { setOpeningCancelReason(event.target.value); clearField(setOpeningErrors, "cancelReason"); }} placeholder="เหตุผลที่ยกเลิกร่าง" /><button className={styles.dangerButton} type="button" disabled={openingSaving} onClick={() => void cancelOpeningDraft()}>ยกเลิกร่าง</button></div>{openingErrors.cancelReason ? <p className={styles.fieldError}>{openingErrors.cancelReason}</p> : null}</div> : null}
          </section> : null}

          {cashPanelOpen ? <section ref={cashPanelRef} className={`${styles.section} ${styles.editorSection}`}>
            <div className={styles.editorHeader}><div><span className={styles.eyebrow}>รายการเงินจริง</span><h2>{cashDraftId ? "แก้ไขร่างรายการเงิน" : "บันทึกรายการเงิน"}</h2><p>ใช้สำหรับรายการเงินจริงที่บันทึกด้วยตนเอง รายการจากการรับชำระลูกค้าจะเข้าระบบผ่านขั้นตอน Payment โดยอัตโนมัติหลังเริ่มระบบ</p></div><button className={styles.iconButton} type="button" aria-label="ปิดแบบฟอร์มรายการเงิน" onClick={() => setCashPanelOpen(false)}>×</button></div>
            <div className={styles.segmented} aria-label="ทิศทางรายการ"><button type="button" className={cashForm.direction === "inflow" ? styles.segmentActive : ""} onClick={() => updateCashDirection("inflow")}>เงินเข้า</button><button type="button" className={cashForm.direction === "outflow" ? styles.segmentActive : ""} onClick={() => updateCashDirection("outflow")}>เงินออก</button></div>
            <div className={styles.formGrid}>
              <FormField label="วันที่" error={cashErrors.date}><input type="date" value={cashForm.date} onChange={(event) => { setCashForm({ ...cashForm, date: event.target.value }); clearField(setCashErrors, "date"); }} /></FormField>
              <FormField label="บัญชี" error={cashErrors.bankAccount}><select value={cashForm.bankAccountId} onChange={(event) => { setCashForm({ ...cashForm, bankAccountId: event.target.value }); clearField(setCashErrors, "bankAccount"); }}>{balances.filter((item) => item.is_active).map((item) => <option key={item.bank_account_id} value={item.bank_account_id}>{bankLabel(item.bank_account_id, balances)}</option>)}</select></FormField>
              <FormField label="ประเภท" error={cashErrors.transactionType}><select value={cashForm.transactionType} onChange={(event) => setCashForm({ ...cashForm, transactionType: event.target.value })}>{cashTypeOptions(cashForm.direction).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FormField>
              <FormField label="จำนวนเงินจริง" error={cashErrors.amount}><input inputMode="decimal" value={cashForm.amount} onChange={(event) => { setCashForm({ ...cashForm, amount: event.target.value }); clearField(setCashErrors, "amount"); }} placeholder="0.00" /></FormField>
              <FormField label="เลขอ้างอิง" helper="ไม่บังคับ"><input value={cashForm.referenceNo} onChange={(event) => setCashForm({ ...cashForm, referenceNo: event.target.value })} /></FormField>
              <FormField label="รายละเอียด" helper="ไม่บังคับ"><input value={cashForm.description} onChange={(event) => setCashForm({ ...cashForm, description: event.target.value })} /></FormField>
              <FormField label="หมายเหตุ" helper="ไม่บังคับ"><textarea rows={3} value={cashForm.note} onChange={(event) => setCashForm({ ...cashForm, note: event.target.value })} /></FormField>
            </div>
            {!selectedCashAccount?.is_initialized ? <div className={styles.blockedNotice}>ต้องตั้งยอดเริ่มต้นของบัญชีนี้ก่อน จึงจะยืนยันรายการเงินจริงได้</div> : !cashAfterCutover && cashForm.date ? <div className={styles.blockedNotice}>วันที่รายการต้องอยู่หลังวันที่เริ่มระบบใหม่ของบัญชี</div> : null}
            <div className={styles.saveRow}><span className={cashDirty ? styles.unsavedState : styles.savedState}>{cashDirty ? "มีข้อมูลที่ยังไม่ได้บันทึก" : cashDraftId ? "บันทึกร่างแล้ว" : "ยังไม่สร้างข้อมูลในระบบ"}</span><button className={styles.secondaryButton} type="button" disabled={cashSaving || !cashDirty} onClick={() => void saveCashDraft()}>{cashSaving ? "กำลังบันทึก..." : "บันทึกร่าง"}</button></div>
            <div className={styles.confirmZone}><div><h3>ตรวจสอบรายการเงินจริง</h3><p>ยืนยันเมื่อได้ตรวจสอบวันที่ บัญชี ประเภท และจำนวนเงินครบถ้วนแล้ว รายการยืนยันแล้วจะมีผลต่อยอดคงเหลือ</p></div>{cashErrors.confirm ? <p className={styles.fieldError}>{cashErrors.confirm}</p> : null}<button className={styles.primaryButton} type="button" disabled={cashSaving || !permissions.canConfirmFinanceCashTransactions || !cashDraftId || cashDirty || !selectedCashAccount?.is_initialized || !cashAfterCutover} onClick={() => void confirmCashDraft()}>ยืนยันรายการเงินจริง</button>{!permissions.canConfirmFinanceCashTransactions ? <p className={styles.permissionNote}>คุณจัดทำร่างได้ แต่ไม่มีสิทธิ์ยืนยันรายการเงินจริง</p> : null}</div>
            {cashDraftId ? <div className={styles.otherActions}><strong>การดำเนินการอื่น</strong><div className={styles.cancelGrid}><input value={cashCancelReason} onChange={(event) => { setCashCancelReason(event.target.value); clearField(setCashErrors, "cancelReason"); }} placeholder="เหตุผลที่ยกเลิกร่าง" /><button className={styles.dangerButton} type="button" disabled={cashSaving} onClick={() => void cancelCashDraft()}>ยกเลิกร่าง</button></div>{cashErrors.cancelReason ? <p className={styles.fieldError}>{cashErrors.cancelReason}</p> : null}</div> : null}
          </section> : null}

          <section className={styles.section}>
            <div className={styles.sectionHeading}><div><h2>รายการเงินจริงในระบบใหม่</h2><p>ไม่รวมรายการรับ–จ่ายเดิม รายการร่างและรายการยกเลิกไม่มีผลต่อยอดคงเหลือ</p></div><div className={styles.filters}><select aria-label="กรองบัญชี" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">ทุกบัญชี</option>{balances.map((item) => <option key={item.bank_account_id} value={item.bank_account_id}>{item.short_name || item.bank_name}</option>)}</select><select aria-label="กรองสถานะ" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">ทุกสถานะ</option><option value="draft">ร่าง</option><option value="confirmed">ยืนยันแล้ว</option><option value="cancelled">ยกเลิก</option></select></div></div>
            <div className={styles.tableWrap}><table><thead><tr><th>วันที่</th><th>รายการ</th><th>บัญชี</th><th>รายละเอียด</th><th>สถานะ</th><th className={styles.amountColumn}>จำนวนเงิน</th><th aria-label="การดำเนินการ" /></tr></thead><tbody>{filteredTransactions.map((item) => <tr key={item.id}><td>{thaiDate(item.occurred_at)}</td><td><strong className={item.direction === "inflow" ? styles.inflow : styles.outflow}>{transactionTypeLabel(item)}</strong>{item.reversal_of_transaction_id ? <small>รายการปรับแก้</small> : null}</td><td>{bankLabel(item.bank_account_id, balances)}</td><td><span>{item.description || item.reference_no || "-"}</span>{item.source_payment_id ? <Link href={`/finance/payments/${item.source_payment_id}`}>เปิดรายการรับชำระ {shortId(item.source_payment_id)}</Link> : null}</td><td><StatusBadge status={item.status} /></td><td className={styles.amountColumn}>{item.direction === "outflow" ? "-" : "+"}{money(item.cash_amount, item.currency)}</td><td>{item.status === "draft" && permissions.canManageFinanceCashTransactions && !item.source_payment_id && !item.reversal_of_transaction_id ? <button className={styles.tableButton} type="button" onClick={() => editCashDraft(item)}>เปิดร่าง</button> : null}</td></tr>)}{!filteredTransactions.length ? <tr><td colSpan={7} className={styles.emptyTable}>ยังไม่มีรายการเงินจริงในระบบใหม่</td></tr> : null}</tbody></table></div>
          </section>
        </> : null}
      </main>
    </AuthGuard>
  );
}

function FormField({ label, helper, error, children }: { label: string; helper?: string; error?: string; children: React.ReactNode }) {
  return <label className={`${styles.field} ${error ? styles.invalidField : ""}`}><span>{label}</span>{children}{helper ? <small>{helper}</small> : null}{error ? <em>{error}</em> : null}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function StatusBadge({ status }: { status: string }) {
  const label = status === "confirmed" ? "ยืนยันแล้ว" : status === "cancelled" ? "ยกเลิก" : "ร่าง";
  return <span className={`${styles.statusBadge} ${status === "confirmed" ? styles.statusConfirmed : status === "cancelled" ? styles.statusCancelled : styles.statusDraft}`}>{label}</span>;
}

function ActionIcon({ name }: { name: "add" | "info" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  return name === "add" ? <svg {...common}><path d="M12 5v14M5 12h14" /></svg> : <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
}

function cashTypeOptions(direction: "inflow" | "outflow") {
  return direction === "inflow"
    ? [{ value: "manual_inflow", label: "เงินเข้าทั่วไป" }, { value: "other", label: "เงินเข้าอื่น" }]
    : [{ value: "manual_outflow", label: "เงินออกทั่วไป" }, { value: "refund", label: "คืนเงิน" }, { value: "tax_payment", label: "ชำระภาษี" }, { value: "other", label: "เงินออกอื่น" }];
}

function transactionTypeLabel(item: CashTransaction) {
  if (item.transaction_type === "customer_payment") return "รับชำระจากลูกค้า";
  if (item.transaction_type === "manual_inflow") return "เงินเข้าทั่วไป";
  if (item.transaction_type === "manual_outflow") return "เงินออกทั่วไป";
  if (item.transaction_type === "refund") return "คืนเงิน";
  if (item.transaction_type === "tax_payment") return "ชำระภาษี";
  if (item.transaction_type === "reversal") return "รายการกลับ/ปรับแก้";
  return item.direction === "inflow" ? "เงินเข้าอื่น" : "เงินออกอื่น";
}

function financeCashError(value: unknown, fallback: string) {
  const message = typeof value === "object" && value && "message" in value ? String((value as { message?: unknown }).message || "") : String(value || "");
  if (message.includes("FINANCE_CASH_OPENING_BALANCE_ALREADY_CONFIRMED") || message.includes("FINANCE_CASH_OPENING_BALANCE_CONFLICT")) return "บัญชีนี้มียอดเริ่มต้นที่ยืนยันแล้ว กรุณารีเฟรชและตรวจสอบสถานะล่าสุด";
  if (message.includes("FINANCE_CASH_UNPOSTED_PAYMENT_AFTER_CUTOVER")) return "ยังยืนยันวันเริ่มระบบนี้ไม่ได้ เพราะมีรายการรับชำระหลังวันที่ดังกล่าวที่ยังไม่ได้เข้าระบบเงินรับ–จ่าย กรุณาให้ Admin ตรวจสอบ";
  if (message.includes("FINANCE_CASH_OPENING_BALANCE_END_OF_DAY_REQUIRED")) return "วันที่เริ่มระบบไม่อยู่ในรูปแบบสิ้นวันตามเวลาไทย กรุณาเลือกวันที่ใหม่";
  if (message.includes("FINANCE_CASH_OPENING_BALANCE_REQUIRED")) return "ต้องตั้งยอดเริ่มต้นของบัญชีนี้ก่อน จึงจะยืนยันรายการเงินจริงได้";
  if (message.includes("FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER")) return "วันที่รายการต้องอยู่หลังวันที่เริ่มระบบใหม่ของบัญชี";
  if (message.includes("active bank account")) return "บัญชีนี้ไม่อยู่ในสถานะใช้งาน กรุณาตรวจสอบข้อมูลบัญชี";
  if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์ดำเนินการนี้ กรุณาติดต่อ Admin";
  if (message.includes("Only a Draft")) return "รายการนี้ไม่ใช่สถานะร่างแล้ว กรุณารีเฟรชและตรวจสอบอีกครั้ง";
  return fallback;
}

function clearField(setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, field: string) {
  setter((current) => ({ ...current, [field]: "" }));
}

function openingFingerprint(form: OpeningForm) { return JSON.stringify(form); }
function cashFingerprint(form: CashForm) { return JSON.stringify(form); }
function isValidMoney(value: string, allowZero: boolean) { const normalized = value.trim(); if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return false; return allowZero ? Number.isFinite(Number(normalized)) : Number(normalized) > 0; }
function bangkokCompletedDayEnd(date: string) { return `${date}T23:59:59.999999+07:00`; }
function bangkokCashTimestamp(date: string) { return `${date}T12:00:00+07:00`; }
function bangkokToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function bangkokDateKey(value: string) { const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)); const get = (type: string) => parts.find((part) => part.type === type)?.value || ""; return `${get("year")}-${get("month")}-${get("day")}`; }
function thaiDate(value: string | null) { return value ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long" }).format(new Date(value)) : "-"; }
function thaiDateTime(value: string | null) { return value ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"; }
function money(value: number | string | null, currency = "THB") { if (value == null) return "-"; return `${new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} ${currency}`; }
function bankLabel(id: string, balances: BalanceSummary[]) { const account = balances.find((item) => item.bank_account_id === id); return account ? `${account.short_name || account.bank_name || "บัญชีบริษัท"}${account.account_number ? ` · ${account.account_number}` : ""}` : "บัญชีบริษัท"; }
function userLabel(id: string | null, users: UserLabel[]) { if (!id) return ""; const user = users.find((item) => item.id === id); return user?.staff_name || user?.full_name || user?.email || ""; }
function shortId(id: string) { return id.slice(0, 8).toUpperCase(); }
