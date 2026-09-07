"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TaxInvoiceGuard } from "../../access";
import { TaxInvoiceDocument } from "../../tax-document";
import { useTaxInvoice } from "../../use-tax-invoice";
import { taxPresentation } from "../../shared";
import styles from "../../tax-invoices.module.css";

export default function TaxPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <TaxInvoiceGuard>{() => <Preview key={id} id={id} />}</TaxInvoiceGuard>;
}
function Preview({ id }: { id: string }) {
  const { row, error, loading, logoUrl, reload } = useTaxInvoice(id);
  const [printing, setPrinting] = useState(false), [printError, setPrintError] = useState("");
  const printable = !loading && !error && logoUrl && row && taxPresentation(row).ok;
  async function print() {
    if (!printable || printing) return;
    setPrinting(true); setPrintError("");
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".legal-document-print-root img")).map(image => image.decode()));
      window.print();
    } catch { setPrintError("เตรียมเอกสารสำหรับพิมพ์ไม่สำเร็จ กรุณาโหลดใหม่"); }
    finally { setPrinting(false); }
  }
  return <><header className={`${styles.header} ${styles.noPrint}`}><h1>ตัวอย่างใบกำกับภาษี</h1><div className={styles.actions}><Link className={styles.button} href={`/finance/tax-invoices/${id}`}>กลับไปใบกำกับภาษี</Link><button className={styles.primary} disabled={!printable || printing} onClick={() => void print()}>พิมพ์ / บันทึก PDF</button></div></header>
    {printError || error ? <p className={styles.error} role="alert">{printError || error} <button className={styles.button} onClick={() => void reload()}>โหลดใหม่</button></p> : loading ? <p role="status">กำลังโหลด...</p> : row ? <TaxInvoiceDocument row={row} logoUrl={logoUrl} /> : null}
  </>;
}
