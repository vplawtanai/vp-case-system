"use client";

import { useI18n } from "../../../lib/i18n/provider";
import { money } from "../invoices/shared";
import type { InvoiceTaxFacts } from "./tax";
import { evaluateWhtLines, lineWhtRates, type WhtLineChoice } from "./wht-line-review";
import styles from "./wht-line-review.module.css";

export function WhtLineReview({ facts, choices, onChange, disabled = false, readOnly = false, showErrors = false }: {
  facts: InvoiceTaxFacts; choices: WhtLineChoice[]; onChange?: (choice: WhtLineChoice) => void;
  disabled?: boolean; readOnly?: boolean; showErrors?: boolean;
}) {
  const { t, text } = useI18n();
  const review = evaluateWhtLines(facts, choices);
  return <div className={styles.review}>
    <h3 className={styles.heading}>{t("finance.payment.wht.lines.title")}</h3>
    {!readOnly && !review.totals ? <p className={styles.pending}>{t("finance.payment.wht.lines.resolveAll")}</p> : null}
    {facts.lines.map((line, index) => {
      const choice = choices.find(value => value.invoiceItemId === line.id) || { invoiceItemId: line.id, applicability: "unknown" as const, rate: "", customRate: false };
      const error = showErrors ? review.issues.find(issue => issue.invoiceItemId === line.id) : null;
      const name = line.description?.trim() || t("finance.payment.wht.lines.lineNumber", { number: index + 1 });
      const errorId = `wht-line-error-${readOnly ? "review-" : ""}${line.id}`;
      return <div key={line.id} className={`${styles.line} ${error ? styles.invalid : ""}`} data-wht-line={line.id}>
        <div className={styles.identity}><strong>{name}</strong><span>{t("finance.payment.wht.lines.base")} <b>{money(line.beforeVat, facts.currency)}</b></span></div>
        {readOnly ? <div className={styles.readOnly}>
          <span>{t(`finance.payment.wht.lines.${choice.applicability}`)}</span>
          {choice.applicability === "applies" ? <span>{t("finance.payment.ui.whtRate")} {choice.rate || t("finance.payment.ui.rateNotSelected")}{choice.rate ? "%" : ""}</span> : null}
        </div> : <fieldset className={styles.controls} disabled={disabled} aria-describedby={error ? errorId : undefined}>
          <legend className={styles.legend}>{t("finance.payment.wht.lines.applicability")}</legend>
          <div className={styles.choices}>
            {(["applies", "does_not_apply"] as const).map(value => <label key={value} className={`${styles.choice} ${choice.applicability === value ? styles.selected : ""}`}>
              <input type="radio" name={`wht-${line.id}`} checked={choice.applicability === value} aria-label={`${name}: ${t(`finance.payment.wht.lines.${value}`)}`} onChange={() => onChange?.({ ...choice, applicability: value })} />
              {t(`finance.payment.wht.lines.${value}`)}
            </label>)}
          </div>
          {choice.applicability === "unknown" ? <span className={styles.pending}>{t("finance.payment.wht.lines.unknown")}</span> : null}
          {choice.applicability === "applies" ? <label className={styles.rate}>
            <span>{t("finance.payment.ui.whtRate")}</span>
            <select value={choice.customRate ? "custom" : choice.rate} aria-invalid={Boolean(error)} aria-label={`${name}: ${t("finance.payment.ui.whtRate")}`} onChange={event => onChange?.({ ...choice, rate: event.target.value === "custom" ? "" : event.target.value, customRate: event.target.value === "custom" })}>
              <option value="">{t("finance.payment.ui.chooseRate")}</option>
              {lineWhtRates.map(rate => <option key={rate} value={rate}>{rate}%</option>)}
              <option value="custom">{t("finance.payment.ui.otherRate")}</option>
            </select>
            {choice.customRate ? <input type="number" inputMode="decimal" min="0" max="100" step="0.0001" value={choice.rate} aria-invalid={Boolean(error)} aria-label={`${name}: ${t("finance.payment.ui.customRate")}`} onChange={event => onChange?.({ ...choice, rate: event.target.value })} /> : null}
          </label> : null}
        </fieldset>}
        <div className={styles.amount}><span>{t("finance.payment.ui.calculatedWht")}</span><strong>{review.amounts[line.id] !== undefined ? money(review.amounts[line.id], facts.currency) : t("finance.payment.wht.lines.pending")}</strong></div>
        {error ? <p id={errorId} className={styles.error} role="alert">{text(error.message)}</p> : null}
      </div>;
    })}
  </div>;
}
