"use client";
import { ReadOnlyGrid } from "../../../components/ui/patterns";
import { useI18n } from "../../../../lib/i18n/provider";
import { filingCoverage, filingTechnicalEvidence, type Filing, type FilingPool } from "./shared";
import { FinanceEvidence } from "../../FinanceEvidence";

export function FilingTechnicalEvidence({ pool, filing, isAdmin = false }: { pool: FilingPool; filing?: Filing; isAdmin?: boolean }) {
 const { t, locale } = useI18n(), tr = (key: string) => t(`taxFiling.${key}`);
 const evidence = filing?.source_snapshot_json || pool, coverage = filingCoverage(evidence);
 const money = (value: number | null) => value === null ? tr("unknown") : `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const raw = filing ? { ...filing, source_snapshot_json: filingTechnicalEvidence(evidence) } : filingTechnicalEvidence(evidence);
 return <FinanceEvidence title={tr("technical")} raw={raw} isAdmin={isAdmin}>
  <h3>{tr(filing ? "frozenMonthlyFacts" : "monthlyFacts")}</h3>
  {evidence.schema_version === 2 ? <ReadOnlyGrid items={[
   { key: "output", label: tr("output"), value: money(evidence.monthly_facts.output_vat) },
   { key: "input", label: tr("input"), value: tr("incomplete") },
   { key: "net", label: tr("net"), value: money(evidence.monthly_facts.net_vat) },
  ]} /> : <p>{tr("legacyAllocationOnly")}</p>}
  <h3>{tr("allocationCoverage")}</h3>
  <ReadOnlyGrid items={[
   { key: "count", label: tr("draftCoverage"), value: t("taxFiling.sourceCount", { count: coverage.source_count }) },
   { key: "base", label: tr("allocatedBase"), value: money(coverage.base_amount) },
   { key: "output", label: tr("allocatedOutput"), value: money(coverage.output_vat) },
  ]} />
 </FinanceEvidence>;
}
