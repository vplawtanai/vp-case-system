"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useI18n } from "../../lib/i18n/provider";
import { activeFinancePage, financeNavigationItems, type FinanceNavigationLink, type FinanceNavigationPermissions } from "./finance-navigation";
import css from "./finance-sidebar.module.css";
export function FinanceSidebar({ permissions, pathname, onNavigate }: { permissions: FinanceNavigationPermissions; pathname: string; onNavigate: () => void }) {
 const { locale, t } = useI18n(), active = activeFinancePage(pathname, "quotations");
 const [preference, setPreference] = useState<{ path: string; open: boolean } | null>(null);
 const activeDocument = ["receipts", "combined-documents", "tax-invoices"].includes(active);
 const documentsOpen = preference?.path === pathname ? preference.open : activeDocument;
 const link = (l: FinanceNavigationLink) => <Link key={l.href} href={l.href} onClick={onNavigate} aria-current={active === l.page ? "page" : undefined}>{l.label}</Link>;
 const items = financeNavigationItems(permissions, locale);
 const sections = [
  { key: "incomeGroup", pages: ["quotations", "fee-agreements", "billable-charges", "invoices", "payments", "payment-documents"] },
  { key: "expenseGroup", pages: ["expenses", "expense-claims", "payables"] },
  { key: "moneyGroup", pages: ["treasury", "cash-transactions"] },
  { key: "taxGroup", pages: ["tax-position"] },
  { key: "legacy", pages: ["legacy"] },
 ];
 return <div className={css.nav} aria-label={t("finance.nav.label")}>
  {sections.map(section => { const visible = items.filter(item => section.pages.includes("group" in item ? item.group : item.page)); return visible.length ? <section key={section.key} data-finance-section={section.key} className={section.key === "legacy" ? css.legacy : undefined}><h3>{t(section.key === "legacy" ? "payout.legacySection" : `expenses.${section.key}`)}</h3>{visible.map(item => "group" in item ? item.group === "payment-documents" ? <div key={item.group}>
   <button className={css.accordion} type="button" aria-expanded={documentsOpen} aria-controls="finance-receiving-documents" onClick={() => setPreference({ path: pathname, open: !documentsOpen })}><span>{item.label}</span>{documentsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
   <div className={css.children} id="finance-receiving-documents" hidden={!documentsOpen}>{item.children.map(link)}</div>
  </div> : item.children.map(link) : link(item))}</section> : null; })}
 </div>;
}
