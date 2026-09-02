export type BillableChargeSourceType = "ad_hoc_service" | "recoverable_cost" | "billing_installment_item";
export type ClientCostFundingMode = "collect_before_disbursement" | "reimburse_after_advance";

export function billableChargeNatureLabel(value: BillableChargeSourceType | string) {
  if (value === "recoverable_cost") return "ค่าธรรมเนียม / ค่าใช้จ่ายแทนลูกค้า";
  if (value === "billing_installment_item") return "รายการจากแผนเรียกเก็บเงิน";
  return "ค่าบริการ / งานเพิ่มเติม";
}

export function clientCostFundingModeLabel(value: ClientCostFundingMode | null | undefined) {
  if (value === "collect_before_disbursement") return "เรียกเก็บจากลูกค้าก่อน แล้วจึงนำไปชำระ";
  if (value === "reimburse_after_advance") return "VP สำรองจ่ายแล้ว และเรียกคืนจากลูกค้า";
  return "ไม่ระบุ (ข้อมูลเดิม)";
}

export function fundingModeForSource(
  sourceType: BillableChargeSourceType,
  fundingMode: ClientCostFundingMode | "" | null | undefined,
) {
  return sourceType === "recoverable_cost" && fundingMode ? fundingMode : null;
}

export function clientCostFundingModeRequired(
  sourceType: BillableChargeSourceType,
  fundingMode: ClientCostFundingMode | "" | null | undefined,
) {
  return sourceType === "recoverable_cost" && !fundingMode;
}
