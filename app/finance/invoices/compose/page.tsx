"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DetailModal from "../../../components/DetailModal";
import { QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";
import type { UserPermissions } from "../../../../lib/permissions";
import FinanceSubNav from "../../FinanceSubNav";
import { displayText, eligibleInvoicePaymentBankAccount, money, safeInvoiceError, type FinanceBankAccount, type Json } from "../shared";
import InvoiceWorkspaceNav from "../InvoiceWorkspaceNav";
import { billableChargeNatureLabel, clientCostFundingModeLabel, type ClientCostFundingMode } from "../../billable-charges/funding-semantics";
import { billingPlanInvoiceSelectionResumeHref, historicalInstallmentClassificationItems, historicalInstallmentClassificationPrompt, invoiceCompositionMode } from "../../billing-plans/charge-context";
import styles from "../invoice-workspace.module.css";

type Client = { id: string; name: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null };
type Advisory = { id: string; matter_no: string | null; title: string | null };
type Charge = {
  id: string; client_id: string; case_id: number | null; advisory_matter_id: string | null;
  source_type: string; client_cost_funding_mode: ClientCostFundingMode | null; description: string | null; quantity: number | string; unit: string | null;
  currency: string; service_date: string | null; economic_classification: string | null;
  price_tax_mode: string; vat_rate: number | string; amount_before_vat: number | string;
  vat_amount: number | string; total_amount: number | string; status: string; source_reference: string | null;
};
type Plan = { id: string; fee_agreement_id: string; title: string | null; status: string; currency: string };
type Agreement = { id: string; client_id: string; case_id: number | null; advisory_matter_id: string | null; title: string; agreement_no: string | null; status: string; engagement_basis: string | null; source_reference: string | null; language_code: string | null };
type Installment = {
  id: string; billing_plan_id: string; installment_no: number; title: string; status: string;
  readiness_event_date: string | null; ready_to_invoice_at: string | null; readiness_confirmed_at: string | null;
  readiness_confirmed_by_user_id: string | null; readiness_evidence_json: Json | null;
  trigger_description: string | null; due_date: string | null;
  amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string;
};
type InstallmentItem = { id: string; billing_installment_id: string; fee_agreement_item_id: string; economic_classification: string | null; unit: string | null; amount_before_tax: number | string; vat_amount: number | string; total_amount: number | string };
type AgreementItem = { id: string; description: string; item_snapshot_json: Json | null };
type Bridge = { billing_installment_id: string };
type ExistingInvoice = { primary_billing_installment_id: string | null };
type AuditEvent = { id: string; event_type: string; actor_name: string | null; actor_email: string | null; created_at: string };
type AdapterValue = { economicClassification: string; unit: string; confirmed: boolean };
type CreateAttempt = { fingerprint: string; requestId: string };

const classifications = [
  ["professional_fee", "ค่าวิชาชีพ"], ["additional_service", "ค่าบริการเพิ่มเติม"],
  ["reimbursable_expense", "ค่าใช้จ่ายเรียกคืน"], ["government_or_court_fee", "ค่าธรรมเนียมศาล / หน่วยงานรัฐ"], ["other", "อื่น ๆ"],
] as const;

export default function InvoiceComposerPage() {
  return <Suspense fallback={<div className={styles.loading}>กำลังโหลดเครื่องมือสร้างใบแจ้งหนี้...</div>}><QuotationGuard canAccess={(access) => access.permissions.canEditFinanceQuotation && access.permissions.canManageFinanceBillableCharges}>{(access) => <InvoiceComposer permissions={access.permissions} />}</QuotationGuard></Suspense>;
}

function InvoiceComposer({ permissions }: { permissions: UserPermissions }) {
  const canApproveInstallment = permissions.canApproveFinanceBillableCharges;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentItems, setInstallmentItems] = useState<InstallmentItem[]>([]);
  const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [invoiceHistory, setInvoiceHistory] = useState<ExistingInvoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<FinanceBankAccount[]>([]);
  const [clientId, setClientId] = useState("");
  const [installmentId, setInstallmentId] = useState("");
  const [chargeIds, setChargeIds] = useState<string[]>([]);
  const [adapter, setAdapter] = useState<Record<string, AdapterValue>>({});
  const [showAdapter, setShowAdapter] = useState(false);
  const [languageCode, setLanguageCode] = useState<"th" | "en">("th");
  const [dueDate, setDueDate] = useState("");
  const [paymentTermsText, setPaymentTermsText] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [detailChargeId, setDetailChargeId] = useState("");
  const [detailAudits, setDetailAudits] = useState<AuditEvent[]>([]);
  const [detailAuditLoading, setDetailAuditLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [sourceNotice, setSourceNotice] = useState("");
  const [sourceError, setSourceError] = useState("");
  const requestRef = useRef<CreateAttempt | null>(null);
  const submitLock = useRef(false);
  const reviewRef = useRef<HTMLElement | null>(null);
  const prefillHandled = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [clientResult, caseResult, advisoryResult, chargeResult, planResult, agreementResult, installmentResult, installmentItemResult, agreementItemResult, bridgeResult, invoiceResult, bankResult] = await Promise.all([
      supabase.from("clients").select("id,name").order("name"),
      supabase.from("cases").select("id,file_no,title"),
      supabase.from("advisory_matters").select("id,matter_no,title"),
      supabase.from("finance_billable_charges").select("id,client_id,case_id,advisory_matter_id,source_type,client_cost_funding_mode,description,quantity,unit,currency,service_date,economic_classification,price_tax_mode,vat_rate,amount_before_vat,vat_amount,total_amount,status,source_reference").eq("status", "ready_to_invoice").neq("source_type", "billing_installment_item").order("service_date"),
      supabase.from("finance_billing_plans").select("id,fee_agreement_id,title,status,currency").eq("status", "active"),
      supabase.from("finance_fee_agreements").select("id,client_id,case_id,advisory_matter_id,title,agreement_no,status,engagement_basis,source_reference,language_code"),
      supabase.from("finance_billing_installments").select("id,billing_plan_id,installment_no,title,status,trigger_description,due_date,readiness_event_date,ready_to_invoice_at,readiness_confirmed_at,readiness_confirmed_by_user_id,readiness_evidence_json,amount_before_tax,vat_amount,total_amount").eq("status", "ready_to_invoice"),
      supabase.from("finance_billing_installment_items").select("id,billing_installment_id,fee_agreement_item_id,economic_classification,unit,amount_before_tax,vat_amount,total_amount"),
      supabase.from("finance_fee_agreement_items").select("id,description,item_snapshot_json"),
      supabase.from("finance_billing_installment_charge_bridges").select("billing_installment_id"),
      supabase.from("finance_invoices").select("primary_billing_installment_id").not("primary_billing_installment_id", "is", null),
      supabase.from("finance_bank_accounts").select("id,short_name,bank_name,account_name,account_number,is_active").order("short_name"),
    ]);
    const results = [clientResult, caseResult, advisoryResult, chargeResult, planResult, agreementResult, installmentResult, installmentItemResult, agreementItemResult, bridgeResult, invoiceResult, bankResult];
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      console.error("LOAD INVOICE COMPOSER FAILED", firstError);
      setError("โหลดข้อมูลสำหรับสร้างใบแจ้งหนี้ไม่สำเร็จ กรุณารีเฟรช");
    } else {
      setClients((clientResult.data || []) as Client[]); setCases((caseResult.data || []) as CaseRow[]); setAdvisories((advisoryResult.data || []) as Advisory[]);
      setCharges((chargeResult.data || []) as Charge[]); setPlans((planResult.data || []) as Plan[]); setAgreements((agreementResult.data || []) as Agreement[]);
      setInstallments((installmentResult.data || []) as Installment[]); setInstallmentItems((installmentItemResult.data || []) as InstallmentItem[]);
      setAgreementItems((agreementItemResult.data || []) as AgreementItem[]); setBridges((bridgeResult.data || []) as Bridge[]);
      setInvoiceHistory((invoiceResult.data || []) as ExistingInvoice[]); setBankAccounts((bankResult.data || []) as FinanceBankAccount[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const planMap = useMemo(() => new Map(plans.map((row) => [row.id, row])), [plans]);
  const agreementMap = useMemo(() => new Map(agreements.map((row) => [row.id, row])), [agreements]);
  const agreementItemMap = useMemo(() => new Map(agreementItems.map((row) => [row.id, row])), [agreementItems]);
  const historyIds = useMemo(() => new Set(invoiceHistory.map((row) => row.primary_billing_installment_id).filter(Boolean)), [invoiceHistory]);
  const bridgeIds = useMemo(() => new Set(bridges.map((row) => row.billing_installment_id)), [bridges]);
  const eligibleInstallments = useMemo(() => installments.filter((row) => {
    const plan = planMap.get(row.billing_plan_id); const agreement = plan ? agreementMap.get(plan.fee_agreement_id) : null;
    return Boolean(plan && agreement && !historyIds.has(row.id) && completeReadiness(row));
  }), [agreementMap, historyIds, installments, planMap]);
  const clientInstallments = useMemo(() => eligibleInstallments.filter((row) => {
    const plan = planMap.get(row.billing_plan_id); const agreement = plan ? agreementMap.get(plan.fee_agreement_id) : null;
    return Boolean(clientId && agreement?.client_id === clientId);
  }), [agreementMap, clientId, eligibleInstallments, planMap]);
  const selectedInstallment = useMemo(() => clientInstallments.find((row) => row.id === installmentId) || null, [clientInstallments, installmentId]);
  const selectedPlan = selectedInstallment ? planMap.get(selectedInstallment.billing_plan_id) || null : null;
  const selectedAgreement = selectedPlan ? agreementMap.get(selectedPlan.fee_agreement_id) || null : null;
  const selectedCharges = useMemo(() => charges.filter((row) => chargeIds.includes(row.id)), [chargeIds, charges]);
  const anchor = selectedInstallment && selectedAgreement && selectedPlan
    ? { clientId: selectedAgreement.client_id, currency: selectedPlan.currency, caseId: selectedAgreement.case_id, advisoryId: selectedAgreement.advisory_matter_id }
    : selectedCharges[0] ? chargeContext(selectedCharges[0]) : null;
  const visibleCharges = useMemo(() => charges.filter((row) => row.client_id === clientId), [charges, clientId]);
  const selectedInstallmentItems = useMemo(() => installmentItems.filter((row) => row.billing_installment_id === installmentId), [installmentId, installmentItems]);
  const missingAdapterItems = useMemo(() => historicalInstallmentClassificationItems(selectedInstallmentItems, bridgeIds.has(installmentId)), [bridgeIds, installmentId, selectedInstallmentItems]);
  const detailCharge = visibleCharges.find((row) => row.id === detailChargeId) || null;
  const eligibleAccounts = bankAccounts.filter(eligibleInvoicePaymentBankAccount);
  const requestedInstallmentId = searchParams.get("installment") || "";
  const requestedChargeIdsKey = [...new Set(searchParams.getAll("charge"))].join(",");
  const requestedChargeIds = useMemo(() => requestedChargeIdsKey ? requestedChargeIdsKey.split(",") : [], [requestedChargeIdsKey]);
  const requestedClientId = searchParams.get("client") || "";
  const guidedMode = invoiceCompositionMode(requestedInstallmentId) === "billing_plan_guided";
  const openedFromSource = Boolean(requestedInstallmentId || requestedChargeIds.length);
  const requestedInstallment = installments.find((row) => row.id === requestedInstallmentId) || null;
  const requestedPlan = requestedInstallment ? planMap.get(requestedInstallment.billing_plan_id) || null : null;
  const sourceBackHref = requestedInstallmentId ? requestedPlan ? `/finance/billing-plans/${requestedPlan.id}` : "/finance/billing-plans" : "/finance/billable-charges";
  const sourceBackLabel = requestedInstallmentId ? "กลับไปแผนเรียกเก็บเงิน" : "กลับไปรายการเรียกเก็บเพิ่มเติม";
  const editCompositionHref = requestedPlan && requestedInstallmentId
    ? billingPlanInvoiceSelectionResumeHref(requestedPlan.id, requestedInstallmentId, requestedChargeIds)
    : sourceBackHref;
  const totals = useMemo(() => {
    const rows = selectedCharges.reduce((sum, row) => ({ before: sum.before + Number(row.amount_before_vat), vat: sum.vat + Number(row.vat_amount), total: sum.total + Number(row.total_amount) }), { before: 0, vat: 0, total: 0 });
    return selectedInstallment ? { before: rows.before + Number(selectedInstallment.amount_before_tax), vat: rows.vat + Number(selectedInstallment.vat_amount), total: rows.total + Number(selectedInstallment.total_amount) } : rows;
  }, [selectedCharges, selectedInstallment]);
  const classificationPrompt = historicalInstallmentClassificationPrompt(money(
    missingAdapterItems.reduce((sum, item) => sum + Number(item.total_amount), 0),
    selectedPlan?.currency || "THB",
  ));

  useEffect(() => {
    if (loading || prefillHandled.current) return;
    prefillHandled.current = true;
    setSourceError("");
    setSourceNotice("");

    if ((requestedInstallmentId && !isUuid(requestedInstallmentId)) || requestedChargeIds.some((id) => !isUuid(id))) {
      setSourceError("ลิงก์ต้นทางมีรหัสรายการไม่ถูกต้อง กรุณากลับไปเลือกข้อมูลจากหน้าต้นทางอีกครั้ง");
      return;
    }

    if (requestedInstallmentId) {
      const installment = eligibleInstallments.find((row) => row.id === requestedInstallmentId);
      if (!installment) {
        setSourceError("งวดที่เลือกไม่อยู่ในสถานะพร้อมจัดทำใบแจ้งหนี้ หรือมีประวัติใบแจ้งหนี้แล้ว กรุณากลับไปตรวจสอบแผนเรียกเก็บเงิน");
        return;
      }
      if (!canApproveInstallment) {
        setSourceError("คุณไม่มีสิทธิ์จัดทำใบแจ้งหนี้จากงวดตามแผนนี้");
        return;
      }
      const plan = planMap.get(installment.billing_plan_id);
      const agreement = plan ? agreementMap.get(plan.fee_agreement_id) : null;
      if (!plan || !agreement) {
        setSourceError("ไม่พบบริบทแผนเรียกเก็บเงินที่ยังมีผล กรุณากลับไปตรวจสอบรายการต้นทาง");
        return;
      }
      if (requestedClientId && requestedClientId !== agreement.client_id) {
        setSourceError("ลูกค้าในลิงก์ต้นทางไม่ตรงกับแผนเรียกเก็บเงิน กรุณากลับไปตรวจสอบรายการต้นทาง");
        return;
      }
      const requestedCharges = requestedChargeIds.map((id) => charges.find((row) => row.id === id)).filter((row): row is Charge => Boolean(row));
      const installmentContext = { clientId: agreement.client_id, currency: plan.currency, caseId: agreement.case_id, advisoryId: agreement.advisory_matter_id };
      if (requestedCharges.length !== requestedChargeIds.length || requestedCharges.some((charge) => incompatibilityReason(charge, installmentContext))) {
        setSourceError("รายการเรียกเก็บเพิ่มเติมบางรายการไม่พร้อมใช้งานหรือมีบริบทไม่ตรงกับงวด กรุณากลับไปเลือกใหม่จากแผนเรียกเก็บเงิน");
        return;
      }
      const nextItems = historicalInstallmentClassificationItems(
        installmentItems.filter((row) => row.billing_installment_id === installment.id),
        bridgeIds.has(installment.id),
      );
      setClientId(agreement.client_id);
      setInstallmentId(installment.id);
      setChargeIds(requestedCharges.map((charge) => charge.id));
      setAdapter(Object.fromEntries(nextItems.map((row) => [row.id, { economicClassification: "", unit: row.unit || "", confirmed: false }])));
      setLanguageCode(agreement.language_code === "en" ? "en" : "th");
      setDueDate(installment.due_date || "");
      setPaymentTermsText(installment.trigger_description || "");
      setSourceNotice(`เลือกงวดที่ ${installment.installment_no}${requestedCharges.length ? ` พร้อมรายการเพิ่มเติม ${requestedCharges.length} รายการ` : ""} จากแผนเรียกเก็บเงินให้แล้ว กรุณาตรวจสอบข้อมูลก่อนสร้างร่าง`);
      return;
    }

    if (requestedChargeIds.length) {
      const requestedCharges = requestedChargeIds.map((id) => charges.find((row) => row.id === id)).filter((row): row is Charge => Boolean(row));
      const firstCharge = requestedCharges[0];
      if (requestedCharges.length !== requestedChargeIds.length || !firstCharge || requestedCharges.some((charge) => incompatibilityReason(charge, chargeContext(firstCharge)))) {
        setSourceError("รายการต้นทางบางรายการไม่อยู่ในสถานะพร้อมหรือมีบริบทไม่ตรงกัน กรุณากลับไปตรวจสอบรายการเรียกเก็บเพิ่มเติม");
        return;
      }
      if (requestedClientId && requestedClientId !== firstCharge.client_id) {
        setSourceError("ลูกค้าในลิงก์ต้นทางไม่ตรงกับรายการเรียกเก็บเพิ่มเติม กรุณากลับไปตรวจสอบรายการต้นทาง");
        return;
      }
      setClientId(firstCharge.client_id);
      setInstallmentId("");
      setChargeIds(requestedCharges.map((charge) => charge.id));
      setAdapter({});
      setSourceNotice(`เลือกรายการเรียกเก็บเพิ่มเติม ${requestedCharges.length} รายการให้แล้ว กรุณาตรวจสอบข้อมูลก่อนสร้างร่าง`);
      return;
    }

    if (requestedClientId && clients.some((client) => client.id === requestedClientId)) setClientId(requestedClientId);
  }, [agreementMap, bridgeIds, canApproveInstallment, charges, clients, eligibleInstallments, installmentItems, loading, planMap, requestedChargeIds, requestedClientId, requestedInstallmentId]);

  const resetReview = () => { if (!guidedMode) setReviewing(false); setAcknowledged(false); setFieldError(""); };
  const selectClient = (value: string) => { setClientId(value); setInstallmentId(""); setChargeIds([]); setAdapter({}); requestRef.current = null; resetReview(); };
  const selectInstallment = (value: string) => {
    setInstallmentId(value); setChargeIds([]); resetReview(); requestRef.current = null;
    const nextItems = historicalInstallmentClassificationItems(
      installmentItems.filter((row) => row.billing_installment_id === value),
      bridgeIds.has(value),
    );
    setAdapter(Object.fromEntries(nextItems.map((row) => [row.id, { economicClassification: "", unit: row.unit || "", confirmed: false }])));
  };
  const toggleCharge = (charge: Charge) => {
    const reason = incompatibilityReason(charge, anchor);
    if (reason && !chargeIds.includes(charge.id)) return;
    setChargeIds((current) => current.includes(charge.id) ? current.filter((id) => id !== charge.id) : [...current, charge.id]);
    requestRef.current = null; resetReview();
  };
  const openChargeDetail = async (id: string) => {
    setDetailChargeId(id); setDetailAudits([]); setDetailAuditLoading(true);
    const result = await supabase.from("finance_billable_charge_audit_events").select("id,event_type,actor_name,actor_email,created_at").eq("charge_id", id).order("created_at");
    if (result.error) console.error("LOAD INVOICE COMPOSER CHARGE AUDIT FAILED", result.error);
    setDetailAudits((result.data || []) as AuditEvent[]); setDetailAuditLoading(false);
  };
  const closeChargeDetail = () => { setDetailChargeId(""); setDetailAudits([]); setDetailAuditLoading(false); };

  const openReview = () => {
    if (!clientId) return setFieldError("กรุณาเลือกลูกค้า");
    if (!installmentId && chargeIds.length === 0) return setFieldError("กรุณาเลือกงวดหรือรายการเรียกเก็บเพิ่มเติมอย่างน้อยหนึ่งรายการ");
    if (missingAdapterItems.some((item) => !adapter[item.id]?.economicClassification || !adapter[item.id]?.confirmed)) {
      setShowAdapter(true);
      return setFieldError("กรุณาเลือกประเภทของยอดสำหรับรายการตามแผน");
    }
    setFieldError(""); setReviewing(true);
    requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const createDraft = async () => {
    if ((!guidedMode && !reviewing) || !acknowledged || submitLock.current || submitting) return;
    const adapterPayload = missingAdapterItems.length ? {
      schema_version: "1", human_confirmed: true,
      items: Object.fromEntries(missingAdapterItems.map((item) => [item.id, { economic_classification: adapter[item.id]?.economicClassification, unit: adapter[item.id]?.unit || null, human_confirmed: true }])),
    } : {};
    const payloadFingerprint = JSON.stringify({ installmentId: installmentId || null, chargeIds: [...chargeIds].sort(), adapterPayload, languageCode, dueDate, paymentTermsText: paymentTermsText.trim(), customerNote: customerNote.trim(), internalNote: internalNote.trim(), bankAccountId: bankAccountId || null });
    if (!requestRef.current || requestRef.current.fingerprint !== payloadFingerprint) requestRef.current = { fingerprint: payloadFingerprint, requestId: crypto.randomUUID() };
    submitLock.current = true; setSubmitting(true); setError("");
    try {
      const result = await supabase.rpc("create_finance_invoice_v2_draft", {
        p_request_id: requestRef.current.requestId,
        p_billing_installment_id: installmentId || null,
        p_charge_ids: chargeIds,
        p_adapter_certification_json: adapterPayload,
        p_human_confirmed: true,
        p_language_code: languageCode,
        p_due_date: dueDate || null,
        p_customer_note: customerNote || null,
        p_payment_terms_text: paymentTermsText || null,
        p_internal_note: internalNote || null,
        p_payment_destination_bank_account_id: bankAccountId || null,
      });
      if (result.error) throw result.error;
      router.push(`/finance/invoices/${String(result.data)}`);
    } catch (createError) {
      console.error("CREATE INVOICE COMPOSITION FAILED", createError);
      setError(safeInvoiceError(createError, "สร้างร่างใบแจ้งหนี้ไม่สำเร็จ"));
      await load();
    } finally {
      submitLock.current = false; setSubmitting(false);
    }
  };

  if (loading) return <div className={styles.loading}>กำลังโหลดเครื่องมือสร้างใบแจ้งหนี้...</div>;
  return <div className={styles.page}>
    <FinanceSubNav activePage="invoices" permissions={permissions} />
    <InvoiceWorkspaceNav activePage="invoices" showAdditionalCharges={permissions.canViewFinanceBillableCharges} />
    {openedFromSource ? <div className={styles.contextNavigation}><Link className={styles.contextBackLink} href={sourceBackHref}>← {guidedMode ? "กลับแผนเรียกเก็บเงิน" : sourceBackLabel}</Link></div> : null}
    <header className={styles.header}><div><span className={styles.eyebrow}>{guidedMode ? "การเรียกเก็บเงิน" : "INVOICE COMPOSER"}</span><h1>{guidedMode ? "ตรวจสอบใบแจ้งหนี้" : "จัดทำใบแจ้งหนี้"}</h1><p>{guidedMode ? "ตรวจสอบข้อมูลที่รับมาจากแผนเรียกเก็บเงินก่อนสร้างร่างใบแจ้งหนี้" : "เลือกและตรวจสอบยอดที่ต้องการเรียกเก็บ ก่อนยืนยันสร้างร่างใบแจ้งหนี้"}</p></div></header>
    {openedFromSource ? <div className={styles.sourceSafety}><strong>ยังไม่มีการสร้างข้อมูล</strong><span>การเปิดหน้านี้เป็นการเตรียมรายการเท่านั้น ระบบจะสร้างร่างเมื่อคุณตรวจสอบและยืนยันในขั้นตอนสุดท้าย</span></div> : null}
    {sourceError ? <div role="alert" className={styles.error}>{sourceError}</div> : null}
    {sourceNotice && !guidedMode ? <div role="status" className={styles.notice}>{sourceNotice}</div> : null}
    {error ? <div role="alert" className={styles.error}>{error}</div> : null}

    {guidedMode ? <>
      <section className={styles.surface}><SectionHeader title="ต้นทาง" text="ข้อมูลนี้รับจากเอกสารต้นทางและถูกล็อกสำหรับการจัดทำใบแจ้งหนี้ครั้งนี้" />
        <dl className={styles.reviewGrid}><Review label="ลูกค้า" value={clients.find((row) => row.id === clientId)?.name || "-"} /><Review label="งาน/เรื่อง" value={selectedAgreement ? matterLabel(selectedAgreement.case_id, selectedAgreement.advisory_matter_id, cases, advisories) : "ไม่ผูกกับงานเฉพาะ"} /><Review label="ใบเสนอราคา" value={selectedAgreement?.source_reference || "ไม่พบเลขอ้างอิง"} /><Review label="ข้อตกลงค่าบริการ" value={selectedAgreement?.agreement_no || selectedAgreement?.title || "-"} /><Review label="แผนเรียกเก็บเงิน" value={selectedPlan?.title || "-"} /><Review label="งวดเรียกเก็บ" value={selectedInstallment ? `งวดที่ ${selectedInstallment.installment_no} · ${selectedInstallment.title}` : "-"} /><Review label="สกุลเงิน" value={selectedPlan?.currency || "THB"} /><Review label="ภาษาเอกสาร" value={languageCode === "en" ? "English" : "ไทย"} /></dl>
      </section>
      <section className={styles.surface}><SectionHeader title="รายการเรียกเก็บ" text="องค์ประกอบนี้เลือกจากแผนเรียกเก็บเงินแล้ว หากต้องเปลี่ยนให้แก้ไขรายการในส่วนนี้" action={<Link className={styles.secondaryButton} href={editCompositionHref}>แก้ไขรายการ</Link>} />
        <div className={styles.lockedList}>{selectedInstallment ? <div className={styles.lockedRow}><div><strong>ยอดตามแผนเรียกเก็บเงิน · งวดที่ {selectedInstallment.installment_no}</strong><small>{selectedInstallment.title}</small></div><strong>{money(selectedInstallment.total_amount, selectedPlan?.currency || "THB")}</strong></div> : null}{selectedCharges.map((charge) => <div className={styles.lockedRow} key={charge.id}><div><strong>{charge.description || "รายการเรียกเก็บเพิ่มเติม"}</strong><small>{classificationLabel(charge.economic_classification)} · {taxLabel(charge)}</small></div><strong>{money(charge.total_amount, charge.currency)}</strong></div>)}</div>
        {missingAdapterItems.length ? <div className={styles.compactAdapter}><div><strong>{classificationPrompt.title}</strong><p>{classificationPrompt.description}</p></div><button className={styles.secondaryButton} type="button" onClick={() => setShowAdapter((current) => !current)}>{showAdapter ? "ซ่อนการเลือกประเภท" : classificationPrompt.action}</button></div> : null}
        {showAdapter && missingAdapterItems.length ? <AdapterFields items={missingAdapterItems} adapter={adapter} agreementItemMap={agreementItemMap} currency={selectedPlan?.currency || "THB"} onChange={(itemId, value) => { setAdapter((current) => ({ ...current, [itemId]: value })); resetReview(); }} /> : null}
      </section>
    </> : <>
    <section className={styles.surface}><SectionHeader title="1. ลูกค้าและบริบท" text="เลือกลูกค้าก่อน ระบบจะแสดงเฉพาะแหล่งยอดของลูกค้ารายนั้น" />
      <div className={styles.contextGrid}><Field label="ลูกค้า"><select value={clientId} onChange={(event) => selectClient(event.target.value)}><option value="">เลือกลูกค้า</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || "ลูกค้าไม่มีชื่อ"}</option>)}</select></Field></div>
    </section>

    <section className={styles.surface}><SectionHeader title="2. ยอดตามแผนเรียกเก็บเงิน" text="เลือกได้ไม่เกินหนึ่งงวด หรือไม่เลือกหากต้องการออกใบแจ้งหนี้จากรายการเรียกเก็บเพิ่มเติมเท่านั้น" />
      {!clientId ? <div className={styles.notice}>เลือกลูกค้าก่อนเพื่อดูงวดที่พร้อม</div> : <div className={styles.choiceList}>
        <label className={`${styles.installmentChoice} ${!installmentId ? styles.choiceSelected : ""}`}><input type="radio" name="installment" value="" checked={!installmentId} onChange={() => selectInstallment("")} /><span className={styles.choiceBody}><strong>ไม่เลือกงวดตามแผน</strong><small>สร้างจากรายการเรียกเก็บเพิ่มเติมเท่านั้น</small></span></label>
        {clientInstallments.map((row) => { const plan = planMap.get(row.billing_plan_id); const agreement = plan ? agreementMap.get(plan.fee_agreement_id) : null; return <label key={row.id} className={`${styles.installmentChoice} ${installmentId === row.id ? styles.choiceSelected : ""} ${!canApproveInstallment ? styles.choiceDisabled : ""}`}><input type="radio" name="installment" disabled={!canApproveInstallment} value={row.id} checked={installmentId === row.id} onChange={() => selectInstallment(row.id)} /><span className={styles.choiceBody}><strong>งวดที่ {row.installment_no} · {row.title || "งวดเรียกเก็บเงิน"}</strong><span>{agreement?.agreement_no || agreement?.title || "ข้อมูลการว่าจ้าง"} · {matterLabel(agreement?.case_id || null, agreement?.advisory_matter_id || null, cases, advisories)}</span><small>{bridgeIds.has(row.id) ? "งวดนี้มีโครงสร้างรายการที่ผ่านการรับรองแล้ว" : "ระบบจะคัดลอกยอดต้นทางตามงวดโดยไม่ให้แก้จำนวนเงิน"}</small></span><strong className={styles.choiceAmount}>{money(row.total_amount, plan?.currency || "THB")}</strong></label>; })}
        {!clientInstallments.length ? <div className={styles.notice}>ไม่พบงวดที่ผ่านเงื่อนไขเบื้องต้นสำหรับลูกค้ารายนี้</div> : null}
        {!canApproveInstallment && clientInstallments.length ? <p className={styles.fieldError}>สิทธิ์ของคุณสร้างใบแจ้งหนี้จากรายการเรียกเก็บเพิ่มเติมได้ แต่ไม่สามารถรับรองงวดตามแผนเรียกเก็บ</p> : null}
      </div>}
      {missingAdapterItems.length ? <AdapterFields items={missingAdapterItems} adapter={adapter} agreementItemMap={agreementItemMap} currency={selectedPlan?.currency || "THB"} onChange={(itemId, value) => { setAdapter((current) => ({ ...current, [itemId]: value })); resetReview(); }} /> : null}
    </section>

    <section className={styles.surface}><SectionHeader title="3. รายการเรียกเก็บเพิ่มเติม" text="เลือกได้ทั้งรายการเดียวหรือหลายรายการ รายการที่บริบทไม่ตรงกันจะไม่สามารถเลือกได้" />
      {!clientId ? <div className={styles.notice}>เลือกลูกค้าก่อนเพื่อดูรายการพร้อมเรียกเก็บ</div> : !visibleCharges.length ? <div className={styles.empty}>ลูกค้ารายนี้ยังไม่มีรายการพร้อมออกใบแจ้งหนี้</div> : <div className={styles.choiceList}>{visibleCharges.map((charge) => { const reason = incompatibilityReason(charge, anchor); const selected = chargeIds.includes(charge.id); return <div key={charge.id} className={`${styles.chargeChoice} ${selected ? styles.choiceSelected : ""} ${reason && !selected ? styles.choiceDisabled : ""}`}><input aria-label={`เลือก ${charge.description || "รายการ"}`} type="checkbox" disabled={Boolean(reason && !selected)} checked={selected} onChange={() => toggleCharge(charge)} /><div className={styles.choiceBody}><strong>{charge.description || "รายการเรียกเก็บเพิ่มเติม"}</strong><div className={styles.chargeMeta}><span>{thaiDate(charge.service_date)}</span><span>{classificationLabel(charge.economic_classification)}</span><span>{taxLabel(charge)}</span><span>{matterLabel(charge.case_id, charge.advisory_matter_id, cases, advisories)}</span></div><div className={styles.chargeMeta}><span>ก่อน VAT {money(charge.amount_before_vat, charge.currency)}</span><span>VAT {money(charge.vat_amount, charge.currency)}</span><span className={styles.readyText}>พร้อมออกใบแจ้งหนี้</span></div>{reason && !selected ? <small className={styles.fieldError}>{reason}</small> : null}<button className={styles.detailButton} type="button" onClick={() => void openChargeDetail(charge.id)}>ดูรายละเอียด</button></div><strong className={styles.choiceAmount}>{money(charge.total_amount, charge.currency)}</strong></div>; })}</div>}
    </section>
    </>}

    <section className={styles.surface}><SectionHeader title={guidedMode ? "ข้อมูลใบแจ้งหนี้" : "4. ข้อมูลในใบแจ้งหนี้"} text={guidedMode ? "วันที่และเงื่อนไขรับจากงวดต้นทาง แก้ไขได้ก่อนสร้างร่างเมื่อมีเหตุผลทางธุรกิจ" : "ใช้ข้อมูลบัญชีรับชำระชุดเดียวกับใบแจ้งหนี้เดิม และแก้ไขต่อได้ในร่าง"} />
      <div className={styles.contextGrid}><Field label="วันที่ครบกำหนด" helper={guidedMode ? "รับจากแผนเรียกเก็บเงิน" : "ไม่บังคับ"}><input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); requestRef.current = null; resetReview(); }} /></Field>{!guidedMode ? <Field label="ภาษาเอกสาร"><select value={languageCode} onChange={(event) => { setLanguageCode(event.target.value === "en" ? "en" : "th"); requestRef.current = null; resetReview(); }}><option value="th">ไทย</option><option value="en">English</option></select></Field> : null}<Field label="บัญชีสำหรับรับชำระ" helper="เลือกภายหลังในร่างได้ แต่ต้องเลือกก่อนออกใบแจ้งหนี้"><select value={bankAccountId} onChange={(event) => { setBankAccountId(event.target.value); requestRef.current = null; resetReview(); }}><option value="">ยังไม่เลือก</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{displayText(account.short_name)} — {displayText(account.bank_name)} · {displayText(account.account_number)}</option>)}</select></Field><Field label="ข้อมูลการชำระเงิน" helper={guidedMode ? "รับจากเงื่อนไขของงวดต้นทาง" : undefined} wide><textarea rows={3} value={paymentTermsText} onChange={(event) => { setPaymentTermsText(event.target.value); requestRef.current = null; resetReview(); }} /></Field><Field label="หมายเหตุถึงลูกค้า"><textarea rows={3} value={customerNote} onChange={(event) => { setCustomerNote(event.target.value); requestRef.current = null; resetReview(); }} /></Field><Field label="หมายเหตุภายใน"><textarea rows={3} value={internalNote} onChange={(event) => { setInternalNote(event.target.value); requestRef.current = null; resetReview(); }} /></Field></div>
    </section>

    <section className={`${styles.surface} ${styles.summary}`}><SectionHeader title="สรุปยอดที่เลือก" text="ยอดนี้ใช้เพื่อช่วยตรวจสอบจากข้อมูลต้นทาง ระบบฐานข้อมูลจะตรวจสอบและบันทึกยอดจริงอีกครั้ง" />
      {selectedInstallment ? <div className={styles.summaryLine}><span>ยอดตามแผนเรียกเก็บเงิน · งวดที่ {selectedInstallment.installment_no}</span><strong>{money(selectedInstallment.total_amount, selectedPlan?.currency || "THB")}</strong></div> : null}
      {selectedCharges.map((charge) => <div key={charge.id} className={styles.summaryLine}><span>{charge.description || "รายการเรียกเก็บเพิ่มเติม"}</span><strong>{money(charge.total_amount, charge.currency)}</strong></div>)}
      {!selectedInstallment && !selectedCharges.length ? <div className={styles.notice}>ยังไม่ได้เลือกยอดเรียกเก็บ</div> : <dl className={styles.summaryTotals}><div><dt>ยอดก่อน VAT</dt><dd>{money(totals.before, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")}</dd></div><div><dt>VAT</dt><dd>{money(totals.vat, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")}</dd></div><div className={styles.grandTotal}><dt>ยอดรวมใบแจ้งหนี้</dt><dd>{money(totals.total, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")}</dd></div></dl>}
      {fieldError ? <p role="alert" className={styles.fieldError}>{fieldError}</p> : null}{!guidedMode ? <div className={styles.reviewActions}><button className={styles.primaryButton} type="button" onClick={openReview}>ตรวจสอบก่อนสร้างร่าง</button></div> : null}
    </section>

    {guidedMode || reviewing ? <section ref={reviewRef} className={`${styles.surface} ${styles.reviewSection}`}><SectionHeader title="ยืนยันสร้างร่างใบแจ้งหนี้" text="ตรวจสอบข้อมูลทั้งหมดก่อนกันรายการไว้สำหรับร่างใบแจ้งหนี้นี้" />
      <dl className={styles.reviewGrid}><Review label="ลูกค้า" value={clients.find((row) => row.id === clientId)?.name || "-"} /><Review label="คดี/งาน" value={anchor ? matterLabel(anchor.caseId, anchor.advisoryId, cases, advisories) : "ไม่ผูกกับงานเฉพาะ"} /><Review label="ยอดตามแผนเรียกเก็บเงิน" value={selectedInstallment ? `งวดที่ ${selectedInstallment.installment_no} · ${selectedInstallment.title}` : "ไม่เลือก"} /><Review label="รายการเรียกเก็บเพิ่มเติม" value={`${selectedCharges.length} รายการ`} /><Review label="VAT" value={money(totals.vat, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")} /><Review label="ยอดรวม" value={money(totals.total, selectedPlan?.currency || selectedCharges[0]?.currency || "THB")} /><Review label="บัญชีรับชำระ" value={bankAccounts.find((row) => row.id === bankAccountId)?.short_name || "ยังไม่เลือก"} /><Review label="วันที่ครบกำหนด" value={dueDate || "ไม่ระบุ"} /></dl>
      <div className={styles.reservationNote}>เมื่อสร้างร่างแล้ว รายการเหล่านี้จะถูกกันไว้สำหรับใบแจ้งหนี้ฉบับนี้ จนกว่าจะออกใบแจ้งหนี้หรือยกเลิกร่าง</div>
      <label className={styles.checkRow}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>ยืนยันว่ารายการที่เลือกและยอดเรียกเก็บถูกต้อง และต้องการสร้างร่างใบแจ้งหนี้</span></label>
      <div className={styles.reviewActions}>{!guidedMode ? <button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => setReviewing(false)}>กลับไปแก้ไข</button> : null}<button className={styles.primaryButton} type="button" disabled={!acknowledged || submitting} onClick={() => { if (missingAdapterItems.some((item) => !adapter[item.id]?.economicClassification || !adapter[item.id]?.confirmed)) { openReview(); return; } void createDraft(); }}>{submitting ? "กำลังสร้างร่าง..." : "สร้างร่างใบแจ้งหนี้"}</button></div>
    </section> : null}

    {detailCharge ? <DetailModal open title={detailCharge.description || "รายการเรียกเก็บเพิ่มเติม"} subtitle={matterLabel(detailCharge.case_id, detailCharge.advisory_matter_id, cases, advisories)} prominentValue={money(detailCharge.total_amount, detailCharge.currency)} onClose={closeChargeDetail}><div className={styles.modalContent}><dl className={styles.modalGrid}><Review label="วันที่" value={thaiDate(detailCharge.service_date)} /><Review label="สถานะ" value="พร้อมออกใบแจ้งหนี้" /><Review label="ลักษณะรายการ" value={billableChargeNatureLabel(detailCharge.source_type)} />{detailCharge.source_type === "recoverable_cost" ? <Review label="การจ่าย" value={clientCostFundingModeLabel(detailCharge.client_cost_funding_mode)} /> : null}<Review label="ประเภทของยอด" value={classificationLabel(detailCharge.economic_classification)} /><Review label="VAT" value={taxLabel(detailCharge)} /><Review label="ยอดก่อน VAT" value={money(detailCharge.amount_before_vat, detailCharge.currency)} /><Review label="VAT" value={money(detailCharge.vat_amount, detailCharge.currency)} /><Review label="ยอดรวม" value={money(detailCharge.total_amount, detailCharge.currency)} /><Review label="จำนวน/หน่วย" value={`${detailCharge.quantity} ${detailCharge.unit || "หน่วย"}`} /><Review label="อ้างอิง" value={detailCharge.source_reference || "-"} /></dl><ChargeAuditHistory audits={detailAudits} loading={detailAuditLoading} /></div></DetailModal> : null}
  </div>;
}

function SectionHeader({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className={styles.sectionHeader}><div><h2>{title}</h2><p>{text}</p></div>{action}</div>; }
function Field({ label, helper, wide, children }: { label: string; helper?: string; wide?: boolean; children: ReactNode }) { return <label className={`${styles.field} ${wide ? styles.wide : ""}`}><span>{label}</span>{children}{helper ? <small>{helper}</small> : null}</label>; }
function Review({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function AdapterFields({ items, adapter, agreementItemMap, currency, onChange }: { items: InstallmentItem[]; adapter: Record<string, AdapterValue>; agreementItemMap: Map<string, AgreementItem>; currency: string; onChange: (id: string, value: AdapterValue) => void }) {
  return <div className={styles.adapterPanel}><h3>เลือกประเภทรายการ</h3><p>เลือกเฉพาะประเภทของยอดสำหรับข้อมูลตามแผนเดิม ยอดเงินและ VAT ด้านล่างเป็นข้อมูลอ่านอย่างเดียวและจะไม่เปลี่ยนแปลง</p><div className={styles.adapterRows}>{items.map((item) => { const agreementItem = agreementItemMap.get(item.fee_agreement_item_id); const value = adapter[item.id] || { economicClassification: "", unit: item.unit || "", confirmed: false }; return <div key={item.id} className={styles.adapterRow}><div><strong>{agreementItem?.description || "รายการตามงวด"}</strong><div className={styles.muted}>ยอดรวม {money(item.total_amount, currency)} · VAT {money(item.vat_amount, currency)}</div></div><Field label="ประเภทของยอด"><select value={value.economicClassification} onChange={(event) => { const economicClassification = event.target.value; onChange(item.id, { ...value, economicClassification, confirmed: Boolean(economicClassification) }); }}><option value="">เลือกประเภท</option>{classifications.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field></div>; })}</div></div>;
}
function ChargeAuditHistory({ audits, loading }: { audits: AuditEvent[]; loading: boolean }) { return <details className={styles.auditDetails}><summary>ประวัติรายการ</summary>{loading ? <p>กำลังโหลดประวัติรายการ...</p> : audits.length ? <ol>{audits.map((event) => <li key={event.id}><div><strong>{auditLabel(event.event_type)}</strong><span>{event.actor_name || event.actor_email || "ผู้ใช้งานระบบ"}</span></div><time>{thaiDateTime(event.created_at)}</time></li>)}</ol> : <p>ยังไม่พบประวัติรายการ</p>}</details>; }
function completeReadiness(row: Installment) { return Boolean(row.readiness_event_date && row.ready_to_invoice_at && row.readiness_confirmed_at && row.readiness_confirmed_by_user_id && row.readiness_evidence_json && Object.keys(row.readiness_evidence_json).length); }
function chargeContext(charge: Charge) { return { clientId: charge.client_id, currency: charge.currency, caseId: charge.case_id, advisoryId: charge.advisory_matter_id }; }
function incompatibilityReason(charge: Charge, anchor: ReturnType<typeof chargeContext> | null) {
  if (!anchor) return "";
  if (charge.client_id !== anchor.clientId) return "รายการนี้เป็นของลูกค้าคนละราย";
  if (charge.currency !== anchor.currency) return "รายการนี้ใช้สกุลเงินต่างกัน";
  if (charge.case_id !== anchor.caseId || charge.advisory_matter_id !== anchor.advisoryId) return charge.case_id || charge.advisory_matter_id ? "รายการนี้เป็นของคนละคดี/งาน" : "รายการนี้ไม่ได้ผูกกับคดี/งานเดียวกัน";
  return "";
}
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function matterLabel(caseId: number | null, advisoryId: string | null, cases: CaseRow[], advisories: Advisory[]) { if (caseId) { const row = cases.find((item) => item.id === caseId); return row ? [row.file_no, row.title].filter(Boolean).join(" · ") : "คดีที่เชื่อมไว้"; } if (advisoryId) { const row = advisories.find((item) => item.id === advisoryId); return row ? [row.matter_no, row.title].filter(Boolean).join(" · ") : "งานที่ปรึกษาที่เชื่อมไว้"; } return "ไม่ผูกกับงานเฉพาะ"; }
function classificationLabel(value: string | null) { return classifications.find(([id]) => id === value)?.[1] || "ยังไม่ระบุ"; }
function taxLabel(charge: Charge) { return charge.price_tax_mode === "non_vat" ? "ไม่มี VAT" : charge.price_tax_mode === "vat_inclusive" ? `รวม VAT ${Number(charge.vat_rate)}% แล้ว` : `VAT ${Number(charge.vat_rate)}%`; }
function thaiDate(value: string | null) { if (!value) return "-"; return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(`${value.slice(0, 10)}T12:00:00+07:00`)); }
function thaiDateTime(value: string) { return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)); }
function auditLabel(value: string) { return value === "created" ? "สร้างร่างรายการ" : value === "draft_saved" ? "บันทึกร่าง" : value === "marked_ready" ? "ยืนยันพร้อมออกใบแจ้งหนี้" : value === "cancelled" ? "ยกเลิกรายการ" : value; }
