import { activeFiling, filingCoverage, type Filing, type FilingPool } from "./filings/shared";
import type { DeadlineEvidence } from "./filings/deadline-review";
import { currentBangkokMonth, shiftMonth } from "./dashboard-data";
import { taxMonthSummary, type TaxMonth } from "./period-data";

// Display only: use the same current/frozen online deadline shown on each card.
// Readiness labels do not advance a filing or confirm its Tax Calendar evidence.
export function filingObligationDisplay(pool: FilingPool, filing: Filing | undefined, calendar: DeadlineEvidence | undefined) {
 const frozen = filing?.deadline_snapshot_json?.channel === "online";
 const deadline = frozen ? filing.deadline_snapshot_json : calendar;
 const due = frozen ? filing.due_date : calendar?.due_date;
 const confirmed = !!due && (deadline?.status === "calculated" || deadline?.status === "admin_override");
 const state = filing?.status === "filed" ? filing.remittance?.status === "confirmed" ? "paid" : "filed"
  : !pool.ready || filing?.source_changed ? "review" : confirmed ? "ready" : "dataReady";
 return { state, due };
}

// The existing Tax Calendar (054 tax_filing_deadline) starts the filing cycle
// one month after period_month. This translates the selector, not the deadline:
// reviewed calendar dates, holiday adjustments and frozen deadlines stay authoritative.
export function taxPeriodForFilingMonth(filingMonth: string) {
 return shiftMonth(filingMonth, -1);
}

export function filingMonthForTaxPeriod(taxPeriod: string) {
 return shiftMonth(taxPeriod, 1);
}

export function taxPeriodsForView(selection: string) {
 if (selection.length === 7) return [taxPeriodForFilingMonth(selection)];
 if (!/^\d{4}$/.test(selection)) throw new Error("Invalid filing year");
 // Filing activity needs prior December–November. Existing annual money totals
 // still need January–December, so read the union once without shifting totals.
 return Array.from({ length: 13 }, (_, i) => shiftMonth(`${selection}-01`, i - 1));
}

export function filingYearView(periods: TaxMonth[], year: string, currentFilingMonth = currentBangkokMonth()) {
 const currentTaxPeriod = taxPeriodForFilingMonth(currentFilingMonth);
 const rows = Array.from({ length: 12 }, (_, i) => {
  const filingMonth = `${year}-${String(i + 1).padStart(2, "0")}`;
  const taxPeriod = taxPeriodForFilingMonth(filingMonth);
  const data = periods.find(p => p.month === taxPeriod);
  if (!data) return null;
  return { filingMonth, taxPeriod, ...taxMonthSummary(data, currentTaxPeriod) };
 });
 // A tab/year switch renders once before its asynchronous read starts.
 if (rows.some(r => r === null)) return null;
 const completeRows = rows.filter(r => r !== null);
 return { rows: completeRows, complete: completeRows.filter(r => r.status === "complete").length, outstanding: completeRows.filter(r => r.status === "outstanding").length };
}

// Expose existing form records, never infer a WHT form from an amount or payee name.
// The backend's review sources/issues own whether classification/evidence is resolved.
export function filingObligationsForDisplay(data: TaxMonth) {
 const whtNeedsReview = data.filing.pools.some(p => p.filing_type !== "vat" &&
  ((filingCoverage(p).review_sources?.length ?? 0) > 0 || p.issues.some(i => i.code === "unclassified_wht" || i.code === "source_evidence_incomplete")));
 const pools = data.filing.pools.filter(p => p.filing_type === "vat" ||
  activeFiling(data.filing, p.filing_type)?.status === "filed" ||
  (!whtNeedsReview && (filingCoverage(p).source_count > 0 || activeFiling(data.filing, p.filing_type))));
 return { pools, whtNeedsReview };
}
