import { decimalUnits } from "../compensation/formula-calculation";
import type { PayableComponent } from "../payables/shared";
import type { Location } from "../treasury/shared";
export type Destination = { id: string; bank_name: string; account_name: string; account_number: string };
export type Payee = { id: string; kind: "internal" | "external"; profile_id: string | null; legal_name: string; entity_type: "natural_person" | "juristic_person"; tax_id: string | null; version: number | null; is_active: boolean; destination: Destination | null };
export type Choice = { entitlement_id: string; treatment: "none" | "withhold"; rate: number; gross?: number; wht?: number; entitlement?: PayableComponent };
export type Payout = { id: string; payee_id: string; status: "draft" | "confirmed" | "cancelled"; version: number; paid_on: string; bank_account_id: string | null; cash_location_id: string | null; choices_json: Choice[]; gross_amount: number; wht_amount: number; net_amount: number; note: string; confirmed_snapshot_json: { payee: Payee; destination: Destination | null; account: Location } | null };
export type Workspace = { can_manage: boolean; payees: Payee[]; payout: Payout | null; components: PayableComponent[]; accounts: Location[]; history: { id: string; paid_on: string; status: Payout["status"]; gross: number; wht: number; net: number }[] };
export const mask = (value: string | null | undefined) => value ? `••••${value.slice(-4)}` : "-";
export const payoutHref = (payee: string, id = "new") => `/finance/payouts/${id}?payee=${encodeURIComponent(payee)}`;
export function payoutMath(rows: PayableComponent[], rates: Record<string, string>) {
 let gross = BigInt(0), wht = BigInt(0); let valid = rows.length > 0;
 const choices: Choice[] = [];
 for (const row of rows) {
  const amount = decimalUnits(row.gross_amount, 2), rate = decimalUnits(rates[row.id] ?? "", 4);
  if (amount !== null) gross += amount;
  if (amount === null || rate === null || rate >= BigInt(1000000)) { valid = false; continue; }
  wht += (amount * rate + BigInt(500000)) / BigInt(1000000);
  choices.push({ entitlement_id: row.id, treatment: rate === BigInt(0) ? "none" : "withhold", rate: Number(rate) / 10000 });
 }
 return { valid: valid && gross > wht, choices, gross: Number(gross) / 100, wht: Number(wht) / 100, net: Number(gross - wht) / 100 };
}
export function payoutBlock(payee: Payee | undefined, account: Location | undefined, wht: number, date: string) {
 if (!payee?.is_active) return "inactive";
 if (!account?.is_active) return "required";
 if (account.kind === "bank" && !payee.destination) return "bankMissing";
 if (wht > 0 && !payee.tax_id) return "taxMissing";
 if (account.system_balance === null || !account.opening_as_of) return "unknown";
 if (Date.parse(`${date}T23:59:59.999+07:00`) <= Date.parse(account.opening_as_of)) return "cutoff";
 return null;
}
export function payoutError(error: unknown) {
 const message = String((error as { message?: string })?.message || "");
 return /STALE|RIGHTS_UNAVAILABLE/.test(message) ? "stale" : /PERMISSION/.test(message) ? "permission" : /DESTINATION/.test(message) ? "bankMissing"
  : /TAX_ID/.test(message) ? "taxMissing" : /OPENING_BALANCE/.test(message) ? "unknown" : /BEFORE_CUTOVER/.test(message) ? "cutoff" : /REQUIRED|INVALID|INPUT/.test(message) ? "required" : "failed";
}
