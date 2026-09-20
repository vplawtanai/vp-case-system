import { supabase } from "../../../lib/supabase";
import { readAll } from "../tax-position/dashboard-data";
import { emptyLookups, type ExpenseData, type ExpenseLookups } from "./shared";
import type { ExpenseRequest } from "./requests";

export async function readExpenseRequests(claims: boolean): Promise<ExpenseRequest[] | null> {
 const rows: ExpenseRequest[] = [];
 for (let offset = 0; offset < 100000; offset += 50) {
  const r = await supabase.rpc("get_finance_expense_requests", { p_claims: claims, p_offset: offset });
  // Rolling deployment compatibility only; never hide permission/network/data errors.
  if (offset === 0 && r.error?.code === "PGRST202" && r.error.message.includes("get_finance_expense_requests")) return null;
  if (r.error || !Array.isArray(r.data?.rows)) throw r.error || new Error("response");
  rows.push(...r.data.rows);
  if (!r.data.has_next) return rows;
  if (r.data.rows.length !== 50) throw new Error("incomplete request read");
 }
 throw new Error("request read limit");
}

export async function readExpenses(id: string | null, claims: boolean): Promise<ExpenseData> {
 let result: ExpenseData | null = null;
 for (let offset = 0; offset < 100000; offset += 50) {
  const r = await supabase.rpc("get_finance_expenses", { p_id: id, p_claims: claims, p_offset: offset });
  if (r.error || !r.data?.access || (!id && !Array.isArray(r.data.rows))) throw r.error || new Error("response");
  const page = r.data as ExpenseData;
  if (!result) result = { ...page, rows: page.rows || [] };
  else result.rows.push(...page.rows);
  if (id || !page.has_next) return result;
  if (page.rows.length !== 50) throw new Error("incomplete read");
 }
 throw new Error("read limit");
}
export async function readExpenseLookups(all: boolean): Promise<ExpenseLookups> {
 // Existing RLS, not a new broad customer/case read grant.
 const clients = await readAll<ExpenseLookups["clients"][number]>((a, b) => supabase.from("clients").select("id,name", { count: "exact" }).order("id").range(a, b));
 const cases = await readAll<ExpenseLookups["cases"][number]>((a, b) => supabase.from("cases").select("id,client_id,file_no,title", { count: "exact" }).order("id").range(a, b));
 const matters = await readAll<ExpenseLookups["matters"][number]>((a, b) => supabase.from("advisory_matters").select("id,client_id,matter_no,title", { count: "exact" }).order("id").range(a, b));
 let parties = { payees: emptyLookups.payees, people: emptyLookups.people };
 if (all) {
  const r = await supabase.rpc("get_finance_expense_parties");
  if (r.error || !Array.isArray(r.data?.payees)) throw r.error || new Error("response");
  parties = r.data;
 }
 return { clients, cases, matters, ...parties };
}
