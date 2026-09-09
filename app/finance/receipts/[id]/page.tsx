"use client";
import { FinanceDocumentNextAction } from "../../document-decision/next-action";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { UserPermissions } from "../../../../lib/permissions";
import { supabase } from "../../../../lib/supabase";
import { ReceiptGuard } from "../access";
import { ReceiptDocument } from "../receipt-document";
import { receiptDate, receiptMethodLabels, receiptMoney, receiptPresentation, receiptRpc, receiptStatusLabels, receiptTime, safeReceiptError, type ReceiptCommand } from "../shared";
import { useReceipt } from "../use-receipt";
import styles from "../receipts.module.css";

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ReceiptGuard>{(permissions) => <ReceiptWorkspace key={id} id={id} permissions={permissions} />}</ReceiptGuard>;
}

function ReceiptWorkspace({ id, permissions }: { id: string; permissions: UserPermissions }) {
  const { receipt, loading, error: loadError, reload, logoUrl } = useReceipt(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [reviewed, setReviewed] = useState("");
  const [mode, setMode] = useState<"issue" | "cancel" | "void" | null>(null);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const lock = useRef(false);
  const presentation = receipt ? receiptPresentation(receipt) : null;
  const document = presentation?.ok ? presentation.value : null;
  const fingerprint = receipt ? JSON.stringify([receipt.id, receipt.updated_at, receipt.draft_snapshot_json]) : "";
  const logoReady = Boolean(document && (!document.logo || logoUrl));
  const canIssue = receipt?.status === "draft" && permissions.canIssueFinanceReceipts && Boolean(document?.logo) && logoReady && reviewed === fingerprint;
  function clearReview() { setReviewed(""); setPreview(false); setMode(null); setAcknowledged(false); setReason(""); }
  function startMode(next: "issue" | "cancel" | "void") { setMode(next); setReason(""); setAcknowledged(false); setError(""); }
  async function run(command: ReceiptCommand) {
    if (lock.current || !receipt) return;
    if (command.kind === "issue" && !canIssue) return;
    if ((command.kind === "refresh" || command.kind === "cancel") && (receipt.status !== "draft" || !permissions.canManageFinanceReceipts)) return;
    if (command.kind === "void" && (receipt.status !== "issued" || !permissions.canVoidFinanceReceipts)) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const rpc = receiptRpc(command);
      const result = await supabase.rpc(rpc.name, rpc.args);
      if (result.error || result.data !== id) throw result.error || new Error("Unexpected receipt ID");
      clearReview();
      await reload();
      setMessage(command.kind === "refresh" ? "รีเฟรชร่างแล้ว กรุณาตรวจสอบตัวอย่างใหม่" : "ดำเนินการใบเสร็จรับเงินแล้ว");
    } catch (cause) {
      clearReview();
      await reload();
      setError(safeReceiptError(cause));
    } finally { lock.current = false; setBusy(false); }
  }
  if (loading) return <p role="status">กำลังโหลดใบเสร็จรับเงิน...</p>;
  if (receipt?.combined_document_id) return <Link className={styles.primary} href={`/finance/combined-documents/${receipt.combined_document_id}`}>เปิดใบเสร็จรับเงิน/ใบกำกับภาษี</Link>;
  if (!receipt) return <><p role="alert" className={styles.error}>{loadError}</p><button type="button" className={styles.button} onClick={() => void reload()}>ลองอีกครั้ง</button></>;
  return <>
    <header className={`${styles.heading} ${styles.noPrint}`}>
      <div><Link className={styles.link} href="/finance/receipts">ใบเสร็จรับเงินทั้งหมด</Link><h1>{document?.receipt.number || receipt.receipt_no || "ร่างใบเสร็จรับเงิน"}</h1><span className={styles.status}>{receiptStatusLabels[receipt.status]}</span></div>
      <div className={styles.actions}><Link className={styles.button} href={`/finance/payments/${receipt.payment_id}`}>รายการรับชำระ</Link><button type="button" className={styles.button} disabled={busy} onClick={() => { clearReview(); void reload(); }}>โหลดข้อมูลล่าสุด</button></div>
    </header>
    {error || loadError ? <p role="alert" className={styles.error}>{error || loadError}</p> : null}
    {message ? <p role="status" className={styles.notice}>{message}</p> : null}
    {presentation && !presentation.ok ? <p role="alert" className={styles.error}>{presentation.error}</p> : null}
    {document && !document.logo ? <p className={`${styles.notice} ${styles.noPrint}`}>{receipt.status === "draft" ? "ร่างนี้ยังไม่มีหลักฐานโลโก้ กรุณารีเฟรชร่างจากรายการรับชำระและตรวจสอบตัวอย่างใหม่ก่อนออกใบเสร็จ" : "เอกสารเดิมไม่มีหลักฐานโลโก้ที่ตรึงไว้ จึงไม่ใช้โลโก้ปัจจุบันแทน"}</p> : null}
    {document ? <div className={styles.noPrint}>
      <section className={styles.section}><h2>ยอดรับชำระ</h2><dl className={styles.facts}>
        <div><dt>ยอดชำระ</dt><dd><strong>{receiptMoney(document.payment.settlement, document.payment.currency)}</strong></dd></div>
        <div><dt>ภาษีหัก ณ ที่จ่ายตามรายการรับชำระ</dt><dd><strong>{receiptMoney(document.payment.wht, document.payment.currency)}</strong></dd></div>
        <div><dt>เงินที่ได้รับจริง</dt><dd><strong>{receiptMoney(document.payment.cash, document.payment.currency)}</strong></dd></div>
        <div><dt>วันที่รับชำระ</dt><dd>{receiptDate(document.payment.receivedOn)}</dd></div><div><dt>อ้างอิงการรับชำระ</dt><dd>{document.payment.reference}</dd></div><div><dt>วิธีรับชำระ</dt><dd>{receiptMethodLabels[document.payment.method]}</dd></div>
        {document.payment.bank ? <div><dt>บัญชีรับเงิน</dt><dd>{document.payment.bank.bankName}<br />{document.payment.bank.accountName}<br />{document.payment.bank.accountNumber}</dd></div> : null}
        {document.payment.receivingAccountReference ? <div><dt>รายละเอียดบัญชี / ช่องทางรับเงิน</dt><dd>{document.payment.receivingAccountReference}</dd></div> : null}
      </dl></section>
      <section className={styles.section}><h2>ผู้รับเงินและลูกค้า</h2><dl className={styles.facts}><div><dt>ผู้รับเงิน</dt><dd>{document.identity.companyNameTh}<br />{document.identity.addressTh || document.identity.addressEn}<br />{document.identity.taxId}<br />{document.identity.branchTh || document.identity.branchEn}</dd></div><div><dt>ลูกค้า / ผู้ชำระเงิน</dt><dd>{document.customer.name}<br />{document.customer.address}{document.customer.taxId ? <><br />{document.customer.taxId}</> : null}{document.customer.branch ? <><br />{document.customer.branch}</> : null}</dd></div></dl></section>
      <section className={styles.section}><h2>ใบแจ้งหนี้ที่อ้างอิง</h2><table className={styles.table}><thead><tr><th>ใบแจ้งหนี้ / รายการ</th><th>เงินที่ได้รับจริง</th><th>ภาษีหัก ณ ที่จ่าย</th><th>ยอดชำระ</th></tr></thead><tbody>{document.invoices.map((invoice) => <tr key={invoice.id}><td data-label="ใบแจ้งหนี้ / รายการ">{invoice.number}<p>{invoice.description}</p></td><td data-label="เงินที่ได้รับจริง">{receiptMoney(invoice.cash, invoice.currency)}</td><td data-label="ภาษีหัก ณ ที่จ่าย">{receiptMoney(invoice.wht, invoice.currency)}</td><td data-label="ยอดชำระ">{receiptMoney(invoice.settlement, invoice.currency)}</td></tr>)}</tbody></table></section>
      {document.receipt.issuedAt ? <section className={styles.section}><h2>ประวัติเอกสาร</h2><dl className={styles.facts}><div><dt>ออกเอกสารเมื่อ</dt><dd>{receiptTime(document.receipt.issuedAt)}</dd></div><div><dt>ผู้ใช้ออกเอกสาร</dt><dd>{document.receipt.issuedBy}</dd></div></dl></section> : null}
      <FinanceDocumentNextAction paymentId={receipt.payment_id} />
    </div> : null}
    <section className={`${styles.section} ${styles.noPrint}`}>
      {receipt.status === "voided" ? <p className={styles.error}>ยกเลิกเมื่อ {receipt.voided_at && Number.isFinite(Date.parse(receipt.voided_at)) ? receiptTime(receipt.voided_at) : "ไม่พบเวลา"}<br />เหตุผล: {receipt.void_reason}</p> : null}
      {receipt.replaces_receipt_id ? <p>ทดแทนใบเสร็จ <Link className={styles.link} href={`/finance/receipts/${receipt.replaces_receipt_id}`}>{receipt.replaces_receipt_id}</Link></p> : null}
      <div className={styles.actions}>
        {document ? <><button type="button" className={styles.button} disabled={busy || !logoReady} onClick={() => { setPreview(true); setReviewed(fingerprint); }}>ตรวจสอบตัวอย่าง</button><Link className={styles.button} href={`/finance/receipts/${id}/preview`}>เปิดตัวอย่าง / PDF</Link></> : null}
        {receipt.status === "draft" && permissions.canManageFinanceReceipts ? <button type="button" className={styles.button} disabled={busy} onClick={() => void run({ kind: "refresh", receiptId: id })}>รีเฟรชร่างจากรายการรับชำระ</button> : null}
      </div>
    </section>
    {preview && document ? <div className={styles.preview}><ReceiptDocument receipt={receipt} logoUrl={logoUrl} /></div> : null}
    <section className={`${styles.section} ${styles.noPrint}`} aria-label="ตรวจสอบและยืนยันใบเสร็จ">
      {receipt.status === "draft" && permissions.canIssueFinanceReceipts ? <>
        <h2>ยืนยันการออกใบเสร็จรับเงิน</h2>
        <p className={styles.small}>ตรวจสอบตัวอย่างและยอดรับชำระก่อนออกเลขที่ถาวร ใบเสร็จที่ออกแล้วจะแก้ไขไม่ได้</p>
        <button type="button" className={styles.primary} disabled={busy || !canIssue} onClick={() => startMode("issue")}>ออกใบเสร็จรับเงิน</button>
      </> : null}
      {((receipt.status === "draft" && permissions.canManageFinanceReceipts) || (receipt.status === "issued" && permissions.canVoidFinanceReceipts)) && mode !== "issue" ? <div className={styles.otherActions}>
        <h3>การดำเนินการอื่น</h3>
        <p className={styles.small}>การยกเลิกใบเสร็จไม่กลับรายการรับชำระและไม่ลบประวัติ</p>
        <button type="button" className={styles.danger} disabled={busy} onClick={() => startMode(receipt.status === "draft" ? "cancel" : "void")}>{receipt.status === "draft" ? "ยกเลิกร่าง" : "ยกเลิกใบเสร็จรับเงิน"}</button>
      </div> : null}
      {mode ? <div className={styles.confirmation} aria-label="ยืนยันการดำเนินการใบเสร็จ">
        <h3>{mode === "issue" ? "ยืนยันออกใบเสร็จรับเงิน" : mode === "void" ? "ยืนยันยกเลิกใบเสร็จรับเงิน" : "ยืนยันยกเลิกร่าง"}</h3>
        {mode !== "issue" ? <label className={styles.label}>เหตุผล<textarea className={styles.input} maxLength={2000} rows={3} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label> : null}
        {mode !== "cancel" ? <label className={styles.check}><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} />{mode === "issue" ? "ตรวจสอบตัวอย่างและหลักฐานแล้ว ยืนยันออกเลขที่ถาวรและล็อกข้อมูลใบเสร็จรับเงิน" : "ยืนยันยกเลิกใบเสร็จโดยคงเลขที่และประวัติเดิม การยกเลิกนี้ไม่กลับรายการรับชำระ"}</label> : null}
        <div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={() => setMode(null)}>ปิด</button><button type="button" className={mode === "issue" ? styles.primary : styles.danger} disabled={busy || (mode !== "cancel" && !acknowledged) || (mode !== "issue" && !reason.trim()) || (mode === "issue" && !canIssue)} onClick={() => void run(mode === "issue" ? { kind: "issue", receiptId: id, acknowledged, reviewedSnapshot: receipt.draft_snapshot_json } : mode === "void" ? { kind: "void", receiptId: id, reason, acknowledged } : { kind: "cancel", receiptId: id, reason })}>{busy ? "กำลังดำเนินการ..." : "ยืนยัน"}</button></div>
      </div> : null}
    </section>
  </>;
}
