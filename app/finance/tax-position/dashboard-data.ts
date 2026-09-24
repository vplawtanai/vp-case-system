import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserPermissions } from "../../../lib/permissions";
import type { DirectRecord } from "../direct-money/shared";
import type { TreasuryData, Location } from "../treasury/shared";
import type { PayableGroup, PayablePage } from "../payables/shared";
import type { TaxPositionData } from "./shared";

type Amount = number | string;
export type PaymentRow = { id: string; status: string; received_on: string; currency: string; internal_reference: string | null; payer_name: string | null; cash_amount: Amount; wht_amount: Amount; settlement_amount: Amount };
export type DirectRow = Pick<DirectRecord, "id" | "status" | "received_on" | "currency" | "payer_name" | "cash_amount" | "wht_amount" | "gross_amount" | "classification_json"> & {
 confirmed_snapshot_json: { lines?: DirectRecord["lines_json"] } | null;
};
export type WhtRow = { id: string; payment_id: string; base_amount: Amount; rate_percent: Amount; calculated_wht_amount: Amount };
export type MoneyData = { payments: PaymentRow[]; direct: DirectRow[]; components: WhtRow[]; certificates: { id: string; payment_id: string }[] };
export type TaxDocument = { id: string; payment_id: string | null; direct_money_receipt_id?: string | null; status: string; tax_invoice_no: string; items: { id: string; amount_before_vat: Amount; vat_amount: Amount; total_amount: Amount }[]; point: { occurred_on: string; approved_at: string | null } };
export type Correction = { id: string; correction_mode: string; status: string; adjustment_date: string; lines: { id: string; base_change: Amount; vat_change: Amount }[] };
export type DashboardData = { money: MoneyData | null; taxes: { documents: TaxDocument[]; corrections: Correction[] } | null; treasury: TreasuryData | null; payables: PayableGroup[] | null; register: TaxPositionData | null };
export type MonthlyTaxSources = Pick<DashboardData, "money" | "taxes">;
export type MonthlyTaxFacts = { outputVat: number | null; incomingWht: number | null };
export type Movement = { key: string; id: string; source: "payment" | "direct_money_receipt" | "tax_invoice" | "credit_note" | "debit_note"; reference: string; payer: string | null; date: string; gross: number; cash: number | null; vat: number | null; wht: number | null; href: string };
export type Credit = { key: string; source: Movement["source"]; sourceId: string; reference: string; base: number | null; rate: number | null; amount: number; evidence: string };

export function currentBangkokMonth(now = new Date()) {
 const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(now);
 return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
}
export function shiftMonth(month: string, offset: number) {
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
 const [year, m] = month.split("-").map(Number), date = new Date(Date.UTC(year, m - 1 + offset, 1));
 return date.toISOString().slice(0, 7);
}
export function cents(value: Amount) {
 if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) throw new Error("Missing authoritative amount");
 const result = Math.round(Number(value) * 100);
 if (!Number.isSafeInteger(result)) throw new Error("Amount outside safe range");
 return result;
}
const total = (values: Amount[]) => {
 const result = values.reduce<number>((sum, value) => sum + cents(value), 0);
 if (!Number.isSafeInteger(result)) throw new Error("Total outside safe range");
 return result / 100;
};
function unique<T extends { id: string }>(rows: T[]): T[] {
 const map = new Map<string, T>();
 for (const row of rows) {
  if (map.has(row.id) && JSON.stringify(map.get(row.id)) !== JSON.stringify(row)) throw new Error("Source changed during read");
  map.set(row.id, row);
 }
 return [...map.values()];
}

