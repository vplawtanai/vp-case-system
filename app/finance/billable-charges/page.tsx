"use client";

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
  source_reference: string | null;
  description: string | null;
  quantity: number | string;
  unit: string | null;
  unit_rate: number | string;
  currency: string;
  service_date: string | null;
  economic_classification: EconomicClassification | null;
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

type ChargeForm = {
  sourceType: "ad_hoc_service" | "recoverable_cost";
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
  "can_view_finance_cash_transactions",
  "can_manage_finance_cash_transactions",
  "can_confirm_finance_cash_transactions",
  "can_reverse_finance_cash_transactions",
  "can_view_finance_billable_charges",
  "can_manage_finance_billable_charges",
  "can_approve_finance_billable_charges",
].join(", ");

const statusTabs: Array<{ value: "all" | ChargeStatus; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "draft", label: "ร่าง" },
  { value: "ready_to_invoice", label: "พร้อมออกใบแจ้งหนี้" },
  { value: "reserved", label: "กำลังจัดทำใบแจ้งหนี้" },
  { value: "invoiced", label: "ออกใบแจ้งหนี้แล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
];

export default function BillableChargesPage() {
  return (
    <Suspense fallback={<PageShell><div className={styles.loading}>กำลังโหลดรายการรอเรียกเก็บ...</div></PageShell>}>
      <BillableChargesWorkspace />
    </Suspense>
  );
}

