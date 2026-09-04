import Link from "next/link";
import { invoiceWorkspaceNavigationLinks, type InvoiceWorkspacePage } from "./invoice-workspace-navigation";
import styles from "./invoice-workspace-nav.module.css";

export default function InvoiceWorkspaceNav({
  activePage,
  showAdditionalCharges = true,
}: {
  activePage: InvoiceWorkspacePage;
  showAdditionalCharges?: boolean;
}) {
  const links = invoiceWorkspaceNavigationLinks(showAdditionalCharges);

  return (
    <nav className={styles.nav} aria-label="เมนูย่อยใบแจ้งหนี้">
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
