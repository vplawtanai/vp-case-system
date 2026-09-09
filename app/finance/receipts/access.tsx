"use client";
import { useI18n } from "../../../lib/i18n/provider";

import type { ReactNode } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import type { UserPermissions } from "../../../lib/permissions";
import { useReceiptAccess } from "./use-receipt-access";
import FinanceSubNav from "../FinanceSubNav";
import styles from "./receipts.module.css";

export function ReceiptGuard({ children }: { children: (permissions: UserPermissions) => ReactNode }) {
  const { t } = useI18n();
  const access = useReceiptAccess();
  return <AuthGuard>
    <AppTopNav title={t("common.nav.finance")} activePage="finance" />
    <main className={styles.shell}>
      {access.loading ? <p role="status">{t("finance.taxInvoice.ui.checkingAccess")}</p> : access.error ? <div role="alert" className={styles.error}>{access.error} <button type="button" onClick={() => void access.reload()}>{t("common.actions.retry")}</button></div> : !access.permissions?.canViewFinanceReceipts ? <h1>{t("finance.receipt.noAccess")}</h1> : <>
        <FinanceSubNav activePage="receipts" permissions={access.permissions} />
        {children(access.permissions)}
      </>}
    </main>
  </AuthGuard>;
}
