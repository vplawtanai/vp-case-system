import { cents } from "./dashboard-data";
import type { TaxMonth } from "./period-data";
import { taxMonthSummary } from "./period-data";

type Json = Record<string, unknown>;
export type VatSourceRow = {
 key: string; reference: string; date: string; party: string | null; kind: string;
 vat: number; base: number | null; href: string | null; note: string | null;
};
const object = (value: unknown): Json => {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid VAT source evidence");
 return value as Json;
};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const required = (value: unknown) => { const result = text(value); if (!result) throw Error("Missing VAT source identity"); return result; };
const amount = (value: unknown) => { if (typeof value !== "number") throw Error("Missing VAT source amount"); return cents(value); };
const array = (value: unknown): unknown[] => { if (!Array.isArray(value)) throw Error("Missing VAT source rows"); return value; };
function lines(value: unknown, kind: string) {
 const rows = array(value).map(object), ids = new Set<string>();
 for (const row of rows) {
  const id = required(row.line_id);
  if (ids.has(id) || row.kind !== kind) throw Error("Invalid or duplicate VAT line");
  ids.add(id);
 }
 const vat = rows.reduce((n, row) => n + amount(row.tax), 0);
 const base = rows.every(row => row.base != null) ? rows.reduce((n, row) => n + amount(row.base), 0) / 100 : null;
 if (!Number.isSafeInteger(vat)) throw Error("VAT total outside safe range");
 return { vat: vat / 100, base };
}

// Read presentation only. The existing monthly RPC owns eligibility, source priority,
// signed corrections and amounts. Never infer VAT or add the materialized ledger again.
export function vatSourceTrace(data: TaxMonth) {
 const summary = taxMonthSummary(data);
 try {
  const pool = data.filing.pools.find(p => p.filing_type === "vat");
  if (pool?.schema_version !== 2 || pool.period_month !== `${data.month}-01`) throw Error("VAT period unavailable");
  const facts = object(pool.monthly_facts), seen = new Set<string>();
  function identity(source: Json) {
   const type = required(source.source_type), id = required(source.source_id), date = required(source.effective_on), key = `${type}:${id}`;
   if (seen.has(key) || date.slice(0, 7) !== data.month) throw Error("Duplicate or wrong-period VAT source");
   seen.add(key);
   return { type, id, date, key, reference: text(source.reference) || id.slice(0, 8).toUpperCase() };
  }
  const output: VatSourceRow[] = array(facts.source_evidence).map(value => {
   const source = object(value), row = identity(source), totals = lines(source.lines, "output_vat");
   const route = { direct_money_receipt: "direct-money", tax_invoice: "tax-invoices", tax_correction: "tax-corrections" }[row.type];
   if (!route) throw Error("Unknown output VAT source");
   // Names supplement the authoritative evidence; never use movement amounts here.
   const direct = data.sources.money?.direct.find(d => d.id === row.id);
   const document = data.sources.taxes?.documents.find(d => d.id === row.id);
   const payer = direct?.payer_name || data.sources.money?.payments.find(p => p.id === document?.payment_id)?.payer_name || null;
   return { ...row, ...totals, party: payer, kind: row.type, href: `/finance/${route}/${encodeURIComponent(row.id)}`, note: null };
  });
  const input: VatSourceRow[] = array(facts.input_sources ?? facts.reviewed_input_sources).map(value => {
   const entry = object(value), source = object(entry.source), row = identity(source), totals = lines(source.lines, "input_vat");
   if (source.active !== true || source.currency !== "THB" || entry.source_type !== row.type || entry.source_id !== row.id || amount(entry.amount) !== cents(totals.vat)) throw Error("Input VAT source mismatch");
   const evidence = object(source.source_evidence), payer = object(source.payer);
   if (row.type === "expense") {
    const expense = object(evidence.expense), claim = expense.origin !== "company_purchase";
    if (expense.id !== row.id || !["employee_claim", "company_purchase", "legacy_claim"].includes(required(expense.origin))) throw Error("Invalid expense source");
    return { ...row, reference: text(source.reference) || `EXP-${row.id.slice(0, 8).toUpperCase()}`, ...totals, party: text(payer.name), kind: claim ? "employee_claim" : "company_purchase", href: `/finance/expenses/${claim ? "claims/" : ""}${encodeURIComponent(row.id)}`, note: text(expense.description) };
   }
   if (row.type !== "external_input_vat") throw Error("Unknown input VAT source");
   const document = object(evidence.document);
   if (document.id !== row.id) throw Error("External evidence identity mismatch");
   return { ...row, ...totals, party: text(payer.name), kind: "external_input_vat", href: null, note: text(document.note) };
  });
  const total = (rows: VatSourceRow[]) => rows.reduce((n, row) => n + cents(row.vat), 0) / 100;
  const outputTotal = total(output), inputTotal = total(input), net = (cents(outputTotal) - cents(inputTotal)) / 100;
  const matches = (a: number, b: number | null) => b !== null && cents(a) === cents(b);
  return { output, input, outputTotal, inputTotal, net, summary, unavailable: false,
   reconciled: matches(outputTotal, summary.output) && matches(inputTotal, summary.input) && matches(net, summary.net) };
 } catch {
  return { output: [], input: [], outputTotal: null, inputTotal: null, net: null, summary, unavailable: true, reconciled: false };
 }
}
