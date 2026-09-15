"use client";

import Link from "next/link";
import { Disclosure } from "../../components/ui/patterns";
import { useI18n } from "../../../lib/i18n/provider";
import { vatTreatmentLabel, type VatTreatment } from "../document-decision/shared";
import { directVatTreatments } from "./form-presentation";
import { economicClasses } from "./shared";
import { readDerivedDirectEvidence } from "./source-evidence";
import styles from "./direct-money.module.css";

export type DirectEvidenceClient = { id: string; name: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DirectSourceEvidence({ reason, client }: { reason: string; client?: DirectEvidenceClient | null }) {
  const { t, locale } = useI18n(), evidence = readDerivedDirectEvidence(reason);
  if (!evidence) return <div className={styles.provenance}>
    <p className={styles.muted}>{t("directMoney.humanSource")}</p><p className={styles.readonly}>{reason}</p>
  </div>;

  const classification = typeof evidence.classification === "string" && economicClasses.some(c => c === evidence.classification) ? evidence.classification : null;
  const treatment = typeof evidence.vat_treatment === "string" && directVatTreatments.includes(evidence.vat_treatment as VatTreatment) ? evidence.vat_treatment as VatTreatment : null;
  const percent = (rate: unknown) => typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 100 ? `${rate.toLocaleString(locale, { maximumFractionDigits: 4 })}%` : t("directMoney.evidenceNotRecorded");
  const caseId = typeof evidence.case_id === "number" && Number.isSafeInteger(evidence.case_id) && evidence.case_id > 0 ? evidence.case_id : null;
  const advisoryId = typeof evidence.advisory_matter_id === "string" && uuid.test(evidence.advisory_matter_id) ? evidence.advisory_matter_id : null;
  return <div className={styles.provenance}>
    <p className={styles.provenanceHeading}>{t("directMoney.sourceEvidence")}</p>
    <p className={styles.muted}>{t("directMoney.systemSource")}</p>
    <dl className={styles.facts}>
      {evidence.client_id ? <div><dt>{t("directMoney.evidenceClient")}</dt><dd>{client?.id === evidence.client_id && client.name.trim() ? client.name : t("directMoney.evidenceClientUnavailable")}</dd></div> : null}
      <div><dt>{t("directMoney.classification")}</dt><dd>{classification ? t(`finance.invoice.classification.${classification}`) : t("directMoney.evidenceNotRecorded")}</dd></div>
      <div><dt>VAT</dt><dd>{treatment === "standard_rate" || treatment === "zero_rated" ? percent(evidence.vat_rate) : treatment ? vatTreatmentLabel(treatment, locale) : t("directMoney.evidenceNotRecorded")}</dd></div>
      <div><dt>WHT</dt><dd>{evidence.wht_applicability === "applies" ? percent(evidence.wht_rate) : evidence.wht_applicability === "does_not_apply" ? t("directMoney.noWht") : t("directMoney.evidenceNotRecorded")}</dd></div>
      {caseId || advisoryId ? <div><dt>{t("directMoney.evidenceMatter")}</dt><dd>
        {caseId ? <Link href={`/cases/${caseId}`}>{t("directMoney.evidenceCase")}</Link> : <Link href={`/advisory/${advisoryId}`}>{t("directMoney.evidenceAdvisory")}</Link>}
      </dd></div> : null}
    </dl>
    <Disclosure title={t("directMoney.technicalEvidence")}><pre className={styles.technicalEvidence}>{reason}</pre></Disclosure>
  </div>;
}
