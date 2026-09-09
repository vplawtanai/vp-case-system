"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { translate } from "../../../lib/i18n/catalog";
import { uiMessage, type UiMessage, type UiLocale } from "../../../lib/i18n/core";
import ChargeVatControl, { ChargeValidationSummary, type ChargeVatHandle } from "./ChargeVatControl";
import { validateChargeVat, refreshChargeVatErrors, isChargeVatBackendError } from "./vat-workflow";
import type { VatEvidence } from "../document-decision/shared";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import DetailModal from "../../components/DetailModal";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissionProfile } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import { calculateFinanceLineAmounts, type FinancePriceTaxMode } from "../finance-line-amounts";
import FinanceSubNav from "../FinanceSubNav";
import BillableChargeCreateModal from "./BillableChargeCreateModal";
import { billableChargeNatureLabel, clientCostFundingModeLabel, clientCostFundingModeRequired, fundingModeForSource, type ClientCostFundingMode } from "./funding-semantics";
import styles from "./billable-charges.module.css";

type Profile = UserPermissionProfile & {
  full_name?: string | null;
  can_view_finance_billable_charges?: boolean | null;
  can_manage_finance_billable_charges?: boolean | null;
  can_approve_finance_billable_charges?: boolean | null;
};

type ChargeStatus = "draft" | "ready_to_invoice" | "reserved" | "invoiced" | "cancelled";
type SourceType = "ad_hoc_service" | "recoverable_cost" | "billing_installment_item";
type EconomicClassification = "professional_fee" | "additional_service" | "reimbursable_expense" | "government_or_court_fee" | "other";
type MatterMode = "unlinked" | "case" | "advisory";

type BillableCharge = {
  id: string;
  client_id: string;
  case_id: number | null;
  advisory_matter_id: string | null;
  source_type: SourceType;
  client_cost_funding_mode: ClientCostFundingMode | null;
  source_reference: string | null;
  description: string | null;
  quantity: number | string;
  unit: string | null;
  unit_rate: number | string;
  currency: string;
  service_date: string | null;
  economic_classification: EconomicClassification | null;
  vat_treatment_json?: VatEvidence | null;
  vat_applicable: boolean;
  vat_rate: number | string;
  tax_category: string | null;
  price_tax_mode: FinancePriceTaxMode;
  amount_before_vat: number | string;
  vat_amount: number | string;
  total_amount: number | string;
  status: ChargeStatus;
  ready_to_invoice_at: string | null;
  ready_by_user_id: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
  created_at: string;
  created_by_user_id: string | null;
  updated_at: string;
};

type ClientOption = { id: string; name: string | null; client_type: string | null };
type CaseOption = { id: number; client_id: string | null; file_no: string | null; title: string | null };
type AdvisoryOption = { id: string; client_id: string | null; matter_no: string | null; title: string | null };
type AuditEvent = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_email: string | null;
  created_at: string;
};
type ChargeInvoiceLink = { invoiceId: string; invoiceNo: string | null; documentStatus: string };
type BillingPlanReturnContext = { returnTo: string; returnLabel: UiMessage; clientId: string; caseId: number | null; advisoryMatterId: string | null; clientName: string | null; };

type ChargeForm = {
  vatTreatment?: VatEvidence | null;
  sourceType: "ad_hoc_service" | "recoverable_cost";
  clientCostFundingMode: "" | ClientCostFundingMode;
  clientId: string;
  matterMode: MatterMode;
  caseId: string;
  advisoryMatterId: string;
  serviceDate: string;
  description: string;
  quantity: string;
  unit: string;
  unitRate: string;
  economicClassification: "" | EconomicClassification;
  priceTaxMode: FinancePriceTaxMode;
  vatRate: string;
  sourceReference: string;
  taxCategory: string;
};

type CreateAttempt = {
  requestId: string;
  payload: {
    p_client_id: string;
    p_case_id: number | null;
    p_advisory_matter_id: string | null;
    p_source_type: string;
    p_client_cost_funding_mode: ClientCostFundingMode | null;
    p_source_reference: string | null;
    p_source_event_key: null;
    p_source_snapshot_json: Record<string, never>;
    p_request_id: string;
  };
};

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
  "can_manage_finance_payments",
  "can_confirm_finance_payments",
  "can_reverse_finance_payments",
  "can_reallocate_finance_payments",
  "can_view_finance_receipts",
  "can_manage_finance_receipts",
  "can_issue_finance_receipts",
  "can_void_finance_receipts",
  "can_view_finance_cash_transactions",
  "can_manage_finance_cash_transactions",
  "can_confirm_finance_cash_transactions",
  "can_reverse_finance_cash_transactions",
  "can_view_finance_billable_charges",
  "can_manage_finance_billable_charges",
  "can_approve_finance_billable_charges",
].join(", ");

function localizedStatusTabs(locale: UiLocale): Array<{ value: "all" | ChargeStatus; label: string }> { return [
  { value: "all", label: translate(locale, "finance.charge.ui.all") },
  { value: "draft", label: translate(locale, "finance.charge.ui.draft") },
  { value: "ready_to_invoice", label: translate(locale, "finance.invoice.ui.readyToInvoice") },
  { value: "reserved", label: translate(locale, "finance.charge.ui.reserved") },
  { value: "invoiced", label: translate(locale, "finance.invoice.installment.invoiced") },
  { value: "cancelled", label: translate(locale, "finance.invoice.installment.cancelled") },
]; }

export default function BillableChargesPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<PageShell><div className={styles.loading}>{t("finance.charge.ui.loading")}</div></PageShell>}>
      <BillableChargesWorkspace />
    </Suspense>
  );
}