function BillableChargesWorkspace() {
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [chargeId, setChargeId] = useState("");
  const [form, setForm] = useState<ChargeForm>(() => emptyForm());
  const [baseline, setBaseline] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createSourceLocked, setCreateSourceLocked] = useState(false);
  const [readyAcknowledged, setReadyAcknowledged] = useState(false);
  const [cancelContext, setCancelContext] = useState<"editor" | "detail" | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const panelRef = useRef<HTMLElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const actionLockRef = useRef(false);
  const detailAuditRequestRef = useRef(0);
  const createAttemptRef = useRef<CreateAttempt | null>(null);
  const deepLinkHandledRef = useRef(false);
  const permissions = useMemo(() => buildPermissions(profile), [profile]);
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
    const [chargeResult, clientResult, caseResult, advisoryResult] = await Promise.all([
      supabase.from("finance_billable_charges").select("*").order("created_at", { ascending: false }),
      supabase.from("clients").select("id,name,client_type").order("name"),
      supabase.from("cases").select("id,client_id,file_no,title").order("created_at", { ascending: false }),
      supabase.from("advisory_matters").select("id,client_id,matter_no,title").order("created_at", { ascending: false }),
    ]);
    const firstError = chargeResult.error || clientResult.error || caseResult.error || advisoryResult.error;
    if (firstError) {
      console.error("LOAD BILLABLE CHARGE WORKSPACE FAILED", { chargeResult, clientResult, caseResult, advisoryResult });
      setError("โหลดรายการรอเรียกเก็บไม่สำเร็จ กรุณารีเฟรชและลองอีกครั้ง");
    } else {
      setCharges((chargeResult.data || []) as BillableCharge[]);
      setClients((clientResult.data || []) as ClientOption[]);
      setCases((caseResult.data || []) as CaseOption[]);
      setAdvisories((advisoryResult.data || []) as AdvisoryOption[]);
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
    setPanelOpen(true);
    setCreateSourceLocked(false);
    createAttemptRef.current = null;
    scrollToPanel();
  }, []);

  useEffect(() => {
    if (loading || deepLinkHandledRef.current || searchParams.get("new") !== "1") return;
    deepLinkHandledRef.current = true;
    const clientId = searchParams.get("client") || "";
    const caseId = searchParams.get("case") || "";
    const advisoryMatterId = searchParams.get("advisory") || "";
    openNew({
      clientId,
      matterMode: caseId ? "case" : advisoryMatterId ? "advisory" : "unlinked",
      caseId,
      advisoryMatterId,
    });
  }, [loading, openNew, searchParams]);

  const fetchAudit = async (id: string) => {
    const { data, error: auditError } = await supabase
      .from("finance_billable_charge_audit_events")
      .select("id,event_type,actor_name,actor_email,created_at")
      .eq("charge_id", id)
      .order("created_at", { ascending: true });
    if (auditError) console.error("LOAD BILLABLE CHARGE AUDIT FAILED", auditError);
    return (data || []) as AuditEvent[];
  };

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
    if (actionLockRef.current || Object.keys(nextErrors).length || !permissions.canManageFinanceBillableCharges) return;
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
        p_source_reference: nullable(form.sourceReference),
        p_source_snapshot_json: {},
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
      setMessage("บันทึกร่างรายการเรียกเก็บแล้ว");
      if (isFirstSave) scrollToReview();
    } catch (caught) {
      console.error("SAVE BILLABLE CHARGE DRAFT FAILED", caught);
      setError(billableChargeError(caught, "บันทึกร่างรายการเรียกเก็บไม่สำเร็จ"));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  const markReady = async () => {
    const nextErrors = validateReady(form);
    if (dirty) nextErrors.ready = "มีข้อมูลที่ยังไม่ได้บันทึก กรุณาบันทึกร่างก่อนยืนยัน";
    if (!chargeId) nextErrors.ready = "กรุณาบันทึกร่างก่อนยืนยัน";
    if (!readyAcknowledged) nextErrors.acknowledgement = "กรุณายืนยันว่าได้ตรวจสอบรายการและยอดเรียกเก็บแล้ว";
    setErrors(nextErrors);
    if (actionLockRef.current || Object.keys(nextErrors).length || !permissions.canApproveFinanceBillableCharges) {
      focusFirstError(nextErrors);
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
      setMessage("ยืนยันรายการพร้อมออกใบแจ้งหนี้แล้ว");
    } catch (caught) {
      console.error("MARK BILLABLE CHARGE READY FAILED", caught);
      setError(billableChargeError(caught, "ยืนยันรายการพร้อมออกใบแจ้งหนี้ไม่สำเร็จ"));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  const cancelCharge = async (targetChargeId = chargeId, context: "editor" | "detail" = "editor") => {
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      setErrors((current) => ({ ...current, cancelReason: "กรุณาระบุเหตุผลที่ยกเลิกรายการ" }));
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
      setMessage("ยกเลิกรายการเรียกเก็บแล้ว โดยยังเก็บรายการไว้เป็นประวัติ");
    } catch (caught) {
      console.error("CANCEL BILLABLE CHARGE FAILED", caught);
      setError(billableChargeError(caught, "ยกเลิกรายการเรียกเก็บไม่สำเร็จ"));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  const filteredCharges = useMemo(() => charges.filter((charge) => {
    if (filter !== "all" && charge.status !== filter) return false;
    if (!search.trim()) return true;
    const haystack = [charge.description, charge.source_reference, clientLabel(charge.client_id, clients), matterLabel(charge, cases, advisories)].join(" ").toLocaleLowerCase("th");
    return haystack.includes(search.trim().toLocaleLowerCase("th"));
  }), [advisories, cases, charges, clients, filter, search]);

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
      {loadingProfile || loading ? <div className={styles.loading}>กำลังโหลดรายการรอเรียกเก็บ...</div> : null}
      {!loadingProfile && !permissions.canViewFinanceBillableCharges ? <div className={styles.noAccess}><h1>ไม่มีสิทธิ์เข้าถึง</h1><p>บัญชีผู้ใช้นี้ไม่มีสิทธิ์ดูรายการรอเรียกเก็บ</p></div> : null}
      {!loadingProfile && permissions.canViewFinanceBillableCharges ? <>
        <FinanceSubNav activePage="billable-charges" permissions={permissions} />
        <header className={styles.workspaceHeader}>
          <div><span className={styles.eyebrow}>FINANCE</span><h1>รายการรอเรียกเก็บ</h1><p>รายการที่ลูกค้าเป็นหนี้ VP และรอรวบรวมเพื่อออกใบแจ้งหนี้</p></div>
          {permissions.canManageFinanceBillableCharges ? <button className={styles.primaryButton} type="button" onClick={() => openNew()}><PlusIcon />เพิ่มรายการเรียกเก็บ</button> : null}
        </header>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}
        {message ? <div className={styles.successBanner}>{message}</div> : null}

        <section className={styles.listSection}>
          <div className={styles.filterBar}>
            <div className={styles.tabs} aria-label="กรองสถานะรายการเรียกเก็บ">{statusTabs.map((tab) => <button key={tab.value} type="button" className={filter === tab.value ? styles.activeTab : ""} onClick={() => { closeChargeDetails(); setFilter(tab.value); }}>{tab.label}<span>{countStatus(charges, tab.value)}</span></button>)}</div>
            <input aria-label="ค้นหารายการรอเรียกเก็บ" value={search} onChange={(event) => { closeChargeDetails(); setSearch(event.target.value); }} placeholder="ค้นหาลูกค้า เรื่อง หรือรายการ" />
          </div>
          {!filteredCharges.length ? <div className={styles.emptyState}><strong>{charges.length ? "ไม่พบรายการตามตัวกรอง" : "ยังไม่มีรายการรอเรียกเก็บ"}</strong><p>{charges.length ? "ลองเปลี่ยนสถานะหรือคำค้นหา" : "เพิ่มรายการเมื่อลูกค้ามียอดที่ต้องชำระให้ VP ระหว่างการดำเนินงาน"}</p></div> : <div className={styles.chargeGrid}>{filteredCharges.map((charge) => <article key={charge.id} className={styles.chargeCard}>
              <div className={styles.chargeCardHeader}><div><span>{thaiDate(charge.service_date || charge.created_at)}</span><h2>{charge.description || "ร่างรายการเรียกเก็บ"}</h2></div><StatusBadge status={charge.status} /></div>
              <div className={styles.chargeContext}><strong>{clientLabel(charge.client_id, clients)}</strong><span>{matterLabel(charge, cases, advisories)}</span></div>
              <dl className={styles.cardMetrics}><div><dt>ประเภทของยอด</dt><dd>{classificationLabel(charge.economic_classification)}</dd></div><div><dt>VAT</dt><dd>{taxModeLabel(charge.price_tax_mode, charge.vat_rate)}</dd></div><div><dt>ยอดเรียกเก็บ</dt><dd>{money(charge.total_amount, charge.currency)}</dd></div></dl>
              <button className={styles.openButton} type="button" onClick={() => openChargeDetails(charge)}>ดูรายละเอียด</button>
            </article>)}</div>}
        </section>

        {detailCharge ? <DetailModal open title={detailCharge.description || "ร่างรายการเรียกเก็บ"} subtitle={<>{clientLabel(detailCharge.client_id, clients)} · {matterLabel(detailCharge, cases, advisories)}</>} status={<StatusBadge status={detailCharge.status} />} prominentValue={money(detailCharge.total_amount, detailCharge.currency)} onClose={closeChargeDetails}>
          <BillableChargeModalDetail charge={detailCharge} clients={clients} cases={cases} advisories={advisories} />
          {canEditDetailDraft ? <div className={styles.detailActionRow}><button className={styles.secondaryButton} type="button" onClick={() => openCharge(detailCharge)}>แก้ไขร่างรายการ</button></div> : null}
          <AuditHistory audits={detailAudits} loading={detailAuditLoading} />
          {canCancelDetail ? <section className={styles.otherActions}><div><strong>การดำเนินการอื่น</strong><p>การยกเลิกจะเก็บรายการนี้ไว้เป็นประวัติและต้องระบุเหตุผล</p></div>{cancelContext === "detail" ? <div className={styles.cancelForm}><FormField label="เหตุผลที่ยกเลิกรายการ" error={errors.cancelReason}><textarea rows={3} value={cancelReason} onChange={(event) => { setCancelReason(event.target.value); setErrors((current) => ({ ...current, cancelReason: "" })); }} /></FormField><div className={styles.actionRow}><button className={styles.secondaryButton} type="button" onClick={() => setCancelContext(null)}>ไม่ดำเนินการ</button><button className={styles.dangerButton} type="button" disabled={saving} onClick={() => void cancelCharge(detailCharge.id, "detail")}>ยืนยันยกเลิกรายการ</button></div></div> : <button className={styles.dangerButton} type="button" onClick={() => setCancelContext("detail")}>ยกเลิกรายการเรียกเก็บ</button>}</section> : null}
        </DetailModal> : null}

        {panelOpen ? <section ref={panelRef} className={styles.editorSection}>
          <div className={styles.editorHeader}><div><span className={styles.eyebrow}>{chargeId ? "รายละเอียดรายการ" : "สร้างรายการ"}</span><h2>{chargeId ? selectedCharge?.status === "draft" ? "แก้ไขร่างรายการเรียกเก็บ" : "รายละเอียดรายการเรียกเก็บ" : "เพิ่มรายการเรียกเก็บ"}</h2><p>{selectedCharge?.status === "draft" || !chargeId ? "บันทึกยอดที่ลูกค้าเป็นหนี้ VP โดยไม่กำหนดความหมายของรายได้ VAT หรือค่าตอบแทนอัตโนมัติ" : statusExplanation(selectedCharge?.status)}</p></div><button className={styles.iconButton} type="button" aria-label="ปิดรายละเอียดรายการเรียกเก็บ" onClick={() => setPanelOpen(false)}>×</button></div>

          {selectedCharge && (selectedCharge.status !== "draft" || selectedCharge.source_type === "billing_installment_item") ? <ReadOnlyDetail charge={selectedCharge} clients={clients} cases={cases} advisories={advisories} /> : <>
            {!permissions.canManageFinanceBillableCharges ? <div className={styles.readOnlyNotice}>ข้อมูลร่างเป็นแบบอ่านอย่างเดียวสำหรับสิทธิ์ของคุณ คุณยังตรวจสอบและยืนยันพร้อมออกใบแจ้งหนี้ได้เมื่อมีสิทธิ์อนุมัติ</div> : null}
            {!chargeId ? <fieldset className={styles.sourceChoices}><legend>ยอดนี้เกิดจากอะไร</legend><label className={form.sourceType === "ad_hoc_service" ? styles.choiceActive : ""}><input type="radio" name="sourceType" value="ad_hoc_service" disabled={createSourceLocked || !permissions.canManageFinanceBillableCharges} checked={form.sourceType === "ad_hoc_service"} onChange={() => updateForm("sourceType", "ad_hoc_service")} /><span><strong>ค่าบริการ / งานเพิ่มเติม</strong><small>เช่น ค่าเดินทาง ค่าแปล ค่าล่าม หรือบริการเพิ่มเติมที่ต้องเรียกเก็บลูกค้า</small></span></label><label className={form.sourceType === "recoverable_cost" ? styles.choiceActive : ""}><input type="radio" name="sourceType" value="recoverable_cost" disabled={createSourceLocked || !permissions.canManageFinanceBillableCharges} checked={form.sourceType === "recoverable_cost"} onChange={() => updateForm("sourceType", "recoverable_cost")} /><span><strong>ค่าใช้จ่ายที่เรียกคืนจากลูกค้า</strong><small>เช่น ค่าใช้จ่ายที่ VP สำรองจ่ายและลูกค้าต้องชำระคืน</small></span></label></fieldset> : <div className={styles.sourceSummary}><span>ที่มาของยอด</span><strong>{sourceTypeLabel(form.sourceType)}</strong></div>}

            <div className={styles.formGrid}>
              <FormField label="ลูกค้า" error={errors.clientId}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.clientId} onChange={(event) => { setForm((current) => ({ ...current, clientId: event.target.value, matterMode: "unlinked", caseId: "", advisoryMatterId: "" })); setErrors((current) => ({ ...current, clientId: "", matter: "" })); }}><option value="">เลือกลูกค้า</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || "ลูกค้าไม่มีชื่อ"}</option>)}</select></FormField>
              <FormField label="วันที่เกิดรายการ / วันที่ให้บริการ" error={errors.serviceDate}><input disabled={!permissions.canManageFinanceBillableCharges} type="date" value={form.serviceDate} onChange={(event) => updateForm("serviceDate", event.target.value)} /></FormField>
            </div>

            <div id="billable-charge-matter" className={styles.matterSection}><span className={styles.fieldHeading}>เชื่อมกับเรื่อง/งาน</span><div className={styles.segmented}><button disabled={!permissions.canManageFinanceBillableCharges} type="button" className={form.matterMode === "unlinked" ? styles.segmentActive : ""} onClick={() => setMatterMode("unlinked")}>ไม่ผูกกับงานเฉพาะ</button><button disabled={!permissions.canManageFinanceBillableCharges} type="button" className={form.matterMode === "case" ? styles.segmentActive : ""} onClick={() => setMatterMode("case")}>คดี</button><button disabled={!permissions.canManageFinanceBillableCharges} type="button" className={form.matterMode === "advisory" ? styles.segmentActive : ""} onClick={() => setMatterMode("advisory")}>งานที่ปรึกษา</button></div>
              {form.matterMode === "case" ? <FormField label="เลือกคดี" error={errors.matter}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.caseId} onChange={(event) => { updateForm("caseId", event.target.value); setErrors((current) => ({ ...current, matter: "" })); }}><option value="">เลือกคดีของลูกค้ารายนี้</option>{clientCases.map((item) => <option key={item.id} value={item.id}>{caseOptionLabel(item)}</option>)}</select></FormField> : null}
              {form.matterMode === "advisory" ? <FormField label="เลือกงานที่ปรึกษา" error={errors.matter}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.advisoryMatterId} onChange={(event) => { updateForm("advisoryMatterId", event.target.value); setErrors((current) => ({ ...current, matter: "" })); }}><option value="">เลือกงานที่ปรึกษาของลูกค้ารายนี้</option>{clientAdvisories.map((item) => <option key={item.id} value={item.id}>{advisoryOptionLabel(item)}</option>)}</select></FormField> : null}
              {form.matterMode === "unlinked" ? <p className={styles.helper}>รายการนี้จะผูกกับลูกค้าโดยตรง กรุณาเลือกตัวเลือกนี้โดยตั้งใจเมื่อไม่มีคดีหรืองานที่ปรึกษาที่เกี่ยวข้อง</p> : null}
            </div>

            <div className={styles.formGrid}>
              <FormField label="รายการ" error={errors.description} wide><textarea disabled={!permissions.canManageFinanceBillableCharges} rows={3} value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="เช่น ค่าเดินทางไปศาล" /></FormField>
              <FormField label="จำนวน" error={errors.quantity}><input disabled={!permissions.canManageFinanceBillableCharges} inputMode="decimal" value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} /></FormField>
              <FormField label="หน่วย" error={errors.unit}><input disabled={!permissions.canManageFinanceBillableCharges} value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder="เช่น ครั้ง หน้า วัน" /></FormField>
              <FormField label="ราคาต่อหน่วย" helper={!form.unitRate.trim() ? "ยังไม่ได้ระบุราคา" : undefined} error={errors.unitRate}><input disabled={!permissions.canManageFinanceBillableCharges} inputMode="decimal" value={form.unitRate} onChange={(event) => updateForm("unitRate", event.target.value)} placeholder="0.00" /></FormField>
              <FormField label="ประเภทของยอด" error={errors.economicClassification}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.economicClassification} onChange={(event) => updateForm("economicClassification", event.target.value as ChargeForm["economicClassification"])}><option value="">เลือกประเภทของยอด</option><option value="professional_fee">ค่าวิชาชีพ</option><option value="additional_service">ค่าบริการเพิ่มเติม</option><option value="reimbursable_expense">ค่าใช้จ่ายเรียกคืน</option><option value="government_or_court_fee">ค่าธรรมเนียมศาล / หน่วยงานรัฐ</option><option value="other">อื่น ๆ</option></select><small>ใช้จำแนกความหมายของยอด ไม่ได้กำหนด VAT, WHT หรือค่าตอบแทนอัตโนมัติ</small></FormField>
              <FormField label="การคิด VAT" error={errors.priceTaxMode}><select disabled={!permissions.canManageFinanceBillableCharges} value={form.priceTaxMode} onChange={(event) => { const mode = event.target.value as FinancePriceTaxMode; setForm((current) => ({ ...current, priceTaxMode: mode, vatRate: mode === "non_vat" ? "0" : Number(current.vatRate) > 0 ? current.vatRate : "7" })); setErrors((current) => ({ ...current, priceTaxMode: "", vatRate: "" })); }}><option value="non_vat">ไม่มี VAT</option><option value="vat_exclusive">ราคายังไม่รวม VAT</option><option value="vat_inclusive">ราคารวม VAT แล้ว</option></select></FormField>
              {form.priceTaxMode !== "non_vat" ? <FormField label="อัตรา VAT (%)" error={errors.vatRate}><input disabled={!permissions.canManageFinanceBillableCharges} inputMode="decimal" value={form.vatRate} onChange={(event) => updateForm("vatRate", event.target.value)} /></FormField> : null}
            </div>

            <section className={styles.additionalSection}>
              <div className={styles.additionalHeading}><h3>ข้อมูลเพิ่มเติม</h3><p>ข้อมูลประกอบรายการที่ไม่บังคับ</p></div>
              <div className={styles.formGrid}>
                <FormField label="เลขอ้างอิง / หลักฐานประกอบ" helper="ไม่บังคับ"><input disabled={!permissions.canManageFinanceBillableCharges} value={form.sourceReference} onChange={(event) => updateForm("sourceReference", event.target.value)} /></FormField>
                <FormField label="ข้อมูลภาษีเพิ่มเติม (ถ้ามี)" helper="ใช้สำหรับข้อมูลประกอบเพิ่มเติมเท่านั้น ไม่ได้กำหนด VAT หรือ WHT อัตโนมัติ"><input disabled={!permissions.canManageFinanceBillableCharges} value={form.taxCategory} onChange={(event) => updateForm("taxCategory", event.target.value)} /></FormField>
              </div>
            </section>

            <AmountReview form={form} amounts={amounts} />
            <div className={styles.saveRow}><span className={dirty ? styles.unsavedState : styles.savedState}>{dirty ? "มีข้อมูลที่ยังไม่ได้บันทึก" : chargeId ? "บันทึกร่างแล้ว" : "ยังไม่สร้างข้อมูลในระบบ"}</span><button className={styles.secondaryButton} type="button" disabled={saving || !dirty || !permissions.canManageFinanceBillableCharges} onClick={() => void saveDraft()}>{saving ? "กำลังบันทึก..." : "บันทึกร่าง"}</button></div>

            {selectedCharge?.status === "draft" ? <section ref={reviewRef} className={styles.reviewZone} tabIndex={-1}>
              <div><span className={styles.eyebrow}>ตรวจสอบรายการ</span><h3>ตรวจสอบก่อนพร้อมออกใบแจ้งหนี้</h3><p>ตรวจสอบลูกค้า เรื่อง วันที่ รายการ ประเภทของยอด การคิด VAT และยอดเงินทั้งหมดก่อนยืนยัน</p></div>
              <ReviewGrid form={form} amounts={amounts} clients={clients} cases={cases} advisories={advisories} />
              {errors.ready ? <p className={styles.fieldError}>{errors.ready}</p> : null}
              <label id="billable-charge-acknowledgement" className={errors.acknowledgement ? styles.invalidCheck : styles.checkLabel}><input type="checkbox" checked={readyAcknowledged} onChange={(event) => { setReadyAcknowledged(event.target.checked); setErrors((current) => ({ ...current, acknowledgement: "" })); }} /><span>ยืนยันว่ารายการและยอดเรียกเก็บนี้ถูกต้อง และพร้อมนำไปออกใบแจ้งหนี้</span></label>
              {errors.acknowledgement ? <p className={styles.fieldError}>{errors.acknowledgement}</p> : null}
              <button className={styles.primaryButton} type="button" disabled={saving || !chargeId || dirty || !permissions.canApproveFinanceBillableCharges} onClick={() => void markReady()}>ยืนยันพร้อมออกใบแจ้งหนี้</button>
              {dirty ? <p className={styles.permissionNote}>มีข้อมูลที่ยังไม่ได้บันทึก กรุณาบันทึกร่างก่อนยืนยันพร้อมออกใบแจ้งหนี้</p> : null}
              {!permissions.canApproveFinanceBillableCharges ? <p className={styles.permissionNote}>คุณบันทึกร่างได้ แต่ไม่มีสิทธิ์ยืนยันรายการพร้อมออกใบแจ้งหนี้</p> : null}
            </section> : null}
          </>}

          {canCancelSelected ? <section className={styles.otherActions}><div><strong>การดำเนินการอื่น</strong><p>การยกเลิกจะเก็บรายการนี้ไว้เป็นประวัติและต้องระบุเหตุผล</p></div>{cancelContext === "editor" ? <div className={styles.cancelForm}><FormField label="เหตุผลที่ยกเลิกรายการ" error={errors.cancelReason}><textarea rows={3} value={cancelReason} onChange={(event) => { setCancelReason(event.target.value); setErrors((current) => ({ ...current, cancelReason: "" })); }} /></FormField><div className={styles.actionRow}><button className={styles.secondaryButton} type="button" onClick={() => setCancelContext(null)}>ไม่ดำเนินการ</button><button className={styles.dangerButton} type="button" disabled={saving} onClick={() => void cancelCharge()}>ยืนยันยกเลิกรายการ</button></div></div> : <button className={styles.dangerButton} type="button" onClick={() => setCancelContext("editor")}>ยกเลิกรายการเรียกเก็บ</button>}</section> : null}

          {chargeId ? <AuditHistory audits={audits} /> : null}
        </section> : null}
      </> : null}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <AuthGuard><AppTopNav title="Finance" subtitle="รายการรอเรียกเก็บ" activePage="finance" /><main className={styles.page}>{children}</main></AuthGuard>;
}

