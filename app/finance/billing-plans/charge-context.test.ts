import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { billingPlanInvoiceSelectionResumeHref, billingPlanReadyChargeCompletionState, canAddChargeFromInstallment, currentChargeOverviewRows, filterChargesForBillingContext, filterSelectableReadyCharges, guidedInvoiceSourceSummary, historicalInstallmentClassificationItems, invoiceCompositionMode, partitionChargesByWorkflow, summarizeReadyCharges, updateHistoricalClassification } from "./charge-context.ts";

const advisoryContext = { clientId: "client-1", currency: "THB", caseId: null, advisoryMatterId: "advisory-1" };
const caseContext = { clientId: "client-1", currency: "THB", caseId: 42, advisoryMatterId: null };
const unlinkedContext = { clientId: "client-1", currency: "THB", caseId: null, advisoryMatterId: null };

const charge = (overrides: Partial<{ id: string; client_id: string; currency: string; case_id: number | string | null; advisory_matter_id: string | null }> = {}) => ({
  id: overrides.id || "charge-1",
  client_id: overrides.client_id || "client-1",
  currency: overrides.currency || "THB",
  case_id: overrides.case_id === undefined ? null : overrides.case_id,
  advisory_matter_id: overrides.advisory_matter_id === undefined ? null : overrides.advisory_matter_id,
});

test("Advisory plan excludes unlinked Charges", () => {
  assert.deepEqual(filterChargesForBillingContext([charge()], advisoryContext), []);
});

test("Advisory plan includes only the same Advisory", () => {
  const matching = charge({ id: "matching", advisory_matter_id: "advisory-1" });
  const other = charge({ id: "other", advisory_matter_id: "advisory-2" });
  assert.deepEqual(filterChargesForBillingContext([matching, other], advisoryContext), [matching]);
});

test("Case plan excludes unlinked Charges and accepts equivalent bigint text", () => {
  const matching = charge({ id: "matching", case_id: "42" });
  assert.deepEqual(filterChargesForBillingContext([charge(), matching], caseContext), [matching]);
});

test("Unlinked plan includes unlinked Charges when Client and currency match", () => {
  const matching = charge({ id: "matching" });
  const wrongClient = charge({ id: "wrong-client", client_id: "client-2" });
  const wrongCurrency = charge({ id: "wrong-currency", currency: "USD" });
  assert.deepEqual(filterChargesForBillingContext([matching, wrongClient, wrongCurrency], unlinkedContext), [matching]);
});

test("Charge workflow separates actionable statuses from history", () => {
  const charges = [
    { id: "draft", status: "draft" },
    { id: "ready", status: "ready_to_invoice" },
    { id: "reserved", status: "reserved" },
    { id: "invoiced", status: "invoiced" },
    { id: "cancelled", status: "cancelled" },
  ];

  const result = partitionChargesByWorkflow(charges);

  assert.deepEqual(result.current.map(({ id }) => id), ["draft", "ready", "reserved"]);
  assert.deepEqual(result.history.map(({ id }) => id), ["invoiced", "cancelled"]);
});

test("Ready Charge preview excludes non-ready statuses and installment-generated rows", () => {
  const charges = [
    { id: "ready", status: "ready_to_invoice", source_type: "manual", total_amount: 2_000 },
    { id: "draft", status: "draft", source_type: "manual", total_amount: 3_000 },
    { id: "reserved", status: "reserved", source_type: "manual", total_amount: 4_000 },
    { id: "invoiced", status: "invoiced", source_type: "manual", total_amount: 5_000 },
    { id: "cancelled", status: "cancelled", source_type: "manual", total_amount: 6_000 },
    { id: "installment", status: "ready_to_invoice", source_type: "billing_installment_item", total_amount: 10_000 },
  ];

  assert.deepEqual(filterSelectableReadyCharges(charges).map(({ id }) => id), ["ready"]);
});

test("Ready Charge preview supports zero and multiple Charges without implying selection", () => {
  assert.deepEqual(summarizeReadyCharges([], 10_000), {
    charges: [],
    visibleCharges: [],
    count: 0,
    hiddenCount: 0,
    total: 0,
    allInTotal: 10_000,
  });

  const charges = [
    { id: "travel", status: "ready_to_invoice", source_type: "manual", total_amount: 2_000 },
    { id: "translation", status: "ready_to_invoice", source_type: "manual", total_amount: "3000" },
    { id: "court", status: "ready_to_invoice", source_type: "recoverable_cost", total_amount: 5_000 },
    { id: "filing", status: "ready_to_invoice", source_type: "manual", total_amount: 750 },
  ];
  const summary = summarizeReadyCharges(charges, 10_000);

  assert.equal(summary.count, 4);
  assert.equal(summary.visibleCharges.length, 3);
  assert.equal(summary.hiddenCount, 1);
  assert.equal(summary.total, 10_750);
  assert.equal(summary.allInTotal, 20_750);
  assert.deepEqual(summary.charges, charges);
});

