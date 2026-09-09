"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { uiMessage, uiDate, type UiMessage, type UiLocale } from "../../../lib/i18n/core";
import { translate } from "../../../lib/i18n/catalog";

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
  const { t, text, locale } = useI18n();
  const [profile, setProfile] = useState<Profile>({ role: "", financial_access: false });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<BalanceSummary[]>([]);
  const [openingBalances, setOpeningBalances] = useState<OpeningBalance[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [userLabels, setUserLabels] = useState<UserLabel[]>([]);
  const [error, setError] = useState<UiMessage | string>("");
  const [message, setMessage] = useState<UiMessage | string>("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");

  const [openingAccountId, setOpeningAccountId] = useState("");
  const [openingDraftId, setOpeningDraftId] = useState("");
  const [openingPriorId, setOpeningPriorId] = useState("");
  const [openingForm, setOpeningForm] = useState<OpeningForm>(emptyOpeningForm);
  const [openingBaseline, setOpeningBaseline] = useState("");
  const [openingAcknowledged, setOpeningAcknowledged] = useState(false);
  const [openingCancelReason, setOpeningCancelReason] = useState("");
  const [openingErrors, setOpeningErrors] = useState<Record<string, UiMessage | string>>({});
  const [openingSaving, setOpeningSaving] = useState(false);

  const [cashPanelOpen, setCashPanelOpen] = useState(false);
  const [cashDraftId, setCashDraftId] = useState("");
  const [cashForm, setCashForm] = useState<CashForm>(emptyCashForm);
  const [cashBaseline, setCashBaseline] = useState("");
  const [cashCancelReason, setCashCancelReason] = useState("");
  const [cashErrors, setCashErrors] = useState<Record<string, UiMessage | string>>({});
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
      setError(uiMessage("finance.cash.error.load"));
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
    const next: Record<string, UiMessage | string> = {};
    if (!openingForm.date) next.date = uiMessage("finance.cash.validation.openingDate");
    if (!openingForm.amount.trim() || !isValidMoney(openingForm.amount, true)) next.amount = uiMessage("finance.cash.validation.openingAmount");
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
      setMessage(uiMessage("finance.cash.success.openingSaved"));
      await loadWorkspace();
    } catch (caught) {
      console.error("SAVE OPENING BALANCE DRAFT FAILED", caught);
      setError(financeCashError(caught, uiMessage("finance.cash.error.openingSave")));
    } finally {
      openingActionLockRef.current = false;
      setOpeningSaving(false);
    }
  };

  const confirmOpening = async () => {
    const next: Record<string, UiMessage | string> = {};
    if (!openingDraftId) next.confirm = uiMessage("finance.cash.validation.saveOpeningFirst");
    if (openingDirty) next.confirm = uiMessage("finance.cash.validation.unsaved");
    if (!openingAcknowledged) next.acknowledgement = uiMessage("finance.cash.validation.acknowledge");
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
      setMessage(uiMessage("finance.cash.success.openingConfirmed"));
      await loadWorkspace();
    } catch (caught) {
      console.error("CONFIRM OPENING BALANCE FAILED", caught);
      setError(financeCashError(caught, uiMessage("finance.cash.error.openingConfirm")));
    } finally {
      openingActionLockRef.current = false;
      setOpeningSaving(false);
    }
  };

  const cancelOpeningDraft = async () => {
    if (openingActionLockRef.current) return;
    if (!openingDraftId || !openingCancelReason.trim()) {
      setOpeningErrors((current) => ({ ...current, cancelReason: t("finance.cash.validation.cancelReason") }));
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
      setMessage(uiMessage("finance.cash.success.openingCancelled"));
      await loadWorkspace();
    } catch (caught) {
      console.error("CANCEL OPENING BALANCE DRAFT FAILED", caught);
      setError(financeCashError(caught, uiMessage("finance.cash.error.openingCancel")));
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
    const next: Record<string, UiMessage | string> = {};
    if (!cashForm.date) next.date = uiMessage("finance.cash.validation.date");
    if (!cashForm.bankAccountId) next.bankAccount = uiMessage("finance.cash.validation.account");
    if (!cashForm.amount.trim() || !isValidMoney(cashForm.amount, false)) next.amount = uiMessage("finance.cash.validation.amount");
    if (!cashForm.transactionType) next.transactionType = uiMessage("finance.cash.validation.type");
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
      setMessage(uiMessage("finance.cash.success.cashSaved"));
      await loadWorkspace();
    } catch (caught) {
      console.error("SAVE CASH TRANSACTION DRAFT FAILED", caught);
      setError(financeCashError(caught, uiMessage("finance.cash.error.cashSave")));
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
    const next: Record<string, UiMessage | string> = {};
    if (!cashDraftId) next.confirm = uiMessage("finance.cash.validation.saveCashFirst");
    if (cashDirty) next.confirm = uiMessage("finance.cash.validation.unsaved");
    if (!selectedCashAccount?.is_initialized) next.confirm = uiMessage("finance.cash.validation.openingRequired");
    else if (!cashAfterCutover) next.date = uiMessage("finance.cash.validation.afterCutoff");
    setCashErrors(next);
    if (cashActionLockRef.current || Object.keys(next).length || !permissions.canConfirmFinanceCashTransactions) return;
    cashActionLockRef.current = true;
    setCashSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc("confirm_finance_cash_transaction", { p_cash_transaction_id: cashDraftId });
      if (rpcError) throw rpcError;
      setCashPanelOpen(false);
      setMessage(uiMessage("finance.cash.success.cashConfirmed"));
      await loadWorkspace();
    } catch (caught) {
      console.error("CONFIRM CASH TRANSACTION FAILED", caught);
      setError(financeCashError(caught, uiMessage("finance.cash.error.cashConfirm")));
    } finally {
      cashActionLockRef.current = false;
      setCashSaving(false);
    }
  };

  const cancelCashDraft = async () => {
    if (cashActionLockRef.current) return;
    if (!cashDraftId || !cashCancelReason.trim()) {
      setCashErrors((current) => ({ ...current, cancelReason: t("finance.cash.validation.cancelReason") }));
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
      setMessage(uiMessage("finance.cash.success.cashCancelled"));
      await loadWorkspace();
    } catch (caught) {
      console.error("CANCEL CASH TRANSACTION DRAFT FAILED", caught);
      setError(financeCashError(caught, uiMessage("finance.cash.error.cashCancel")));
    } finally {
      cashActionLockRef.current = false;
      setCashSaving(false);
    }
  };

  if (loadingProfile) return <AuthGuard><main className={styles.page}><div className={styles.notice}>{t("finance.cash.access.checking")}</div></main></AuthGuard>;

  return (
    <AuthGuard>
      <AppTopNav title={t("finance.cash.title.finance")} activePage="finance" />
      <main className={styles.page}>
        <FinanceSubNav activePage="cash-transactions" permissions={permissions} />
        {!permissions.canViewFinanceCashTransactions ? <div className={styles.error}>{t("finance.cash.access.denied")}</div> : null}
        {permissions.canViewFinanceCashTransactions ? <>
          {error ? <div className={styles.error} role="alert">{text(error)}</div> : null}
          {message ? <div className={styles.success} role="status">{text(message)}</div> : null}

          <header className={styles.workspaceHeader}>
            <div>
              <span className={styles.eyebrow}>{t("finance.cash.title.newSystem")}</span>
              <h1>{t("finance.cash.title.transactions")}</h1>
              <p>{t("finance.cash.title.help")}</p>
            </div>
            <button className={`${styles.secondaryButton} ${styles.headerAction}`} type="button" disabled={!permissions.canManageFinanceCashTransactions || initializedAccounts.length === 0} onClick={openNewCashPanel}>
              <ActionIcon name="add" />{t("finance.cash.actions.recordOther")}</button>
          </header>

          <div className={styles.cutoverNotice}>
            <ActionIcon name="info" />
            <div><strong>{t("finance.cash.legacy.title")}</strong><span>{t("finance.cash.legacy.help")}</span></div>
            {permissions.canViewCompanyLedger ? <Link href="/finance/ledger">{t("finance.cash.legacy.open")}</Link> : null}
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><div><h2>{t("finance.cash.accounts.title")}</h2><p>{t("finance.cash.accounts.help")}</p></div></div>
            {loading ? <div className={styles.notice}>{t("finance.cash.accounts.loading")}</div> : null}
            <div className={styles.accountGrid}>
              {balances.map((account) => {
                const actor = userLabel(account.opening_balance_confirmed_by_user_id, userLabels);
                const draft = openingBalances.find((item) => item.bank_account_id === account.bank_account_id && item.status === "draft");
                return <article className={styles.accountCard} key={`${account.bank_account_id}-${account.currency}`}>
                  <div className={styles.accountIdentity}>
                    <div><strong>{account.short_name || t("finance.cash.accounts.company")}</strong><span>{account.bank_name || t("finance.cash.accounts.noBank")}</span><small>{account.account_number || t("finance.cash.accounts.noNumber")}</small></div>
                    <span className={account.is_active ? styles.activeBadge : styles.inactiveBadge}>{account.is_active ? t("finance.cash.accounts.active") : t("finance.cash.accounts.inactive")}</span>
                  </div>
                  {account.is_initialized ? <>
                    <div className={styles.balanceValue}><span>{t("finance.cash.accounts.balance")}</span><strong>{money(account.current_balance, account.currency)}</strong></div>
                    <dl className={styles.metrics}>
                      <Metric label={t("finance.cash.accounts.opening")} value={money(account.opening_balance_amount, account.currency)} />
                      <Metric label={t("finance.cash.accounts.cutoff")} value={thaiDate(account.opening_balance_as_of, locale)} />
                      <Metric label={t("finance.cash.accounts.inflow")} value={money(account.confirmed_inflow_after_opening, account.currency)} />
                      <Metric label={t("finance.cash.accounts.outflow")} value={money(account.confirmed_outflow_after_opening, account.currency)} />
                    </dl>
                    <p className={styles.confirmedMeta}>{t(actor ? "finance.cash.accounts.confirmedBy" : "finance.cash.accounts.confirmedAt", { date: thaiDateTime(account.opening_balance_confirmed_at, locale), name: actor })}</p>
                  </> : <div className={styles.uninitializedState}><strong>{t("finance.cash.accounts.notInitialized")}</strong><span>{t("finance.cash.accounts.notInitializedHelp")}</span></div>}
                  {draft ? <div className={styles.draftNote}>{t("finance.cash.accounts.hasDraft")}</div> : null}
                  {permissions.canManageFinanceCashTransactions && account.is_active ? <button className={styles.secondaryButton} type="button" onClick={() => openOpeningPanel(account)}>{account.is_initialized ? t("finance.cash.actions.replacement") : draft ? t("finance.cash.actions.continueOpening") : t("finance.cash.actions.setOpening")}</button> : null}
                </article>;
              })}
            </div>
          </section>

          {openingAccountId ? <section ref={openingPanelRef} className={`${styles.section} ${styles.editorSection}`}>
            <div className={styles.editorHeader}><div><span className={styles.eyebrow}>{t("finance.cash.opening.title")}</span><h2>{openingPriorId ? t("finance.cash.opening.replacementTitle") : t("finance.cash.actions.setOpening")}</h2><p>{t("finance.cash.opening.help")}</p></div><button className={styles.iconButton} type="button" aria-label={t("finance.cash.opening.close")} onClick={closeOpeningPanel}>×</button></div>
            <div className={styles.accountContext}><strong>{bankLabel(openingAccountId, balances, locale)}</strong><span>{t("finance.cash.fields.currency")}</span></div>
            <div className={styles.formGrid}>
              <FormField label={t("finance.cash.opening.date")} helper={t("finance.cash.opening.dateHelp")} error={text(openingErrors.date)}><input type="date" value={openingForm.date} onChange={(event) => { setOpeningForm({ ...openingForm, date: event.target.value }); clearField(setOpeningErrors, "date"); }} /></FormField>
              <FormField label={t("finance.cash.opening.amount")} helper={t("finance.cash.opening.amountHelp")} error={text(openingErrors.amount)}><input inputMode="decimal" value={openingForm.amount} onChange={(event) => { setOpeningForm({ ...openingForm, amount: event.target.value }); clearField(setOpeningErrors, "amount"); }} placeholder="0.00" /></FormField>
              <FormField label={t("finance.cash.fields.evidence")} helper={t("finance.cash.opening.evidenceHelp")}><input value={openingForm.evidenceReference} onChange={(event) => setOpeningForm({ ...openingForm, evidenceReference: event.target.value })} /></FormField>
              <FormField label={t("finance.cash.fields.note")} helper={t("finance.cash.fields.optional")}><textarea rows={3} value={openingForm.note} onChange={(event) => setOpeningForm({ ...openingForm, note: event.target.value })} /></FormField>
            </div>
            <div className={styles.saveRow}><span className={openingDirty ? styles.unsavedState : styles.savedState}>{openingDirty ? t("finance.cash.state.unsaved") : openingDraftId ? t("finance.cash.state.draftSaved") : t("finance.cash.state.notCreated")}</span><button className={styles.secondaryButton} type="button" disabled={openingSaving || !openingDirty} onClick={() => void saveOpeningDraft()}>{openingSaving ? t("finance.cash.state.saving") : t("finance.cash.actions.saveDraft")}</button></div>
            <div className={styles.confirmZone}>
              <div><h3>{t("finance.cash.opening.review")}</h3><p>{t("finance.cash.opening.reviewHelp")}</p></div>
              {openingErrors.confirm ? <p className={styles.fieldError}>{text(openingErrors.confirm)}</p> : null}
              <label className={openingErrors.acknowledgement ? styles.invalidCheck : styles.checkLabel}><input type="checkbox" checked={openingAcknowledged} onChange={(event) => { setOpeningAcknowledged(event.target.checked); clearField(setOpeningErrors, "acknowledgement"); }} /><span>{t("finance.cash.opening.acknowledge")}</span></label>
              {openingErrors.acknowledgement ? <p className={styles.fieldError}>{text(openingErrors.acknowledgement)}</p> : null}
              <button className={styles.primaryButton} type="button" disabled={openingSaving || !permissions.canConfirmFinanceCashTransactions || !openingDraftId || openingDirty} onClick={() => void confirmOpening()}>{t("finance.cash.actions.confirmOpening")}</button>
              {!permissions.canConfirmFinanceCashTransactions ? <p className={styles.permissionNote}>{t("finance.cash.opening.noConfirmPermission")}</p> : null}
            </div>
            {openingDraftId ? <div className={styles.otherActions}><strong>{t("finance.cash.actions.other")}</strong><div className={styles.cancelGrid}><input value={openingCancelReason} onChange={(event) => { setOpeningCancelReason(event.target.value); clearField(setOpeningErrors, "cancelReason"); }} placeholder={t("finance.cash.fields.cancelReason")} /><button className={styles.dangerButton} type="button" disabled={openingSaving} onClick={() => void cancelOpeningDraft()}>{t("finance.cash.actions.cancelDraft")}</button></div>{openingErrors.cancelReason ? <p className={styles.fieldError}>{text(openingErrors.cancelReason)}</p> : null}</div> : null}
          </section> : null}

          {cashPanelOpen ? <section ref={cashPanelRef} className={`${styles.section} ${styles.editorSection}`}>
            <div className={styles.editorHeader}><div><span className={styles.eyebrow}>{t("finance.cash.cash.title")}</span><h2>{cashDraftId ? t("finance.cash.cash.edit") : t("finance.cash.actions.recordOther")}</h2><p>{t("finance.cash.cash.help")}</p></div><button className={styles.iconButton} type="button" aria-label={t("finance.cash.cash.close")} onClick={() => setCashPanelOpen(false)}>×</button></div>
            <div className={styles.segmented} aria-label={t("finance.cash.fields.direction")}><button type="button" className={cashForm.direction === "inflow" ? styles.segmentActive : ""} onClick={() => updateCashDirection("inflow")}>{t("finance.cash.direction.inflow")}</button><button type="button" className={cashForm.direction === "outflow" ? styles.segmentActive : ""} onClick={() => updateCashDirection("outflow")}>{t("finance.cash.direction.outflow")}</button></div>
            <div className={styles.formGrid}>
              <FormField label={t("finance.cash.fields.date")} error={text(cashErrors.date)}><input type="date" value={cashForm.date} onChange={(event) => { setCashForm({ ...cashForm, date: event.target.value }); clearField(setCashErrors, "date"); }} /></FormField>
              <FormField label={t("finance.cash.fields.account")} error={text(cashErrors.bankAccount)}><select value={cashForm.bankAccountId} onChange={(event) => { setCashForm({ ...cashForm, bankAccountId: event.target.value }); clearField(setCashErrors, "bankAccount"); }}>{balances.filter((item) => item.is_active).map((item) => <option key={item.bank_account_id} value={item.bank_account_id}>{bankLabel(item.bank_account_id, balances, locale)}</option>)}</select></FormField>
              <FormField label={t("finance.cash.fields.type")} error={text(cashErrors.transactionType)}><select value={cashForm.transactionType} onChange={(event) => setCashForm({ ...cashForm, transactionType: event.target.value })}>{cashTypeOptions(cashForm.direction, locale).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FormField>
              <FormField label={t("finance.cash.fields.businessAmount")} error={text(cashErrors.amount)}><input inputMode="decimal" value={cashForm.amount} onChange={(event) => { setCashForm({ ...cashForm, amount: event.target.value }); clearField(setCashErrors, "amount"); }} placeholder="0.00" /></FormField>
              <FormField label={t("finance.cash.fields.reference")} helper={t("finance.cash.fields.optional")}><input value={cashForm.referenceNo} onChange={(event) => setCashForm({ ...cashForm, referenceNo: event.target.value })} /></FormField>
              <FormField label={t("finance.cash.fields.description")} helper={t("finance.cash.fields.optional")}><input value={cashForm.description} onChange={(event) => setCashForm({ ...cashForm, description: event.target.value })} /></FormField>
              <FormField label={t("finance.cash.fields.note")} helper={t("finance.cash.fields.optional")}><textarea rows={3} value={cashForm.note} onChange={(event) => setCashForm({ ...cashForm, note: event.target.value })} /></FormField>
            </div>
            {!selectedCashAccount?.is_initialized ? <div className={styles.blockedNotice}>{t("finance.cash.validation.openingRequired")}</div> : !cashAfterCutover && cashForm.date ? <div className={styles.blockedNotice}>{t("finance.cash.validation.afterCutoff")}</div> : null}
            <div className={styles.saveRow}><span className={cashDirty ? styles.unsavedState : styles.savedState}>{cashDirty ? t("finance.cash.state.unsaved") : cashDraftId ? t("finance.cash.state.draftSaved") : t("finance.cash.state.notCreated")}</span><button className={styles.secondaryButton} type="button" disabled={cashSaving || !cashDirty} onClick={() => void saveCashDraft()}>{cashSaving ? t("finance.cash.state.saving") : t("finance.cash.actions.saveDraft")}</button></div>
            <div className={styles.confirmZone}><div><h3>{t("finance.cash.cash.review")}</h3><p>{t("finance.cash.cash.reviewHelp")}</p></div>{cashErrors.confirm ? <p className={styles.fieldError}>{text(cashErrors.confirm)}</p> : null}<button className={styles.primaryButton} type="button" disabled={cashSaving || !permissions.canConfirmFinanceCashTransactions || !cashDraftId || cashDirty || !selectedCashAccount?.is_initialized || !cashAfterCutover} onClick={() => void confirmCashDraft()}>{t("finance.cash.actions.confirmCash")}</button>{!permissions.canConfirmFinanceCashTransactions ? <p className={styles.permissionNote}>{t("finance.cash.cash.noConfirmPermission")}</p> : null}</div>
            {cashDraftId ? <div className={styles.otherActions}><strong>{t("finance.cash.actions.other")}</strong><div className={styles.cancelGrid}><input value={cashCancelReason} onChange={(event) => { setCashCancelReason(event.target.value); clearField(setCashErrors, "cancelReason"); }} placeholder={t("finance.cash.fields.cancelReason")} /><button className={styles.dangerButton} type="button" disabled={cashSaving} onClick={() => void cancelCashDraft()}>{t("finance.cash.actions.cancelDraft")}</button></div>{cashErrors.cancelReason ? <p className={styles.fieldError}>{text(cashErrors.cancelReason)}</p> : null}</div> : null}
          </section> : null}

          <section className={styles.section}>
            <div className={styles.sectionHeading}><div><h2>{t("finance.cash.history.title")}</h2><p>{t("finance.cash.history.help")}</p></div><div className={styles.filters}><select aria-label={t("finance.cash.filter.account")} value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">{t("finance.cash.filter.allAccounts")}</option>{balances.map((item) => <option key={item.bank_account_id} value={item.bank_account_id}>{item.short_name || item.bank_name}</option>)}</select><select aria-label={t("finance.cash.filter.status")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">{t("finance.cash.filter.allStatuses")}</option><option value="draft">{t("finance.cash.status.draft")}</option><option value="confirmed">{t("finance.cash.status.confirmed")}</option><option value="cancelled">{t("finance.cash.status.cancelled")}</option></select></div></div>
            <div className={styles.tableWrap}><table><thead><tr><th>{t("finance.cash.fields.date")}</th><th>{t("finance.cash.fields.transaction")}</th><th>{t("finance.cash.fields.account")}</th><th>{t("finance.cash.fields.description")}</th><th>{t("finance.cash.fields.status")}</th><th className={styles.amountColumn}>{t("finance.cash.fields.amount")}</th><th aria-label={t("finance.cash.fields.actions")} /></tr></thead><tbody>{filteredTransactions.map((item) => <tr key={item.id}><td>{thaiDate(item.occurred_at, locale)}</td><td><strong className={item.direction === "inflow" ? styles.inflow : styles.outflow}>{transactionTypeLabel(item, locale)}</strong>{item.reversal_of_transaction_id ? <small>{t("finance.cash.history.correction")}</small> : null}</td><td>{bankLabel(item.bank_account_id, balances, locale)}</td><td><span>{item.description || item.reference_no || "-"}</span>{item.source_payment_id ? <Link href={`/finance/payments/${item.source_payment_id}`}>{t("finance.cash.actions.openPayment")}{shortId(item.source_payment_id)}</Link> : null}</td><td><StatusBadge status={item.status} /></td><td className={styles.amountColumn}>{item.direction === "outflow" ? "-" : "+"}{money(item.cash_amount, item.currency)}</td><td>{item.status === "draft" && permissions.canManageFinanceCashTransactions && !item.source_payment_id && !item.reversal_of_transaction_id ? <button className={styles.tableButton} type="button" onClick={() => editCashDraft(item)}>{t("finance.cash.actions.openDraft")}</button> : null}</td></tr>)}{!filteredTransactions.length ? <tr><td colSpan={7} className={styles.emptyTable}>{t("finance.cash.history.empty")}</td></tr> : null}</tbody></table></div>
          </section>
        </> : null}
      </main>
    </AuthGuard>
  );
}