function FormField({ label, helper, error, wide, children }: { label: string; helper?: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return <label id={`billable-charge-field-${fieldId(label)}`} className={`${styles.field} ${wide ? styles.wideField : ""} ${error ? styles.invalidField : ""}`}><span>{label}</span>{children}{helper ? <small>{helper}</small> : null}{error ? <em>{error}</em> : null}</label>;
}

function AmountReview({ form, amounts }: { form: ChargeForm; amounts: ReturnType<typeof calculateFormAmounts> }) {
  const hasUnitRate = Boolean(form.unitRate.trim());
  const amountValue = (value: number) => hasUnitRate ? money(value) : "-";
  return <section className={styles.amountReview}><div><span>จำนวน × ราคาต่อหน่วย</span><strong>{number(form.quantity)} {form.unit || "หน่วย"} × {hasUnitRate ? money(form.unitRate) : "ยังไม่ได้ระบุราคา"}</strong></div><dl><div><dt>ยอดก่อน VAT</dt><dd>{amountValue(amounts.amountBeforeVat)}</dd></div><div><dt>VAT</dt><dd>{amountValue(amounts.vatAmount)}</dd></div><div className={styles.totalLine}><dt>ยอดเรียกเก็บ</dt><dd>{amountValue(amounts.totalAmount)}</dd></div></dl><p>ยอดที่แสดงใช้วิธีคำนวณเดียวกับใบเสนอราคาและเป็นข้อมูลช่วยตรวจสอบ เมื่อบันทึกแล้วระบบจะโหลดจำนวนเงินที่คำนวณโดยฐานข้อมูลกลับมา</p></section>;
}

function ReviewGrid({ form, amounts, clients, cases, advisories }: { form: ChargeForm; amounts: ReturnType<typeof calculateFormAmounts>; clients: ClientOption[]; cases: CaseOption[]; advisories: AdvisoryOption[] }) {
  return <dl className={styles.reviewGrid}><ReviewItem label="ลูกค้า" value={clientLabel(form.clientId, clients)} /><ReviewItem label="คดี / งานที่ปรึกษา" value={formMatterLabel(form, cases, advisories)} /><ReviewItem label="วันที่เกิดรายการ" value={thaiDate(form.serviceDate)} /><ReviewItem label="รายการ" value={form.description || "-"} /><ReviewItem label="จำนวน / หน่วย / ราคา" value={`${number(form.quantity)} ${form.unit || "-"} × ${money(form.unitRate || 0)}`} /><ReviewItem label="ประเภทของยอด" value={classificationLabel(form.economicClassification || null)} /><ReviewItem label="การคิด VAT" value={taxModeLabel(form.priceTaxMode, form.vatRate)} /><ReviewItem label="ยอดก่อน VAT" value={money(amounts.amountBeforeVat)} /><ReviewItem label="VAT" value={money(amounts.vatAmount)} /><ReviewItem label="ยอดเรียกเก็บ" value={money(amounts.totalAmount)} /><ReviewItem label="อ้างอิง / หลักฐาน" value={form.sourceReference || "-"} /></dl>;
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function ReadOnlyDetail({ charge, clients, cases, advisories }: { charge: BillableCharge; clients: ClientOption[]; cases: CaseOption[]; advisories: AdvisoryOption[] }) {
  const notice = charge.status === "ready_to_invoice" ? "รายการนี้พร้อมใช้ในการออกใบแจ้งหนี้ ข้อมูลรายการ ยอด ภาษี และประเภทของยอดเป็นแบบอ่านอย่างเดียว หากข้อมูลผิด ให้ยกเลิกรายการนี้และสร้างรายการใหม่" : statusExplanation(charge.status);
  return <>
    {notice ? <div className={styles.readOnlyNotice}>{notice}</div> : null}
    <dl className={styles.detailGrid}><Detail label="ลูกค้า" value={clientLabel(charge.client_id, clients)} link="/clients" /><Detail label="คดี / งานที่ปรึกษา" value={matterLabel(charge, cases, advisories)} link={charge.case_id ? `/cases/${charge.case_id}` : charge.advisory_matter_id ? `/advisory/${charge.advisory_matter_id}` : undefined} /><Detail label="ที่มาของยอด" value={sourceTypeLabel(charge.source_type)} /><Detail label="วันที่เกิดรายการ" value={thaiDate(charge.service_date)} /><Detail label="รายการ" value={charge.description || "-"} /><Detail label="จำนวน / หน่วย / ราคา" value={`${number(charge.quantity)} ${charge.unit || "-"} × ${money(charge.unit_rate, charge.currency)}`} /><Detail label="ประเภทของยอด" value={classificationLabel(charge.economic_classification)} /><Detail label="การคิด VAT" value={taxModeLabel(charge.price_tax_mode, charge.vat_rate)} /><Detail label="ยอดก่อน VAT" value={money(charge.amount_before_vat, charge.currency)} /><Detail label="VAT" value={money(charge.vat_amount, charge.currency)} /><Detail label="ยอดเรียกเก็บ" value={money(charge.total_amount, charge.currency)} prominent /><Detail label="เลขอ้างอิง / หลักฐาน" value={charge.source_reference || "-"} /><Detail label="สร้างเมื่อ" value={thaiDateTime(charge.created_at)} /><Detail label="ยืนยันพร้อมออกใบแจ้งหนี้" value={thaiDateTime(charge.ready_to_invoice_at)} />{charge.status === "cancelled" ? <><Detail label="ยกเลิกเมื่อ" value={thaiDateTime(charge.cancelled_at)} /><Detail label="เหตุผลที่ยกเลิก" value={charge.cancel_reason || "-"} /></> : null}</dl>
  </>;
}

function BillableChargeModalDetail({ charge, clients, cases, advisories }: { charge: BillableCharge; clients: ClientOption[]; cases: CaseOption[]; advisories: AdvisoryOption[] }) {
  const notice = charge.status === "ready_to_invoice" ? "รายการนี้พร้อมใช้ในการออกใบแจ้งหนี้ ข้อมูลรายการ ยอด ภาษี และประเภทของยอดเป็นแบบอ่านอย่างเดียว" : statusExplanation(charge.status);
  return <div className={styles.modalDetailContent}>
    {notice ? <div className={styles.readOnlyNotice}>{notice}</div> : null}
    <section className={styles.detailSection}>
      <div className={styles.detailSectionHeading}><span className={styles.eyebrow}>ข้อมูลหลัก</span><h3>ข้อมูลรายการ</h3></div>
      <dl className={styles.detailGrid}><Detail label="รายการ" value={charge.description || "-"} prominent /><Detail label="ลูกค้า" value={clientLabel(charge.client_id, clients)} link="/clients" /><Detail label="คดี / งานที่ปรึกษา" value={matterLabel(charge, cases, advisories)} link={charge.case_id ? `/cases/${charge.case_id}` : charge.advisory_matter_id ? `/advisory/${charge.advisory_matter_id}` : undefined} /><Detail label="ที่มาของยอด" value={sourceTypeLabel(charge.source_type)} /><Detail label="วันที่เกิดรายการ" value={thaiDate(charge.service_date)} /></dl>
    </section>
    <section className={styles.detailSection}>
      <div className={styles.detailSectionHeading}><span className={styles.eyebrow}>ยอดเรียกเก็บ</span><h3>การคำนวณยอด</h3></div>
      <dl className={styles.detailGrid}><Detail label="จำนวน / หน่วย / ราคา" value={`${number(charge.quantity)} ${charge.unit || "-"} × ${money(charge.unit_rate, charge.currency)}`} /><Detail label="ประเภทของยอด" value={classificationLabel(charge.economic_classification)} /><Detail label="การคิด VAT" value={taxModeLabel(charge.price_tax_mode, charge.vat_rate)} /><Detail label="ยอดก่อน VAT" value={money(charge.amount_before_vat, charge.currency)} /><Detail label="VAT" value={money(charge.vat_amount, charge.currency)} /><Detail label="ยอดเรียกเก็บ" value={money(charge.total_amount, charge.currency)} prominent /></dl>
    </section>
    <section className={styles.detailSection}>
      <div className={styles.detailSectionHeading}><span className={styles.eyebrow}>ข้อมูลรอง</span><h3>ข้อมูลประกอบ</h3></div>
      <dl className={styles.detailGrid}><Detail label="เลขอ้างอิง / หลักฐาน" value={charge.source_reference || "-"} /><Detail label="สร้างเมื่อ" value={thaiDateTime(charge.created_at)} /><Detail label="ยืนยันพร้อมออกใบแจ้งหนี้" value={thaiDateTime(charge.ready_to_invoice_at)} />{charge.status === "cancelled" ? <><Detail label="ยกเลิกเมื่อ" value={thaiDateTime(charge.cancelled_at)} /><Detail label="เหตุผลที่ยกเลิก" value={charge.cancel_reason || "-"} /></> : null}</dl>
    </section>
  </div>;
}

function AuditHistory({ audits, loading = false }: { audits: AuditEvent[]; loading?: boolean }) {
  return <details className={styles.auditDetails}><summary>ประวัติรายการ</summary>{loading ? <p>กำลังโหลดประวัติรายการ...</p> : audits.length ? <ol>{audits.map((event) => <li key={event.id}><div><strong>{auditLabel(event.event_type)}</strong><span>{event.actor_name || event.actor_email || "ผู้ใช้งานระบบ"}</span></div><time>{thaiDateTime(event.created_at)}</time></li>)}</ol> : <p>ยังไม่พบประวัติรายการ</p>}</details>;
}

function Detail({ label, value, link, prominent }: { label: string; value: string; link?: string; prominent?: boolean }) {
  return <div className={prominent ? styles.prominentDetail : ""}><dt>{label}</dt><dd>{link ? <Link href={link}>{value}</Link> : value}</dd></div>;
}

function StatusBadge({ status }: { status: ChargeStatus }) {
  return <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>{statusLabel(status)}</span>;
}

function PlusIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function emptyForm(): ChargeForm {
  return { sourceType: "ad_hoc_service", clientId: "", matterMode: "unlinked", caseId: "", advisoryMatterId: "", serviceDate: bangkokToday(), description: "", quantity: "1", unit: "", unitRate: "", economicClassification: "", priceTaxMode: "non_vat", vatRate: "0", sourceReference: "", taxCategory: "" };
}

function chargeToForm(charge: BillableCharge): ChargeForm {
  return { sourceType: charge.source_type === "recoverable_cost" ? "recoverable_cost" : "ad_hoc_service", clientId: charge.client_id, matterMode: charge.case_id ? "case" : charge.advisory_matter_id ? "advisory" : "unlinked", caseId: charge.case_id ? String(charge.case_id) : "", advisoryMatterId: charge.advisory_matter_id || "", serviceDate: charge.service_date || "", description: charge.description || "", quantity: String(charge.quantity), unit: charge.unit || "", unitRate: String(charge.unit_rate), economicClassification: charge.economic_classification || "", priceTaxMode: charge.price_tax_mode, vatRate: String(charge.vat_rate), sourceReference: charge.source_reference || "", taxCategory: charge.tax_category || "" };
}

function validateDraft(form: ChargeForm) {
  const errors: Record<string, string> = {};
  if (!form.clientId) errors.clientId = "กรุณาเลือกลูกค้า";
  if (form.matterMode === "case" && !form.caseId) errors.matter = "กรุณาเลือกคดีของลูกค้ารายนี้";
  if (form.matterMode === "advisory" && !form.advisoryMatterId) errors.matter = "กรุณาเลือกงานที่ปรึกษาของลูกค้ารายนี้";
  if (!isDecimal(form.quantity, 4, false)) errors.quantity = "กรุณาระบุจำนวนมากกว่า 0 และไม่เกิน 4 ตำแหน่งทศนิยม";
  if (!isDecimal(form.unitRate || "0", 2, true)) errors.unitRate = "กรุณาระบุราคาต่อหน่วยไม่ติดลบและไม่เกิน 2 ตำแหน่งทศนิยม";
  if (form.priceTaxMode !== "non_vat" && !isDecimal(form.vatRate, 4, true)) errors.vatRate = "กรุณาระบุอัตรา VAT ที่ถูกต้อง";
  return errors;
}

function validateReady(form: ChargeForm) {
  const errors = validateDraft(form);
  if (!form.serviceDate) errors.serviceDate = "กรุณาระบุวันที่เกิดรายการ";
  if (!form.description.trim()) errors.description = "กรุณาระบุรายการที่จะเรียกเก็บ";
  if (!form.unit.trim()) errors.unit = "กรุณาระบุหน่วย";
  if (!form.economicClassification) errors.economicClassification = "กรุณาเลือกประเภทของยอด";
  if (calculateFormAmounts(form).totalAmount <= 0) errors.unitRate = "ยอดเรียกเก็บต้องมากกว่า 0 ก่อนยืนยัน";
  return errors;
}

function calculateFormAmounts(form: ChargeForm) {
  const quantity = safeNumber(form.quantity);
  const unitRate = safeNumber(form.unitRate);
  const vatRate = form.priceTaxMode === "non_vat" ? 0 : safeNumber(form.vatRate);
  return calculateFinanceLineAmounts(quantity, unitRate, form.priceTaxMode, vatRate);
}

function focusFirstError(errors: Record<string, string>) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  window.requestAnimationFrame(() => {
    const target = first === "acknowledgement" ? document.getElementById("billable-charge-acknowledgement") : first === "matter" ? document.getElementById("billable-charge-matter") : document.getElementById(`billable-charge-field-${fieldId(errorFieldLabel(first))}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.querySelector<HTMLElement>("input,select,textarea")?.focus({ preventScroll: true });
  });
}

function errorFieldLabel(field: string) {
  const labels: Record<string, string> = { clientId: "ลูกค้า", serviceDate: "วันที่เกิดรายการ / วันที่ให้บริการ", description: "รายการ", quantity: "จำนวน", unit: "หน่วย", unitRate: "ราคาต่อหน่วย", economicClassification: "ประเภทของยอด", vatRate: "อัตรา VAT (%)", matter: "เลือกคดี" };
  return labels[field] || field;
}

function fieldId(value: string) { return value.replace(/[^a-zA-Z0-9ก-๙]+/gu, "-"); }
function formFingerprint(form: ChargeForm) { return JSON.stringify(form); }
function nullable(value: string) { return value.trim() || null; }
function safeNumber(value: number | string) { const next = Number(value || 0); return Number.isFinite(next) ? next : 0; }
function isDecimal(value: string, decimals: number, allowZero: boolean) { const normalized = value.trim(); if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(normalized)) return false; const parsed = Number(normalized); return allowZero ? parsed >= 0 : parsed > 0; }
function bangkokToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function thaiDate(value: string | null) { return value ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value)) : "-"; }
function thaiDateTime(value: string | null) { return value ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"; }
function money(value: number | string, currency = "THB") { return `${new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeNumber(value))} ${currency}`; }
function number(value: number | string) { return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 }).format(safeNumber(value)); }
function sortCharges(a: BillableCharge, b: BillableCharge) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); }
function countStatus(charges: BillableCharge[], status: "all" | ChargeStatus) { return status === "all" ? charges.length : charges.filter((item) => item.status === status).length; }
function clientLabel(id: string, clients: ClientOption[]) { return clients.find((item) => item.id === id)?.name || "ไม่พบชื่อลูกค้า"; }
function caseOptionLabel(item: CaseOption) { return [item.file_no, item.title].filter(Boolean).join(" · ") || `คดี ${item.id}`; }
function advisoryOptionLabel(item: AdvisoryOption) { return [item.matter_no, item.title].filter(Boolean).join(" · ") || "งานที่ปรึกษา"; }
function matterLabel(charge: Pick<BillableCharge, "case_id" | "advisory_matter_id">, cases: CaseOption[], advisories: AdvisoryOption[]) { if (charge.case_id) return `คดี · ${caseOptionLabel(cases.find((item) => item.id === charge.case_id) || { id: charge.case_id, client_id: null, file_no: null, title: null })}`; if (charge.advisory_matter_id) return `งานที่ปรึกษา · ${advisoryOptionLabel(advisories.find((item) => item.id === charge.advisory_matter_id) || { id: charge.advisory_matter_id, client_id: null, matter_no: null, title: null })}`; return "ไม่ผูกกับงานเฉพาะ"; }
function formMatterLabel(form: ChargeForm, cases: CaseOption[], advisories: AdvisoryOption[]) { if (form.matterMode === "case") return caseOptionLabel(cases.find((item) => String(item.id) === form.caseId) || { id: Number(form.caseId || 0), client_id: null, file_no: null, title: null }); if (form.matterMode === "advisory") return advisoryOptionLabel(advisories.find((item) => item.id === form.advisoryMatterId) || { id: form.advisoryMatterId, client_id: null, matter_no: null, title: null }); return "ไม่ผูกกับงานเฉพาะ"; }
function sourceTypeLabel(value: SourceType | ChargeForm["sourceType"]) { if (value === "recoverable_cost") return "ค่าใช้จ่ายที่เรียกคืนจากลูกค้า"; if (value === "billing_installment_item") return "รายการจากแผนเรียกเก็บเงิน"; return "ค่าบริการ / งานเพิ่มเติม"; }
function classificationLabel(value: EconomicClassification | null) { if (value === "professional_fee") return "ค่าวิชาชีพ"; if (value === "additional_service") return "ค่าบริการเพิ่มเติม"; if (value === "reimbursable_expense") return "ค่าใช้จ่ายเรียกคืน"; if (value === "government_or_court_fee") return "ค่าธรรมเนียมศาล / หน่วยงานรัฐ"; if (value === "other") return "อื่น ๆ"; return "ยังไม่ระบุ"; }
function taxModeLabel(mode: FinancePriceTaxMode, vatRate: number | string) { if (mode === "non_vat") return "ไม่มี VAT"; return `${mode === "vat_inclusive" ? "ราคารวม VAT แล้ว" : "ราคายังไม่รวม VAT"} · ${number(vatRate)}%`; }
function statusLabel(status: ChargeStatus) { if (status === "ready_to_invoice") return "พร้อมออกใบแจ้งหนี้"; if (status === "reserved") return "กำลังจัดทำใบแจ้งหนี้"; if (status === "invoiced") return "ออกใบแจ้งหนี้แล้ว"; if (status === "cancelled") return "ยกเลิก"; return "ร่าง"; }
function statusExplanation(status?: ChargeStatus) { if (status === "ready_to_invoice") return "รายการนี้พร้อมใช้ในการออกใบแจ้งหนี้"; if (status === "reserved") return "รายการนี้กำลังอยู่ในขั้นตอนจัดทำใบแจ้งหนี้"; if (status === "invoiced") return "รายการนี้ถูกนำไปออกใบแจ้งหนี้แล้ว"; if (status === "cancelled") return "รายการนี้ถูกยกเลิกและเก็บไว้เป็นประวัติ"; return ""; }
function auditLabel(event: string) { if (event === "draft_saved") return "แก้ไขร่าง"; if (event === "marked_ready") return "ยืนยันพร้อมออกใบแจ้งหนี้"; if (event === "cancelled") return "ยกเลิกรายการ"; return "สร้างรายการ"; }

function billableChargeError(value: unknown, fallback: string) {
  const message = typeof value === "object" && value && "message" in value ? String((value as { message?: unknown }).message || "") : String(value || "");
  if (message.includes("Case must belong") || message.includes("Advisory matter must belong")) return "คดีหรืองานที่ปรึกษาไม่ได้อยู่ภายใต้ลูกค้าที่เลือก กรุณาตรวจสอบอีกครั้ง";
  if (message.includes("Only a Draft") || message.includes("can be saved")) return "รายการนี้ไม่ใช่สถานะร่างแล้ว กรุณารีเฟรชและตรวจสอบสถานะล่าสุด";
  if (message.includes("Reserved or Invoiced")) return "รายการที่กำลังจัดทำหรือออกใบแจ้งหนี้แล้วไม่สามารถยกเลิกจากหน้านี้ได้";
  if (message.includes("description is required")) return "กรุณาระบุรายการที่จะเรียกเก็บก่อนยืนยัน";
  if (message.includes("unit is required")) return "กรุณาระบุหน่วยก่อนยืนยัน";
  if (message.includes("economic classification is required")) return "กรุณาเลือกประเภทของยอดก่อนยืนยัน";
  if (message.includes("total must be positive")) return "ยอดเรียกเก็บต้องมากกว่า 0 ก่อนยืนยัน";
  if (message.includes("request id was already used")) return "ข้อมูลการสร้างรายการเปลี่ยนไประหว่างการบันทึก กรุณาปิดแบบฟอร์มและเริ่มรายการใหม่";
  if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์ดำเนินการนี้ กรุณาติดต่อ Admin";
  return fallback;
}
