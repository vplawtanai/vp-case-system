import { translate } from "../../../lib/i18n/catalog";
import { payableMessages } from "../../../lib/i18n/messages/payables";
import type { UiLocale } from "../../../lib/i18n/core";
import { compensationRoleLabel } from "../../../lib/i18n/legacy-finance";
import { workRoles } from "../compensation/formula-presentation";

export type PayableComponent = {
  id: string; distribution_id: string; distribution_revision: number; distribution_version: number;
  distribution_fingerprint: string; source_type: "payment" | "direct_money_receipt"; received_money_id: string;
  source_line_id: string; component_key: string; component_no: number; formula_code: string; formula_version: number;
  bucket: "referral" | "work"; role_label: string; recipient_type: "user" | "payee"; recipient_id: string; recipient_name: string;
  currency: string; gross_amount: number; finalized_at: string; status: "open" | "superseded" | "settled";
  evidence_json: { line?: { description?: string }; [key: string]: unknown };
};
export type PayableGroup = { recipient_id: string; recipient_name: string; currency: string; open_amount: number; components: PayableComponent[] };
export type PayablePage = { groups: PayableGroup[]; has_next: boolean };
export const initialPayableFilters = { search: "", source: "all", bucket: "all", status: "open" };
export const payableGroupKey = (group: PayableGroup) => `${group.recipient_id}:${group.currency}`;
export const payableSourceHref = (row: PayableComponent) => `/finance/${row.source_type === "payment" ? "payments" : "direct-money"}/${row.received_money_id}`;
export function payableRoleLabel(role: string, locale: UiLocale): string {
  const known = workRoles.find(item => item.value === role);
  return known ? translate(locale, known.label) : compensationRoleLabel(role, locale);
}

export function payableError(error: unknown, locale: UiLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const code = /\bPAYABLE_([A-Z_]+)\b/.exec(message)?.[1];
  const key = `payables.error.${code}`;
  return translate(locale, Object.hasOwn(payableMessages, key) ? key : "payables.error.unknown");
}
