import { canOverview } from "./overview/data";
import { isAdmin, type UserPermissions } from "../../lib/permissions";
import { translate } from "../../lib/i18n/catalog";
import type { UiLocale } from "../../lib/i18n/core";
import type { ExpenseAccess } from "./expenses/shared";
export type FinanceNavigationPermissions = UserPermissions & { expenseAccess?: ExpenseAccess | null };

export type FinanceSubNavPage =
  | "overview"
  | "quotations"
  | "fee-agreements"
  | "billable-charges"
  | "invoices"
  | "payments"
  | "revenue-distribution"
  | "company-statement"
  | "statement"
  | "receipts"
  | "combined-documents"
  | "tax-invoices"
  | "cash-transactions"
  | "treasury"
  | "tax-position"
  | "ledger"
  | "claims"
  | "expenses"
  | "expense-claims"
  | "payables"
  | "compensation";

export type FinanceNavigationLink = {
  href: string;
  page: FinanceSubNavPage;
  label: string;
};

export type FinanceNavigationGroup = {
  group: "payment-documents" | "legacy" | "statement";
  label: string;
  children: FinanceNavigationLink[];
};

export type FinanceNavigationItem = FinanceNavigationLink | FinanceNavigationGroup;

export function financeNavigationLinks(permissions: FinanceNavigationPermissions, locale: UiLocale = "th"): FinanceNavigationLink[] {
  const t = (key: string) => translate(locale, key);
  // Temporary development/UAT visibility gate; route access and permissions stay unchanged.
  const showNewFinance = isAdmin(permissions.role);
  const links: (FinanceNavigationLink | null)[] = [
    canOverview(permissions) ? {href: "/finance/overview", page: "overview", label: t("executive.nav")} : null,
    permissions.canViewFinanceQuotations
      ? { href: "/finance/quotations", page: "quotations" as const, label: t("finance.nav.quotations") }
      : null,
    permissions.canViewFinanceQuotations
      ? { href: "/finance/fee-agreements", page: "fee-agreements" as const, label: t("finance.nav.feeAgreements") }
      : null,
    permissions.canViewFinanceBillableCharges
      ? { href: "/finance/billable-charges", page: "billable-charges" as const, label: t("finance.invoice.ui.additionalCharges") }
      : null,
    permissions.canViewFinanceQuotations
      ? { href: "/finance/invoices", page: "invoices" as const, label: t("finance.nav.invoices") }
      : null,
    permissions.canViewFinancePayments || permissions.canManageFinancePayments || permissions.canConfirmFinancePayments || permissions.canReverseFinancePayments || permissions.canReallocateFinancePayments
      ? { href: "/finance/payments", page: "payments" as const, label: t("finance.nav.payments") }
      : null,
    permissions.canViewFinancePayments
      ? { href: "/finance/revenue-distribution", page: "revenue-distribution" as const, label: t("revenueDistribution.title") }
      : null,
    permissions.canViewFinanceReceipts
      ? { href: "/finance/receipts", page: "receipts" as const, label: t("finance.nav.receipts") }
      : null,
    permissions.canViewFinanceReceipts && permissions.canViewFinanceTaxInvoices
      ? { href: "/finance/combined-documents", page: "combined-documents" as const, label: t("finance.nav.combined") }
      : null,
    permissions.canViewFinanceTaxInvoices
      ? { href: "/finance/tax-invoices", page: "tax-invoices" as const, label: t("finance.nav.taxInvoices") }
      : null,
    showNewFinance
      ? { href: "/finance/expenses", page: "expenses" as const, label: t("expenses.title") }
      : null,
    showNewFinance
      ? { href: "/finance/expenses/claims", page: "expense-claims" as const, label: t("expenses.claims") }
      : null,
    showNewFinance
      ? { href: "/finance/payables", page: "payables" as const, label: t("payables.title") }
      : null,
    showNewFinance
      ? { href: "/finance/tax-position", page: "tax-position" as const, label: t("taxPosition.title") }
      : null,
    permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims
      ? { href: "/finance/expense-claims", page: "claims" as const, label: t("payables.legacyClaims") }
      : null,
    permissions.canViewLawyerCompensation
      ? { href: "/finance/compensation", page: "compensation" as const, label: t("finance.nav.compensation") }
      : null,
    permissions.canViewCompanyLedger
      ? { href: "/finance/ledger", page: "ledger" as const, label: t("finance.nav.legacyLedger") }
      : null,
  ];
  return links.filter((link): link is FinanceNavigationLink => Boolean(link));
}

export function financeNavigationItems(permissions: FinanceNavigationPermissions, locale: UiLocale = "th"): FinanceNavigationItem[] {
  const items: FinanceNavigationItem[] = [];
  for (const link of financeNavigationLinks(permissions, locale)) {
    const group = ["receipts", "combined-documents", "tax-invoices"].includes(link.page)
      ? "payment-documents" : ["claims", "ledger", "compensation"].includes(link.page) ? "legacy" : null;
    if (!group) { items.push(link); continue; }
    const existing = items.find((item): item is FinanceNavigationGroup => "group" in item && item.group === group);
    if (existing) existing.children.push(link);
    else items.push({ group, label: translate(locale, group === "legacy" ? "finance.nav.legacy" : "finance.nav.paymentDocuments"), children: [link] });
  }
  if (permissions.canViewFinanceCashTransactions && !items.some(i => "group" in i && i.group === "statement")) items.push({ group: "statement", label: translate(locale,"companyStatement.nav"), children: [] });
  return items;
}

export function activeFinancePage(pathname: string | null, fallback: FinanceSubNavPage): FinanceSubNavPage {
  const routes: [string, FinanceSubNavPage][] = [
    ["overview", "overview"],
    ["statement", "statement"],
    ["payouts", "payables"], ["revenue-distribution", "revenue-distribution"],
    ["quotations", "quotations"], ["fee-agreements", "fee-agreements"], ["billing-plans", "fee-agreements"],
    ["billable-charges", "billable-charges"], ["invoices", "invoices"], ["payments", "payments"], ["direct-money", "payments"],
    ["receipts", "receipts"], ["combined-documents", "combined-documents"], ["tax-invoices", "tax-invoices"],
    ["tax-position", "tax-position"],
    ["expenses/claims", "expense-claims"], ["expenses", "expenses"],
    ["expense-claims", "claims"], ["payables", "payables"], ["compensation", "compensation"], ["ledger", "ledger"], ["cash-transactions", "cash-transactions"], ["treasury", "treasury"],
  ];
  return routes.find(([route]) => pathname === `/finance/${route}` || pathname?.startsWith(`/finance/${route}/`))?.[1] || fallback;
}
