import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { billableChargeNatureLabel, clientCostFundingModeLabel, clientCostFundingModeRequired, fundingModeForSource } from "./funding-semantics.ts";

test("service Charges cannot carry client-cost funding semantics", () => {
  assert.equal(fundingModeForSource("ad_hoc_service", "collect_before_disbursement"), null);
  assert.equal(clientCostFundingModeRequired("ad_hoc_service", null), false);
});

test("new client-cost Charges require an explicit funding mode before Ready", () => {
  assert.equal(clientCostFundingModeRequired("recoverable_cost", null), true);
  assert.equal(clientCostFundingModeRequired("recoverable_cost", "collect_before_disbursement"), false);
  assert.equal(fundingModeForSource("recoverable_cost", "reimburse_after_advance"), "reimburse_after_advance");
});

test("Thai labels keep business nature separate from funding mode", () => {
  assert.equal(billableChargeNatureLabel("recoverable_cost"), "ค่าธรรมเนียม / ค่าใช้จ่ายแทนลูกค้า");
  assert.equal(clientCostFundingModeLabel("collect_before_disbursement"), "เรียกเก็บจากลูกค้าก่อน แล้วจึงนำไปชำระ");
  assert.equal(clientCostFundingModeLabel("reimburse_after_advance"), "VP สำรองจ่ายแล้ว และเรียกคืนจากลูกค้า");
  assert.equal(clientCostFundingModeLabel(null), "ไม่ระบุ (ข้อมูลเดิม)");
});