function BillableChargesWorkspace() {
  const { t, text, date, locale } = useI18n();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile>({ role: "" });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(true);
  const [charges, setCharges] = useState<BillableCharge[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [advisories, setAdvisories] = useState<AdvisoryOption[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState<"all" | ChargeStatus>("all");
  const [search, setSearch] = useState("");
  const [detailChargeId, setDetailChargeId] = useState("");
  const [detailAudits, setDetailAudits] = useState<AuditEvent[]>([]);
  const [detailAuditLoading, setDetailAuditLoading] = useState(false);
  const [chargeInvoiceLinks, setChargeInvoiceLinks] = useState<Record<string, ChargeInvoiceLink>>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [chargeId, setChargeId] = useState("");
  const [form, setForm] = useState<ChargeForm>(() => emptyForm());
  const [baseline, setBaseline] = useState("");
  const [errors, setErrors] = useState<Record<string, UiMessage | "">>({});
  const [message, setMessage] = useState<UiMessage | string>("");
  const [error, setError] = useState<UiMessage | string>("");
  const [saving, setSaving] = useState(false);
  const [createSourceLocked, setCreateSourceLocked] = useState(false);
  const [readyAcknowledged, setReadyAcknowledged] = useState(false);
  const [cancelContext, setCancelContext] = useState<"editor" | "detail" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [billingPlanSource, setBillingPlanContext] = useState<BillingPlanReturnContext | null>(null);

  const panelRef = useRef<HTMLElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const vatRef = useRef<ChargeVatHandle>(null);
  const actionLockRef = useRef(false);
  const detailAuditRequestRef = useRef(0);
  const createAttemptRef = useRef<CreateAttempt | null>(null);
  const deepLinkHandledRef = useRef(false);
  const permissions = useMemo(() => buildPermissions(profile), [profile]);
  const canComposeInvoice = permissions.canEditFinanceQuotation && permissions.canManageFinanceBillableCharges;
  const selectedCharge = useMemo(() => charges.find((item) => item.id === chargeId) || null, [chargeId, charges]);
  const detailCharge = useMemo(() => charges.find((item) => item.id === detailChargeId) || null, [charges, detailChargeId]);
  const dirty = panelOpen && formFingerprint(form) !== baseline;
  const amounts = useMemo(() => calculateFormAmounts(form), [form]);
  const clientCases = useMemo(() => cases.filter((item) => item.client_id === form.clientId), [cases, form.clientId]);
  const clientAdvisories = useMemo(() => advisories.filter((item) => item.client_id === form.clientId), [advisories, form.clientId]);

  useEffect(() => {
    const loadProfile = async () => {
      setLoadingProfile(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setLoadingProfile(false);
        return;
      }
      const { data, error: profileError } = await supabase.from("user_profiles").select(profileSelect).eq("id", authData.user.id).single();
      if (profileError) console.error("LOAD BILLABLE CHARGE PROFILE FAILED", profileError);
      setProfile((data || { role: "" }) as Profile);
      setLoadingProfile(false);
    };
    void loadProfile();
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!permissions.canViewFinanceBillableCharges) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [chargeResult, clientResult, caseResult, advisoryResult, allocationResult] = await Promise.all([
      supabase.from("finance_billable_charges").select("*").neq("source_type", "billing_installment_item").order("created_at", { ascending: false }),
      supabase.from("clients").select("id,name,client_type").order("name"),
      supabase.from("cases").select("id,client_id,file_no,title").order("created_at", { ascending: false }),
      supabase.from("advisory_matters").select("id,client_id,matter_no,title").order("created_at", { ascending: false }),
      supabase.from("finance_invoice_charge_allocations").select("billable_charge_id,invoice_id,status").in("status", ["reserved", "invoiced"]),
    ]);
    const firstError = chargeResult.error || clientResult.error || caseResult.error || advisoryResult.error || allocationResult.error;
    if (firstError) {
      console.error("LOAD BILLABLE CHARGE WORKSPACE FAILED", { chargeResult, clientResult, caseResult, advisoryResult });
      setError(uiMessage("finance.charge.ui.loadFailed"));
    } else {
      setCharges((chargeResult.data || []) as BillableCharge[]);
      setClients((clientResult.data || []) as ClientOption[]);
      setCases((caseResult.data || []) as CaseOption[]);
      setAdvisories((advisoryResult.data || []) as AdvisoryOption[]);
      const allocations = (allocationResult.data || []) as Array<{ billable_charge_id: string; invoice_id: string; status: string }>;
      const invoiceIds = [...new Set(allocations.map((row) => row.invoice_id))];
      const invoiceResult = invoiceIds.length
        ? await supabase.from("finance_invoices").select("id,invoice_no,document_status").in("id", invoiceIds)
        : { data: [], error: null };
      if (invoiceResult.error) console.error("LOAD BILLABLE CHARGE INVOICE LINKS FAILED", invoiceResult.error);
      const invoices = new Map(((invoiceResult.data || []) as Array<{ id: string; invoice_no: string | null; document_status: string }>).map((row) => [row.id, row]));
      setChargeInvoiceLinks(Object.fromEntries(allocations.flatMap((allocation) => {
        const invoice = invoices.get(allocation.invoice_id);
        return invoice ? [[allocation.billable_charge_id, { invoiceId: invoice.id, invoiceNo: invoice.invoice_no, documentStatus: invoice.document_status }]] : [];
      })));
    }
    setLoading(false);
  }, [permissions.canViewFinanceBillableCharges]);

  useEffect(() => {
    if (!loadingProfile) void loadWorkspace();
  }, [loadWorkspace, loadingProfile]);

  const scrollToPanel = () => window.requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  const scrollToReview = () => window.requestAnimationFrame(() => {
    reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    reviewRef.current?.focus({ preventScroll: true });
  });

  const openNew = useCallback((prefill?: Partial<ChargeForm>) => {
    const next = { ...emptyForm(), ...prefill };
    detailAuditRequestRef.current += 1;
    setDetailChargeId("");
    setDetailAudits([]);
    setDetailAuditLoading(false);
    setChargeId("");
    setForm(next);
    setBaseline(formFingerprint(next));
    setAudits([]);
    setErrors({});
    setReadyAcknowledged(false);
    setCancelContext(null);
    setCancelReason("");
    setMessage("");
    setError("");
    setPanelOpen(false);
    setCreateOpen(true);
    setCreateSourceLocked(false);
    createAttemptRef.current = null;
  }, []);

  useEffect(() => {
    if (loading || deepLinkHandledRef.current || searchParams.get("new") !== "1" || !permissions.canViewFinanceBillableCharges) return;
    deepLinkHandledRef.current = true;
    let active = true;

    const openDeepLink = async () => {
      const requestedClientId = searchParams.get("client") || "";
      const requestedCaseId = searchParams.get("case") || "";
      const requestedAdvisoryId = searchParams.get("advisory") || "";
      const requestedReturnTo = searchParams.get("returnTo");
      const requestedResumeInstallmentId = searchParams.get("resumeInvoiceForInstallment") || "";
      const returnTo = safeBillingPlanReturnPath(requestedReturnTo);

      const failPreselection = (message: UiMessage) => {
        if (!active) return;
        setBillingPlanContext(null);
        openNew();
        setError(message);
      };

      if (requestedReturnTo && !returnTo) {
        failPreselection(uiMessage("finance.charge.ui.returnLinkInvalid"));
        return;
      }

      if (returnTo) {
        const planId = returnTo.split("/").at(-1) || "";
        const planResult = await supabase.from("finance_billing_plans").select("id,fee_agreement_id").eq("id", planId).maybeSingle();
        if (planResult.error || !planResult.data) {
          console.error("LOAD BILLABLE CHARGE BILLING PLAN CONTEXT FAILED", planResult.error);
          failPreselection(uiMessage("finance.charge.ui.planMissing"));
          return;
        }
        const agreementResult = await supabase
          .from("finance_fee_agreements")
          .select("client_id,case_id,advisory_matter_id")
          .eq("id", planResult.data.fee_agreement_id)
          .maybeSingle();
        if (agreementResult.error || !agreementResult.data) {
          console.error("LOAD BILLABLE CHARGE AGREEMENT CONTEXT FAILED", agreementResult.error);
          failPreselection(uiMessage("finance.charge.ui.planContextMissing"));
          return;
        }

        const canonicalClientId = String(agreementResult.data.client_id || "");
        const canonicalCaseId = agreementResult.data.case_id === null ? "" : String(agreementResult.data.case_id);
        const canonicalAdvisoryId = String(agreementResult.data.advisory_matter_id || "");
        const client = clients.find((item) => item.id === canonicalClientId);
        const caseItem = canonicalCaseId ? cases.find((item) => String(item.id) === canonicalCaseId && item.client_id === canonicalClientId) : null;
        const advisory = canonicalAdvisoryId ? advisories.find((item) => item.id === canonicalAdvisoryId && item.client_id === canonicalClientId) : null;
        const queryMatchesCanonical = requestedClientId === canonicalClientId && requestedCaseId === canonicalCaseId && requestedAdvisoryId === canonicalAdvisoryId;
        const matterIsValid = canonicalCaseId ? Boolean(caseItem) : canonicalAdvisoryId ? Boolean(advisory) : true;

        if (!client || !queryMatchesCanonical || !matterIsValid || (canonicalCaseId && canonicalAdvisoryId)) {
          failPreselection(uiMessage("finance.charge.ui.planContextChanged"));
          return;
        }
        let finalReturnTo = returnTo;
        let returnLabel = uiMessage("finance.invoice.ui.backToPlan");
        if (requestedResumeInstallmentId) {
          if (!isUuid(requestedResumeInstallmentId)) {
            failPreselection(uiMessage("finance.charge.ui.composerReturnInvalid"));
            return;
          }
          const installmentResult = await supabase
            .from("finance_billing_installments")
            .select("id")
            .eq("id", requestedResumeInstallmentId)
            .eq("billing_plan_id", planId)
            .maybeSingle();
          if (installmentResult.error || !installmentResult.data) {
            console.error("LOAD BILLABLE CHARGE RESUME INSTALLMENT FAILED", installmentResult.error);
            failPreselection(uiMessage("finance.charge.ui.installmentMissing"));
            return;
          }
          finalReturnTo = `${returnTo}?resumeInvoiceForInstallment=${encodeURIComponent(requestedResumeInstallmentId)}`;
          returnLabel = uiMessage("finance.charge.ui.backToCompose");
        }
        if (!active) return;
        setBillingPlanContext({ returnTo: finalReturnTo, returnLabel, clientId: canonicalClientId, caseId: canonicalCaseId ? Number(canonicalCaseId) : null, advisoryMatterId: canonicalAdvisoryId || null, clientName: client.name });
        openNew({
          clientId: canonicalClientId,
          matterMode: canonicalCaseId ? "case" : canonicalAdvisoryId ? "advisory" : "unlinked",
          caseId: canonicalCaseId,
          advisoryMatterId: canonicalAdvisoryId,
        });
        return;
      }

      if (!requestedClientId && !requestedCaseId && !requestedAdvisoryId) {
        if (active) openNew();
        return;
      }
      const client = clients.find((item) => item.id === requestedClientId);
      const caseItem = requestedCaseId ? cases.find((item) => String(item.id) === requestedCaseId && item.client_id === requestedClientId) : null;
      const advisory = requestedAdvisoryId ? advisories.find((item) => item.id === requestedAdvisoryId && item.client_id === requestedClientId) : null;
      if (!client || (requestedCaseId && !caseItem) || (requestedAdvisoryId && !advisory) || (requestedCaseId && requestedAdvisoryId)) {
        failPreselection(uiMessage("finance.charge.ui.planContextChanged"));
        return;
      }
      if (!active) return;
      openNew({ clientId: requestedClientId, matterMode: requestedCaseId ? "case" : requestedAdvisoryId ? "advisory" : "unlinked", caseId: requestedCaseId, advisoryMatterId: requestedAdvisoryId });
    };

    void openDeepLink();
    return () => { active = false; };
  }, [advisories, cases, clients, loading, openNew, permissions.canViewFinanceBillableCharges, searchParams]);

  const fetchAudit = useCallback(async (id: string) => {
    const { data, error: auditError } = await supabase
      .from("finance_billable_charge_audit_events")
      .select("id,event_type,actor_name,actor_email,created_at")
      .eq("charge_id", id)
      .order("created_at", { ascending: true });
    if (auditError) console.error("LOAD BILLABLE CHARGE AUDIT FAILED", auditError);
    return (data || []) as AuditEvent[];
  }, []);

  const loadAudit = async (id: string) => {
    setAudits(await fetchAudit(id));
  };

  const closeChargeDetails = useCallback(() => {
    detailAuditRequestRef.current += 1;
    setDetailChargeId("");
    setDetailAudits([]);
    setDetailAuditLoading(false);
    setCancelContext(null);
    setCancelReason("");
    setErrors((current) => ({ ...current, cancelReason: "" }));
  }, []);

  const openChargeDetails = (charge: BillableCharge) => {
    closeChargeDetails();
    setMessage("");
    setError("");
    const requestId = detailAuditRequestRef.current + 1;
    detailAuditRequestRef.current = requestId;
    setDetailChargeId(charge.id);
    setDetailAuditLoading(true);
    void fetchAudit(charge.id).then((events) => {
      if (detailAuditRequestRef.current === requestId) {
        setDetailAudits(events);
        setDetailAuditLoading(false);
      }
    });
  };

  const sourceReviewHandled = useRef(false);
  useEffect(() => {
    if (loading || sourceReviewHandled.current) return;
    sourceReviewHandled.current = true;
    const requestedId = searchParams.get("charge") || "";
    const source = isUuid(requestedId) ? charges.find(row => row.id === requestedId) : null;
    if (!source) return;
    const requestId = ++detailAuditRequestRef.current;
    setDetailChargeId(source.id);
    setDetailAuditLoading(true);
    void fetchAudit(source.id).then(events => {
      if (detailAuditRequestRef.current === requestId) {
        setDetailAudits(events);
        setDetailAuditLoading(false);
      }
    });
  }, [charges, loading, searchParams, fetchAudit]);

  const openCharge = (charge: BillableCharge) => {
    const next = chargeToForm(charge);
    closeChargeDetails();
    setChargeId(charge.id);
    setForm(next);
    setBaseline(formFingerprint(next));
    setErrors({});
    setReadyAcknowledged(false);
    setCancelContext(null);
    setCancelReason("");
    setMessage("");
    setError("");
    setPanelOpen(true);
    setCreateSourceLocked(false);
    createAttemptRef.current = null;
    void loadAudit(charge.id);
    scrollToPanel();
  };

  const reloadCharge = async (id: string) => {
    const { data, error: chargeError } = await supabase.from("finance_billable_charges").select("*").eq("id", id).single();
    if (chargeError) throw chargeError;
    const authoritative = data as BillableCharge;
    const next = chargeToForm(authoritative);
    setCharges((current) => [authoritative, ...current.filter((item) => item.id !== authoritative.id)].sort(sortCharges));
    setChargeId(authoritative.id);
    setForm(next);
    setBaseline(formFingerprint(next));
    await loadAudit(authoritative.id);
    return authoritative;
  };

  const updateForm = <K extends keyof ChargeForm>(field: K, value: ChargeForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setMessage("");
  };

  const setMatterMode = (mode: MatterMode) => {
    setForm((current) => ({ ...current, matterMode: mode, caseId: "", advisoryMatterId: "" }));
    setErrors((current) => ({ ...current, matter: "" }));
  };

  const saveDraft = async () => {
    const nextErrors = validateDraft(form);
    setErrors(nextErrors);
    if (actionLockRef.current || Object.keys(nextErrors).length || !permissions.canManageFinanceBillableCharges) {
      if (!vatRef.current?.focusErrors(nextErrors)) focusFirstError(nextErrors, locale);
      return;
    }
    const isFirstSave = !chargeId;
    actionLockRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let id = chargeId;
      if (!id) {
        if (!createAttemptRef.current) {
          const requestId = crypto.randomUUID();
          createAttemptRef.current = {
            requestId,
            payload: {
              p_client_id: form.clientId,
              p_case_id: form.matterMode === "case" ? Number(form.caseId) : null,
              p_advisory_matter_id: form.matterMode === "advisory" ? form.advisoryMatterId : null,
              p_source_type: form.sourceType,
              p_client_cost_funding_mode: fundingModeForSource(form.sourceType, form.clientCostFundingMode),
              p_source_reference: nullable(form.sourceReference),
              p_source_event_key: null,
              p_source_snapshot_json: {},
              p_request_id: requestId,
            },
          };
          setCreateSourceLocked(true);
        }
        const createResult = await supabase.rpc("create_finance_billable_charge_draft", createAttemptRef.current.payload);
        if (createResult.error) throw createResult.error;
        id = String(createResult.data);
        setChargeId(id);
      }

      const saveResult = await supabase.rpc("save_finance_billable_charge_draft", {
        p_charge_id: id,
        p_client_id: form.clientId,
        p_case_id: form.matterMode === "case" ? Number(form.caseId) : null,
        p_advisory_matter_id: form.matterMode === "advisory" ? form.advisoryMatterId : null,
        p_client_cost_funding_mode: fundingModeForSource(form.sourceType, form.clientCostFundingMode),
        p_source_reference: nullable(form.sourceReference),
        p_source_snapshot_json: { vat_treatment_json: form.vatTreatment || null },
        p_description: nullable(form.description),
        p_quantity: Number(form.quantity),
        p_unit: nullable(form.unit),
        p_unit_rate: Number(form.unitRate || 0),
        p_currency: "THB",
        p_service_date: form.serviceDate || null,
        p_economic_classification: form.economicClassification || null,
        p_price_tax_mode: form.priceTaxMode,
        p_vat_rate: form.priceTaxMode === "non_vat" ? 0 : Number(form.vatRate),
        p_tax_category: nullable(form.taxCategory),
      });
      if (saveResult.error) throw saveResult.error;
      await reloadCharge(id);
      setMessage(uiMessage("finance.charge.ui.saved"));
      if (isFirstSave) scrollToReview();
    } catch (caught) {
      console.error("SAVE BILLABLE CHARGE DRAFT FAILED", caught);
      if (isChargeVatBackendError(caught)) {
        const vatErrors = { ...validateChargeVat(form), vatTreatment: uiMessage("finance.charge.vat.conflict") };
        setErrors(current => ({ ...current, ...vatErrors }));
        vatRef.current?.focusErrors(vatErrors);
      }
      setError(billableChargeError(caught, uiMessage("finance.charge.ui.saveFailed")));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  const markReady = async () => {
    const nextErrors = validateReady(form);
    if (dirty) nextErrors.ready = uiMessage("finance.charge.ui.saveBeforeReadyDirty");
    if (!chargeId) nextErrors.ready = uiMessage("finance.charge.ui.saveBeforeReady");
    if (!readyAcknowledged) nextErrors.acknowledgement = uiMessage("finance.charge.ui.reviewRequired");
    setErrors(nextErrors);
    if (actionLockRef.current || Object.keys(nextErrors).length || !permissions.canApproveFinanceBillableCharges) {
      if (!vatRef.current?.focusErrors(nextErrors)) focusFirstError(nextErrors, locale);
      return;
    }
    actionLockRef.current = true;
    setSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("mark_finance_billable_charge_ready", {
        p_charge_id: chargeId,
        p_human_confirmed: true,
      });
      if (rpcError) throw rpcError;
      await reloadCharge(chargeId);
      setReadyAcknowledged(false);
      setMessage(uiMessage("finance.charge.ui.readySuccess"));
    } catch (caught) {
      console.error("MARK BILLABLE CHARGE READY FAILED", caught);
      setError(billableChargeError(caught, uiMessage("finance.charge.ui.readyFailed")));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  const cancelCharge = async (targetChargeId = chargeId, context: "editor" | "detail" = "editor") => {
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      setErrors((current) => ({ ...current, cancelReason: uiMessage("finance.charge.ui.cancelReasonRequired") }));
      return;
    }
    if (actionLockRef.current || !targetChargeId) return;
    actionLockRef.current = true;
    setSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("cancel_finance_billable_charge", {
        p_charge_id: targetChargeId,
        p_cancel_reason: trimmedReason,
      });
      if (rpcError) throw rpcError;
      if (context === "editor") {
        await reloadCharge(targetChargeId);
      } else {
        const { data, error: chargeError } = await supabase.from("finance_billable_charges").select("*").eq("id", targetChargeId).single();
        if (chargeError) throw chargeError;
        const authoritative = data as BillableCharge;
        setCharges((current) => [authoritative, ...current.filter((item) => item.id !== authoritative.id)].sort(sortCharges));
        setDetailAudits(await fetchAudit(targetChargeId));
      }
      setCancelContext(null);
      setCancelReason("");
      setMessage(uiMessage("finance.charge.ui.cancelledSuccess"));
    } catch (caught) {
      console.error("CANCEL BILLABLE CHARGE FAILED", caught);
      setError(billableChargeError(caught, uiMessage("finance.charge.ui.cancelFailed")));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  const billingPlanContext = billingPlanSource ? { ...billingPlanSource, returnLabel: text(billingPlanSource.returnLabel), clientName: billingPlanSource.clientName || t("finance.invoice.composer.unnamedClient"), matterLabel: matterLabel({ case_id: billingPlanSource.caseId, advisory_matter_id: billingPlanSource.advisoryMatterId }, cases, advisories, locale) } : null;

  const filteredCharges = useMemo(() => charges.filter((charge) => {
    if (filter !== "all" && charge.status !== filter) return false;
    if (!search.trim()) return true;
    const haystack = [charge.description, charge.source_reference, clientLabel(charge.client_id, clients, locale), matterLabel(charge, cases, advisories, locale)].join(" ").toLocaleLowerCase("th");
    return haystack.includes(search.trim().toLocaleLowerCase("th"));
  }), [advisories, cases, charges, clients, filter, search, locale]);

  useEffect(() => {
    if (!detailChargeId || filteredCharges.some((charge) => charge.id === detailChargeId)) return;
    closeChargeDetails();
  }, [closeChargeDetails, detailChargeId, filteredCharges]);

  const canCancelSelected = selectedCharge?.status === "draft"
    ? permissions.canManageFinanceBillableCharges
    : selectedCharge?.status === "ready_to_invoice"
      ? permissions.canApproveFinanceBillableCharges
      : false;
  const canCancelDetail = detailCharge?.status === "draft"
    ? permissions.canManageFinanceBillableCharges
    : detailCharge?.status === "ready_to_invoice"
      ? permissions.canApproveFinanceBillableCharges
      : false;
  const canEditDetailDraft = detailCharge?.status === "draft" && detailCharge.source_type !== "billing_installment_item" && permissions.canManageFinanceBillableCharges;

  return (
    <PageShell>
      {loadingProfile || loading ? <div className={styles.loading}>{t("finance.charge.ui.loading")}</div> : null}
      {!loadingProfile && !permissions.canViewFinanceBillableCharges ? <div className={styles.noAccess}><h1>{t("finance.charge.ui.accessDenied")}</h1><p>{t("finance.charge.ui.accessDeniedHelp")}</p></div> : null}
      {!loadingProfile && permissions.canViewFinanceBillableCharges ? <>
        <FinanceSubNav activePage="billable-charges" permissions={permissions} />
        <header className={styles.workspaceHeader}>
          <div><span className={styles.eyebrow}>{t("finance.invoice.ui.workspace")}</span><h1>{t("finance.invoice.ui.additionalCharges")}</h1><p>{t("finance.charge.ui.workspaceHelp")}</p></div>
          <div className={styles.headerActions}>{canComposeInvoice ? <Link className={styles.secondaryButton} href="/finance/invoices/compose">{t("finance.invoice.composer.compose")}</Link> : null}{permissions.canManageFinanceBillableCharges ? <button className={styles.primaryButton} type="button" onClick={() => { setBillingPlanContext(null); openNew(); }}><PlusIcon />{t("finance.charge.ui.create")}</button> : null}</div>
        </header>

        {billingPlanContext ? <section className={styles.billingPlanContext} aria-label={t("finance.charge.ui.planContext")}>
          <div><span className={styles.eyebrow}>{t("finance.charge.ui.addForPlan")}</span><strong>{billingPlanContext.clientName}</strong><span>{billingPlanContext.matterLabel}</span><p>{t("finance.charge.ui.combineWithPlanHelp")}</p></div>
          <Link className={styles.secondaryButton} href={billingPlanContext.returnTo}>{billingPlanContext.returnLabel}</Link>
        </section> : null}

        {error ? <div className={styles.errorBanner}>{text(error)}</div> : null}
        {message ? <div className={styles.successBanner}>{text(message)}</div> : null}

        <section className={styles.listSection}>
          <div className={styles.filterBar}>
            <div className={styles.tabs} aria-label={t("finance.charge.ui.statusFilter")}>{localizedStatusTabs(locale).map((tab) => <button key={tab.value} type="button" className={filter === tab.value ? styles.activeTab : ""} onClick={() => { closeChargeDetails(); setFilter(tab.value); }}>{tab.label}<span>{countStatus(charges, tab.value)}</span></button>)}</div>
            <input aria-label={t("finance.charge.ui.searchLabel")} value={search} onChange={(event) => { closeChargeDetails(); setSearch(event.target.value); }} placeholder={t("finance.charge.ui.searchPlaceholder")} />
          </div>
          {!filteredCharges.length ? <div className={styles.emptyState}><strong>{charges.length ? t("finance.charge.ui.noMatches") : t("finance.charge.ui.empty")}</strong><p>{charges.length ? t("finance.charge.ui.adjustFilters") : t("finance.charge.ui.emptyHelp")}</p></div> : <div className={styles.chargeGrid}>{filteredCharges.map((charge) => <article key={charge.id} className={styles.chargeCard}>
              <div className={styles.chargeCardHeader}><div><span>{date(charge.service_date || charge.created_at)}</span><h2>{charge.description || t("finance.charge.ui.draftCharge")}</h2></div><StatusBadge status={charge.status} /></div>
              <div className={styles.chargeContext}><strong>{clientLabel(charge.client_id, clients, locale)}</strong><span>{matterLabel(charge, cases, advisories, locale)}</span></div>
              <dl className={styles.cardMetrics}><div><dt>{t("finance.invoice.ui.classification")}</dt><dd>{classificationLabel(charge.economic_classification, locale)}</dd></div><div><dt>VAT</dt><dd>{taxModeLabel(charge.price_tax_mode, charge.vat_rate, locale)}</dd></div><div><dt>{t("finance.charge.ui.chargeAmount")}</dt><dd>{money(charge.total_amount, charge.currency)}</dd></div></dl>
              <button className={styles.openButton} type="button" onClick={() => openChargeDetails(charge)}>{t("finance.invoice.ui.details")}</button>
            </article>)}</div>}
        </section>

        {detailCharge ? <DetailModal open title={detailCharge.description || t("finance.charge.ui.draftCharge")} subtitle={<>{clientLabel(detailCharge.client_id, clients, locale)} · {matterLabel(detailCharge, cases, advisories, locale)}</>} status={<StatusBadge status={detailCharge.status} />} prominentValue={money(detailCharge.total_amount, detailCharge.currency)} footer={billingPlanContext ? <div className={styles.returnFooter}><Link className={detailCharge.status === "ready_to_invoice" ? styles.primaryButton : styles.secondaryButton} href={billingPlanContext.returnTo}>{billingPlanContext.returnLabel}</Link></div> : undefined} onClose={closeChargeDetails}>
          <BillableChargeModalDetail charge={detailCharge} clients={clients} cases={cases} advisories={advisories} />
          {chargeInvoiceLinks[detailCharge.id] ? <div className={styles.detailActionRow}><Link className={styles.secondaryButton} href={`/finance/invoices/${chargeInvoiceLinks[detailCharge.id].invoiceId}`}>{t("finance.invoice.ui.open")} {chargeInvoiceLinks[detailCharge.id].invoiceNo || t("finance.charge.ui.draftVersion")}</Link></div> : null}
          {detailCharge.status === "ready_to_invoice" && !chargeInvoiceLinks[detailCharge.id] && canComposeInvoice ? <div className={styles.detailActionRow}><Link className={styles.primaryButton} href={`/finance/invoices/compose?charge=${detailCharge.id}`}>{t("finance.invoice.composer.compose")}</Link></div> : null}
          {canEditDetailDraft ? <div className={styles.detailActionRow}><button className={styles.secondaryButton} type="button" onClick={() => openCharge(detailCharge)}>{t("finance.charge.ui.editDraft")}</button></div> : null}
          <AuditHistory audits={detailAudits} loading={detailAuditLoading} />
          {canCancelDetail ? <section className={styles.otherActions}><div><strong>{t("finance.invoice.ui.otherActions")}</strong><p>{t("finance.charge.ui.cancelHelp")}</p></div>{cancelContext === "detail" ? <div className={styles.cancelForm}><FormField label={t("finance.charge.ui.cancelReason")} error={errors.cancelReason}><textarea rows={3} value={cancelReason} onChange={(event) => { setCancelReason(event.target.value); setErrors((current) => ({ ...current, cancelReason: "" })); }} /></FormField><div className={styles.actionRow}><button className={styles.secondaryButton} type="button" onClick={() => setCancelContext(null)}>{t("finance.charge.ui.dismissAction")}</button><button className={styles.dangerButton} type="button" disabled={saving} onClick={() => void cancelCharge(detailCharge.id, "detail")}>{t("finance.charge.ui.confirmCancel")}</button></div></div> : <button className={styles.dangerButton} type="button" onClick={() => setCancelContext("detail")}>{t("finance.charge.ui.cancel")}</button>}</section> : null}
        </DetailModal> : null}

        {createOpen ? <BillableChargeCreateModal
          clients={clients} cases={cases} advisories={advisories}
          initialSelection={{ clientId: form.clientId, matterMode: form.matterMode, caseId: form.caseId, advisoryMatterId: form.advisoryMatterId }}
          context={billingPlanContext ? { clientId: billingPlanContext.clientId, clientName: billingPlanContext.clientName, caseId: billingPlanContext.caseId, advisoryMatterId: billingPlanContext.advisoryMatterId, matterLabel: billingPlanContext.matterLabel } : undefined}
          canManage={permissions.canManageFinanceBillableCharges} canApprove={permissions.canApproveFinanceBillableCharges}
          onClose={() => setCreateOpen(false)}
          onSaved={async () => { await loadWorkspace(); setFilter("draft"); setSearch(""); setMessage(uiMessage("finance.charge.ui.saved")); }}
        /> : null}

        {panelOpen ? <section ref={panelRef} className={styles.editorSection}>
          <div className={styles.editorHeader}><div><span className={styles.eyebrow}>{chargeId ? t("finance.charge.ui.itemDetails") : t("finance.charge.ui.created")}</span><h2>{chargeId ? selectedCharge?.status === "draft" ? t("finance.charge.ui.editChargeDraft") : t("finance.charge.ui.chargeDetails") : t("finance.charge.ui.addCharge")}</h2><p>{selectedCharge?.status === "draft" || !chargeId ? t("finance.charge.ui.chargeSemantics") : statusExplanation(selectedCharge?.status, locale)}</p></div><button className={styles.iconButton} type="button" aria-label={t("finance.charge.ui.closeDetails")} onClick={() => { setPanelOpen(false); if (!chargeId) void loadWorkspace(); }}>×</button></div>
          {billingPlanContext ? <div className={`${styles.editorReturn} ${selectedCharge?.status === "ready_to_invoice" ? styles.editorReturnReady : ""}`}><div><strong>{selectedCharge?.status === "ready_to_invoice" ? t("finance.charge.ui.readyToReturn") : t("finance.charge.ui.openedFromPlan")}</strong><span>{billingPlanContext.clientName} · {billingPlanContext.matterLabel}</span></div><Link className={selectedCharge?.status === "ready_to_invoice" ? styles.primaryButton : styles.secondaryButton} href={billingPlanContext.returnTo}>{billingPlanContext.returnLabel}</Link></div> : null}

          {selectedCharge && (selectedCharge.status !== "draft" || selectedCharge.source_type === "billing_installment_item") ? <ReadOnlyDetail charge={selectedCharge} clients={clients} cases={cases} advisories={advisories} /> : <>
            <ChargeValidationSummary errors={errors} />
            {!permissions.canManageFinanceBillableCharges ? <div className={styles.readOnlyNotice}>{t("finance.charge.ui.draftReadOnly")}</div> : null}
            {!chargeId ? <fieldset className={styles.sourceChoices}><legend>{t("finance.charge.ui.nature")}</legend><label className={form.sourceType === "ad_hoc_service" ? styles.choiceActive : ""}><input type="radio" name="sourceType" value="ad_hoc_service" disabled={createSourceLocked || !permissions.canManageFinanceBillableCharges} checked={form.sourceType === "ad_hoc_service"} onChange={() => { updateForm("sourceType", "ad_hoc_service"); updateForm("clientCostFundingMode", ""); }} /><span><strong>{t("finance.charge.ui.additionalNature")}</strong><small>{t("finance.charge.ui.additionalNatureHelp")}</small></span></label><label className={form.sourceType === "recoverable_cost" ? styles.choiceActive : ""}><input type="radio" name="sourceType" value="recoverable_cost" disabled={createSourceLocked || !permissions.canManageFinanceBillableCharges} checked={form.sourceType === "recoverable_cost"} onChange={() => updateForm("sourceType", "recoverable_cost")} /><span><strong>{t("finance.charge.ui.recoverableNature")}</strong><small>{t("finance.charge.ui.recoverableNatureHelp")}</small></span></label></fieldset> : <div className={styles.sourceSummary}><span>{t("finance.charge.ui.nature")}</span><strong>{sourceTypeLabel(form.sourceType, locale)}</strong></div>}

            {form.sourceType === "recoverable_cost" ? <><fieldset id="billable-charge-funding-mode" className={`${styles.sourceChoices} ${errors.clientCostFundingMode ? styles.invalidChoices : ""}`}><legend>{t("finance.charge.ui.fundingMode")}</legend><label className={form.clientCostFundingMode === "collect_before_disbursement" ? styles.choiceActive : ""}><input type="radio" name="clientCostFundingMode" disabled={!permissions.canManageFinanceBillableCharges} checked={form.clientCostFundingMode === "collect_before_disbursement"} onChange={() => updateForm("clientCostFundingMode", "collect_before_disbursement")} /><span><strong>{t("finance.charge.ui.collectFunding")}</strong><small>{t("finance.charge.ui.notAdvanced")}</small></span></label><label className={form.clientCostFundingMode === "reimburse_after_advance" ? styles.choiceActive : ""}><input type="radio" name="clientCostFundingMode" disabled={!permissions.canManageFinanceBillableCharges} checked={form.clientCostFundingMode === "reimburse_after_advance"} onChange={() => updateForm("clientCostFundingMode", "reimburse_after_advance")} /><span><strong>{t("finance.charge.ui.advanceFunding")}</strong><small>{t("finance.charge.ui.alreadyAdvanced")}</small></span></label></fieldset>{errors.clientCostFundingMode ? <p className={styles.fieldError}>{text(errors.clientCostFundingMode)}</p> : null}</> : null}

            <div className={styles.formGrid}>
              <FormField label={t("finance.invoice.ui.customer")} error={errors.clientId}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.clientId} onChange={(event) => { setForm((current) => ({ ...current, clientId: event.target.value, matterMode: "unlinked", caseId: "", advisoryMatterId: "" })); setErrors((current) => ({ ...current, clientId: "", matter: "" })); }}><option value="">{t("finance.invoice.composer.selectClient")}</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || t("finance.invoice.composer.unnamedClient")}</option>)}</select></FormField>
              <FormField label={t("finance.charge.ui.serviceDate")} error={errors.serviceDate}><input disabled={!permissions.canManageFinanceBillableCharges} type="date" value={form.serviceDate} onChange={(event) => updateForm("serviceDate", event.target.value)} /></FormField>
            </div>

            <div id="billable-charge-matter" className={styles.matterSection}><span className={styles.fieldHeading}>{t("finance.charge.ui.matterLink")}</span><div className={styles.segmented}><button disabled={!permissions.canManageFinanceBillableCharges} type="button" className={form.matterMode === "unlinked" ? styles.segmentActive : ""} onClick={() => setMatterMode("unlinked")}>{t("finance.invoice.composer.generalContext")}</button><button disabled={!permissions.canManageFinanceBillableCharges} type="button" className={form.matterMode === "case" ? styles.segmentActive : ""} onClick={() => setMatterMode("case")}>{t("finance.charge.ui.case")}</button><button disabled={!permissions.canManageFinanceBillableCharges} type="button" className={form.matterMode === "advisory" ? styles.segmentActive : ""} onClick={() => setMatterMode("advisory")}>{t("finance.charge.ui.advisory")}</button></div>
              {form.matterMode === "case" ? <FormField label={t("finance.charge.ui.selectCase")} error={errors.matter}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.caseId} onChange={(event) => { updateForm("caseId", event.target.value); setErrors((current) => ({ ...current, matter: "" })); }}><option value="">{t("finance.charge.ui.selectClientCase")}</option>{clientCases.map((item) => <option key={item.id} value={item.id}>{caseOptionLabel(item, locale)}</option>)}</select></FormField> : null}
              {form.matterMode === "advisory" ? <FormField label={t("finance.charge.ui.selectAdvisory")} error={errors.matter}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.advisoryMatterId} onChange={(event) => { updateForm("advisoryMatterId", event.target.value); setErrors((current) => ({ ...current, matter: "" })); }}><option value="">{t("finance.charge.ui.selectClientAdvisory")}</option>{clientAdvisories.map((item) => <option key={item.id} value={item.id}>{advisoryOptionLabel(item, locale)}</option>)}</select></FormField> : null}
              {form.matterMode === "unlinked" ? <p className={styles.helper}>{t("finance.charge.ui.unlinkedHelp")}</p> : null}
            </div>

            <div className={styles.formGrid}>
              <FormField label={t("finance.invoice.ui.item")} error={errors.description} wide><textarea disabled={!permissions.canManageFinanceBillableCharges} rows={3} value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder={t("finance.charge.ui.descriptionPlaceholder")} /></FormField>
              <FormField label={t("finance.charge.ui.quantity")} error={errors.quantity}><input disabled={!permissions.canManageFinanceBillableCharges} inputMode="decimal" value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} /></FormField>
              <FormField label={t("finance.invoice.ui.unit")} error={errors.unit}><input disabled={!permissions.canManageFinanceBillableCharges} value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder={t("finance.charge.ui.unitPlaceholder")} /></FormField>
              <FormField label={t("finance.charge.ui.unitRate")} helper={!form.unitRate.trim() ? t("finance.charge.ui.rateMissing") : undefined} error={errors.unitRate}><input disabled={!permissions.canManageFinanceBillableCharges} inputMode="decimal" value={form.unitRate} onChange={(event) => updateForm("unitRate", event.target.value)} placeholder="0.00" /></FormField>
              <FormField label={t("finance.invoice.ui.classification")} error={errors.economicClassification}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.economicClassification} onChange={(event) => updateForm("economicClassification", event.target.value as ChargeForm["economicClassification"])}><option value="">{t("finance.charge.ui.selectClassification")}</option><option value="professional_fee">{t("finance.invoice.classification.professional_fee")}</option><option value="additional_service">{t("finance.invoice.classification.additional_service")}</option><option value="reimbursable_expense">{t("finance.invoice.classification.reimbursable_expense")}</option><option value="government_or_court_fee">{t("finance.invoice.classification.government_or_court_fee")}</option><option value="other">{t("finance.invoice.classification.other")}</option></select><small>{t("finance.charge.ui.classificationHelp")}</small></FormField>
              <ChargeVatControl ref={vatRef} value={form} disabled={!permissions.canManageFinanceBillableCharges || saving} errors={errors} onChange={value => {
                setForm(current => ({ ...current, ...value }));
                setErrors(current => refreshChargeVatErrors(current, value));
                setMessage("");
              }} />
            </div>

            <section className={styles.additionalSection}>
              <div className={styles.additionalHeading}><h3>{t("finance.charge.ui.additionalInformation")}</h3><p>{t("finance.charge.ui.optionalEvidence")}</p></div>
              <div className={styles.formGrid}>
                <FormField label={t("finance.charge.ui.sourceReference")} helper={t("finance.invoice.composer.optional")}><input disabled={!permissions.canManageFinanceBillableCharges} value={form.sourceReference} onChange={(event) => updateForm("sourceReference", event.target.value)} /></FormField>
                <FormField label={t("finance.charge.ui.taxInformation")} helper={t("finance.charge.ui.taxInformationHelp")}><input disabled={!permissions.canManageFinanceBillableCharges} value={form.taxCategory} onChange={(event) => updateForm("taxCategory", event.target.value)} /></FormField>
              </div>
            </section>

            <AmountReview form={form} amounts={amounts} />
            <div className={styles.saveRow}><span className={dirty ? styles.unsavedState : styles.savedState}>{dirty ? t("finance.charge.ui.unsaved") : chargeId ? t("finance.charge.ui.draftSaved") : t("finance.charge.ui.notCreated")}</span><button className={styles.secondaryButton} type="button" disabled={saving || !dirty || !permissions.canManageFinanceBillableCharges} onClick={() => void saveDraft()}>{saving ? t("finance.invoice.ui.saving") : t("finance.charge.ui.saveDraft")}</button></div>

            {selectedCharge?.status === "draft" ? <section ref={reviewRef} className={styles.reviewZone} tabIndex={-1}>
              <div><span className={styles.eyebrow}>{t("finance.charge.ui.review")}</span><h3>{t("finance.charge.ui.reviewBeforeReady")}</h3><p>{t("finance.charge.ui.reviewHelp")}</p></div>
              <ReviewGrid form={form} amounts={amounts} clients={clients} cases={cases} advisories={advisories} />
              {errors.ready ? <p className={styles.fieldError}>{text(errors.ready)}</p> : null}
              <label id="billable-charge-acknowledgement" className={errors.acknowledgement ? styles.invalidCheck : styles.checkLabel}><input type="checkbox" checked={readyAcknowledged} onChange={(event) => { setReadyAcknowledged(event.target.checked); setErrors((current) => ({ ...current, acknowledgement: "" })); }} /><span>{t("finance.charge.ui.readyAcknowledgement")}</span></label>
              {errors.acknowledgement ? <p className={styles.fieldError}>{text(errors.acknowledgement)}</p> : null}
              <button className={styles.primaryButton} type="button" disabled={saving || !chargeId || dirty || !permissions.canApproveFinanceBillableCharges} onClick={() => void markReady()}>{t("finance.invoice.ui.audit.ready")}</button>
              {dirty ? <p className={styles.permissionNote}>{t("finance.charge.ui.dirtyReadyHelp")}</p> : null}
              {!permissions.canApproveFinanceBillableCharges ? <p className={styles.permissionNote}>{t("finance.charge.ui.approvalPermission")}</p> : null}
            </section> : null}
          </>}

          {canCancelSelected ? <section className={styles.otherActions}><div><strong>{t("finance.invoice.ui.otherActions")}</strong><p>{t("finance.charge.ui.cancelHelp")}</p></div>{cancelContext === "editor" ? <div className={styles.cancelForm}><FormField label={t("finance.charge.ui.cancelReason")} error={errors.cancelReason}><textarea rows={3} value={cancelReason} onChange={(event) => { setCancelReason(event.target.value); setErrors((current) => ({ ...current, cancelReason: "" })); }} /></FormField><div className={styles.actionRow}><button className={styles.secondaryButton} type="button" onClick={() => setCancelContext(null)}>{t("finance.charge.ui.dismissAction")}</button><button className={styles.dangerButton} type="button" disabled={saving} onClick={() => void cancelCharge()}>{t("finance.charge.ui.confirmCancel")}</button></div></div> : <button className={styles.dangerButton} type="button" onClick={() => setCancelContext("editor")}>{t("finance.charge.ui.cancel")}</button>}</section> : null}

          {chargeId ? <AuditHistory audits={audits} /> : null}
        </section> : null}
      </> : null}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return <AuthGuard><AppTopNav title={t("finance.charge.ui.finance")} activePage="finance" /><main className={styles.page}>{children}</main></AuthGuard>;
}

