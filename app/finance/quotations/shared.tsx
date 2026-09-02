"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import FinanceSubNav from "../FinanceSubNav";
import { calculateFinanceLineAmounts } from "../finance-line-amounts";
import { calculateGrossFirstPercentageAllocation } from "./payment-allocation";
import { createAuditLog } from "../../../lib/auditLog";
import { getQuotationClientDisplayName } from "../../../lib/quotationClientDisplay";
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
  can_manage_finance_payments?: boolean | null;
  can_confirm_finance_payments?: boolean | null;
  can_reverse_finance_payments?: boolean | null;
  can_reallocate_finance_payments?: boolean | null;
  can_view_finance_cash_transactions?: boolean | null;
  can_manage_finance_cash_transactions?: boolean | null;
  can_confirm_finance_cash_transactions?: boolean | null;
  can_reverse_finance_cash_transactions?: boolean | null;
};

export type QuotationStatus = "draft" | "sent" | "accepted" | "cancelled";

export type QuotationRow = {
  id: string;
  quotation_no: string;
  client_id: string | null;
  customer_source_type?: "existing_client" | "prospect" | null;
  prospect_name?: string | null;
  prospect_contact_person?: string | null;
  prospect_phone?: string | null;
  prospect_email?: string | null;
  prospect_tax_id?: string | null;
  prospect_address?: string | null;
  matter_source_type?: "unlinked" | "case" | "advisory" | null;
  unlinked_matter_name?: string | null;
  unlinked_matter_description?: string | null;
  client_linked_at?: string | null;
  matter_linked_at?: string | null;
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
  client_item_key?: string;
  quotation_id?: string;
  description: string;
  unit: string;
  economic_classification: string;
  quantity: number | string;
  unit_price: number | string;
  amount_before_tax: number | string;
  vat_applicable: boolean;
  price_tax_mode?: "non_vat" | "vat_exclusive" | "vat_inclusive" | null;
  vat_rate: number | string;
  vat_amount: number | string;
  line_total: number | string;
  sort_order: number;
};

type PaymentMethodType = "single" | "installments" | "milestone" | "recurring" | "manual";
type PaymentCalculationType = "percentage" | "fixed_amount";
type PaymentTriggerType = "quotation_acceptance" | "agreement_effective" | "date" | "case_milestone" | "recurring_period" | "manual";
type PaymentAllocation = {
  quotation_item_id?: string;
  client_item_key?: string;
  allocated_amount_before_tax: number;
  allocated_vat_amount: number;
  allocated_total: number;
  allocation_percentage?: number | string;
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
type PaymentAllocationMode = "proportional_all_items" | "per_item";
type PaymentTermsRow = { id: string; payment_method_type: PaymentMethodType; client_summary: string | null; allocation_mode?: PaymentAllocationMode };
type PaymentInstallmentRow = Omit<PaymentInstallment, "percentage" | "payment_due_days" | "items"> & { id: string; percentage: number | string | null; payment_due_days: number | string };
type PaymentAllocationRow = { payment_installment_id: string; quotation_item_id: string; allocated_amount_before_tax: number | string; allocated_vat_amount: number | string; allocated_total: number | string; allocation_percentage?: number | string | null };
type PaymentTermsSnapshot = { ready: boolean; saved: string; current: string };
type NewPaymentTermsPayload = { payment_method_type: PaymentMethodType; client_summary: string; allocation_mode: PaymentAllocationMode; installments: PaymentInstallment[] };
type PaymentTermsValidationIssue = { message: string; installmentIndex: number; field: "title" | "trigger" | "trigger_description" | "due_date" | "payment_due_days" | "percentage" };
type PaymentAllocationValidationIssue = { message: string; itemReference?: string; installmentIndex?: number };
type PaymentInstallmentTotal = { beforeTax: number; vat: number; total: number };
type PaymentLineItemSource = { item: QuotationItemRow; reference: string };
type PendingNavigation = { href: string; label: string };
type QuotationEngagementBasis = "formal_agreement" | "accepted_quotation";
type QuotationEngagementReference = { id: string; engagement_basis: QuotationEngagementBasis | null; status: string; source_reference: string | null };
type EngagementConfirmationForm = { confirmedOn: string; channel: string; note: string };
type EngagementConfirmationErrors = Partial<Record<"confirmedOn" | "channel", string>>;
type SaveAllResult =
  | { ok: true }
  | { ok: false; stage: "quotation" | "payment_terms" | "refetch"; message: string };

type ClientRow = { id: string; name: string | null; client_type?: string | null; tax_id?: string | null; email?: string | null; phone?: string | null; address?: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };
type ServicePatternRow = {
  id: string;
  pattern_code: string;
  display_name: string;
  category: string | null;
  short_description: string | null;
  scope_text: string | null;
  included_services_text: string | null;
  excluded_services_text: string | null;
  is_active: boolean;
  sort_order: number;
};

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
  servicePatterns: ServicePatternRow[];
  companyProfile: CompanyProfile;
};

type FormState = {
  customer_mode: "existing_client" | "prospect";
  client_id: string;
  prospect_name: string;
  prospect_contact_person: string;
  prospect_phone: string;
  prospect_email: string;
  prospect_tax_id: string;
  prospect_address: string;
  matter_mode: "unlinked" | "case" | "advisory";
  case_id: string;
  advisory_matter_id: string;
  unlinked_matter_name: string;
  unlinked_matter_description: string;
  issue_date: string;
  valid_until: string;
  scope_of_legal_services: string;
  included_services: string;
  excluded_services: string;
  service_pattern_id: string;
  service_pattern_code: string;
  service_pattern_name: string;
  authorized_signer_key: string;
  note: string;
  internal_note: string;
};

const emptyForm: FormState = {
  customer_mode: "existing_client",
  client_id: "",
  prospect_name: "",
  prospect_contact_person: "",
  prospect_phone: "",
  prospect_email: "",
  prospect_tax_id: "",
  prospect_address: "",
  matter_mode: "unlinked",
  case_id: "",
  advisory_matter_id: "",
  unlinked_matter_name: "",
  unlinked_matter_description: "",
  issue_date: getDateKey(new Date()),
  valid_until: "",
  scope_of_legal_services: "",
  included_services: "",
  excluded_services: "",
  service_pattern_id: "",
  service_pattern_code: "",
  service_pattern_name: "",
  authorized_signer_key: DEFAULT_AUTHORIZED_SIGNER.key,
  note: "",
  internal_note: "",
};

const emptyItem: QuotationItemRow = {
  description: "",
  unit: "",
  economic_classification: "",
  quantity: "1",
  unit_price: "",
  amount_before_tax: 0,
  vat_applicable: true,
  price_tax_mode: "vat_exclusive",
  vat_rate: 7,
  vat_amount: 0,
  line_total: 0,
  sort_order: 0,
};

const quotationEconomicClassifications = [
  ["professional_fee", "ค่าวิชาชีพ"],
  ["additional_service", "ค่าบริการเพิ่มเติม"],
  ["reimbursable_expense", "ค่าใช้จ่ายเรียกคืน"],
  ["government_or_court_fee", "ค่าธรรมเนียมศาล / หน่วยงานรัฐ"],
  ["other", "อื่น ๆ"],
] as const;
const quotationEconomicClassificationIds = new Set<string>(quotationEconomicClassifications.map(([value]) => value));

function createNewQuotationItem(index = 0): QuotationItemRow {
  return { ...emptyItem, client_item_key: `item-${crypto.randomUUID()}`, sort_order: index };
}

function normalizedQuotationDraftSnapshot(form: FormState, items: QuotationItemRow[]) {
  return JSON.stringify({
    form: {
      ...form,
      client_id: form.client_id.trim(),
      prospect_name: form.prospect_name.trim(),
      prospect_contact_person: form.prospect_contact_person.trim(),
      prospect_phone: form.prospect_phone.trim(),
      prospect_email: form.prospect_email.trim(),
      prospect_tax_id: form.prospect_tax_id.trim(),
      prospect_address: form.prospect_address.trim(),
      case_id: form.case_id.trim(),
      advisory_matter_id: form.advisory_matter_id.trim(),
      unlinked_matter_name: form.unlinked_matter_name.trim(),
      unlinked_matter_description: form.unlinked_matter_description.trim(),
      scope_of_legal_services: form.scope_of_legal_services.trim(),
      included_services: form.included_services.trim(),
      excluded_services: form.excluded_services.trim(),
      service_pattern_id: form.service_pattern_id.trim(),
      service_pattern_code: form.service_pattern_code.trim(),
      service_pattern_name: form.service_pattern_name.trim(),
      note: form.note.trim(),
      internal_note: form.internal_note.trim(),
    },
    items: items.map((item, index) => {
      const normalized = normalizeItem(item, index);
      return {
        description: normalized.description.trim(),
        unit: normalized.unit.trim(),
        economic_classification: normalized.economic_classification,
        quantity: toAmount(normalized.quantity),
        unit_price: toAmount(normalized.unit_price),
        vat_applicable: normalized.vat_applicable,
        price_tax_mode: normalized.price_tax_mode,
        vat_rate: toAmount(normalized.vat_rate),
        sort_order: index,
      };
    }),
  });
}

