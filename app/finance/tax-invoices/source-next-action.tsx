"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTaxAccess } from "./access";
import { taxError, type TaxEligibility } from "./shared";
import { loadPaymentVatLines } from "./vat-summary-source";
import { TaxInvoiceVatSummary } from "./vat-summary";
import { vatSummaryUnavailable, type InvoiceVatLine } from "./vat-treatment";
import styles from "./tax-invoices.module.css";

export function TaxInvoiceNextAction({ paymentId }: { paymentId: string }) {
  return <TaxInvoiceNextActionContent key={paymentId} paymentId={paymentId} />;
}

function TaxInvoiceNextActionContent({ paymentId }: { paymentId: string }) {
  const { permissions } = useTaxAccess(), router = useRouter();
  const [eligibility, setEligibility] = useState<TaxEligibility | null>(null), [error, setError] = useState("");
  const [vat, setVat] = useState<{ paymentId: string; lines: InvoiceVatLine[] | null; error: string } | null>(null);
  const [busy, setBusy] = useState(false), lock = useRef(false);
  useEffect(() => {
    let active = true;
    if (permissions?.canViewFinanceTaxInvoices) {
      void (async () => {
        try {
          const result = await supabase.rpc("get_finance_tax_invoice_eligibility", { p_payment_id: paymentId });
          if (active) {
            setEligibility(result.error ? null : result.data as TaxEligibility);
            setError(result.error ? taxError(result.error) : "");
          }
        } catch (cause) { if (active) { setEligibility(null); setError(taxError(cause)); } }
      })();
      void loadPaymentVatLines(supabase, paymentId).then(lines => {
        if (active) setVat({ paymentId, lines, error: "" });
      }).catch(() => {
        if (active) setVat({ paymentId, lines: null, error: vatSummaryUnavailable });
      });
    }
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
    <TaxInvoiceVatSummary lines={vat?.paymentId === paymentId ? vat.lines : null} error={vat?.paymentId === paymentId ? vat.error : ""} eligibility={eligibility} />
    {eligibility?.existing_id ? <Link className={styles.button} href={`/finance/tax-invoices/${eligibility.existing_id}`}>{eligibility.existing_number || "เปิดร่างใบกำกับภาษี"}</Link> : <>
      {eligibility?.can_prepare && permissions?.canManageFinanceTaxInvoices ? <button className={styles.primary} disabled={busy} onClick={() => void create()}>{busy ? "กำลังจัดทำร่าง..." : "จัดทำร่างใบกำกับภาษี"}</button> : null}
    </>}
  </section>;
}
