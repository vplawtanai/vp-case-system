import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserPermissions } from "../../../lib/permissions";
import { currentBangkokMonth, readMonthlyTaxSources, summarizeDashboard, type DashboardData } from "./dashboard-data";
import { activeFiling, filingCoverage, filingInput, filingMonthlyFacts, type FilingData, type FilingSource, type FilingType } from "./filings/shared";
import type { DeadlineEvidence } from "./filings/deadline-review";
export type ExternalVat = { id: string; vendor: string; invoice_date: string; invoice_number: string; tax_base: number; vat_amount: number; note: string; funding_source: string; review: { id: string; status: "pending" | "eligible" | "ineligible"; reason: string } | null };
export type InputEvidence = { can_manage: boolean; external: ExternalVat[]; expenses: { id: string; origin: string; vendor: string | null; reference: string | null; invoice_date: string; tax_base: number | null; vat_amount: number | null; status: string }[] };
export type TaxMonth = { month: string; filing: FilingData; inputs: InputEvidence; sources: DashboardData; deadlines: Partial<Record<FilingType, DeadlineEvidence>> };
export async function readTaxMonth(client: SupabaseClient, permissions: UserPermissions, month: string): Promise<TaxMonth> {
 const [filing, inputs, sources, ...deadlines] = await Promise.all([
  client.rpc("get_finance_tax_filings", { p_month: month + "-01" }),
  client.rpc("get_finance_tax_input_evidence", { p_month: month + "-01" }),
  readMonthlyTaxSources(client, permissions, month),
  ...(["vat", "wht_natural", "wht_juristic"] as const).map(type => client.rpc("get_finance_tax_deadline", { p_month: month + "-01", p_type: type, p_channel: "online" })),
 ]);
 if (filing.error || inputs.error || !Array.isArray(filing.data?.pools) || !Array.isArray(inputs.data?.external) || !Array.isArray(inputs.data?.expenses)) throw new Error("tax read unavailable");
 return { month, filing: filing.data, inputs: inputs.data, sources: { ...sources, treasury: null, payables: null, register: null },
  deadlines: Object.fromEntries(deadlines.filter(d => !d.error && d.data?.period_month === month + "-01" && d.data?.channel === "online").map(d => [d.data.filing_type, d.data])) };
}
export function taxMonthSummary(data: TaxMonth, current = currentBangkokMonth()) {
 const raw = summarizeDashboard(data.sources, data.month), vat = data.filing.pools.find(p => p.filing_type === "vat");
 const output = vat ? filingMonthlyFacts(vat, { outputVat: raw.outputVat, incomingWht: raw.wht })?.outputVat ?? null : raw.outputVat;
 const input = vat && vat.schema_version === 2 ? vat.monthly_facts.reviewed_input_vat ?? null : null;
 const pending = [...data.inputs.expenses.filter(e => e.status === "pending"), ...data.inputs.external.filter(e => !e.review || e.review.status === "pending")];
 const pendingVat = pending.every(e => e.vat_amount !== null) ? sum(pending.map(e => e.vat_amount!)) : null;
 const obligations = data.filing.pools.filter(p => p.filing_type === "vat" || filingCoverage(p).source_count > 0 || p.issues.length > 0 || activeFiling(data.filing,p.filing_type));
 const filed = obligations.length > 0 && obligations.every(p => activeFiling(data.filing,p.filing_type)?.status === "filed");
 const wht = data.filing.pools.filter(p => p.filing_type !== "vat");
 // Confirmed withholding facts may still need entity/tax evidence review before filing.
 const whtSources = [...new Map(wht.flatMap(p => [...filingCoverage(p).sources, ...(filingCoverage(p).review_sources || [])]).map(s => [s.id,s])).values()];
 const outgoing = sum(whtSources.map(s => s.amount));
 const unclassified = whtSources.filter(s => !["natural_person","juristic_person"].includes(s.entity_type || ""));
 const vatFiling = activeFiling(data.filing,"vat");
 const net = vatFiling?.status === "filed" ? vatFiling.tax_amount : vat?.tax_amount ?? null;
 return { output, input, pendingVat, pendingCount: pending.length, incoming: raw.wht, outgoing, net, whtSources, unclassified,
  estimate: output !== null && input !== null ? sum([output, -input]) : null,
  incomplete: !vat || !filingInput(vat).input_vat_complete, obligations, movements: raw.movements, credits: raw.credits,
  status: filed ? "complete" : data.month > current && !data.filing.filings.length && !raw.movements.length && !data.inputs.external.length && !data.inputs.expenses.length && !wht.some(p => filingCoverage(p).source_count) ? "future" : "outstanding" };
}
export const sum = (values: number[]) => values.reduce((n, v) => n + Math.round(v * 100), 0) / 100;
export function taxYearSummary(months: TaxMonth[]) {
 const rows = months.map(m => ({ month: m.month, ...taxMonthSummary(m) }));
 const total = (key: "output" | "input" | "net" | "outgoing" | "incoming") => rows.length === 12 && rows.every(r => r[key] !== null) ? sum(rows.map(r => r[key]!)) : null;
 return { rows, output: total("output"), input: total("input"), net: total("net"), outgoing: total("outgoing"), incoming: total("incoming"), complete: rows.filter(r => r.status === "complete").length, outstanding: rows.filter(r => r.status === "outstanding").length };
}

// Show only confirmed source facts; no destination-bank inference or transaction creation.
export function withholdingTrace(source: FilingSource) {
 const evidence = source.evidence as { evidence_json?: { gross?: number; wht?: number; expense_id?: string; expense?: { origin?: string; description?: string; category?: string } } } | null;
 const line = evidence?.evidence_json;
 return { gross: typeof line?.gross === "number" ? line.gross : null,
  cash: typeof line?.gross === "number" && typeof line?.wht === "number" ? sum([line.gross,-line.wht]) : null,
  expenseId: line?.expense_id, claim: line?.expense?.origin === "employee_claim",
  title: line?.expense?.description || line?.expense?.category || source.reference };
}