test("Ready Charges are not duplicated in the current-items overview while the installment preview is shown", () => {
  const charges = [
    { id: "draft", status: "draft" },
    { id: "ready", status: "ready_to_invoice" },
    { id: "reserved", status: "reserved" },
  ];

  assert.deepEqual(currentChargeOverviewRows(charges, true).map(({ id }) => id), ["draft", "reserved"]);
  assert.deepEqual(currentChargeOverviewRows(charges, false), charges);
});

test("Additional Charge shortcut follows installment and Invoice lifecycle", () => {
  const base = { canManageCharges: true, planStatus: "active", hasActiveInvoice: false };

  assert.equal(canAddChargeFromInstallment({ ...base, installmentStatus: "pending" }), true);
  assert.equal(canAddChargeFromInstallment({ ...base, installmentStatus: "ready_to_invoice" }), true);
  assert.equal(canAddChargeFromInstallment({ ...base, planStatus: "draft", installmentStatus: "pending" }), true);
  assert.equal(canAddChargeFromInstallment({ ...base, installmentStatus: "ready_to_invoice", hasActiveInvoice: true }), false);
  assert.equal(canAddChargeFromInstallment({ ...base, installmentStatus: "invoiced" }), false);
  assert.equal(canAddChargeFromInstallment({ ...base, installmentStatus: "cancelled" }), false);
  assert.equal(canAddChargeFromInstallment({ ...base, planStatus: "completed", installmentStatus: "pending" }), false);
  assert.equal(canAddChargeFromInstallment({ ...base, canManageCharges: false, installmentStatus: "pending" }), false);
});

test("Ready Charge closes Billing Plan quick-add without opening Invoice selection", () => {
  assert.deepEqual(billingPlanReadyChargeCompletionState(), {
    chargeCreateInstallmentId: "",
    invoiceSelectionInstallmentId: "",
    selectedInvoiceChargeIds: [],
    selectionDetailChargeId: "",
    expandCurrentCharges: true,
  });
});

test("Guided Invoice review returns to the same Billing Plan composition", () => {
  assert.equal(
    billingPlanInvoiceSelectionResumeHref("plan-1", "installment-1", ["charge-1", "charge-1", "charge-2"]),
    "/finance/billing-plans/plan-1?resumeInvoiceForInstallment=installment-1&resumeCharge=charge-1&resumeCharge=charge-2",
  );
});

test("Invoice composition mode preserves standalone Charge-only creation", () => {
  assert.equal(invoiceCompositionMode("installment-1"), "billing_plan_guided");
  assert.equal(invoiceCompositionMode(""), "standalone");
});

test("Historical classification fallback includes only genuinely unclassified installment items", () => {
  const historical = { id: "historical", economic_classification: null };
  const prospective = { id: "prospective", economic_classification: "professional_fee" };
  const secondHistorical = { id: "second-historical", economic_classification: null };

  assert.deepEqual(historicalInstallmentClassificationItems([historical, prospective, secondHistorical], false), [historical, secondHistorical]);
  assert.deepEqual(historicalInstallmentClassificationItems([historical, prospective], true), []);
  assert.deepEqual(historicalInstallmentClassificationItems([prospective], false), []);
});

test("Historical line classification updates only the selected source item", () => {
  const initial = {
    "line-a": { economicClassification: "", unit: "", confirmed: false },
    "line-c": { economicClassification: "", unit: "item", confirmed: false },
  };

  const updated = updateHistoricalClassification(initial, "line-a", "professional_fee", "");

  assert.deepEqual(updated, {
    "line-a": { economicClassification: "professional_fee", unit: "", confirmed: true },
    "line-c": { economicClassification: "", unit: "item", confirmed: false },
  });
  assert.deepEqual(initial["line-a"], { economicClassification: "", unit: "", confirmed: false });
});

test("Clearing one historical line classification does not affect another line", () => {
  const initial = {
    "line-a": { economicClassification: "professional_fee", unit: "", confirmed: true },
    "line-c": { economicClassification: "government_or_court_fee", unit: "item", confirmed: true },
  };

  assert.deepEqual(updateHistoricalClassification(initial, "line-a", "", ""), {
    "line-a": { economicClassification: "", unit: "", confirmed: false },
    "line-c": { economicClassification: "government_or_court_fee", unit: "item", confirmed: true },
  });
});

test("Guided Invoice source context stays compact without losing its lineage", () => {
  assert.deepEqual(guidedInvoiceSourceSummary({
    client: "UAT Prospect 2026-08-14",
    matter: "ไม่ผูกกับงานเฉพาะ",
    quotationReference: "VP-QT-202609-0002",
    installmentNo: 1,
  }), {
    client: "UAT Prospect 2026-08-14",
    matter: "ไม่ผูกกับงานเฉพาะ",
    trail: "VP-QT-202609-0002 · งวดที่ 1",
  });
});
