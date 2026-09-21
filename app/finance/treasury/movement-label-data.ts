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
 return Object.fromEntries(rows.flatMap(row => {
  const label = frozenExpenseMovementLabel(row, payouts.get(row.source_payout_id || ""));
  return label ? [[row.id, label]] : [];
 }));
}
