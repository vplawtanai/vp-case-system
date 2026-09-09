"use client";

import { useI18n } from "../../../lib/i18n/provider";
import Link from "next/link";
import { invoiceWorkspaceNavigationLinks, type InvoiceWorkspacePage } from "./invoice-workspace-navigation";
import styles from "./invoice-workspace-nav.module.css";

export default function InvoiceWorkspaceNav({
  activePage,
  quiet = false,
  showAdditionalCharges = true,
}: {
  activePage?: InvoiceWorkspacePage;
  quiet?: boolean;
  showAdditionalCharges?: boolean;
}) {
  const { locale, t } = useI18n();
  const links = invoiceWorkspaceNavigationLinks(showAdditionalCharges, locale);

  return (
    <nav className={`${styles.nav} ${quiet ? styles.quietNav : ""}`} aria-label={t("finance.invoice.ui.navigation")}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`${styles.tab} ${activePage === link.page ? styles.activeTab : ""}`}
          aria-current={activePage === link.page ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
