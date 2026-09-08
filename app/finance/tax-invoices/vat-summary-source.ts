import type { SupabaseClient } from "@supabase/supabase-js";
import { invoiceVatLines, type InvoiceVatLine } from "./vat-treatment";

export async function loadPaymentVatLines(client: Pick<SupabaseClient, "from">, paymentId: string): Promise<InvoiceVatLine[]> {
  const allocations = await client.from("finance_payment_effective_invoice_allocations").select("invoice_id").eq("payment_id", paymentId);
  if (allocations.error) throw allocations.error;
  const ids = [...new Set((allocations.data || []).map(row => String(row.invoice_id)))].sort();
  if (!ids.length) throw new Error("No accessible effective Invoice sources");
  const invoices = await client.from("finance_invoices").select("id,document_status,issued_snapshot_json").in("id", ids);
  if (invoices.error) throw invoices.error;
  // RLS may omit rows without returning an error. Never present a partial set as complete.
  if (invoices.data?.length !== ids.length) throw new Error("Incomplete accessible Invoice sources");
  return ids.flatMap(id => {
    const row = invoices.data.find(invoice => invoice.id === id);
    if (!row || row.document_status !== "issued") throw new Error("Issued Invoice source required");
    return invoiceVatLines(row.issued_snapshot_json, id);
  });
}
