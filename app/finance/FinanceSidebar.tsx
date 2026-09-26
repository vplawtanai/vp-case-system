"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useI18n } from "../../lib/i18n/provider";
import { activeFinancePage, financeNavigationItems, type FinanceNavigationLink, type FinanceNavigationPermissions } from "./finance-navigation";
import css from "./finance-sidebar.module.css";
import { StatementAccountNavigation } from "./statement/navigation";
import { FinanceIcon } from "./ui/icons";
export function FinanceSidebar({ permissions, pathname, onNavigate }: { permissions: FinanceNavigationPermissions; pathname: string; onNavigate: () => void }) {
 const { locale, t } = useI18n(), active = activeFinancePage(pathname, "quotations");
 const [preference, setPreference] = useState<{ path: string; open: boolean } | null>(null);
 const activeDocument = ["receipts", "combined-documents", "tax-invoices"].includes(active);
 const documentsOpen = preference?.path === pathname ? preference.open : activeDocument;
 const [servicePreference, setServicePreference] = useState<{ path: string; open: boolean } | null>(null);
 const activeService = ["fee-agreements", "billable-charges"].includes(active);
 const serviceOpen = servicePreference?.path === pathname ? servicePreference.open : activeService;
 const link = (l: FinanceNavigationLink) => <Link key={l.href} href={l.href} onClick={onNavigate} aria-current={active === l.page ? "page" : undefined}>{l.label}</Link>;
 const serviceLink = (l: FinanceNavigationLink) => <Link key={l.href} href={l.href} onClick={onNavigate} aria-current={active === l.page ? "page" : undefined} className={css.serviceLink} data-service-path={l.page === "fee-agreements" ? "quotation" : "additional"}>
  <FinanceIcon name={l.page === "fee-agreements" ? "agreement" : "charge"} size={17} />
  <span><span className={css.serviceLabel}>{l.label}</span><small>{t(l.page === "fee-agreements" ? "finance.nav.fromQuotation" : "finance.nav.withoutQuotation")}</small></span>
 </Link>;
 const items = financeNavigationItems(permissions, locale);
 const sections = [
  { key: "incomeGroup", pages: ["quotations", "service-fees", "invoices", "payments", "revenue-distribution", "payment-documents"] },
  { key: "expenseGroup", pages: ["expenses", "expense-claims", "payables"] },
  { key: "moneyGroup", pages: ["statement", "cash-transactions"] },
  { key: "taxGroup", pages: ["tax-position"] },
  { key: "legacy", pages: ["legacy"] },
 ];
 return <div className={css.nav} aria-label={t("finance.nav.label")}>
  {items.filter((item): item is FinanceNavigationLink => "page" in item && item.page === "overview").map(link)}
  {sections.map(section => { const visible = items.filter(item => section.pages.includes("group" in item ? item.group : item.page)); return visible.length ? <section key={section.key} data-finance-section={section.key} className={section.key === "legacy" ? css.legacy : undefined}><h3>{t(section.key === "statement" ? "companyStatement.nav" : section.key === "legacy" ? "payout.legacySection" : `expenses.${section.key}`)}</h3>{visible.map(item => "group" in item ? item.group === "service-fees" ? <div key={item.group}>
   <button className={css.accordion} type="button" aria-expanded={serviceOpen} aria-controls="finance-service-fees" onClick={() => setServicePreference({ path: pathname, open: !serviceOpen })}><span>{item.label}</span>{serviceOpen ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}</button>
   <div className={css.children} id="finance-service-fees" hidden={!serviceOpen}>{item.children.map(serviceLink)}</div>
  </div> : item.group === "payment-documents" ? <div key={item.group}>
   <button className={css.accordion} type="button" aria-expanded={documentsOpen} aria-controls="finance-receiving-documents" onClick={() => setPreference({ path: pathname, open: !documentsOpen })}><span>{item.label}</span>{documentsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
   <div className={css.children} id="finance-receiving-documents" hidden={!documentsOpen}>{item.children.map(link)}</div>
  </div> : item.group === "statement" ? <div key="statement"><Link href="/finance/statement" onClick={onNavigate}>{item.label}</Link><div className={css.children}>{item.children.map(link)}<StatementAccountNavigation enabled={permissions.canViewFinanceCashTransactions} pathname={pathname} onNavigate={onNavigate}/></div></div> : item.children.map(link) : link(item))}</section> : null; })}
 </div>;
}