// Bounded pages, never a silent PostgREST row-limit total. No write or private RPC.
export async function readAll<T>(query: (start: number, end: number) => PromiseLike<{ data: unknown; error: unknown; count?: number | null }>): Promise<T[]> {
 const rows: T[] = [], size = 500;
 for (let offset = 0; offset < 100000;) {
  const result = await query(offset, offset + size - 1);
  if (result.error || !Array.isArray(result.data)) throw result.error || new Error("Read unavailable");
  rows.push(...result.data);
  if (result.count != null ? rows.length >= result.count : result.data.length < size) return rows;
  if (!result.data.length) throw new Error("Read changed during pagination");
  offset += result.data.length;
 }
 throw new Error("Read limit reached; total unavailable");
}
async function byIds<T>(client: SupabaseClient, table: string, columns: string, column: string, ids: string[]) {
 const rows: T[] = [], keys = [...new Set(ids)];
 for (let offset = 0; offset < keys.length; offset += 100) rows.push(...await readAll<T>((start, end) => client.from(table).select(columns, { count: "exact" }).in(column, keys.slice(offset, offset + 100)).order("id").range(start, end)));
 return rows;
}
async function optional<T>(allowed: boolean, read: () => Promise<T>): Promise<T | null> {
 if (!allowed) return null;
 try { return await read(); } catch { return null; }
}
export async function readMonthlyTaxSources(client: SupabaseClient, permissions: UserPermissions, month: string): Promise<MonthlyTaxSources> {
 const start = month + "-01", end = shiftMonth(month, 1) + "-01";
 const monthly = <T,>(table: string, columns: string, date: string) => readAll<T>((a, b) => client.from(table).select(columns, { count: "exact" }).gte(date, start).lt(date, end).order("id").range(a, b));
 const money = await optional(permissions.canViewFinancePayments, async () => {
  const payments = await monthly<PaymentRow>("finance_payments", "id,status,received_on,currency,internal_reference,payer_name,cash_amount,wht_amount,settlement_amount", "received_on");
  const direct = await monthly<DirectRow>("finance_direct_money_receipts", "id,status,received_on,currency,payer_name,cash_amount,wht_amount,gross_amount,confirmed_snapshot_json,classification_json", "received_on");
  const ids = payments.filter(p => p.status === "confirmed").map(p => p.id);
  const components = await byIds<WhtRow>(client, "finance_payment_wht_components", "id,payment_id,base_amount,rate_percent,calculated_wht_amount", "payment_id", ids);
  const certificates = await byIds<{ id: string; payment_id: string; evidence_type: string }>(client, "finance_payment_evidence", "id,payment_id,evidence_type", "payment_id", ids);
  return { payments, direct, components, certificates: certificates.filter(c => c.evidence_type === "wht_certificate") };
 });
 // Combined correction RLS additionally requires Receipt view. Never present a
 // partial permission-filtered correction set as a complete VAT total.
 const taxes = await optional(permissions.canViewFinanceTaxInvoices && permissions.canViewFinanceReceipts, async () => {
  const points = await monthly<{ id: string; tax_invoice_id: string; occurred_on: string; approved_at: string | null }>("finance_tax_point_events", "id,tax_invoice_id,occurred_on,approved_at", "occurred_on");
  const docs = await byIds<Omit<TaxDocument, "items" | "point">>(client, "finance_tax_invoices", "id,payment_id,direct_money_receipt_id,status,tax_invoice_no", "id", points.map(p => p.tax_invoice_id));
  const items = await byIds<TaxDocument["items"][number] & { tax_invoice_id: string }>(client, "finance_tax_invoice_items", "id,tax_invoice_id,amount_before_vat,vat_amount,total_amount", "tax_invoice_id", docs.map(d => d.id));
  const corrections = await monthly<Omit<Correction, "lines">>("finance_tax_document_corrections", "id,correction_mode,status,adjustment_date", "adjustment_date");
  const lines = await byIds<Correction["lines"][number] & { correction_id: string }>(client, "finance_tax_correction_lines", "id,correction_id,base_change,vat_change", "correction_id", corrections.map(c => c.id));
  return { documents: docs.map(d => ({ ...d, point: points.find(p => p.tax_invoice_id === d.id)!, items: items.filter(i => i.tax_invoice_id === d.id) })), corrections: corrections.map(c => ({ ...c, lines: lines.filter(l => l.correction_id === c.id) })) };
 });
 return { money, taxes };
}
export async function readDashboard(client: SupabaseClient, permissions: UserPermissions, month: string): Promise<DashboardData> {
 const { money, taxes } = await readMonthlyTaxSources(client, permissions, month);
 const treasury = await optional(permissions.canViewFinanceCashTransactions, async () => {
  const r = await client.rpc("get_finance_treasury", { p_offset: 0 });
  if (r.error || !Array.isArray(r.data?.accounts)) throw r.error || new Error("Treasury unavailable");
  return r.data as TreasuryData;
 });
 const payables = await optional(permissions.canViewFinancePayments, async () => {
  const groups: PayableGroup[] = [];
  for (let offset = 0; offset < 100000; offset += 25) {
   const r = await client.rpc("get_finance_payable_entitlements", { p_search: "", p_source_type: "all", p_bucket: "all", p_status: "open", p_offset: offset });
   if (r.error || !Array.isArray(r.data?.groups) || typeof r.data.has_next !== "boolean") throw r.error || new Error("Payables unavailable");
   const page = r.data as PayablePage; groups.push(...page.groups);
   if (!page.has_next) return groups;
  }
  throw new Error("Payables read incomplete");
 });
 const register = await optional(true, async () => {
  const r = await client.rpc("get_finance_tax_position");
  if (r.error || !Array.isArray(r.data?.facts) || !Array.isArray(r.data?.periods)) throw r.error || new Error("Tax evidence unavailable");
  return r.data as TaxPositionData;
 });
 return { money, taxes, treasury, payables, register };
}

