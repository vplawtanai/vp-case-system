export type BillingChargeContext = {
  clientId: string;
  currency: string;
  caseId: number | string | null;
  advisoryMatterId: string | null;
};

export type ContextualCharge = {
  client_id: string;
  currency: string;
  case_id: number | string | null;
  advisory_matter_id: string | null;
};

export type WorkflowCharge = {
  status: string;
};

export type SelectableAdditionalCharge = WorkflowCharge & {
  source_type: string;
  total_amount: number | string;
};

export type ReadyChargeSummary<T> = {
  charges: T[];
  visibleCharges: T[];
  count: number;
  hiddenCount: number;
  total: number;
  allInTotal: number;
};

export type InstallmentClassificationSource = {
  id: string;
  economic_classification: string | null;
};

export type HistoricalClassificationValue = {
  economicClassification: string;
  unit: string;
  confirmed: boolean;
};

export type GuidedInvoiceSourceSummary = {
  client: string;
  matter: string;
  trail: string;
};

export type InstallmentChargeActionContext = {
  canManageCharges: boolean;
  planStatus: string;
  installmentStatus: string;
  hasActiveInvoice: boolean;
};

export type BillingPlanReadyChargeCompletionState = {
  chargeCreateInstallmentId: "";
  invoiceSelectionInstallmentId: "";
  selectedInvoiceChargeIds: string[];
  selectionDetailChargeId: "";
  expandCurrentCharges: true;
};

const currentChargeStatuses = new Set(["draft", "ready_to_invoice", "reserved"]);
const historicalChargeStatuses = new Set(["invoiced", "cancelled"]);

export function filterChargesForBillingContext<T extends ContextualCharge>(charges: T[], context: BillingChargeContext | null): T[] {
  if (!context) return [];
  return charges.filter((charge) => isChargeInBillingContext(charge, context));
}

export function isChargeInBillingContext(charge: ContextualCharge, context: BillingChargeContext): boolean {
  return charge.client_id === context.clientId
    && charge.currency === context.currency
    && sameNullableId(charge.case_id, context.caseId)
    && sameNullableId(charge.advisory_matter_id, context.advisoryMatterId);
}

export function partitionChargesByWorkflow<T extends WorkflowCharge>(charges: T[]): { current: T[]; history: T[] } {
  return charges.reduce<{ current: T[]; history: T[] }>((result, charge) => {
    if (currentChargeStatuses.has(charge.status)) result.current.push(charge);
    if (historicalChargeStatuses.has(charge.status)) result.history.push(charge);
    return result;
  }, { current: [], history: [] });
}

export function filterSelectableReadyCharges<T extends SelectableAdditionalCharge>(charges: T[]): T[] {
  return charges.filter((charge) => charge.status === "ready_to_invoice" && charge.source_type !== "billing_installment_item");
}

export function currentChargeOverviewRows<T extends WorkflowCharge>(charges: T[], readyPreviewShown: boolean): T[] {
  return readyPreviewShown ? charges.filter((charge) => charge.status !== "ready_to_invoice") : charges;
}

export function summarizeReadyCharges<T extends SelectableAdditionalCharge>(charges: T[], installmentTotal: number | string, visibleLimit = 3): ReadyChargeSummary<T> {
  const total = charges.reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const visibleCharges = charges.slice(0, Math.max(0, visibleLimit));

  return {
    charges,
    visibleCharges,
    count: charges.length,
    hiddenCount: charges.length - visibleCharges.length,
    total,
    allInTotal: Number(installmentTotal || 0) + total,
  };
}

export function canAddChargeFromInstallment(context: InstallmentChargeActionContext): boolean {
  return context.canManageCharges
    && ["draft", "active"].includes(context.planStatus)
    && ["pending", "ready_to_invoice"].includes(context.installmentStatus)
    && !context.hasActiveInvoice;
}

export function billingPlanReadyChargeCompletionState(): BillingPlanReadyChargeCompletionState {
  return {
    chargeCreateInstallmentId: "",
    invoiceSelectionInstallmentId: "",
    selectedInvoiceChargeIds: [],
    selectionDetailChargeId: "",
    expandCurrentCharges: true,
  };
}

export function billingPlanInvoiceSelectionResumeHref(planId: string, installmentId: string, chargeIds: string[]): string {
  const params = new URLSearchParams({ resumeInvoiceForInstallment: installmentId });
  [...new Set(chargeIds)].forEach((chargeId) => params.append("resumeCharge", chargeId));
  return `/finance/billing-plans/${planId}?${params.toString()}`;
}

export function invoiceCompositionMode(requestedInstallmentId: string): "billing_plan_guided" | "standalone" {
  return requestedInstallmentId ? "billing_plan_guided" : "standalone";
}

export function historicalInstallmentClassificationItems<T extends InstallmentClassificationSource>(items: T[], hasBridge: boolean): T[] {
  return hasBridge ? [] : items.filter((item) => !item.economic_classification);
}

export function updateHistoricalClassification(
  current: Record<string, HistoricalClassificationValue>,
  itemId: string,
  economicClassification: string,
  unit: string,
): Record<string, HistoricalClassificationValue> {
  return {
    ...current,
    [itemId]: {
      economicClassification,
      unit,
      confirmed: Boolean(economicClassification),
    },
  };
}

export function guidedInvoiceSourceSummary({
  client,
  matter,
  quotationReference,
  installmentNo,
}: {
  client: string | null | undefined;
  matter: string;
  quotationReference: string | null | undefined;
  installmentNo: number | null | undefined;
}): GuidedInvoiceSourceSummary {
  return {
    client: client || "ไม่พบชื่อลูกค้า",
    matter,
    trail: [quotationReference || "ไม่พบเลขอ้างอิง", installmentNo ? `งวดที่ ${installmentNo}` : "ไม่พบข้อมูลงวด"].join(" · "),
  };
}

function sameNullableId(left: number | string | null | undefined, right: number | string | null | undefined): boolean {
  if (left == null || right == null) return left == null && right == null;
  return String(left) === String(right);
}
