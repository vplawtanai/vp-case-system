"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { TaxInvoiceGuard } from "../tax-invoices/access";
import { useTaxInvoice } from "../tax-invoices/use-tax-invoice";
import { TaxInvoiceEditor } from "../tax-invoices/editor";
import type { UserPermissions } from "../../../lib/permissions";
import { documentError } from "../document-decision/shared";
import { CombinedReceiptTaxDocument } from "./document";
import { combinedTaxRow, type CombinedDocument } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";

export function CombinedWorkspace({ id, previewOnly = false }: { id: string; previewOnly?: boolean }) {
  return <TaxInvoiceGuard>{permissions => permissions.canViewFinanceReceipts ? <Load key={id} id={id} permissions={permissions} previewOnly={previewOnly} /> : <p role="alert">ต้องมีสิทธิ์ดูเอกสารทั้งสองประเภท</p>}</TaxInvoiceGuard>;
}
function Load({ id, permissions, previewOnly }: { id: string; permissions: UserPermissions; previewOnly: boolean }) {
  const [row, setRow] = useState<CombinedDocument | null>(null), [error, setError] = useState("");
  const reload = useCallback(async () => {
    const result = await supabase.from("finance_combined_documents").select("*").eq("id", id).single();
    if (result.error || !result.data) { setRow(null); setError(documentError(result.error)); return; }
    setError(""); setRow(result.data as CombinedDocument);
  }, [id]);
  useEffect(() => { const timer = setTimeout(() => { void reload(); }, 0); return () => clearTimeout(timer); }, [reload]);
  return error ? <p className={styles.error} role="alert">{error}</p> : row ? <Content combined={row} permissions={permissions} reloadCombined={reload} previewOnly={previewOnly} /> : <p role="status">กำลังโหลดเอกสาร...</p>;
}
function Content({ combined, permissions, reloadCombined, previewOnly }: { combined: CombinedDocument; permissions: UserPermissions; reloadCombined: () => Promise<void>; previewOnly: boolean }) {
  const state = useTaxInvoice(combined.tax_invoice_id), [printing, setPrinting] = useState(false), [printError, setPrintError] = useState("");
  const valid = state.row && combinedTaxRow(combined, state.row);
  async function reload() { await reloadCombined(); await state.reload(); }
  async function print() {
    if (!valid || !state.logoUrl || printing) return;
    setPrinting(true); setPrintError("");
    try { await document.fonts.ready; await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".legal-document-print-root img")).map(image => image.decode())); window.print(); }
    catch { setPrintError("เตรียมเอกสารสำหรับพิมพ์ไม่สำเร็จ กรุณาโหลดใหม่"); }
    finally { setPrinting(false); }
  }
  return <><header className={`${styles.header} ${styles.noPrint}`}><div><Link className={styles.button} href={`/finance/payments/${combined.payment_id}`}>กลับไปรายการรับชำระ</Link><h1>{combined.combined_no || "ร่างใบเสร็จรับเงิน/ใบกำกับภาษี"}</h1><span className={styles.status}>{combined.status === "issued" ? "ออกเอกสารแล้ว" : combined.status === "cancelled" ? "ยกเลิกร่างแล้ว" : "ร่าง"}</span></div>
    <div className={styles.actions}>{previewOnly ? <Link className={styles.button} href={`/finance/combined-documents/${combined.id}`}>กลับไปเอกสาร</Link> : <Link className={styles.button} href={`/finance/combined-documents/${combined.id}/preview`}>ดูตัวอย่าง / พิมพ์</Link>}<button className={styles.primary} disabled={!valid || !state.logoUrl || printing} onClick={() => void print()}>พิมพ์ / บันทึก PDF</button></div></header>
    {printError || state.error ? <p role="alert" className={styles.error}>{printError || state.error}</p> : state.loading ? <p role="status">กำลังโหลดหลักฐาน...</p> : !valid ? <p role="alert">หลักฐานการเชื่อมโยงเอกสารไม่สอดคล้อง กรุณาโหลดใหม่</p> : previewOnly ? <CombinedReceiptTaxDocument combined={combined} row={valid} logoUrl={state.logoUrl} /> : <TaxInvoiceEditor key={combined.updated_at + valid.updated_at} row={valid} combined={combined} permissions={permissions} logoUrl={state.logoUrl} blockers={state.blockers} reload={reload} />}
    {combined.status === "issued" ? <p className={`${styles.notice} ${styles.noPrint}`}>เอกสารที่ออกแล้วแก้ไขไม่ได้ การแก้ไขใบเสร็จและเอกสารภาษีต้องใช้ขั้นตอนเฉพาะประเภท</p> : null}
  </>;
}
