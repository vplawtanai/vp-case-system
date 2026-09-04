import type { InvoicePaymentDestination } from "./shared";

// Production deployment boundary after which guided composition stopped inheriting billing triggers.
const PAYMENT_INSTRUCTION_SEMANTIC_FIX_DEPLOYED_AT = Date.parse("2026-09-04T04:03:17Z");

export type InvoicePaymentInstructionContext = {
  documentStatus: string;
  sourceModel: string;
  v2BridgeId: string | null;
  createdAt: string;
  paymentInstructions: string | null | undefined;
  billingTrigger: string | null | undefined;
};

export function guidedInvoiceDocumentDefaults(source: {
  dueDate: string | null;
  billingTrigger: string | null;
}) {
  return {
    dueDate: source.dueDate || "",
    paymentInstructions: "",
  };
}

export function resolveInvoicePaymentInstructions(context: InvoicePaymentInstructionContext) {
  const paymentInstructions = context.paymentInstructions?.trim() || "";
  const billingTrigger = context.billingTrigger?.trim() || "";
  const createdAt = Date.parse(context.createdAt);
  const isLegacyAutoInheritedBillingTrigger = context.documentStatus === "draft"
    && context.sourceModel === "billable_charge_v2"
    && Boolean(context.v2BridgeId)
    && Number.isFinite(createdAt)
    && createdAt < PAYMENT_INSTRUCTION_SEMANTIC_FIX_DEPLOYED_AT
    && Boolean(paymentInstructions)
    && paymentInstructions === billingTrigger;

  return {
    isLegacyAutoInheritedBillingTrigger,
    paymentInstructions: isLegacyAutoInheritedBillingTrigger ? "" : paymentInstructions,
  };
}

export function invoicePaymentSectionModel({
  paymentDestination,
  paymentInstructions,
  customerNote,
}: {
  paymentDestination: InvoicePaymentDestination | null;
  paymentInstructions: string | null | undefined;
  customerNote: string | null | undefined;
}) {
  const normalizedInstructions = paymentInstructions?.trim() || null;
  const normalizedCustomerNote = customerNote?.trim() || null;

  return {
    paymentInstructions: normalizedInstructions,
    customerNote: normalizedCustomerNote,
    showSection: Boolean(paymentDestination || normalizedInstructions || normalizedCustomerNote),
  };
}

export function invoiceDraftDatesAreValid(issueDate: string, dueDate: string) {
  return !issueDate || !dueDate || dueDate >= issueDate;
}
