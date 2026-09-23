import { supabase } from "../../../lib/supabase";
import { frozenExpenseMovementLabel, type ExpenseMovementLabel, type FrozenExpensePayout } from "./movement-labels";
import type { CashMovement } from "./shared";

export async function readExpenseMovementLabels(rows: CashMovement[]): Promise<Record<string, ExpenseMovementLabel>> {
 const ids = [...new Set(rows.flatMap(row => row.source_payout_id ? [row.source_payout_id] : []))];
 if (!ids.length) return {};
 // Existing payout RLS applies; missing or inaccessible source evidence uses the generic display label.
 const result = await supabase.from("finance_payouts").select("id,status,source_model,confirmed_snapshot_json").in("id", ids).eq("source_model", "expense_v1").eq("status", "confirmed");
 if (result.error || !Array.isArray(result.data)) return {};
 const payouts = new Map((result.data as FrozenExpensePayout[]).map(payout => [payout.id, payout]));
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
