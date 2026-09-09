import type { UserPermissions } from "../../lib/permissions";
import { translate } from "../../lib/i18n/catalog";
import type { UiLocale } from "../../lib/i18n/core";

export type FinanceSubNavPage =
  | "quotations"
  | "fee-agreements"
  | "invoices"
  | "receipts"
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

export function financeNavigationLinks(permissions: UserPermissions, locale: UiLocale = "th"): FinanceNavigationLink[] {
  const t = (key: string) => translate(locale, key);
  return [
    permissions.canViewFinanceQuotations
      ? { href: "/finance/quotations", page: "quotations" as const, label: t("finance.nav.quotations") }
      : null,
    permissions.canViewFinanceQuotations
      ? { href: "/finance/fee-agreements", page: "fee-agreements" as const, label: t("finance.nav.feeAgreements") }
      : null,
    permissions.canViewFinanceQuotations
      ? { href: "/finance/invoices", page: "invoices" as const, label: t("finance.nav.invoices") }
      : null,
    permissions.canViewFinanceReceipts
      ? { href: "/finance/receipts", page: "receipts" as const, label: t("finance.nav.receipts") }
      : null,
    permissions.canViewFinanceTaxInvoices
      ? { href: "/finance/tax-invoices", page: "tax-invoices" as const, label: t("finance.nav.taxInvoices") }
      : null,
    permissions.canViewFinanceCashTransactions
      ? { href: "/finance/cash-transactions", page: "cash-transactions" as const, label: t("finance.nav.payments") }
      : null,
    permissions.canViewCompanyLedger
      ? { href: "/finance/ledger", page: "ledger" as const, label: t("finance.nav.legacyLedger") }
      : null,
    permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims
      ? { href: "/finance/expense-claims", page: "claims" as const, label: t("finance.nav.expenseClaims") }
      : null,
    permissions.canViewLawyerCompensation
      ? { href: "/finance/compensation", page: "compensation" as const, label: t("finance.nav.compensation") }
      : null,
  ].filter((link): link is FinanceNavigationLink => Boolean(link));
}
