"use client";

import Link from "next/link";
import type { UserPermissions } from "../../lib/permissions";
import { financeNavigationLinks, type FinanceSubNavPage } from "./finance-navigation";
import styles from "./finance-sub-nav.module.css";
import { useI18n } from "../../lib/i18n/provider";

export default function FinanceSubNav({
  activePage,
  permissions,
}: {
  activePage: FinanceSubNavPage;
  permissions: UserPermissions;
}) {
  const { locale, t } = useI18n();
  const links = financeNavigationLinks(permissions, locale);

  return (
    <nav className={styles.nav} aria-label={t("finance.nav.label")}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`${styles.link} ${activePage === link.page ? styles.activeLink : ""}`}
          aria-current={activePage === link.page ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
