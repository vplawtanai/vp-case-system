import Link from "next/link";
import styles from "./invoice-workspace-nav.module.css";

export default function InvoiceWorkspaceNav({
  activePage,
  showAdditionalCharges = true,
}: {
  activePage: "invoices" | "billable-charges";
  showAdditionalCharges?: boolean;
}) {
  return (
    <nav className={styles.nav} aria-label="พื้นที่ทำงานใบแจ้งหนี้">
      <Link
        href="/finance/invoices"
        className={`${styles.tab} ${activePage === "invoices" ? styles.activeTab : ""}`}
        aria-current={activePage === "invoices" ? "page" : undefined}
      >
        ใบแจ้งหนี้
      </Link>
      {showAdditionalCharges ? (
        <Link
          href="/finance/billable-charges"
          className={`${styles.tab} ${activePage === "billable-charges" ? styles.activeTab : ""}`}
          aria-current={activePage === "billable-charges" ? "page" : undefined}
        >
          รายการเรียกเก็บเพิ่มเติม
        </Link>
      ) : null}
    </nav>
  );
}
