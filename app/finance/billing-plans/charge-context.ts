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

function sameNullableId(left: number | string | null | undefined, right: number | string | null | undefined): boolean {
  if (left == null || right == null) return left == null && right == null;
  return String(left) === String(right);
}
