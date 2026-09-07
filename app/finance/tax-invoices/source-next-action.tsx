"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTaxAccess } from "./access";
import { taxError, type TaxEligibility } from "./shared";
import styles from "./tax-invoices.module.css";

export function TaxInvoiceNextAction({ paymentId }: { paymentId: string }) {
  const { permissions } = useTaxAccess(), router = useRouter();
  const [eligibility, setEligibility] = useState<TaxEligibility | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), lock = useRef(false);
  useEffect(() => {
    let active = true;
    if (permissions?.canViewFinanceTaxInvoices) void supabase.rpc("get_finance_tax_invoice_eligibility", { p_payment_id: paymentId }).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(taxError(error)); else setEligibility(data as TaxEligibility);
    });
    return () => { active = false; };
  }, [paymentId, permissions?.canViewFinanceTaxInvoices]);
  async function create() {
    if (lock.current || !eligibility?.can_prepare || !permissions?.canManageFinanceTaxInvoices) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await supabase.rpc("create_finance_tax_invoice_draft", { p_payment_id: paymentId });
      if (result.error || typeof result.data !== "string") throw result.error || new Error("response");
      router.push(`/finance/tax-invoices/${result.data}`);
    } catch (cause) { setError(taxError(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!permissions?.canViewFinanceTaxInvoices) return null;
  return <section className={styles.nextAction}><h2>ใบกำกับภาษี</h2>
    {error ? <p className={styles.error} role="alert">{error}</p> : !eligibility ? <p role="status">กำลังตรวจสอบสิทธิ์ต้นทาง...</p> : null}
    {eligibility?.existing_id ? <Link className={styles.button} href={`/finance/tax-invoices/${eligibility.existing_id}`}>{eligibility.existing_number || "เปิดร่างใบกำกับภาษี"}</Link> : <>
      {eligibility?.blockers.length ? <div className={styles.notice}><strong>ต้องตรวจสอบก่อนออกใบกำกับภาษี</strong><ul>{eligibility.blockers.map(code => <li key={code}>{taxError(code)}</li>)}</ul></div> : null}
      {eligibility?.can_prepare && permissions?.canManageFinanceTaxInvoices ? <button className={styles.button} disabled={busy} onClick={() => void create()}>{busy ? "กำลังจัดทำร่าง..." : "จัดทำใบกำกับภาษี"}</button> : null}
    </>}
  </section>;
}
