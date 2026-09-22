"use client";
import { useI18n } from "../../../lib/i18n/provider";
import type { Expense } from "./shared";
import { companyItemPaymentStatus } from "./company-payment-status";
import { expenseStatusTone } from "./presentation";
import css from "./expenses.module.css";

export function CompanyItemPayment({ item }: { item: Expense }) {
 const { t, locale } = useI18n(), status = companyItemPaymentStatus(item);
 if (!status) return null;
 const money = (amount: number) => `${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${locale === "th" ? "บาท" : "THB"}`;
 return <div data-item-payment={status}>
  <span className={css.badge} data-tone={expenseStatusTone(status)}>{t(`expenses.${status}`)}</span>
  {status === "paid" && item.payout?.status === "confirmed" ? <div data-paid-facts><p>{t("expenses.actualCashOut")}: {money(item.payout.net)}</p><p>WHT: {money(item.payout.wht)}</p></div> : null}
 </div>;
}
