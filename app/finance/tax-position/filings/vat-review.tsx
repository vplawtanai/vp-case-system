"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Callout, ReadOnlyGrid } from "../../../components/ui/patterns";
import { useI18n } from "../../../../lib/i18n/provider";
import type { MonthlyTaxFacts } from "../dashboard-data";
import type { FilingPool } from "./shared";
import styles from "./filings.module.css";

export function VatFilingReview({ pool, monthlyFacts, outgoingWht }: {
 pool: FilingPool;
 monthlyFacts: MonthlyTaxFacts | null;
 outgoingWht: number | null;
}) {
 const { t, locale } = useI18n(), tr = (key: string) => t(`taxFiling.${key}`);
 const money = (value: number | null | undefined) => value == null ? tr("unknown") : `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const outputKnown = monthlyFacts?.outputVat != null;
 const issueMessages: Record<string, string> = { unclassified_wht: "unclassified_wht", source_evidence_incomplete: "source_evidence_incomplete", legacy_filing_review: "legacy_filing_review" };

 // Monthly facts explain the current review; they never replace frozen filed evidence.
 return <div className={styles.vatReview}>
  <ReadOnlyGrid className={styles.vatFacts} items={[
   { key: "output", label: tr("output"), value: money(monthlyFacts?.outputVat), emphasis: true },
   { key: "input", label: tr("input"), value: pool.input_vat_complete ? money(pool.input_vat) : tr("incomplete") },
   { key: "net", label: tr("net"), value: money(pool.tax_amount), emphasis: true },
  ]} />
  <Callout tone={pool.ready ? "info" : "warning"} role="status">
   <div className={styles.vatReadiness}>
    {pool.ready ? <CheckCircle2 size={20} aria-hidden="true" /> : <TriangleAlert size={20} aria-hidden="true" />}
    <div><strong>{tr(pool.ready ? "evidenceReadyForReview" : "vatNotReady")}</strong>
     {!pool.ready ? <p>{tr(!pool.input_vat_complete ? "vatInputBlockReason" : "notReady")}</p> : null}
    </div>
   </div>
  </Callout>
  <dl className={styles.vatCoverage}><div><dt>{tr("draftCoverage")}</dt><dd>{tr(pool.source_count === 0 ? "notCollected" : pool.ready ? "evidenceReadyForReview" : "incomplete")}</dd></div></dl>
  <section aria-labelledby="vat-review-checks"><h3 id="vat-review-checks">{tr("vatReviewChecks")}</h3><ul className={styles.checklist}>
   {!pool.input_vat_complete ? <li><TriangleAlert size={17} aria-hidden="true" /><span>{tr("inputReview")}</span></li> : null}
   {pool.issues.filter(i => i.code !== "input_vat_incomplete").map(i => <li key={i.code}><TriangleAlert size={17} aria-hidden="true" /><span>{tr(issueMessages[i.code] || "notReady")}</span></li>)}
   <li data-ok={outputKnown || undefined}>{outputKnown ? <CheckCircle2 size={17} aria-hidden="true" /> : <TriangleAlert size={17} aria-hidden="true" />}<span>{tr(outputKnown ? "monthlyOutputKnown" : "monthlyOutputUnknown")}</span></li>
   {outgoingWht === 0 ? <li data-ok><CheckCircle2 size={17} aria-hidden="true" /><span>{tr("noWht")}</span></li> : null}
  </ul></section>
  <div className={styles.vatCredit}><dl><div><dt>{tr("incoming")}</dt><dd>{money(monthlyFacts?.incomingWht)}</dd></div></dl><p>{tr("vatCreditHelp")}</p></div>
 </div>;
}
