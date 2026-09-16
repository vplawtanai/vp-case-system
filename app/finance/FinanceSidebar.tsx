"use client";
import Link from "next/link";
import type { UserPermissions } from "../../lib/permissions";
import { useI18n } from "../../lib/i18n/provider";
import { activeFinancePage, financeNavigationItems, type FinanceNavigationLink } from "./finance-navigation";
import css from "./finance-sidebar.module.css";
export function FinanceSidebar({ permissions, pathname, onNavigate }: { permissions: UserPermissions; pathname: string; onNavigate: () => void }) {
 const { locale, t } = useI18n(), active = activeFinancePage(pathname, "quotations");
 const link = (l: FinanceNavigationLink) => <Link key={l.href} href={l.href} onClick={onNavigate} aria-current={active === l.page ? "page" : undefined}>{l.label}</Link>;
 return <div className={css.nav} aria-label={t("finance.nav.label")}>
  {financeNavigationItems(permissions, locale).map(item => "group" in item ? <section key={item.group} className={item.group === "legacy" ? css.legacy : undefined}><h3>{item.group === "legacy" ? t("payout.legacySection") : item.label}</h3>{item.children.map(link)}</section> : link(item))}
 </div>;
}
