import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildBillingPlanDraftFromFeeAgreement } from "./draft.ts";

test("prospective commercial semantics follow a quotation item into Billing Plan allocations", () => {
  const result = buildBillingPlanDraftFromFeeAgreement({
    agreementNo: "VP-AG-TEST",
    agreementTitle: "Test",
    billingMethod: "installments",
    engagementBasis: "accepted_quotation",
    sourceDocumentSnapshot: {
      payment_terms: {
        version: 2,
        installments: [{
          installment_no: 1,
          title: "งวดที่ 1",
          trigger_type: "manual",
          trigger_description: "กำหนดชำระภายใน 15 วัน",
          due_date: "2026-09-30",
          items: [{ quotation_item_id: "quotation-item-1", allocated_amount_before_tax: 9345.79, allocated_vat_amount: 654.21, allocated_total: 10000 }],
        }],
      },
    },
    agreementItems: [{
      id: "agreement-item-1",
      source_quotation_item_id: "quotation-item-1",
      description: "ค่าบริการวิชาชีพ",
      unit: "งาน",
      economic_classification: "professional_fee",
      amount_before_tax: 9345.79,
      vat_amount: 654.21,
      line_total: 10000,
      sort_order: 0,
    }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.payload.installments[0].items[0].semantic_snapshot_json, {
    schema_version: "1",
    source_type: "fee_agreement_item",
    source_fee_agreement_item_id: "agreement-item-1",
    source_quotation_item_id: "quotation-item-1",
    unit: "งาน",
    economic_classification: "professional_fee",
  });
  assert.equal(result.payload.installments[0].due_date, "2026-09-30");
  assert.equal(result.payload.installments[0].trigger_description, "กำหนดชำระภายใน 15 วัน");
});

test("historical items without semantics remain explicit fallback candidates", () => {
  const result = buildBillingPlanDraftFromFeeAgreement({
    agreementNo: null,
    agreementTitle: "Historical",
    billingMethod: "single",
    sourceDocumentSnapshot: { payment_terms: { installments: [{ installment_no: 1, items: [{ quotation_item_id: "old-item", allocated_amount_before_tax: 100, allocated_vat_amount: 0, allocated_total: 100 }] }] } },
    agreementItems: [{ id: "agreement-item", source_quotation_item_id: "old-item", description: "Historical item", unit: null, economic_classification: null, amount_before_tax: 100, vat_amount: 0, line_total: 100, sort_order: 0 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.installments[0].items[0].semantic_snapshot_json, null);
});
