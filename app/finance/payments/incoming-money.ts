import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinancePayment } from "./shared";
import type { DirectRecord } from "../direct-money/shared";

export type MoneySource = "all" | "invoice" | "direct";
export type MoneyClassification = "all" | "classified" | "unclassified";
export type MoneyFilters = { source: MoneySource; status: string; classification: MoneyClassification };
export type MoneyOffsets = { invoice: number; direct: number };
export const initialMoneyFilters: MoneyFilters = { source: "all", status: "", classification: "all" };
export const initialMoneyOffsets: MoneyOffsets = { invoice: 0, direct: 0 };
export const moneyPageSize = 50;
export const paymentListSelect = "id,internal_reference,client_id,received_on,cash_amount,wht_amount,settlement_amount,currency,status,created_at";
export const directListSelect = "id,payer_name,received_on,cash_amount,wht_amount,gross_amount,currency,status,unclassified,created_at";
type PaymentRow = Pick<FinancePayment, "id" | "internal_reference" | "client_id" | "received_on" | "cash_amount" | "wht_amount" | "settlement_amount" | "currency" | "status" | "created_at">;
type DirectRow = Pick<DirectRecord, "id" | "payer_name" | "received_on" | "cash_amount" | "wht_amount" | "gross_amount" | "currency" | "status" | "unclassified" | "created_at">;
export type IncomingMoneyRow = {
  id: string; source: "invoice" | "direct"; reference: string; payer: string | null; receivedOn: string | null;
  cash: number | string; wht: number | string; gross: number | string; currency: string;
  status: string; unclassified: boolean | null; createdAt: string; href: string;
};

export function incomingStatuses(source: MoneySource): string[] {
  return source === "direct" ? ["draft", "confirmed", "reversed"] : ["draft", "confirmed", "cancelled", "reversed"];
}
export function incomingPayment(row: PaymentRow, payer: string | null): IncomingMoneyRow {
  return { id: row.id, source: "invoice", reference: row.internal_reference?.trim() || row.id.slice(0, 8).toUpperCase(), payer,
    receivedOn: row.received_on, cash: row.cash_amount, wht: row.wht_amount, gross: row.settlement_amount, currency: row.currency,
    status: row.status, unclassified: null, createdAt: row.created_at, href: `/finance/payments/${row.id}` };
}
export function incomingDirect(row: DirectRow): IncomingMoneyRow {
  return { id: row.id, source: "direct", reference: row.id.slice(0, 8).toUpperCase(), payer: row.payer_name,
    receivedOn: row.received_on, cash: row.cash_amount, wht: row.wht_amount, gross: row.gross_amount, currency: row.currency,
    status: row.status, unclassified: row.unclassified, createdAt: row.created_at, href: `/finance/direct-money/${row.id}` };
}
function timestampKey(value: string): bigint {
  // Match PostgreSQL's microsecond ordering, including timestamps within the same millisecond.
  const fraction = value.match(/\.(\d+)/)?.[1] || "";
  return BigInt(Date.parse(value)) * BigInt(1000) + BigInt((fraction + "000000").slice(3, 6));
}
export function mergeIncomingMoney(rows: IncomingMoneyRow[], offsets: MoneyOffsets, limit = moneyPageSize) {
  const sorted = [...rows].sort((a, b) => {
    const left = timestampKey(a.createdAt), right = timestampKey(b.createdAt);
    return (left < right ? 1 : left > right ? -1 : 0)
      || (a.id < b.id ? 1 : a.id > b.id ? -1 : a.source.localeCompare(b.source));
  });
  const visible = sorted.slice(0, limit), nextOffsets = { ...offsets };
  for (const row of visible) nextOffsets[row.source]++;
  return { rows: visible, hasNext: sorted.length > limit, nextOffsets };
}

export async function readIncomingMoneyPage(client: SupabaseClient, filters: MoneyFilters, offsets: MoneyOffsets, limit = moneyPageSize) {
  const rows: IncomingMoneyRow[] = [];
  // Each source supplies one bounded lookahead page; advance only by rows actually displayed.
  if (filters.source !== "direct") {
    let query = client.from("finance_payments").select(paymentListSelect).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (filters.status) query = query.eq("status", filters.status);
    const result = await query.range(offsets.invoice, offsets.invoice + limit);
    if (result.error) throw result.error;
    const payments = (result.data || []) as PaymentRow[], ids = [...new Set(payments.map(row => row.client_id))];
    const clients = ids.length ? await client.from("clients").select("id,name").in("id", ids) : { data: [], error: null };
    if (clients.error) throw clients.error;
    const names = new Map((clients.data || []).map(row => [row.id, row.name]));
    rows.push(...payments.map(row => incomingPayment(row, names.get(row.client_id) || null)));
  }
  if (filters.source !== "invoice" && filters.status !== "cancelled") {
    let query = client.from("finance_direct_money_receipts").select(directListSelect).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.source === "direct" && filters.classification !== "all") query = query.eq("unclassified", filters.classification === "unclassified");
    const result = await query.range(offsets.direct, offsets.direct + limit);
    if (result.error) throw result.error;
    rows.push(...((result.data || []) as DirectRow[]).map(incomingDirect));
  }
  return mergeIncomingMoney(rows, offsets, limit);
}
