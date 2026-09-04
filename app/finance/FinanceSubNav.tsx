"use client";

import Link from "next/link";
import type { UserPermissions } from "../../lib/permissions";
import { financeNavigationLinks, type FinanceSubNavPage } from "./finance-navigation";
import styles from "./finance-sub-nav.module.css";

export default function FinanceSubNav({
  activePage,
  permissions,
}: {
  activePage: FinanceSubNavPage;
  permissions: UserPermissions;
}) {
  const links = financeNavigationLinks(permissions);

  return (
    <nav className={styles.nav} aria-label="เมนูหลักการเงิน">
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
