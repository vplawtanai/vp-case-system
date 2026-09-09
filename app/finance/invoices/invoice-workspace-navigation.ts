import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";

export type InvoiceWorkspacePage = "invoices" | "billable-charges";

export type InvoiceWorkspaceNavigationLink = {
  href: string;
  page: InvoiceWorkspacePage;
  label: string;
};

const invoiceWorkspaceLinks: InvoiceWorkspaceNavigationLink[] = [
  { href: "/finance/invoices", page: "invoices", label: translate("th", "finance.invoice.ui.listNavigation") },
  { href: "/finance/billable-charges", page: "billable-charges", label: translate("th", "finance.invoice.ui.additionalCharges") },
];

export function invoiceWorkspaceNavigationLinks(showAdditionalCharges = true, locale: UiLocale = "th"): InvoiceWorkspaceNavigationLink[] {
  return (showAdditionalCharges ? invoiceWorkspaceLinks : invoiceWorkspaceLinks.slice(0, 1)).map(link => ({
    ...link,
    label: translate(locale, link.page === "invoices" ? "finance.invoice.ui.listNavigation" : "finance.invoice.ui.additionalCharges"),
  }));
}
