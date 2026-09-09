"use client";
import { FinanceDocumentNextAction } from "../document-decision/next-action";

export function TaxInvoiceNextAction({ paymentId }: { paymentId: string }) {
  return <FinanceDocumentNextAction paymentId={paymentId} />;
}
