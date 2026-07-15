"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { createAuditLog } from "../../../lib/auditLog";
import {
  AUTHORIZED_SIGNERS,
  DEFAULT_AUTHORIZED_SIGNER,
  type AuthorizedSigner,
  type CompanyProfile,
  type DbAuthorizedSigner,
  type DbCompanyProfile,
  formatSignerPosition,
  getDefaultSigner,
  getSignerByKey,
  normalizeAuthorizedSigner,
  normalizeCompanyProfile,
} from "../../../lib/companyProfile";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissions, UserRole } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";

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
};

export type QuotationStatus = "draft" | "sent" | "accepted" | "cancelled";

export type QuotationRow = {
  id: string;
  quotation_no: string;
  client_id: string;
  case_id: number | null;
  advisory_matter_id: string | null;
  issue_date: string;
  valid_until: string | null;
  status: QuotationStatus | string;
  subtotal_vatable: number | string | null;
  subtotal_non_vatable: number | string | null;
  vat_amount: number | string | null;
  grand_total: number | string | null;
  scope_of_legal_services: string | null;
  included_services: string | null;
  excluded_services: string | null;
  authorized_signer_key: string | null;
  authorized_signer_name: string | null;
  authorized_signer_position: string | null;
  authorized_signer_email: string | null;
  note: string | null;
  internal_note: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  updated_by_user_id: string | null;
  updated_by_email: string | null;
  updated_by_name: string | null;
  sent_at: string | null;
  sent_by_user_id: string | null;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
  client_snapshot_json?: Record<string, unknown> | null;
  matter_snapshot_json?: Record<string, unknown> | null;
  document_data_snapshot_json?: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type QuotationItemRow = {
  id?: string;
  quotation_id?: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  amount_before_tax: number | string;
  vat_applicable: boolean;
  vat_rate: number | string;
  vat_amount: number | string;
  line_total: number | string;
  sort_order: number;
};

type PaymentMethodType = "single" | "installments" | "milestone" | "recurring" | "manual";
type PaymentCalculationType = "percentage" | "fixed_amount";
type PaymentTriggerType = "quotation_acceptance" | "agreement_effective" | "date" | "case_milestone" | "recurring_period" | "manual";
type PaymentAllocation = {
  quotation_item_id: string;
  allocated_amount_before_tax: number;
  allocated_vat_amount: number;
  allocated_total: number;
};
type PaymentInstallment = {
  installment_no: number;
  title: string;
  calculation_type: PaymentCalculationType;
  percentage: string;
  trigger_type: PaymentTriggerType;
  trigger_description: string;
  due_date: string;
  payment_due_days: string;
  client_note: string;
  items: PaymentAllocation[];
};
type PaymentTermsRow = { id: string; payment_method_type: PaymentMethodType; client_summary: string | null };
type PaymentInstallmentRow = Omit<PaymentInstallment, "percentage" | "payment_due_days" | "items"> & { id: string; percentage: number | string | null; payment_due_days: number | string };
type PaymentAllocationRow = { payment_installment_id: string; quotation_item_id: string; allocated_amount_before_tax: number | string; allocated_vat_amount: number | string; allocated_total: number | string };
type PaymentTermsSnapshot = { ready: boolean; saved: string; current: string };
type PendingNavigation = { href: string; label: string };
type SaveAllResult =
  | { ok: true }
  | { ok: false; stage: "quotation" | "payment_terms" | "refetch"; message: string };

type ClientRow = { id: string; name: string | null; tax_id?: string | null; email?: string | null; phone?: string | null; address?: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };

type QuotationAccess = {
  userId: string;
  userEmail: string;
  userName: string;
  profile: Profile | null;
  permissions: UserPermissions;
};

type LookupState = {
  clients: ClientRow[];
  cases: CaseRow[];
  matters: MatterRow[];
  signers: AuthorizedSigner[];
  companyProfile: CompanyProfile;
};

type FormState = {
  client_id: string;
  case_id: string;
  advisory_matter_id: string;
  issue_date: string;
  valid_until: string;
  scope_of_legal_services: string;
  included_services: string;
  excluded_services: string;
  authorized_signer_key: string;
  note: string;
  internal_note: string;
};

const emptyForm: FormState = {
  client_id: "",
  case_id: "",
  advisory_matter_id: "",
  issue_date: getDateKey(new Date()),
  valid_until: "",
  scope_of_legal_services: "",
  included_services: "",
  excluded_services: "",
  authorized_signer_key: DEFAULT_AUTHORIZED_SIGNER.key,
  note: "",
  internal_note: "",
};

const emptyItem: QuotationItemRow = {
  description: "",
  quantity: "1",
  unit_price: "",
  amount_before_tax: 0,
  vat_applicable: true,
  vat_rate: 7,
  vat_amount: 0,
  line_total: 0,
  sort_order: 0,
};

function normalizedQuotationDraftSnapshot(form: FormState, items: QuotationItemRow[]) {
  return JSON.stringify({
    form: {
      ...form,
      client_id: form.client_id.trim(),
      case_id: form.case_id.trim(),
      advisory_matter_id: form.advisory_matter_id.trim(),
      scope_of_legal_services: form.scope_of_legal_services.trim(),
      included_services: form.included_services.trim(),
      excluded_services: form.excluded_services.trim(),
      note: form.note.trim(),
      internal_note: form.internal_note.trim(),
    },
    items: items.map((item, index) => {
      const normalized = normalizeItem(item, index);
      return {
        description: normalized.description.trim(),
        quantity: toAmount(normalized.quantity),
        unit_price: toAmount(normalized.unit_price),
        vat_applicable: normalized.vat_applicable,
        vat_rate: toAmount(normalized.vat_rate),
        sort_order: index,
      };
    }),
  });
}

function normalizedPaymentTermsSnapshot(method: PaymentMethodType, summary: string, installments: PaymentInstallment[]) {
  return JSON.stringify({
    method,
    summary: summary.trim(),
    installments: installments.map((installment, index) => ({
      installment_no: index + 1,
      title: installment.title.trim(),
      calculation_type: installment.calculation_type,
      percentage: installment.calculation_type === "percentage" ? normalizePercentage(installment.percentage) : null,
      trigger_type: installment.trigger_type,
      trigger_description: installment.trigger_description.trim(),
      due_date: installment.due_date,
      payment_due_days: normalizePaymentDueDays(installment.payment_due_days),
      client_note: installment.client_note.trim(),
      // Percentage allocations are generated by the server and are not user-editable.
      items: installment.calculation_type === "fixed_amount" ? installment.items.map((item) => ({
        quotation_item_id: item.quotation_item_id,
        allocated_amount_before_tax: toAmount(item.allocated_amount_before_tax),
        allocated_vat_amount: toAmount(item.allocated_vat_amount),
        allocated_total: toAmount(item.allocated_total),
      })) : [],
    })),
  });
}

function normalizePercentage(value: number | string) {
  return Math.round((toAmount(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function normalizePaymentDueDays(value: number | string) {
  return Math.max(0, Math.floor(toAmount(value)));
}

const paymentDueDayPresets = [3, 7, 15, 30];
const percentagePresets = [50, 25, 20];
const isPresetValue = (value: number | string, presets: number[]) => presets.includes(toAmount(value));

const profileSelect = [
  "role",
  "financial_access",
  "full_name",
  "staff_name",
  "can_view_company_ledger",
  "can_submit_expense_claim",
  "can_view_own_expense_claims",
  "can_view_all_expense_claims",
  "can_view_lawyer_compensation",
].join(", ");

export function QuotationGuard({ children }: { children: (access: QuotationAccess) => ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<QuotationAccess | null>(null);

  useEffect(() => {
    const loadAccess = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setAccess(null);
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("user_profiles")
        .select(profileSelect)
        .eq("id", user.id)
        .single();
      const profile = (profileData || { role: "" }) as Profile;
      const permissions = buildPermissions(profile);

      setAccess({
        userId: user.id,
        userEmail: user.email || "",
        userName: profile.staff_name || profile.full_name || user.email || user.id,
        profile,
        permissions,
      });
      setLoading(false);
    };

    loadAccess();
  }, []);

  return (
    <AuthGuard>
      <AppTopNav title="Finance" subtitle="Quotations" activePage="finance" />
      <main style={pageStyle}>
        {loading ? <div style={cardStyle}>Loading quotations...</div> : null}
        {!loading && (!access || !access.permissions.canViewFinanceQuotations) ? (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>No access</h2>
            <p style={mutedTextStyle}>You do not have permission to view Finance Quotations.</p>
          </div>
        ) : null}
        {!loading && access?.permissions.canViewFinanceQuotations ? children(access) : null}
      </main>
    </AuthGuard>
  );
}

export function FinanceSubNav({ activePage, permissions }: { activePage: "quotations" | "fee-agreements" | "ledger" | "claims" | "compensation"; permissions: UserPermissions }) {
  return (
    <nav style={subNavStyle}>
      {permissions.canViewFinanceQuotations ? <Link href="/finance/quotations" style={activePage === "quotations" ? subNavActiveLinkStyle : subNavLinkStyle}>Quotations</Link> : null}
      {permissions.canViewFinanceQuotations ? <Link href="/finance/fee-agreements" style={activePage === "fee-agreements" ? subNavActiveLinkStyle : subNavLinkStyle}>Fee Agreements</Link> : null}
      {permissions.canViewCompanyLedger ? <Link href="/finance/ledger" style={activePage === "ledger" ? subNavActiveLinkStyle : subNavLinkStyle}>Ledger</Link> : null}
      {permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims ? <Link href="/finance/expense-claims" style={activePage === "claims" ? subNavActiveLinkStyle : subNavLinkStyle}>Expense Claims</Link> : null}
      {permissions.canViewLawyerCompensation ? <Link href="/finance/compensation" style={activePage === "compensation" ? subNavActiveLinkStyle : subNavLinkStyle}>Lawyer Compensation</Link> : null}
    </nav>
  );
}

export function QuotationList({ access }: { access: QuotationAccess }) {
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [lookups, setLookups] = useState<LookupState>(getEmptyLookups());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [quotationRes, lookupRes] = await Promise.all([
      supabase.from("finance_quotations").select("*").order("created_at", { ascending: false }),
      loadLookups(),
    ]);

    if (quotationRes.error) {
      alert("Unable to load quotations.");
      setLoading(false);
      return;
    }

    setQuotations((quotationRes.data || []) as QuotationRow[]);
    setLookups(lookupRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  return (
    <>
      <FinanceSubNav activePage="quotations" permissions={access.permissions} />
      <div style={sectionHeaderStyle}>
        <div>
          <h1 style={pageTitleStyle}>Finance Quotations</h1>
          <p style={mutedTextStyle}>Structured quotation records only. No ledger posting, invoice, receipt, or legacy conversion.</p>
        </div>
        {access.permissions.canCreateFinanceQuotation ? <Link href="/finance/quotations/new" style={primaryButtonStyle}>New Quotation</Link> : null}
      </div>

      <div style={cardStyle}>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Quotation No</th>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Linked Matter</th>
                <th style={thStyle}>Issue Date</th>
                <th style={thStyle}>Valid Until</th>
                <th style={thStyle}>Status</th>
                <th style={rightThStyle}>Quotation Total</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td style={tdStyle} colSpan={8}>Loading...</td></tr> : null}
              {!loading && quotations.length === 0 ? <tr><td style={tdStyle} colSpan={8}>No quotations yet.</td></tr> : null}
              {!loading && quotations.map((quotation) => (
                <tr key={quotation.id}>
                  <td style={tdStyle}><Link href={`/finance/quotations/${quotation.id}`} style={linkStyle}>{quotation.quotation_no}</Link></td>
                  <td style={tdStyle}>{renderClientName(quotation.client_id, lookups.clients)}</td>
                  <td style={tdStyle}>{renderMatterLink(quotation, lookups)}</td>
                  <td style={tdStyle}>{formatDate(quotation.issue_date)}</td>
                  <td style={tdStyle}>{formatDate(quotation.valid_until)}</td>
                  <td style={tdStyle}><StatusBadge status={quotation.status} /></td>
                  <td style={rightTdStyle}>{formatMoney(toAmount(quotation.grand_total))}</td>
                  <td style={tdStyle}>
                    <div style={actionGroupStyle}>
                      <Link href={`/finance/quotations/${quotation.id}`} style={smallButtonStyle}>View</Link>
                      {quotation.status === "draft" && access.permissions.canEditFinanceQuotation ? <Link href={`/finance/quotations/${quotation.id}/edit`} style={smallButtonStyle}>Edit</Link> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function QuotationForm({ access, quotationId }: { access: QuotationAccess; quotationId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(quotationId);
  const [lookups, setLookups] = useState<LookupState>(getEmptyLookups());
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [items, setItems] = useState<QuotationItemRow[]>([{ ...emptyItem }]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState<string | null>(null);
  const [paymentTermsSnapshot, setPaymentTermsSnapshot] = useState<PaymentTermsSnapshot>({ ready: !isEdit, saved: "", current: "" });
  const [paymentTermsValid, setPaymentTermsValid] = useState(true);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const paymentTermsSaveRef = useRef<null | (() => Promise<boolean>)>(null);

  const totals = useMemo(() => computeTotals(items), [items]);
  const canSave = isEdit ? access.permissions.canEditFinanceQuotation : access.permissions.canCreateFinanceQuotation;

  const loadFormData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    if (!quotationId) {
      const lookupData = await loadLookups();
      const nextForm = { ...emptyForm, authorized_signer_key: getDefaultSigner(lookupData.signers).key };
      setLookups(lookupData);
      setForm(nextForm);
      setItems([{ ...emptyItem }]);
      setSavedDraftSnapshot(normalizedQuotationDraftSnapshot(nextForm, [{ ...emptyItem }]));
      setLoading(false);
      return { ok: false, stage: "refetch", message: "Unable to load quotation form." } as SaveAllResult;
    }

    const quotationRes = await supabase.from("finance_quotations").select("*").eq("id", quotationId).maybeSingle();
    if (quotationRes.error || !quotationRes.data) {
      console.error("Failed to load quotation for edit", { quotationId, error: quotationRes.error });
      alert(quotationRes.error ? "Unable to load quotation." : "Quotation not found.");
      setLoading(false);
      return { ok: false, stage: "refetch", message: quotationRes.error ? "Unable to load quotation." : "Quotation not found." } as SaveAllResult;
    }

    const loadedQuotation = quotationRes.data as QuotationRow;
    const [itemRes, lookupData] = await Promise.all([
      supabase.from("finance_quotation_items").select("*").eq("quotation_id", quotationId).order("sort_order", { ascending: true }),
      loadLookups(loadedQuotation.authorized_signer_key),
    ]);
    if (itemRes.error) {
      console.warn("Failed to load quotation items for edit", { quotationId, error: itemRes.error });
    }

    const nextForm: FormState = {
      client_id: loadedQuotation.client_id || "",
      case_id: loadedQuotation.case_id ? String(loadedQuotation.case_id) : "",
      advisory_matter_id: loadedQuotation.advisory_matter_id || "",
      issue_date: loadedQuotation.issue_date || getDateKey(new Date()),
      valid_until: loadedQuotation.valid_until || "",
      scope_of_legal_services: loadedQuotation.scope_of_legal_services || "",
      included_services: loadedQuotation.included_services || "",
      excluded_services: loadedQuotation.excluded_services || "",
      authorized_signer_key: loadedQuotation.authorized_signer_key || getDefaultSigner(lookupData.signers).key,
      note: loadedQuotation.note || "",
      internal_note: loadedQuotation.internal_note || "",
    };
    const nextItems = ((itemRes.data || []) as QuotationItemRow[]).map((item, index) => ({
      ...item,
      quantity: String(item.quantity || 1),
      unit_price: String(item.unit_price || 0),
      vat_rate: String(item.vat_rate || 0),
      sort_order: index,
    }));
    setQuotation(loadedQuotation);
    setLookups(lookupData);
    setForm(nextForm);
    setItems(nextItems);
    setSavedDraftSnapshot(normalizedQuotationDraftSnapshot(nextForm, nextItems));
    setSaveMessage("");
    setLoading(false);
    return { ok: true } as SaveAllResult;
  }, [quotationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadFormData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFormData]);

  const currentDraftSnapshot = useMemo(() => normalizedQuotationDraftSnapshot(form, items), [form, items]);
  const isMainDirty = savedDraftSnapshot !== null && currentDraftSnapshot !== savedDraftSnapshot;
  const isPaymentTermsDirty = paymentTermsSnapshot.ready && paymentTermsSnapshot.current !== paymentTermsSnapshot.saved;
  const isDirty = isMainDirty || isPaymentTermsDirty;
  const saveDisabled = saving || (isEdit && !paymentTermsValid);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  const updateItem = (index: number, patch: Partial<QuotationItemRow>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? normalizeItem({ ...item, ...patch }, itemIndex) : item));
  };

  const removeItem = (index: number) => {
    setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => normalizeItem(item, itemIndex)));
  };

  const saveDraft = async () => {
    if (saving) return { ok: false, stage: "quotation", message: "A save is already in progress." } as SaveAllResult;
    if (!canSave) {
      alert("You do not have permission to save quotations.");
      return { ok: false, stage: "quotation", message: "You do not have permission to save quotations." } as SaveAllResult;
    }
    if (isEdit && quotation?.status !== "draft") {
      alert("Only draft quotations can be edited.");
      return { ok: false, stage: "quotation", message: "Only draft quotations can be edited." } as SaveAllResult;
    }

    const validationError = validateForm(form, items);
    if (validationError) {
      alert(validationError);
      return { ok: false, stage: "quotation", message: validationError } as SaveAllResult;
    }

    setSaving(true);
    const normalizedItems = items.map((item, index) => normalizeItem(item, index));
    const currentTotals = computeTotals(normalizedItems);
    const quotationNo = quotation?.quotation_no || "";
    const selectedSigner = getSignerByKey(lookups.signers, form.authorized_signer_key);
    const signerPosition = formatSignerPosition(selectedSigner);
    const snapshots = buildQuotationSnapshots(form, normalizedItems, currentTotals, lookups, quotationNo);
    const quotationPayload = {
      client_id: form.client_id,
      case_id: form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.advisory_matter_id || null,
      issue_date: form.issue_date,
      valid_until: form.valid_until || null,
      status: "draft" as const,
      subtotal_vatable: currentTotals.subtotalVatable,
      subtotal_non_vatable: currentTotals.subtotalNonVatable,
      vat_amount: currentTotals.vatAmount,
      grand_total: currentTotals.grandTotal,
      scope_of_legal_services: form.scope_of_legal_services.trim() || null,
      included_services: form.included_services.trim() || null,
      excluded_services: form.excluded_services.trim() || null,
      authorized_signer_key: selectedSigner.key,
      authorized_signer_name: selectedSigner.displayName,
      authorized_signer_position: signerPosition,
      authorized_signer_email: selectedSigner.email,
      note: form.note.trim() || null,
      internal_note: form.internal_note.trim() || null,
      client_snapshot_json: snapshots.clientSnapshot,
      matter_snapshot_json: snapshots.matterSnapshot,
      document_data_snapshot_json: snapshots.documentSnapshot,
      updated_by_user_id: access.userId,
      updated_by_email: access.userEmail,
      updated_by_name: access.userName,
      updated_at: new Date().toISOString(),
    };

    if (isEdit && quotationId) {
      const draftSavePayload = {
        p_quotation_id: quotationId,
        p_client_id: quotationPayload.client_id,
        p_case_id: quotationPayload.case_id,
        p_advisory_matter_id: quotationPayload.advisory_matter_id,
        p_issue_date: quotationPayload.issue_date,
        p_valid_until: quotationPayload.valid_until,
        p_scope_of_legal_services: form.scope_of_legal_services,
        p_included_services: form.included_services,
        p_excluded_services: form.excluded_services,
        p_note: form.note,
        p_internal_note: form.internal_note,
        p_authorized_signer_key: quotationPayload.authorized_signer_key,
        p_authorized_signer_name: quotationPayload.authorized_signer_name,
        p_authorized_signer_position: quotationPayload.authorized_signer_position,
        p_authorized_signer_email: quotationPayload.authorized_signer_email,
        p_subtotal_vatable: quotationPayload.subtotal_vatable,
        p_subtotal_non_vatable: quotationPayload.subtotal_non_vatable,
        p_vat_amount: quotationPayload.vat_amount,
        p_grand_total: quotationPayload.grand_total,
        p_client_snapshot_json: quotationPayload.client_snapshot_json,
        p_matter_snapshot_json: quotationPayload.matter_snapshot_json,
        p_document_data_snapshot_json: quotationPayload.document_data_snapshot_json,
        p_updated_by_user_id: access.userId,
        p_updated_by_email: access.userEmail,
        p_updated_by_name: access.userName,
        p_items: buildItemPayload(quotationId, normalizedItems),
      };
      const invalidPayloadMessage = validateDraftSavePayload(draftSavePayload, currentTotals);
      if (invalidPayloadMessage) {
        console.error("Quotation save validation failed", { rpc: "save_finance_quotation_draft", payload: draftSavePayload, validation: invalidPayloadMessage });
        alert("ข้อมูลใบเสนอราคายังไม่ครบถ้วน กรุณาตรวจสอบรายการที่ระบุ");
        setSaving(false);
        return { ok: false, stage: "quotation", message: invalidPayloadMessage } as SaveAllResult;
      }

      let { error: updateError } = await supabase.rpc("save_finance_quotation_draft", draftSavePayload);
      // A production database that has not yet exposed the newer optional fields can
      // still save legacy drafts only when no included/excluded text would be lost.
      if (updateError && isDraftSaveFunctionResolutionError(updateError) && !form.included_services.trim() && !form.excluded_services.trim()) {
        const { p_included_services, p_excluded_services, ...legacyDraftSavePayload } = draftSavePayload;
        void p_included_services;
        void p_excluded_services;
        console.warn("Retrying quotation save with the legacy draft RPC signature", { rpc: "save_finance_quotation_draft", quotationId, code: updateError.code, message: updateError.message });
        ({ error: updateError } = await supabase.rpc("save_finance_quotation_draft", legacyDraftSavePayload));
      }
      if (updateError) {
        console.error("Quotation save failed", {
          rpc: "save_finance_quotation_draft",
          payload: draftSavePayload,
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          status: (updateError as typeof updateError & { status?: number }).status,
        });
        alert("บันทึกข้อมูลใบเสนอราคาไม่สำเร็จ");
        setSaving(false);
        return { ok: false, stage: "quotation", message: "บันทึกข้อมูลใบเสนอราคาไม่สำเร็จ" } as SaveAllResult;
      }

      await createAuditLog({
        tableName: "finance_quotations",
        recordId: quotationId,
        caseId: form.case_id ? Number(form.case_id) : null,
        action: "update",
        note: `Updated quotation ${quotation?.quotation_no || quotationId}; grand total ${formatMoney(toAmount(quotation?.grand_total))} -> ${formatMoney(currentTotals.grandTotal)}`,
      });
      await createAuditLog({
        tableName: "finance_quotation_items",
        recordId: quotationId,
        caseId: form.case_id ? Number(form.case_id) : null,
        action: "update",
        note: `Replaced quotation line items for ${quotation?.quotation_no || quotationId}; item count ${normalizedItems.length}`,
      });
      const paymentTermsSaved = paymentTermsSaveRef.current ? await paymentTermsSaveRef.current() : true;
      if (!paymentTermsSaved) {
        setSaveMessage("บันทึกข้อมูลใบเสนอราคาแล้ว แต่บันทึกเงื่อนไขการชำระเงินไม่สำเร็จ");
        alert("บันทึกข้อมูลใบเสนอราคาแล้ว แต่บันทึกเงื่อนไขการชำระเงินไม่สำเร็จ");
        setSaving(false);
        return { ok: false, stage: "payment_terms", message: "บันทึกข้อมูลใบเสนอราคาแล้ว แต่บันทึกเงื่อนไขการชำระเงินไม่สำเร็จ" } as SaveAllResult;
      }
      const reloaded = await loadFormData(false);
      setSaving(false);
      if (!reloaded.ok) return reloaded;
      setSaveMessage("บันทึกร่างใบเสนอราคาเรียบร้อยแล้ว");
      return { ok: true } as SaveAllResult;
    }

    const { data: docNoData, error: docNoError } = await supabase.rpc("generate_finance_document_no", {
      p_doc_type: "QT",
      p_issue_date: form.issue_date,
    });
    if (docNoError || !docNoData) {
      alert("Unable to generate quotation number.");
      setSaving(false);
      return { ok: false, stage: "quotation", message: "Unable to generate quotation number." } as SaveAllResult;
    }
    const createSnapshots = buildQuotationSnapshots(form, normalizedItems, currentTotals, lookups, String(docNoData));

    const { data: insertedQuotation, error: insertError } = await supabase
      .from("finance_quotations")
      .insert({
        ...quotationPayload,
        quotation_no: String(docNoData),
        client_snapshot_json: createSnapshots.clientSnapshot,
        matter_snapshot_json: createSnapshots.matterSnapshot,
        document_data_snapshot_json: createSnapshots.documentSnapshot,
        created_by_user_id: access.userId,
        created_by_email: access.userEmail,
        created_by_name: access.userName,
      })
      .select("*")
      .single();
    if (insertError || !insertedQuotation) {
      alert("Unable to create quotation.");
      setSaving(false);
      return { ok: false, stage: "quotation", message: "Unable to create quotation." } as SaveAllResult;
    }

    const created = insertedQuotation as QuotationRow;
    const { error: itemError } = await supabase.from("finance_quotation_items").insert(buildItemPayload(created.id, normalizedItems));
    if (itemError) {
      alert("Quotation was created, but items could not be saved. Please review this draft before using it.");
      setSaving(false);
      return { ok: false, stage: "quotation", message: "Quotation was created, but items could not be saved." } as SaveAllResult;
    }

    await createAuditLog({
      tableName: "finance_quotations",
      recordId: created.id,
      caseId: form.case_id ? Number(form.case_id) : null,
      action: "create",
      note: `Created quotation ${created.quotation_no}; item count ${normalizedItems.length}; grand total ${formatMoney(currentTotals.grandTotal)}`,
    });
    router.push(`/finance/quotations/${created.id}`);
    return { ok: true } as SaveAllResult;
  };

  const requestNavigation = (href: string, label: string) => {
    if (!isDirty) {
      router.push(href);
      return;
    }
    setPendingNavigation({ href, label });
  };

  const saveAndContinue = async () => {
    if (!pendingNavigation) return;
    const destination = pendingNavigation;
    const saved = await saveDraft();
    if (saved.ok) {
      setPendingNavigation(null);
      router.push(destination.href);
      return;
    }
    setSaveMessage(saved.message);
    setPendingNavigation(null);
  };

  if (loading) {
    return (
      <>
        <FinanceSubNav activePage="quotations" permissions={access.permissions} />
        <div style={cardStyle}>Loading quotation form...</div>
      </>
    );
  }

  if (!canSave) {
    return (
      <>
        <FinanceSubNav activePage="quotations" permissions={access.permissions} />
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>No access</h2>
          <p style={mutedTextStyle}>You do not have permission to save quotations.</p>
        </div>
      </>
    );
  }

  if (isEdit && quotation && quotation.status !== "draft") {
    const readonlyMessage = getReadonlyMessage(quotation.status);
    return (
      <>
        <FinanceSubNav activePage="quotations" permissions={access.permissions} />
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Readonly quotation</h2>
          <p style={mutedTextStyle}>{readonlyMessage}</p>
          {quotation ? <Link href={`/finance/quotations/${quotation.id}`} style={primaryButtonStyle}>Back to quotation</Link> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <FinanceSubNav activePage="quotations" permissions={access.permissions} />
      <style>{quotationHeaderFormCss}</style>
      <div style={sectionHeaderStyle}>
        <div>
          <h1 style={pageTitleStyle}>{isEdit ? `Edit ${quotation?.quotation_no || "Quotation"}` : "New Quotation"}</h1>
          <p style={mutedTextStyle}>Create a standalone quotation. This does not create invoice, receipt, ledger, compensation, or legacy conversion records.</p>
        </div>
        <div style={actionGroupStyle}>
          <span style={isDirty ? unsavedIndicatorStyle : savedIndicatorStyle}>{isDirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก / Unsaved changes" : "บันทึกแล้ว / Saved"}</span>
          <button type="button" onClick={() => requestNavigation(isEdit && quotationId ? `/finance/quotations/${quotationId}` : "/finance/quotations", isEdit ? "กลับไปใบเสนอราคา / Back to Quotation" : "Back")} style={secondaryButtonStyle}>กลับไปใบเสนอราคา / Back to Quotation</button>
          {isEdit && quotationId ? <button type="button" onClick={() => requestNavigation(`/finance/quotations/${quotationId}/preview`, "ดูตัวอย่าง / Preview")} style={secondaryButtonStyle}>ดูตัวอย่าง / Preview</button> : null}
          {isEdit && quotationId ? <button type="button" onClick={() => requestNavigation(`/finance/quotations/${quotationId}/preview?print=1`, "พิมพ์ / Print")} style={secondaryButtonStyle}>พิมพ์ / Print</button> : null}
        </div>
      </div>

      <div style={cardStyle}>
        <div className="quotation-header-form-grid" style={formGridStyle}>
          <label style={labelStyle}>Client
            <select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} style={inputStyle}>
              <option value="">Select client</option>
              {lookups.clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Case (optional)
            <select value={form.case_id} onChange={(event) => setForm({ ...form, case_id: event.target.value, advisory_matter_id: "" })} style={inputStyle}>
              <option value="">No linked case</option>
              {lookups.cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Advisory Matter (optional)
            <select value={form.advisory_matter_id} onChange={(event) => setForm({ ...form, advisory_matter_id: event.target.value, case_id: "" })} style={inputStyle}>
              <option value="">No linked advisory matter</option>
              {lookups.matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Issue Date
            <input type="date" value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Valid Until
            <input type="date" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} style={inputStyle} />
          </label>
          <label className="quotation-authorized-signer-field" style={authorizedSignerLabelStyle}>ผู้ลงนามใบเสนอราคา / Authorized Signer
            <select value={form.authorized_signer_key} onChange={(event) => setForm({ ...form, authorized_signer_key: event.target.value })} style={authorizedSignerSelectStyle}>
              {lookups.signers.map((signer) => (
                <option key={signer.key} value={signer.key}>
                  {signer.displayName} — {formatSignerPosition(signer)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={formGridStyle}>
          <label style={wideLabelStyle}>ขอบเขตงาน / Scope of Legal Services
            <textarea
              value={form.scope_of_legal_services}
              onChange={(event) => setForm({ ...form, scope_of_legal_services: event.target.value })}
              style={textareaStyle}
              placeholder="ระบุขอบเขตงานบริการทางกฎหมายที่ใบเสนอราคานี้ครอบคลุม เช่น การให้คำปรึกษา การจัดทำเอกสาร การดำเนินคดี หรือการติดต่อหน่วยงานที่เกี่ยวข้อง"
            />
          </label>
          <label style={wideLabelStyle}>งานที่รวมอยู่ในค่าบริการ / Included Services
            <textarea
              value={form.included_services}
              onChange={(event) => setForm({ ...form, included_services: event.target.value })}
              style={textareaStyle}
              placeholder="ระบุงานหรือบริการที่รวมอยู่ในค่าบริการตามใบเสนอราคานี้"
            />
          </label>
          <label style={wideLabelStyle}>งานหรือค่าใช้จ่ายที่ไม่รวม / Excluded Services
            <textarea
              value={form.excluded_services}
              onChange={(event) => setForm({ ...form, excluded_services: event.target.value })}
              style={textareaStyle}
              placeholder="ระบุงาน ค่าใช้จ่าย หรือค่าธรรมเนียมที่ไม่รวมอยู่ในใบเสนอราคานี้"
            />
          </label>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>Line Items / Fee Items</h2>
          <button type="button" onClick={() => setItems((current) => [...current, normalizeItem({ ...emptyItem }, current.length)])} style={secondaryButtonStyle}>Add Item</button>
        </div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Description</th>
                <th style={rightThStyle}>Qty</th>
                <th style={rightThStyle}>Unit Price</th>
                <th style={thStyle}>VAT</th>
                <th style={rightThStyle}>Line Total</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const normalized = normalizeItem(item, index);
                return (
                  <tr key={index}>
                    <td style={tdStyle}><input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} style={inputStyle} placeholder="Service description" /></td>
                    <td style={rightTdStyle}><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} style={compactInputStyle} /></td>
                    <td style={rightTdStyle}><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: event.target.value })} style={compactInputStyle} /></td>
                    <td style={tdStyle}>
                      <label style={checkboxLabelStyle}><input type="checkbox" checked={item.vat_applicable} onChange={(event) => updateItem(index, { vat_applicable: event.target.checked, vat_rate: event.target.checked ? (item.vat_rate || 7) : 0 })} /> VAT</label>
                      {item.vat_applicable ? <input type="number" min="0" step="0.01" value={item.vat_rate} onChange={(event) => updateItem(index, { vat_rate: event.target.value })} style={vatInputStyle} /> : null}
                    </td>
                    <td style={rightTdStyle}>{formatMoney(toAmount(normalized.line_total))}</td>
                    <td style={tdStyle}><button type="button" onClick={() => removeItem(index)} style={dangerSmallButtonStyle} disabled={items.length === 1}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={totalsGridStyle}>
          <SummaryLine label="รวมรายการที่มี VAT / Vatable Subtotal" value={totals.subtotalVatable} />
          <SummaryLine label="รวมรายการที่ไม่มี VAT / Non-Vatable Subtotal" value={totals.subtotalNonVatable} />
          <SummaryLine label="ภาษีมูลค่าเพิ่ม / VAT" value={totals.vatAmount} />
          <SummaryLine label="จำนวนเงินตามใบเสนอราคา / Quotation Total" value={totals.grandTotal} strong />
        </div>
      </div>

      {isEdit && quotationId && quotation?.status === "draft" ? <PaymentTermsEditor quotationId={quotationId} quotationItems={items} onRegisterSave={(handler) => { paymentTermsSaveRef.current = handler; }} onSnapshotChange={setPaymentTermsSnapshot} onValidityChange={setPaymentTermsValid} /> : null}
      {!isEdit ? <p style={noticeTextStyle}>Payment Terms can be added after this quotation is first saved as a Draft.</p> : null}

      <div style={cardStyle}>
        <div style={formGridStyle}>
          <label style={wideLabelStyle}>Note
            <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} style={textareaStyle} />
          </label>
          <label style={wideLabelStyle}>Internal Note
            <textarea value={form.internal_note} onChange={(event) => setForm({ ...form, internal_note: event.target.value })} style={textareaStyle} />
          </label>
        </div>
        <div style={buttonRowStyle}>
          {saveMessage ? <span style={noticeTextStyle}>{saveMessage}</span> : null}
          <button type="button" onClick={() => { void saveDraft(); }} disabled={saveDisabled} style={primaryButtonStyle}>{saving ? "Saving..." : isEdit ? "บันทึกร่างทั้งหมด / Save All Draft Changes" : "Save Draft"}</button>
        </div>
      </div>
      {pendingNavigation ? <div style={dialogBackdropStyle} role="dialog" aria-modal="true" aria-labelledby="unsaved-changes-title">
        <div style={dialogStyle}>
          <h2 id="unsaved-changes-title" style={sectionTitleStyle}>มีการแก้ไขที่ยังไม่ได้บันทึก</h2>
          <p style={mutedTextStyle}>คุณต้องการบันทึกร่างทั้งหมดก่อน{pendingNavigation.label}หรือไม่</p>
          <div style={{ ...actionGroupStyle, justifyContent: "flex-end", marginTop: 18 }}>
            <button type="button" onClick={() => setPendingNavigation(null)} disabled={saving} style={secondaryButtonStyle}>ยกเลิก / Cancel</button>
            <button type="button" onClick={() => { const destination = pendingNavigation; setPendingNavigation(null); router.push(destination.href); }} disabled={saving} style={dangerButtonStyle}>ดำเนินการต่อโดยไม่บันทึก</button>
            <button type="button" onClick={() => { void saveAndContinue(); }} disabled={saveDisabled} style={primaryButtonStyle}>{saving ? "Saving..." : "บันทึกแล้วดำเนินการต่อ / Save and continue"}</button>
          </div>
        </div>
      </div> : null}
    </>
  );
}

function PaymentTermsEditor({ quotationId, quotationItems, onRegisterSave, onSnapshotChange, onValidityChange }: { quotationId: string; quotationItems: QuotationItemRow[]; onRegisterSave: (handler: (() => Promise<boolean>) | null) => void; onSnapshotChange: (snapshot: PaymentTermsSnapshot) => void; onValidityChange: (valid: boolean) => void }) {
  const [terms, setTerms] = useState<PaymentTermsRow | null>(null);
  const [method, setMethod] = useState<PaymentMethodType>("single");
  const [summary, setSummary] = useState("");
  const [installments, setInstallments] = useState<PaymentInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const defaultAllocation = useCallback((): PaymentAllocation[] => quotationItems.filter((item) => item.id).map((item) => ({
    quotation_item_id: item.id as string,
    allocated_amount_before_tax: 0,
    allocated_vat_amount: 0,
    allocated_total: 0,
  })), [quotationItems]);

  const loadTerms = useCallback(async () => {
    setLoading(true);
    const { data: header, error: headerError } = await supabase
      .from("finance_quotation_payment_terms")
      .select("id, payment_method_type, client_summary")
      .eq("quotation_id", quotationId)
      .maybeSingle();
    if (headerError) {
      console.error("Failed to load quotation payment terms", { quotationId, error: headerError });
      alert("ไม่สามารถโหลดเงื่อนไขการชำระเงินได้");
      setLoading(false);
      return;
    }
    if (!header) {
      setTerms(null);
      setInstallments([]);
      setSavedSnapshot(normalizedPaymentTermsSnapshot("single", "", []));
      setLoading(false);
      return;
    }
    const installmentRes = await supabase
      .from("finance_quotation_payment_installments")
      .select("id, installment_no, title, calculation_type, percentage, trigger_type, trigger_description, due_date, payment_due_days, client_note")
      .eq("payment_terms_id", header.id)
      .order("installment_no", { ascending: true });
    if (installmentRes.error) {
      console.error("Failed to load payment installments", { quotationId, error: installmentRes.error });
      alert("ไม่สามารถโหลดงวดการชำระเงินได้");
      setLoading(false);
      return;
    }
    const rows = (installmentRes.data || []) as PaymentInstallmentRow[];
    const allocationRes = rows.length === 0
      ? { data: [] as PaymentAllocationRow[], error: null }
      : await supabase
        .from("finance_quotation_payment_installment_items")
        .select("payment_installment_id, quotation_item_id, allocated_amount_before_tax, allocated_vat_amount, allocated_total")
        .in("payment_installment_id", rows.map((row) => row.id))
        .order("sort_order", { ascending: true });
    if (allocationRes.error) {
      console.error("Failed to load payment allocations", { quotationId, error: allocationRes.error });
      alert("ไม่สามารถโหลดรายการจัดสรรการชำระเงินได้");
      setLoading(false);
      return;
    }
    const nextMethod = header.payment_method_type as PaymentMethodType;
    const nextSummary = header.client_summary || "";
    const nextInstallments = rows.map((row) => ({
      installment_no: row.installment_no,
      title: row.title,
      calculation_type: row.calculation_type,
      percentage: row.percentage == null ? "" : String(row.percentage),
      trigger_type: row.trigger_type,
      trigger_description: row.trigger_description || "",
      due_date: row.due_date || "",
      payment_due_days: String(row.payment_due_days || 0),
      client_note: row.client_note || "",
      items: (allocationRes.data || []).filter((item) => item.payment_installment_id === row.id).map((item) => ({
        quotation_item_id: item.quotation_item_id,
        allocated_amount_before_tax: toAmount(item.allocated_amount_before_tax),
        allocated_vat_amount: toAmount(item.allocated_vat_amount),
        allocated_total: toAmount(item.allocated_total),
      })),
    }));
    setTerms(header as PaymentTermsRow);
    setMethod(nextMethod);
    setSummary(nextSummary);
    setInstallments(nextInstallments);
    setSavedSnapshot(normalizedPaymentTermsSnapshot(nextMethod, nextSummary, nextInstallments));
    setLoading(false);
  }, [quotationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTerms(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTerms]);

  const currentSnapshot = useMemo(() => normalizedPaymentTermsSnapshot(method, summary, installments), [method, summary, installments]);

  useEffect(() => {
    onSnapshotChange({ ready: !loading, saved: savedSnapshot, current: currentSnapshot });
    return () => onSnapshotChange({ ready: false, saved: "", current: "" });
  }, [currentSnapshot, loading, onSnapshotChange, savedSnapshot]);

  const forcedTrigger = (nextMethod: PaymentMethodType): PaymentTriggerType | null => (
    nextMethod === "milestone" ? "case_milestone" : nextMethod === "recurring" ? "recurring_period" : nextMethod === "manual" ? "manual" : null
  );
  const updateInstallment = (index: number, patch: Partial<PaymentInstallment>) => setInstallments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const paymentDueChoice = (value: number | string) => isPresetValue(value, paymentDueDayPresets) ? String(toAmount(value)) : "other";
  const percentageChoice = (value: number | string) => isPresetValue(value, percentagePresets) ? String(toAmount(value)) : "other";
  const setPaymentMethod = (nextMethod: PaymentMethodType) => {
    setMethod(nextMethod);
    const trigger = forcedTrigger(nextMethod);
    if (nextMethod === "single") {
      setInstallments((current) => [{
        ...(current[0] || {
          title: "ชำระเต็มจำนวน / Full Payment",
          trigger_type: "quotation_acceptance" as PaymentTriggerType,
          trigger_description: "",
          due_date: "",
          payment_due_days: "0",
          client_note: "",
          items: defaultAllocation(),
        }),
        installment_no: 1,
        calculation_type: "percentage",
        percentage: "100",
        trigger_type: "quotation_acceptance",
      }]);
      return;
    }
    setInstallments((current) => current.map((item) => ({
      ...item,
      calculation_type: current[0]?.calculation_type || "percentage",
      trigger_type: trigger || item.trigger_type,
    })));
  };
  const addInstallment = () => setInstallments((current) => {
    const calculationType = current[0]?.calculation_type || "percentage";
    const remaining = normalizePercentage(100 - current.reduce((sum, item) => sum + (item.calculation_type === "percentage" ? toAmount(item.percentage) : 0), 0));
    if (calculationType === "percentage" && remaining <= 0) {
      alert("เปอร์เซ็นต์รวมครบ 100% แล้ว ไม่สามารถเพิ่มงวดได้");
      return current;
    }
    return [...current, {
      installment_no: current.length + 1,
      title: `งวดที่ ${current.length + 1} / Installment ${current.length + 1}`,
      calculation_type: calculationType,
      percentage: calculationType === "percentage" ? String(remaining) : "",
      trigger_type: forcedTrigger(method) || "quotation_acceptance",
      trigger_description: "",
      due_date: "",
      payment_due_days: "0",
      client_note: "",
      items: defaultAllocation(),
    }];
  });
  const changeCalculationType = (nextType: PaymentCalculationType) => setInstallments((current) => current.map((item) => ({
    ...item,
    calculation_type: nextType,
    percentage: nextType === "percentage" ? item.percentage || "0" : "",
    items: nextType === "percentage" ? defaultAllocation() : item.items.length ? item.items : defaultAllocation(),
  })));
  const percentageTotal = normalizePercentage(installments.reduce((sum, item) => sum + (item.calculation_type === "percentage" ? toAmount(item.percentage) : 0), 0));
  const fixedAllocated = installments.reduce((sum, installment) => sum + installment.items.reduce((itemSum, item) => itemSum + item.allocated_total, 0), 0);
  const quotationTotal = quotationItems.reduce((sum, item) => sum + toAmount(item.line_total), 0);
  const isPercentage = installments[0]?.calculation_type !== "fixed_amount";
  const isOverPercentage = isPercentage && percentageTotal > 100;
  const complete = isPercentage ? percentageTotal === 100 : fixedAllocated === quotationTotal;
  const dueDaysAreValid = installments.every((item) => Number.isInteger(toAmount(item.payment_due_days)) && toAmount(item.payment_due_days) >= 0);
  const percentagesAreValid = !isPercentage || installments.every((item) => toAmount(item.percentage) > 0 && toAmount(item.percentage) <= 100);
  const paymentTermsValid = !terms || (!isOverPercentage && dueDaysAreValid && percentagesAreValid);

  useEffect(() => {
    onValidityChange(paymentTermsValid);
    return () => onValidityChange(true);
  }, [onValidityChange, paymentTermsValid]);

  const createDefault = async () => {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("create_default_finance_quotation_payment_terms", { p_quotation_id: quotationId, p_payment_due_days: 0 });
    if (error) alert("ไม่สามารถสร้างเงื่อนไขชำระเต็มจำนวนได้ กรุณาลองใหม่");
    else await loadTerms();
    setSaving(false);
  };
  const saveTerms = async () => {
    if (saving) return false;
    if (!terms) return true;
    if (installments.length === 0) { alert("กรุณาเพิ่มอย่างน้อยหนึ่งงวด"); return false; }
    if (!paymentTermsValid) { alert(isOverPercentage ? "เปอร์เซ็นต์รวมต้องไม่เกิน 100%" : "กรุณาตรวจสอบเปอร์เซ็นต์และจำนวนวันชำระเงิน"); return false; }
    setSaving(true);
    const payload = installments.map((item, index) => ({
      installment_no: index + 1,
      title: item.title,
      calculation_type: item.calculation_type,
      percentage: item.calculation_type === "percentage" ? normalizePercentage(item.percentage) : null,
      trigger_type: forcedTrigger(method) || item.trigger_type,
      trigger_description: item.trigger_description || null,
      due_date: item.due_date || null,
      payment_due_days: normalizePaymentDueDays(item.payment_due_days),
      client_note: item.client_note || null,
      sort_order: index,
      items: item.calculation_type === "percentage"
        ? quotationItems.filter((quotationItem) => quotationItem.id).map((quotationItem, itemIndex) => ({ quotation_item_id: quotationItem.id, sort_order: itemIndex }))
        : item.items.map((allocation, itemIndex) => ({ ...allocation, sort_order: itemIndex })),
    }));
    const { error } = await supabase.rpc("save_finance_quotation_payment_terms_draft", {
      p_quotation_id: quotationId,
      p_payment_method_type: method,
      p_client_summary: summary,
      p_installments_json: payload,
    });
    if (error) {
      console.error("Failed to save quotation payment terms", {
        quotationId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload,
      });
      alert("ไม่สามารถบันทึกเงื่อนไขการชำระเงินได้ กรุณาตรวจสอบงวดและการจัดสรรยอดเงิน");
      setSaving(false);
      return false;
    }
    await loadTerms();
    setSaving(false);
    return true;
  };

  useEffect(() => {
    onRegisterSave(saveTerms);
    return () => onRegisterSave(null);
    // The parent callback only stores this current-state handler in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installments, method, summary, terms, saving]);

  if (loading) return <div style={cardStyle}>Loading payment terms...</div>;
  if (!terms) return <div style={cardStyle}><h2 style={sectionTitleStyle}>เงื่อนไขการชำระเงิน / Payment Terms</h2><p style={mutedTextStyle}>ยังไม่มีเงื่อนไขการชำระเงินสำหรับใบเสนอราคาฉบับร่างนี้</p><button type="button" onClick={createDefault} disabled={saving} style={primaryButtonStyle}>{saving ? "Creating..." : "สร้างเงื่อนไขชำระเต็มจำนวน / Create Full Payment Terms"}</button></div>;

  return <div style={cardStyle}>
    <div style={sectionHeaderStyle}><div><h2 style={sectionTitleStyle}>เงื่อนไขการชำระเงิน / Payment Terms</h2><p style={mutedTextStyle}>เงื่อนไขการชำระเงินจะบันทึกพร้อมกับร่างใบเสนอราคา</p></div></div>
    <div style={formGridStyle}>
      <label style={labelStyle}>วิธีชำระเงิน / Payment Method<select value={method} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethodType)} style={inputStyle}><option value="single">ชำระครั้งเดียว / Single Payment</option><option value="installments">แบ่งชำระหลายงวด / Installments</option><option value="milestone">ตามขั้นตอนงาน / Milestone</option><option value="recurring">เรียกเก็บเป็นรอบ / Recurring</option><option value="manual">กำหนดเอง / Manual</option></select></label>
      <label style={wideLabelStyle}>สรุปสำหรับลูกค้า / Client Summary<textarea value={summary} onChange={(event) => setSummary(event.target.value)} style={textareaStyle} /></label>
    </div>
    <div style={isOverPercentage ? errorNoticeTextStyle : noticeTextStyle}>{isPercentage ? (isOverPercentage ? "รวมเกิน 100% กรุณาปรับสัดส่วน" : complete ? "รวม 100% — พร้อมสำหรับการตรวจสอบก่อนส่ง" : `รวม ${percentageTotal.toFixed(6).replace(/\.0+$/, "")}% — ยังขาด ${normalizePercentage(100 - percentageTotal).toFixed(6).replace(/\.0+$/, "")}%`) : `จัดสรรแล้ว ${formatMoney(fixedAllocated)} | คงเหลือ ${formatMoney(Math.max(0, quotationTotal - fixedAllocated))}`} {!isPercentage && (complete ? " | พร้อมสำหรับการตรวจสอบก่อนส่ง" : " | ยังไม่ครบสำหรับการส่งใบเสนอราคา")}</div>
    {installments.map((installment, index) => <div key={index} style={{ ...cardStyle, marginTop: 12, background: "#f8fafc" }}>
      <div style={sectionHeaderStyle}><h3 style={sectionTitleStyle}>งวดที่ {index + 1} / Installment {index + 1}</h3>{method !== "single" ? <div style={actionGroupStyle}><button type="button" disabled={index === 0} onClick={() => setInstallments((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next.map((item, itemIndex) => ({ ...item, installment_no: itemIndex + 1 })); })} style={smallButtonStyle}>Up</button><button type="button" disabled={index === installments.length - 1} onClick={() => setInstallments((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next.map((item, itemIndex) => ({ ...item, installment_no: itemIndex + 1 })); })} style={smallButtonStyle}>Down</button><button type="button" onClick={() => setInstallments((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, installment_no: itemIndex + 1 })))} style={dangerSmallButtonStyle}>Remove</button></div> : null}</div>
      <div style={formGridStyle}>
        <label style={labelStyle}>ชื่อรายการ / Title<input value={installment.title} onChange={(event) => updateInstallment(index, { title: event.target.value })} style={inputStyle} /></label>
        <label style={labelStyle}>รูปแบบคำนวณ / Calculation<select value={installment.calculation_type} disabled={method === "single"} onChange={(event) => changeCalculationType(event.target.value as PaymentCalculationType)} style={inputStyle}><option value="percentage">Percentage</option><option value="fixed_amount">Fixed Amount</option></select></label>
        {installment.calculation_type === "percentage" ? <label style={labelStyle}>เปอร์เซ็นต์ / Percentage<div style={compactFieldGroupStyle}><select value={percentageChoice(installment.percentage)} disabled={method === "single"} onChange={(event) => { const value = event.target.value; updateInstallment(index, { percentage: value === "other" ? "" : value }); }} style={compactSelectStyle}><option value="50">50%</option><option value="25">25%</option><option value="20">20%</option><option value="other">Other</option></select>{percentageChoice(installment.percentage) === "other" ? <input type="number" min="0.000001" max="100" step="0.000001" value={installment.percentage} onChange={(event) => updateInstallment(index, { percentage: event.target.value })} style={compactInputStyle} /> : null}</div></label> : null}
        <label style={labelStyle}>ถึงกำหนดเมื่อ / Trigger<select value={forcedTrigger(method) || installment.trigger_type} disabled={Boolean(forcedTrigger(method))} onChange={(event) => updateInstallment(index, { trigger_type: event.target.value as PaymentTriggerType })} style={inputStyle}><option value="quotation_acceptance">Quotation acceptance</option><option value="agreement_effective">Agreement effective</option><option value="date">Specific date</option><option value="case_milestone">Case milestone</option><option value="recurring_period">Recurring period</option><option value="manual">Manual</option></select></label>
        {(forcedTrigger(method) || installment.trigger_type) === "date" ? <label style={labelStyle}>Due Date<input type="date" value={installment.due_date} onChange={(event) => updateInstallment(index, { due_date: event.target.value })} style={inputStyle} /></label> : null}
        {["case_milestone", "recurring_period", "manual"].includes(forcedTrigger(method) || installment.trigger_type) ? <label style={wideLabelStyle}>รายละเอียด Trigger / Trigger Description<input value={installment.trigger_description} onChange={(event) => updateInstallment(index, { trigger_description: event.target.value })} style={inputStyle} /></label> : null}
        <label style={labelStyle}>ชำระภายใน / Payment Due<div style={compactFieldGroupStyle}><select value={paymentDueChoice(installment.payment_due_days)} onChange={(event) => { const value = event.target.value; updateInstallment(index, { payment_due_days: value === "other" ? "" : value }); }} style={compactSelectStyle}>{paymentDueDayPresets.map((days) => <option key={days} value={days}>{days} days</option>)}<option value="other">Other</option></select>{paymentDueChoice(installment.payment_due_days) === "other" ? <input type="number" min="0" step="1" value={installment.payment_due_days} onChange={(event) => updateInstallment(index, { payment_due_days: event.target.value })} style={compactInputStyle} /> : null}</div>วันนับแต่ได้รับใบแจ้งหนี้ / days after invoice</label>
        <label style={wideLabelStyle}>หมายเหตุสำหรับลูกค้า / Client Note<textarea value={installment.client_note} onChange={(event) => updateInstallment(index, { client_note: event.target.value })} style={textareaStyle} /></label>
      </div>
      {installment.calculation_type === "fixed_amount" ? <div style={tableWrapStyle}><h4 style={sectionTitleStyle}>Advanced Item Allocation</h4><table style={tableStyle}><thead><tr><th style={thStyle}>Quotation Item</th><th style={rightThStyle}>Before VAT</th><th style={rightThStyle}>VAT</th><th style={rightThStyle}>Total</th><th style={rightThStyle}>Remaining</th></tr></thead><tbody>{quotationItems.filter((item) => item.id).map((quotationItem) => { const allocation = installment.items.find((item) => item.quotation_item_id === quotationItem.id) || { quotation_item_id: quotationItem.id as string, allocated_amount_before_tax: 0, allocated_vat_amount: 0, allocated_total: 0 }; const allocatedElsewhere = installments.filter((_, installmentIndex) => installmentIndex !== index).reduce((sum, other) => sum + (other.items.find((item) => item.quotation_item_id === quotationItem.id)?.allocated_total || 0), 0); const patch = (field: keyof PaymentAllocation, value: string) => updateInstallment(index, { items: installment.items.some((item) => item.quotation_item_id === quotationItem.id) ? installment.items.map((item) => item.quotation_item_id === quotationItem.id ? { ...item, [field]: toAmount(value), allocated_total: field === "allocated_total" ? toAmount(value) : (field === "allocated_amount_before_tax" ? toAmount(value) : item.allocated_amount_before_tax) + (field === "allocated_vat_amount" ? toAmount(value) : item.allocated_vat_amount) } : item) : [...installment.items, { ...allocation, [field]: toAmount(value), allocated_total: field === "allocated_total" ? toAmount(value) : (field === "allocated_amount_before_tax" ? toAmount(value) : 0) + (field === "allocated_vat_amount" ? toAmount(value) : 0) }] }); return <tr key={quotationItem.id}><td style={tdStyle}>{quotationItem.description}</td><td style={rightTdStyle}><input type="number" min="0" step="0.01" value={allocation.allocated_amount_before_tax} onChange={(event) => patch("allocated_amount_before_tax", event.target.value)} style={compactInputStyle} /></td><td style={rightTdStyle}><input type="number" min="0" step="0.01" value={allocation.allocated_vat_amount} onChange={(event) => patch("allocated_vat_amount", event.target.value)} style={compactInputStyle} /></td><td style={rightTdStyle}>{formatMoney(allocation.allocated_amount_before_tax + allocation.allocated_vat_amount)}</td><td style={rightTdStyle}>{formatMoney(toAmount(quotationItem.line_total) - allocatedElsewhere - allocation.allocated_total)}</td></tr>; })}</tbody></table></div> : <p style={mutedTextStyle}>ระบบจะรวมทุกรายการค่าบริการและคำนวณ Before VAT, VAT และ Total จากเปอร์เซ็นต์ในฝั่งเซิร์ฟเวอร์</p>}
    </div>)}
    {method !== "single" ? <button type="button" onClick={addInstallment} style={secondaryButtonStyle}>เพิ่มงวด / Add Installment</button> : null}
  </div>;
}

export function QuotationDetail({ access, quotationId }: { access: QuotationAccess; quotationId: string }) {
  const router = useRouter();
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [items, setItems] = useState<QuotationItemRow[]>([]);
  const [lookups, setLookups] = useState<LookupState>(getEmptyLookups());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feeAgreementId, setFeeAgreementId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (!quotationId) {
      console.error("Missing quotation id in quotation detail route");
      alert("Quotation not found.");
      setLoading(false);
      return;
    }

    const quotationRes = await supabase.from("finance_quotations").select("*").eq("id", quotationId).maybeSingle();
    if (quotationRes.error || !quotationRes.data) {
      console.error("Failed to load quotation", { quotationId, error: quotationRes.error });
      alert(quotationRes.error ? "Unable to load quotation." : "Quotation not found.");
      setLoading(false);
      return;
    }

    const [itemRes, lookupRes, agreementRes] = await Promise.all([
      supabase.from("finance_quotation_items").select("*").eq("quotation_id", quotationId).order("sort_order", { ascending: true }),
      loadLookups(),
      supabase.from("finance_fee_agreements").select("id").eq("source_type", "quotation").eq("source_quotation_id", quotationId).neq("status", "cancelled").maybeSingle(),
    ]);
    if (itemRes.error) {
      console.warn("Failed to load quotation items", { quotationId, error: itemRes.error });
    }

    setQuotation(quotationRes.data as QuotationRow);
    setItems((itemRes.data || []) as QuotationItemRow[]);
    setFeeAgreementId(agreementRes.data?.id || null);
    setLookups(lookupRes);
    setLoading(false);
  }, [quotationId]);

  const createFeeAgreement = async () => {
    if (!quotation || saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("create_finance_fee_agreement_from_quotation", { p_quotation_id: quotation.id });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result?.fee_agreement_id) {
      alert("Unable to create Fee Agreement draft.");
      setSaving(false);
      return;
    }
    router.push(`/finance/fee-agreements/${result.fee_agreement_id}`);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const updateStatus = async (nextStatus: QuotationStatus) => {
    if (!quotation || saving) return;
    if (nextStatus === "sent" && quotation.status !== "draft") return;
    if (nextStatus === "accepted" && quotation.status !== "sent") return;
    if (nextStatus === "cancelled" && quotation.status !== "draft" && quotation.status !== "sent") return;

    let cancelReason: string | null = null;
    if (nextStatus === "cancelled") {
      cancelReason = window.prompt("Cancel reason") || "Cancelled by user";
      if (!cancelReason.trim()) return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("set_finance_quotation_status", {
      p_quotation_id: quotation.id,
      p_next_status: nextStatus,
      p_cancel_reason: cancelReason,
      p_user_id: access.userId,
      p_user_email: access.userEmail,
      p_user_name: access.userName,
    });
    if (error) {
      alert("Unable to update quotation status.");
      setSaving(false);
      return;
    }

    await createAuditLog({
      tableName: "finance_quotations",
      recordId: quotation.id,
      caseId: quotation.case_id || null,
      action: "update",
      note: `Quotation ${quotation.quotation_no} marked ${nextStatus}`,
    });
    await loadData();
    setSaving(false);
  };

  return (
    <>
      <FinanceSubNav activePage="quotations" permissions={access.permissions} />
      {loading ? <div style={cardStyle}>Loading quotation...</div> : null}
      {!loading && quotation ? (
        <>
          <div style={sectionHeaderStyle}>
            <div>
              <h1 style={pageTitleStyle}>{quotation.quotation_no}</h1>
              <p style={mutedTextStyle}>Quotation document record. No invoice, receipt, ledger posting, or compensation is created from this page.</p>
              {quotation.status !== "draft" ? <p style={noticeTextStyle}>{getReadonlyMessage(quotation.status)}</p> : null}
            </div>
            <div style={actionGroupStyle}>
              <Link href="/finance/quotations" style={secondaryButtonStyle}>Back</Link>
              <Link href={`/finance/quotations/${quotation.id}/preview`} style={secondaryButtonStyle}>Preview</Link>
              <Link href={`/finance/quotations/${quotation.id}/preview?print=1`} style={secondaryButtonStyle} title="Open Browser Print for this quotation">Print</Link>
              {quotation.status === "accepted" && access.permissions.canCreateFinanceQuotation ? (feeAgreementId ? <Link href={`/finance/fee-agreements/${feeAgreementId}`} style={primaryButtonStyle}>Open Fee Agreement</Link> : <button type="button" onClick={createFeeAgreement} disabled={saving} style={primaryButtonStyle}>สร้างข้อตกลงค่าบริการ</button>) : null}
              {quotation.status === "draft" && access.permissions.canEditFinanceQuotation ? <Link href={`/finance/quotations/${quotation.id}/edit`} style={primaryButtonStyle}>Edit Draft</Link> : null}
              {quotation.status === "draft" && access.permissions.canMarkFinanceQuotationSent ? <button type="button" onClick={() => updateStatus("sent")} disabled={saving} style={secondaryButtonStyle}>Mark Sent</button> : null}
              {quotation.status === "sent" && access.permissions.canMarkFinanceQuotationAccepted ? <button type="button" onClick={() => updateStatus("accepted")} disabled={saving} style={secondaryButtonStyle}>Mark Accepted</button> : null}
              {(quotation.status === "draft" || quotation.status === "sent") && access.permissions.canCancelFinanceQuotation ? <button type="button" onClick={() => updateStatus("cancelled")} disabled={saving} style={dangerButtonStyle}>Cancel</button> : null}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={detailGridStyle}>
              <Detail label="Status" value={<StatusBadge status={quotation.status} />} />
              <Detail label="Client" value={renderClientName(quotation.client_id, lookups.clients)} />
              <Detail label="Linked Matter" value={renderMatterLink(quotation, lookups)} />
              <Detail label="Issue Date" value={formatDate(quotation.issue_date)} />
              <Detail label="Valid Until" value={formatDate(quotation.valid_until)} />
              <Detail label="จำนวนเงินตามใบเสนอราคา / Quotation Total" value={formatMoney(toAmount(quotation.grand_total))} />
              <Detail label="ขอบเขตงาน / Scope of Legal Services" value={quotation.scope_of_legal_services || "-"} />
              <Detail label="งานที่รวมอยู่ในค่าบริการ / Included Services" value={quotation.included_services || "-"} />
              <Detail label="งานหรือค่าใช้จ่ายที่ไม่รวม / Excluded Services" value={quotation.excluded_services || "-"} />
              <Detail label="Authorized Signer" value={renderSignerDetail(quotation)} />
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Line Items</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Description</th>
                    <th style={rightThStyle}>Qty</th>
                    <th style={rightThStyle}>Unit Price</th>
                    <th style={rightThStyle}>Before Tax</th>
                    <th style={rightThStyle}>VAT</th>
                    <th style={rightThStyle}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id || index}>
                      <td style={tdStyle}>{item.description}</td>
                      <td style={rightTdStyle}>{formatQuantity(toAmount(item.quantity))}</td>
                      <td style={rightTdStyle}>{formatMoney(toAmount(item.unit_price))}</td>
                      <td style={rightTdStyle}>{formatMoney(toAmount(item.amount_before_tax))}</td>
                      <td style={rightTdStyle}>{formatMoney(toAmount(item.vat_amount))}</td>
                      <td style={rightTdStyle}>{formatMoney(toAmount(item.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={totalsGridStyle}>
              <SummaryLine label="รวมรายการที่มี VAT / Vatable Subtotal" value={toAmount(quotation.subtotal_vatable)} />
              <SummaryLine label="รวมรายการที่ไม่มี VAT / Non-Vatable Subtotal" value={toAmount(quotation.subtotal_non_vatable)} />
              <SummaryLine label="ภาษีมูลค่าเพิ่ม / VAT" value={toAmount(quotation.vat_amount)} />
              <SummaryLine label="จำนวนเงินตามใบเสนอราคา / Quotation Total" value={toAmount(quotation.grand_total)} strong />
            </div>
          </div>

          <div style={cardStyle}>
            <div style={detailGridStyle}>
              <Detail label="Note" value={quotation.note || "-"} />
              <Detail label="Internal Note" value={quotation.internal_note || "-"} />
              {quotation.cancel_reason ? <Detail label="Cancel Reason" value={quotation.cancel_reason} /> : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

async function loadLookups(preservedSignerKey?: string | null): Promise<LookupState> {
  const [clientsRes, casesRes, mattersRes, companyRes, signersRes, preservedSignerRes] = await Promise.all([
    supabase.from("clients").select("id, name, tax_id, email, phone, address").order("name", { ascending: true }),
    supabase.from("cases").select("id, file_no, title, client_name").order("created_at", { ascending: false }),
    supabase.from("advisory_matters").select("id, matter_no, title").order("created_at", { ascending: false }),
    supabase.from("finance_company_profiles").select("*").eq("id", "default").maybeSingle(),
    supabase.from("finance_authorized_signers").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    preservedSignerKey
      ? supabase.from("finance_authorized_signers").select("*").eq("signer_key", preservedSignerKey).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const signerRows = signersRes.error ? [] : ((signersRes.data || []) as DbAuthorizedSigner[]);
  const preservedSigner = preservedSignerRes.error || !preservedSignerRes.data ? null : normalizeAuthorizedSigner(preservedSignerRes.data as DbAuthorizedSigner);
  if (preservedSigner && !signerRows.some((signer) => signer.signer_key === preservedSigner.key)) {
    signerRows.push(preservedSignerRes.data as DbAuthorizedSigner);
  }
  const signers = signersRes.error ? AUTHORIZED_SIGNERS : signerRows.map(normalizeAuthorizedSigner).filter((signer) => signer.key);

  return {
    clients: (clientsRes.data || []) as ClientRow[],
    cases: (casesRes.data || []) as CaseRow[],
    matters: (mattersRes.data || []) as MatterRow[],
    companyProfile: normalizeCompanyProfile((companyRes.data || null) as DbCompanyProfile | null),
    signers: signers.length > 0 ? signers : AUTHORIZED_SIGNERS,
  };
}

function getEmptyLookups(): LookupState {
  return {
    clients: [],
    cases: [],
    matters: [],
    companyProfile: normalizeCompanyProfile(null),
    signers: AUTHORIZED_SIGNERS,
  };
}

function validateForm(form: FormState, items: QuotationItemRow[]) {
  if (!form.client_id) return "Please select client.";
  if (!form.issue_date) return "Please select issue date.";
  if (form.valid_until && form.valid_until < form.issue_date) return "Valid until cannot be before issue date.";
  if (form.case_id && form.advisory_matter_id) return "Select either case or advisory matter, not both.";
  if (!form.authorized_signer_key) return "Please select authorized signer.";
  if (items.length === 0) return "Please add at least one line item.";
  for (const item of items) {
    if (!item.description.trim()) return "Every line item needs a description.";
    if (toAmount(item.quantity) <= 0) return "Quantity must be greater than zero.";
    if (toAmount(item.unit_price) < 0) return "Unit price cannot be negative.";
  }
  return "";
}

function validateDraftSavePayload(payload: Record<string, unknown>, totals: ReturnType<typeof computeTotals>) {
  const requiredStrings = ["p_quotation_id", "p_client_id", "p_issue_date", "p_authorized_signer_key"];
  if (requiredStrings.some((key) => typeof payload[key] !== "string" || !String(payload[key]).trim())) return "Required quotation fields are missing.";
  if (payload.p_case_id && payload.p_advisory_matter_id) return "Select either case or advisory matter, not both.";
  if (typeof payload.p_issue_date === "string" && typeof payload.p_valid_until === "string" && payload.p_valid_until && payload.p_valid_until < payload.p_issue_date) return "Valid until cannot be before issue date.";
  const numericKeys = ["p_subtotal_vatable", "p_subtotal_non_vatable", "p_vat_amount", "p_grand_total"];
  if (numericKeys.some((key) => !Number.isFinite(Number(payload[key])))) return "Quotation totals contain an invalid number.";
  if (roundMoney(Number(payload.p_grand_total)) !== totals.grandTotal) return "Quotation totals do not reconcile.";
  if (!Array.isArray(payload.p_items) || payload.p_items.length === 0) return "Quotation requires at least one line item.";
  const hasInvalidItem = payload.p_items.some((item) => {
    if (!item || typeof item !== "object") return true;
    const row = item as Record<string, unknown>;
    return typeof row.description !== "string" || !row.description.trim()
      || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0
      || !Number.isFinite(Number(row.unit_price)) || Number(row.unit_price) < 0
      || !Number.isFinite(Number(row.amount_before_tax)) || !Number.isFinite(Number(row.vat_amount)) || !Number.isFinite(Number(row.line_total));
  });
  return hasInvalidItem ? "Quotation contains an invalid line item." : "";
}

function isDraftSaveFunctionResolutionError(error: { code?: string | null; message?: string | null }) {
  return error.code === "PGRST202" || error.code === "42883" || /function .*save_finance_quotation_draft|could not find the function/i.test(error.message || "");
}

function buildQuotationSnapshots(
  form: FormState,
  items: QuotationItemRow[],
  totals: ReturnType<typeof computeTotals>,
  lookups: LookupState,
  quotationNo: string
) {
  const client = lookups.clients.find((item) => item.id === form.client_id);
  const caseItem = form.case_id ? lookups.cases.find((item) => String(item.id) === String(form.case_id)) : null;
  const matter = form.advisory_matter_id ? lookups.matters.find((item) => item.id === form.advisory_matter_id) : null;
  const signer = getSignerByKey(lookups.signers, form.authorized_signer_key);
  const signerPosition = formatSignerPosition(signer);
  const normalizedItems = items.map((item, index) => normalizeItem(item, index));

  const clientSnapshot: Record<string, unknown> = {
    id: form.client_id,
    name: client?.name || null,
    tax_id: client?.tax_id || null,
    email: client?.email || null,
    phone: client?.phone || null,
    address: client?.address || null,
  };

  const matterSnapshot: Record<string, unknown> | null = caseItem
    ? {
        type: "case",
        id: caseItem.id,
        file_no: caseItem.file_no || null,
        title: caseItem.title || null,
        client_name: caseItem.client_name || null,
      }
    : matter
      ? {
          type: "advisory",
          id: matter.id,
          matter_no: matter.matter_no || null,
          title: matter.title || null,
        }
      : form.case_id
        ? { type: "case", id: form.case_id }
        : form.advisory_matter_id
          ? { type: "advisory", id: form.advisory_matter_id }
          : null;

  return {
    clientSnapshot,
    matterSnapshot,
    documentSnapshot: {
      document_type: "quotation",
      quotation_no: quotationNo || null,
      client_id: form.client_id,
      case_id: form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.advisory_matter_id || null,
      issue_date: form.issue_date,
      valid_until: form.valid_until || null,
      scope_of_legal_services: form.scope_of_legal_services.trim() || null,
      included_services: form.included_services.trim() || null,
      excluded_services: form.excluded_services.trim() || null,
      company_profile: {
        company_name_th: lookups.companyProfile.companyNameTh,
        company_name_en: lookups.companyProfile.companyNameEn,
        tax_id: lookups.companyProfile.taxId,
        branch_label: lookups.companyProfile.branchLabel,
        branch_th: lookups.companyProfile.branchTh,
        branch_en: lookups.companyProfile.branchEn,
        address_th: lookups.companyProfile.addressTh,
        address_en: lookups.companyProfile.addressEn,
        phone: lookups.companyProfile.phone,
        email: lookups.companyProfile.email,
        website: lookups.companyProfile.website,
        description: lookups.companyProfile.description,
        quotation_prefix: lookups.companyProfile.quotationPrefix,
        logo_storage_path: lookups.companyProfile.logoStoragePath || null,
      },
      authorized_signer: {
        key: signer.key,
        name: signer.displayName,
        nickname: signer.nickname,
        position: signerPosition,
        email: signer.email,
        signature_storage_path: signer.signatureStoragePath || null,
      },
      note: form.note.trim() || null,
      totals,
      items: normalizedItems.map((item) => ({
        description: item.description.trim(),
        quantity: toAmount(item.quantity),
        unit_price: toAmount(item.unit_price),
        amount_before_tax: toAmount(item.amount_before_tax),
        vat_applicable: item.vat_applicable,
        vat_rate: toAmount(item.vat_rate),
        vat_amount: toAmount(item.vat_amount),
        line_total: toAmount(item.line_total),
        sort_order: item.sort_order,
      })),
      snapshot_created_at: new Date().toISOString(),
    },
  };
}

function buildItemPayload(quotationId: string, items: QuotationItemRow[]) {
  return items.map((item, index) => {
    const normalized = normalizeItem(item, index);
    return {
      quotation_id: quotationId,
      description: normalized.description.trim(),
      quantity: toAmount(normalized.quantity),
      unit_price: toAmount(normalized.unit_price),
      amount_before_tax: toAmount(normalized.amount_before_tax),
      vat_applicable: normalized.vat_applicable,
      vat_rate: toAmount(normalized.vat_rate),
      vat_amount: toAmount(normalized.vat_amount),
      line_total: toAmount(normalized.line_total),
      sort_order: index,
    };
  });
}

function normalizeItem(item: QuotationItemRow, index: number): QuotationItemRow {
  const quantity = toAmount(item.quantity);
  const unitPrice = toAmount(item.unit_price);
  const amountBeforeTax = roundMoney(quantity * unitPrice);
  const vatRate = item.vat_applicable ? (toAmount(item.vat_rate) || 7) : 0;
  const vatAmount = item.vat_applicable ? roundMoney((amountBeforeTax * vatRate) / 100) : 0;
  return {
    ...item,
    quantity,
    unit_price: unitPrice,
    amount_before_tax: amountBeforeTax,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    line_total: roundMoney(amountBeforeTax + vatAmount),
    sort_order: index,
  };
}

function computeTotals(items: QuotationItemRow[]) {
  const normalizedItems = items.map((item, index) => normalizeItem(item, index));
  const subtotalVatable = roundMoney(normalizedItems.reduce((sum, item) => sum + (item.vat_applicable ? toAmount(item.amount_before_tax) : 0), 0));
  const subtotalNonVatable = roundMoney(normalizedItems.reduce((sum, item) => sum + (!item.vat_applicable ? toAmount(item.amount_before_tax) : 0), 0));
  const vatAmount = roundMoney(normalizedItems.reduce((sum, item) => sum + toAmount(item.vat_amount), 0));
  return {
    subtotalVatable,
    subtotalNonVatable,
    vatAmount,
    grandTotal: roundMoney(subtotalVatable + subtotalNonVatable + vatAmount),
  };
}

function SummaryLine({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div style={strong ? totalLineStyle : summaryLineStyle}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={detailLabelStyle}>{label}</div>
      <div style={detailValueStyle}>{value}</div>
    </div>
  );
}

function renderSignerDetail(quotation: QuotationRow) {
  const fallbackSigner = getSignerByKey(AUTHORIZED_SIGNERS, quotation.authorized_signer_key);
  const name = quotation.authorized_signer_name || fallbackSigner.displayName;
  const position = quotation.authorized_signer_position || formatSignerPosition(fallbackSigner);
  const email = quotation.authorized_signer_email || fallbackSigner.email;

  return (
    <div>
      <div>{name}</div>
      <div style={mutedInlineTextStyle}>{position}</div>
      <div style={mutedInlineTextStyle}>{email}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const normalized = String(status || "draft").toLowerCase();
  const style = statusStyles[normalized] || statusStyles.draft;
  return <span style={{ ...badgeStyle, ...style }}>{normalized}</span>;
}

function getReadonlyMessage(status: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "accepted") return "Accepted quotations are read-only. To change terms, cancel and create a new quotation.";
  if (normalized === "cancelled") return "Cancelled quotations are read-only.";
  if (normalized === "sent") return "Sent quotations cannot edit line items in this phase. Cancel and create a new quotation if terms change.";
  return "Only draft quotations can be edited.";
}

function renderMatterLink(quotation: Pick<QuotationRow, "case_id" | "advisory_matter_id">, lookups: LookupState) {
  if (quotation.case_id) {
    const caseItem = lookups.cases.find((item) => String(item.id) === String(quotation.case_id));
    return caseItem ? `Case: ${renderCaseLabel(caseItem)}` : `Case: ${quotation.case_id}`;
  }
  if (quotation.advisory_matter_id) {
    const matter = lookups.matters.find((item) => item.id === quotation.advisory_matter_id);
    return matter ? `Advisory: ${renderMatterLabel(matter)}` : `Advisory: ${quotation.advisory_matter_id}`;
  }
  return "Unlinked";
}

function renderClientName(clientId: string, clients: ClientRow[]) {
  return clients.find((client) => client.id === clientId)?.name || clientId || "-";
}

function renderCaseLabel(item: CaseRow) {
  return [item.file_no, item.title || item.client_name].filter(Boolean).join(" - ") || String(item.id);
}

function renderMatterLabel(item: MatterRow) {
  return [item.matter_no, item.title].filter(Boolean).join(" - ") || item.id;
}

function formatMoney(value: number) {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : "-";
}

function getDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toAmount(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const pageStyle: CSSProperties = {
  maxWidth: "1180px",
  margin: "0 auto",
  padding: "24px",
};

const cardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 18,
  marginBottom: 16,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const subNavStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 18,
};

const subNavLinkStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "8px 12px",
  color: "#374151",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600,
};

const subNavActiveLinkStyle: CSSProperties = {
  ...subNavLinkStyle,
  background: "#111827",
  borderColor: "#111827",
  color: "#ffffff",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};

const pageTitleStyle: CSSProperties = { margin: 0, fontSize: 26, color: "#111827" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: 18, color: "#111827" };
const mutedTextStyle: CSSProperties = { color: "#6b7280", margin: "6px 0 0", fontSize: 13 };
const noticeTextStyle: CSSProperties = { color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 10px", margin: "10px 0 0", fontSize: 13, fontWeight: 700 };
const errorNoticeTextStyle: CSSProperties = { color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 10px", margin: "10px 0 0", fontSize: 13, fontWeight: 700 };
const savedIndicatorStyle: CSSProperties = { color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontWeight: 700 };
const unsavedIndicatorStyle: CSSProperties = { color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontWeight: 700 };
const dialogBackdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(15, 23, 42, 0.45)" };
const dialogStyle: CSSProperties = { width: "min(100%, 520px)", background: "#ffffff", borderRadius: 8, padding: 20, boxShadow: "0 20px 40px rgba(15, 23, 42, 0.24)" };

const tableWrapStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle: CSSProperties = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" };
const rightThStyle: CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: CSSProperties = { padding: "10px 8px", borderBottom: "1px solid #f3f4f6", fontSize: 13, verticalAlign: "top" };
const rightTdStyle: CSSProperties = { ...tdStyle, textAlign: "right", whiteSpace: "nowrap" };

const linkStyle: CSSProperties = { color: "#1d4ed8", fontWeight: 700, textDecoration: "none" };
const primaryButtonStyle: CSSProperties = { border: "1px solid #111827", background: "#111827", color: "#ffffff", borderRadius: 6, padding: "9px 12px", fontWeight: 700, fontSize: 13, textDecoration: "none", cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { border: "1px solid #d1d5db", background: "#ffffff", color: "#111827", borderRadius: 6, padding: "9px 12px", fontWeight: 700, fontSize: 13, textDecoration: "none", cursor: "pointer" };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 10px", fontSize: 12 };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, borderColor: "#b91c1c", color: "#b91c1c" };
const dangerSmallButtonStyle: CSSProperties = { ...dangerButtonStyle, padding: "6px 10px", fontSize: 12 };
const actionGroupStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };

const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, color: "#374151", fontSize: 13, fontWeight: 700, minWidth: 0 };
const wideLabelStyle: CSSProperties = { ...labelStyle, gridColumn: "1 / -1" };
const inputStyle: CSSProperties = { width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "9px 10px", fontSize: 14, minWidth: 0 };
const authorizedSignerLabelStyle: CSSProperties = { ...labelStyle, minWidth: 0 };
const authorizedSignerSelectStyle: CSSProperties = { ...inputStyle, paddingRight: 36 };
const compactInputStyle: CSSProperties = { ...inputStyle, width: 110, textAlign: "right" };
const compactFieldGroupStyle: CSSProperties = { display: "flex", gap: 8, minWidth: 0, alignItems: "center" };
const compactSelectStyle: CSSProperties = { ...inputStyle, flex: 1, minWidth: 0 };
const vatInputStyle: CSSProperties = { ...inputStyle, width: 80, marginTop: 6 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 88, resize: "vertical" };

const quotationHeaderFormCss = `
  @media (min-width: 960px) {
    .quotation-header-form-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    }
    .quotation-authorized-signer-field {
      grid-column: span 2 !important;
    }
  }
  @media (max-width: 959px) {
    .quotation-authorized-signer-field {
      grid-column: 1 / -1 !important;
    }
  }
`;
const checkboxLabelStyle: CSSProperties = { display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 };
const buttonRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: 16 };

const totalsGridStyle: CSSProperties = { maxWidth: 420, marginLeft: "auto", marginTop: 16, display: "grid", gap: 8 };
const summaryLineStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14, color: "#374151" };
const totalLineStyle: CSSProperties = { ...summaryLineStyle, fontSize: 16, color: "#111827", borderTop: "1px solid #e5e7eb", paddingTop: 8 };

const detailGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const detailLabelStyle: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 700, marginBottom: 4 };
const detailValueStyle: CSSProperties = { color: "#111827", fontSize: 14, fontWeight: 600 };
const mutedInlineTextStyle: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 600, marginTop: 3 };

const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: 999, padding: "4px 9px", fontSize: 12, fontWeight: 800, textTransform: "capitalize" };
const statusStyles: Record<string, CSSProperties> = {
  draft: { background: "#f3f4f6", color: "#374151" },
  sent: { background: "#dbeafe", color: "#1e40af" },
  accepted: { background: "#dcfce7", color: "#166534" },
  cancelled: { background: "#fee2e2", color: "#991b1b" },
};
