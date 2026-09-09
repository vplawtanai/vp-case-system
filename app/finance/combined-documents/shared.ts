import { taxObject, taxPresentation, type TaxInvoice } from "../tax-invoices/shared";

export type CombinedDocument = {
  id: string; payment_id: string; receipt_id: string; tax_invoice_id: string; status: "draft" | "issued" | "cancelled";
  combined_no: string | null; issue_date: string; source_snapshot_json: unknown; draft_snapshot_json: unknown;
  issued_snapshot_json: unknown; issued_at: string | null; updated_at: string;
};
export function combinedTaxRow(combined: CombinedDocument, tax: TaxInvoice): TaxInvoice | null {
  try {
    if (tax.id !== combined.tax_invoice_id || tax.payment_id !== combined.payment_id || tax.combined_document_id !== combined.id || tax.status !== combined.status) return null;
    if (combined.status !== "issued") return combined.combined_no || combined.issued_at ? null : tax;
    const s = taxObject(combined.issued_snapshot_json), receipt = taxObject(s.receipt), t = taxObject(s.tax_invoice);
    const r = taxObject(receipt.receipt), doc = taxObject(t.document);
    if (s.schema_version !== 1 || s.document_kind !== "receipt_tax_invoice" || s.combined_document_id !== combined.id
      || !/^VP-RTI-\d{6}-\d{6}$/.test(combined.combined_no || "") || s.combined_no !== combined.combined_no
      || r.id !== combined.receipt_id || doc.id !== combined.tax_invoice_id || r.receipt_no !== combined.combined_no || doc.tax_invoice_no !== combined.combined_no
      || r.combined_document_id !== combined.id || doc.combined_document_id !== combined.id
      || taxObject(receipt.payment).id !== combined.payment_id || JSON.stringify(receipt.payment) !== JSON.stringify(t.payment)) return null;
    const frozen = { ...tax, issued_snapshot_json: t, tax_invoice_no: combined.combined_no, issue_date: combined.issue_date, issued_at: combined.issued_at };
    return taxPresentation(frozen).ok ? frozen : null;
  } catch { return null; }
}
