import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";

export type Location = { kind: "bank" | "cash"; account_id: string; bank_account_id: string | null; cash_location_id: string | null; name_th: string; name_en: string; bank_name: string | null; account_number: string | null; is_active: boolean; currency: string; opening_id: string | null; opening_as_of: string | null; opening_amount: number | null; system_balance: number | null; inflow: number; outflow: number };
export type Opening = { id: string; bank_account_id: string | null; cash_location_id: string | null; currency: string; as_of: string; balance_amount: number; note: string; status: string; updated_at: string; supersedes_opening_balance_id: string | null };
export type TreasurySource = { source_type: "payment" | "direct_money_receipt"; source_id: string; status: string; bank_account_id: string | null; cash_location_id: string | null; received_on: string; cash_amount: number; wht_amount: number; currency: string; payer_name: string | null; reference: string; description: string | null; legacy_cash_location?: string | null };
export type CashMovement = { id: string; bank_account_id: string | null; cash_location_id: string | null; occurred_at: string; cash_amount: number; currency: string; direction: string; transaction_type: string; status: string; reference_no: string | null; description: string | null; source_snapshot_json: TreasurySource | null };
export type TreasuryData = { can_manage: boolean; accounts: Location[]; openings: Opening[]; transactions: CashMovement[]; pending_sources: TreasurySource[]; has_next: boolean };
export const locationKey = (row: { bank_account_id: string | null; cash_location_id: string | null }) => row.bank_account_id ? `bank:${row.bank_account_id}` : row.cash_location_id ? `cash:${row.cash_location_id}` : "";
export const locationName = (row: Location | undefined, locale: UiLocale) => row ? (locale === "th" ? row.name_th : row.name_en) || "-" : "-";
export const sourceHref = (row: TreasurySource) => `/finance/${row.source_type === "payment" ? "payments" : "direct-money"}/${row.source_id}`;
export function openingStart(asOf: string): string {
 // The authoritative cutoff is the end of the prior Bangkok day.
 return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(new Date(asOf).getTime() + 1));
}
export function sourceBlock(source: TreasurySource, account: Location | undefined): string | null {
 if (source.source_type === "payment" && !source.bank_account_id) return "paymentLocationRequired";
 if (!account?.is_active) return "locationRequired";
 if (!account.opening_id || !account.opening_as_of) return "unknown";
 if (source.received_on < openingStart(account.opening_as_of)) return "cutoffCovered";
 return null;
}
export function treasuryError(error: unknown, locale: UiLocale): string {
 const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
 const code = message.includes("SOURCE_CHANGED") || message.includes("OPENING_LINEAGE") ? "changed"
  : message.includes("PERMISSION_DENIED") ? "permission" : message.includes("OPENING_BALANCE_REQUIRED") ? "opening"
  : message.includes("LOCATION_REQUIRED") ? "location" : message.includes("CORRECTION_WORKFLOW_REQUIRED") ? "correction"
  : message.includes("BEFORE_CUTOVER") ? "cutoffCovered" : message.includes("ACK_REQUIRED") || message.includes("OPENING_INPUT") ? "required" : "failed";
 return translate(locale, code === "cutoffCovered" ? "treasury.cutoffCovered" : `treasury.error.${code}`);
}
