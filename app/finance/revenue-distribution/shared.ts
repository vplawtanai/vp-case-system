import type { FormulaContext } from "../payments/vp-formula";
import type { DistributionDecision } from "../payments/vp-distribution";
export type RevenueState = "pending" | "unpaid" | "partial" | "paid" | "history" | "confirmed";
export type RevenueRow = {
 source_type: "payment" | "direct_money_receipt"; source_id: string; reference: string; received_on: string;
 client: string | null; matter: string | null; account: string | null; currency: string;
 cash: number; vat: number | null; wht: number; gross: number; basis: number | null; blockers: string[];
 policy: string; distribution_id: string | null; distribution_status: string | null; rights: number; settled: number; state: RevenueState;
};
export type RevenueWorkspaceData = { rows: RevenueRow[]; count: number; can_manage: boolean; summary: { state: RevenueState; currency: string; count: number; amount: number | null; unresolved: number }[] };
export type ParticipantSettlement = { id: string; source_line_id: string; component_no: number; recipient_id: string; gross_amount: number; payout_id: string | null; paid_on: string | null; net_amount: number | null; wht_amount: number | null; account: string | null };
export type RevenueDetailData = FormulaContext & { summary: RevenueRow; participants?: ParticipantSettlement[] };
export const revenueHref = (type: string, id: string) => `/finance/revenue-distribution/${type}/${id}`;
export const receiptHref = (r: RevenueRow) => `/finance/${r.source_type === "payment" ? "payments" : "direct-money"}/${r.source_id}`;
export function distributionTotals(choices: DistributionDecision[]) {
 const sum = (field: "company_share_amount" | "referral_amount" | "work_compensation_amount") => choices.reduce((n, r) => n + Math.round(Number(r[field]) * 100), 0);
 const company = sum("company_share_amount"), individuals = sum("referral_amount") + sum("work_compensation_amount");
 return { company: company / 100, individuals: individuals / 100, total: (company + individuals) / 100 };
}