function FormField({ label, helper, error, wide, children }: { label: string; helper?: string; error?: UiMessage | ""; wide?: boolean; children: React.ReactNode }) {
  const { text } = useI18n();
  return <label id={`billable-charge-field-${fieldId(label)}`} className={`${styles.field} ${wide ? styles.wideField : ""} ${error ? styles.invalidField : ""}`}><span>{label}</span>{children}{helper ? <small>{helper}</small> : null}{error ? <em>{text(error)}</em> : null}</label>;
}

function AmountReview({ form, amounts }: { form: ChargeForm; amounts: ReturnType<typeof calculateFormAmounts> }) {
  const { t } = useI18n();
  const hasUnitRate = Boolean(form.unitRate.trim());
  const amountValue = (value: number) => hasUnitRate ? money(value) : "-";
  return <section className={styles.amountReview}><div><span>{t("finance.charge.ui.quantityTimesRate")}</span><strong>{number(form.quantity)} {form.unit || t("finance.invoice.ui.unit")} × {hasUnitRate ? money(form.unitRate) : t("finance.charge.ui.rateMissing")}</strong></div><dl><div><dt>{t("finance.invoice.ui.netAmount")}</dt><dd>{amountValue(amounts.amountBeforeVat)}</dd></div><div><dt>VAT</dt><dd>{amountValue(amounts.vatAmount)}</dd></div><div className={styles.totalLine}><dt>{t("finance.charge.ui.chargeAmount")}</dt><dd>{amountValue(amounts.totalAmount)}</dd></div></dl><p>{t("finance.charge.ui.calculationHelp")}</p></section>;
}

