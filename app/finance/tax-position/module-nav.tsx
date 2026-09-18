"use client";
import Link from "next/link";
import { useI18n } from "../../../lib/i18n/provider";
import styles from "./filings/filings.module.css";
export default function TaxModuleNav({ active }: { active: "overview" | "filings" }) {
 const { t } = useI18n();
 return <nav className={styles.tabs} aria-label={t("taxFiling.module")}>
  <Link href="/finance/tax-position" aria-current={active === "overview" ? "page" : undefined}>{t("taxFiling.overview")}</Link>
  <Link href="/finance/tax-position/filings" aria-current={active === "filings" ? "page" : undefined}>{t("taxFiling.title")}</Link>
 </nav>;
}
