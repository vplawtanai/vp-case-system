import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { billingPlanInvoiceSelectionResumeHref, billingPlanReadyChargeCompletionState, canAddChargeFromInstallment, filterChargesForBillingContext, historicalInstallmentClassificationItems, historicalInstallmentClassificationPrompt, invoiceCompositionMode, partitionChargesByWorkflow } from "./charge-context.ts";

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

  assert.deepEqual(historicalInstallmentClassificationItems([historical, prospective], false), [historical]);
  assert.deepEqual(historicalInstallmentClassificationItems([historical, prospective], true), []);
  assert.deepEqual(historicalInstallmentClassificationItems([prospective], false), []);
});

test("Historical classification prompt describes the only missing fact without changing money or VAT", () => {
  assert.deepEqual(historicalInstallmentClassificationPrompt("10,000.00 THB"), {
    title: "ระบุประเภทรายการตามแผน",
    description: "งวดนี้สร้างจากข้อมูลเดิมที่ยังไม่ได้ระบุประเภทรายการ กรุณาเลือกประเภทสำหรับยอด 10,000.00 THB โดยยอดเงินและ VAT จะไม่เปลี่ยนแปลง",
    action: "เลือกประเภทรายการ",
  });
});
