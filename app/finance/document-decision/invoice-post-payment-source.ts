import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserPermissions } from "../../../lib/permissions";
import type { InvoiceSettlement, EffectivePaymentAllocation, FinancePayment } from "../payments/shared";
import { documentDecisionLabels, type DocumentDecision } from "./shared";

export type DocumentReadAccess = Pick<UserPermissions, "canViewFinanceReceipts" | "canViewFinanceTaxInvoices">;
export type DocumentHeader = {
  id: string; payment_id: string; status: string; number: string | null; combined_document_id?: string | null;
};
export type PostPaymentEntry = {
  payment: Pick<FinancePayment, "id" | "status" | "internal_reference" | "currency">;
  allocation: EffectivePaymentAllocation;
  decision: DocumentDecision;
  receipts: DocumentHeader[] | null;
  taxInvoices: DocumentHeader[] | null;
  combined: DocumentHeader[] | null;
};
export type InvoicePostPaymentData = { summary: InvoiceSettlement; payments: PostPaymentEntry[] };

function cents(value: unknown) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "" || !Number.isFinite(Number(value))) {
    throw new Error("Invalid settlement read evidence");
  }
  return Math.round(Number(value) * 100);
}

// Read the effective view, never raw allocation history or amount-to-item guesses.
export async function loadInvoicePostPaymentDocuments(
  client: Pick<SupabaseClient, "from" | "rpc">, invoiceId: string, access: DocumentReadAccess,
): Promise<InvoicePostPaymentData> {
  if (!access.canViewFinanceReceipts && !access.canViewFinanceTaxInvoices) throw new Error("DOCUMENT_PERMISSION_DENIED");
  const summaryResult = await client.from("finance_invoice_settlement_summary").select("*").eq("invoice_id", invoiceId).single();
  if (summaryResult.error) throw summaryResult.error;
  const summary = summaryResult.data as InvoiceSettlement | null;
  if (!summary || summary.invoice_id !== invoiceId || summary.invoice_status !== "issued"
    || !["unpaid", "partially_settled", "settled"].includes(summary.payment_status)) throw new Error("Issued Invoice summary unavailable");
  const allocationResult = await client.from("finance_payment_effective_invoice_allocations")
    .select("payment_id,invoice_id,effective_cash_allocated,effective_wht_credit_allocated,effective_settlement_total").eq("invoice_id", invoiceId);
  if (allocationResult.error) throw allocationResult.error;
  const allocations = (allocationResult.data || []) as EffectivePaymentAllocation[];
  const ids = [...new Set(allocations.map(row => row.payment_id))].sort();
  if (ids.length !== allocations.length || allocations.some(row => row.invoice_id !== invoiceId || cents(row.effective_settlement_total) <= 0)) {
    throw new Error("Invalid effective Payment linkage");
  }
  const paymentResult = ids.length ? await client.from("finance_payments").select("id,status,internal_reference,currency").in("id", ids) : { data: [], error: null };
  if (paymentResult.error) throw paymentResult.error;
  const payments = (paymentResult.data || []) as PostPaymentEntry["payment"][];
  if (payments.length !== ids.length || ids.some(id => !payments.some(row => row.id === id))
    || payments.some(row => !["draft", "confirmed", "cancelled", "reversed"].includes(row.status) || row.currency !== summary.currency)) throw new Error("Incomplete accessible Payment linkage");
  const confirmed = payments.filter(row => row.status === "confirmed");
  const confirmedIds = confirmed.map(row => row.id);
  const effective = allocations.filter(row => confirmedIds.includes(row.payment_id));
  // RLS omissions or concurrent changes must not look like an unpaid/complete chain.
  for (const [allocationKey, summaryKey] of [
    ["effective_cash_allocated", "confirmed_cash_allocated"],
    ["effective_wht_credit_allocated", "confirmed_wht_credit_allocated"],
    ["effective_settlement_total", "economically_settled_amount"],
  ] as const) {
    if (effective.reduce((sum, row) => sum + cents(row[allocationKey]), 0) !== cents(summary[summaryKey])) throw new Error("Settlement read changed or incomplete");
  }
  if (cents(summary.invoice_gross_amount) - cents(summary.economically_settled_amount) !== cents(summary.outstanding_amount)) throw new Error("Invalid settlement summary");

  async function headers(table: string, numberColumn: string, allowed: boolean, pairedColumn: boolean): Promise<DocumentHeader[] | null> {
    if (!allowed) return null;
    if (!confirmedIds.length) return [];
    const result = await client.from(table).select(`id,payment_id,status,${numberColumn}${pairedColumn ? ",combined_document_id" : ""}`).in("payment_id", confirmedIds).order("created_at");
    if (result.error) throw result.error;
    return (result.data || []).map(value => {
      const row = value as unknown as Record<string, string | null>;
      if (!row.id || !row.payment_id || !confirmedIds.includes(row.payment_id) || !["draft", "issued", "cancelled", "voided"].includes(row.status || "")) throw new Error("Invalid document header");
      return { id: row.id, payment_id: row.payment_id, status: row.status!, number: row[numberColumn], combined_document_id: row.combined_document_id };
    });
  }
  const receipts = await headers("finance_receipts", "receipt_no", access.canViewFinanceReceipts, true);
  const taxInvoices = await headers("finance_tax_invoices", "tax_invoice_no", access.canViewFinanceTaxInvoices, true);
  const combined = await headers("finance_combined_documents", "combined_no", access.canViewFinanceReceipts && access.canViewFinanceTaxInvoices, false);
  const entries: PostPaymentEntry[] = [];
  for (const payment of confirmed) {
    const result = await client.rpc("get_finance_document_decision", { p_payment_id: payment.id });
    if (result.error) throw result.error;
    const decision = result.data as DocumentDecision | null;
    if (!decision || !Object.hasOwn(documentDecisionLabels, decision.decision) || decision.decision === "blocked_payment"
      || !Array.isArray(decision.lines) || !decision.lines.some(line => line.invoice_id === invoiceId)
      || (decision.blockers !== undefined && (!Array.isArray(decision.blockers) || decision.blockers.some(code => typeof code !== "string")))) throw new Error("Document decision unavailable or changed");
    for (const [rows, activeId, activeStatus] of [[receipts, decision.receipt_id, decision.receipt_status], [taxInvoices, decision.tax_invoice_id, decision.tax_invoice_status], [combined, decision.combined_id, decision.combined_status]] as const) {
      if (rows === null) continue;
      const active = rows.filter(row => row.payment_id === payment.id && ["draft", "issued"].includes(row.status));
      if (active.length !== (activeId ? 1 : 0) || (activeId && !active.some(row => row.id === activeId && row.status === activeStatus))) throw new Error("Document headers and decision differ");
    }
    entries.push({ payment, allocation: effective.find(row => row.payment_id === payment.id)!, decision,
      receipts: receipts?.filter(row => row.payment_id === payment.id) ?? null,
      taxInvoices: taxInvoices?.filter(row => row.payment_id === payment.id) ?? null,
      combined: combined?.filter(row => row.payment_id === payment.id) ?? null });
  }
  return { summary, payments: entries };
}
