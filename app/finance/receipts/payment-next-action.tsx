"use client";
import { FinanceDocumentNextAction } from "../document-decision/next-action";

export function PaymentReceiptNextAction({ paymentId, paymentStatus }: { paymentId: string; paymentStatus: string }) {
  return paymentStatus === "confirmed" ? <FinanceDocumentNextAction paymentId={paymentId} /> : null;
}
