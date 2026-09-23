import { readExpenseRequests, readExpenses } from "../expenses/data";
import { supabase } from "../../../lib/supabase";
import { frozenExpenseMovementLabel, type ExpenseMovementLabel, type FrozenExpensePayout } from "./movement-labels";
import type { CashMovement } from "./shared";

export async function readExpenseMovementLabels(rows: CashMovement[]): Promise<Record<string, ExpenseMovementLabel>> {
 const ids = [...new Set(rows.flatMap(row => row.source_payout_id ? [row.source_payout_id] : []))];
 if (!ids.length) return {};
 // The payout table denies direct authenticated reads. Existing expense RPCs expose
 // confirmed audit evidence only to authorized readers; never broaden that access.
 const sources = await Promise.allSettled([
  readExpenseRequests(false).then(requests => requests?.flatMap(request => request.items) || []),
  readExpenseRequests(true).then(requests => requests?.flatMap(request => request.items) || []),
  readExpenses(null, false).then(data => data.rows),
  readExpenses(null, true).then(data => data.rows),
 ]);
 const payouts = new Map<string, FrozenExpensePayout>();
 for (const source of sources) {
  if (source.status !== "fulfilled") continue;
  for (const expense of source.value) {
   const payout = expense.payout;
   if (!payout || payout.status !== "confirmed" || !ids.includes(payout.id)) continue;
   const evidence = expense.audit.find(event => event.event_type === "payment_confirmed")?.evidence_json;
   if (evidence) payouts.set(payout.id, { id: payout.id, status: payout.status, source_model: "expense_v1", confirmed_snapshot_json: evidence });
  }
 }
 const labels = Object.fromEntries(rows.flatMap(row => {
  const label = frozenExpenseMovementLabel(row, payouts.get(row.source_payout_id || ""));
  return label ? [[row.id, label]] : [];
 }));
 const values = Object.values(labels);
 // Targeted optional lookups only. A denied/missing name never hides frozen payment evidence.
 const lookup = async (table: string, columns: string, ids: (string | number | undefined)[]) => {
  const unique = [...new Set(ids.filter((id): id is string | number => id !== undefined))];
  if (!unique.length) return [];
  try { const r = await supabase.from(table).select(columns).in("id", unique); return r.error || !Array.isArray(r.data) ? [] : r.data as unknown as Record<string, unknown>[]; } catch { return []; }
 };
 const [people, clients, cases, matters] = await Promise.all([
  lookup("user_profiles", "id,staff_name,full_name", values.map(v => v.requesterId)),
  lookup("clients", "id,name", values.map(v => v.clientId)),
  lookup("cases", "id,file_no,title", values.map(v => v.caseId)),
  lookup("advisory_matters", "id,matter_no,title", values.map(v => v.matterId)),
 ]);
 const name = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined;
 for (const label of values) {
  const person = people.find(p => p.id === label.requesterId), client = clients.find(c => c.id === label.clientId);
  const work = label.caseId !== undefined ? cases.find(c => c.id === label.caseId) : matters.find(m => m.id === label.matterId);
  label.requester = name(person?.staff_name) || name(person?.full_name);label.client = name(client?.name);
  label.matter = work ? [name(work.file_no || work.matter_no), name(work.title)].filter(Boolean).join(" · ") : undefined;
 }
 return labels;
}
