import type { Workspace } from "./shared";

export const validPayeeContextId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// The permission-checked workspace RPC remains authoritative. Never fall back to another Payee.
export function validPayoutEntry(data: Workspace, payeeId: string | null, payoutId: string) {
 if (!Array.isArray(data.payees) || !Array.isArray(data.components) || !Array.isArray(data.history) || !Array.isArray(data.accounts)) return false;
 if (payeeId === null) return payoutId === "new" && !data.payout && !data.components.length && !data.history.length;
 if (!validPayeeContextId(payeeId)) return false;
 const canonical = payeeId.toLowerCase();
 if (!data.payees.some(p => p.id === canonical)) return false;
 if (data.components.some(c => c.recipient_id !== canonical)) return false;
 if (payoutId === "new") return !data.payout;
 const payout = data.payout;
 return !!payout && payout.id === payoutId && payout.payee_id === canonical
  && (!payout.confirmed_snapshot_json || payout.confirmed_snapshot_json.payee.id === canonical)
  && payout.choices_json.every(c => !c.entitlement || c.entitlement.recipient_id === canonical);
}

export function hasPayoutEntrySelections(selected: string[], rates: Record<string, string>, account: string, paidOn: string, initialDate: string, note: string) {
 // The automatically supplied current date alone is not an entered payment choice.
 return selected.length > 0 || Object.keys(rates).length > 0 || !!account || paidOn !== initialDate || !!note;
}
