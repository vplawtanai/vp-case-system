import type { InvoicePaymentDestination } from "./shared";

export function guidedInvoiceDocumentDefaults(source: {
  dueDate: string | null;
  billingTrigger: string | null;
}) {
  return {
    dueDate: source.dueDate || "",
    paymentInstructions: "",
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
