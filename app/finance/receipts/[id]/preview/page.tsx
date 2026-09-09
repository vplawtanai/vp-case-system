"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ReceiptGuard } from "../../access";
import { ReceiptDocument } from "../../receipt-document";
import { receiptPresentation, receiptStatusLabels } from "../../shared";
import { useReceipt } from "../../use-receipt";
import styles from "../../receipts.module.css";

export default function ReceiptPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <ReceiptGuard>{() => <ReceiptPreview key={id} id={id} />}</ReceiptGuard>;
}
function ReceiptPreview({ id }: { id: string }) {
  const { receipt, loading, error, reload, logoUrl } = useReceipt(id);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const result = receipt ? receiptPresentation(receipt) : null;
  const printable = result?.ok && (!result.value.logo || Boolean(logoUrl)) && !error && !loading;
  async function print() {
    if (!printable || printing) return;
    setPrinting(true); setPrintError("");
    try {
      await window.document.fonts.ready;
      await Promise.all(Array.from(window.document.querySelectorAll<HTMLImageElement>(".legal-document-print-root img")).map(image => image.decode()));
      window.print();
    }
    catch { setPrintError("ไม่สามารถเตรียมโลโก้สำหรับพิมพ์ได้ กรุณาโหลดข้อมูลใหม่ก่อนลองอีกครั้ง"); }
    finally { setPrinting(false); }
  }
  if (receipt?.combined_document_id) return <Link className={styles.primary} href={`/finance/combined-documents/${receipt.combined_document_id}/preview`}>เปิดตัวอย่างใบเสร็จรับเงิน/ใบกำกับภาษี</Link>;
  return <>
    {printError ? <p role="alert" className={`${styles.error} ${styles.noPrint}`}>{printError}</p> : null}
    <header className={`${styles.heading} ${styles.noPrint}`}><div><h1>{receipt ? receiptStatusLabels[receipt.status] : "ตัวอย่างใบเสร็จรับเงิน"}</h1></div><div className={styles.actions}><Link href={`/finance/receipts/${id}`} className={styles.button}>กลับไปใบเสร็จรับเงิน</Link><button type="button" className={styles.primary} disabled={!printable || printing} onClick={() => void print()}>พิมพ์ / บันทึก PDF</button></div></header>
    {loading ? <p role="status">กำลังโหลดตัวอย่าง...</p> : error ? <div role="alert" className={styles.error}>{error} <button type="button" className={styles.button} onClick={() => void reload()}>ลองอีกครั้ง</button></div> : receipt ? <ReceiptDocument receipt={receipt} logoUrl={logoUrl} /> : null}
  </>;
}