function normalizedPaymentTermsSnapshot(method: PaymentMethodType, summary: string, installments: PaymentInstallment[], allocationMode: PaymentAllocationMode = "proportional_all_items") {
  return JSON.stringify({
    method,
    allocationMode,
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
      items: installment.items
        .filter((item) => allocationMode !== "per_item" || toAmount(item.allocation_percentage || 0) > 0)
        .map((item) => ({
          quotation_item_id: item.quotation_item_id,
          client_item_key: item.client_item_key,
          allocated_amount_before_tax: toAmount(item.allocated_amount_before_tax),
          allocated_vat_amount: toAmount(item.allocated_vat_amount),
          allocated_total: toAmount(item.allocated_total),
          allocation_percentage: item.allocation_percentage == null ? null : normalizePercentage(item.allocation_percentage),
        })),
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

const fullPaymentInstallmentTitle = "ชำระเต็มจำนวน";
const legacyFullPaymentInstallmentTitle = "ชำระเต็มจำนวน / Full Payment";

function numberedInstallmentTitle(installmentNo: number) {
  return `งวดที่ ${installmentNo}`;
}

function isAutomaticInstallmentTitle(title: string) {
  const normalized = title.trim();
  return normalized === fullPaymentInstallmentTitle
    || normalized === legacyFullPaymentInstallmentTitle
    || /^งวดที่\s+\d+$/u.test(normalized)
    || /^งวดที่\s+\d+\s*\/\s*Installment\s+\d+$/u.test(normalized);
}

function automaticInstallmentTitle(title: string, installmentNo: number, method: PaymentMethodType) {
  const normalized = title.trim();
  const usesLegacyBilingualTitle = normalized === legacyFullPaymentInstallmentTitle
    || /^งวดที่\s+\d+\s*\/\s*Installment\s+\d+$/u.test(normalized);
  if (usesLegacyBilingualTitle) return method === "single" ? legacyFullPaymentInstallmentTitle : `งวดที่ ${installmentNo} / Installment ${installmentNo}`;
  return method === "single" ? fullPaymentInstallmentTitle : numberedInstallmentTitle(installmentNo);
}

function getDefaultPaymentTrigger(method: PaymentMethodType): PaymentTriggerType {
  if (method === "milestone") return "case_milestone";
  if (method === "recurring") return "recurring_period";
  if (method === "manual") return "manual";
  return "quotation_acceptance";
}

function getEffectivePaymentTrigger(method: PaymentMethodType, selectedTrigger: PaymentTriggerType): PaymentTriggerType {
  return ["milestone", "recurring", "manual"].includes(method) ? getDefaultPaymentTrigger(method) : selectedTrigger;
}

function triggerUsesFixedCalendarDate(method: PaymentMethodType, selectedTrigger: PaymentTriggerType) {
  return getEffectivePaymentTrigger(method, selectedTrigger) === "date";
}

function createDefaultPaymentInstallment(
  installmentNo: number,
  method: PaymentMethodType,
  items: PaymentAllocation[],
  percentage = "",
  calculationType: PaymentCalculationType = "percentage",
): PaymentInstallment {
  return {
    installment_no: installmentNo,
    title: method === "single" ? fullPaymentInstallmentTitle : numberedInstallmentTitle(installmentNo),
    calculation_type: calculationType,
    percentage,
    trigger_type: getDefaultPaymentTrigger(method),
    trigger_description: "",
    due_date: "",
    payment_due_days: "0",
    client_note: "",
    items,
  };
}

function normalizePaymentInstallments(installments: PaymentInstallment[], method: PaymentMethodType) {
  const forcedTrigger = ["milestone", "recurring", "manual"].includes(method) ? getDefaultPaymentTrigger(method) : null;
  return installments.map((installment, index) => {
    const installmentNo = index + 1;
    const title = isAutomaticInstallmentTitle(installment.title)
      ? automaticInstallmentTitle(installment.title, installmentNo, method)
      : installment.title;
    const nextTrigger = method === "installments"
      ? (installment.trigger_type === "recurring_period" ? "quotation_acceptance" : installment.trigger_type)
      : forcedTrigger || installment.trigger_type;
    return {
      ...installment,
      installment_no: installmentNo,
      title,
      trigger_type: nextTrigger,
      due_date: nextTrigger === "date" ? installment.due_date : "",
    };
  });
}

function getPaymentTermsPlanValidationIssue(method: PaymentMethodType, installments: PaymentInstallment[], allocationMode: PaymentAllocationMode = "proportional_all_items"): PaymentTermsValidationIssue | null {
  if (installments.length === 0) return { message: "กรุณาเพิ่มอย่างน้อยหนึ่งงวดการชำระเงิน", installmentIndex: 0, field: "title" };
  if (method === "single" && installments.length !== 1) return { message: "การชำระครั้งเดียวต้องมีเพียงหนึ่งงวด", installmentIndex: 0, field: "title" };
  if (method === "installments" && installments.length < 2) return { message: "การแบ่งชำระหลายงวดต้องมีอย่างน้อยสองงวด", installmentIndex: 0, field: "title" };
  if (allocationMode === "proportional_all_items" && new Set(installments.map((installment) => installment.calculation_type)).size > 1) return { message: "ไม่สามารถใช้การคำนวณแบบเปอร์เซ็นต์และจำนวนเงินคงที่ร่วมกันได้", installmentIndex: 0, field: "trigger" };

  for (const [installmentIndex, installment] of installments.entries()) {
    if (!installment.title.trim()) return { message: "กรุณากรอกชื่อรายการของแต่ละงวดให้ครบถ้วน", installmentIndex, field: "title" };
    if (!Number.isInteger(toAmount(installment.payment_due_days)) || toAmount(installment.payment_due_days) < 0) return { message: "จำนวนวันชำระเงินของแต่ละงวดต้องเป็นจำนวนเต็มที่ไม่ติดลบ", installmentIndex, field: "payment_due_days" };
    if (triggerUsesFixedCalendarDate(method, installment.trigger_type) && !isIsoDate(installment.due_date)) return { message: "กรุณาระบุวันครบกำหนดสำหรับงวดที่เลือก Specific date", installmentIndex, field: "due_date" };
    if (["case_milestone", "recurring_period", "manual"].includes(getEffectivePaymentTrigger(method, installment.trigger_type)) && !installment.trigger_description.trim()) return { message: "กรุณาระบุรายละเอียด Trigger ของแต่ละงวดให้ครบถ้วน", installmentIndex, field: "trigger_description" };
  }

  if (method === "installments" && installments.some((installment) => installment.trigger_type === "recurring_period")) return { message: "การแบ่งชำระหลายงวดไม่สามารถใช้ Trigger แบบ Recurring period ได้", installmentIndex: 0, field: "trigger" };
  if (method === "milestone" && installments.some((installment) => installment.trigger_type !== "case_milestone")) return { message: "วิธีชำระตามขั้นตอนงานต้องใช้ Trigger แบบ Case milestone", installmentIndex: 0, field: "trigger" };
  if (method === "recurring" && installments.some((installment) => installment.trigger_type !== "recurring_period")) return { message: "วิธีเรียกเก็บเป็นรอบต้องใช้ Trigger แบบ Recurring period", installmentIndex: 0, field: "trigger" };
  if (method === "manual" && installments.some((installment) => installment.trigger_type !== "manual")) return { message: "วิธีกำหนดเองต้องใช้ Trigger แบบ Manual", installmentIndex: 0, field: "trigger" };
  return null;
}

function getPaymentAllocationValidationIssue(allocationMode: PaymentAllocationMode, installments: PaymentInstallment[], quotationItems: QuotationItemRow[], requireComplete = false): PaymentAllocationValidationIssue | null {
  const itemReferences = new Set(quotationItems.map(paymentReferenceForItem).filter(Boolean));
  for (const [installmentIndex, installment] of installments.entries()) {
    const staleAllocation = installment.items.find((allocation) => {
      const reference = paymentAllocationReference(allocation);
      return reference && !itemReferences.has(reference);
    });
    if (staleAllocation) {
      return {
        message: `งวดที่ ${installmentIndex + 1} มีข้อมูลจัดสรรของรายการที่ถูกลบ กรุณาตรวจสอบอีกครั้ง`,
        itemReference: paymentAllocationReference(staleAllocation),
        installmentIndex,
      };
    }
  }

  if (allocationMode === "proportional_all_items") {
    const percentageInstallments = installments.filter((installment) => installment.calculation_type === "percentage");
    if (percentageInstallments.length > 0) {
      const invalidInstallmentIndex = installments.findIndex((installment) => installment.calculation_type === "percentage" && (toAmount(installment.percentage) <= 0 || toAmount(installment.percentage) > 100));
      if (invalidInstallmentIndex >= 0) return { message: `สัดส่วนของงวดที่ ${invalidInstallmentIndex + 1} ต้องมากกว่า 0 และไม่เกิน 100%`, installmentIndex: invalidInstallmentIndex };
      const total = normalizePercentage(percentageInstallments.reduce((sum, installment) => sum + toAmount(installment.percentage), 0));
      if (total > 100) {
        let cumulative = 0;
        const installmentIndex = installments.findIndex((installment) => {
          cumulative = normalizePercentage(cumulative + toAmount(installment.percentage));
          return cumulative > 100;
        });
        return { message: `งวดที่ ${installmentIndex + 1} ทำให้สัดส่วนรวมเกิน 100% (ปัจจุบัน ${total}%)`, installmentIndex };
      }
      if (requireComplete && total !== 100) return { message: "สัดส่วนการชำระเงินต้องครบ 100% ก่อนส่งใบเสนอราคา" };
    }
    return null;
  }

  // Per-item installments retain percentage = 100 only to satisfy the legacy
  // installment contract. Those values are never business allocation inputs.
  for (const item of quotationItems) {
    const reference = paymentReferenceForItem(item);
    if (!reference) continue;
    const missingInstallmentIndex = installments.findIndex((installment) => !installment.items.some((allocation) => paymentAllocationReference(allocation) === reference));
    if (missingInstallmentIndex >= 0) {
      return {
        message: `รายการ ${item.description.trim() || reference} ยังไม่มีช่องจัดสรรสำหรับงวดที่ ${missingInstallmentIndex + 1}`,
        itemReference: reference,
        installmentIndex: missingInstallmentIndex,
      };
    }
    let cumulative = 0;
    let overLimitInstallment = -1;
    installments.forEach((installment, installmentIndex) => {
      cumulative = normalizePercentage(cumulative + toAmount(installment.items.find((allocation) => paymentAllocationReference(allocation) === reference)?.allocation_percentage || 0));
      if (overLimitInstallment < 0 && cumulative > 100) overLimitInstallment = installmentIndex;
    });
    const total = cumulative;
    if (total > 100) return { message: `รายการ ${item.description.trim() || reference} จัดสรรเกิน 100% ที่งวด ${overLimitInstallment + 1} (ปัจจุบัน ${total}%)`, itemReference: reference, installmentIndex: overLimitInstallment };
    if (requireComplete && total !== 100) return { message: `รายการ ${item.description.trim() || reference} ยังจัดสรรไม่ครบ`, itemReference: reference };
  }
  return null;
}

function calculatePaymentItemInstallmentTotals(allocationMode: PaymentAllocationMode, installments: PaymentInstallment[], quotationItem: QuotationItemRow) {
  const totals: PaymentInstallmentTotal[] = installments.map(() => ({ beforeTax: 0, vat: 0, total: 0 }));
  const source = normalizeItem(quotationItem, quotationItem.sort_order || 0);
  const reference = paymentReferenceForItem(source);

  if (allocationMode === "proportional_all_items" && installments.some((installment) => installment.calculation_type === "fixed_amount")) {
    installments.forEach((installment, installmentIndex) => {
      const allocation = installment.items.find((item) => paymentAllocationReference(item) === reference);
      if (!allocation) return;
      totals[installmentIndex] = {
        beforeTax: roundMoney(toAmount(allocation.allocated_amount_before_tax)),
        vat: roundMoney(toAmount(allocation.allocated_vat_amount)),
        total: roundMoney(toAmount(allocation.allocated_total)),
      };
    });
    return totals;
  }

  const result = calculateGrossFirstPercentageAllocation({
    allocationMode,
    items: [{ amountBeforeTax: source.amount_before_tax, vatAmount: source.vat_amount, totalAmount: source.line_total }],
    installments: installments.map((installment) => ({
      percentage: installment.percentage,
      itemPercentages: [toAmount(installment.items.find((allocation) => paymentAllocationReference(allocation) === reference)?.allocation_percentage || 0)],
    })),
  });
  return result.cells[0] || totals;
}

function calculatePaymentInstallmentTotals(allocationMode: PaymentAllocationMode, installments: PaymentInstallment[], quotationItems: QuotationItemRow[]) {
  if (allocationMode === "proportional_all_items" && installments.some((installment) => installment.calculation_type === "fixed_amount")) {
    const totals: PaymentInstallmentTotal[] = installments.map(() => ({ beforeTax: 0, vat: 0, total: 0 }));
    quotationItems.forEach((item) => {
      calculatePaymentItemInstallmentTotals(allocationMode, installments, item).forEach((itemTotal, installmentIndex) => {
        totals[installmentIndex] = {
          beforeTax: roundMoney(totals[installmentIndex].beforeTax + itemTotal.beforeTax),
          vat: roundMoney(totals[installmentIndex].vat + itemTotal.vat),
          total: roundMoney(totals[installmentIndex].total + itemTotal.total),
        };
      });
    });
    return totals;
  }

  return calculateGrossFirstPercentageAllocation({
    allocationMode,
    items: quotationItems.map((item) => ({ amountBeforeTax: item.amount_before_tax, vatAmount: item.vat_amount, totalAmount: item.line_total })),
    installments: installments.map((installment) => ({
      percentage: installment.percentage,
      itemPercentages: quotationItems.map((item) => {
        const reference = paymentReferenceForItem(item);
        return toAmount(installment.items.find((allocation) => paymentAllocationReference(allocation) === reference)?.allocation_percentage || 0);
      }),
    })),
  }).installmentTotals;
}

function paymentTriggerSummary(method: PaymentMethodType, installment: PaymentInstallment) {
  const trigger = getEffectivePaymentTrigger(method, installment.trigger_type);
  if (trigger === "quotation_acceptance") return "เมื่อตกลงว่าจ้าง";
  if (trigger === "agreement_effective") return "เมื่อข้อตกลงมีผล";
  if (trigger === "date") return installment.due_date ? `วันที่ ${formatDate(installment.due_date)}` : "ตามวันที่กำหนด";
  return installment.trigger_description.trim() || "ตามเงื่อนไขที่ระบุ";
}

function formatCompactPercentage(value: number | string) {
  const percentage = normalizePercentage(value);
  return `${percentage.toLocaleString("en-US", { maximumFractionDigits: 6 })}%`;
}

function buildPaymentClientSummary(method: PaymentMethodType, allocationMode: PaymentAllocationMode, installments: PaymentInstallment[], quotationItems: QuotationItemRow[]) {
  if (installments.length === 0) return "";
  const totals = calculatePaymentInstallmentTotals(allocationMode, installments, quotationItems);
  const entries = installments.map((installment, index) => {
    const amount = allocationMode === "proportional_all_items" && installment.calculation_type === "percentage"
      ? formatCompactPercentage(installment.percentage)
      : formatMoney(totals[index]?.total || 0);
    return `${amount} ${paymentTriggerSummary(method, installment)}`;
  });
  return `ชำระ ${installments.length} งวด: ${entries.join(" / ")}`;
}

function logPaymentAllocationPreflight(allocationMode: PaymentAllocationMode, installments: PaymentInstallment[], quotationItems: QuotationItemRow[]) {
  if (process.env.NODE_ENV === "production") return;
  const perItemTotals = allocationMode === "per_item"
    ? quotationItems.map((item) => {
      const reference = paymentReferenceForItem(item);
      return normalizePercentage(installments.reduce((sum, installment) => sum + toAmount(installment.items.find((allocation) => paymentAllocationReference(allocation) === reference)?.allocation_percentage || 0), 0));
    })
    : [];
  console.debug("Quotation payment allocation preflight", {
    allocationMode,
    installmentCount: installments.length,
    sourceItemCount: quotationItems.length,
    perItemTotals,
  });
}

function getPaymentTermsPlanValidationMessage(method: PaymentMethodType, installments: PaymentInstallment[], allocationMode: PaymentAllocationMode) {
  return getPaymentTermsPlanValidationIssue(method, installments, allocationMode)?.message || null;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function focusPaymentTermsValidationIssue(issue: PaymentTermsValidationIssue) {
  window.requestAnimationFrame(() => {
    const input = document.getElementById(`payment-installment-${issue.installmentIndex}-${issue.field}`) as HTMLInputElement | HTMLSelectElement | null;
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  });
}

function focusPaymentAllocationValidationIssue(issue: PaymentAllocationValidationIssue) {
  if (issue.installmentIndex == null) return;
  window.requestAnimationFrame(() => {
    const allocationInput = issue.itemReference
      ? document.getElementById(`payment-allocation-${issue.itemReference}-${issue.installmentIndex}`) as HTMLInputElement | null
      : null;
    const installmentCard = document.getElementById(`payment-installment-${issue.installmentIndex}`);
    const target = allocationInput || installmentCard;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    allocationInput?.focus({ preventScroll: true });
  });
}

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

export function QuotationGuard({ children, canAccess }: { children: (access: QuotationAccess) => ReactNode; canAccess?: (access: QuotationAccess) => boolean }) {
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

  const allowed = Boolean(access && (canAccess ? canAccess(access) : access.permissions.canViewFinanceQuotations));

  return (
    <AuthGuard>
      <AppTopNav title="Finance" subtitle="Quotations" activePage="finance" />
      <main style={pageStyle}>
        {loading ? <div style={cardStyle}>Loading quotations...</div> : null}
        {!loading && !allowed ? (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>No access</h2>
            <p style={mutedTextStyle}>You do not have permission to view Finance Quotations.</p>
          </div>
        ) : null}
        {!loading && access && allowed ? children(access) : null}
      </main>
    </AuthGuard>
  );
}

export { FinanceSubNav };

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
                <th style={rightThStyle}>ยอดสุทธิ / Amount Payable</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td style={tdStyle} colSpan={8}>Loading...</td></tr> : null}
              {!loading && quotations.length === 0 ? <tr><td style={tdStyle} colSpan={8}>No quotations yet.</td></tr> : null}
              {!loading && quotations.map((quotation) => (
                <tr key={quotation.id}>
                  <td style={tdStyle}><Link href={`/finance/quotations/${quotation.id}`} style={linkStyle}>{quotation.quotation_no}</Link></td>
                  <td style={tdStyle}>{renderQuotationClientName(quotation, lookups.clients)}</td>
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
  const searchParams = useSearchParams();
  const isEdit = Boolean(quotationId);
  const [lookups, setLookups] = useState<LookupState>(getEmptyLookups());
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [items, setItems] = useState<QuotationItemRow[]>(() => quotationId ? [{ ...emptyItem }] : [createNewQuotationItem()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(() => searchParams.get("focus") === "payment-terms" ? "สร้างร่างใบเสนอราคาเรียบร้อยแล้ว กรุณากำหนดเงื่อนไขการชำระเงิน" : "");
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState<string | null>(null);
  const [paymentTermsSnapshot, setPaymentTermsSnapshot] = useState<PaymentTermsSnapshot>({ ready: !isEdit, saved: "", current: "" });
  const [, setPaymentTermsValid] = useState(true);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [focusPaymentTerms, setFocusPaymentTerms] = useState(() => searchParams.get("focus") === "payment-terms");
  const [newPaymentTerms, setNewPaymentTerms] = useState<NewPaymentTermsPayload | null>(null);
  const [paymentTermsReloadVersion, setPaymentTermsReloadVersion] = useState(0);
  const saveInFlightRef = useRef(false);

  const totals = useMemo(() => computeTotals(items), [items]);
  const canSave = isEdit ? access.permissions.canEditFinanceQuotation : access.permissions.canCreateFinanceQuotation;

  const loadFormData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    if (!quotationId) {
      const lookupData = await loadLookups();
      const nextForm = { ...emptyForm, authorized_signer_key: getDefaultSigner(lookupData.signers).key };
      setLookups(lookupData);
      setForm(nextForm);
      const initialItems = [createNewQuotationItem()];
      setItems(initialItems);
      setSavedDraftSnapshot(normalizedQuotationDraftSnapshot(nextForm, initialItems));
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
      customer_mode: loadedQuotation.customer_source_type || (loadedQuotation.client_id ? "existing_client" : "prospect"),
      client_id: loadedQuotation.client_id || "",
      prospect_name: loadedQuotation.prospect_name || getSnapshotString(loadedQuotation.client_snapshot_json, "name"),
      prospect_contact_person: loadedQuotation.prospect_contact_person || getSnapshotString(loadedQuotation.client_snapshot_json, "contact_person"),
      prospect_phone: loadedQuotation.prospect_phone || getSnapshotString(loadedQuotation.client_snapshot_json, "phone"),
      prospect_email: loadedQuotation.prospect_email || getSnapshotString(loadedQuotation.client_snapshot_json, "email"),
      prospect_tax_id: loadedQuotation.prospect_tax_id || getSnapshotString(loadedQuotation.client_snapshot_json, "tax_id"),
      prospect_address: loadedQuotation.prospect_address || getSnapshotString(loadedQuotation.client_snapshot_json, "address"),
      matter_mode: loadedQuotation.case_id ? "case" : loadedQuotation.advisory_matter_id ? "advisory" : "unlinked",
      case_id: loadedQuotation.case_id ? String(loadedQuotation.case_id) : "",
      advisory_matter_id: loadedQuotation.advisory_matter_id || "",
      unlinked_matter_name: loadedQuotation.unlinked_matter_name || getSnapshotString(loadedQuotation.matter_snapshot_json, "title"),
      unlinked_matter_description: loadedQuotation.unlinked_matter_description || getSnapshotString(loadedQuotation.matter_snapshot_json, "description"),
      issue_date: loadedQuotation.issue_date || getDateKey(new Date()),
      valid_until: loadedQuotation.valid_until || "",
      scope_of_legal_services: loadedQuotation.scope_of_legal_services || "",
      included_services: loadedQuotation.included_services || "",
      excluded_services: loadedQuotation.excluded_services || "",
      service_pattern_id: getSnapshotString(loadedQuotation.document_data_snapshot_json, "service_pattern_id"),
      service_pattern_code: getSnapshotString(loadedQuotation.document_data_snapshot_json, "service_pattern_code"),
      service_pattern_name: getSnapshotString(loadedQuotation.document_data_snapshot_json, "service_pattern_name"),
      authorized_signer_key: loadedQuotation.authorized_signer_key || getDefaultSigner(lookupData.signers).key,
      note: loadedQuotation.note || "",
      internal_note: loadedQuotation.internal_note || "",
    };
    const nextItems = ((itemRes.data || []) as QuotationItemRow[]).map((item, index) => ({
      ...item,
      unit: item.unit || "",
      economic_classification: item.economic_classification || "",
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
  // Keep Save actionable so validation can explain and focus the exact invalid installment.
  const saveDisabled = saving;

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

  const applyServicePattern = (patternId: string) => {
    if (!patternId) {
      setForm((current) => ({ ...current, service_pattern_id: "", service_pattern_code: "", service_pattern_name: "" }));
      return;
    }

    const pattern = lookups.servicePatterns.find((item) => item.id === patternId);
    if (!pattern) return;
    const nextWording = {
      scope_of_legal_services: pattern.scope_text || "",
      included_services: pattern.included_services_text || "",
      excluded_services: pattern.excluded_services_text || "",
    };
    const hasExistingWording = [form.scope_of_legal_services, form.included_services, form.excluded_services].some((value) => value.trim());
    const changesWording = form.scope_of_legal_services !== nextWording.scope_of_legal_services
      || form.included_services !== nextWording.included_services
      || form.excluded_services !== nextWording.excluded_services;
    if (hasExistingWording && changesWording && !window.confirm("การเลือกรูปแบบงานใหม่จะแทนที่ข้อความขอบเขตงาน งานที่รวม และงานที่ไม่รวมในฟอร์มนี้ ต้องการดำเนินการต่อหรือไม่?")) return;

    setForm((current) => ({
      ...current,
      ...nextWording,
      service_pattern_id: pattern.id,
      service_pattern_code: pattern.pattern_code,
      service_pattern_name: pattern.display_name,
    }));
  };

  const removeItem = (index: number) => {
    setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => normalizeItem(item, itemIndex)));
  };

  const saveDraft = async () => {
    if (saving || saveInFlightRef.current) return { ok: false, stage: "quotation", message: "A save is already in progress." } as SaveAllResult;
    saveInFlightRef.current = true;
    try {
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
    const clientId = form.customer_mode === "existing_client" ? form.client_id : null;
    const caseId = form.matter_mode === "case" && form.case_id ? Number(form.case_id) : null;
    const advisoryMatterId = form.matter_mode === "advisory" ? form.advisory_matter_id || null : null;
    const quotationPayload = {
      client_id: clientId,
      case_id: caseId,
      advisory_matter_id: advisoryMatterId,
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
      if (!paymentTermsSnapshot.ready) {
        alert("กรุณารอให้เงื่อนไขการชำระเงินโหลดเสร็จก่อนบันทึก");
        setSaving(false);
        return { ok: false, stage: "payment_terms", message: "Payment terms are still loading." } as SaveAllResult;
      }

      const draftTerms = newPaymentTerms;
      if (draftTerms) {
        const paymentTermsValidationIssue = getPaymentTermsPlanValidationIssue(draftTerms.payment_method_type, draftTerms.installments, draftTerms.allocation_mode);
        if (paymentTermsValidationIssue) {
          alert(paymentTermsValidationIssue.message);
          focusPaymentTermsValidationIssue(paymentTermsValidationIssue);
          setSaving(false);
          return { ok: false, stage: "payment_terms", message: paymentTermsValidationIssue.message } as SaveAllResult;
        }
        const allocationValidationIssue = getPaymentAllocationValidationIssue(draftTerms.allocation_mode, draftTerms.installments, normalizedItems);
        if (allocationValidationIssue) {
          alert(allocationValidationIssue.message);
          focusPaymentAllocationValidationIssue(allocationValidationIssue);
          setSaving(false);
          return { ok: false, stage: "payment_terms", message: allocationValidationIssue.message } as SaveAllResult;
        }
      }

      const itemPayload = buildItemPayload(quotationId, normalizedItems);
      const atomicInstallments = draftTerms
        ? buildAtomicEditPaymentInstallments(draftTerms.payment_method_type, draftTerms.allocation_mode, draftTerms.installments, normalizedItems)
        : null;
      const allocationMappingError = draftTerms && atomicInstallments
        ? getAtomicEditPaymentAllocationMappingError(normalizedItems, atomicInstallments)
        : null;
      if (allocationMappingError) {
        alert(allocationMappingError.message);
        focusPaymentAllocationValidationIssue(allocationMappingError.issue);
        setSaving(false);
        return { ok: false, stage: "payment_terms", message: allocationMappingError.message } as SaveAllResult;
      }
      if (draftTerms) logPaymentAllocationPreflight(draftTerms.allocation_mode, draftTerms.installments, normalizedItems);

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
        p_items: itemPayload,
        p_payment_method_type: draftTerms?.payment_method_type || null,
        p_payment_client_summary: draftTerms?.client_summary || null,
        p_allocation_mode: draftTerms?.allocation_mode || null,
        p_installments_json: atomicInstallments,
      };
      const invalidPayloadMessage = validateDraftSavePayload(draftSavePayload, currentTotals);
      if (invalidPayloadMessage) {
        console.error("Quotation save validation failed", { rpc: "save_finance_quotation_draft_atomic", safePayload: getSafeAtomicDraftPayloadDiagnostic(draftSavePayload), validation: invalidPayloadMessage });
        alert("ข้อมูลใบเสนอราคายังไม่ครบถ้วน กรุณาตรวจสอบรายการที่ระบุ");
        setSaving(false);
        return { ok: false, stage: "quotation", message: invalidPayloadMessage } as SaveAllResult;
      }

      const { error: updateError } = await supabase.rpc("save_finance_quotation_draft_atomic", draftSavePayload);
      if (updateError) {
        console.error("Atomic quotation draft save failed", {
          rpc: "save_finance_quotation_draft_atomic",
          safePayload: getSafeAtomicDraftPayloadDiagnostic(draftSavePayload),
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          status: (updateError as typeof updateError & { status?: number }).status,
        });
        const message = getAtomicDraftEditErrorMessage(updateError);
        alert(message);
        setSaving(false);
        return { ok: false, stage: "quotation", message } as SaveAllResult;
      }

      await createAuditLog({
        tableName: "finance_quotations",
        recordId: quotationId,
        caseId,
        action: "update",
        note: `Updated quotation ${quotation?.quotation_no || quotationId}; grand total ${formatMoney(toAmount(quotation?.grand_total))} -> ${formatMoney(currentTotals.grandTotal)}`,
      });
      await createAuditLog({
        tableName: "finance_quotation_items",
        recordId: quotationId,
        caseId,
        action: "update",
        note: `Replaced quotation line items for ${quotation?.quotation_no || quotationId}; item count ${normalizedItems.length}`,
      });
      const reloaded = await loadFormData(false);
      setPaymentTermsReloadVersion((current) => current + 1);
      setSaving(false);
      if (!reloaded.ok) return reloaded;
      setSaveMessage("บันทึกร่างใบเสนอราคาเรียบร้อยแล้ว");
      return { ok: true } as SaveAllResult;
    }

    const draftTerms = newPaymentTerms;
    if (!draftTerms) {
      alert("กรุณาตรวจสอบเงื่อนไขการชำระเงินก่อนบันทึกร่างใบเสนอราคา");
      setSaving(false);
      return { ok: false, stage: "payment_terms", message: "Payment terms are not ready." } as SaveAllResult;
    }
    const paymentTermsValidationIssue = getPaymentTermsPlanValidationIssue(draftTerms.payment_method_type, draftTerms.installments, draftTerms.allocation_mode);
    if (paymentTermsValidationIssue) {
      alert(paymentTermsValidationIssue.message);
      focusPaymentTermsValidationIssue(paymentTermsValidationIssue);
      setSaving(false);
      return { ok: false, stage: "payment_terms", message: paymentTermsValidationIssue.message } as SaveAllResult;
    }
    const allocationValidationIssue = getPaymentAllocationValidationIssue(draftTerms.allocation_mode, draftTerms.installments, normalizedItems);
    if (allocationValidationIssue) {
      alert(allocationValidationIssue.message);
      focusPaymentAllocationValidationIssue(allocationValidationIssue);
      setSaving(false);
      return { ok: false, stage: "payment_terms", message: allocationValidationIssue.message } as SaveAllResult;
    }
    const createSnapshots = buildQuotationSnapshots(form, normalizedItems, currentTotals, lookups, "");
    const atomicItems = normalizedItems.map((item, index) => ({
      client_item_key: item.client_item_key,
      description: item.description,
      unit: item.unit.trim(),
      economic_classification: item.economic_classification,
      quantity: toAmount(item.quantity),
      unit_price: toAmount(item.unit_price),
      vat_applicable: item.vat_applicable,
      price_tax_mode: item.price_tax_mode,
      vat_rate: toAmount(item.vat_rate),
      sort_order: index,
    }));
    const atomicInstallments = buildAtomicPaymentInstallments(draftTerms.payment_method_type, draftTerms.allocation_mode, draftTerms.installments, normalizedItems);
    const allocationMappingError = getAtomicPaymentAllocationMappingError(atomicItems, atomicInstallments);
    if (allocationMappingError) {
      alert(allocationMappingError.message);
      focusPaymentTermsValidationIssue(allocationMappingError.issue);
      setSaving(false);
      return { ok: false, stage: "payment_terms", message: allocationMappingError.message } as SaveAllResult;
    }
    logPaymentAllocationPreflight(draftTerms.allocation_mode, draftTerms.installments, normalizedItems);
    const atomicPayload = {
      p_client_id: form.customer_mode === "existing_client" ? form.client_id : null,
      p_case_id: form.matter_mode === "case" && form.case_id ? Number(form.case_id) : null,
      p_advisory_matter_id: form.matter_mode === "advisory" ? form.advisory_matter_id || null : null,
      p_issue_date: form.issue_date,
      p_valid_until: form.valid_until || null,
      p_scope_of_legal_services: form.scope_of_legal_services,
      p_included_services: form.included_services,
      p_excluded_services: form.excluded_services,
      p_note: form.note,
      p_internal_note: form.internal_note,
      p_authorized_signer_key: quotationPayload.authorized_signer_key,
      p_authorized_signer_name: quotationPayload.authorized_signer_name,
      p_authorized_signer_position: quotationPayload.authorized_signer_position,
      p_authorized_signer_email: quotationPayload.authorized_signer_email,
      p_client_snapshot_json: createSnapshots.clientSnapshot,
      p_matter_snapshot_json: createSnapshots.matterSnapshot,
      p_document_data_snapshot_json: createSnapshots.documentSnapshot,
      p_items: atomicItems,
      p_payment_method_type: draftTerms.payment_method_type,
      p_payment_client_summary: draftTerms.client_summary,
      p_installments_json: atomicInstallments,
    };
    const { data, error } = await supabase.rpc("create_finance_quotation_draft_atomic_v3", atomicPayload);
    const created = Array.isArray(data) ? data[0] : data;
    if (error || !created?.quotation_id) {
      console.error("Atomic quotation draft creation failed", {
        rpc: "create_finance_quotation_draft_atomic_v3",
        safePayload: getSafeAtomicDraftPayloadDiagnostic(atomicPayload),
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        status: (error as typeof error & { status?: number })?.status,
        returnedQuotationId: created?.quotation_id || null,
      });
      alert(getAtomicDraftCreateErrorMessage(error));
      setSaving(false);
      return { ok: false, stage: "quotation", message: "Atomic quotation draft creation failed." } as SaveAllResult;
    }
    setSaving(false);
    router.replace(`/finance/quotations/${created.quotation_id}/edit`);
    return { ok: true } as SaveAllResult;
    } finally {
      saveInFlightRef.current = false;
    }
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
          <span style={isDirty ? unsavedIndicatorStyle : savedIndicatorStyle}>{!isEdit ? "ยังไม่ได้สร้างร่าง / Draft not created" : isDirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก / Unsaved changes" : "บันทึกแล้ว / Saved"}</span>
          <button type="button" onClick={() => requestNavigation(isEdit && quotationId ? `/finance/quotations/${quotationId}` : "/finance/quotations", isEdit ? "กลับไปใบเสนอราคา / Back to Quotation" : "Back")} style={secondaryButtonStyle}>กลับไปใบเสนอราคา / Back to Quotation</button>
          {isEdit && quotationId ? <button type="button" onClick={() => requestNavigation(`/finance/quotations/${quotationId}/preview`, "ดูตัวอย่าง / Preview")} style={secondaryButtonStyle}>ดูตัวอย่าง / Preview</button> : null}
          {isEdit && quotationId ? <button type="button" onClick={() => requestNavigation(`/finance/quotations/${quotationId}/preview?print=1`, "พิมพ์ / Print")} style={secondaryButtonStyle}>พิมพ์ / Print</button> : null}
        </div>
      </div>

      <div style={cardStyle}>
        <div className="quotation-header-form-grid" style={formGridStyle}>
          <div style={wideFieldGroupStyle}>
            <div style={fieldHeadingStyle}>ลูกค้า / Customer</div>
            <div style={segmentedControlStyle} role="group" aria-label="เลือกรูปแบบลูกค้า">
              <button type="button" onClick={() => setForm((current) => ({ ...current, customer_mode: "existing_client", prospect_name: "", prospect_contact_person: "", prospect_phone: "", prospect_email: "", prospect_tax_id: "", prospect_address: "" }))} style={getSegmentButtonStyle(form.customer_mode === "existing_client")}>ลูกค้าในระบบ</button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, customer_mode: "prospect", client_id: "" }))} style={getSegmentButtonStyle(form.customer_mode === "prospect")}>ลูกค้าใหม่ / ผู้มุ่งหวัง</button>
            </div>
            {form.customer_mode === "existing_client" ? (
              <label style={labelStyle}>เลือกลูกค้าในระบบ
                <select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} style={inputStyle}>
                  <option value="">เลือกลูกค้า</option>
                  {lookups.clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}
                </select>
              </label>
            ) : (
              <div style={nestedFormGridStyle}>
                <label style={labelStyle}>ชื่อบุคคล / บริษัท *<input value={form.prospect_name} onChange={(event) => setForm({ ...form, prospect_name: event.target.value })} style={inputStyle} /></label>
                <label style={labelStyle}>ผู้ติดต่อ<input value={form.prospect_contact_person} onChange={(event) => setForm({ ...form, prospect_contact_person: event.target.value })} style={inputStyle} /></label>
                <label style={labelStyle}>โทรศัพท์<input value={form.prospect_phone} onChange={(event) => setForm({ ...form, prospect_phone: event.target.value })} style={inputStyle} /></label>
                <label style={labelStyle}>อีเมล<input type="email" value={form.prospect_email} onChange={(event) => setForm({ ...form, prospect_email: event.target.value })} style={inputStyle} /></label>
                <label style={labelStyle}>เลขประจำตัวผู้เสียภาษี<input value={form.prospect_tax_id} onChange={(event) => setForm({ ...form, prospect_tax_id: event.target.value })} style={inputStyle} /></label>
                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>ที่อยู่<textarea value={form.prospect_address} onChange={(event) => setForm({ ...form, prospect_address: event.target.value })} style={compactTextareaStyle} /></label>
              </div>
            )}
            <p style={helperTextStyle}>{form.customer_mode === "prospect" ? "ข้อมูลนี้ใช้สำหรับใบเสนอราคาเท่านั้น ระบบจะไม่สร้างทะเบียนลูกค้าโดยอัตโนมัติ" : "ใช้ข้อมูลจากทะเบียนลูกค้าที่มีอยู่ในระบบ"}</p>
          </div>

          <div style={wideFieldGroupStyle}>
            <div style={fieldHeadingStyle}>เรื่อง / งาน</div>
            <div style={segmentedControlStyle} role="group" aria-label="เลือกรูปแบบเรื่องหรืองาน">
              <button type="button" onClick={() => setForm((current) => ({ ...current, matter_mode: "unlinked", case_id: "", advisory_matter_id: "" }))} style={getSegmentButtonStyle(form.matter_mode === "unlinked")}>ยังไม่ผูกเรื่องในระบบ</button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, matter_mode: "case", advisory_matter_id: "", unlinked_matter_name: "", unlinked_matter_description: "" }))} style={getSegmentButtonStyle(form.matter_mode === "case")}>Case</button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, matter_mode: "advisory", case_id: "", unlinked_matter_name: "", unlinked_matter_description: "" }))} style={getSegmentButtonStyle(form.matter_mode === "advisory")}>Advisory</button>
            </div>
            {form.matter_mode === "case" ? (
              <label style={labelStyle}>เลือก Case
                <select value={form.case_id} onChange={(event) => setForm({ ...form, case_id: event.target.value, advisory_matter_id: "" })} style={inputStyle}>
                  <option value="">เลือก Case</option>
                  {lookups.cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}
                </select>
              </label>
            ) : null}
            {form.matter_mode === "advisory" ? (
              <label style={labelStyle}>เลือก Advisory
                <select value={form.advisory_matter_id} onChange={(event) => setForm({ ...form, advisory_matter_id: event.target.value, case_id: "" })} style={inputStyle}>
                  <option value="">เลือก Advisory</option>
                  {lookups.matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}
                </select>
              </label>
            ) : null}
            {form.matter_mode === "unlinked" ? (
              <div style={nestedFormGridStyle}>
                <label style={labelStyle}>ชื่อเรื่อง / ชื่องาน<input value={form.unlinked_matter_name} onChange={(event) => setForm({ ...form, unlinked_matter_name: event.target.value })} style={inputStyle} /></label>
                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>รายละเอียดสั้น ๆ<textarea value={form.unlinked_matter_description} onChange={(event) => setForm({ ...form, unlinked_matter_description: event.target.value })} style={compactTextareaStyle} /></label>
              </div>
            ) : null}
            <p style={helperTextStyle}>{form.matter_mode === "unlinked" ? "เว้นว่างได้ และสามารถเชื่อม Case หรือ Advisory ภายหลังโดยไม่สร้างรายการใหม่อัตโนมัติ" : "ใบเสนอราคาจะเชื่อมกับเรื่องที่เลือกไว้"}</p>
          </div>

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
          <div style={wideFieldGroupStyle}>
            <div style={servicePatternHeaderStyle}>
              <label style={servicePatternLabelStyle}>รูปแบบงาน / Service Pattern
                <select value={form.service_pattern_id} onChange={(event) => applyServicePattern(event.target.value)} style={inputStyle}>
                  <option value="">ไม่ใช้รูปแบบ / กรอกเอง</option>
                  {form.service_pattern_id && !lookups.servicePatterns.some((pattern) => pattern.id === form.service_pattern_id) ? (
                    <option value={form.service_pattern_id} disabled>รูปแบบเดิม: {form.service_pattern_name || form.service_pattern_code || "ไม่เปิดใช้งานแล้ว"}</option>
                  ) : null}
                  {lookups.servicePatterns.map((pattern) => (
                    <option key={pattern.id} value={pattern.id}>
                      {pattern.display_name}{pattern.category ? ` · ${pattern.category}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Link href="/settings/document-settings#quotation-service-patterns" target="_blank" rel="noreferrer" style={managePatternLinkStyle}>จัดการรูปแบบงาน</Link>
            </div>
            <p style={helperTextStyle}>รูปแบบงานช่วยเติมข้อความตั้งต้นทั้งสามส่วนครั้งเดียว หลังจากนั้นสามารถแก้ไขข้อความในใบเสนอราคาฉบับนี้ได้อย่างอิสระ</p>
          </div>
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
          <button type="button" onClick={() => setItems((current) => [...current, createNewQuotationItem(current.length)])} style={secondaryButtonStyle}>Add Item</button>
        </div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>ประเภท / หน่วย</th>
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
                    <td style={tdStyle}><select aria-label="ประเภทของยอด" value={item.economic_classification} onChange={(event) => updateItem(index, { economic_classification: event.target.value })} style={inputStyle}><option value="">เลือกประเภท</option>{quotationEconomicClassifications.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="หน่วยรายการ" value={item.unit} onChange={(event) => updateItem(index, { unit: event.target.value })} style={vatInputStyle} placeholder="หน่วย เช่น งาน" /></td>
                    <td style={rightTdStyle}><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} style={compactInputStyle} /></td>
                    <td style={rightTdStyle}><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: event.target.value })} style={compactInputStyle} /></td>
                    <td style={tdStyle}>
                      <select value={item.price_tax_mode || (item.vat_applicable ? "vat_exclusive" : "non_vat")} onChange={(event) => { const price_tax_mode = event.target.value as NonNullable<QuotationItemRow["price_tax_mode"]>; updateItem(index, { price_tax_mode, vat_applicable: price_tax_mode !== "non_vat", vat_rate: price_tax_mode === "non_vat" ? 0 : (item.vat_rate || 7) }); }} style={inputStyle}><option value="non_vat">Non-VAT</option><option value="vat_exclusive">VAT Exclusive</option><option value="vat_inclusive">VAT Inclusive</option></select>
                      {(item.price_tax_mode || (item.vat_applicable ? "vat_exclusive" : "non_vat")) !== "non_vat" ? <input aria-label="VAT rate" type="number" min="0" step="0.01" value={item.vat_rate} onChange={(event) => updateItem(index, { vat_rate: event.target.value })} style={vatInputStyle} /> : null}
                    </td>
                    <td style={rightTdStyle}>
                      <strong>{formatMoney(toAmount(normalized.line_total))}</strong>
                      <LineItemVatExplanation item={normalized} />
                    </td>
                    <td style={tdStyle}><button type="button" onClick={() => removeItem(index)} style={dangerSmallButtonStyle} disabled={items.length === 1}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <QuotationFinancialSummary subtotalVatable={totals.subtotalVatable} subtotalNonVatable={totals.subtotalNonVatable} vatAmount={totals.vatAmount} grandTotal={totals.grandTotal} />
      </div>

      {(!isEdit || (quotationId && quotation?.status === "draft")) ? <PaymentTermsEditor key={`${quotationId || "new"}-${paymentTermsReloadVersion}`} quotationId={quotationId} isNew={!isEdit} quotationItems={items} autoFocus={focusPaymentTerms} onFocusHandled={() => { setFocusPaymentTerms(false); const url = new URL(window.location.href); url.searchParams.delete("focus"); window.history.replaceState(null, "", url); }} onDraftPayloadChange={setNewPaymentTerms} onSnapshotChange={setPaymentTermsSnapshot} onValidityChange={setPaymentTermsValid} /> : null}

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
          <button type="button" onClick={() => { void saveDraft(); }} disabled={saveDisabled} style={{ ...primaryButtonStyle, whiteSpace: "normal", textAlign: "center" }}>{saving ? "Saving..." : isEdit ? "บันทึกร่างทั้งหมด / Save All Draft Changes" : <>สร้างร่างและกำหนดเงื่อนไขการชำระเงิน<br /><span style={{ fontSize: 12, fontWeight: 500 }}>Create Draft and Set Payment Terms</span></>}</button>
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

function PaymentTermsEditor({ quotationId, isNew, quotationItems, autoFocus, onFocusHandled, onDraftPayloadChange, onSnapshotChange, onValidityChange }: { quotationId?: string; isNew: boolean; quotationItems: QuotationItemRow[]; autoFocus: boolean; onFocusHandled: () => void; onDraftPayloadChange: (payload: NewPaymentTermsPayload | null) => void; onSnapshotChange: (snapshot: PaymentTermsSnapshot) => void; onValidityChange: (valid: boolean) => void }) {
  const [terms, setTerms] = useState<PaymentTermsRow | null>(() => isNew ? { id: "new", payment_method_type: "single", client_summary: null } : null);
  const [method, setMethod] = useState<PaymentMethodType>("single");
  const [summary, setSummary] = useState("");
  const [summaryIsCustom, setSummaryIsCustom] = useState(false);
  const [allocationMode, setAllocationMode] = useState<PaymentAllocationMode>("proportional_all_items");
  const [installments, setInstallments] = useState<PaymentInstallment[]>(() => isNew ? [{ installment_no: 1, title: fullPaymentInstallmentTitle, calculation_type: "percentage", percentage: "100", trigger_type: "quotation_acceptance", trigger_description: "", due_date: "", payment_due_days: "0", client_note: "", items: [] }] : []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const paymentMethodRef = useRef<HTMLSelectElement | null>(null);
  const hasFocusedRef = useRef(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const quotationItemsRef = useRef(quotationItems);
  useEffect(() => {
    quotationItemsRef.current = quotationItems;
  }, [quotationItems]);
  // This projection is the only source used by both the matrix and allocation mapping.
  // Allocation rows intentionally keep only stable references, never a duplicate description.
  const lineItemSource = useMemo<PaymentLineItemSource[]>(() => quotationItems.map((item, index) => ({
    item: normalizeItem(item, index),
    reference: paymentReferenceForItem(item),
  })).filter((source): source is PaymentLineItemSource => Boolean(source.reference)), [quotationItems]);

  const defaultAllocation = useCallback((): PaymentAllocation[] => lineItemSource.map(({ item }) => ({
    ...(item.id ? { quotation_item_id: item.id } : { client_item_key: item.client_item_key }),
    allocated_amount_before_tax: 0,
    allocated_vat_amount: 0,
    allocated_total: 0,
    allocation_percentage: 0,
  })), [lineItemSource]);

  useEffect(() => {
    if (loading) return;
    const activeReferences = new Set(lineItemSource.map(({ reference }) => reference));
    const timer = window.setTimeout(() => {
      setInstallments((current) => {
        let didChange = false;
        const next = current.map((installment) => {
          const retained = installment.items.filter((allocation) => activeReferences.has(paymentAllocationReference(allocation)));
          const existingReferences = new Set(retained.map(paymentAllocationReference));
          const missing = allocationMode === "per_item"
            ? lineItemSource.filter(({ reference }) => !existingReferences.has(reference)).map(({ item }) => ({
              ...(item.id ? { quotation_item_id: item.id } : { client_item_key: item.client_item_key }),
              allocated_amount_before_tax: 0,
              allocated_vat_amount: 0,
              allocated_total: 0,
              allocation_percentage: 0,
            }))
            : [];
          if (retained.length === installment.items.length && missing.length === 0) return installment;
          didChange = true;
          return { ...installment, items: [...retained, ...missing] };
        });
        return didChange ? next : current;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [allocationMode, lineItemSource, loading]);

  const loadTerms = useCallback(async () => {
    if (isNew || !quotationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: header, error: headerError } = await supabase
      .from("finance_quotation_payment_terms")
      .select("id, payment_method_type, client_summary, allocation_mode")
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
      setSavedSnapshot(normalizedPaymentTermsSnapshot("single", "", [], "proportional_all_items"));
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
        .select("payment_installment_id, quotation_item_id, allocated_amount_before_tax, allocated_vat_amount, allocated_total, allocation_percentage")
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
    const nextAllocationMode = header.allocation_mode === "per_item" ? "per_item" : "proportional_all_items";
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
        allocation_percentage: item.allocation_percentage == null ? 0 : toAmount(item.allocation_percentage),
      })),
    }));
    const generatedSummary = buildPaymentClientSummary(nextMethod, nextAllocationMode, nextInstallments, quotationItemsRef.current);
    const effectiveSummary = nextSummary || generatedSummary;
    setTerms(header as PaymentTermsRow);
    setMethod(nextMethod);
    setSummary(effectiveSummary);
    setSummaryIsCustom(Boolean(nextSummary.trim()) && nextSummary.trim() !== generatedSummary.trim());
    setAllocationMode(nextAllocationMode);
    setInstallments(nextInstallments);
    setSavedSnapshot(normalizedPaymentTermsSnapshot(nextMethod, effectiveSummary, nextInstallments, nextAllocationMode));
    setLoading(false);
  }, [isNew, quotationId]);

  useEffect(() => {
    if (!autoFocus || loading || hasFocusedRef.current) return;
    hasFocusedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      (terms ? paymentMethodRef.current : sectionRef.current)?.focus({ preventScroll: true });
      onFocusHandled();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, loading, onFocusHandled, terms]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTerms(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTerms]);

  const installmentTotals = useMemo(() => calculatePaymentInstallmentTotals(allocationMode, installments, quotationItems), [allocationMode, installments, quotationItems]);
  const generatedSummary = useMemo(() => buildPaymentClientSummary(method, allocationMode, installments, quotationItems), [allocationMode, installments, method, quotationItems]);

  useEffect(() => {
    if (loading) return;
    onDraftPayloadChange(terms ? { payment_method_type: method, client_summary: summaryIsCustom ? summary : generatedSummary, allocation_mode: allocationMode, installments } : null);
  }, [allocationMode, generatedSummary, installments, loading, method, onDraftPayloadChange, summary, summaryIsCustom, terms]);

  const effectiveSummary = summaryIsCustom ? summary : generatedSummary;
  const currentSnapshot = useMemo(() => normalizedPaymentTermsSnapshot(method, effectiveSummary, installments, allocationMode), [allocationMode, effectiveSummary, method, installments]);

  useEffect(() => {
    onSnapshotChange({ ready: !loading, saved: savedSnapshot, current: currentSnapshot });
    return () => onSnapshotChange({ ready: false, saved: "", current: "" });
  }, [currentSnapshot, loading, onSnapshotChange, savedSnapshot]);

  const forcedTrigger = (nextMethod: PaymentMethodType): PaymentTriggerType | null => (
    ["milestone", "recurring", "manual"].includes(nextMethod) ? getDefaultPaymentTrigger(nextMethod) : null
  );
  const updateInstallment = (index: number, patch: Partial<PaymentInstallment>) => setInstallments((current) => current.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const next = { ...item, ...patch };
    return patch.trigger_type && !triggerUsesFixedCalendarDate(method, patch.trigger_type)
      ? { ...next, due_date: "" }
      : next;
  }));
  const paymentDueChoice = (value: number | string) => isPresetValue(value, paymentDueDayPresets) ? String(toAmount(value)) : "other";
  const percentageChoice = (value: number | string) => isPresetValue(value, percentagePresets) ? String(toAmount(value)) : "other";
  const setPaymentMethod = (nextMethod: PaymentMethodType) => {
    setMethod(nextMethod);
    const trigger = forcedTrigger(nextMethod);
    if (nextMethod === "single") {
      setInstallments((current) => normalizePaymentInstallments([{
        ...(current[0] || createDefaultPaymentInstallment(1, "single", defaultAllocation())),
        calculation_type: "percentage",
        percentage: "100",
        trigger_type: "quotation_acceptance",
      }], "single"));
      return;
    }
    setInstallments((current) => {
      const normalized = normalizePaymentInstallments(current.map((item) => ({
        ...item,
        calculation_type: current[0]?.calculation_type || "percentage",
        trigger_type: trigger || (nextMethod === "installments" && item.trigger_type === "recurring_period" ? "quotation_acceptance" : item.trigger_type),
      })), nextMethod);
      if (method === "single" && nextMethod === "installments" && normalized.length === 1) {
        const first = { ...normalized[0], percentage: "50" };
        return normalizePaymentInstallments([first, createDefaultPaymentInstallment(2, "installments", defaultAllocation(), "50")], "installments");
      }
      return normalized;
    });
  };
  const setPaymentAllocationMode = (nextMode: PaymentAllocationMode) => {
    if (nextMode === allocationMode) return;
    const hasPerItemValues = allocationMode === "per_item" && installments.some((installment) => (
      installment.items.some((allocation) => toAmount(allocation.allocation_percentage || 0) > 0)
    ));
    if (nextMode === "proportional_all_items" && hasPerItemValues && !window.confirm("การเปลี่ยนเป็นการกระจายสัดส่วนเดียวกันจะไม่ใช้ค่าที่กรอกแยกตามรายการเมื่อบันทึก ต้องการเปลี่ยนโหมดหรือไม่?")) return;
    setAllocationMode(nextMode);
    if (nextMode === "per_item") {
      setInstallments((current) => current.map((item) => ({ ...item, calculation_type: "percentage", percentage: "100" })));
    }
  };
  const updatePerItemAllocation = (source: PaymentLineItemSource, installmentIndex: number, value: string) => {
    setInstallments((current) => current.map((installment, currentIndex) => {
      if (currentIndex !== installmentIndex) return installment;
      const hasAllocation = installment.items.some((allocation) => paymentAllocationReference(allocation) === source.reference);
      const nextAllocation: PaymentAllocation = {
        ...(source.item.id ? { quotation_item_id: source.item.id } : { client_item_key: source.item.client_item_key }),
        allocated_amount_before_tax: 0,
        allocated_vat_amount: 0,
        allocated_total: 0,
        allocation_percentage: toAmount(value),
      };
      return {
        ...installment,
        items: hasAllocation
          ? installment.items.map((allocation) => paymentAllocationReference(allocation) === source.reference ? { ...allocation, allocation_percentage: toAmount(value) } : allocation)
          : [...installment.items, nextAllocation],
      };
    }));
  };
  const scrollToInstallment = (installmentIndex: number) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const installmentCard = document.getElementById(`payment-installment-${installmentIndex}`);
        installmentCard?.scrollIntoView({ behavior: "smooth", block: "start" });
        installmentCard?.focus({ preventScroll: true });
      });
    });
  };
  const addInstallment = () => {
    const calculationType = installments[0]?.calculation_type || "percentage";
    const remaining = normalizePercentage(100 - installments.reduce((sum, item) => sum + (item.calculation_type === "percentage" ? toAmount(item.percentage) : 0), 0));
    if (allocationMode === "proportional_all_items" && calculationType === "percentage" && remaining <= 0) {
      alert("เปอร์เซ็นต์รวมครบ 100% แล้ว ไม่สามารถเพิ่มงวดได้");
      return;
    }
    const nextInstallmentIndex = installments.length;
    setInstallments((current) => normalizePaymentInstallments([...current, createDefaultPaymentInstallment(
      nextInstallmentIndex + 1,
      method,
      defaultAllocation(),
      calculationType === "percentage" ? String(allocationMode === "per_item" ? 100 : remaining) : "",
      calculationType,
    )], method));
    scrollToInstallment(nextInstallmentIndex);
  };
  const changeCalculationType = (nextType: PaymentCalculationType) => setInstallments((current) => current.map((item) => ({
    ...item,
    calculation_type: nextType,
    percentage: nextType === "percentage" ? item.percentage || "0" : "",
    items: nextType === "percentage" ? defaultAllocation() : item.items.length ? item.items : defaultAllocation(),
  })));
  const percentageTotal = normalizePercentage(installments.reduce((sum, item) => sum + (item.calculation_type === "percentage" ? toAmount(item.percentage) : 0), 0));
  const fixedAllocated = installmentTotals.reduce((sum, total) => sum + total.total, 0);
  const quotationTotal = quotationItems.reduce((sum, item) => sum + toAmount(item.line_total), 0);
  const perItemPercentages = lineItemSource.map(({ reference }) => normalizePercentage(installments.reduce((sum, installment) => sum + toAmount(installment.items.find((allocation) => paymentAllocationReference(allocation) === reference)?.allocation_percentage || 0), 0)));
  const isPercentage = installments[0]?.calculation_type !== "fixed_amount";
  const allocationValidationIssue = getPaymentAllocationValidationIssue(allocationMode, installments, lineItemSource.map(({ item }) => item));
  const allocationCompletionIssue = getPaymentAllocationValidationIssue(allocationMode, installments, lineItemSource.map(({ item }) => item), true);
  const complete = allocationMode === "per_item"
    ? !allocationCompletionIssue
    : isPercentage ? percentageTotal === 100 : fixedAllocated === quotationTotal;
  const incompletePerItem = lineItemSource.map(({ item }, index) => ({ item, remaining: normalizePercentage(100 - perItemPercentages[index]) })).filter(({ remaining }) => remaining > 0);
  const paymentTermsValidationMessage = terms
    ? getPaymentTermsPlanValidationMessage(method, installments, allocationMode)
    : null;
  const paymentTermsValid = !terms || (!allocationValidationIssue && !paymentTermsValidationMessage);
  const allocationStatusMessage = paymentTermsValidationMessage || allocationValidationIssue?.message || (allocationMode === "per_item"
    ? (complete
      ? "ทุกรายการจัดสรรครบ 100% พร้อมสำหรับการตรวจสอบก่อนส่ง"
      : incompletePerItem.map(({ item, remaining }) => `รายการ ${item.description || item.id || "-"} ยังจัดสรรไม่ครบ เหลือ ${remaining}% หรือ ${formatMoney(toAmount(item.line_total) * remaining / 100)}`).join(" | "))
    : isPercentage
      ? (complete
        ? "สัดส่วนรวมครบ 100% พร้อมสำหรับการตรวจสอบก่อนส่ง"
        : `สัดส่วนรวม ${percentageTotal.toFixed(6).replace(/\.0+$/, "")}% ยังขาด ${normalizePercentage(100 - percentageTotal).toFixed(6).replace(/\.0+$/, "")}%`)
      : `จัดสรรแล้ว ${formatMoney(fixedAllocated)} คงเหลือ ${formatMoney(Math.max(0, quotationTotal - fixedAllocated))}${complete ? " พร้อมสำหรับการตรวจสอบก่อนส่ง" : " ยังไม่ครบสำหรับการส่งใบเสนอราคา"}`);
  const allocationStatusHasError = Boolean(paymentTermsValidationMessage || allocationValidationIssue);

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
  if (loading) return <div style={cardStyle}>Loading payment terms...</div>;
  if (!terms) return <div id="quotation-payment-terms" ref={sectionRef} tabIndex={-1} style={{ ...cardStyle, scrollMarginTop: 96 }}><h2 style={sectionTitleStyle}>เงื่อนไขการชำระเงิน / Payment Terms</h2><p style={mutedTextStyle}>ยังไม่มีเงื่อนไขการชำระเงินสำหรับใบเสนอราคาฉบับร่างนี้</p><button type="button" onClick={createDefault} disabled={saving} style={primaryButtonStyle}>{saving ? "Creating..." : "สร้างเงื่อนไขชำระเต็มจำนวน / Create Full Payment Terms"}</button></div>;

  return <div id="quotation-payment-terms" ref={sectionRef} tabIndex={-1} style={{ ...cardStyle, scrollMarginTop: 96 }}>
    <div style={sectionHeaderStyle}><div><h2 style={sectionTitleStyle}>เงื่อนไขการชำระเงิน / Payment Terms</h2><p style={mutedTextStyle}>เงื่อนไขการชำระเงินจะบันทึกพร้อมกับร่างใบเสนอราคา</p></div></div>
    <div style={formGridStyle}>
      <label style={labelStyle}>วิธีชำระเงิน / Payment Method<select ref={paymentMethodRef} value={method} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethodType)} style={inputStyle}><option value="single">ชำระครั้งเดียว / Single Payment</option><option value="installments">แบ่งชำระหลายงวด / Installments</option><option value="milestone">ตามขั้นตอนงาน / Milestone</option><option value="recurring">เรียกเก็บเป็นรอบ / Recurring</option><option value="manual">กำหนดเอง / Manual</option></select></label>
      <label style={labelStyle}>วิธีกระจายค่าบริการในแต่ละงวด<select value={allocationMode} onChange={(event) => setPaymentAllocationMode(event.target.value as PaymentAllocationMode)} style={inputStyle}><option value="proportional_all_items">กระจายทุกรายการตามสัดส่วนเดียวกัน</option><option value="per_item">กำหนดสัดส่วนแยกแต่ละรายการ</option></select><span style={helperTextStyle}>กำหนดว่ารายการค่าบริการในใบเสนอราคาจะถูกกระจายเข้าแต่ละงวดอย่างไร ไม่เกี่ยวกับการแบ่งค่าตอบแทนภายในสำนักงาน</span></label>
    </div>
    {installments.map((installment, index) => <div id={`payment-installment-${index}`} key={index} tabIndex={-1} style={{ ...cardStyle, marginTop: 12, background: "#f8fafc", scrollMarginTop: 96 }}>
      <div style={sectionHeaderStyle}><h3 style={sectionTitleStyle}>งวดที่ {index + 1}</h3>{method !== "single" ? <div style={actionGroupStyle}><button type="button" title="เลื่อนงวดขึ้น" disabled={index === 0} onClick={() => setInstallments((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return normalizePaymentInstallments(next, method); })} style={smallButtonStyle}>เลื่อนขึ้น</button><button type="button" title="เลื่อนงวดลง" disabled={index === installments.length - 1} onClick={() => setInstallments((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return normalizePaymentInstallments(next, method); })} style={smallButtonStyle}>เลื่อนลง</button><button type="button" onClick={() => setInstallments((current) => normalizePaymentInstallments(current.filter((_, itemIndex) => itemIndex !== index), method))} style={dangerSmallButtonStyle}>ลบงวด</button></div> : null}</div>
      <InstallmentAmountSummary total={installmentTotals[index]} percentage={allocationMode === "proportional_all_items" && installment.calculation_type === "percentage" ? toAmount(installment.percentage) : null} effectivePercentage={quotationTotal > 0 ? installmentTotals[index].total * 100 / quotationTotal : 0} perItem={allocationMode === "per_item"} />
      <div style={formGridStyle}>
        <label style={labelStyle}>ชื่องวด<input id={`payment-installment-${index}-title`} value={installment.title} onChange={(event) => updateInstallment(index, { title: event.target.value })} style={inputStyle} /></label>
        {allocationMode === "proportional_all_items" ? <><label style={labelStyle}>วิธีคำนวณ<select value={installment.calculation_type} disabled={method === "single"} onChange={(event) => changeCalculationType(event.target.value as PaymentCalculationType)} style={inputStyle}><option value="percentage">ตามสัดส่วน (%)</option><option value="fixed_amount">กำหนดยอดเงินแยกรายการ</option></select></label>
        {installment.calculation_type === "percentage" ? <label style={labelStyle}>สัดส่วน<div style={compactFieldGroupStyle}><select value={percentageChoice(installment.percentage)} disabled={method === "single"} onChange={(event) => { const value = event.target.value; updateInstallment(index, { percentage: value === "other" ? "" : value }); }} style={compactSelectStyle}><option value="50">50%</option><option value="25">25%</option><option value="20">20%</option><option value="other">กำหนดเอง</option></select>{percentageChoice(installment.percentage) === "other" ? <input id={`payment-installment-${index}-percentage`} aria-label={`สัดส่วนงวดที่ ${index + 1}`} type="number" min="0.000001" max="100" step="0.000001" value={installment.percentage} onChange={(event) => updateInstallment(index, { percentage: event.target.value })} style={compactInputStyle} /> : null}</div></label> : null}</> : null}
        <label style={labelStyle}>เงื่อนไขเรียกเก็บ<select id={`payment-installment-${index}-trigger`} value={forcedTrigger(method) || installment.trigger_type} disabled={Boolean(forcedTrigger(method))} onChange={(event) => updateInstallment(index, { trigger_type: event.target.value as PaymentTriggerType })} style={inputStyle}><option value="quotation_acceptance">เมื่อลูกค้ายืนยันใบเสนอราคา</option><option value="agreement_effective">เมื่อข้อตกลงมีผล</option><option value="date">ตามวันที่กำหนด</option><option value="case_milestone">ตามขั้นตอนงานหรือคดี</option>{method !== "installments" ? <option value="recurring_period">ตามรอบเวลา</option> : null}<option value="manual">กำหนดเงื่อนไขเอง</option></select><span style={helperTextStyle}>เหตุการณ์ที่ทำให้ถึงงวดเรียกเก็บ</span></label>
        {triggerUsesFixedCalendarDate(method, installment.trigger_type) ? <label style={labelStyle}>วันที่เรียกเก็บ<input id={`payment-installment-${index}-due_date`} type="date" value={installment.due_date} onChange={(event) => updateInstallment(index, { due_date: event.target.value })} style={inputStyle} /></label> : null}
        {["case_milestone", "recurring_period", "manual"].includes(forcedTrigger(method) || installment.trigger_type) ? <label style={wideLabelStyle}>รายละเอียดเงื่อนไข<input id={`payment-installment-${index}-trigger_description`} placeholder="เช่น เมื่อยื่นฟ้องหรือคำให้การ ก่อนวันนัดสืบพยาน หรือเมื่อส่งมอบงาน" value={installment.trigger_description} onChange={(event) => updateInstallment(index, { trigger_description: event.target.value })} style={inputStyle} /></label> : null}
        <label style={labelStyle}>กำหนดชำระ<div style={compactFieldGroupStyle}><select id={`payment-installment-${index}-payment_due_days`} value={paymentDueChoice(installment.payment_due_days)} onChange={(event) => { const value = event.target.value; updateInstallment(index, { payment_due_days: value === "other" ? "" : value }); }} style={compactSelectStyle}>{paymentDueDayPresets.map((days) => <option key={days} value={days}>{days} วัน</option>)}<option value="other">กำหนดเอง</option></select>{paymentDueChoice(installment.payment_due_days) === "other" ? <input id={`payment-installment-${index}-payment_due_days`} aria-label={`จำนวนวันชำระงวดที่ ${index + 1}`} type="number" min="0" step="1" value={installment.payment_due_days} onChange={(event) => updateInstallment(index, { payment_due_days: event.target.value })} style={compactInputStyle} /> : null}</div><span style={helperTextStyle}>เมื่อถึงงวดแล้ว ลูกค้าต้องชำระภายในกี่วันนับแต่ได้รับใบแจ้งหนี้</span></label>
        <label style={wideLabelStyle}>หมายเหตุที่แสดงแก่ลูกค้า<textarea value={installment.client_note} onChange={(event) => updateInstallment(index, { client_note: event.target.value })} style={textareaStyle} /></label>
      </div>
      {allocationMode === "proportional_all_items" ? installment.calculation_type === "fixed_amount" ? <div style={tableWrapStyle}><h4 style={sectionTitleStyle}>Advanced Item Allocation</h4><table style={tableStyle}><thead><tr><th style={thStyle}>Quotation Item</th><th style={rightThStyle}>Before VAT</th><th style={rightThStyle}>VAT</th><th style={rightThStyle}>Total</th><th style={rightThStyle}>Remaining</th></tr></thead><tbody>{quotationItems.filter((item) => item.id || item.client_item_key).map((quotationItem) => { const reference = paymentReferenceForItem(quotationItem); const allocation = installment.items.find((item) => paymentAllocationReference(item) === reference) || { ...(quotationItem.id ? { quotation_item_id: quotationItem.id } : { client_item_key: quotationItem.client_item_key }), allocated_amount_before_tax: 0, allocated_vat_amount: 0, allocated_total: 0 }; const allocatedElsewhere = installments.filter((_, installmentIndex) => installmentIndex !== index).reduce((sum, other) => sum + (other.items.find((item) => paymentAllocationReference(item) === reference)?.allocated_total || 0), 0); const patch = (field: keyof PaymentAllocation, value: string) => updateInstallment(index, { items: installment.items.some((item) => paymentAllocationReference(item) === reference) ? installment.items.map((item) => paymentAllocationReference(item) === reference ? { ...item, [field]: toAmount(value), allocated_total: field === "allocated_total" ? toAmount(value) : (field === "allocated_amount_before_tax" ? toAmount(value) : item.allocated_amount_before_tax) + (field === "allocated_vat_amount" ? toAmount(value) : item.allocated_amount_before_tax) } : item) : [...installment.items, { ...allocation, [field]: toAmount(value), allocated_total: field === "allocated_total" ? toAmount(value) : (field === "allocated_amount_before_tax" ? toAmount(value) : 0) + (field === "allocated_vat_amount" ? toAmount(value) : 0) }] }); return <tr key={reference}><td style={tdStyle}>{quotationItem.description}</td><td style={rightTdStyle}><input type="number" min="0" step="0.01" value={allocation.allocated_amount_before_tax} onChange={(event) => patch("allocated_amount_before_tax", event.target.value)} style={compactInputStyle} /></td><td style={rightTdStyle}><input type="number" min="0" step="0.01" value={allocation.allocated_vat_amount} onChange={(event) => patch("allocated_vat_amount", event.target.value)} style={compactInputStyle} /></td><td style={rightTdStyle}>{formatMoney(allocation.allocated_amount_before_tax + allocation.allocated_vat_amount)}</td><td style={rightTdStyle}>{formatMoney(toAmount(quotationItem.line_total) - allocatedElsewhere - allocation.allocated_total)}</td></tr>; })}</tbody></table></div> : <p style={mutedTextStyle}>ระบบจะรวมทุกรายการค่าบริการและคำนวณ Before VAT, VAT และ Total จากเปอร์เซ็นต์ในฝั่งเซิร์ฟเวอร์</p> : null}
    </div>)}
    {method !== "single" ? <button type="button" onClick={addInstallment} style={secondaryButtonStyle}>เพิ่มงวด</button> : null}
    {allocationMode === "per_item" && installments.every((installment) => installment.calculation_type === "percentage") ? <PerItemAllocationMatrix sources={lineItemSource} installments={installments} onChange={updatePerItemAllocation} /> : null}
    <section style={{ ...allocationStatusPanelStyle, ...(allocationStatusHasError ? allocationStatusErrorStyle : complete ? allocationStatusCompleteStyle : allocationStatusIncompleteStyle) }} aria-live="polite">
      <span style={allocationStatusLabelStyle}>สถานะการจัดสรรค่าบริการ</span>
      <strong style={allocationStatusHeadingStyle}>{allocationStatusHasError ? "ต้องแก้ไขข้อมูล" : complete ? "ครบ 100%" : "ยังจัดสรรไม่ครบ"}</strong>
      <span style={allocationStatusDetailStyle}>{allocationStatusMessage}</span>
    </section>
    <section style={paymentSummarySectionStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <h3 style={sectionTitleStyle}>ข้อความสรุปที่จะแสดงในใบเสนอราคา</h3>
          <p style={mutedTextStyle}>ระบบสร้างข้อความนี้จากงวดและเงื่อนไขการชำระเงินด้านบน เพื่อให้ลูกค้าอ่านเข้าใจง่าย</p>
        </div>
        {summaryIsCustom
          ? <button type="button" onClick={() => { setSummaryIsCustom(false); setSummary(generatedSummary); }} style={smallButtonStyle}>คืนค่าเป็นข้อความจากระบบ</button>
          : <button type="button" onClick={() => { setSummary(generatedSummary); setSummaryIsCustom(true); }} style={smallButtonStyle}>ปรับข้อความสำหรับลูกค้า</button>}
      </div>
      {summaryIsCustom ? <>
        <textarea id="payment-client-summary" aria-label="ข้อความสรุปที่จะแสดงในใบเสนอราคา" value={summary} onChange={(event) => setSummary(event.target.value)} style={textareaStyle} />
        <p style={paymentSummaryOverrideNoticeStyle}>การแก้ข้อความนี้เปลี่ยนเฉพาะข้อความที่แสดงในใบเสนอราคา ไม่เปลี่ยนจำนวนเงิน งวด หรือเงื่อนไขเรียกเก็บในระบบ</p>
      </> : <div style={paymentSummaryOutputStyle} aria-live="polite">{generatedSummary || "ระบบจะสร้างข้อความสรุปเมื่อมีข้อมูลงวดการชำระเงิน"}</div>}
    </section>
  </div>;
}

function PerItemAllocationMatrix({ sources, installments, onChange }: { sources: PaymentLineItemSource[]; installments: PaymentInstallment[]; onChange: (source: PaymentLineItemSource, installmentIndex: number, value: string) => void }) {
  return <div style={{ ...cardStyle, marginTop: 12 }}>
    <h3 style={sectionTitleStyle}>กระจายค่าบริการแยกตามรายการ</h3>
    <p style={mutedTextStyle}>กำหนดสัดส่วนของแต่ละรายการแยกกัน โดยแต่ละรายการต้องรวมครบ 100% ก่อนส่งใบเสนอราคา</p>
    <div style={perItemMatrixListStyle}>
      {sources.map((source) => {
        const itemTotals = calculatePaymentItemInstallmentTotals("per_item", installments, source.item);
        const allocatedPercentage = normalizePercentage(installments.reduce((sum, installment) => sum + toAmount(installment.items.find((allocation) => paymentAllocationReference(allocation) === source.reference)?.allocation_percentage || 0), 0));
        const remainingPercentage = normalizePercentage(100 - allocatedPercentage);
        const allocatedAmount = roundMoney(itemTotals.reduce((sum, total) => sum + total.total, 0));
        const remainingAmount = roundMoney(toAmount(source.item.line_total) - allocatedAmount);
        const isOverAllocated = remainingPercentage < 0;
        return <div id={`payment-allocation-item-${source.reference}`} key={source.reference} tabIndex={-1} style={perItemMatrixRowStyle}>
          <div style={perItemMatrixItemStyle}>
            <strong style={perItemDescriptionStyle}>{source.item.description.trim() || "ยังไม่ได้ระบุชื่อรายการ"}</strong>
            <span style={mutedTextStyle}>มูลค่ารายการ {formatMoney(toAmount(source.item.line_total))}</span>
            <span style={isOverAllocated ? perItemErrorTextStyle : helperTextStyle}>
              รวม {formatCompactPercentage(allocatedPercentage)} · {isOverAllocated ? "เกิน" : "คงเหลือ"} {formatCompactPercentage(Math.abs(remainingPercentage))} ({formatMoney(Math.abs(remainingAmount))})
            </span>
          </div>
          <div style={perItemInstallmentGridStyle}>
            {installments.map((installment, installmentIndex) => {
              const allocation = installment.items.find((entry) => paymentAllocationReference(entry) === source.reference);
              return <label key={installmentIndex} style={labelStyle}>
                งวดที่ {installmentIndex + 1} (%)
                <input
                  id={`payment-allocation-${source.reference}-${installmentIndex}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.000001"
                  value={allocation?.allocation_percentage ?? 0}
                  onChange={(event) => onChange(source, installmentIndex, event.target.value)}
                  style={perItemPercentageInputStyle}
                />
                <span style={helperTextStyle}>ยอดงวด {formatMoney(itemTotals[installmentIndex]?.total || 0)}</span>
              </label>;
            })}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function InstallmentAmountSummary({ total, percentage, effectivePercentage, perItem }: { total: PaymentInstallmentTotal; percentage: number | null; effectivePercentage: number; perItem: boolean }) {
  return <div style={installmentAmountSummaryStyle}>
    <div><strong>ยอดเงินงวดนี้</strong>{percentage != null ? <span style={installmentPercentageStyle}>{formatCompactPercentage(percentage)}</span> : perItem ? <span style={installmentPercentageStyle}>คิดเป็น {formatCompactPercentage(effectivePercentage)} ของใบเสนอราคา</span> : null}</div>
    <div style={installmentAmountGridStyle}><span>ก่อน VAT<br /><strong>{formatMoney(total.beforeTax)}</strong></span><span>VAT<br /><strong>{formatMoney(total.vat)}</strong></span><span>ยอดรวมงวด<br /><strong>{formatMoney(total.total)}</strong></span></div>
    {perItem ? <p style={helperTextStyle}>ยอดงวดคำนวณจากการกระจายค่าบริการแยกตามรายการ</p> : null}
  </div>;
}

export function QuotationDetail({ access, quotationId }: { access: QuotationAccess; quotationId: string }) {
  const router = useRouter();
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [items, setItems] = useState<QuotationItemRow[]>([]);
  const [lookups, setLookups] = useState<LookupState>(getEmptyLookups());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [engagement, setEngagement] = useState<QuotationEngagementReference | null>(null);
  const [linkClientId, setLinkClientId] = useState("");
  const [linkMatterMode, setLinkMatterMode] = useState<"unlinked" | "case" | "advisory">("unlinked");
  const [linkCaseId, setLinkCaseId] = useState("");
  const [linkAdvisoryMatterId, setLinkAdvisoryMatterId] = useState("");
  const [engagementChoice, setEngagementChoice] = useState<QuotationEngagementBasis | null>(null);
  const [confirmationForm, setConfirmationForm] = useState<EngagementConfirmationForm>({ confirmedOn: "", channel: "", note: "" });
  const [confirmationErrors, setConfirmationErrors] = useState<EngagementConfirmationErrors>({});
  const [engagementMessage, setEngagementMessage] = useState("");
  const feeAgreementCreatingRef = useRef(false);
  const engagementConfirmingRef = useRef(false);
  const confirmationPanelRef = useRef<HTMLDivElement>(null);
  const confirmationDateRef = useRef<HTMLInputElement>(null);
  const confirmationChannelRef = useRef<HTMLSelectElement>(null);

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
      supabase.from("finance_fee_agreements").select("id,engagement_basis,status,source_reference").eq("source_type", "quotation").eq("source_quotation_id", quotationId).neq("status", "cancelled").maybeSingle(),
    ]);
    if (itemRes.error) {
      console.warn("Failed to load quotation items", { quotationId, error: itemRes.error });
    }

    const loadedQuotation = quotationRes.data as QuotationRow;
    setQuotation(loadedQuotation);
    setItems((itemRes.data || []) as QuotationItemRow[]);
    setEngagement((agreementRes.data || null) as QuotationEngagementReference | null);
    setLookups(lookupRes);
    const canonicalMatterLink = getCanonicalQuotationMatterLink(loadedQuotation);
    setLinkClientId(loadedQuotation.client_id || "");
    setLinkMatterMode(canonicalMatterLink.mode);
    setLinkCaseId(canonicalMatterLink.caseId);
    setLinkAdvisoryMatterId(canonicalMatterLink.advisoryMatterId);
    setLoading(false);
  }, [quotationId]);

  const createFeeAgreement = async () => {
    if (!quotation || saving || feeAgreementCreatingRef.current) return;
    feeAgreementCreatingRef.current = true;
    setSaving(true);
    const { data, error } = await supabase.rpc("create_finance_fee_agreement_from_quotation_v2", { p_quotation_id: quotation.id });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result?.fee_agreement_id) {
      console.error("Unable to create Fee Agreement draft", error);
      alert(error?.message || "Unable to create Fee Agreement draft.");
      setSaving(false);
      feeAgreementCreatingRef.current = false;
      return;
    }
    const agreementRes = await supabase.from("finance_fee_agreements").select("agreement_no,title,effective_date,expiry_date,billing_method").eq("id", result.fee_agreement_id).maybeSingle();
    if (result.created && agreementRes.data && /^Fee Agreement\s*-\s*/i.test(agreementRes.data.title || "")) {
      const titleResult = await supabase.rpc("save_finance_fee_agreement_draft_metadata", {
        p_fee_agreement_id: result.fee_agreement_id,
        p_title: "สัญญาว่าจ้างให้บริการทางกฎหมาย",
        p_effective_date: agreementRes.data.effective_date || null,
        p_expiry_date: agreementRes.data.expiry_date || null,
        p_billing_method: agreementRes.data.billing_method || "single",
      });
      if (titleResult.error) console.warn("Fee Agreement default title could not be saved", titleResult.error);
    }
    if (agreementRes.data?.agreement_no) alert(`สร้าง Fee Agreement ${agreementRes.data.agreement_no} แล้ว`);
    router.push(`/finance/fee-agreements/${result.fee_agreement_id}`);
  };

  const openConfirmationPanel = () => {
    setEngagementChoice("accepted_quotation");
    setConfirmationErrors({});
    setEngagementMessage("");
    window.setTimeout(() => confirmationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const confirmAcceptedQuotationEngagement = async () => {
    if (!quotation || saving || engagementConfirmingRef.current) return;
    const nextErrors: EngagementConfirmationErrors = {};
    if (!confirmationForm.confirmedOn) nextErrors.confirmedOn = "กรุณาระบุวันที่ลูกค้ายืนยันว่าจ้าง";
    else if (confirmationForm.confirmedOn > getBangkokDateKey()) nextErrors.confirmedOn = "วันที่ลูกค้ายืนยันว่าจ้างต้องไม่เป็นวันที่ในอนาคต";
    if (!confirmationForm.channel) nextErrors.channel = "กรุณาเลือกช่องทางการยืนยัน";
    if (Object.keys(nextErrors).length) {
      setConfirmationErrors(nextErrors);
      setEngagementMessage("กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนยืนยันการว่าจ้าง");
      const firstTarget = nextErrors.confirmedOn ? confirmationDateRef.current : confirmationChannelRef.current;
      window.setTimeout(() => { firstTarget?.focus({ preventScroll: true }); firstTarget?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 0);
      return;
    }

    engagementConfirmingRef.current = true;
    setSaving(true);
    setEngagementMessage("");
    try {
      const { data, error } = await supabase.rpc("confirm_finance_accepted_quotation_engagement", {
        p_quotation_id: quotation.id,
        p_confirmed_on: confirmationForm.confirmedOn,
        p_confirmation_channel: confirmationForm.channel,
        p_confirmation_note: confirmationForm.note.trim() || null,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.fee_agreement_id) {
        console.error("Unable to confirm accepted quotation engagement", { quotationId: quotation.id, error });
        setEngagementMessage(mapAcceptedEngagementError(error?.message || ""));
        return;
      }
      router.push(`/finance/fee-agreements/${result.fee_agreement_id}`);
    } catch (confirmationError) {
      console.error("Unexpected accepted quotation engagement confirmation failure", confirmationError);
      setEngagementMessage("ยืนยันการว่าจ้างไม่สำเร็จ กรุณารีเฟรชและลองอีกครั้ง");
    } finally {
      engagementConfirmingRef.current = false;
      setSaving(false);
    }
  };

  const linkMasterRecords = async () => {
    if (!quotation || saving) return;
    if (!linkClientId) {
      alert("กรุณาเลือกลูกค้าในระบบก่อนสร้าง Fee Agreement");
      return;
    }
    if (linkMatterMode === "case" && !linkCaseId) {
      alert("กรุณาเลือก Case");
      return;
    }
    if (linkMatterMode === "advisory" && !linkAdvisoryMatterId) {
      alert("กรุณาเลือก Advisory");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("link_finance_quotation_master_records", {
      p_quotation_id: quotation.id,
      p_client_id: linkClientId,
      p_case_id: linkMatterMode === "case" ? Number(linkCaseId) : null,
      p_advisory_matter_id: linkMatterMode === "advisory" ? linkAdvisoryMatterId : null,
    });
    if (error) {
      console.error("Unable to link accepted quotation to master records", { quotationId: quotation.id, error });
      alert("เชื่อมข้อมูลลูกค้าหรือเรื่องไม่สำเร็จ กรุณาตรวจสอบข้อมูลอีกครั้ง");
      setSaving(false);
      return;
    }
    await createAuditLog({
      tableName: "finance_quotations",
      recordId: quotation.id,
      caseId: linkMatterMode === "case" ? Number(linkCaseId) : null,
      action: "update",
      note: `Linked accepted quotation ${quotation.quotation_no} to Client/Matter before Fee Agreement conversion`,
    });
    await loadData();
    setSaving(false);
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
    const { error } = await supabase.rpc("set_finance_quotation_status_v2", {
      p_quotation_id: quotation.id,
      p_next_status: nextStatus,
      p_cancel_reason: cancelReason,
      p_user_id: access.userId,
      p_user_email: access.userEmail,
      p_user_name: access.userName,
    });
    if (error) {
      console.error("Unable to update quotation status", error);
      alert(getQuotationStatusErrorMessage(error));
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

  const canonicalMatterLink = quotation ? getCanonicalQuotationMatterLink(quotation) : null;
  const hasCanonicalMatter = Boolean(quotation?.case_id || quotation?.advisory_matter_id);
  const requiresMasterRecordLink = Boolean(quotation && (
    !quotation.client_id
    || (!hasCanonicalMatter && linkMatterMode !== "unlinked")
  ));

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
              {quotation.status === "accepted" && access.permissions.canCreateFinanceQuotation && engagement ? <Link href={`/finance/fee-agreements/${engagement.id}`} style={primaryButtonStyle}>{engagement.engagement_basis === "accepted_quotation" ? "เปิดการว่าจ้างตามใบเสนอราคา" : "เปิดข้อตกลงค่าบริการ"}</Link> : null}
              {quotation.status === "draft" && access.permissions.canEditFinanceQuotation ? <Link href={`/finance/quotations/${quotation.id}/edit`} style={primaryButtonStyle}>Edit Draft</Link> : null}
              {quotation.status === "draft" && access.permissions.canMarkFinanceQuotationSent ? <button type="button" onClick={() => updateStatus("sent")} disabled={saving} style={secondaryButtonStyle}>Mark Sent</button> : null}
              {quotation.status === "sent" && access.permissions.canMarkFinanceQuotationAccepted ? <button type="button" onClick={() => updateStatus("accepted")} disabled={saving} style={secondaryButtonStyle}>Mark Accepted</button> : null}
              {(quotation.status === "draft" || quotation.status === "sent") && access.permissions.canCancelFinanceQuotation ? <button type="button" onClick={() => updateStatus("cancelled")} disabled={saving} style={dangerButtonStyle}>Cancel</button> : null}
            </div>
          </div>

          {quotation.status === "accepted" && !engagement && access.permissions.canCreateFinanceQuotation ? (
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>ลูกค้าตอบรับใบเสนอราคาแล้ว</h2>
              <p style={mutedTextStyle}>ตรวจสอบลูกค้าและเรื่อง/งานก่อนเลือกวิธีดำเนินการต่อ ระบบจะไม่สร้างลูกค้า Case หรือ Advisory ใหม่โดยอัตโนมัติ และจะไม่แก้ไข snapshot ของใบเสนอราคาที่ส่งแล้ว</p>
              <div style={{ ...formGridStyle, marginTop: 14 }}>
                <label style={labelStyle}>ลูกค้าในระบบ *
                  <select value={linkClientId} disabled={Boolean(quotation.client_id)} onChange={(event) => setLinkClientId(event.target.value)} style={inputStyle}>
                    <option value="">เลือกลูกค้า</option>
                    {lookups.clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}
                  </select>
                </label>
                <div style={wideFieldGroupStyle}>
                  <div style={fieldHeadingStyle}>เรื่อง / งาน</div>
                  <div style={segmentedControlStyle}>
                    <button type="button" disabled={hasCanonicalMatter} onClick={() => { setLinkMatterMode("unlinked"); setLinkCaseId(""); setLinkAdvisoryMatterId(""); }} style={getSegmentButtonStyle(linkMatterMode === "unlinked")}>ยังไม่ผูกเรื่อง</button>
                    <button type="button" disabled={hasCanonicalMatter} onClick={() => { setLinkMatterMode("case"); setLinkAdvisoryMatterId(""); }} style={getSegmentButtonStyle(linkMatterMode === "case")}>Case</button>
                    <button type="button" disabled={hasCanonicalMatter} onClick={() => { setLinkMatterMode("advisory"); setLinkCaseId(""); }} style={getSegmentButtonStyle(linkMatterMode === "advisory")}>Advisory</button>
                  </div>
                  {linkMatterMode === "case" ? <select value={linkCaseId} disabled={Boolean(canonicalMatterLink?.caseId)} onChange={(event) => setLinkCaseId(event.target.value)} style={inputStyle}><option value="">เลือก Case</option>{lookups.cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}</select> : null}
                  {linkMatterMode === "advisory" ? <select value={linkAdvisoryMatterId} disabled={Boolean(canonicalMatterLink?.advisoryMatterId)} onChange={(event) => setLinkAdvisoryMatterId(event.target.value)} style={inputStyle}><option value="">เลือก Advisory</option>{lookups.matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}</select> : null}
                </div>
              </div>
              {!quotation.client_id ? <p style={noticeTextStyle}>การดำเนินการต่อจำเป็นต้องอ้างอิงลูกค้าในระบบ กรุณาเชื่อมลูกค้าก่อน</p> : null}
              {hasCanonicalMatter ? <p style={helperTextStyle}>เรื่อง/งานนี้เชื่อมกับใบเสนอราคาแล้วและจะใช้เป็นข้อมูลอ้างอิงของการว่าจ้าง</p> : null}
              {requiresMasterRecordLink ? <div style={buttonRowStyle}><button type="button" onClick={linkMasterRecords} disabled={saving} style={primaryButtonStyle}>{saving ? "กำลังบันทึก..." : "บันทึกการเชื่อมข้อมูล"}</button></div> : <>
                <div style={engagementDecisionIntroStyle}><strong>เลือกวิธีดำเนินการต่อให้ตรงกับการว่าจ้างจริง</strong><span>แต่ละทางเลือกใช้หลักฐานและขั้นตอนดำเนินงานต่างกัน</span></div>
                <div style={engagementChoiceGridStyle}>
                  <div style={{ ...engagementChoiceCardStyle, ...(engagementChoice === "formal_agreement" ? engagementChoiceActiveStyle : {}) }}>
                    <div><span style={engagementChoiceEyebrowStyle}>มีเอกสารสัญญาแยก</span><h3 style={engagementChoiceTitleStyle}>จัดทำสัญญาว่าจ้าง</h3><p style={engagementChoiceDescriptionStyle}>ใช้เมื่อจะจัดทำสัญญาว่าจ้างแยกและดำเนินการตรวจทาน ส่ง และลงนาม</p></div>
                    <button type="button" onClick={() => { setEngagementChoice("formal_agreement"); void createFeeAgreement(); }} disabled={saving} style={secondaryButtonStyle}>{saving && engagementChoice === "formal_agreement" ? "กำลังสร้าง..." : "จัดทำสัญญาว่าจ้าง"}</button>
                  </div>
                  <div style={{ ...engagementChoiceCardStyle, ...(engagementChoice === "accepted_quotation" ? engagementChoiceActiveStyle : {}) }}>
                    <div><span style={engagementChoiceEyebrowStyle}>ไม่มีเอกสารสัญญาแยก</span><h3 style={engagementChoiceTitleStyle}>เริ่มงานตามใบเสนอราคาที่ตอบรับ</h3><p style={engagementChoiceDescriptionStyle}>ใช้เมื่อลูกค้ายืนยันว่าจ้างตามใบเสนอราคาและไม่จัดทำสัญญาแยก</p></div>
                    <button type="button" onClick={openConfirmationPanel} disabled={saving} style={primaryButtonStyle}>บันทึกการยืนยันว่าจ้าง</button>
                  </div>
                </div>
                {engagementChoice === "accepted_quotation" ? <div ref={confirmationPanelRef} tabIndex={-1} style={engagementConfirmationPanelStyle}>
                  <div><h3 style={engagementChoiceTitleStyle}>ยืนยันการว่าจ้างตามใบเสนอราคา</h3><p style={engagementChoiceDescriptionStyle}>ระบบจะบันทึกใบเสนอราคาที่ตอบรับไว้เป็นหลักฐานการว่าจ้าง และเปิดขั้นตอนจัดทำแผนเรียกเก็บเงิน</p><p style={engagementConfirmationClarificationStyle}>ไม่ได้สร้างสัญญาว่าจ้างแยก และไม่มีขั้นตอนลงนามสัญญา</p></div>
                  {engagementMessage ? <div role="alert" style={errorNoticeTextStyle}>{engagementMessage}</div> : null}
                  <div style={formGridStyle}>
                    <label style={labelStyle}>วันที่ลูกค้ายืนยันว่าจ้าง *<input ref={confirmationDateRef} type="date" value={confirmationForm.confirmedOn} aria-invalid={Boolean(confirmationErrors.confirmedOn)} onChange={(event) => { const confirmedOn = event.target.value; setConfirmationForm({ ...confirmationForm, confirmedOn }); if (confirmedOn) { setConfirmationErrors((current) => { const next = { ...current }; delete next.confirmedOn; return next; }); setEngagementMessage(""); } }} style={{ ...inputStyle, ...(confirmationErrors.confirmedOn ? invalidEngagementInputStyle : {}) }} />{confirmationErrors.confirmedOn ? <span style={engagementFieldErrorStyle}>{confirmationErrors.confirmedOn}</span> : null}</label>
                    <label style={labelStyle}>ช่องทางการยืนยัน *<select ref={confirmationChannelRef} value={confirmationForm.channel} aria-invalid={Boolean(confirmationErrors.channel)} onChange={(event) => { const channel = event.target.value; setConfirmationForm({ ...confirmationForm, channel }); if (channel) { setConfirmationErrors((current) => { const next = { ...current }; delete next.channel; return next; }); setEngagementMessage(""); } }} style={{ ...inputStyle, ...(confirmationErrors.channel ? invalidEngagementInputStyle : {}) }}><option value="">เลือกช่องทาง</option><option value="line">LINE</option><option value="email">Email</option><option value="phone">โทรศัพท์</option><option value="meeting">นัด/ประชุม</option><option value="written">หนังสือ/ข้อความเป็นลายลักษณ์อักษร</option><option value="other">อื่น ๆ</option></select>{confirmationErrors.channel ? <span style={engagementFieldErrorStyle}>{confirmationErrors.channel}</span> : null}</label>
                    <label style={wideLabelStyle}>หมายเหตุ (ถ้ามี)<textarea value={confirmationForm.note} maxLength={4000} onChange={(event) => setConfirmationForm({ ...confirmationForm, note: event.target.value })} style={textareaStyle} /></label>
                  </div>
                  <div style={engagementConfirmationActionsStyle}><button type="button" onClick={() => { setEngagementChoice(null); setConfirmationErrors({}); setEngagementMessage(""); }} disabled={saving} style={secondaryButtonStyle}>ยกเลิก</button><button type="button" onClick={() => void confirmAcceptedQuotationEngagement()} disabled={saving} style={primaryButtonStyle}>{saving ? "กำลังยืนยัน..." : "ยืนยันการว่าจ้างตามใบเสนอราคา"}</button></div>
                </div> : null}
              </>}
            </div>
          ) : null}

          <div style={cardStyle}>
            <div style={detailGridStyle}>
              <Detail label="Status" value={<StatusBadge status={quotation.status} />} />
              <Detail label="ลูกค้า / Customer" value={renderQuotationClientName(quotation, lookups.clients)} />
              <Detail label="ที่มาลูกค้า" value={quotation.customer_source_type === "prospect" || (!quotation.client_id && getSnapshotString(quotation.client_snapshot_json, "source_type") === "prospect") ? "ลูกค้าใหม่ / ผู้มุ่งหวัง" : "ลูกค้าในระบบ"} />
              {quotation.customer_source_type === "prospect" || getSnapshotString(quotation.client_snapshot_json, "source_type") === "prospect" ? <>
                <Detail label="ผู้ติดต่อ" value={quotation.prospect_contact_person || getSnapshotString(quotation.client_snapshot_json, "contact_person") || "-"} />
                <Detail label="โทรศัพท์" value={quotation.prospect_phone || getSnapshotString(quotation.client_snapshot_json, "phone") || "-"} />
                <Detail label="อีเมล" value={quotation.prospect_email || getSnapshotString(quotation.client_snapshot_json, "email") || "-"} />
                <Detail label="เลขประจำตัวผู้เสียภาษี" value={quotation.prospect_tax_id || getSnapshotString(quotation.client_snapshot_json, "tax_id") || "-"} />
                <Detail label="ที่อยู่" value={quotation.prospect_address || getSnapshotString(quotation.client_snapshot_json, "address") || "-"} />
              </> : null}
              <Detail label="Linked Matter" value={renderMatterLink(quotation, lookups)} />
              {!quotation.case_id && !quotation.advisory_matter_id ? <Detail label="รายละเอียดเรื่อง / งาน" value={quotation.unlinked_matter_description || getSnapshotString(quotation.matter_snapshot_json, "description") || "-"} /> : null}
              <Detail label="Issue Date" value={formatDate(quotation.issue_date)} />
              <Detail label="Valid Until" value={formatDate(quotation.valid_until)} />
              <Detail label="ยอดสุทธิที่ลูกค้าชำระ / Amount Payable" value={formatMoney(toAmount(quotation.grand_total))} />
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
                      <td style={rightTdStyle}><strong>{formatMoney(toAmount(item.line_total))}</strong><LineItemVatExplanation item={item} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <QuotationFinancialSummary subtotalVatable={toAmount(quotation.subtotal_vatable)} subtotalNonVatable={toAmount(quotation.subtotal_non_vatable)} vatAmount={toAmount(quotation.vat_amount)} grandTotal={toAmount(quotation.grand_total)} />
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
  const [clientsRes, casesRes, mattersRes, companyRes, signersRes, patternsRes, preservedSignerRes] = await Promise.all([
    supabase.from("clients").select("id, client_type, name, tax_id, email, phone, address").order("name", { ascending: true }),
    supabase.from("cases").select("id, file_no, title, client_name").order("created_at", { ascending: false }),
    supabase.from("advisory_matters").select("id, matter_no, title").order("created_at", { ascending: false }),
    supabase.from("finance_company_profiles").select("*").eq("id", "default").maybeSingle(),
    supabase.from("finance_authorized_signers").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("finance_quotation_service_patterns").select("id, pattern_code, display_name, category, short_description, scope_text, included_services_text, excluded_services_text, is_active, sort_order").eq("is_active", true).order("sort_order", { ascending: true }).order("display_name", { ascending: true }),
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
  if (patternsRes.error) console.warn("Unable to load quotation service patterns", { error: patternsRes.error });

  return {
    clients: (clientsRes.data || []) as ClientRow[],
    cases: (casesRes.data || []) as CaseRow[],
    matters: (mattersRes.data || []) as MatterRow[],
    companyProfile: normalizeCompanyProfile((companyRes.data || null) as DbCompanyProfile | null),
    signers: signers.length > 0 ? signers : AUTHORIZED_SIGNERS,
    servicePatterns: patternsRes.error ? [] : (patternsRes.data || []) as ServicePatternRow[],
  };
}

function getEmptyLookups(): LookupState {
  return {
    clients: [],
    cases: [],
    matters: [],
    companyProfile: normalizeCompanyProfile(null),
    signers: AUTHORIZED_SIGNERS,
    servicePatterns: [],
  };
}

function validateForm(form: FormState, items: QuotationItemRow[]) {
  if (form.customer_mode === "existing_client" && !form.client_id) return "กรุณาเลือกลูกค้าในระบบ";
  if (form.customer_mode === "prospect" && !form.prospect_name.trim()) return "กรุณาระบุชื่อบุคคลหรือบริษัทของลูกค้าใหม่";
  if (!form.issue_date) return "Please select issue date.";
  if (form.valid_until && form.valid_until < form.issue_date) return "Valid until cannot be before issue date.";
  if (form.matter_mode === "case" && !form.case_id) return "กรุณาเลือก Case";
  if (form.matter_mode === "advisory" && !form.advisory_matter_id) return "กรุณาเลือก Advisory";
  if (form.case_id && form.advisory_matter_id) return "Select either case or advisory matter, not both.";
  if (!form.authorized_signer_key) return "Please select authorized signer.";
  if (items.length === 0) return "Please add at least one line item.";
  for (const item of items) {
    if (!item.description.trim()) return "Every line item needs a description.";
    if (!item.economic_classification) return "กรุณาระบุประเภทของยอดสำหรับทุกรายการ";
    if (!item.unit.trim()) return "กรุณาระบุหน่วยสำหรับทุกรายการ";
    if (toAmount(item.quantity) <= 0) return "Quantity must be greater than zero.";
    if (toAmount(item.unit_price) < 0) return "Unit price cannot be negative.";
  }
  return "";
}

function validateDraftSavePayload(payload: Record<string, unknown>, totals: ReturnType<typeof computeTotals>) {
  const requiredStrings = ["p_quotation_id", "p_issue_date", "p_authorized_signer_key"];
  if (requiredStrings.some((key) => typeof payload[key] !== "string" || !String(payload[key]).trim())) return "Required quotation fields are missing.";
  const clientSnapshot = payload.p_client_snapshot_json && typeof payload.p_client_snapshot_json === "object"
    ? payload.p_client_snapshot_json as Record<string, unknown>
    : {};
  if (!payload.p_client_id && (clientSnapshot.source_type !== "prospect" || !String(clientSnapshot.name || "").trim())) return "Prospect identity is missing.";
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
      || typeof row.unit !== "string" || !row.unit.trim()
      || typeof row.economic_classification !== "string" || !quotationEconomicClassificationIds.has(row.economic_classification)
      || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0
      || !Number.isFinite(Number(row.unit_price)) || Number(row.unit_price) < 0
      || !Number.isFinite(Number(row.amount_before_tax)) || !Number.isFinite(Number(row.vat_amount)) || !Number.isFinite(Number(row.line_total));
  });
  return hasInvalidItem ? "Quotation contains an invalid line item." : "";
}

function getQuotationDraftSaveErrorMessage(error: { code?: string | null; message?: string | null }) {
  const message = error.message || "";
  if (error.code === "23503" || /already used in Payment Terms|downstream documents|Payment Terms exist/i.test(message)) {
    return /commercial amounts/i.test(message)
      ? "ไม่สามารถแก้ไขยอดของรายการนี้ได้ เนื่องจากเงื่อนไขการชำระเงินอ้างอิงยอดเดิมอยู่ กรุณาปรับรายการและเงื่อนไขการชำระเงินให้สอดคล้องกัน"
      : /Payment Terms exist/i.test(message)
        ? "ไม่สามารถเพิ่มหรือลบรายการได้ เนื่องจากมีเงื่อนไขการชำระเงินอยู่ กรุณาปรับเงื่อนไขการชำระเงินก่อน"
      : "ไม่สามารถลบรายการนี้ได้ เนื่องจากถูกนำไปใช้ในเงื่อนไขการชำระเงินแล้ว กรุณาปรับเงื่อนไขการชำระเงินก่อน";
  }
  return "บันทึกข้อมูลใบเสนอราคาไม่สำเร็จ";
}

function getQuotationStatusErrorMessage(error: { message?: string | null }) {
  const message = String(error.message || "").toLowerCase();
  if (message.includes("prospect identity")) return "ข้อมูลลูกค้าใหม่ยังไม่ครบ กรุณากลับไปแก้ไขร่างใบเสนอราคา";
  if (message.includes("payment terms are required")) return "ยังไม่ได้กำหนดเงื่อนไขการชำระเงิน";
  if (message.includes("percentage payment installments")) return "สัดส่วนการชำระเงินยังไม่ครบ 100%";
  if (message.includes("payment terms totals") || message.includes("payment allocation") || message.includes("quotation totals")) return "ยอดเงื่อนไขการชำระเงินไม่ตรงกับยอดใบเสนอราคา";
  if (message.includes("installment") || message.includes("trigger data")) return "กรุณากรอกข้อมูลแต่ละงวดให้ครบก่อนส่งใบเสนอราคา";
  return "ไม่สามารถเปลี่ยนสถานะใบเสนอราคาได้ กรุณาตรวจสอบข้อมูลก่อนส่ง";
}

function buildQuotationSnapshots(
  form: FormState,
  items: QuotationItemRow[],
  totals: ReturnType<typeof computeTotals>,
  lookups: LookupState,
  quotationNo: string
) {
  const client = lookups.clients.find((item) => item.id === form.client_id);
  const caseItem = form.matter_mode === "case" && form.case_id ? lookups.cases.find((item) => String(item.id) === String(form.case_id)) : null;
  const matter = form.matter_mode === "advisory" && form.advisory_matter_id ? lookups.matters.find((item) => item.id === form.advisory_matter_id) : null;
  const signer = getSignerByKey(lookups.signers, form.authorized_signer_key);
  const signerPosition = formatSignerPosition(signer);
  const normalizedItems = items.map((item, index) => normalizeItem(item, index));

  const clientSnapshot: Record<string, unknown> = form.customer_mode === "prospect"
    ? {
        source_type: "prospect",
        id: null,
        name: form.prospect_name.trim(),
        client_type: null,
        client_display_name: form.prospect_name.trim(),
        contact_person: form.prospect_contact_person.trim() || null,
        tax_id: form.prospect_tax_id.trim() || null,
        email: form.prospect_email.trim() || null,
        phone: form.prospect_phone.trim() || null,
        address: form.prospect_address.trim() || null,
      }
    : {
        source_type: "existing_client",
        id: form.client_id,
        name: client?.name || null,
        client_type: client?.client_type || null,
        client_display_name: getQuotationClientDisplayName(client?.name, client?.client_type),
        tax_id: client?.tax_id || null,
        email: client?.email || null,
        phone: client?.phone || null,
        address: client?.address || null,
      };

  const matterSnapshot: Record<string, unknown> | null = form.matter_mode === "unlinked"
    ? {
        source_type: "unlinked",
        type: "unlinked",
        title: form.unlinked_matter_name.trim() || null,
        description: form.unlinked_matter_description.trim() || null,
      }
    : caseItem
    ? {
        source_type: "case",
        type: "case",
        id: caseItem.id,
        file_no: caseItem.file_no || null,
        title: caseItem.title || null,
        client_name: caseItem.client_name || null,
      }
    : matter
      ? {
          source_type: "advisory",
          type: "advisory",
          id: matter.id,
          matter_no: matter.matter_no || null,
          title: matter.title || null,
        }
      : form.matter_mode === "case" && form.case_id
        ? { source_type: "case", type: "case", id: form.case_id }
        : form.matter_mode === "advisory" && form.advisory_matter_id
          ? { source_type: "advisory", type: "advisory", id: form.advisory_matter_id }
          : { source_type: "unlinked", type: "unlinked", title: null, description: null };

  return {
    clientSnapshot,
    matterSnapshot,
    documentSnapshot: {
      document_type: "quotation",
      quotation_no: quotationNo || null,
      customer_source_type: form.customer_mode,
      client_id: form.customer_mode === "existing_client" ? form.client_id : null,
      matter_source_type: form.matter_mode,
      case_id: form.matter_mode === "case" && form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.matter_mode === "advisory" ? form.advisory_matter_id || null : null,
      client: clientSnapshot,
      matter: matterSnapshot,
      issue_date: form.issue_date,
      valid_until: form.valid_until || null,
      scope_of_legal_services: form.scope_of_legal_services.trim() || null,
      included_services: form.included_services.trim() || null,
      excluded_services: form.excluded_services.trim() || null,
      service_pattern_id: form.service_pattern_id || null,
      service_pattern_code: form.service_pattern_code || null,
      service_pattern_name: form.service_pattern_name || null,
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
        unit: item.unit.trim(),
        economic_classification: item.economic_classification,
        quantity: toAmount(item.quantity),
        unit_price: toAmount(item.unit_price),
        amount_before_tax: toAmount(item.amount_before_tax),
        vat_applicable: item.vat_applicable,
        price_tax_mode: item.price_tax_mode,
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
    const payload = {
      quotation_id: quotationId,
      description: normalized.description.trim(),
      unit: normalized.unit.trim(),
      economic_classification: normalized.economic_classification,
      quantity: toAmount(normalized.quantity),
      unit_price: toAmount(normalized.unit_price),
      amount_before_tax: toAmount(normalized.amount_before_tax),
      vat_applicable: normalized.vat_applicable,
      price_tax_mode: normalized.price_tax_mode,
      vat_rate: toAmount(normalized.vat_rate),
      vat_amount: toAmount(normalized.vat_amount),
      line_total: toAmount(normalized.line_total),
      sort_order: index,
    };
    // Omit id for new rows so PostgreSQL applies gen_random_uuid(); never send id: null.
    return normalized.id
      ? { ...payload, id: normalized.id }
      : { ...payload, client_item_key: normalized.client_item_key };
  });
}

function buildAtomicPaymentInstallments(method: PaymentMethodType, allocationMode: PaymentAllocationMode, installments: PaymentInstallment[], quotationItems: QuotationItemRow[]) {
  return installments.map((installment, index) => ({
    allocation_mode: allocationMode,
    installment_no: index + 1,
    title: installment.title,
    calculation_type: allocationMode === "per_item" ? "percentage" : installment.calculation_type,
    percentage: allocationMode === "per_item" ? 100 : installment.calculation_type === "percentage" ? normalizePercentage(installment.percentage) : null,
    trigger_type: getForcedPaymentTrigger(method) || installment.trigger_type,
    trigger_description: installment.trigger_description || null,
    due_date: installment.due_date || null,
    payment_due_days: normalizePaymentDueDays(installment.payment_due_days),
    client_note: installment.client_note || null,
    sort_order: index,
    items: allocationMode === "proportional_all_items" && installment.calculation_type === "percentage"
      ? quotationItems.map((item, itemIndex) => ({ client_item_key: item.client_item_key, sort_order: itemIndex }))
      : installment.items.filter((allocation) => allocationMode !== "per_item" || toAmount(allocation.allocation_percentage || 0) > 0).map((allocation, itemIndex) => ({
        client_item_key: allocation.client_item_key,
        allocated_amount_before_tax: allocation.allocated_amount_before_tax,
        allocated_vat_amount: allocation.allocated_vat_amount,
        allocated_total: allocation.allocated_total,
        allocation_percentage: allocation.allocation_percentage,
        sort_order: itemIndex,
      })),
  }));
}

function buildAtomicEditPaymentInstallments(method: PaymentMethodType, allocationMode: PaymentAllocationMode, installments: PaymentInstallment[], quotationItems: QuotationItemRow[]) {
  const itemReference = (item: QuotationItemRow | PaymentAllocation) => (
    "quotation_item_id" in item && item.quotation_item_id
      ? { quotation_item_id: item.quotation_item_id }
      : "id" in item && item.id
        ? { quotation_item_id: item.id }
        : { client_item_key: item.client_item_key }
  );

  return installments.map((installment, index) => ({
    allocation_mode: allocationMode,
    installment_no: index + 1,
    title: installment.title,
    calculation_type: allocationMode === "per_item" ? "percentage" : installment.calculation_type,
    // Required only by the legacy installment constraint in per-item mode.
    percentage: allocationMode === "per_item" ? 100 : installment.calculation_type === "percentage" ? normalizePercentage(installment.percentage) : null,
    trigger_type: getForcedPaymentTrigger(method) || installment.trigger_type,
    trigger_description: installment.trigger_description || null,
    due_date: installment.due_date || null,
    payment_due_days: normalizePaymentDueDays(installment.payment_due_days),
    client_note: installment.client_note || null,
    sort_order: index,
    items: allocationMode === "proportional_all_items" && installment.calculation_type === "percentage"
      ? quotationItems.map((item, itemIndex) => ({ ...itemReference(item), sort_order: itemIndex }))
      : installment.items
        .filter((allocation) => allocationMode !== "per_item" || toAmount(allocation.allocation_percentage || 0) > 0)
        .map((allocation, itemIndex) => ({
          ...itemReference(allocation),
          allocated_amount_before_tax: allocation.allocated_amount_before_tax,
          allocated_vat_amount: allocation.allocated_vat_amount,
          allocated_total: allocation.allocated_total,
          allocation_percentage: allocation.allocation_percentage,
          sort_order: itemIndex,
        })),
  }));
}

function getAtomicEditPaymentAllocationMappingError(
  items: QuotationItemRow[],
  installments: Array<{ items?: Array<{ quotation_item_id?: string; client_item_key?: string }> }>,
) {
  const itemIds = new Set(items.map((item) => item.id).filter((id): id is string => Boolean(id)));
  const itemKeys = new Set(items.map((item) => item.client_item_key).filter((key): key is string => Boolean(key)));
  const unresolvedNewItem = items.find((item) => !item.id && !item.client_item_key);
  if (unresolvedNewItem) {
    return {
      message: `ไม่สามารถจับคู่รายการ ${unresolvedNewItem.description.trim() || "ค่าบริการใหม่"} กับเงื่อนไขการชำระเงินได้`,
      issue: { message: "", itemReference: "", installmentIndex: 0 },
    };
  }

  for (const [installmentIndex, installment] of installments.entries()) {
    const staleAllocation = (installment.items || []).find((allocation) => (
      allocation.quotation_item_id
        ? !itemIds.has(allocation.quotation_item_id)
        : !allocation.client_item_key || !itemKeys.has(allocation.client_item_key)
    ));
    if (staleAllocation) {
      return {
        message: `งวดที่ ${installmentIndex + 1} มีข้อมูลจัดสรรที่ไม่ตรงกับรายการค่าบริการปัจจุบัน`,
        issue: { message: "", itemReference: staleAllocation.quotation_item_id || staleAllocation.client_item_key, installmentIndex },
      };
    }
  }
  return null;
}

function getAtomicPaymentAllocationMappingError(
  items: Array<{ client_item_key?: string }>,
  installments: Array<{ items?: Array<{ client_item_key?: string }> }>,
) {
  const itemKeys = items.map((item) => item.client_item_key || "");
  if (itemKeys.some((key) => !key) || new Set(itemKeys).size !== itemKeys.length) {
    return {
      message: "พบรายการค่าบริการที่ไม่สามารถจับคู่กับเงื่อนไขการชำระเงินได้",
      issue: { message: "", installmentIndex: 0, field: "title" as const },
    };
  }
  for (const [installmentIndex, installment] of installments.entries()) {
    if ((installment.items || []).some((allocation) => !allocation.client_item_key || !itemKeys.includes(allocation.client_item_key))) {
      return {
        message: "พบรายการในเงื่อนไขการชำระเงินที่ไม่ตรงกับรายการค่าบริการ",
        issue: { message: "", installmentIndex, field: "trigger" as const },
      };
    }
  }
  return null;
}

function getAtomicDraftCreateErrorMessage(error: { message?: string | null } | null) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("prospect name")) return "กรุณาระบุชื่อบุคคลหรือบริษัทของลูกค้าใหม่";
  if (message.includes("quotation client not found")) return "ไม่พบลูกค้าที่เลือกในระบบ กรุณาเลือกใหม่";
  if (message.includes("invalid line items")) return "กรุณากรอกรายการค่าบริการให้ครบถ้วน";
  if (message.includes("allocation item") || message.includes("client item key")) return "พบรายการในเงื่อนไขการชำระเงินที่ไม่ตรงกับรายการค่าบริการ กรุณาตรวจสอบอีกครั้ง";
  if (message.includes("invalid installment data")) return "กรุณากรอกข้อมูลของแต่ละงวดให้ครบถ้วน";
  if (message.includes("at least two non-recurring installments")) return "การแบ่งชำระหลายงวดต้องมีอย่างน้อยสองงวด และห้ามใช้ Trigger แบบ Recurring period";
  if (message.includes("milestone payment terms require") || message.includes("recurring payment terms require") || message.includes("manual payment terms require")) return "วิธีการชำระเงินและเงื่อนไขการเรียกเก็บไม่สอดคล้องกัน กรุณาตรวจสอบแต่ละงวด";
  if (message.includes("percentage") && message.includes("exceed")) return "สัดส่วนการชำระเงินรวมต้องไม่เกิน 100%";
  return "สร้างร่างใบเสนอราคาไม่สำเร็จ ข้อมูลยังไม่ถูกบันทึก";
}

function getAtomicDraftEditErrorMessage(error: { code?: string | null; message?: string | null } | null) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("allocation item") || message.includes("could not be mapped")) return "พบรายการในเงื่อนไขการชำระเงินที่ไม่ตรงกับรายการค่าบริการ กรุณาตรวจสอบอีกครั้ง";
  if (message.includes("invalid installment data") || message.includes("invalid payment terms")) return "กรุณาตรวจสอบข้อมูลงวดและการจัดสรรค่าบริการ";
  if (message.includes("percentage") && (message.includes("exceed") || message.includes("invalid"))) return "กรุณาตรวจสอบสัดส่วนการจัดสรรของแต่ละรายการ";
  if (message.includes("only draft")) return "ใบเสนอราคานี้ไม่อยู่ในสถานะร่าง จึงไม่สามารถแก้ไขได้";
  if (message.includes("not allowed")) return "คุณไม่มีสิทธิ์บันทึกใบเสนอราคานี้";
  return getQuotationDraftSaveErrorMessage(error || {});
}

function getSafeAtomicDraftPayloadDiagnostic(payload: object) {
  const value = payload as {
    p_client_id?: string | null;
    p_case_id?: number | null;
    p_advisory_matter_id?: string | null;
    p_issue_date?: string | null;
    p_valid_until?: string | null;
    p_payment_method_type?: string | null;
    p_allocation_mode?: string | null;
    p_items?: Array<Record<string, unknown>>;
    p_installments_json?: Array<Record<string, unknown>>;
  };
  return {
    clientIdPresent: Boolean(value.p_client_id),
    caseIdPresent: Boolean(value.p_case_id),
    advisoryMatterIdPresent: Boolean(value.p_advisory_matter_id),
    issueDate: value.p_issue_date || null,
    validUntil: value.p_valid_until || null,
    paymentMethodType: value.p_payment_method_type || null,
    allocationMode: value.p_allocation_mode || null,
    itemCount: (value.p_items || []).length,
    installmentCount: (value.p_installments_json || []).length,
    items: (value.p_items || []).map((item) => ({
      id: item.id || null,
      client_item_key: item.client_item_key || null,
      quantity: item.quantity || null,
      unit_price: item.unit_price || null,
      vat_applicable: item.vat_applicable === true,
      vat_rate: item.vat_rate || null,
      sort_order: item.sort_order || 0,
      has_description: Boolean(String(item.description || "").trim()),
    })),
    installments: (value.p_installments_json || []).map((installment) => ({
      installment_no: installment.installment_no || null,
      title: installment.title || null,
      calculation_type: installment.calculation_type || null,
      percentage: installment.percentage ?? null,
      trigger_type: installment.trigger_type || null,
      has_trigger_description: Boolean(String(installment.trigger_description || "").trim()),
      due_date: installment.due_date || null,
      payment_due_days: installment.payment_due_days ?? null,
      allocation_item_references: Array.isArray(installment.items)
        ? installment.items.map((allocation) => {
          if (!allocation || typeof allocation !== "object") return null;
          const row = allocation as Record<string, unknown>;
          return row.quotation_item_id || row.client_item_key || null;
        })
        : [],
    })),
  };
}

function getForcedPaymentTrigger(method: PaymentMethodType): PaymentTriggerType | null {
  if (method === "single") return "quotation_acceptance";
  if (method === "milestone") return "case_milestone";
  if (method === "recurring") return "recurring_period";
  if (method === "manual") return "manual";
  return null;
}

function paymentReferenceForItem(item: QuotationItemRow) {
  return item.id || item.client_item_key || "";
}

function paymentAllocationReference(allocation: PaymentAllocation) {
  return allocation.quotation_item_id || allocation.client_item_key || "";
}

function normalizeItem(item: QuotationItemRow, index: number): QuotationItemRow {
  const quantity = toAmount(item.quantity);
  const unitPrice = toAmount(item.unit_price);
  const priceTaxMode: NonNullable<QuotationItemRow["price_tax_mode"]> = item.price_tax_mode || (item.vat_applicable ? "vat_exclusive" : "non_vat");
  const vatApplicable = priceTaxMode !== "non_vat";
  const vatRate = vatApplicable ? (toAmount(item.vat_rate) || 7) : 0;
  const amounts = calculateFinanceLineAmounts(quantity, unitPrice, priceTaxMode, vatRate);
  return {
    ...item,
    quantity,
    unit_price: unitPrice,
    price_tax_mode: priceTaxMode,
    vat_applicable: vatApplicable,
    amount_before_tax: amounts.amountBeforeVat,
    vat_rate: vatRate,
    vat_amount: amounts.vatAmount,
    line_total: amounts.totalAmount,
    sort_order: index,
  };
}

function computeTotals(items: QuotationItemRow[]) {
  const normalizedItems = items.map((item, index) => normalizeItem(item, index));
  const subtotalVatable = roundMoney(normalizedItems.reduce((sum, item) => sum + (item.price_tax_mode !== "non_vat" ? toAmount(item.amount_before_tax) : 0), 0));
  const subtotalNonVatable = roundMoney(normalizedItems.reduce((sum, item) => sum + (!item.vat_applicable ? toAmount(item.amount_before_tax) : 0), 0));
  const vatAmount = roundMoney(normalizedItems.reduce((sum, item) => sum + toAmount(item.vat_amount), 0));
  return {
    subtotalVatable,
    subtotalNonVatable,
    vatAmount,
    grandTotal: roundMoney(subtotalVatable + subtotalNonVatable + vatAmount),
  };
}

function QuotationFinancialSummary({ subtotalVatable, subtotalNonVatable, vatAmount, grandTotal }: { subtotalVatable: number; subtotalNonVatable: number; vatAmount: number; grandTotal: number }) {
  const serviceValueBeforeVat = roundMoney(subtotalVatable + subtotalNonVatable);
  return <div style={totalsGridStyle}>
    <SummaryLine label="มูลค่าบริการก่อน VAT / Service Value Before VAT" value={serviceValueBeforeVat} prominent />
    <SummaryLine label="รายการไม่อยู่ในบังคับ VAT / Non-VAT Service Value" value={subtotalNonVatable} indented />
    <SummaryLine label="ฐานภาษีของรายการที่มี VAT / VAT Taxable Base" value={subtotalVatable} indented />
    <SummaryLine label="ภาษีมูลค่าเพิ่ม / VAT" value={vatAmount} tax />
    <SummaryLine label="ยอดสุทธิที่ลูกค้าชำระ / Amount Payable" value={grandTotal} strong />
  </div>;
}

function SummaryLine({ label, value, strong = false, prominent = false, indented = false, tax = false }: { label: string; value: number; strong?: boolean; prominent?: boolean; indented?: boolean; tax?: boolean }) {
  const style = strong ? totalLineStyle : prominent ? summaryProminentLineStyle : indented ? summaryBreakdownLineStyle : tax ? summaryTaxLineStyle : summaryLineStyle;
  return (
    <div style={style}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

function LineItemVatExplanation({ item }: { item: QuotationItemRow }) {
  const mode = item.price_tax_mode || (item.vat_applicable ? "vat_exclusive" : "non_vat");
  if (mode === "non_vat") return <div style={lineItemTaxExplanationStyle}>ไม่อยู่ในบังคับ VAT</div>;
  if (mode === "vat_inclusive") return <div style={lineItemTaxExplanationStyle}>ฐาน {formatMoney(toAmount(item.amount_before_tax))} + VAT {formatMoney(toAmount(item.vat_amount))} = รวม {formatMoney(toAmount(item.line_total))} (รวม VAT แล้ว)</div>;
  return <div style={lineItemTaxExplanationStyle}>ฐาน {formatMoney(toAmount(item.amount_before_tax))} + VAT {formatMoney(toAmount(item.vat_amount))} = รวม {formatMoney(toAmount(item.line_total))}</div>;
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
  if (normalized === "accepted") return "ลูกค้าตอบรับใบเสนอราคานี้แล้ว เอกสารจึงเป็นแบบอ่านอย่างเดียว หากต้องเปลี่ยนเงื่อนไข ให้ยกเลิกและจัดทำใบเสนอราคาใหม่ การดูตัวอย่างและการพิมพ์จะใช้ข้อมูลที่บันทึกไว้ ณ เวลาส่งใบเสนอราคา";
  if (normalized === "cancelled") return "ใบเสนอราคานี้ถูกยกเลิกแล้วและเป็นแบบอ่านอย่างเดียว การดูตัวอย่างและการพิมพ์จะใช้ข้อมูลที่บันทึกไว้ ณ เวลาส่งใบเสนอราคา";
  if (normalized === "sent") return "ใบเสนอราคานี้ส่งให้ลูกค้าแล้ว จึงไม่สามารถแก้ไขรายการหรือเงื่อนไขเดิมได้ หากต้องเปลี่ยนเงื่อนไข ให้ยกเลิกและจัดทำใบเสนอราคาใหม่ การดูตัวอย่างและการพิมพ์จะใช้ข้อมูลที่บันทึกไว้ ณ เวลาส่งใบเสนอราคา";
  return "แก้ไขข้อมูลได้เฉพาะใบเสนอราคาที่ยังเป็นร่างเท่านั้น";
}

function getCanonicalQuotationMatterLink(quotation: Pick<QuotationRow, "case_id" | "advisory_matter_id">) {
  if (quotation.case_id) {
    return { mode: "case" as const, caseId: String(quotation.case_id), advisoryMatterId: "" };
  }
  if (quotation.advisory_matter_id) {
    return { mode: "advisory" as const, caseId: "", advisoryMatterId: quotation.advisory_matter_id };
  }
  return { mode: "unlinked" as const, caseId: "", advisoryMatterId: "" };
}

function renderMatterLink(quotation: Pick<QuotationRow, "case_id" | "advisory_matter_id" | "matter_snapshot_json" | "unlinked_matter_name">, lookups: LookupState) {
  if (quotation.case_id) {
    const caseItem = lookups.cases.find((item) => String(item.id) === String(quotation.case_id));
    return caseItem ? `Case: ${renderCaseLabel(caseItem)}` : `Case: ${quotation.case_id}`;
  }
  if (quotation.advisory_matter_id) {
    const matter = lookups.matters.find((item) => item.id === quotation.advisory_matter_id);
    return matter ? `Advisory: ${renderMatterLabel(matter)}` : `Advisory: ${quotation.advisory_matter_id}`;
  }
  return quotation.unlinked_matter_name || getSnapshotString(quotation.matter_snapshot_json, "title") || "ยังไม่ผูกเรื่องในระบบ";
}

function renderQuotationClientName(quotation: Pick<QuotationRow, "client_id" | "client_snapshot_json" | "prospect_name">, clients: ClientRow[]) {
  return clients.find((client) => client.id === quotation.client_id)?.name
    || quotation.prospect_name
    || getSnapshotString(quotation.client_snapshot_json, "client_display_name")
    || getSnapshotString(quotation.client_snapshot_json, "name")
    || quotation.client_id
    || "-";
}

function renderCaseLabel(item: CaseRow) {
  return [item.file_no, item.title || item.client_name].filter(Boolean).join(" - ") || String(item.id);
}

function renderMatterLabel(item: MatterRow) {
  return [item.matter_no, item.title].filter(Boolean).join(" - ") || item.id;
}

function getSnapshotString(snapshot: Record<string, unknown> | null | undefined, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" ? value : "";
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

function getBangkokDateKey() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function mapAcceptedEngagementError(message: string) {
  if (message.includes("confirmation date is required")) return "กรุณาระบุวันที่ลูกค้ายืนยันว่าจ้าง";
  if (message.includes("future")) return "วันที่ลูกค้ายืนยันว่าจ้างต้องไม่เป็นวันที่ในอนาคต";
  if (message.includes("channel")) return "กรุณาเลือกช่องทางการยืนยันให้ถูกต้อง";
  if (message.includes("note must not exceed")) return "หมายเหตุการยืนยันต้องไม่เกิน 4,000 ตัวอักษร";
  if (message.includes("Quotation not found")) return "ไม่พบใบเสนอราคานี้ กรุณากลับไปที่รายการใบเสนอราคา";
  if (message.includes("Link this accepted prospect quotation")) return "กรุณาเชื่อมใบเสนอราคากับลูกค้าในระบบก่อนยืนยันการว่าจ้าง";
  if (message.includes("no frozen document snapshot")) return "ไม่พบ snapshot ของใบเสนอราคาที่ตอบรับ กรุณาติดต่อผู้ดูแลระบบ";
  if (message.includes("Linked Client not found")) return "ไม่พบลูกค้าที่เชื่อมกับใบเสนอราคานี้ กรุณาตรวจสอบข้อมูลลูกค้า";
  if (message.includes("Linked Case not found")) return "ไม่พบ Case ที่เชื่อมกับใบเสนอราคานี้ กรุณาตรวจสอบข้อมูลเรื่อง/งาน";
  if (message.includes("Linked Advisory matter not found")) return "ไม่พบ Advisory ที่เชื่อมกับใบเสนอราคานี้ กรุณาตรวจสอบข้อมูลเรื่อง/งาน";
  if (message.includes("Conflicting commercial engagements")) return "พบข้อมูลการว่าจ้างมากกว่าหนึ่งรายการสำหรับใบเสนอราคานี้ กรุณาติดต่อผู้ดูแลระบบก่อนดำเนินการต่อ";
  if (message.includes("already exists with different")) return "มีการบันทึกการว่าจ้างนี้แล้วด้วยข้อมูลยืนยันที่ต่างกัน กรุณารีเฟรชเพื่อตรวจสอบรายการเดิม";
  if (message.includes("formal Fee Agreement") || message.includes("formal Fee Agreement already exists")) return "ใบเสนอราคานี้มีสัญญาว่าจ้างอยู่แล้ว กรุณาเปิดรายการเดิม";
  if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์ยืนยันการว่าจ้างรายการนี้";
  if (message.includes("Only accepted")) return "ใบเสนอราคาไม่ได้อยู่ในสถานะตอบรับแล้ว กรุณารีเฟรชหน้า";
  return "ยืนยันการว่าจ้างไม่สำเร็จ กรุณารีเฟรชและลองอีกครั้ง";
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
const installmentAmountSummaryStyle: CSSProperties = { display: "grid", gap: 8, padding: "12px 14px", marginBottom: 14, border: "1px solid #bbf7d0", borderRadius: 6, background: "#f0fdf4", color: "#166534", fontSize: 13 };
const installmentPercentageStyle: CSSProperties = { marginLeft: 10, color: "#374151", fontWeight: 600 };
const installmentAmountGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, color: "#4b5563" };
const perItemMatrixListStyle: CSSProperties = { display: "grid", gap: 12, marginTop: 14 };
const perItemMatrixRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, alignItems: "start", borderTop: "1px solid #e5e7eb", paddingTop: 12, scrollMarginTop: 96 };
const perItemMatrixItemStyle: CSSProperties = { display: "grid", gap: 5, minWidth: 0 };
const perItemDescriptionStyle: CSSProperties = { color: "#111827", fontSize: 14, overflowWrap: "anywhere" };
const perItemInstallmentGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, minWidth: 0 };
const allocationStatusPanelStyle: CSSProperties = { display: "grid", gap: 3, marginTop: 16, padding: "11px 13px", borderLeft: "4px solid", borderRadius: 4, fontSize: 13 };
const allocationStatusCompleteStyle: CSSProperties = { color: "#166534", borderColor: "#16a34a", background: "#f0fdf4" };
const allocationStatusIncompleteStyle: CSSProperties = { color: "#92400e", borderColor: "#f59e0b", background: "#fffbeb" };
const allocationStatusErrorStyle: CSSProperties = { color: "#991b1b", borderColor: "#dc2626", background: "#fef2f2" };
const allocationStatusLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 700 };
const allocationStatusHeadingStyle: CSSProperties = { fontSize: 15 };
const allocationStatusDetailStyle: CSSProperties = { fontWeight: 600, lineHeight: 1.5, overflowWrap: "anywhere" };
const paymentSummarySectionStyle: CSSProperties = { display: "grid", gap: 12, marginTop: 18, paddingTop: 18, borderTop: "1px solid #d1d5db", minWidth: 0 };
const paymentSummaryOutputStyle: CSSProperties = { padding: "13px 14px", borderLeft: "4px solid #64748b", background: "#f8fafc", color: "#1f2937", fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
const paymentSummaryOverrideNoticeStyle: CSSProperties = { color: "#92400e", background: "#fffbeb", borderLeft: "4px solid #f59e0b", padding: "9px 11px", margin: 0, fontSize: 12, fontWeight: 600, lineHeight: 1.5 };
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
const wideFieldGroupStyle: CSSProperties = { gridColumn: "1 / -1", minWidth: 0, display: "grid", gap: 12, paddingBottom: 4 };
const fieldHeadingStyle: CSSProperties = { color: "#111827", fontSize: 15, fontWeight: 800 };
const segmentedControlStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" };
const segmentButtonStyle: CSSProperties = { border: "1px solid #d1d5db", background: "#ffffff", color: "#374151", borderRadius: 6, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const getSegmentButtonStyle = (active: boolean): CSSProperties => active ? { ...segmentButtonStyle, background: "#111827", borderColor: "#111827", color: "#ffffff" } : segmentButtonStyle;
const nestedFormGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, minWidth: 0 };
const helperTextStyle: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 500, margin: 0 };
const perItemErrorTextStyle: CSSProperties = { ...helperTextStyle, color: "#b91c1c", fontWeight: 700 };
const servicePatternHeaderStyle: CSSProperties = { display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" };
const servicePatternLabelStyle: CSSProperties = { ...labelStyle, flex: "1 1 360px" };
const managePatternLinkStyle: CSSProperties = { color: "#166534", fontSize: 13, fontWeight: 700, textDecoration: "none", padding: "9px 0" };
const inputStyle: CSSProperties = { width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "9px 10px", fontSize: 14, minWidth: 0 };
const perItemPercentageInputStyle: CSSProperties = { ...inputStyle, textAlign: "right" };
const authorizedSignerLabelStyle: CSSProperties = { ...labelStyle, minWidth: 0 };
const authorizedSignerSelectStyle: CSSProperties = { ...inputStyle, paddingRight: 36 };
const compactInputStyle: CSSProperties = { ...inputStyle, width: 110, textAlign: "right" };
const compactFieldGroupStyle: CSSProperties = { display: "flex", gap: 8, minWidth: 0, alignItems: "center" };
const compactSelectStyle: CSSProperties = { ...inputStyle, flex: 1, minWidth: 0 };
const vatInputStyle: CSSProperties = { ...inputStyle, width: 80, marginTop: 6 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 88, resize: "vertical" };
const compactTextareaStyle: CSSProperties = { ...inputStyle, minHeight: 64, resize: "vertical" };

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
const buttonRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: 16 };
const engagementDecisionIntroStyle: CSSProperties = { display: "grid", gap: 3, marginTop: 18, paddingTop: 16, borderTop: "1px solid #e5e7eb", color: "#111827", fontSize: 14 };
const engagementChoiceGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 14, marginTop: 12 };
const engagementChoiceCardStyle: CSSProperties = { display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18, minWidth: 0, padding: 16, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff" };
const engagementChoiceActiveStyle: CSSProperties = { borderColor: "#64748b", boxShadow: "0 0 0 2px rgba(100,116,139,.12)" };
const engagementChoiceEyebrowStyle: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" };
const engagementChoiceTitleStyle: CSSProperties = { margin: "4px 0 5px", color: "#111827", fontSize: 17 };
const engagementChoiceDescriptionStyle: CSSProperties = { margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.55 };
const engagementConfirmationPanelStyle: CSSProperties = { display: "grid", gap: 14, marginTop: 16, padding: 16, scrollMarginTop: 96, border: "1px solid #93c5fd", borderRadius: 8, background: "#f8fbff" };
const engagementConfirmationClarificationStyle: CSSProperties = { margin: "8px 0 0", color: "#1e40af", fontSize: 13, fontWeight: 700 };
const engagementConfirmationActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 };
const invalidEngagementInputStyle: CSSProperties = { borderColor: "#dc2626", boxShadow: "0 0 0 2px rgba(220,38,38,.1)" };
const engagementFieldErrorStyle: CSSProperties = { color: "#b91c1c", fontSize: 12, fontWeight: 650 };

const totalsGridStyle: CSSProperties = { maxWidth: 420, marginLeft: "auto", marginTop: 16, display: "grid", gap: 8 };
const summaryLineStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14, color: "#374151" };
const summaryProminentLineStyle: CSSProperties = { ...summaryLineStyle, fontSize: 15, color: "#111827", fontWeight: 700, borderBottom: "1px solid #e5e7eb", paddingBottom: 8 };
const summaryBreakdownLineStyle: CSSProperties = { ...summaryLineStyle, paddingLeft: 14, fontSize: 13, color: "#6b7280" };
const summaryTaxLineStyle: CSSProperties = { ...summaryLineStyle, borderTop: "1px solid #e5e7eb", paddingTop: 8, color: "#374151" };
const totalLineStyle: CSSProperties = { ...summaryLineStyle, fontSize: 16, color: "#166534", borderTop: "2px solid #16a34a", paddingTop: 10 };
const lineItemTaxExplanationStyle: CSSProperties = { marginTop: 4, color: "#6b7280", fontSize: 11, fontWeight: 500, lineHeight: 1.45, whiteSpace: "normal", minWidth: 170 };

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
