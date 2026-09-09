"use client";
import { useI18n, useUiAlert } from "../../../lib/i18n/provider";
import { uiMessage, type UiMessage, type UiLocale } from "../../../lib/i18n/core";
import { translate } from "../../../lib/i18n/catalog";
import { VatTreatmentInput } from "../document-decision/vat-input";
import type { VatEvidence } from "../document-decision/shared";

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
  can_view_finance_receipts?: boolean | null;
  can_view_finance_tax_invoices?: boolean | null;
  can_manage_finance_tax_invoices?: boolean | null;
  can_issue_finance_tax_invoices?: boolean | null;
  can_manage_finance_receipts?: boolean | null;
  can_issue_finance_receipts?: boolean | null;
  can_void_finance_receipts?: boolean | null;
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
  vat_treatment_json?: VatEvidence | null;
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
type PaymentTermsValidationIssue = { message: UiMessage | string; installmentIndex: number; field: "title" | "trigger" | "trigger_description" | "due_date" | "payment_due_days" | "percentage" };
type PaymentAllocationValidationIssue = { message: UiMessage | string; itemReference?: string; installmentIndex?: number };
type PaymentInstallmentTotal = { beforeTax: number; vat: number; total: number };
type PaymentLineItemSource = { item: QuotationItemRow; reference: string };
type PendingNavigation = { href: string; label: UiMessage | string };
type QuotationEngagementBasis = "formal_agreement" | "accepted_quotation";
type QuotationEngagementReference = { id: string; engagement_basis: QuotationEngagementBasis | null; status: string; source_reference: string | null };
type EngagementConfirmationForm = { confirmedOn: string; channel: string; note: string };
type EngagementConfirmationErrors = Partial<Record<"confirmedOn" | "channel", UiMessage | string>>;
type SaveAllResult =
  | { ok: true }
  | { ok: false; stage: "quotation" | "payment_terms" | "refetch"; message: UiMessage | string };

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
  ["professional_fee", translate("th", "finance.invoice.classification.professional_fee")],
  ["additional_service", translate("th", "finance.invoice.classification.additional_service")],
  ["reimbursable_expense", translate("th", "finance.invoice.classification.reimbursable_expense")],
  ["government_or_court_fee", translate("th", "finance.invoice.classification.government_or_court_fee")],
  ["other", translate("th", "finance.payment.method.other")],
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
        vat_treatment_json: normalized.vat_treatment_json || null,
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
  if (installments.length === 0) return { message: uiMessage("finance.quotation.validation.installmentRequired"), installmentIndex: 0, field: "title" };
  if (method === "single" && installments.length !== 1) return { message: uiMessage("finance.quotation.validation.singleCount"), installmentIndex: 0, field: "title" };
  if (method === "installments" && installments.length < 2) return { message: uiMessage("finance.quotation.validation.installmentCount"), installmentIndex: 0, field: "title" };
  if (allocationMode === "proportional_all_items" && new Set(installments.map((installment) => installment.calculation_type)).size > 1) return { message: uiMessage("finance.quotation.validation.mixedCalculation"), installmentIndex: 0, field: "trigger" };

  for (const [installmentIndex, installment] of installments.entries()) {
    if (!installment.title.trim()) return { message: uiMessage("finance.quotation.validation.installmentTitle"), installmentIndex, field: "title" };
    if (!Number.isInteger(toAmount(installment.payment_due_days)) || toAmount(installment.payment_due_days) < 0) return { message: uiMessage("finance.quotation.validation.dueDays"), installmentIndex, field: "payment_due_days" };
    if (triggerUsesFixedCalendarDate(method, installment.trigger_type) && !isIsoDate(installment.due_date)) return { message: uiMessage("finance.quotation.validation.fixedDate"), installmentIndex, field: "due_date" };
    if (["case_milestone", "recurring_period", "manual"].includes(getEffectivePaymentTrigger(method, installment.trigger_type)) && !installment.trigger_description.trim()) return { message: uiMessage("finance.quotation.validation.triggerDescription"), installmentIndex, field: "trigger_description" };
  }

  if (method === "installments" && installments.some((installment) => installment.trigger_type === "recurring_period")) return { message: uiMessage("finance.quotation.validation.recurringTrigger"), installmentIndex: 0, field: "trigger" };
  if (method === "milestone" && installments.some((installment) => installment.trigger_type !== "case_milestone")) return { message: uiMessage("finance.quotation.validation.milestoneTrigger"), installmentIndex: 0, field: "trigger" };
  if (method === "recurring" && installments.some((installment) => installment.trigger_type !== "recurring_period")) return { message: uiMessage("finance.quotation.validation.recurringMethod"), installmentIndex: 0, field: "trigger" };
  if (method === "manual" && installments.some((installment) => installment.trigger_type !== "manual")) return { message: uiMessage("finance.quotation.validation.manualTrigger"), installmentIndex: 0, field: "trigger" };
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
        message: uiMessage("finance.quotation.validation.staleAllocation", { number: installmentIndex + 1 }),
        itemReference: paymentAllocationReference(staleAllocation),
        installmentIndex,
      };
    }
  }

  if (allocationMode === "proportional_all_items") {
    const percentageInstallments = installments.filter((installment) => installment.calculation_type === "percentage");
    if (percentageInstallments.length > 0) {
      const invalidInstallmentIndex = installments.findIndex((installment) => installment.calculation_type === "percentage" && (toAmount(installment.percentage) <= 0 || toAmount(installment.percentage) > 100));
      if (invalidInstallmentIndex >= 0) return { message: uiMessage("finance.quotation.validation.proportionRange", { number: invalidInstallmentIndex + 1 }), installmentIndex: invalidInstallmentIndex };
      const total = normalizePercentage(percentageInstallments.reduce((sum, installment) => sum + toAmount(installment.percentage), 0));
      if (total > 100) {
        let cumulative = 0;
        const installmentIndex = installments.findIndex((installment) => {
          cumulative = normalizePercentage(cumulative + toAmount(installment.percentage));
          return cumulative > 100;
        });
        return { message: uiMessage("finance.quotation.validation.proportionTotal", { number: installmentIndex + 1, total }), installmentIndex };
      }
      if (requireComplete && total !== 100) return { message: uiMessage("finance.quotation.validation.percentageComplete") };
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
        message: uiMessage("finance.quotation.validation.missingAllocation", { description: item.description.trim() || reference, number: missingInstallmentIndex + 1 }),
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
    if (total > 100) return { message: uiMessage("finance.quotation.validation.itemOver", { description: item.description.trim() || reference, number: overLimitInstallment + 1, total }), itemReference: reference, installmentIndex: overLimitInstallment };
    if (requireComplete && total !== 100) return { message: uiMessage("finance.quotation.validation.itemIncomplete", { description: item.description.trim() || reference }), itemReference: reference };
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
  "can_view_finance_receipts",
  "can_view_finance_tax_invoices",
  "can_manage_finance_tax_invoices",
  "can_issue_finance_tax_invoices",
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

export function QuotationGuard({ children, canAccess }: { children: (access: QuotationAccess) => ReactNode; canAccess?: (access: QuotationAccess) => boolean }) {
  const { t } = useI18n();
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
      <AppTopNav title={t("finance.quotation.guard.title")} activePage="finance" />
      <main style={pageStyle}>
        {loading ? <div style={cardStyle}>{t("finance.quotation.guard.loading")}</div> : null}
        {!loading && !allowed ? (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>{t("finance.quotation.guard.denied")}</h2>
            <p style={mutedTextStyle}>{t("finance.quotation.guard.deniedHelp")}</p>
          </div>
        ) : null}
        {!loading && access && allowed ? children(access) : null}
      </main>
    </AuthGuard>
  );
}

export { FinanceSubNav };

export function QuotationList({ access }: { access: QuotationAccess }) {
  const { t, locale, text, date } = useI18n();
  const [error, setError] = useState<UiMessage | string>("");
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [lookups, setLookups] = useState<LookupState>(getEmptyLookups());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [quotationRes, lookupRes] = await Promise.all([
      supabase.from("finance_quotations").select("*").order("created_at", { ascending: false }),
      loadLookups(),
    ]);

    if (quotationRes.error) {
      setError(uiMessage("finance.quotation.list.loadFailed"));
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
          <h1 style={pageTitleStyle}>{t("finance.quotation.list.title")}</h1>
          <p style={mutedTextStyle}>{t("finance.quotation.list.help")}</p>
        </div>
        {access.permissions.canCreateFinanceQuotation ? <Link href="/finance/quotations/new" style={primaryButtonStyle}>{t("finance.quotation.list.new")}</Link> : null}
      </div>

      {error ? <p role="alert" style={errorNoticeTextStyle}>{text(error)}</p> : null}
      <div style={cardStyle}>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("finance.quotation.list.number")}</th>
                <th style={thStyle}>{t("finance.quotation.list.client")}</th>
                <th style={thStyle}>{t("finance.quotation.list.matter")}</th>
                <th style={thStyle}>{t("finance.quotation.list.issueDate")}</th>
                <th style={thStyle}>{t("finance.quotation.list.validUntil")}</th>
                <th style={thStyle}>{t("finance.quotation.list.status")}</th>
                <th style={rightThStyle}>{t("finance.quotation.list.payable")}</th>
                <th style={thStyle}>{t("finance.quotation.list.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td style={tdStyle} colSpan={8}>{t("finance.quotation.list.loading")}</td></tr> : null}
              {!loading && quotations.length === 0 ? <tr><td style={tdStyle} colSpan={8}>{t("finance.quotation.list.empty")}</td></tr> : null}
              {!loading && quotations.map((quotation) => (
                <tr key={quotation.id}>
                  <td style={tdStyle}><Link href={`/finance/quotations/${quotation.id}`} style={linkStyle}>{quotation.quotation_no}</Link></td>
                  <td style={tdStyle}>{renderQuotationClientName(quotation, lookups.clients)}</td>
                  <td style={tdStyle}>{renderMatterLink(quotation, lookups, locale)}</td>
                  <td style={tdStyle}>{date(quotation.issue_date)}</td>
                  <td style={tdStyle}>{date(quotation.valid_until)}</td>
                  <td style={tdStyle}><StatusBadge status={quotation.status} /></td>
                  <td style={rightTdStyle}>{formatMoney(toAmount(quotation.grand_total))}</td>
                  <td style={tdStyle}>
                    <div style={actionGroupStyle}>
                      <Link href={`/finance/quotations/${quotation.id}`} style={smallButtonStyle}>{t("finance.quotation.list.view")}</Link>
                      {quotation.status === "draft" && access.permissions.canEditFinanceQuotation ? <Link href={`/finance/quotations/${quotation.id}/edit`} style={smallButtonStyle}>{t("finance.quotation.list.edit")}</Link> : null}
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
  const notify = useUiAlert();
  const { t, text: uiText } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = Boolean(quotationId);
  const [lookups, setLookups] = useState<LookupState>(getEmptyLookups());
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [items, setItems] = useState<QuotationItemRow[]>(() => quotationId ? [{ ...emptyItem }] : [createNewQuotationItem()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<UiMessage | string>(() => searchParams.get("focus") === "payment-terms" ? uiMessage("finance.quotation.save.created") : "");
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
      return { ok: false, stage: "refetch", message: uiMessage("finance.quotation.error.loadForm") } as SaveAllResult;
    }

    const quotationRes = await supabase.from("finance_quotations").select("*").eq("id", quotationId).maybeSingle();
    if (quotationRes.error || !quotationRes.data) {
      console.error("Failed to load quotation for edit", { quotationId, error: quotationRes.error });
      notify(quotationRes.error ? uiMessage("finance.quotation.error.load") : uiMessage("finance.quotation.error.notFound"));
      setLoading(false);
      return { ok: false, stage: "refetch", message: quotationRes.error ? uiMessage("finance.quotation.error.load") : uiMessage("finance.quotation.error.notFound") } as SaveAllResult;
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
  }, [quotationId, notify]);

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
    if (hasExistingWording && changesWording && !window.confirm(t("finance.quotation.pattern.replaceConfirm"))) return;

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
    if (saving || saveInFlightRef.current) return { ok: false, stage: "quotation", message: uiMessage("finance.quotation.save.inProgress") } as SaveAllResult;
    saveInFlightRef.current = true;
    try {
    if (!canSave) {
      notify(uiMessage("finance.quotation.validation.savePermission"));
      return { ok: false, stage: "quotation", message: uiMessage("finance.quotation.validation.savePermission") } as SaveAllResult;
    }
    if (isEdit && quotation?.status !== "draft") {
      notify(uiMessage("finance.quotation.validation.draftOnly"));
      return { ok: false, stage: "quotation", message: uiMessage("finance.quotation.validation.draftOnly") } as SaveAllResult;
    }

    const validationError = validateForm(form, items);
    if (validationError) {
      notify(validationError);
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
        notify(uiMessage("finance.quotation.validation.termsLoading"));
        setSaving(false);
        return { ok: false, stage: "payment_terms", message: uiMessage("finance.quotation.validation.termsStillLoading") } as SaveAllResult;
      }

      const draftTerms = newPaymentTerms;
      if (draftTerms) {
        const paymentTermsValidationIssue = getPaymentTermsPlanValidationIssue(draftTerms.payment_method_type, draftTerms.installments, draftTerms.allocation_mode);
        if (paymentTermsValidationIssue) {
          notify(paymentTermsValidationIssue.message);
          focusPaymentTermsValidationIssue(paymentTermsValidationIssue);
          setSaving(false);
          return { ok: false, stage: "payment_terms", message: paymentTermsValidationIssue.message } as SaveAllResult;
        }
        const allocationValidationIssue = getPaymentAllocationValidationIssue(draftTerms.allocation_mode, draftTerms.installments, normalizedItems);
        if (allocationValidationIssue) {
          notify(allocationValidationIssue.message);
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
        notify(allocationMappingError.message);
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
        notify(uiMessage("finance.quotation.validation.incomplete"));
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
        notify(message);
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
      setSaveMessage(uiMessage("finance.quotation.save.saved"));
      return { ok: true } as SaveAllResult;
    }

    const draftTerms = newPaymentTerms;
    if (!draftTerms) {
      notify(uiMessage("finance.quotation.validation.reviewTerms"));
      setSaving(false);
      return { ok: false, stage: "payment_terms", message: uiMessage("finance.quotation.validation.termsNotReady") } as SaveAllResult;
    }
    const paymentTermsValidationIssue = getPaymentTermsPlanValidationIssue(draftTerms.payment_method_type, draftTerms.installments, draftTerms.allocation_mode);
    if (paymentTermsValidationIssue) {
      notify(paymentTermsValidationIssue.message);
      focusPaymentTermsValidationIssue(paymentTermsValidationIssue);
      setSaving(false);
      return { ok: false, stage: "payment_terms", message: paymentTermsValidationIssue.message } as SaveAllResult;
    }
    const allocationValidationIssue = getPaymentAllocationValidationIssue(draftTerms.allocation_mode, draftTerms.installments, normalizedItems);
    if (allocationValidationIssue) {
      notify(allocationValidationIssue.message);
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
        vat_treatment_json: item.vat_treatment_json || null,
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
      notify(allocationMappingError.message);
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
      notify(getAtomicDraftCreateErrorMessage(error));
      setSaving(false);
      return { ok: false, stage: "quotation", message: uiMessage("finance.quotation.error.atomicCreate") } as SaveAllResult;
    }
    setSaving(false);
    router.replace(`/finance/quotations/${created.quotation_id}/edit`);
    return { ok: true } as SaveAllResult;
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const requestNavigation = (href: string, label: UiMessage | string) => {
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
        <div style={cardStyle}>{t("finance.quotation.form.loading")}</div>
      </>
    );
  }

  if (!canSave) {
    return (
      <>
        <FinanceSubNav activePage="quotations" permissions={access.permissions} />
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>{t("finance.quotation.guard.denied")}</h2>
          <p style={mutedTextStyle}>{t("finance.quotation.validation.savePermission")}</p>
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
          <h2 style={sectionTitleStyle}>{t("finance.quotation.form.readOnly")}</h2>
          <p style={mutedTextStyle}>{uiText(readonlyMessage)}</p>
          {quotation ? <Link href={`/finance/quotations/${quotation.id}`} style={primaryButtonStyle}>{t("finance.quotation.form.back")}</Link> : null}
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
          <h1 style={pageTitleStyle}>{isEdit ? t("finance.quotation.form.editTitle", { number: quotation?.quotation_no || "-" }) : t("finance.quotation.list.new")}</h1>
          <p style={mutedTextStyle}>{t("finance.quotation.form.help")}</p>
        </div>
        <div style={actionGroupStyle}>
          <span style={isDirty ? unsavedIndicatorStyle : savedIndicatorStyle}>{!isEdit ? t("finance.quotation.save.notCreated") : isDirty ? t("finance.quotation.save.unsaved") : t("finance.quotation.save.clean")}</span>
          <button type="button" onClick={() => requestNavigation(isEdit && quotationId ? `/finance/quotations/${quotationId}` : "/finance/quotations", isEdit ? uiMessage("finance.quotation.nav.back") : uiMessage("common.actions.back"))} style={secondaryButtonStyle}>{t("finance.quotation.nav.back")}</button>
          {isEdit && quotationId ? <button type="button" onClick={() => requestNavigation(`/finance/quotations/${quotationId}/preview`, uiMessage("finance.quotation.nav.preview"))} style={secondaryButtonStyle}>{t("finance.quotation.nav.preview")}</button> : null}
          {isEdit && quotationId ? <button type="button" onClick={() => requestNavigation(`/finance/quotations/${quotationId}/preview?print=1`, uiMessage("finance.quotation.nav.print"))} style={secondaryButtonStyle}>{t("finance.quotation.nav.print")}</button> : null}
        </div>
      </div>

      <div style={cardStyle}>
        <div className="quotation-header-form-grid" style={formGridStyle}>
          <div style={wideFieldGroupStyle}>
            <div style={fieldHeadingStyle}>{t("finance.quotation.form.customer")}</div>
            <div style={segmentedControlStyle} role="group" aria-label={t("finance.quotation.form.customerMode")}>
              <button type="button" onClick={() => setForm((current) => ({ ...current, customer_mode: "existing_client", prospect_name: "", prospect_contact_person: "", prospect_phone: "", prospect_email: "", prospect_tax_id: "", prospect_address: "" }))} style={getSegmentButtonStyle(form.customer_mode === "existing_client")}>{t("finance.quotation.form.existingClient")}</button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, customer_mode: "prospect", client_id: "" }))} style={getSegmentButtonStyle(form.customer_mode === "prospect")}>{t("finance.quotation.form.prospect")}</button>
            </div>
            {form.customer_mode === "existing_client" ? (
              <label style={labelStyle}>{t("finance.quotation.form.selectExistingClient")}<select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} style={inputStyle}>
                  <option value="">{t("finance.quotation.form.selectClient")}</option>
                  {lookups.clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}
                </select>
              </label>
            ) : (
              <div style={nestedFormGridStyle}>
                <label style={labelStyle}>{t("finance.quotation.form.prospectName")}<input value={form.prospect_name} onChange={(event) => setForm({ ...form, prospect_name: event.target.value })} style={inputStyle} /></label>
                <label style={labelStyle}>{t("finance.quotation.form.contact")}<input value={form.prospect_contact_person} onChange={(event) => setForm({ ...form, prospect_contact_person: event.target.value })} style={inputStyle} /></label>
                <label style={labelStyle}>{t("finance.quotation.form.phone")}<input value={form.prospect_phone} onChange={(event) => setForm({ ...form, prospect_phone: event.target.value })} style={inputStyle} /></label>
                <label style={labelStyle}>{t("finance.quotation.detail.email")}<input type="email" value={form.prospect_email} onChange={(event) => setForm({ ...form, prospect_email: event.target.value })} style={inputStyle} /></label>
                <label style={labelStyle}>{t("finance.quotation.form.taxId")}<input value={form.prospect_tax_id} onChange={(event) => setForm({ ...form, prospect_tax_id: event.target.value })} style={inputStyle} /></label>
                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>{t("finance.quotation.form.address")}<textarea value={form.prospect_address} onChange={(event) => setForm({ ...form, prospect_address: event.target.value })} style={compactTextareaStyle} /></label>
              </div>
            )}
            <p style={helperTextStyle}>{form.customer_mode === "prospect" ? t("finance.quotation.form.prospectHelp") : t("finance.quotation.form.clientHelp")}</p>
          </div>

          <div style={wideFieldGroupStyle}>
            <div style={fieldHeadingStyle}>{t("finance.quotation.form.matter")}</div>
            <div style={segmentedControlStyle} role="group" aria-label={t("finance.quotation.form.matterMode")}>
              <button type="button" onClick={() => setForm((current) => ({ ...current, matter_mode: "unlinked", case_id: "", advisory_matter_id: "" }))} style={getSegmentButtonStyle(form.matter_mode === "unlinked")}>{t("finance.quotation.form.unlinkedMatter")}</button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, matter_mode: "case", advisory_matter_id: "", unlinked_matter_name: "", unlinked_matter_description: "" }))} style={getSegmentButtonStyle(form.matter_mode === "case")}>{t("finance.quotation.form.case")}</button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, matter_mode: "advisory", case_id: "", unlinked_matter_name: "", unlinked_matter_description: "" }))} style={getSegmentButtonStyle(form.matter_mode === "advisory")}>{t("finance.quotation.form.advisory")}</button>
            </div>
            {form.matter_mode === "case" ? (
              <label style={labelStyle}>{t("finance.quotation.form.selectCase")}<select value={form.case_id} onChange={(event) => setForm({ ...form, case_id: event.target.value, advisory_matter_id: "" })} style={inputStyle}>
                  <option value="">{t("finance.quotation.form.selectCase")}</option>
                  {lookups.cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}
                </select>
              </label>
            ) : null}
            {form.matter_mode === "advisory" ? (
              <label style={labelStyle}>{t("finance.quotation.form.selectAdvisory")}<select value={form.advisory_matter_id} onChange={(event) => setForm({ ...form, advisory_matter_id: event.target.value, case_id: "" })} style={inputStyle}>
                  <option value="">{t("finance.quotation.form.selectAdvisory")}</option>
                  {lookups.matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}
                </select>
              </label>
            ) : null}
            {form.matter_mode === "unlinked" ? (
              <div style={nestedFormGridStyle}>
                <label style={labelStyle}>{t("finance.quotation.form.matterTitle")}<input value={form.unlinked_matter_name} onChange={(event) => setForm({ ...form, unlinked_matter_name: event.target.value })} style={inputStyle} /></label>
                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>{t("finance.quotation.form.matterDescription")}<textarea value={form.unlinked_matter_description} onChange={(event) => setForm({ ...form, unlinked_matter_description: event.target.value })} style={compactTextareaStyle} /></label>
              </div>
            ) : null}
            <p style={helperTextStyle}>{form.matter_mode === "unlinked" ? t("finance.quotation.form.unlinkedHelp") : t("finance.quotation.form.linkedHelp")}</p>
          </div>

          <label style={labelStyle}>{t("finance.quotation.form.issueDate")}<input type="date" value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>{t("finance.quotation.form.validUntil")}<input type="date" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} style={inputStyle} />
          </label>
          <label className="quotation-authorized-signer-field" style={authorizedSignerLabelStyle}>{t("finance.quotation.form.signer")}<select value={form.authorized_signer_key} onChange={(event) => setForm({ ...form, authorized_signer_key: event.target.value })} style={authorizedSignerSelectStyle}>
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
              <label style={servicePatternLabelStyle}>{t("finance.quotation.pattern.label")}<select value={form.service_pattern_id} onChange={(event) => applyServicePattern(event.target.value)} style={inputStyle}>
                  <option value="">{t("finance.quotation.pattern.none")}</option>
                  {form.service_pattern_id && !lookups.servicePatterns.some((pattern) => pattern.id === form.service_pattern_id) ? (
                    <option value={form.service_pattern_id} disabled>{t("finance.quotation.pattern.historical")}{form.service_pattern_name || form.service_pattern_code || t("finance.quotation.pattern.inactive")}</option>
                  ) : null}
                  {lookups.servicePatterns.map((pattern) => (
                    <option key={pattern.id} value={pattern.id}>
                      {pattern.display_name}{pattern.category ? ` · ${pattern.category}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Link href="/settings/document-settings#quotation-service-patterns" target="_blank" rel="noreferrer" style={managePatternLinkStyle}>{t("finance.quotation.pattern.manage")}</Link>
            </div>
            <p style={helperTextStyle}>{t("finance.quotation.pattern.help")}</p>
          </div>
          <label style={wideLabelStyle}>{t("finance.quotation.scope.label")}<textarea
              value={form.scope_of_legal_services}
              onChange={(event) => setForm({ ...form, scope_of_legal_services: event.target.value })}
              style={textareaStyle}
              placeholder={t("finance.quotation.scope.placeholder")}
            />
          </label>
          <label style={wideLabelStyle}>{t("finance.quotation.scope.included")}<textarea
              value={form.included_services}
              onChange={(event) => setForm({ ...form, included_services: event.target.value })}
              style={textareaStyle}
              placeholder={t("finance.quotation.scope.includedPlaceholder")}
            />
          </label>
          <label style={wideLabelStyle}>{t("finance.quotation.scope.excluded")}<textarea
              value={form.excluded_services}
              onChange={(event) => setForm({ ...form, excluded_services: event.target.value })}
              style={textareaStyle}
              placeholder={t("finance.quotation.scope.excludedPlaceholder")}
            />
          </label>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>{t("finance.quotation.form.feeItems")}</h2>
          <button type="button" onClick={() => setItems((current) => [...current, createNewQuotationItem(current.length)])} style={secondaryButtonStyle}>{t("finance.quotation.form.addItem")}</button>
        </div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("finance.quotation.form.description")}</th>
                <th style={thStyle}>{t("finance.quotation.items.classificationUnit")}</th>
                <th style={rightThStyle}>{t("finance.quotation.form.quantity")}</th>
                <th style={rightThStyle}>{t("finance.quotation.form.unitPrice")}</th>
                <th style={thStyle}>{t("finance.quotation.totals.vat")}</th>
                <th style={rightThStyle}>{t("finance.quotation.form.lineTotal")}</th>
                <th style={thStyle}>{t("finance.quotation.form.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const normalized = normalizeItem(item, index);
                return (
                  <tr key={index}>
                    <td style={tdStyle}><input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} style={inputStyle} placeholder={t("finance.quotation.form.servicePlaceholder")} /></td>
                    <td style={tdStyle}><select aria-label={t("finance.quotation.items.classification")} value={item.economic_classification} onChange={(event) => updateItem(index, { economic_classification: event.target.value })} style={inputStyle}><option value="">{t("finance.quotation.items.selectClassification")}</option>{quotationEconomicClassifications.map(([value]) => <option key={value} value={value}>{t(`finance.quotation.classification.${value}`)}</option>)}</select><input aria-label={t("finance.quotation.items.unit")} value={item.unit} onChange={(event) => updateItem(index, { unit: event.target.value })} style={vatInputStyle} placeholder={t("finance.quotation.items.unitPlaceholder")} /></td>
                    <td style={rightTdStyle}><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} style={compactInputStyle} /></td>
                    <td style={rightTdStyle}><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: event.target.value })} style={compactInputStyle} /></td>
                    <td style={tdStyle}>
                      <select value={item.price_tax_mode || (item.vat_applicable ? "vat_exclusive" : "non_vat")} onChange={(event) => { const price_tax_mode = event.target.value as NonNullable<QuotationItemRow["price_tax_mode"]>; updateItem(index, { vat_treatment_json: null, price_tax_mode, vat_applicable: price_tax_mode !== "non_vat", vat_rate: price_tax_mode === "non_vat" ? 0 : (item.vat_rate || 7) }); }} style={inputStyle}><option value="non_vat">{t("finance.quotation.form.nonVat")}</option><option value="vat_exclusive">{t("finance.quotation.form.vatExclusive")}</option><option value="vat_inclusive">{t("finance.quotation.form.vatInclusive")}</option></select>
                      {(item.price_tax_mode || (item.vat_applicable ? "vat_exclusive" : "non_vat")) !== "non_vat" ? <input aria-label={t("finance.quotation.form.vatRate")} type="number" min="0" step="0.01" value={item.vat_rate} onChange={(event) => updateItem(index, { vat_treatment_json: null, vat_rate: event.target.value })} style={vatInputStyle} /> : null}
                      <VatTreatmentInput value={item.vat_treatment_json} applicable={item.price_tax_mode !== "non_vat" && item.vat_applicable} rate={toAmount(item.vat_rate)} onChange={vat_treatment_json => updateItem(index, { vat_treatment_json })} />
                    </td>
                    <td style={rightTdStyle}>
                      <strong>{formatMoney(toAmount(normalized.line_total))}</strong>
                      <LineItemVatExplanation item={normalized} />
                    </td>
                    <td style={tdStyle}><button type="button" onClick={() => removeItem(index)} style={dangerSmallButtonStyle} disabled={items.length === 1}>{t("finance.quotation.form.remove")}</button></td>
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
          <label style={wideLabelStyle}>{t("finance.quotation.form.note")}<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} style={textareaStyle} />
          </label>
          <label style={wideLabelStyle}>{t("finance.quotation.form.internalNote")}<textarea value={form.internal_note} onChange={(event) => setForm({ ...form, internal_note: event.target.value })} style={textareaStyle} />
          </label>
        </div>
        <div style={buttonRowStyle}>
          {saveMessage ? <span style={noticeTextStyle}>{uiText(saveMessage)}</span> : null}
          <button type="button" onClick={() => { void saveDraft(); }} disabled={saveDisabled} style={{ ...primaryButtonStyle, whiteSpace: "normal", textAlign: "center" }}>{saving ? t("finance.quotation.engagement.saving") : isEdit ? t("finance.quotation.save.all") : t("finance.quotation.form.createButtonTitle")}</button>
        </div>
      </div>
      {pendingNavigation ? <div style={dialogBackdropStyle} role="dialog" aria-modal="true" aria-labelledby="unsaved-changes-title">
        <div style={dialogStyle}>
          <h2 id="unsaved-changes-title" style={sectionTitleStyle}>{t("finance.quotation.navigation.unsaved")}</h2>
          <p style={mutedTextStyle}>{t("finance.quotation.navigation.confirm", { action: uiText(pendingNavigation.label) })}</p>
          <div style={{ ...actionGroupStyle, justifyContent: "flex-end", marginTop: 18 }}>
            <button type="button" onClick={() => setPendingNavigation(null)} disabled={saving} style={secondaryButtonStyle}>{t("finance.quotation.navigation.cancel")}</button>
            <button type="button" onClick={() => { const destination = pendingNavigation; setPendingNavigation(null); router.push(destination.href); }} disabled={saving} style={dangerButtonStyle}>{t("finance.quotation.navigation.discard")}</button>
            <button type="button" onClick={() => { void saveAndContinue(); }} disabled={saveDisabled} style={primaryButtonStyle}>{saving ? t("finance.quotation.engagement.saving") : t("finance.quotation.navigation.saveContinue")}</button>
          </div>
        </div>
      </div> : null}
    </>
  );
}

function PaymentTermsEditor({ quotationId, isNew, quotationItems, autoFocus, onFocusHandled, onDraftPayloadChange, onSnapshotChange, onValidityChange }: { quotationId?: string; isNew: boolean; quotationItems: QuotationItemRow[]; autoFocus: boolean; onFocusHandled: () => void; onDraftPayloadChange: (payload: NewPaymentTermsPayload | null) => void; onSnapshotChange: (snapshot: PaymentTermsSnapshot) => void; onValidityChange: (valid: boolean) => void }) {
  const notify = useUiAlert();
  const { t, text: uiText } = useI18n();
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
      notify(uiMessage("finance.quotation.error.termsLoad"));
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
      notify(uiMessage("finance.quotation.error.installmentsLoad"));
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
      notify(uiMessage("finance.quotation.error.allocationsLoad"));
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
  }, [isNew, quotationId, notify]);

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
    if (nextMode === "proportional_all_items" && hasPerItemValues && !window.confirm(t("finance.quotation.allocation.modeConfirm"))) return;
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
      notify(uiMessage("finance.quotation.allocation.full"));
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
      ? t("finance.quotation.allocation.allItemsComplete")
      : incompletePerItem.map(({ item, remaining }) => t("finance.quotation.allocation.itemRemaining", { description: item.description || item.id || "-", percentage: remaining, amount: formatMoney(toAmount(item.line_total) * remaining / 100) })).join(" | "))
    : isPercentage
      ? (complete
        ? t("finance.quotation.allocation.proportionsComplete")
        : t("finance.quotation.allocation.percentageRemaining", { total: percentageTotal.toFixed(6).replace(/\.0+$/, ""), remaining: normalizePercentage(100 - percentageTotal).toFixed(6).replace(/\.0+$/, "") }))
      : t(complete ? "finance.quotation.allocation.fixedComplete" : "finance.quotation.allocation.fixedIncomplete", { allocated: formatMoney(fixedAllocated), remaining: formatMoney(Math.max(0, quotationTotal - fixedAllocated)) }));
  const allocationStatusHasError = Boolean(paymentTermsValidationMessage || allocationValidationIssue);

  useEffect(() => {
    onValidityChange(paymentTermsValid);
    return () => onValidityChange(true);
  }, [onValidityChange, paymentTermsValid]);

  const createDefault = async () => {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("create_default_finance_quotation_payment_terms", { p_quotation_id: quotationId, p_payment_due_days: 0 });
    if (error) notify(uiMessage("finance.quotation.error.createTerms"));
    else await loadTerms();
    setSaving(false);
  };
  if (loading) return <div style={cardStyle}>{t("finance.quotation.terms.loading")}</div>;
  if (!terms) return <div id="quotation-payment-terms" ref={sectionRef} tabIndex={-1} style={{ ...cardStyle, scrollMarginTop: 96 }}><h2 style={sectionTitleStyle}>{t("finance.quotation.terms.heading")}</h2><p style={mutedTextStyle}>{t("finance.quotation.terms.none")}</p><button type="button" onClick={createDefault} disabled={saving} style={primaryButtonStyle}>{saving ? t("finance.quotation.engagement.creating") : t("finance.quotation.terms.createFull")}</button></div>;

  return <div id="quotation-payment-terms" ref={sectionRef} tabIndex={-1} style={{ ...cardStyle, scrollMarginTop: 96 }}>
    <div style={sectionHeaderStyle}><div><h2 style={sectionTitleStyle}>{t("finance.quotation.terms.heading")}</h2><p style={mutedTextStyle}>{t("finance.quotation.terms.atomicSave")}</p></div></div>
    <div style={formGridStyle}>
      <label style={labelStyle}>{t("finance.quotation.terms.method")}<select ref={paymentMethodRef} value={method} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethodType)} style={inputStyle}><option value="single">{t("finance.quotation.method.single")}</option><option value="installments">{t("finance.quotation.method.installments")}</option><option value="milestone">{t("finance.quotation.method.milestone")}</option><option value="recurring">{t("finance.quotation.method.recurring")}</option><option value="manual">{t("finance.quotation.method.manual")}</option></select></label>
      <label style={labelStyle}>{t("finance.quotation.allocation.mode")}<select value={allocationMode} onChange={(event) => setPaymentAllocationMode(event.target.value as PaymentAllocationMode)} style={inputStyle}><option value="proportional_all_items">{t("finance.quotation.allocation.proportional")}</option><option value="per_item">{t("finance.quotation.allocation.perItem")}</option></select><span style={helperTextStyle}>{t("finance.quotation.allocation.help")}</span></label>
    </div>
    {installments.map((installment, index) => <div id={`payment-installment-${index}`} key={index} tabIndex={-1} style={{ ...cardStyle, marginTop: 12, background: "#f8fafc", scrollMarginTop: 96 }}>
      <div style={sectionHeaderStyle}><h3 style={sectionTitleStyle}>{t("finance.quotation.installment.number", { number: index + 1 })}</h3>{method !== "single" ? <div style={actionGroupStyle}><button type="button" title={t("finance.quotation.installment.moveUpLabel")} disabled={index === 0} onClick={() => setInstallments((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return normalizePaymentInstallments(next, method); })} style={smallButtonStyle}>{t("finance.quotation.installment.moveUp")}</button><button type="button" title={t("finance.quotation.installment.moveDownLabel")} disabled={index === installments.length - 1} onClick={() => setInstallments((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return normalizePaymentInstallments(next, method); })} style={smallButtonStyle}>{t("finance.quotation.installment.moveDown")}</button><button type="button" onClick={() => setInstallments((current) => normalizePaymentInstallments(current.filter((_, itemIndex) => itemIndex !== index), method))} style={dangerSmallButtonStyle}>{t("finance.quotation.installment.remove")}</button></div> : null}</div>
      <InstallmentAmountSummary total={installmentTotals[index]} percentage={allocationMode === "proportional_all_items" && installment.calculation_type === "percentage" ? toAmount(installment.percentage) : null} effectivePercentage={quotationTotal > 0 ? installmentTotals[index].total * 100 / quotationTotal : 0} perItem={allocationMode === "per_item"} />
      <div style={formGridStyle}>
        <label style={labelStyle}>{t("finance.quotation.installment.title")}<input id={`payment-installment-${index}-title`} value={installment.title} onChange={(event) => updateInstallment(index, { title: event.target.value })} style={inputStyle} /></label>
        {allocationMode === "proportional_all_items" ? <><label style={labelStyle}>{t("finance.quotation.installment.calculation")}<select value={installment.calculation_type} disabled={method === "single"} onChange={(event) => changeCalculationType(event.target.value as PaymentCalculationType)} style={inputStyle}><option value="percentage">{t("finance.quotation.installment.percentage")}</option><option value="fixed_amount">{t("finance.quotation.installment.fixed")}</option></select></label>
        {installment.calculation_type === "percentage" ? <label style={labelStyle}>{t("finance.quotation.installment.proportion")}<div style={compactFieldGroupStyle}><select value={percentageChoice(installment.percentage)} disabled={method === "single"} onChange={(event) => { const value = event.target.value; updateInstallment(index, { percentage: value === "other" ? "" : value }); }} style={compactSelectStyle}><option value="50">50%</option><option value="25">25%</option><option value="20">20%</option><option value="other">{t("finance.quotation.installment.custom")}</option></select>{percentageChoice(installment.percentage) === "other" ? <input id={`payment-installment-${index}-percentage`} aria-label={t("finance.quotation.installment.proportionLabel", { number: index + 1 })} type="number" min="0.000001" max="100" step="0.000001" value={installment.percentage} onChange={(event) => updateInstallment(index, { percentage: event.target.value })} style={compactInputStyle} /> : null}</div></label> : null}</> : null}
        <label style={labelStyle}>{t("finance.quotation.installment.trigger")}<select id={`payment-installment-${index}-trigger`} value={forcedTrigger(method) || installment.trigger_type} disabled={Boolean(forcedTrigger(method))} onChange={(event) => updateInstallment(index, { trigger_type: event.target.value as PaymentTriggerType })} style={inputStyle}><option value="quotation_acceptance">{t("finance.quotation.trigger.acceptance")}</option><option value="agreement_effective">{t("finance.quotation.trigger.agreementEffective")}</option><option value="date">{t("finance.quotation.trigger.date")}</option><option value="case_milestone">{t("finance.quotation.trigger.milestone")}</option>{method !== "installments" ? <option value="recurring_period">{t("finance.quotation.trigger.recurring")}</option> : null}<option value="manual">{t("finance.quotation.trigger.manual")}</option></select><span style={helperTextStyle}>{t("finance.quotation.trigger.help")}</span></label>
        {triggerUsesFixedCalendarDate(method, installment.trigger_type) ? <label style={labelStyle}>{t("finance.quotation.installment.billingDate")}<input id={`payment-installment-${index}-due_date`} type="date" value={installment.due_date} onChange={(event) => updateInstallment(index, { due_date: event.target.value })} style={inputStyle} /></label> : null}
        {["case_milestone", "recurring_period", "manual"].includes(forcedTrigger(method) || installment.trigger_type) ? <label style={wideLabelStyle}>{t("finance.quotation.installment.triggerDescription")}<input id={`payment-installment-${index}-trigger_description`} placeholder={t("finance.quotation.installment.triggerPlaceholder")} value={installment.trigger_description} onChange={(event) => updateInstallment(index, { trigger_description: event.target.value })} style={inputStyle} /></label> : null}
        <label style={labelStyle}>{t("finance.quotation.installment.paymentDue")}<div style={compactFieldGroupStyle}><select id={`payment-installment-${index}-payment_due_days`} value={paymentDueChoice(installment.payment_due_days)} onChange={(event) => { const value = event.target.value; updateInstallment(index, { payment_due_days: value === "other" ? "" : value }); }} style={compactSelectStyle}>{paymentDueDayPresets.map((days) => <option key={days} value={days}>{days} {t("finance.quotation.installment.days")}</option>)}<option value="other">{t("finance.quotation.installment.custom")}</option></select>{paymentDueChoice(installment.payment_due_days) === "other" ? <input id={`payment-installment-${index}-payment_due_days`} aria-label={t("finance.quotation.installment.dueDaysLabel", { number: index + 1 })} type="number" min="0" step="1" value={installment.payment_due_days} onChange={(event) => updateInstallment(index, { payment_due_days: event.target.value })} style={compactInputStyle} /> : null}</div><span style={helperTextStyle}>{t("finance.quotation.installment.dueHelp")}</span></label>
        <label style={wideLabelStyle}>{t("finance.quotation.installment.clientNote")}<textarea value={installment.client_note} onChange={(event) => updateInstallment(index, { client_note: event.target.value })} style={textareaStyle} /></label>
      </div>
      {allocationMode === "proportional_all_items" ? installment.calculation_type === "fixed_amount" ? <div style={tableWrapStyle}><h4 style={sectionTitleStyle}>{t("finance.quotation.allocation.advanced")}</h4><table style={tableStyle}><thead><tr><th style={thStyle}>{t("finance.quotation.allocation.quotationItem")}</th><th style={rightThStyle}>{t("finance.quotation.allocation.beforeVat")}</th><th style={rightThStyle}>{t("finance.quotation.totals.vat")}</th><th style={rightThStyle}>{t("finance.quotation.allocation.totalAmount")}</th><th style={rightThStyle}>{t("finance.quotation.allocation.remaining")}</th></tr></thead><tbody>{quotationItems.filter((item) => item.id || item.client_item_key).map((quotationItem) => { const reference = paymentReferenceForItem(quotationItem); const allocation = installment.items.find((item) => paymentAllocationReference(item) === reference) || { ...(quotationItem.id ? { quotation_item_id: quotationItem.id } : { client_item_key: quotationItem.client_item_key }), allocated_amount_before_tax: 0, allocated_vat_amount: 0, allocated_total: 0 }; const allocatedElsewhere = installments.filter((_, installmentIndex) => installmentIndex !== index).reduce((sum, other) => sum + (other.items.find((item) => paymentAllocationReference(item) === reference)?.allocated_total || 0), 0); const patch = (field: keyof PaymentAllocation, value: string) => updateInstallment(index, { items: installment.items.some((item) => paymentAllocationReference(item) === reference) ? installment.items.map((item) => paymentAllocationReference(item) === reference ? { ...item, [field]: toAmount(value), allocated_total: field === "allocated_total" ? toAmount(value) : (field === "allocated_amount_before_tax" ? toAmount(value) : item.allocated_amount_before_tax) + (field === "allocated_vat_amount" ? toAmount(value) : item.allocated_amount_before_tax) } : item) : [...installment.items, { ...allocation, [field]: toAmount(value), allocated_total: field === "allocated_total" ? toAmount(value) : (field === "allocated_amount_before_tax" ? toAmount(value) : 0) + (field === "allocated_vat_amount" ? toAmount(value) : 0) }] }); return <tr key={reference}><td style={tdStyle}>{quotationItem.description}</td><td style={rightTdStyle}><input type="number" min="0" step="0.01" value={allocation.allocated_amount_before_tax} onChange={(event) => patch("allocated_amount_before_tax", event.target.value)} style={compactInputStyle} /></td><td style={rightTdStyle}><input type="number" min="0" step="0.01" value={allocation.allocated_vat_amount} onChange={(event) => patch("allocated_vat_amount", event.target.value)} style={compactInputStyle} /></td><td style={rightTdStyle}>{formatMoney(allocation.allocated_amount_before_tax + allocation.allocated_vat_amount)}</td><td style={rightTdStyle}>{formatMoney(toAmount(quotationItem.line_total) - allocatedElsewhere - allocation.allocated_total)}</td></tr>; })}</tbody></table></div> : <p style={mutedTextStyle}>{t("finance.quotation.installment.calculationHelp")}</p> : null}
    </div>)}
    {method !== "single" ? <button type="button" onClick={addInstallment} style={secondaryButtonStyle}>{t("finance.quotation.installment.add")}</button> : null}
    {allocationMode === "per_item" && installments.every((installment) => installment.calculation_type === "percentage") ? <PerItemAllocationMatrix sources={lineItemSource} installments={installments} onChange={updatePerItemAllocation} /> : null}
    <section style={{ ...allocationStatusPanelStyle, ...(allocationStatusHasError ? allocationStatusErrorStyle : complete ? allocationStatusCompleteStyle : allocationStatusIncompleteStyle) }} aria-live="polite">
      <span style={allocationStatusLabelStyle}>{t("finance.quotation.allocation.status")}</span>
      <strong style={allocationStatusHeadingStyle}>{allocationStatusHasError ? t("finance.quotation.allocation.needsCorrection") : complete ? t("finance.quotation.allocation.complete") : t("finance.quotation.allocation.incomplete")}</strong>
      <span style={allocationStatusDetailStyle}>{uiText(allocationStatusMessage)}</span>
    </section>
    <section style={paymentSummarySectionStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <h3 style={sectionTitleStyle}>{t("finance.quotation.summary.heading")}</h3>
          <p style={mutedTextStyle}>{t("finance.quotation.summary.help")}</p>
        </div>
        {summaryIsCustom
          ? <button type="button" onClick={() => { setSummaryIsCustom(false); setSummary(generatedSummary); }} style={smallButtonStyle}>{t("finance.quotation.summary.restore")}</button>
          : <button type="button" onClick={() => { setSummary(generatedSummary); setSummaryIsCustom(true); }} style={smallButtonStyle}>{t("finance.quotation.summary.customize")}</button>}
      </div>
      {summaryIsCustom ? <>
        <textarea id="payment-client-summary" aria-label={t("finance.quotation.summary.heading")} value={summary} onChange={(event) => setSummary(event.target.value)} style={textareaStyle} />
        <p style={paymentSummaryOverrideNoticeStyle}>{t("finance.quotation.summary.customHelp")}</p>
      </> : <div style={paymentSummaryOutputStyle} aria-live="polite">{generatedSummary || t("finance.quotation.summary.empty")}</div>}
    </section>
  </div>;
}

function PerItemAllocationMatrix({ sources, installments, onChange }: { sources: PaymentLineItemSource[]; installments: PaymentInstallment[]; onChange: (source: PaymentLineItemSource, installmentIndex: number, value: string) => void }) {
  const { t } = useI18n();
  return <div style={{ ...cardStyle, marginTop: 12 }}>
    <h3 style={sectionTitleStyle}>{t("finance.quotation.allocation.matrixTitle")}</h3>
    <p style={mutedTextStyle}>{t("finance.quotation.allocation.matrixHelp")}</p>
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
            <strong style={perItemDescriptionStyle}>{source.item.description.trim() || t("finance.quotation.allocation.unnamedItem")}</strong>
            <span style={mutedTextStyle}>{t("finance.quotation.allocation.itemValue")}{formatMoney(toAmount(source.item.line_total))}</span>
            <span style={isOverAllocated ? perItemErrorTextStyle : helperTextStyle}>
              {t("finance.quotation.allocation.total")}{formatCompactPercentage(allocatedPercentage)} · {isOverAllocated ? t("finance.quotation.allocation.excess") : t("finance.quotation.allocation.remaining")} {formatCompactPercentage(Math.abs(remainingPercentage))} ({formatMoney(Math.abs(remainingAmount))})
            </span>
          </div>
          <div style={perItemInstallmentGridStyle}>
            {installments.map((installment, installmentIndex) => {
              const allocation = installment.items.find((entry) => paymentAllocationReference(entry) === source.reference);
              return <label key={installmentIndex} style={labelStyle}>
                {t("finance.quotation.installment.number", { number: installmentIndex + 1 })} (%)
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
                <span style={helperTextStyle}>{t("finance.quotation.allocation.installmentAmount")}{formatMoney(itemTotals[installmentIndex]?.total || 0)}</span>
              </label>;
            })}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function InstallmentAmountSummary({ total, percentage, effectivePercentage, perItem }: { total: PaymentInstallmentTotal; percentage: number | null; effectivePercentage: number; perItem: boolean }) {
  const { t } = useI18n();
  return <div style={installmentAmountSummaryStyle}>
    <div><strong>{t("finance.quotation.installment.amount")}</strong>{percentage != null ? <span style={installmentPercentageStyle}>{formatCompactPercentage(percentage)}</span> : perItem ? <span style={installmentPercentageStyle}>{t("finance.quotation.installment.share", { percentage: formatCompactPercentage(effectivePercentage) })}</span> : null}</div>
    <div style={installmentAmountGridStyle}><span>{t("finance.quotation.allocation.beforeVat")}<br /><strong>{formatMoney(total.beforeTax)}</strong></span><span>{t("finance.quotation.totals.vat")}<br /><strong>{formatMoney(total.vat)}</strong></span><span>{t("finance.quotation.installment.total")}<br /><strong>{formatMoney(total.total)}</strong></span></div>
    {perItem ? <p style={helperTextStyle}>{t("finance.quotation.installment.perItemHelp")}</p> : null}
  </div>;
}

export function QuotationDetail({ access, quotationId }: { access: QuotationAccess; quotationId: string }) {
  const notify = useUiAlert();
  const { t, text: uiText, locale, date: uiDate } = useI18n();
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
  const [engagementMessage, setEngagementMessage] = useState<UiMessage | string>("");
  const feeAgreementCreatingRef = useRef(false);
  const engagementConfirmingRef = useRef(false);
  const confirmationPanelRef = useRef<HTMLDivElement>(null);
  const confirmationDateRef = useRef<HTMLInputElement>(null);
  const confirmationChannelRef = useRef<HTMLSelectElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (!quotationId) {
      console.error("Missing quotation id in quotation detail route");
      notify(uiMessage("finance.quotation.error.notFound"));
      setLoading(false);
      return;
    }

    const quotationRes = await supabase.from("finance_quotations").select("*").eq("id", quotationId).maybeSingle();
    if (quotationRes.error || !quotationRes.data) {
      console.error("Failed to load quotation", { quotationId, error: quotationRes.error });
      notify(quotationRes.error ? uiMessage("finance.quotation.error.load") : uiMessage("finance.quotation.error.notFound"));
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
  }, [quotationId, notify]);

  const createFeeAgreement = async () => {
    if (!quotation || saving || feeAgreementCreatingRef.current) return;
    feeAgreementCreatingRef.current = true;
    setSaving(true);
    const { data, error } = await supabase.rpc("create_finance_fee_agreement_from_quotation_v2", { p_quotation_id: quotation.id });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result?.fee_agreement_id) {
      console.error("Unable to create Fee Agreement draft", error);
      notify(uiMessage("finance.quotation.error.createAgreement"));
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
    if (agreementRes.data?.agreement_no) notify(uiMessage("finance.quotation.engagement.agreementCreated", { number: agreementRes.data.agreement_no }));
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
    if (!confirmationForm.confirmedOn) nextErrors.confirmedOn = uiMessage("finance.quotation.engagement.dateRequired");
    else if (confirmationForm.confirmedOn > getBangkokDateKey()) nextErrors.confirmedOn = uiMessage("finance.quotation.engagement.futureDate");
    if (!confirmationForm.channel) nextErrors.channel = uiMessage("finance.quotation.engagement.channelRequired");
    if (Object.keys(nextErrors).length) {
      setConfirmationErrors(nextErrors);
      setEngagementMessage(uiMessage("finance.quotation.engagement.required"));
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
      setEngagementMessage(uiMessage("finance.quotation.engagement.failed"));
    } finally {
      engagementConfirmingRef.current = false;
      setSaving(false);
    }
  };

  const linkMasterRecords = async () => {
    if (!quotation || saving) return;
    if (!linkClientId) {
      notify(uiMessage("finance.quotation.engagement.clientBeforeAgreement"));
      return;
    }
    if (linkMatterMode === "case" && !linkCaseId) {
      notify(uiMessage("finance.quotation.engagement.caseRequired"));
      return;
    }
    if (linkMatterMode === "advisory" && !linkAdvisoryMatterId) {
      notify(uiMessage("finance.quotation.engagement.advisoryRequired"));
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
      notify(uiMessage("finance.quotation.engagement.linkFailed"));
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
      cancelReason = window.prompt(t("finance.quotation.detail.cancelPrompt")) || "Cancelled by user";
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
      notify(getQuotationStatusErrorMessage(error));
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
      {loading ? <div style={cardStyle}>{t("finance.quotation.detail.loading")}</div> : null}
      {!loading && quotation ? (
        <>
          <div style={sectionHeaderStyle}>
            <div>
              <h1 style={pageTitleStyle}>{quotation.quotation_no}</h1>
              <p style={mutedTextStyle}>{t("finance.quotation.detail.help")}</p>
              {quotation.status !== "draft" ? <p style={noticeTextStyle}>{uiText(getReadonlyMessage(quotation.status))}</p> : null}
            </div>
            <div style={actionGroupStyle}>
              <Link href="/finance/quotations" style={secondaryButtonStyle}>{t("common.actions.back")}</Link>
              <Link href={`/finance/quotations/${quotation.id}/preview`} style={secondaryButtonStyle}>{t("finance.quotation.detail.preview")}</Link>
              <Link href={`/finance/quotations/${quotation.id}/preview?print=1`} style={secondaryButtonStyle} title={t("finance.quotation.detail.printTitle")}>{t("finance.quotation.detail.print")}</Link>
              {quotation.status === "accepted" && access.permissions.canCreateFinanceQuotation && engagement ? <Link href={`/finance/fee-agreements/${engagement.id}`} style={primaryButtonStyle}>{engagement.engagement_basis === "accepted_quotation" ? t("finance.quotation.engagement.openAccepted") : t("finance.quotation.engagement.openAgreement")}</Link> : null}
              {quotation.status === "draft" && access.permissions.canEditFinanceQuotation ? <Link href={`/finance/quotations/${quotation.id}/edit`} style={primaryButtonStyle}>{t("finance.quotation.detail.edit")}</Link> : null}
              {quotation.status === "draft" && access.permissions.canMarkFinanceQuotationSent ? <button type="button" onClick={() => updateStatus("sent")} disabled={saving} style={secondaryButtonStyle}>{t("finance.quotation.detail.markSent")}</button> : null}
              {quotation.status === "sent" && access.permissions.canMarkFinanceQuotationAccepted ? <button type="button" onClick={() => updateStatus("accepted")} disabled={saving} style={secondaryButtonStyle}>{t("finance.quotation.detail.markAccepted")}</button> : null}
              {(quotation.status === "draft" || quotation.status === "sent") && access.permissions.canCancelFinanceQuotation ? <button type="button" onClick={() => updateStatus("cancelled")} disabled={saving} style={dangerButtonStyle}>{t("finance.quotation.detail.cancel")}</button> : null}
            </div>
          </div>

          {quotation.status === "accepted" && !engagement && access.permissions.canCreateFinanceQuotation ? (
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>{t("finance.quotation.engagement.accepted")}</h2>
              <p style={mutedTextStyle}>{t("finance.quotation.engagement.contextHelp")}</p>
              <div style={{ ...formGridStyle, marginTop: 14 }}>
                <label style={labelStyle}>{t("finance.quotation.engagement.client")}<select value={linkClientId} disabled={Boolean(quotation.client_id)} onChange={(event) => setLinkClientId(event.target.value)} style={inputStyle}>
                    <option value="">{t("finance.quotation.form.selectClient")}</option>
                    {lookups.clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}
                  </select>
                </label>
                <div style={wideFieldGroupStyle}>
                  <div style={fieldHeadingStyle}>{t("finance.quotation.form.matter")}</div>
                  <div style={segmentedControlStyle}>
                    <button type="button" disabled={hasCanonicalMatter} onClick={() => { setLinkMatterMode("unlinked"); setLinkCaseId(""); setLinkAdvisoryMatterId(""); }} style={getSegmentButtonStyle(linkMatterMode === "unlinked")}>{t("finance.quotation.engagement.unlinked")}</button>
                    <button type="button" disabled={hasCanonicalMatter} onClick={() => { setLinkMatterMode("case"); setLinkAdvisoryMatterId(""); }} style={getSegmentButtonStyle(linkMatterMode === "case")}>{t("finance.quotation.form.case")}</button>
                    <button type="button" disabled={hasCanonicalMatter} onClick={() => { setLinkMatterMode("advisory"); setLinkCaseId(""); }} style={getSegmentButtonStyle(linkMatterMode === "advisory")}>{t("finance.quotation.form.advisory")}</button>
                  </div>
                  {linkMatterMode === "case" ? <select value={linkCaseId} disabled={Boolean(canonicalMatterLink?.caseId)} onChange={(event) => setLinkCaseId(event.target.value)} style={inputStyle}><option value="">{t("finance.quotation.form.selectCase")}</option>{lookups.cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}</select> : null}
                  {linkMatterMode === "advisory" ? <select value={linkAdvisoryMatterId} disabled={Boolean(canonicalMatterLink?.advisoryMatterId)} onChange={(event) => setLinkAdvisoryMatterId(event.target.value)} style={inputStyle}><option value="">{t("finance.quotation.form.selectAdvisory")}</option>{lookups.matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}</select> : null}
                </div>
              </div>
              {!quotation.client_id ? <p style={noticeTextStyle}>{t("finance.quotation.engagement.linkRequired")}</p> : null}
              {hasCanonicalMatter ? <p style={helperTextStyle}>{t("finance.quotation.engagement.matterLinked")}</p> : null}
              {requiresMasterRecordLink ? <div style={buttonRowStyle}><button type="button" onClick={linkMasterRecords} disabled={saving} style={primaryButtonStyle}>{saving ? t("finance.quotation.engagement.saving") : t("finance.quotation.engagement.saveLink")}</button></div> : <>
                <div style={engagementDecisionIntroStyle}><strong>{t("finance.quotation.engagement.nextStep")}</strong><span>{t("finance.quotation.engagement.choiceHelp")}</span></div>
                <div style={engagementChoiceGridStyle}>
                  <div style={{ ...engagementChoiceCardStyle, ...(engagementChoice === "formal_agreement" ? engagementChoiceActiveStyle : {}) }}>
                    <div><span style={engagementChoiceEyebrowStyle}>{t("finance.quotation.engagement.formalEyebrow")}</span><h3 style={engagementChoiceTitleStyle}>{t("finance.quotation.engagement.prepareAgreement")}</h3><p style={engagementChoiceDescriptionStyle}>{t("finance.quotation.engagement.formalHelp")}</p></div>
                    <button type="button" onClick={() => { setEngagementChoice("formal_agreement"); void createFeeAgreement(); }} disabled={saving} style={secondaryButtonStyle}>{saving && engagementChoice === "formal_agreement" ? t("finance.quotation.engagement.creating") : t("finance.quotation.engagement.prepareAgreement")}</button>
                  </div>
                  <div style={{ ...engagementChoiceCardStyle, ...(engagementChoice === "accepted_quotation" ? engagementChoiceActiveStyle : {}) }}>
                    <div><span style={engagementChoiceEyebrowStyle}>{t("finance.quotation.engagement.acceptedEyebrow")}</span><h3 style={engagementChoiceTitleStyle}>{t("finance.quotation.engagement.acceptedTitle")}</h3><p style={engagementChoiceDescriptionStyle}>{t("finance.quotation.engagement.acceptedHelp")}</p></div>
                    <button type="button" onClick={openConfirmationPanel} disabled={saving} style={primaryButtonStyle}>{t("finance.quotation.engagement.record")}</button>
                  </div>
                </div>
                {engagementChoice === "accepted_quotation" ? <div ref={confirmationPanelRef} tabIndex={-1} style={engagementConfirmationPanelStyle}>
                  <div><h3 style={engagementChoiceTitleStyle}>{t("finance.quotation.engagement.confirm")}</h3><p style={engagementChoiceDescriptionStyle}>{t("finance.quotation.engagement.confirmHelp")}</p><p style={engagementConfirmationClarificationStyle}>{t("finance.quotation.engagement.noSigning")}</p></div>
                  {engagementMessage ? <div role="alert" style={errorNoticeTextStyle}>{uiText(engagementMessage)}</div> : null}
                  <div style={formGridStyle}>
                    <label style={labelStyle}>{t("finance.quotation.engagement.date")}<input ref={confirmationDateRef} type="date" value={confirmationForm.confirmedOn} aria-invalid={Boolean(confirmationErrors.confirmedOn)} onChange={(event) => { const confirmedOn = event.target.value; setConfirmationForm({ ...confirmationForm, confirmedOn }); if (confirmedOn) { setConfirmationErrors((current) => { const next = { ...current }; delete next.confirmedOn; return next; }); setEngagementMessage(""); } }} style={{ ...inputStyle, ...(confirmationErrors.confirmedOn ? invalidEngagementInputStyle : {}) }} />{confirmationErrors.confirmedOn ? <span style={engagementFieldErrorStyle}>{uiText(confirmationErrors.confirmedOn || "")}</span> : null}</label>
                    <label style={labelStyle}>{t("finance.quotation.engagement.channel")}<select ref={confirmationChannelRef} value={confirmationForm.channel} aria-invalid={Boolean(confirmationErrors.channel)} onChange={(event) => { const channel = event.target.value; setConfirmationForm({ ...confirmationForm, channel }); if (channel) { setConfirmationErrors((current) => { const next = { ...current }; delete next.channel; return next; }); setEngagementMessage(""); } }} style={{ ...inputStyle, ...(confirmationErrors.channel ? invalidEngagementInputStyle : {}) }}><option value="">{t("finance.quotation.engagement.selectChannel")}</option><option value="line">LINE</option><option value="email">{t("finance.quotation.detail.email")}</option><option value="phone">{t("finance.quotation.form.phone")}</option><option value="meeting">{t("finance.quotation.engagement.meeting")}</option><option value="written">{t("finance.quotation.engagement.written")}</option><option value="other">{t("finance.quotation.classification.other")}</option></select>{confirmationErrors.channel ? <span style={engagementFieldErrorStyle}>{uiText(confirmationErrors.channel || "")}</span> : null}</label>
                    <label style={wideLabelStyle}>{t("finance.quotation.engagement.note")}<textarea value={confirmationForm.note} maxLength={4000} onChange={(event) => setConfirmationForm({ ...confirmationForm, note: event.target.value })} style={textareaStyle} /></label>
                  </div>
                  <div style={engagementConfirmationActionsStyle}><button type="button" onClick={() => { setEngagementChoice(null); setConfirmationErrors({}); setEngagementMessage(""); }} disabled={saving} style={secondaryButtonStyle}>{t("finance.quotation.detail.cancel")}</button><button type="button" onClick={() => void confirmAcceptedQuotationEngagement()} disabled={saving} style={primaryButtonStyle}>{saving ? t("finance.quotation.engagement.confirming") : t("finance.quotation.engagement.confirm")}</button></div>
                </div> : null}
              </>}
            </div>
          ) : null}

          <div style={cardStyle}>
            <div style={detailGridStyle}>
              <Detail label={t("finance.quotation.detail.status")} value={<StatusBadge status={quotation.status} />} />
              <Detail label={t("finance.quotation.form.customer")} value={renderQuotationClientName(quotation, lookups.clients)} />
              <Detail label={t("finance.quotation.source.customer")} value={quotation.customer_source_type === "prospect" || (!quotation.client_id && getSnapshotString(quotation.client_snapshot_json, "source_type") === "prospect") ? t("finance.quotation.form.prospect") : t("finance.quotation.form.existingClient")} />
              {quotation.customer_source_type === "prospect" || getSnapshotString(quotation.client_snapshot_json, "source_type") === "prospect" ? <>
                <Detail label={t("finance.quotation.form.contact")} value={quotation.prospect_contact_person || getSnapshotString(quotation.client_snapshot_json, "contact_person") || "-"} />
                <Detail label={t("finance.quotation.form.phone")} value={quotation.prospect_phone || getSnapshotString(quotation.client_snapshot_json, "phone") || "-"} />
                <Detail label={t("finance.quotation.detail.email")} value={quotation.prospect_email || getSnapshotString(quotation.client_snapshot_json, "email") || "-"} />
                <Detail label={t("finance.quotation.form.taxId")} value={quotation.prospect_tax_id || getSnapshotString(quotation.client_snapshot_json, "tax_id") || "-"} />
                <Detail label={t("finance.quotation.form.address")} value={quotation.prospect_address || getSnapshotString(quotation.client_snapshot_json, "address") || "-"} />
              </> : null}
              <Detail label={t("finance.quotation.detail.matter")} value={renderMatterLink(quotation, lookups, locale)} />
              {!quotation.case_id && !quotation.advisory_matter_id ? <Detail label={t("finance.quotation.source.matterDetails")} value={quotation.unlinked_matter_description || getSnapshotString(quotation.matter_snapshot_json, "description") || "-"} /> : null}
              <Detail label={t("finance.quotation.form.issueDate")} value={uiDate(quotation.issue_date)} />
              <Detail label={t("finance.quotation.form.validUntil")} value={uiDate(quotation.valid_until)} />
              <Detail label={t("finance.quotation.totals.payable")} value={formatMoney(toAmount(quotation.grand_total))} />
              <Detail label={t("finance.quotation.scope.label")} value={quotation.scope_of_legal_services || "-"} />
              <Detail label={t("finance.quotation.scope.included")} value={quotation.included_services || "-"} />
              <Detail label={t("finance.quotation.scope.excluded")} value={quotation.excluded_services || "-"} />
              <Detail label={t("finance.quotation.detail.signer")} value={renderSignerDetail(quotation)} />
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>{t("finance.quotation.detail.items")}</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>{t("finance.quotation.form.description")}</th>
                    <th style={rightThStyle}>{t("finance.quotation.form.quantity")}</th>
                    <th style={rightThStyle}>{t("finance.quotation.form.unitPrice")}</th>
                    <th style={rightThStyle}>{t("finance.quotation.detail.beforeTax")}</th>
                    <th style={rightThStyle}>{t("finance.quotation.totals.vat")}</th>
                    <th style={rightThStyle}>{t("finance.quotation.form.lineTotal")}</th>
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
              <Detail label={t("finance.quotation.form.note")} value={quotation.note || "-"} />
              <Detail label={t("finance.quotation.form.internalNote")} value={quotation.internal_note || "-"} />
              {quotation.cancel_reason ? <Detail label={t("finance.quotation.detail.cancelPrompt")} value={quotation.cancel_reason} /> : null}
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
  if (form.customer_mode === "existing_client" && !form.client_id) return uiMessage("finance.quotation.validation.client");
  if (form.customer_mode === "prospect" && !form.prospect_name.trim()) return uiMessage("finance.quotation.validation.prospect");
  if (!form.issue_date) return uiMessage("finance.quotation.validation.issueDate");
  if (form.valid_until && form.valid_until < form.issue_date) return uiMessage("finance.quotation.validation.validUntil");
  if (form.matter_mode === "case" && !form.case_id) return uiMessage("finance.quotation.engagement.caseRequired");
  if (form.matter_mode === "advisory" && !form.advisory_matter_id) return uiMessage("finance.quotation.engagement.advisoryRequired");
  if (form.case_id && form.advisory_matter_id) return uiMessage("finance.quotation.validation.singleMatter");
  if (!form.authorized_signer_key) return uiMessage("finance.quotation.validation.signer");
  if (items.length === 0) return uiMessage("finance.quotation.validation.itemRequired");
  for (const item of items) {
    if (!item.description.trim()) return uiMessage("finance.quotation.validation.description");
    if (!item.economic_classification) return uiMessage("finance.quotation.validation.classification");
    if (!item.unit.trim()) return uiMessage("finance.quotation.validation.unit");
    if (toAmount(item.quantity) <= 0) return uiMessage("finance.quotation.validation.quantity");
    if (toAmount(item.unit_price) < 0) return uiMessage("finance.quotation.validation.unitPrice");
  }
  return "";
}

function validateDraftSavePayload(payload: Record<string, unknown>, totals: ReturnType<typeof computeTotals>) {
  const requiredStrings = ["p_quotation_id", "p_issue_date", "p_authorized_signer_key"];
  if (requiredStrings.some((key) => typeof payload[key] !== "string" || !String(payload[key]).trim())) return uiMessage("finance.quotation.validation.requiredFields");
  const clientSnapshot = payload.p_client_snapshot_json && typeof payload.p_client_snapshot_json === "object"
    ? payload.p_client_snapshot_json as Record<string, unknown>
    : {};
  if (!payload.p_client_id && (clientSnapshot.source_type !== "prospect" || !String(clientSnapshot.name || "").trim())) return uiMessage("finance.quotation.validation.prospectIdentity");
  if (payload.p_case_id && payload.p_advisory_matter_id) return uiMessage("finance.quotation.validation.singleMatter");
  if (typeof payload.p_issue_date === "string" && typeof payload.p_valid_until === "string" && payload.p_valid_until && payload.p_valid_until < payload.p_issue_date) return uiMessage("finance.quotation.validation.validUntil");
  const numericKeys = ["p_subtotal_vatable", "p_subtotal_non_vatable", "p_vat_amount", "p_grand_total"];
  if (numericKeys.some((key) => !Number.isFinite(Number(payload[key])))) return uiMessage("finance.quotation.validation.invalidTotal");
  if (roundMoney(Number(payload.p_grand_total)) !== totals.grandTotal) return uiMessage("finance.quotation.validation.totalMismatch");
  if (!Array.isArray(payload.p_items) || payload.p_items.length === 0) return uiMessage("finance.quotation.validation.noItems");
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
  return hasInvalidItem ? uiMessage("finance.quotation.validation.invalidItem") : "";
}

function getQuotationDraftSaveErrorMessage(error: { code?: string | null; message?: string | null }) {
  const message = error.message || "";
  if (error.code === "23503" || /already used in Payment Terms|downstream documents|Payment Terms exist/i.test(message)) {
    return /commercial amounts/i.test(message)
      ? uiMessage("finance.quotation.error.amountsReferenced")
      : /Payment Terms exist/i.test(message)
        ? uiMessage("finance.quotation.error.itemsReferenced")
      : uiMessage("finance.quotation.error.itemReferenced");
  }
  return uiMessage("finance.quotation.error.saveFailed");
}

function getQuotationStatusErrorMessage(error: { message?: string | null }) {
  const message = String(error.message || "").toLowerCase();
  if (message.includes("prospect identity")) return uiMessage("finance.quotation.error.prospectIncomplete");
  if (message.includes("payment terms are required")) return uiMessage("finance.quotation.error.termsRequired");
  if (message.includes("percentage payment installments")) return uiMessage("finance.quotation.error.percentageIncomplete");
  if (message.includes("payment terms totals") || message.includes("payment allocation") || message.includes("quotation totals")) return uiMessage("finance.quotation.error.termsMismatch");
  if (message.includes("installment") || message.includes("trigger data")) return uiMessage("finance.quotation.error.installmentIncomplete");
  return uiMessage("finance.quotation.error.statusFailed");
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
        vat_treatment_json: item.vat_treatment_json || null,
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
        vat_treatment_json: normalized.vat_treatment_json || null,
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
      message: uiMessage("finance.quotation.validation.unmappedDescription", { description: unresolvedNewItem.description.trim() || "-" }),
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
        message: uiMessage("finance.quotation.validation.staleInstallment", { number: installmentIndex + 1 }),
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
      message: uiMessage("finance.quotation.error.unmappedItem"),
      issue: { message: "", installmentIndex: 0, field: "title" as const },
    };
  }
  for (const [installmentIndex, installment] of installments.entries()) {
    if ((installment.items || []).some((allocation) => !allocation.client_item_key || !itemKeys.includes(allocation.client_item_key))) {
      return {
        message: uiMessage("finance.quotation.error.unmappedTerm"),
        issue: { message: "", installmentIndex, field: "trigger" as const },
      };
    }
  }
  return null;
}

function getAtomicDraftCreateErrorMessage(error: { message?: string | null } | null) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("prospect name")) return uiMessage("finance.quotation.validation.prospect");
  if (message.includes("quotation client not found")) return uiMessage("finance.quotation.error.clientNotFound");
  if (message.includes("invalid line items")) return uiMessage("finance.quotation.error.itemsIncomplete");
  if (message.includes("allocation item") || message.includes("client item key")) return uiMessage("finance.quotation.error.termItemMismatch");
  if (message.includes("invalid installment data")) return uiMessage("finance.quotation.error.installmentsIncomplete");
  if (message.includes("at least two non-recurring installments")) return uiMessage("finance.quotation.error.installmentMethod");
  if (message.includes("milestone payment terms require") || message.includes("recurring payment terms require") || message.includes("manual payment terms require")) return uiMessage("finance.quotation.error.methodTriggerMismatch");
  if (message.includes("percentage") && message.includes("exceed")) return uiMessage("finance.quotation.error.overPercentage");
  return uiMessage("finance.quotation.error.createFailed");
}

function getAtomicDraftEditErrorMessage(error: { code?: string | null; message?: string | null } | null) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("allocation item") || message.includes("could not be mapped")) return uiMessage("finance.quotation.error.termItemMismatch");
  if (message.includes("invalid installment data") || message.includes("invalid payment terms")) return uiMessage("finance.quotation.error.allocationReview");
  if (message.includes("percentage") && (message.includes("exceed") || message.includes("invalid"))) return uiMessage("finance.quotation.error.itemProportions");
  if (message.includes("only draft")) return uiMessage("finance.quotation.error.notDraft");
  if (message.includes("not allowed")) return uiMessage("finance.quotation.error.permission");
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
  const vatRate = vatApplicable ? (item.vat_rate === "" ? 7 : toAmount(item.vat_rate)) : 0;
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
  const { t } = useI18n();
  const serviceValueBeforeVat = roundMoney(subtotalVatable + subtotalNonVatable);
  return <div style={totalsGridStyle}>
    <SummaryLine label={t("finance.quotation.totals.serviceBeforeVat")} value={serviceValueBeforeVat} prominent />
    <SummaryLine label={t("finance.quotation.totals.nonVat")} value={subtotalNonVatable} indented />
    <SummaryLine label={t("finance.quotation.totals.taxableBase")} value={subtotalVatable} indented />
    <SummaryLine label={t("finance.quotation.totals.vat")} value={vatAmount} tax />
    <SummaryLine label={t("finance.quotation.totals.payable")} value={grandTotal} strong />
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
  const { t } = useI18n();
  const mode = item.price_tax_mode || (item.vat_applicable ? "vat_exclusive" : "non_vat");
  if (mode === "non_vat") return <div style={lineItemTaxExplanationStyle}>{t("finance.quotation.tax.outsideScope")}</div>;
  if (mode === "vat_inclusive") return <div style={lineItemTaxExplanationStyle}>{t("finance.quotation.tax.inclusiveExplanation", { base: formatMoney(toAmount(item.amount_before_tax)), vat: formatMoney(toAmount(item.vat_amount)), total: formatMoney(toAmount(item.line_total)) })}</div>;
  return <div style={lineItemTaxExplanationStyle}>{t("finance.quotation.tax.exclusiveExplanation", { base: formatMoney(toAmount(item.amount_before_tax)), vat: formatMoney(toAmount(item.vat_amount)), total: formatMoney(toAmount(item.line_total)) })}</div>;
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
  const { t } = useI18n();
  const normalized = String(status || "draft").toLowerCase();
  const style = statusStyles[normalized] || statusStyles.draft;
  return <span style={{ ...badgeStyle, ...style }}>{["draft", "sent", "accepted", "cancelled"].includes(normalized) ? t(`finance.quotation.status.${normalized}`) : normalized}</span>;
}

function getReadonlyMessage(status: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "accepted") return uiMessage("finance.quotation.readOnly.accepted");
  if (normalized === "cancelled") return uiMessage("finance.quotation.readOnly.cancelled");
  if (normalized === "sent") return uiMessage("finance.quotation.readOnly.sent");
  return uiMessage("finance.quotation.readOnly.draftOnly");
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

function renderMatterLink(quotation: Pick<QuotationRow, "case_id" | "advisory_matter_id" | "matter_snapshot_json" | "unlinked_matter_name">, lookups: LookupState, locale: UiLocale = "th") {
  if (quotation.case_id) {
    const caseItem = lookups.cases.find((item) => String(item.id) === String(quotation.case_id));
    return translate(locale, "finance.quotation.matter.case", { name: caseItem ? renderCaseLabel(caseItem) : quotation.case_id });
  }
  if (quotation.advisory_matter_id) {
    const matter = lookups.matters.find((item) => item.id === quotation.advisory_matter_id);
    return translate(locale, "finance.quotation.matter.advisory", { name: matter ? renderMatterLabel(matter) : quotation.advisory_matter_id });
  }
  return quotation.unlinked_matter_name || getSnapshotString(quotation.matter_snapshot_json, "title") || translate(locale, "finance.quotation.matter.unlinked");
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
  if (message.includes("confirmation date is required")) return uiMessage("finance.quotation.engagement.dateRequired");
  if (message.includes("future")) return uiMessage("finance.quotation.engagement.futureDate");
  if (message.includes("channel")) return uiMessage("finance.quotation.engagement.invalidChannel");
  if (message.includes("note must not exceed")) return uiMessage("finance.quotation.engagement.noteLength");
  if (message.includes("Quotation not found")) return uiMessage("finance.quotation.engagement.notFound");
  if (message.includes("Link this accepted prospect quotation")) return uiMessage("finance.quotation.engagement.linkClient");
  if (message.includes("no frozen document snapshot")) return uiMessage("finance.quotation.engagement.noSnapshot");
  if (message.includes("Linked Client not found")) return uiMessage("finance.quotation.engagement.noClient");
  if (message.includes("Linked Case not found")) return uiMessage("finance.quotation.engagement.noCase");
  if (message.includes("Linked Advisory matter not found")) return uiMessage("finance.quotation.engagement.noAdvisory");
  if (message.includes("Conflicting commercial engagements")) return uiMessage("finance.quotation.engagement.conflicting");
  if (message.includes("already exists with different")) return uiMessage("finance.quotation.engagement.differentConfirmation");
  if (message.includes("formal Fee Agreement") || message.includes("formal Fee Agreement already exists")) return uiMessage("finance.quotation.engagement.agreementExists");
  if (message.includes("Not allowed")) return uiMessage("finance.quotation.engagement.permission");
  if (message.includes("Only accepted")) return uiMessage("finance.quotation.engagement.notAccepted");
  return uiMessage("finance.quotation.engagement.failed");
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
