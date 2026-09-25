import type { StatementAccount, StatementAccounts } from "./shared";
import type { StatementData, StatementRow } from "./workspace";
import type { TreasuryData } from "../treasury/shared";
import { createOverviewActivity, expandOverviewActivity, type OverviewActivity } from "./overview-activity";

type ReadResult = { data: unknown; error?: unknown };
export type StatementRead = (name: string, args?: Record<string, unknown>) => PromiseLike<ReadResult>;
export type OverviewAccount = { account: StatementAccount; current: StatementData; period: StatementData; transfers: StatementRow[] };
export type OverviewData = { accounts: OverviewAccount[]; company: StatementData | null; canTransfer: boolean; canManageOpenings: boolean; asOf: string; activity: OverviewActivity };
type TransferRow = StatementRow & { transfer_id?: string };
export const accountKey = (a: StatementAccount) => `${a.kind}:${a.account_id}`;
// Sum only authoritative THB cash amounts, in satang. Unknown balances stay unknown.
export function satang(value: unknown): number {
 if (typeof value !== "number" || !Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100))) throw Error("Invalid money");
 return Math.round(value * 100);
}
const sum = (values: number[]) => values.reduce((total, n) => { const next = total + n; if (!Number.isSafeInteger(next)) throw Error("Money overflow"); return next; }, 0);
function balance(accounts: OverviewAccount[]) {
 if (accounts.some(a => a.current.balance_covered !== true || a.current.closing == null)) return null;
 return sum(accounts.map(a => satang(a.current.closing))) / 100;
}
export function overviewTotals(accounts: OverviewAccount[]) {
 const legs = new Map<string, { amount: number; incoming?: string; outgoing?: string }>();
 const seen = new Set<string>();
 let internalIn = 0, internalOut = 0;
 for (const a of accounts) for (const row of a.transfers as TransferRow[]) {
  if (!row.transfer_id || row.kind !== "transfer" || seen.has(row.id) || !["inflow", "outflow"].includes(row.direction || "")) throw Error("Invalid transfer evidence");
  seen.add(row.id);
  const amount = satang(row.cash_amount), leg = legs.get(row.transfer_id) || { amount };
  if (amount <= 0 || leg.amount !== amount) throw Error("Transfer amount mismatch");
  const key = row.direction === "inflow" ? "incoming" : "outgoing";
  if (leg[key]) throw Error("Duplicate transfer leg");
  leg[key] = accountKey(a.account); legs.set(row.transfer_id, leg);
  if (key === "incoming") internalIn = sum([internalIn, amount]); else internalOut = sum([internalOut, amount]);
 }
 for (const leg of legs.values()) if (!leg.incoming || !leg.outgoing || leg.incoming === leg.outgoing) throw Error("Incomplete transfer pair");
 const incoming = sum(accounts.map(a => satang(a.period.inflow))), outgoing = sum(accounts.map(a => satang(a.period.outflow)));
 if (internalIn > incoming || internalOut > outgoing) throw Error("Movement totals changed; refresh required");
 return { total: balance(accounts), bank: balance(accounts.filter(a => a.account.kind === "bank")), cash: balance(accounts.filter(a => a.account.kind === "cash")),
  externalIn: (incoming - internalIn) / 100, externalOut: (outgoing - internalOut) / 100, internal: internalOut / 100,
  unknown: accounts.filter(a => a.current.balance_covered !== true || a.current.closing == null).length };
}
export async function loadStatementOverview(read: StatementRead, options: { canCash: boolean; canCompany: boolean; from: string; to: string; today: string }, active = () => true): Promise<OverviewData> {
 const args = { p_from: options.from, p_to: options.to, p_type: "all", p_search: "", p_offset: 0 };
 async function call(name: string, params?: Record<string, unknown>) {
  if (!active()) throw Error("Stale request");
  const r = await read(name, params); if (r.error || !r.data || typeof r.data !== "object") throw Error("Statement read failed"); return r.data;
 }
 async function statement(params: Record<string, unknown>) {
  const d = await call("get_finance_account_statement", params) as StatementData;
  if (!Array.isArray(d.rows) || !Number.isSafeInteger(d.count) || d.count < 0) throw Error("Invalid Statement response");
  satang(d.inflow); satang(d.outflow); if (d.closing != null) satang(d.closing);
  return d;
 }
 const [directory, company, treasury] = await Promise.all([
  options.canCash ? call("get_finance_statement_accounts") as Promise<StatementAccounts> : Promise.resolve(null),
  options.canCompany ? call("get_finance_unified_company_statement", args) as Promise<StatementData> : Promise.resolve(null),
  options.canCash ? call("get_finance_treasury", { p_offset: 0 }) as Promise<TreasuryData> : Promise.resolve(null),
 ]);
 if (directory && !Array.isArray(directory.accounts)) throw Error("Invalid account directory");
 if (company) { if (!Array.isArray(company.rows)) throw Error("Invalid company response"); satang(company.income); satang(company.expense); }
 if (treasury && !Array.isArray(treasury.accounts)) throw Error("Invalid treasury response");
 const accounts: OverviewAccount[] = [];
 // Bound concurrent reads; the first page supplies recent rows, never period totals.
 const pending = [...directory?.accounts || []];
 await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
  while (pending.length) {
   const account = pending.shift()!;
   const params = { ...args, p_bank: account.bank_account_id, p_cash: account.cash_location_id };
   const [period, first] = await Promise.all([statement(params), statement({ ...params, p_type: "transfer" })]);
   // All current balances come from ONE authoritative Treasury response, so an
   // internal transfer cannot inflate the total by landing between account reads.
   const balances = treasury!.accounts.filter(a => accountKey(a) === accountKey(account));
   if (balances.length !== 1 || balances[0].currency !== "THB") throw Error("Account directory changed; refresh required");
   const latest = balances[0], covered = !!latest.opening_id && !!latest.opening_as_of && new Date(latest.opening_as_of).getTime() < new Date(`${options.today}T00:00:00+07:00`).getTime();
   if (latest.system_balance != null) satang(latest.system_balance);
   const current: StatementData = { rows: [], count: 0, closing: covered ? latest.system_balance : null, balance_covered: covered };
   // The transfer read also returns unfiltered period totals in the same snapshot.
   period.inflow = first.inflow; period.outflow = first.outflow;
   const transfers = [...first.rows];
   while (transfers.length < first.count) {
    if (!transfers.length || transfers.length > 100000) throw Error("Incomplete transfer pagination");
    const next = await statement({ ...params, p_type: "transfer", p_offset: transfers.length });
    if (next.count !== first.count || next.inflow !== first.inflow || next.outflow !== first.outflow || !next.rows.length) throw Error("Transfer list changed; refresh required");
    transfers.push(...next.rows);
   }
   if (transfers.length !== first.count) throw Error("Invalid transfer count");
   accounts.push({ account, period, current, transfers });
  }
 }));
 accounts.sort((a, b) => a.account.kind.localeCompare(b.account.kind) || a.account.name_th.localeCompare(b.account.name_th));
 const keys = accounts.map(a => accountKey(a.account)); if (new Set(keys).size !== keys.length || (treasury && (treasury.accounts.length !== keys.length || treasury.accounts.some(a => !keys.includes(accountKey(a)))))) throw Error("Duplicate account");
 overviewTotals(accounts); // Fail closed on incomplete transfer evidence, never present inflated totals.
 const activity = await expandOverviewActivity(read, createOverviewActivity(accounts, options.from, options.to), active);
 return { accounts, company, canTransfer: !!directory?.can_transfer, canManageOpenings: !!directory?.can_manage_openings, asOf: options.today, activity };
}