function FormField({ label, helper, error, children }: { label: string; helper?: string; error?: UiMessage | string; children: React.ReactNode }) {
  const { text } = useI18n();
  return <label className={`${styles.field} ${error ? styles.invalidField : ""}`}><span>{label}</span>{children}{helper ? <small>{helper}</small> : null}{error ? <em>{text(error)}</em> : null}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const label = status === "confirmed" ? t("finance.cash.status.confirmed") : status === "cancelled" ? t("finance.cash.status.cancelled") : t("finance.cash.status.draft");
  return <span className={`${styles.statusBadge} ${status === "confirmed" ? styles.statusConfirmed : status === "cancelled" ? styles.statusCancelled : styles.statusDraft}`}>{label}</span>;
}

function ActionIcon({ name }: { name: "add" | "info" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  return name === "add" ? <svg {...common}><path d="M12 5v14M5 12h14" /></svg> : <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
}

function cashTypeOptions(direction: "inflow" | "outflow", locale: UiLocale = "th") {
  return direction === "inflow"
    ? [{ value: "manual_inflow", label: translate(locale, "finance.cash.type.manual_inflow") }, { value: "other", label: translate(locale, "finance.cash.type.other_inflow") }]
    : [{ value: "manual_outflow", label: translate(locale, "finance.cash.type.manual_outflow") }, { value: "refund", label: translate(locale, "finance.cash.type.refund") }, { value: "tax_payment", label: translate(locale, "finance.cash.type.tax_payment") }, { value: "other", label: translate(locale, "finance.cash.type.other_outflow") }];
}

function transactionTypeLabel(item: CashTransaction, locale: UiLocale = "th") {
  if (item.transaction_type === "customer_payment") return translate(locale, "finance.cash.type.customer_payment");
  if (item.transaction_type === "manual_inflow") return translate(locale, "finance.cash.type.manual_inflow");
  if (item.transaction_type === "manual_outflow") return translate(locale, "finance.cash.type.manual_outflow");
  if (item.transaction_type === "refund") return translate(locale, "finance.cash.type.refund");
  if (item.transaction_type === "tax_payment") return translate(locale, "finance.cash.type.tax_payment");
  if (item.transaction_type === "reversal") return translate(locale, "finance.cash.type.reversal");
  return item.direction === "inflow" ? translate(locale, "finance.cash.type.other_inflow") : translate(locale, "finance.cash.type.other_outflow");
}

function financeCashError(value: unknown, fallback: UiMessage | string) {
  const message = typeof value === "object" && value && "message" in value ? String((value as { message?: unknown }).message || "") : String(value || "");
  if (message.includes("FINANCE_CASH_OPENING_BALANCE_ALREADY_CONFIRMED") || message.includes("FINANCE_CASH_OPENING_BALANCE_CONFLICT")) return uiMessage("finance.cash.error.openingConflict");
  if (message.includes("FINANCE_CASH_UNPOSTED_PAYMENT_AFTER_CUTOVER")) return uiMessage("finance.cash.error.unpostedPayment");
  if (message.includes("FINANCE_CASH_OPENING_BALANCE_END_OF_DAY_REQUIRED")) return uiMessage("finance.cash.error.dayEnd");
  if (message.includes("FINANCE_CASH_OPENING_BALANCE_REQUIRED")) return uiMessage("finance.cash.validation.openingRequired");
  if (message.includes("FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER")) return uiMessage("finance.cash.validation.afterCutoff");
  if (message.includes("active bank account")) return uiMessage("finance.cash.error.inactiveAccount");
  if (message.includes("Not allowed")) return uiMessage("finance.cash.error.permission");
  if (message.includes("Only a Draft")) return uiMessage("finance.cash.error.notDraft");
  return fallback;
}

function clearField(setter: React.Dispatch<React.SetStateAction<Record<string, UiMessage | string>>>, field: string) {
  setter((current) => ({ ...current, [field]: "" }));
}

function openingFingerprint(form: OpeningForm) { return JSON.stringify(form); }
function cashFingerprint(form: CashForm) { return JSON.stringify(form); }
function isValidMoney(value: string, allowZero: boolean) { const normalized = value.trim(); if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return false; return allowZero ? Number.isFinite(Number(normalized)) : Number(normalized) > 0; }
function bangkokCompletedDayEnd(date: string) { return `${date}T23:59:59.999999+07:00`; }
function bangkokCashTimestamp(date: string) { return `${date}T12:00:00+07:00`; }
function bangkokToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function bangkokDateKey(value: string) { const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)); const get = (type: string) => parts.find((part) => part.type === type)?.value || ""; return `${get("year")}-${get("month")}-${get("day")}`; }
function thaiDate(value: string | null, locale: UiLocale) { return uiDate(value, locale); }
function thaiDateTime(value: string | null, locale: UiLocale) { return uiDate(value, locale, true); }
function money(value: number | string | null, currency = "THB") { if (value == null) return "-"; return `${new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} ${currency}`; }
function bankLabel(id: string, balances: BalanceSummary[], locale: UiLocale = "th") { const account = balances.find((item) => item.bank_account_id === id); return account ? `${account.short_name || account.bank_name || translate(locale, "finance.cash.accounts.company")}${account.account_number ? ` · ${account.account_number}` : ""}` : translate(locale, "finance.cash.accounts.company"); }
function userLabel(id: string | null, users: UserLabel[]) { if (!id) return ""; const user = users.find((item) => item.id === id); return user?.staff_name || user?.full_name || user?.email || ""; }
function shortId(id: string) { return id.slice(0, 8).toUpperCase(); }
