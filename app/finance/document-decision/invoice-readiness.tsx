"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { documentError, vatTreatmentLabels, type DocumentLine } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";

export function InvoiceDocumentReadiness({ invoiceId, revision }: { invoiceId: string; revision: string | null }) {
  const [result, setResult] = useState<{ lines: DocumentLine[]; unknown_lines: DocumentLine[]; buyer_identity_warning: boolean } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await supabase.rpc("finance_invoice_document_readiness", { p_invoice_id: invoiceId });
      if (active) { setError(response.error ? documentError(response.error) : ""); setResult(response.error ? null : response.data); }
    })().catch(cause => { if (active) { setResult(null); setError(documentError(cause)); } });
    return () => { active = false; };
  }, [invoiceId, revision]);
  return <section className={`${styles.section} ${styles.noPrint}`}><h2>เอกสารหลังรับชำระ</h2>
    {error ? <p role="alert" className={styles.error}>{error}</p> : !result ? <p role="status">กำลังตรวจสอบ VAT Treatment...</p> : <>
      <ul>{result.lines.map(line => { const treatment = line.resolved_vat_treatment.treatment; return <li key={line.id}><strong>{line.description}</strong>: {vatTreatmentLabels[treatment]} · {treatment === "unknown" ? "ยังตัดสินประเภทเอกสารไม่ได้" : ["standard_rate", "zero_rated"].includes(treatment) ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงินเท่านั้น"}</li>; })}</ul>
      {result.buyer_identity_warning ? <p className={styles.warning}>รายการนี้จะต้องออกใบเสร็จรับเงิน/ใบกำกับภาษีหลังรับชำระ แต่ข้อมูลผู้รับบริการสำหรับใบกำกับภาษียังไม่ครบ</p> : null}
      {result.unknown_lines.length ? <p className={styles.warning}>กรุณาตรวจสอบ VAT Treatment ของรายการข้างต้นที่ต้นทาง ระบบจะไม่เดาประเภทภาษีจากยอด VAT ที่เป็นศูนย์</p> : null}
    </>}
  </section>;
}
