"use client";
import Link from "next/link";
import { QuotationGuard } from "../quotations/shared";
import { useI18n } from "../../../lib/i18n/provider";
import { Callout, PageShell } from "../../components/ui/patterns";
import { accountHref, accountName, useStatementAccounts } from "./shared";
import css from "./statement.module.css";
export default function StatementIndex() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinancePayments || a.permissions.canViewFinanceCashTransactions}>{a => <StatementAccounts canCompany={a.permissions.canViewFinancePayments} canCash={a.permissions.canViewFinanceCashTransactions}/>}</QuotationGuard>;
}
export function StatementAccounts({ canCompany, canCash }: { canCompany: boolean; canCash: boolean }) {
 const { t, locale } = useI18n(), { data, failed } = useStatementAccounts(canCash);
 return <PageShell className={css.page}><header className={css.header}><h1>Statement</h1>{data?.can_transfer ? <Link href="/finance/statement/transfers">{t("statement.transfer")}</Link> : null}</header>
  {failed ? <Callout tone="negative">{t("statement.failure")}</Callout> : null}
  <div className={css.accountList}>{canCompany ? <Link href="/finance/statement/company"><strong>{t("companyStatement.company")}</strong><small>{t("statement.companyDescription")}</small></Link> : null}{data?.accounts.map(a => <Link key={`${a.kind}:${a.account_id}`} href={accountHref(a)}><strong>{accountName(a, locale)}</strong><small>{[a.bank_name, a.account_number, !a.is_active ? t("statement.inactive") : ""].filter(Boolean).join(" · ")}</small></Link>)}</div>
  {data?.can_manage_openings ? <details><summary>{t("statement.tools")}</summary><p><Link href="/finance/treasury">{t("statement.tools")}</Link></p></details> : null}
 </PageShell>;
}
