"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTaxAccess } from "../tax-invoices/access";
import { documentDecisionLabels, documentError, vatTreatmentLabels, type DocumentDecision } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";

export function FinanceDocumentNextAction({ paymentId }: { paymentId: string }) {
  return <NextAction key={paymentId} paymentId={paymentId} />;
}
function NextAction({ paymentId }: { paymentId: string }) {
  const { permissions } = useTaxAccess(), router = useRouter(), lock = useRef(false);
  const [decision, setDecision] = useState<DocumentDecision | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(false), [receiptChecked, setReceiptChecked] = useState(false), [taxChecked, setTaxChecked] = useState(false);
  const canView = permissions?.canViewFinanceReceipts || permissions?.canViewFinanceTaxInvoices;
  useEffect(() => {
    let active = true;
    if (canView) void (async () => {
      const result = await supabase.rpc("get_finance_document_decision", { p_payment_id: paymentId });
      if (active) { setDecision(result.error ? null : result.data); setError(result.error ? documentError(result.error) : ""); }
    })().catch(cause => { if (active) setError(documentError(cause)); });
    return () => { active = false; };
  }, [paymentId, canView]);
  if (!canView) return null;
  const kind = decision?.decision, paired = kind === "combined_receipt_tax_invoice";
  const receiptOnly = kind === "receipt_only" || kind === "receipt_completion_only";
  const canManage = paired ? permissions?.canManageFinanceReceipts && permissions?.canManageFinanceTaxInvoices : receiptOnly ? permissions?.canManageFinanceReceipts : permissions?.canManageFinanceTaxInvoices;
  const existingId = decision?.combined_id || (paired ? decision?.receipt_id || decision?.tax_invoice_id : receiptOnly ? decision?.receipt_id : decision?.tax_invoice_id);
  const existingPath = decision?.combined_id ? "combined-documents" : (paired && decision?.receipt_id) || receiptOnly ? "receipts" : "tax-invoices";
  const actionable = !!kind && !kind.startsWith("blocked_") && kind !== "complete";
  async function create() {
    if (lock.current || !canManage || !actionable || !receiptChecked || (paired && !taxChecked)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = paired ? await supabase.rpc("create_finance_combined_document_draft", { p_payment_id: paymentId, p_external_receipt_checked: receiptChecked, p_external_tax_checked: taxChecked })
        : receiptOnly ? await supabase.rpc("create_finance_receipt_draft_from_payment", { p_payment_id: paymentId, p_external_receipt_checked: receiptChecked })
        : await supabase.rpc("create_finance_tax_invoice_draft", { p_payment_id: paymentId });
      if (result.error || typeof result.data !== "string") throw result.error || new Error("response");
      router.push(`/finance/${paired ? "combined-documents" : receiptOnly ? "receipts" : "tax-invoices"}/${result.data}`);
    } catch (cause) { setError(documentError(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={`${styles.nextAction} ${styles.noPrint}`} aria-label="เอกสารหลังรับชำระ"><h2>เอกสารหลังรับชำระ</h2>
    {error ? <p role="alert" className={styles.error}>{error}</p> : !decision ? <p role="status">กำลังตรวจสอบประเภทเอกสาร...</p> : <>
      <p><strong>{documentDecisionLabels[decision.decision] || "ต้องตรวจสอบต้นทางก่อนดำเนินการ"}</strong></p>
      {decision.decision === "receipt_only" ? <p>รายการรับชำระนี้ไม่มีรายการที่ต้องออกใบกำกับภาษีตาม VAT Treatment ที่บันทึกไว้</p> : null}
      <ul>{decision.lines.map(line => <li key={line.id}>{line.description}: {vatTreatmentLabels[line.resolved_vat_treatment.treatment]}</li>)}</ul>
      {decision.blockers?.length ? <ul className={styles.notice}>{decision.blockers.map(code => <li key={code}>{documentError(code)}</li>)}</ul> : null}
      {existingId ? <Link className={styles.primary} href={`/finance/${existingPath}/${existingId}`}>เปิดเอกสารที่มีอยู่</Link> : actionable && canManage ? <button className={styles.primary} disabled={busy} onClick={() => setOpen(true)}>{documentDecisionLabels[decision.decision]}</button> : null}
      {decision.receipt_id && existingPath !== "receipts" ? <p><Link className={styles.button} href={`/finance/receipts/${decision.receipt_id}`}>เปิดใบเสร็จที่ออกแล้ว</Link></p> : null}
      {open && actionable && !existingId ? <div className={styles.section}>
        <p className={styles.small}>หากมีเอกสารภายนอกอยู่แล้ว ให้หยุดและตรวจสอบการจัดทำเฉพาะเอกสารส่วนที่ขาดกับผู้มีอำนาจ ห้ามยืนยันว่าไม่มีเอกสารเพื่อออกซ้ำ</p>
        <label className={styles.check}><input type="checkbox" checked={receiptChecked} onChange={e => setReceiptChecked(e.target.checked)} />{receiptOnly || paired ? "ตรวจสอบแล้วว่าไม่มีใบเสร็จภายนอกหรือเลขที่จองไว้นอกระบบซ้ำสำหรับยอดนี้" : "ตรวจสอบแล้วว่าใบเสร็จเดิมยังถูกต้อง และไม่มีใบกำกับภาษีภายนอกซ้ำสำหรับยอดนี้"}</label>
        {paired ? <label className={styles.check}><input type="checkbox" checked={taxChecked} onChange={e => setTaxChecked(e.target.checked)} />ตรวจสอบแล้วว่าไม่มีใบกำกับภาษีภายนอก และไม่มีเลข VP-RTI ที่ออกหรือจองไว้นอกระบบซ้ำ</label> : null}
        <button className={styles.primary} disabled={busy || !receiptChecked || (paired && !taxChecked)} onClick={() => void create()}>ยืนยันจัดทำร่าง</button>
      </div> : null}
    </>}
  </section>;
}
