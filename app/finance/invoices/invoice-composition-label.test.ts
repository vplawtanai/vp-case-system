import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { invoiceCompositionSourceLabel } from "./shared.ts";
import type { InvoiceCompositionItem } from "./shared";

function item(sourceType: string, state = "active"): InvoiceCompositionItem {
  return { source_state: state, source_snapshot_json: { ready_snapshot: { source: { source_type: sourceType } } } };
}

test("installment-only V2 uses the Billing Plan label, regardless of item count", () => {
  for (const items of [[item("billing_installment_item")], [item("billing_installment_item"), item("billing_installment_item")]]) {
    assert.equal(invoiceCompositionSourceLabel("billable_charge_v2", items), "ยอดตามแผนเรียกเก็บเงิน");
  }
});

test("additional-only V2 recognizes service and recoverable-cost Charges", () => {
  for (const items of [[item("ad_hoc_service")], [item("recoverable_cost")], [item("ad_hoc_service"), item("recoverable_cost")]]) {
    assert.equal(invoiceCompositionSourceLabel("billable_charge_v2", items), "รายการเรียกเก็บเพิ่มเติม");
  }
});

test("mixed V2 requires both effective source types", () => {
  for (const additionalType of ["ad_hoc_service", "recoverable_cost"]) {
    const items = [item("billing_installment_item"), item(additionalType)];
    assert.equal(invoiceCompositionSourceLabel("billable_charge_v2", items), "ยอดตามแผน + รายการเรียกเก็บเพิ่มเติม");
    assert.equal(invoiceCompositionSourceLabel("billable_charge_v2", [...items].reverse()), "ยอดตามแผน + รายการเรียกเก็บเพิ่มเติม");
  }
});

test("released composition history cannot make an installment-only Draft look mixed", () => {
  const items = [item("billing_installment_item"), item("ad_hoc_service", "released"), item("recoverable_cost", "released")];
  assert.equal(invoiceCompositionSourceLabel("billable_charge_v2", items), "ยอดตามแผนเรียกเก็บเงิน");
  assert.equal(invoiceCompositionSourceLabel("billable_charge_v2", [item("billing_installment_item", "released"), item("ad_hoc_service")]), "รายการเรียกเก็บเพิ่มเติม");
});

test("missing or unknown V2 source evidence is not guessed from the source model", () => {
  for (const items of [[], [item("billing_installment_item", "released")], [{ source_state: "active", source_snapshot_json: null }], [item("unknown")], [item("billing_installment_item"), item("unknown")]]) {
    assert.equal(invoiceCompositionSourceLabel("billable_charge_v2", items), "ไม่สามารถระบุที่มาของยอดเรียกเก็บ");
  }
});

test("historical V1 preserves list labeling and the detail engagement reference", () => {
  assert.equal(invoiceCompositionSourceLabel("installment_v1", []), "ยอดตามแผนเรียกเก็บเงิน");
  assert.equal(invoiceCompositionSourceLabel("installment_v1", [], "VP-AG-2026-000004"), "VP-AG-2026-000004");
  assert.equal(invoiceCompositionSourceLabel("installment_v1", [], "การว่าจ้างตามใบเสนอราคา"), "การว่าจ้างตามใบเสนอราคา");
});

test("classification is presentation-only and does not change source evidence or values", () => {
  const items = [Object.freeze({ ...item("billing_installment_item"), description: "Original description", line_total: "5000.00", vat_amount: "327.10" })];
  const before = JSON.stringify(items);
  assert.equal(invoiceCompositionSourceLabel("billable_charge_v2", Object.freeze(items)), "ยอดตามแผนเรียกเก็บเงิน");
  assert.equal(JSON.stringify(items), before);
});

test("Draft and Issued detail surfaces and Invoice list use the same source resolver", () => {
  const detail = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(detail, /const invoiceSourceLabel = invoiceCompositionSourceLabel\(invoice.source_model, items, engagementReference\)/);
  assert.match(detail, /<SourceNode label="ที่มาของยอดเรียกเก็บ">\{invoiceSourceLabel\}/);
  assert.match(detail, /<Field label="แหล่งข้อมูล" value=\{invoiceSourceLabel\}/);
  assert.match(detail, /<Field label="รูปแบบการรวบรวมยอด" value=\{invoiceSourceLabel\}/);
  assert.match(list, /finance_invoice_items\(source_state,source_snapshot_json\)/);
  assert.match(list, /invoiceCompositionSourceLabel\(invoice.source_model, invoice.finance_invoice_items \|\| \[\]\)/);
  assert.doesNotMatch(detail + list, /v2Bridge \? "ยอดตามแผน|v2_bridge_id \? "ยอดตามแผน|แบบรวมรายการ/);
});
