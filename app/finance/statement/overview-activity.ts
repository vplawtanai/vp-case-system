import type { StatementAccount } from "./shared";
import type { StatementRow } from "./workspace";
import type { OverviewAccount, StatementRead } from "./overview-data";

export type ActivityRow = StatementRow & { account: StatementAccount; toAccount?: StatementAccount };
type Stream = { account: StatementAccount; rows: StatementRow[]; offset: number; count: number; externalCount: number; loadedExternal: number; inflow?: number; outflow?: number; last?: StatementRow };
export type OverviewActivity = { rows: ActivityRow[]; count: number; streams: Stream[]; transfers: ActivityRow[]; transferOffset: number; from: string; to: string };
type TransferRow = StatementRow & { transfer_id?: string };
// Match the existing account Statement order: occurred_at, confirmed_at, UUID DESC.
// Keep sub-millisecond precision and compare actual instants, independent of locale.
function timestamp(a?: string, b?: string) {
 if (!a || !b) return a === b ? 0 : !a ? -1 : 1;
 const difference = Date.parse(b) - Date.parse(a);
 if (!Number.isFinite(difference)) throw Error("Invalid activity timestamp");
 return difference || Number((b.match(/\.(\d+)/)?.[1] || "").padEnd(6, "0").slice(3, 6)) - Number((a.match(/\.(\d+)/)?.[1] || "").padEnd(6, "0").slice(3, 6));
}
export function activityOrder(a: StatementRow, b: StatementRow) {
 return timestamp(a.occurred_at, b.occurred_at) || timestamp(a.confirmed_at, b.confirmed_at) || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1);
}
function validatePage(rows: StatementRow[], last?: StatementRow) {
 for (const row of rows) {
  if (!row.id || !row.occurred_at || !Number.isFinite(Date.parse(row.occurred_at)) || (last && activityOrder(last, row) >= 0)) throw Error("Activity changed; refresh required");
  last = row;
 }
}
export function createOverviewActivity(accounts: OverviewAccount[], from: string, to: string): OverviewActivity {
 const transfers: ActivityRow[] = [];
 const targets = new Map<string | undefined, StatementAccount>();
 for (const a of accounts) for (const row of a.transfers as TransferRow[]) if (row.direction === "inflow") targets.set(row.transfer_id, a.account);
 for (const a of accounts) for (const row of a.transfers as TransferRow[]) {
  if (row.direction !== "outflow") continue;
  const target = targets.get(row.transfer_id);
  if (!target) throw Error("Incomplete transfer pair");
  transfers.push({ ...row, account: a.account, toAccount: target });
 }
 const streams = accounts.map(a => {
  validatePage(a.period.rows);
  if (a.period.rows.length > a.period.count || (!a.period.rows.length && a.period.count)) throw Error("Invalid activity count");
  const rows = a.period.rows.filter(r => r.kind !== "transfer"), externalCount = a.period.count - a.transfers.length;
  if (externalCount < rows.length) throw Error("Invalid activity count");
  return { account: a.account, rows, offset: rows.length === externalCount ? a.period.count : a.period.rows.length, count: a.period.count, externalCount, loadedExternal: rows.length, inflow: a.period.inflow, outflow: a.period.outflow, last: a.period.rows.at(-1) };
 });
 const count = accounts.reduce((n, a) => n + a.period.count, 0) - transfers.length;
 if (!Number.isSafeInteger(count) || count < 0) throw Error("Invalid activity count");
 return { rows: [], count, streams, transfers: transfers.sort(activityOrder), transferOffset: 0, from, to };
}
// Merge independently paginated, already ordered account streams. Fetch another
// existing 50-row RPC page only when that account's buffered rows are exhausted.
// Return a new cursor; errors/retries never partially consume the previous one.
export async function expandOverviewActivity(read: StatementRead, previous: OverviewActivity, active = () => true): Promise<OverviewActivity> {
 const next: OverviewActivity = { ...previous, rows: [...previous.rows], streams: previous.streams.map(s => ({ ...s, rows: [...s.rows] })) };
 const limit = Math.min(next.rows.length + 10, next.count);
 while (next.rows.length < limit) {
  if (!active()) throw Error("Stale request");
  for (const stream of next.streams) while (!stream.rows.length && stream.offset < stream.count) {
   if (!active()) throw Error("Stale request");
   const r = await read("get_finance_account_statement", { p_bank: stream.account.bank_account_id, p_cash: stream.account.cash_location_id, p_from: next.from, p_to: next.to, p_type: "all", p_search: "", p_offset: stream.offset });
   const d = r.data as { rows: StatementRow[]; count: number; inflow: number; outflow: number } | null;
   if (r.error || !d || !Array.isArray(d.rows) || !d.rows.length || d.rows.length > 50 || d.count !== stream.count || d.inflow !== stream.inflow || d.outflow !== stream.outflow || stream.offset + d.rows.length > stream.count) throw Error("Activity changed; refresh required");
   validatePage(d.rows, stream.last);
   stream.offset += d.rows.length; stream.last = d.rows.at(-1); stream.rows = d.rows.filter(r => r.kind !== "transfer");
   stream.loadedExternal += stream.rows.length;
   if (stream.loadedExternal > stream.externalCount) throw Error("Activity changed; refresh required");
   // Transfer events were already read for the unchanged KPI. No need to refetch
   // trailing cash legs once every external movement in this stream is buffered.
   if (stream.loadedExternal === stream.externalCount) stream.offset = stream.count;
  }
  const heads = next.streams.flatMap((s, index) => s.rows[0] ? [{ row: { ...s.rows[0], account: s.account } as ActivityRow, index }] : []);
  const transfer = next.transfers[next.transferOffset];
  if (transfer) heads.push({ row: transfer, index: -1 });
  heads.sort((a, b) => activityOrder(a.row, b.row));
  const chosen = heads[0]; if (!chosen) throw Error("Incomplete activity; refresh required");
  if (chosen.index === -1) next.transferOffset++; else next.streams[chosen.index].rows.shift();
  if (next.rows.at(-1) && activityOrder(next.rows.at(-1)!, chosen.row) >= 0) throw Error("Activity changed; refresh required");
  next.rows.push(chosen.row);
 }
 return next;
}
