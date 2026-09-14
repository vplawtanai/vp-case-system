"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuotationGuard } from "../../quotations/shared";
import FinanceSubNav from "../../FinanceSubNav";
import { useI18n } from "../../../../lib/i18n/provider";
import { DirectMoneyForm } from "../form";
import styles from "../direct-money.module.css";

export default function NewDirectMoneyPage() {
  const { t } = useI18n();
  return <QuotationGuard canAccess={access => access.profile?.role === "admin"}>{access => <><FinanceSubNav activePage="payments" permissions={access.permissions} />
    <main className={styles.workspace}><Link className={styles.button} href="/finance/payments"><ArrowLeft size={16} />{t("finance.nav.payments")}</Link>
      <header className={styles.header}><div><h1>{t("directMoney.create")}</h1><p className={styles.muted}>{t("directMoney.source")}</p></div></header>
      <DirectMoneyForm />
    </main></>}</QuotationGuard>;
}