function ReviewGrid({ form, amounts, clients, cases, advisories }: { form: ChargeForm; amounts: ReturnType<typeof calculateFormAmounts>; clients: ClientOption[]; cases: CaseOption[]; advisories: AdvisoryOption[] }) {
  const { t, date, locale } = useI18n();
  return <dl className={styles.reviewGrid}><ReviewItem label={t("finance.invoice.ui.customer")} value={clientLabel(form.clientId, clients, locale)} /><ReviewItem label={t("finance.charge.ui.caseAdvisory")} value={formMatterLabel(form, cases, advisories, locale)} /><ReviewItem label={t("finance.invoice.ui.chargeNature")} value={sourceTypeLabel(form.sourceType, locale)} />{form.sourceType === "recoverable_cost" ? <ReviewItem label={t("finance.invoice.ui.funding")} value={clientCostFundingModeLabel(form.clientCostFundingMode || null, locale)} /> : null}<ReviewItem label={t("finance.charge.ui.transactionDate")} value={date(form.serviceDate)} /><ReviewItem label={t("finance.invoice.ui.item")} value={form.description || "-"} /><ReviewItem label={t("finance.charge.ui.quantityUnitRate")} value={`${number(form.quantity)} ${form.unit || "-"} × ${money(form.unitRate || 0)}`} /><ReviewItem label={t("finance.invoice.ui.classification")} value={classificationLabel(form.economicClassification || null, locale)} /><ReviewItem label={t("finance.charge.ui.vatMode")} value={taxModeLabel(form.priceTaxMode, form.vatRate, locale)} /><ReviewItem label={t("finance.invoice.ui.netAmount")} value={money(amounts.amountBeforeVat)} /><ReviewItem label="VAT" value={money(amounts.vatAmount)} /><ReviewItem label={t("finance.charge.ui.chargeAmount")} value={money(amounts.totalAmount)} /><ReviewItem label={t("finance.charge.ui.referenceEvidence")} value={form.sourceReference || "-"} /></dl>;
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function ReadOnlyDetail({ charge, clients, cases, advisories }: { charge: BillableCharge; clients: ClientOption[]; cases: CaseOption[]; advisories: AdvisoryOption[] }) {
  const { t, date, locale } = useI18n();
  const dateTime = (value: string | null) => date(value, true);
  const notice = charge.status === "ready_to_invoice" ? t("finance.charge.ui.readyReadOnlyHelp") : statusExplanation(charge.status, locale);
  return <>
    {notice ? <div className={styles.readOnlyNotice}>{notice}</div> : null}
    <dl className={styles.detailGrid}><Detail label={t("finance.invoice.ui.customer")} value={clientLabel(charge.client_id, clients, locale)} link="/clients" /><Detail label={t("finance.charge.ui.caseAdvisory")} value={matterLabel(charge, cases, advisories, locale)} link={charge.case_id ? `/cases/${charge.case_id}` : charge.advisory_matter_id ? `/advisory/${charge.advisory_matter_id}` : undefined} /><Detail label={t("finance.invoice.ui.chargeNature")} value={sourceTypeLabel(charge.source_type, locale)} />{charge.source_type === "recoverable_cost" ? <Detail label={t("finance.invoice.ui.funding")} value={clientCostFundingModeLabel(charge.client_cost_funding_mode, locale)} /> : null}<Detail label={t("finance.charge.ui.transactionDate")} value={date(charge.service_date)} /><Detail label={t("finance.invoice.ui.item")} value={charge.description || "-"} /><Detail label={t("finance.charge.ui.quantityUnitRate")} value={`${number(charge.quantity)} ${charge.unit || "-"} × ${money(charge.unit_rate, charge.currency)}`} /><Detail label={t("finance.invoice.ui.classification")} value={classificationLabel(charge.economic_classification, locale)} /><Detail label={t("finance.charge.ui.vatMode")} value={taxModeLabel(charge.price_tax_mode, charge.vat_rate, locale)} /><Detail label={t("finance.invoice.ui.netAmount")} value={money(charge.amount_before_vat, charge.currency)} /><Detail label="VAT" value={money(charge.vat_amount, charge.currency)} /><Detail label={t("finance.charge.ui.chargeAmount")} value={money(charge.total_amount, charge.currency)} prominent /><Detail label={t("finance.charge.ui.referenceEvidenceNumber")} value={charge.source_reference || "-"} /><Detail label={t("finance.charge.ui.createdAt")} value={dateTime(charge.created_at)} /><Detail label={t("finance.invoice.ui.audit.ready")} value={dateTime(charge.ready_to_invoice_at)} />{charge.status === "cancelled" ? <><Detail label={t("finance.invoice.ui.voidedAt")} value={dateTime(charge.cancelled_at)} /><Detail label={t("finance.charge.ui.cancelledReason")} value={charge.cancel_reason || "-"} /></> : null}</dl>
  </>;
}

function BillableChargeModalDetail({ charge, clients, cases, advisories }: { charge: BillableCharge; clients: ClientOption[]; cases: CaseOption[]; advisories: AdvisoryOption[] }) {
  const { t, date, locale } = useI18n();
  const dateTime = (value: string | null) => date(value, true);
  const notice = charge.status === "ready_to_invoice" ? t("finance.charge.ui.readyReadOnly") : statusExplanation(charge.status, locale);
  return <div className={styles.modalDetailContent}>
    {notice ? <div className={styles.readOnlyNotice}>{notice}</div> : null}
    {charge.status === "ready_to_invoice" && Object.keys(validateChargeVat(chargeToForm(charge))).length ? <><ChargeValidationSummary errors={validateChargeVat(chargeToForm(charge))} /><p>{t("finance.charge.vat.readyCorrection")}</p></> : null}
    <section className={styles.detailSection}>
      <div className={styles.detailSectionHeading}><span className={styles.eyebrow}>{t("finance.charge.ui.primaryInformation")}</span><h3>{t("finance.charge.ui.itemInformation")}</h3></div>
      <dl className={styles.detailGrid}><Detail label={t("finance.invoice.ui.item")} value={charge.description || "-"} prominent /><Detail label={t("finance.invoice.ui.customer")} value={clientLabel(charge.client_id, clients, locale)} link="/clients" /><Detail label={t("finance.charge.ui.caseAdvisory")} value={matterLabel(charge, cases, advisories, locale)} link={charge.case_id ? `/cases/${charge.case_id}` : charge.advisory_matter_id ? `/advisory/${charge.advisory_matter_id}` : undefined} /><Detail label={t("finance.invoice.ui.chargeNature")} value={sourceTypeLabel(charge.source_type, locale)} />{charge.source_type === "recoverable_cost" ? <Detail label={t("finance.invoice.ui.funding")} value={clientCostFundingModeLabel(charge.client_cost_funding_mode, locale)} /> : null}<Detail label={t("finance.charge.ui.transactionDate")} value={date(charge.service_date)} /></dl>
    </section>
    <section className={styles.detailSection}>
      <div className={styles.detailSectionHeading}><span className={styles.eyebrow}>{t("finance.charge.ui.chargeAmount")}</span><h3>{t("finance.charge.ui.amountCalculation")}</h3></div>
      <dl className={styles.detailGrid}><Detail label={t("finance.charge.ui.quantityUnitRate")} value={`${number(charge.quantity)} ${charge.unit || "-"} × ${money(charge.unit_rate, charge.currency)}`} /><Detail label={t("finance.invoice.ui.classification")} value={classificationLabel(charge.economic_classification, locale)} /><Detail label={t("finance.charge.ui.vatMode")} value={taxModeLabel(charge.price_tax_mode, charge.vat_rate, locale)} /><Detail label={t("finance.invoice.ui.netAmount")} value={money(charge.amount_before_vat, charge.currency)} /><Detail label="VAT" value={money(charge.vat_amount, charge.currency)} /><Detail label={t("finance.charge.ui.chargeAmount")} value={money(charge.total_amount, charge.currency)} prominent /></dl>
    </section>
    <section className={styles.detailSection}>
      <div className={styles.detailSectionHeading}><span className={styles.eyebrow}>{t("finance.charge.ui.secondaryInformation")}</span><h3>{t("finance.charge.ui.supportingInformation")}</h3></div>
      <dl className={styles.detailGrid}><Detail label={t("finance.charge.ui.referenceEvidenceNumber")} value={charge.source_reference || "-"} /><Detail label={t("finance.charge.ui.createdAt")} value={dateTime(charge.created_at)} /><Detail label={t("finance.invoice.ui.audit.ready")} value={dateTime(charge.ready_to_invoice_at)} />{charge.status === "cancelled" ? <><Detail label={t("finance.invoice.ui.voidedAt")} value={dateTime(charge.cancelled_at)} /><Detail label={t("finance.charge.ui.cancelledReason")} value={charge.cancel_reason || "-"} /></> : null}</dl>
    </section>
  </div>;
}

function AuditHistory({ audits, loading = false }: { audits: AuditEvent[]; loading?: boolean }) {
  const { t, locale, date } = useI18n();
  const dateTime = (value: string | null) => date(value, true);
  return <details className={styles.auditDetails}><summary>{t("finance.invoice.ui.chargeHistory")}</summary>{loading ? <p>{t("finance.invoice.ui.historyLoading")}</p> : audits.length ? <ol>{audits.map((event) => <li key={event.id}><div><strong>{auditLabel(event.event_type, locale)}</strong><span>{event.actor_name || event.actor_email || t("finance.invoice.ui.systemUser")}</span></div><time>{dateTime(event.created_at)}</time></li>)}</ol> : <p>{t("finance.invoice.ui.noHistory")}</p>}</details>;
}

function Detail({ label, value, link, prominent }: { label: string; value: string; link?: string; prominent?: boolean }) {
  return <div className={prominent ? styles.prominentDetail : ""}><dt>{label}</dt><dd>{link ? <Link href={link}>{value}</Link> : value}</dd></div>;
}

function StatusBadge({ status }: { status: ChargeStatus }) {
  const { locale } = useI18n();
  return <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>{statusLabel(status, locale)}</span>;
}

function PlusIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function emptyForm(): ChargeForm {
  return { sourceType: "ad_hoc_service", clientCostFundingMode: "", clientId: "", matterMode: "unlinked", caseId: "", advisoryMatterId: "", serviceDate: bangkokToday(), description: "", quantity: "1", unit: "", unitRate: "", economicClassification: "", priceTaxMode: "non_vat", vatRate: "0", sourceReference: "", taxCategory: "" };
}

function chargeToForm(charge: BillableCharge): ChargeForm {
  return { vatTreatment: charge.vat_treatment_json, sourceType: charge.source_type === "recoverable_cost" ? "recoverable_cost" : "ad_hoc_service", clientCostFundingMode: charge.client_cost_funding_mode || "", clientId: charge.client_id, matterMode: charge.case_id ? "case" : charge.advisory_matter_id ? "advisory" : "unlinked", caseId: charge.case_id ? String(charge.case_id) : "", advisoryMatterId: charge.advisory_matter_id || "", serviceDate: charge.service_date || "", description: charge.description || "", quantity: String(charge.quantity), unit: charge.unit || "", unitRate: String(charge.unit_rate), economicClassification: charge.economic_classification || "", priceTaxMode: charge.price_tax_mode, vatRate: String(charge.vat_rate), sourceReference: charge.source_reference || "", taxCategory: charge.tax_category || "" };
}

function validateDraft(form: ChargeForm) {
  const errors: Record<string, UiMessage | ""> = {};
  if (!form.clientId) errors.clientId = uiMessage("finance.invoice.composer.clientRequired");
  if (form.matterMode === "case" && !form.caseId) errors.matter = uiMessage("finance.charge.ui.error.case");
  if (form.matterMode === "advisory" && !form.advisoryMatterId) errors.matter = uiMessage("finance.charge.ui.error.advisory");
  if (!isDecimal(form.quantity, 4, false)) errors.quantity = uiMessage("finance.charge.ui.error.quantity");
  if (!isDecimal(form.unitRate || "0", 2, true)) errors.unitRate = uiMessage("finance.charge.ui.error.unitRate");
  if (form.priceTaxMode !== "non_vat" && !isDecimal(form.vatRate, 4, true)) errors.vatRate = uiMessage("finance.charge.ui.error.vatRate");
  return { ...errors, ...validateChargeVat(form) };
}

function validateReady(form: ChargeForm) {
  const errors = validateDraft(form);
  if (clientCostFundingModeRequired(form.sourceType, form.clientCostFundingMode)) errors.clientCostFundingMode = uiMessage("finance.charge.ui.error.funding");
  if (!form.serviceDate) errors.serviceDate = uiMessage("finance.charge.ui.error.date");
  if (!form.description.trim()) errors.description = uiMessage("finance.charge.ui.error.description");
  if (!form.unit.trim()) errors.unit = uiMessage("finance.charge.ui.error.unit");
  if (!form.economicClassification) errors.economicClassification = uiMessage("finance.charge.ui.error.classification");
  if (calculateFormAmounts(form).totalAmount <= 0) errors.unitRate = uiMessage("finance.charge.ui.error.positiveTotal");
  return errors;
}

function calculateFormAmounts(form: ChargeForm) {
  const quantity = safeNumber(form.quantity);
  const unitRate = safeNumber(form.unitRate);
  const vatRate = form.priceTaxMode === "non_vat" ? 0 : safeNumber(form.vatRate);
  return calculateFinanceLineAmounts(quantity, unitRate, form.priceTaxMode, vatRate);
}

function focusFirstError(errors: Record<string, UiMessage | "">, locale: UiLocale = "th") {
  const first = Object.keys(errors)[0];
  if (!first) return;
  window.requestAnimationFrame(() => {
    const target = first === "acknowledgement" ? document.getElementById("billable-charge-acknowledgement") : first === "matter" ? document.getElementById("billable-charge-matter") : first === "clientCostFundingMode" ? document.getElementById("billable-charge-funding-mode") : document.getElementById(`billable-charge-field-${fieldId(errorFieldLabel(first, locale))}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.querySelector<HTMLElement>("input,select,textarea")?.focus({ preventScroll: true });
  });
}

function errorFieldLabel(field: string, locale: UiLocale = "th") {
  const labels: Record<string, string> = { clientId: translate(locale, "finance.invoice.ui.customer"), clientCostFundingMode: translate(locale, "finance.charge.ui.fundingMode"), serviceDate: translate(locale, "finance.charge.ui.serviceDate"), description: translate(locale, "finance.invoice.ui.item"), quantity: translate(locale, "finance.charge.ui.quantity"), unit: translate(locale, "finance.invoice.ui.unit"), unitRate: translate(locale, "finance.charge.ui.unitRate"), economicClassification: translate(locale, "finance.invoice.ui.classification"), vatRate: translate(locale, "finance.charge.ui.vatRate"), matter: translate(locale, "finance.charge.ui.selectCase") };
  return labels[field] || field;
}

function fieldId(value: string) { return value.replace(/[^a-zA-Z0-9ก-๙]+/gu, "-"); }
function formFingerprint(form: ChargeForm) { return JSON.stringify(form); }
function safeBillingPlanReturnPath(value: string | null) { if (!value) return null; return /^\/finance\/billing-plans\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function nullable(value: string) { return value.trim() || null; }
function safeNumber(value: number | string) { const next = Number(value || 0); return Number.isFinite(next) ? next : 0; }
function isDecimal(value: string, decimals: number, allowZero: boolean) { const normalized = value.trim(); if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(normalized)) return false; const parsed = Number(normalized); return allowZero ? parsed >= 0 : parsed > 0; }
function bangkokToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function money(value: number | string, currency = "THB") { return `${new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeNumber(value))} ${currency}`; }
function number(value: number | string) { return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 }).format(safeNumber(value)); }
function sortCharges(a: BillableCharge, b: BillableCharge) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); }
function countStatus(charges: BillableCharge[], status: "all" | ChargeStatus) { return status === "all" ? charges.length : charges.filter((item) => item.status === status).length; }
function clientLabel(id: string, clients: ClientOption[], locale: UiLocale = "th") { return clients.find((item) => item.id === id)?.name || translate(locale, "finance.charge.ui.clientMissing"); }
function caseOptionLabel(item: CaseOption, locale: UiLocale = "th") { return [item.file_no, item.title].filter(Boolean).join(" · ") || translate(locale, "finance.charge.ui.caseReference", { id: item.id }); }
function advisoryOptionLabel(item: AdvisoryOption, locale: UiLocale = "th") { return [item.matter_no, item.title].filter(Boolean).join(" · ") || translate(locale, "finance.charge.ui.advisory"); }
function matterLabel(charge: Pick<BillableCharge, "case_id" | "advisory_matter_id">, cases: CaseOption[], advisories: AdvisoryOption[], locale: UiLocale = "th") { if (charge.case_id) return `${translate(locale, "finance.charge.ui.case")} · ${caseOptionLabel(cases.find((item) => item.id === charge.case_id) || { id: charge.case_id, client_id: null, file_no: null, title: null }, locale)}`; if (charge.advisory_matter_id) return `${translate(locale, "finance.charge.ui.advisory")} · ${advisoryOptionLabel(advisories.find((item) => item.id === charge.advisory_matter_id) || { id: charge.advisory_matter_id, client_id: null, matter_no: null, title: null }, locale)}`; return translate(locale, "finance.invoice.composer.generalContext"); }
function formMatterLabel(form: ChargeForm, cases: CaseOption[], advisories: AdvisoryOption[], locale: UiLocale = "th") { if (form.matterMode === "case") return caseOptionLabel(cases.find((item) => String(item.id) === form.caseId) || { id: Number(form.caseId || 0), client_id: null, file_no: null, title: null }, locale); if (form.matterMode === "advisory") return advisoryOptionLabel(advisories.find((item) => item.id === form.advisoryMatterId) || { id: form.advisoryMatterId, client_id: null, matter_no: null, title: null }, locale); return translate(locale, "finance.invoice.composer.generalContext"); }
function sourceTypeLabel(value: SourceType | ChargeForm["sourceType"], locale: UiLocale = "th") { return billableChargeNatureLabel(value, locale); }
function classificationLabel(value: EconomicClassification | null, locale: UiLocale = "th") { if (value === "professional_fee") return translate(locale, "finance.invoice.classification.professional_fee"); if (value === "additional_service") return translate(locale, "finance.invoice.classification.additional_service"); if (value === "reimbursable_expense") return translate(locale, "finance.invoice.classification.reimbursable_expense"); if (value === "government_or_court_fee") return translate(locale, "finance.invoice.classification.government_or_court_fee"); if (value === "other") return translate(locale, "finance.invoice.classification.other"); return translate(locale, "finance.invoice.classification.unspecified"); }
function taxModeLabel(mode: FinancePriceTaxMode, vatRate: number | string, locale: UiLocale = "th") { if (mode === "non_vat") return translate(locale, "finance.invoice.ui.noVat"); return `${mode === "vat_inclusive" ? translate(locale, "finance.charge.ui.vatInclusive") : translate(locale, "finance.charge.ui.vatExclusive")} · ${number(vatRate)}%`; }
function statusLabel(status: ChargeStatus, locale: UiLocale = "th") { if (status === "ready_to_invoice") return translate(locale, "finance.invoice.ui.readyToInvoice"); if (status === "reserved") return translate(locale, "finance.charge.ui.reserved"); if (status === "invoiced") return translate(locale, "finance.invoice.installment.invoiced"); if (status === "cancelled") return translate(locale, "finance.invoice.installment.cancelled"); return translate(locale, "finance.charge.ui.draft"); }
function statusExplanation(status?: ChargeStatus, locale: UiLocale = "th") { if (status === "ready_to_invoice") return translate(locale, "finance.charge.ui.statusHelp.ready"); if (status === "reserved") return translate(locale, "finance.charge.ui.statusHelp.reserved"); if (status === "invoiced") return translate(locale, "finance.charge.ui.statusHelp.invoiced"); if (status === "cancelled") return translate(locale, "finance.charge.ui.statusHelp.cancelled"); return ""; }
function auditLabel(event: string, locale: UiLocale = "th") { if (event === "draft_saved") return translate(locale, "finance.charge.ui.audit.draftSaved"); if (event === "marked_ready") return translate(locale, "finance.invoice.ui.audit.ready"); if (event === "cancelled") return translate(locale, "finance.invoice.ui.audit.cancelled"); return translate(locale, "finance.charge.ui.created"); }

function billableChargeError(value: unknown, fallback: UiMessage | string) {
  if (isChargeVatBackendError(value)) return uiMessage("finance.charge.vat.conflict");
  const message = typeof value === "object" && value && "message" in value ? String((value as { message?: unknown }).message || "") : String(value || "");
  if (message.includes("Case must belong") || message.includes("Advisory matter must belong")) return uiMessage("finance.charge.ui.error.context");
  if (message.includes("Only a Draft") || message.includes("can be saved")) return uiMessage("finance.charge.ui.error.notDraft");
  if (message.includes("Reserved or Invoiced")) return uiMessage("finance.charge.ui.error.reserved");
  if (message.includes("description is required")) return uiMessage("finance.charge.ui.error.descriptionReady");
  if (message.includes("unit is required")) return uiMessage("finance.charge.ui.error.unitReady");
  if (message.includes("economic classification is required")) return uiMessage("finance.charge.ui.error.classificationReady");
  if (message.includes("funding mode is required")) return uiMessage("finance.charge.ui.error.fundingReady");
  if (message.includes("funding mode is invalid") || message.includes("funding mode is inconsistent")) return uiMessage("finance.charge.ui.error.fundingConflict");
  if (message.includes("total must be positive")) return uiMessage("finance.charge.ui.error.positiveTotal");
  if (message.includes("request id was already used")) return uiMessage("finance.charge.ui.error.requestChanged");
  if (message.includes("Not allowed")) return uiMessage("finance.charge.ui.error.permission");
  return fallback;
}
