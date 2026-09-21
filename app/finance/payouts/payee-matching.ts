import type { Payee } from "./shared";

// Same conservative trim/case-insensitive name convention as get_finance_payees.
// No punctuation removal, transliteration, fuzzy identity inference or masked Tax ID match.
export const payeeNameKey = (name: string) => name.trim().toLowerCase();
export function matchingSupplierPayees(payees: Payee[], name: string, taxId: string) {
 const key = payeeNameKey(name);
 return payees.filter(p => p.kind === "external" && p.profile_id === null &&
  ((!!taxId && p.tax_id === taxId) || (!!key && payeeNameKey(p.legal_name) === key)));
}
