"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { UserPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import { TaxInvoiceDocument } from "./tax-document";
import { taxDraftDirty, taxIssueReady } from "./review";
import { taxDate, taxError, taxMoney, taxObject, taxPresentation, taxStatusLabels, taxText, type TaxDecisions, type TaxInvoice } from "./shared";
import styles from "./tax-invoices.module.css";
import { CombinedReceiptTaxDocument } from "../combined-documents/document";
import type { CombinedDocument } from "../combined-documents/shared";
import { documentError } from "../document-decision/shared";
export function TaxInvoiceEditor({ row, permissions, logoUrl, blockers, reload, combined }: { row: TaxInvoice; permissions: UserPermissions; logoUrl: string; blockers: string[]; reload: () => Promise<void>; combined?: CombinedDocument }) {
  const [decisions, setDecisions] = useState<TaxDecisions>(row.decisions_json), [issueDate, setIssueDate] = useState(row.issue_date);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [reviewed, setReviewed] = useState(false);
  const [ack, setAck] = useState(false), [delayAck, setDelayAck] = useState(false), [reason, setReason] = useState("");
  const [refreshAck, setRefreshAck] = useState(false), [cancelOpen, setCancelOpen] = useState(false);
  const [receiptChecked, setReceiptChecked] = useState(false);
  const lock = useRef(false), alert = useRef<HTMLDivElement>(null);
  const presentation = taxPresentation(row);
  if (!presentation.ok) return <p className={styles.error} role="alert">{presentation.error}</p>;
  const d = presentation.value, source = taxObject(row.source_snapshot_json), customer = taxObject(source.customer);
  const title = combined ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบกำกับภาษี", prefix = combined ? "VP-RTI" : "VP-TI";
  const draft = row.status === "draft", editable = draft && permissions.canManageFinanceTaxInvoices && (!combined || permissions.canManageFinanceReceipts);
  const dirty = taxDraftDirty(row, issueDate, decisions);
  const missingAddress = !taxText(customer.address), missingTax = !taxText(customer.tax_id);
  const headOffice = ["สำนักงานใหญ่", "head office", "00000"].includes(taxText(customer.branch).toLowerCase());
  const branchType = headOffice ? "head_office" : decisions.buyer_branch_type || "";
  const delay = issueDate > d.taxPointDate;
  const ready = taxIssueReady({ status: row.status, canIssue: permissions.canIssueFinanceTaxInvoices && (!combined || (permissions.canIssueFinanceReceipts && receiptChecked)), busy, dirty, blockerCount: blockers.length,
    reviewed, acknowledged: ack, logoReady: Boolean(logoUrl), delayed: delay, delayAcknowledged: delayAck });
  const needsEvidence = missingAddress || (decisions.buyer_vat_registered === true && (missingTax || !headOffice));
  function change<K extends keyof TaxDecisions>(key: K, value: TaxDecisions[K]) { setDecisions(previous => ({ ...previous, [key]: value })); setReviewed(false); setAck(false); setError(""); }
  async function run(action: "save" | "refresh" | "issue" | "cancel") {
    if (lock.current) return;
    if (action === "issue" && !ready) {
      setError("กรุณาบันทึกข้อมูล แก้ไขรายการที่ต้องตรวจสอบ และยืนยันตัวอย่างก่อนออกใบกำกับภาษี");
      requestAnimationFrame(() => alert.current?.focus()); return;
    }
    if (action === "cancel" && !reason.trim()) { setError("กรุณาระบุเหตุผลยกเลิกร่าง"); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = combined ? (action === "save" ? await supabase.rpc("save_finance_combined_document_draft", { p_combined_id: combined.id, p_issue_date: issueDate, p_decisions_json: decisions, p_expected_updated_at: combined.updated_at })
        : action === "refresh" ? await supabase.rpc("refresh_finance_combined_document_draft", { p_combined_id: combined.id, p_expected_updated_at: combined.updated_at })
        : action === "issue" ? await supabase.rpc("issue_finance_combined_document", { p_combined_id: combined.id, p_reviewed_snapshot_json: combined.draft_snapshot_json, p_acknowledged: ack, p_delayed_issue_acknowledged: delayAck, p_external_receipt_checked: receiptChecked, p_external_tax_checked: decisions.external_coverage_checked === true })
        : await supabase.rpc("cancel_finance_combined_document_draft", { p_combined_id: combined.id, p_reason: reason.trim() }))
        : action === "save" ? await supabase.rpc("save_finance_tax_invoice_draft", { p_tax_invoice_id: row.id, p_issue_date: issueDate, p_decisions_json: decisions, p_expected_updated_at: row.updated_at })
        : action === "refresh" ? await supabase.rpc("refresh_finance_tax_invoice_draft", { p_tax_invoice_id: row.id, p_expected_updated_at: row.updated_at })
        : action === "issue" ? await supabase.rpc("issue_finance_tax_invoice", { p_tax_invoice_id: row.id, p_reviewed_snapshot_json: row.draft_snapshot_json, p_acknowledged: ack, p_delayed_issue_acknowledged: delayAck })
        : await supabase.rpc("cancel_finance_tax_invoice_draft", { p_tax_invoice_id: row.id, p_reason: reason.trim() });
      if (result.error || result.data !== (combined?.id || row.id)) throw result.error || new Error("response");
      await reload();
    } catch (cause) { setError(documentError(cause)); requestAnimationFrame(() => alert.current?.focus()); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <section className={`${styles.section} ${styles.noPrint}`}><div className={styles.actions}><Link className={styles.button} href={`/finance/payments/${row.payment_id}`}>เปิดรายการรับชำระต้นทาง</Link><Link className={styles.button} href={`/finance/invoices/${row.invoice_id}`}>{d.invoiceNumber}</Link><Link className={styles.button} href={combined ? `/finance/combined-documents/${combined.id}/preview` : `/finance/tax-invoices/${row.id}/preview`}>ดูตัวอย่าง / พิมพ์</Link></div></section>
    <section className={`${styles.section} ${styles.noPrint}`}><h2>ข้อมูลภาษีจากต้นทาง</h2><dl className={styles.facts}><div><dt>ก่อน VAT</dt><dd>{taxMoney(d.beforeVat)} THB</dd></div><div><dt>VAT</dt><dd>{taxMoney(d.vat)} THB</dd></div><div><dt>{combined ? "ยอดชำระรวม" : "ยอดรวมภาษี"}</dt><dd>{taxMoney(combined ? d.settlement : d.gross)} THB</dd></div><div><dt>เงินที่ได้รับจริง</dt><dd>{taxMoney(d.cash)} THB</dd></div><div><dt>หัก ณ ที่จ่าย</dt><dd>{taxMoney(d.wht)} THB</dd></div></dl></section>
    {draft ? <>
      <fieldset className={`${styles.section} ${styles.noPrint}`} disabled={!editable || busy}><legend>ข้อมูลผู้รับบริการและ VAT</legend><div className={styles.grid}>
        <div><span className={styles.small}>ผู้รับบริการ</span><p>{taxText(customer.name)}</p>{!missingAddress ? <p>{taxText(customer.address)}</p> : null}{!missingTax ? <p>เลขประจำตัวผู้เสียภาษี {taxText(customer.tax_id)}</p> : null}</div>
        <label className={styles.field}>สถานะ VAT ของผู้รับบริการ<select className={styles.input} value={typeof decisions.buyer_vat_registered === "boolean" ? String(decisions.buyer_vat_registered) : ""} onChange={e => change("buyer_vat_registered", e.target.value === "" ? null : e.target.value === "true")}><option value="">ยังไม่ระบุ</option><option value="true">จดทะเบียน VAT</option><option value="false">ไม่ได้จดทะเบียน VAT</option></select></label>
        {missingAddress ? <label className={styles.field}>ที่อยู่ตามหลักฐานผู้รับบริการ<textarea rows={3} maxLength={2000} className={styles.input} value={decisions.customer_address || ""} onChange={e => change("customer_address", e.target.value)} /></label> : null}
        {decisions.buyer_vat_registered === true ? <>
          {missingTax ? <label className={styles.field}>เลขประจำตัวผู้เสียภาษี<input className={styles.input} inputMode="numeric" maxLength={13} value={decisions.customer_tax_id || ""} onChange={e => change("customer_tax_id", e.target.value)} /></label> : null}
          {headOffice ? <p>สำนักงานใหญ่ (00000) ตามต้นทาง</p> : <label className={styles.field}>สำนักงานใหญ่ / สาขาตามหลักฐาน<select className={styles.input} value={branchType} onChange={e => change("buyer_branch_type", e.target.value)}><option value="">ยังไม่ระบุ</option><option value="head_office">สำนักงานใหญ่</option><option value="branch">สาขา</option></select></label>}
          {branchType === "branch" ? <label className={styles.field}>รหัสสาขา<input className={styles.input} maxLength={5} inputMode="numeric" value={decisions.buyer_branch_code || ""} onChange={e => change("buyer_branch_code", e.target.value)} /></label> : null}
        </> : null}
        {needsEvidence ? <label className={styles.field}>อ้างอิงหลักฐานข้อมูลเพิ่มเติม<textarea className={styles.input} rows={2} maxLength={2000} value={decisions.identity_evidence || ""} onChange={e => change("identity_evidence", e.target.value)} /><span className={styles.small}>ข้อมูลเพิ่มเติมใช้เฉพาะเอกสารนี้ ไม่แก้ไขทะเบียนลูกค้า</span></label> : null}
        {source.schema_version === 1 ? <><label className={styles.field}>ประเภท VAT ของรายการ<select className={styles.input} value={decisions.tax_treatment || ""} onChange={e => change("tax_treatment", e.target.value)}><option value="">ยังไม่ยืนยัน</option><option value="standard_rated">อยู่ในบังคับ VAT ตามอัตราต้นทาง</option><option value="zero_rated">อัตรา 0% พร้อมหลักฐาน</option></select></label>
        {decisions.tax_treatment === "zero_rated" ? <label className={styles.field}>หลักฐานการใช้อัตรา 0%<textarea className={styles.input} rows={2} maxLength={2000} value={decisions.treatment_reason || ""} onChange={e => change("treatment_reason", e.target.value)} /></label> : null}</> : <p className={styles.small}>ประเภท VAT ใช้หลักฐานรายการที่ตรึงจากใบแจ้งหนี้</p>}
      </div></fieldset>
      <fieldset className={`${styles.section} ${styles.noPrint}`} disabled={!editable || busy}><legend>จุดเกิดภาษีและวันที่ออก</legend><p>วันที่รับชำระจากต้นทาง: <strong>{taxDate(d.taxPointDate)}</strong></p>
        <label className={styles.check}><input type="checkbox" checked={decisions.no_earlier_event === true} onChange={e => change("no_earlier_event", e.target.checked)} />ตรวจสอบแล้วว่าไม่มีเหตุเกิดภาษีก่อนวันรับชำระ ยืนยันใช้วันรับชำระเป็นจุดเกิดภาษี</label>
        <label className={styles.check}><input type="checkbox" checked={decisions.external_coverage_checked === true} onChange={e => change("external_coverage_checked", e.target.checked)} />ตรวจสอบแล้วว่าไม่มีใบกำกับภาษีภายนอกสำหรับยอดนี้ และไม่มีเลข {prefix} ที่ออกหรือจองไว้นอกระบบ</label>
        <label className={styles.field}>วันที่ออกใบกำกับภาษี<input className={styles.input} type="date" value={issueDate} min={d.taxPointDate} onChange={e => { setIssueDate(e.target.value); setReviewed(false); setAck(false); setDelayAck(false); }} /></label>
        {delay ? <p className={styles.warning}>วันที่ออกเอกสารหลังวันเกิดภาษี เป็นการออกเอกสารล่าช้า ต้องตรวจสอบและรับทราบก่อนออกเลขที่ถาวร ระบบจะเก็บวันที่ทั้งสองและเวลาที่ออกจริง</p> : null}
      </fieldset>
      <section className={`${styles.section} ${styles.noPrint}`}><p role="status" className={dirty ? styles.warning : styles.small}>{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "ข้อมูลล่าสุดถูกบันทึกแล้ว"}</p>{editable ? <button className={styles.button} disabled={busy || !dirty} onClick={() => void run("save")}>บันทึกการเปลี่ยนแปลง</button> : null}</section>
    </> : <section className={`${styles.section} ${styles.noPrint}`}><h2>ประวัติเอกสาร</h2><p>{taxStatusLabels[row.status]}{row.issued_at ? ` เมื่อ ${new Date(row.issued_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : ""}</p>{row.cancel_reason ? <p>เหตุผล: {row.cancel_reason}</p> : null}{row.issue_date > d.taxPointDate ? <p className={styles.warning}>วันที่ออกหลังวันเกิดภาษี การรับทราบถูกเก็บในประวัติการออกเอกสาร</p> : null}</section>}
    <div className={styles.preview}>{combined ? <CombinedReceiptTaxDocument combined={combined} row={row} logoUrl={logoUrl} /> : <TaxInvoiceDocument row={row} logoUrl={logoUrl} />}</div>
    <div ref={alert} tabIndex={-1} className={styles.noPrint}>{error ? <p className={styles.error} role="alert">{error}</p> : null}</div>
    {draft ? <>
      <section className={`${styles.section} ${styles.noPrint}`}><h2>ยืนยันการออก{title}</h2>
        {blockers.length ? <div className={styles.notice}><strong>ยังออกใบกำกับภาษีไม่ได้</strong><ul>{blockers.map(code => <li key={code}>{taxError(code)}</li>)}</ul></div> : null}
        {dirty ? <p className={styles.warning}>กรุณาบันทึกก่อน ตัวอย่างด้านบนแสดงข้อมูลที่บันทึกล่าสุด</p> : null}
        {permissions.canIssueFinanceTaxInvoices && (!combined || permissions.canIssueFinanceReceipts) ? <>
          <label className={styles.check}><input type="checkbox" disabled={busy || dirty || !logoUrl} checked={reviewed} onChange={e => { setReviewed(e.target.checked); setAck(false); }} />ตรวจสอบตัวอย่าง ข้อมูลภาษี และหลักฐานครบถ้วนแล้ว</label>
          {delay ? <label className={styles.check}><input type="checkbox" disabled={busy || dirty} checked={delayAck} onChange={e => setDelayAck(e.target.checked)} />รับทราบการออกใบกำกับภาษีหลังวันเกิดภาษี และยืนยันวันที่ออกที่แสดง</label> : null}
          {combined ? <label className={styles.check}><input type="checkbox" disabled={busy || dirty} checked={receiptChecked} onChange={e => setReceiptChecked(e.target.checked)} />ตรวจสอบอีกครั้งว่าไม่มีใบเสร็จภายนอกหรือการจองเลขที่ซ้ำสำหรับรายการรับชำระนี้</label> : null}
          <label className={styles.check}><input type="checkbox" disabled={busy || dirty || !reviewed} checked={ack} onChange={e => setAck(e.target.checked)} />ยืนยันออกเลข {prefix} ถาวรและล็อกหลักฐานเอกสาร ไม่สามารถยกเลิกเอกสารที่ออกแล้วในขั้นตอนนี้</label>
          <button className={styles.primary} disabled={!ready} onClick={() => void run("issue")}>{busy ? "กำลังดำเนินการ..." : `ออก${title}`}</button>
        </> : <p className={styles.small}>{combined ? "ต้องให้ผู้มีสิทธิ์ออกทั้งใบเสร็จและใบกำกับภาษีตรวจสอบขั้นสุดท้าย" : "ต้องให้ผู้มีสิทธิ์ออกใบกำกับภาษีตรวจสอบขั้นสุดท้าย"}</p>}
      </section>
      {editable ? <section className={`${styles.section} ${styles.noPrint}`}><h2>การดำเนินการอื่น</h2>
        <label className={styles.check}><input type="checkbox" checked={refreshAck} disabled={busy} onChange={e => setRefreshAck(e.target.checked)} />รับทราบว่าการรีเฟรชต้นทางที่เปลี่ยนไปจะล้างการยืนยันและข้อมูลเพิ่มเติมในร่าง</label><button className={styles.button} disabled={busy || !refreshAck || dirty} onClick={() => void run("refresh")}>รีเฟรชร่างจากต้นทาง</button>
        <p><button className={styles.danger} disabled={busy} onClick={() => setCancelOpen(!cancelOpen)}>ยกเลิกร่าง</button></p>
        {cancelOpen ? <><label className={styles.field}>เหตุผลยกเลิกร่าง<textarea className={styles.input} rows={2} maxLength={2000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label><p className={styles.small}>ปล่อยการจองยอดภาษีโดยคงประวัติร่าง ไม่เปลี่ยนรายการรับชำระ</p><button className={styles.danger} disabled={busy || !reason.trim()} onClick={() => void run("cancel")}>ยืนยันยกเลิกร่าง</button></> : null}
      </section> : null}
    </> : null}
  </>;
}
