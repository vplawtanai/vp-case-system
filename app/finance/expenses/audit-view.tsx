"use client";
import { useI18n } from "../../../lib/i18n/provider";
import type { Expense } from "./shared";
import css from "./expenses.module.css";

export function ExpenseTechnical({ isAdmin, evidence }: { isAdmin: boolean; evidence: unknown }) {
 const { t } = useI18n();
 return isAdmin ? <details className={css.disclosure} data-expense-technical><summary>{t("expenses.adminTechnical")}</summary><pre className={css.raw}>{JSON.stringify(evidence, null, 2)}</pre></details> : null;
}

export function ExpenseActivity({ row, isAdmin }: { row: Expense; isAdmin: boolean }) {
 const { t, date } = useI18n();
 return <><section className={css.section}><h2>{t("expenses.audit")}</h2>{row.audit.length ? <ul className={css.audit}>{row.audit.map(a => <li key={a.id}><div>{t(`expenses.${a.event_type === "saved" ? "savedEvent" : a.event_type}`)}<small>{a.actor_name}</small></div><time>{date(a.created_at, true)}</time></li>)}</ul> : <p className={css.muted}>{t("expenses.noHistory")}</p>}</section><ExpenseTechnical isAdmin={isAdmin} evidence={row.audit} /></>;
}
