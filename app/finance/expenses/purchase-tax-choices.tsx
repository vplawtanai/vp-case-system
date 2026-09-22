"use client";
import { useId } from "react";
import { useI18n } from "../../../lib/i18n/provider";
import { FieldGroup } from "../../components/ui/patterns";
import type { CompanyPurchaseTaxChoices } from "./shared";
import css from "./purchase-request.module.css";

export const emptyPurchaseTax: CompanyPurchaseTaxChoices = { vat_mode: "none", vat_rate: 0, wht_state: "none", wht_rate: 0 };
export function PurchaseTaxChoices({ value, onChange, disabled }: { value: CompanyPurchaseTaxChoices; onChange: (value: CompanyPurchaseTaxChoices) => void; disabled?: boolean }) {
 const { t } = useI18n(), id = useId();
 return <div className={css.taxChoices}>
  <fieldset disabled={disabled}><legend>{t("expenses.vat")}</legend><div className={css.choices}>
   {([['none','companyVatNone'],['inclusive','companyVatInclusive'],['exclusive','companyVatExclusive']] as const).map(([mode,label]) => <label key={mode} data-selected={value.vat_mode === mode}><input type="radio" name={`${id}-vat`} value={mode} checked={value.vat_mode === mode} onChange={() => onChange({ ...value, vat_mode: mode, vat_rate: mode === "none" ? 0 : value.vat_mode === "none" ? 7 : value.vat_rate })} /><span>{t(`expenses.${label}`)}</span></label>)}
  </div>{value.vat_mode !== "none" ? <FieldGroup id={`${id}-vat-rate`} className={css.rate} label={t("expenses.vatRate")}><select data-vat-rate value={value.vat_rate} onChange={e => onChange({ ...value, vat_rate: Number(e.target.value) })}><option value={7}>7%</option><option value={0}>0%</option></select></FieldGroup> : null}</fieldset>
  <fieldset disabled={disabled}><legend>{t("expenses.wht")}</legend><div className={css.choices}>
   {([['none','companyWhtNone'],['withhold','companyWhtWithhold']] as const).map(([state,label]) => <label key={state} data-selected={value.wht_state === state}><input type="radio" name={`${id}-wht`} value={state} checked={value.wht_state === state} onChange={() => onChange({ ...value, wht_state: state, wht_rate: state === "none" ? 0 : value.wht_state === "none" ? 3 : value.wht_rate })} /><span>{t(`expenses.${label}`)}</span></label>)}
  </div>{value.wht_state === "withhold" ? <FieldGroup id={`${id}-wht-rate`} className={css.rate} label={t("expenses.whtRate")}><select data-wht-rate value={value.wht_rate} onChange={e => onChange({ ...value, wht_rate: Number(e.target.value) })}>{[1,3,5].map(n => <option key={n} value={n}>{n}%</option>)}</select></FieldGroup> : null}</fieldset>
 </div>;
}
