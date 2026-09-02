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

function sameNullableId(left: number | string | null | undefined, right: number | string | null | undefined): boolean {
  if (left == null || right == null) return left == null && right == null;
  return String(left) === String(right);
}
