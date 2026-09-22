import type { ExpenseRequest, RequestItemInput } from "./requests";

// Compare the actual read-back, never reconstruct missing facts from local state or audit JSON.
export function companyDeclarationsMatch(items: RequestItemInput[], request: ExpenseRequest) {
 if (items.length !== request.items.length) return false;
 return items.every(({ id, input }) => {
  const row = request.items.find(item => item.id === id);
  if (!row) return false;
  if (input.creator_tax) {
   const expected = input.creator_tax as Record<string, unknown>;
   if (!row.creator_tax || !(["vat_mode", "vat_rate", "wht_state", "wht_rate"] as const).every(k => row.creator_tax?.[k] === expected[k])) return false;
  }
  return (["creator_payment_fact", "vat_awareness", "wht_awareness", "personally_paid", "claimant_id", "reimbursement_requested"] as const).every(key => {
   if (!Object.hasOwn(input, key)) return true;
   const expected = key === "claimant_id" ? input[key] || null : input[key];
   return row[key] === expected;
  });
 });
}
