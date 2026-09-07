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
  const { receipt, loading, error, reload } = useReceipt(id);
  const [printing, setPrinting] = useState(false);
  const result = receipt ? receiptPresentation(receipt) : null;
  async function print() {
    if (!result?.ok || printing) return;
    setPrinting(true);
    try { await window.document.fonts.ready; window.print(); }
    finally { setPrinting(false); }
  }
  return <>
    <header className={`${styles.heading} ${styles.noPrint}`}><div><h1>{receipt ? receiptStatusLabels[receipt.status] : "ตัวอย่างใบเสร็จรับเงิน"}</h1></div><div className={styles.actions}><Link href={`/finance/receipts/${id}`} className={styles.button}>กลับไปใบเสร็จรับเงิน</Link><button type="button" className={styles.primary} disabled={!result?.ok || loading || printing} onClick={() => void print()}>พิมพ์ / บันทึก PDF</button></div></header>
    {loading ? <p role="status">กำลังโหลดตัวอย่าง...</p> : error ? <div role="alert" className={styles.error}>{error} <button type="button" className={styles.button} onClick={() => void reload()}>ลองอีกครั้ง</button></div> : receipt ? <ReceiptDocument receipt={receipt} /> : null}
  </>;
}
