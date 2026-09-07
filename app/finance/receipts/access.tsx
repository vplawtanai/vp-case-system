"use client";

import type { ReactNode } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import type { UserPermissions } from "../../../lib/permissions";
import { useReceiptAccess } from "./use-receipt-access";
import FinanceSubNav from "../FinanceSubNav";
import styles from "./receipts.module.css";

export function ReceiptGuard({ children }: { children: (permissions: UserPermissions) => ReactNode }) {
  const access = useReceiptAccess();
  return <AuthGuard>
    <AppTopNav title="การเงิน" activePage="finance" />
    <main className={styles.shell}>
      {access.loading ? <p role="status">กำลังตรวจสอบสิทธิ์...</p> : access.error ? <div role="alert" className={styles.error}>{access.error} <button type="button" onClick={() => void access.reload()}>ลองอีกครั้ง</button></div> : !access.permissions?.canViewFinanceReceipts ? <h1>ไม่มีสิทธิ์เข้าถึงใบเสร็จรับเงิน</h1> : <>
        <FinanceSubNav activePage="receipts" permissions={access.permissions} />
        {children(access.permissions)}
      </>}
    </main>
  </AuthGuard>;
}
