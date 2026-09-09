import type { UserPermissions } from "../../lib/permissions";
import { translate } from "../../lib/i18n/catalog";
import type { UiLocale } from "../../lib/i18n/core";

export type FinanceSubNavPage =
  | "quotations"
  | "fee-agreements"
  | "billable-charges"
  | "invoices"
  | "payments"
  | "receipts"
  | "combined-documents"
  | "tax-invoices"
  | "cash-transactions"
  | "ledger"
  | "claims"
  | "compensation";

export type FinanceNavigationLink = {
  href: string;
  page: FinanceSubNavPage;
  label: string;
};

export type FinanceNavigationGroup = {
  group: "payment-documents" | "legacy";
  label: string;
  children: FinanceNavigationLink[];
};

export type FinanceNavigationItem = FinanceNavigationLink | FinanceNavigationGroup;

export function financeNavigationLinks(permissions: UserPermissions, locale: UiLocale = "th"): FinanceNavigationLink[] {
  const t = (key: string) => translate(locale, key);
  const links: (FinanceNavigationLink | null)[] = [
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
    permissions.canManageFinancePayments || permissions.canConfirmFinancePayments || permissions.canReverseFinancePayments || permissions.canReallocateFinancePayments
      ? { href: "/finance/payments", page: "payments" as const, label: t("finance.nav.payments") }
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
    permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims
      ? { href: "/finance/expense-claims", page: "claims" as const, label: t("finance.nav.expenseClaims") }
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

export function financeNavigationItems(permissions: UserPermissions, locale: UiLocale = "th"): FinanceNavigationItem[] {
  const items: FinanceNavigationItem[] = [];
  for (const link of financeNavigationLinks(permissions, locale)) {
    const group = ["receipts", "combined-documents", "tax-invoices"].includes(link.page)
      ? "payment-documents" : link.page === "ledger" ? "legacy" : null;
    if (!group) { items.push(link); continue; }
    const existing = items.find((item): item is FinanceNavigationGroup => "group" in item && item.group === group);
    if (existing) existing.children.push(link);
    else items.push({ group, label: translate(locale, group === "legacy" ? "finance.nav.legacy" : "finance.nav.paymentDocuments"), children: [link] });
  }
  return items;
}

export function activeFinancePage(pathname: string | null, fallback: FinanceSubNavPage): FinanceSubNavPage {
  const routes: [string, FinanceSubNavPage][] = [
    ["quotations", "quotations"], ["fee-agreements", "fee-agreements"], ["billing-plans", "fee-agreements"],
    ["billable-charges", "billable-charges"], ["invoices", "invoices"], ["payments", "payments"],
    ["receipts", "receipts"], ["combined-documents", "combined-documents"], ["tax-invoices", "tax-invoices"],
    ["expense-claims", "claims"], ["compensation", "compensation"], ["ledger", "ledger"], ["cash-transactions", "cash-transactions"],
  ];
  return routes.find(([route]) => pathname === `/finance/${route}` || pathname?.startsWith(`/finance/${route}/`))?.[1] || fallback;
}
