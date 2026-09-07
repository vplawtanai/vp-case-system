"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { buildPermissions, type UserPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import FinanceSubNav from "../FinanceSubNav";
import styles from "./tax-invoices.module.css";

export function useTaxAccess() {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true); setPermissions(null); setError("");
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error("auth");
      const result = await supabase.from("user_profiles").select("*").eq("id", auth.data.user.id).single();
      if (result.error || !result.data?.active) throw new Error("access");
      setPermissions(buildPermissions(result.data));
    } catch { setError("ตรวจสอบสิทธิ์ใบกำกับภาษีไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void reload(); }, 0); return () => clearTimeout(timer); }, [reload]);
  return { permissions, loading, error, reload };
}
export function TaxInvoiceGuard({ children }: { children: (permissions: UserPermissions) => ReactNode }) {
  const access = useTaxAccess();
  return <AuthGuard><AppTopNav title="การเงิน" activePage="finance" /><main className={styles.shell}>
    {access.loading ? <p role="status">กำลังตรวจสอบสิทธิ์...</p> : access.error ? <p role="alert">{access.error} <button onClick={() => void access.reload()}>ลองอีกครั้ง</button></p> : !access.permissions?.canViewFinanceTaxInvoices ? <h1>ไม่มีสิทธิ์เข้าถึงใบกำกับภาษี</h1> : <><FinanceSubNav activePage="tax-invoices" permissions={access.permissions} />{children(access.permissions)}</>}
  </main></AuthGuard>;
}