// Economic ownership: Payment/Direct own cash and WHT; Direct frozen lines and
// issued tax children own VAT; CN/DN own signed deltas. Register/Receipt/Combined
// parent/copies supply context only, NEVER an additional amount.
export function summarizeDashboard(data: DashboardData, month: string) {
 const movements: Movement[] = [], credits: Credit[] = [], vat: number[] = [];
 let unresolved = 0, foreign = 0;
 const inMonth = (date: string) => date?.slice(0, 7) === month;
 const evidence = (source: string, sourceId: string, lineId: string, amount: number, base: number | null, rate: number | null, receivedOn: string, certificate = false) => {
  const fact = data.register?.facts.find(f => f.source_type === source && f.source_id === sourceId && (f as typeof f & { source_line_id: string }).source_line_id === lineId && f.tax_kind === "incoming_wht" && f.effective_on === receivedOn && cents(f.tax_amount) === cents(amount) && f.base_amount === base && f.rate_percent === rate);
  return fact?.evidence_status || (certificate ? "received" : "awaiting_evidence");
 };
 for (const p of unique(data.money?.payments || [])) {
  if (p.status !== "confirmed" || !inMonth(p.received_on)) continue;
  if (p.currency !== "THB") { foreign++; continue; }
  const reference = p.internal_reference || p.id.slice(0, 8).toUpperCase();
  const amount = cents(p.wht_amount) / 100, components = unique(data.money!.components.filter(c => c.payment_id === p.id));
  if (amount > 0) {
   const lines = cents(total(components.map(c => c.calculated_wht_amount))) === cents(amount) ? components.filter(c => cents(c.calculated_wht_amount) > 0) : [{ id: p.id, payment_id: p.id, base_amount: null, rate_percent: null, calculated_wht_amount: amount }];
   for (const c of lines) {
    const base = c.base_amount === null ? null : cents(c.base_amount) / 100, rate = c.rate_percent === null ? null : Number(c.rate_percent), value = cents(c.calculated_wht_amount) / 100;
    credits.push({ key: `payment:${p.id}:${c.id}`, source: "payment", sourceId: p.id, reference, base, rate, amount: value, evidence: evidence("payment", p.id, c.id, value, base, rate, p.received_on, data.money!.certificates.some(e => e.payment_id === p.id)) });
   }
  }
  movements.push({ key: `payment:${p.id}`, id: p.id, source: "payment", reference, payer: p.payer_name, date: p.received_on, gross: cents(p.settlement_amount) / 100, cash: cents(p.cash_amount) / 100, wht: amount, vat: null, href: `/finance/payments/${p.id}` });
 }
 for (const d of unique(data.money?.direct || [])) {
  if (d.status !== "confirmed" || !inMonth(d.received_on)) continue;
  if (d.currency !== "THB") { foreign++; continue; }
  const reference = d.id.slice(0, 8).toUpperCase(), lines = d.classification_json?.lines ?? d.confirmed_snapshot_json?.lines;
  const values: number[] = [];
  let missing = !Array.isArray(lines) || !lines.length;
  for (const l of lines || []) {
   if (["standard_rate", "zero_rated", "exempt", "outside_scope", "disbursement", "pass_through"].includes(l.vat_treatment_json?.treatment || "")) values.push(cents(l.vat) / 100);
   else { unresolved++; missing = true; }
  }
  if (!lines?.length) unresolved++;
  vat.push(...values);
  const wht = cents(d.wht_amount) / 100;
  if (wht > 0) {
   const structured = lines?.length && cents(total(lines.map(l => l.wht))) === cents(wht);
   const whtLines = structured ? lines.filter(l => cents(l.wht) > 0).map(l => ({ id: l.source_line_id, base: l.wht_base, rate: l.wht_rate, amount: l.wht })) : [{ id: d.id, base: null, rate: null, amount: wht }];
   for (const l of whtLines) credits.push({ key: `direct:${d.id}:${l.id}`, source: "direct_money_receipt", sourceId: d.id, reference, base: l.base, rate: l.rate, amount: l.amount, evidence: evidence("direct_money_receipt", d.id, l.id, l.amount, l.base, l.rate, d.received_on) });
  }
  movements.push({ key: `direct:${d.id}`, id: d.id, source: "direct_money_receipt", reference, payer: d.payer_name, date: d.received_on, gross: cents(d.gross_amount) / 100, cash: cents(d.cash_amount) / 100, wht, vat: missing ? null : total(values), href: `/finance/direct-money/${d.id}` });
 }
 const receiptCount = movements.length, cash = data.money ? total(movements.map(m => m.cash!)) : null;
 for (const doc of unique(data.taxes?.documents || [])) {
  if (doc.direct_money_receipt_id || doc.status !== "issued" || !doc.point.approved_at || !inMonth(doc.point.occurred_on)) continue;
  if (!doc.items.length) throw new Error("Issued tax document missing items");
  const items = unique(doc.items), value = total(items.map(i => i.vat_amount)); vat.push(value);
  const payment = movements.find(m => m.source === "payment" && m.id === doc.payment_id);
  if (payment) payment.vat = total([payment.vat ?? 0, value]);
  else movements.push({ key: `tax:${doc.id}`, id: doc.id, source: "tax_invoice", reference: doc.tax_invoice_no, payer: null, date: doc.point.occurred_on, gross: total(items.map(i => i.total_amount)), cash: null, vat: value, wht: null, href: `/finance/tax-invoices/${doc.id}` });
 }
 for (const c of unique(data.taxes?.corrections || [])) {
  if (c.status !== "issued" || !["credit_note", "debit_note"].includes(c.correction_mode) || !inMonth(c.adjustment_date)) continue;
  if (!c.lines.length) throw new Error("Issued adjustment missing lines");
  const lines = unique(c.lines), sign = c.correction_mode === "credit_note" ? -1 : 1, value = total(lines.map(l => l.vat_change)) * sign;
  vat.push(value); movements.push({ key: `correction:${c.id}`, id: c.id, source: c.correction_mode as "credit_note" | "debit_note", reference: c.id.slice(0, 8).toUpperCase(), payer: null, date: c.adjustment_date, gross: total(lines.flatMap(l => [l.base_change, l.vat_change])) * sign, cash: null, vat: value, wht: null, href: `/finance/tax-corrections/${c.id}` });
 }
 const accounts = (data.treasury?.accounts || []).filter(a => a.is_active && a.currency === "THB"), known = accounts.filter(a => a.system_balance !== null);
 const rights = unique((data.payables || []).flatMap(g => g.components)).filter(c => c.status === "open" && c.currency === "THB" && ["referral", "work"].includes(c.bucket));
 return { cash, receiptCount, outputVat: data.money && data.taxes ? total(vat) : null, wht: data.money ? total(credits.map(c => c.amount)) : null,
  whtSources: new Set(credits.map(c => `${c.source}:${c.sourceId}`)).size, credits, unresolved, foreign,
  movements: movements.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key)),
  accounts: accounts as Location[], systemBalance: known.length ? total(known.map(a => a.system_balance!)) : null, unknownAccounts: accounts.length - known.length,
  payable: data.payables ? total(rights.map(c => c.gross_amount)) : null, recipients: new Set(rights.map(c => c.recipient_id)).size,
  period: data.register?.periods.find(p => p.period_month === `${month}-01`) || null,
  reviewedInputVat: data.register ? total(data.register.facts.filter(f => f.tax_kind === "input_vat" && f.period_month === `${month}-01`).map(f => f.tax_amount)) : null,
  outgoingHeld: data.register?.outgoing_workflow_available ? total((data.register.outgoing || []).filter(w => inMonth(w.withheld_on)).map(w => w.withheld_amount)) : null,
  outgoingDue: data.register?.outgoing_workflow_available ? total((data.register.outgoing || []).filter(w => inMonth(w.withheld_on)).map(w => (cents(w.withheld_amount) - cents(w.remitted_amount)) / 100)) : null,
 };
}

// Use the Overview calculation unchanged, without reading unrelated Treasury/Payables
// or mistaking materialized filing allocations for all known monthly tax facts.
export function summarizeMonthlyTaxFacts(sources: MonthlyTaxSources, month: string): MonthlyTaxFacts {
 try {
  const summary = summarizeDashboard({ ...sources, treasury: null, payables: null, register: null }, month);
  return { outputVat: summary.outputVat, incomingWht: summary.wht };
 } catch {
  return { outputVat: null, incomingWht: null };
 }
}
