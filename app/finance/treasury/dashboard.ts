import { locationKey, type CashMovement, type TreasuryData, type TreasurySource } from "./shared";

export type CurrencyTotal = { currency: string; amount: number };
export type MovementFilters = { account: string; direction: string; from: string; to: string };
export const emptyMovementFilters: MovementFilters = { account: "", direction: "", from: "", to: "" };

function currencyTotals(rows: { currency: string; amount: number }[]): CurrencyTotal[] {
 const cents = new Map<string, number>();
 for (const row of rows) cents.set(row.currency, (cents.get(row.currency) || 0) + Math.round(row.amount * 100));
 return [...cents].map(([currency, amount]) => ({ currency, amount: amount / 100 }));
}

// Presentation aggregates server values only; never reconstruct a balance from paginated movements.
export function treasuryOverview(data: TreasuryData) {
 const known = data.accounts.filter(a => a.system_balance !== null && Number.isFinite(a.system_balance));
 const unknown = data.accounts.filter(a => !known.includes(a));
 return {
  known, unknown, accounts: [...known, ...unknown],
  balances: currencyTotals(known.map(a => ({ currency: a.currency, amount: a.system_balance! }))),
  pending: data.can_manage ? { count: data.pending_sources.length, totals: currencyTotals(data.pending_sources.map(s => ({ currency: s.currency, amount: s.cash_amount }))) } : null,
 };
}

export function movementSource(row: CashMovement): TreasurySource | null {
 const source = row.source_snapshot_json;
 return source && ["payment", "direct_money_receipt"].includes(source.source_type) && source.source_id && source.reference ? source : null;
}

export function movementDate(row: CashMovement): string {
 const received = movementSource(row)?.received_on;
 if (received && /^\d{4}-\d{2}-\d{2}$/.test(received)) return received;
 return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(row.occurred_at));
}

export function filterMovements(rows: CashMovement[], filters: MovementFilters): CashMovement[] {
 return rows.filter(row => (!filters.account || locationKey(row) === filters.account)
  && (!filters.direction || row.direction === filters.direction)
  && (!filters.from || movementDate(row) >= filters.from)
  && (!filters.to || movementDate(row) <= filters.to));
}
