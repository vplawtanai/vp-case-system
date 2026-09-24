// Typed documentary evidence only. Never manufactures an Invoice or Payment.
export type DocumentSourceRow = { payment_id: string | null; direct_money_receipt_id?: string | null };
export function documentSource(row: DocumentSourceRow) {
  if (row.direct_money_receipt_id && !row.payment_id) return { type: "direct_money_receipt" as const, id: row.direct_money_receipt_id, href: `/finance/direct-money/${row.direct_money_receipt_id}` };
  if (row.payment_id && !row.direct_money_receipt_id) return { type: "invoice_payment" as const, id: row.payment_id, href: `/finance/payments/${row.payment_id}` };
  throw new Error("DOCUMENT_SOURCE_INVALID");
}
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("document evidence"); return v as Record<string, unknown>; };
const cents = (v: unknown) => { if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(String(v))) throw new Error("document amount"); const n = Math.round(Number(v) * 100); if (!Number.isSafeInteger(n)) throw new Error("document amount"); return n; };
export function directDocumentEvidence(snapshot: Record<string, unknown>, row: DocumentSourceRow) {
  const source = documentSource(row), evidence = object(snapshot.source), money = object(snapshot.money);
  if (source.type !== "direct_money_receipt" || snapshot.schema_version !== 3 || evidence.type !== source.type || evidence.id !== source.id || money.id !== source.id
    || money.source_type !== source.type || !Number.isInteger(evidence.version) || Number(evidence.version) < 2 || !/^[0-9a-f]{32}$/.test(String(evidence.fingerprint))
    || "invoice" in snapshot || "payment" in snapshot || "invoices" in snapshot) throw new Error("document source");
  if (!Array.isArray(snapshot.document_lines) || !snapshot.document_lines.length || !Array.isArray(snapshot.tax_lines)) throw new Error("document lines");
  const lines = snapshot.document_lines.map(object), taxLines = snapshot.tax_lines.map(object);
  if (new Set(lines.map(l => l.source_line_id)).size !== lines.length) throw new Error("duplicate source line");
  for (const l of lines) {
    if (!/^[0-9a-f-]{36}$/i.test(String(l.source_line_id)) || l.id !== l.source_line_id || !String(l.description || "").trim()
      || cents(l.base) + cents(l.vat) !== cents(l.gross) || cents(l.cash) + cents(l.wht) !== cents(l.gross)
      || cents(l.amount_before_vat) !== cents(l.base) || cents(l.vat_amount) !== cents(l.vat) || cents(l.line_total) !== cents(l.gross)) throw new Error("source line");
  }
  for (const [key, lineKey] of [["cash_amount", "cash"], ["wht_amount", "wht"], ["amount_before_vat", "base"], ["vat_amount", "vat"], ["settlement_amount", "gross"]]) {
    if (cents(money[key]) !== lines.reduce((n, l) => n + cents(l[lineKey]), 0)) throw new Error("source totals");
  }
  const relevant = lines.filter(l => ["standard_rate", "zero_rated"].includes(String(object(l.resolved_vat_treatment).treatment)));
  if (JSON.stringify(relevant) !== JSON.stringify(taxLines)) throw new Error("source tax coverage");
  return { source, money, lines, taxLines };
}
