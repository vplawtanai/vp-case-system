import { DocumentIdentityHeader } from "../../components/DocumentIdentity";
import { LegalDocumentLayout } from "../../components/LegalDocumentLayout";
import { CombinedReceiptTaxDocument } from "../combined-documents/document";
import { TaxInvoiceDocument } from "../tax-invoices/tax-document";
import { taxObject, taxPresentation, taxMoney, taxText, type TaxInvoice } from "../tax-invoices/shared";
import type { CorrectionRow, CorrectionDocumentRow } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";
import theme from "../../components/DocumentTheme.module.css";

export function correctionTaxProjection(c: CorrectionRow, document: CorrectionDocumentRow | null) {
  const s = document?.issued_snapshot_json || c.draft_snapshot_json, tax = taxObject(s.tax), metadata = taxObject(tax.document);
  const row: TaxInvoice = { id: c.original_tax_invoice_id, payment_id: taxText(taxObject(tax.payment).id), invoice_id: taxText(taxObject(tax.invoice).id), status: "issued",
    tax_invoice_no: taxText(metadata.tax_invoice_no), issue_date: taxText(tax.issue_date), issued_at: taxText(metadata.issued_at),
    issued_snapshot_json: tax, source_snapshot_json: tax, draft_snapshot_json: null, decisions_json: {}, created_at: "", updated_at: "", cancel_reason: null,
    combined_document_id: c.original_combined_document_id };
  return { snapshot: s, row, presentation: taxPresentation(row) };
}
export function TaxCorrectionDocument({ correction, document, logoUrl, replacementNotice }: { correction: CorrectionRow; document: CorrectionDocumentRow | null; logoUrl: string; replacementNotice?: React.ReactNode }) {
  let projection;
  try { projection = correctionTaxProjection(correction, document); } catch { return <p role="alert">หลักฐานเอกสารไม่ครบ / Invalid document evidence</p>; }
  if (!projection.presentation.ok || !logoUrl) return <p role="alert">หลักฐานเอกสารหรือโลโก้ยังไม่พร้อม / Document evidence or logo unavailable</p>;
  const { snapshot: s, row, presentation } = projection, d = presentation.value;
  const money = (value: unknown) => taxMoney(Math.round(Number(value) * 100));
  const isCopy = correction.correction_mode === "replacement_copy", replacement = correction.correction_mode === "cancel_and_reissue";
  const notice = <>{replacementNotice}<p className={styles.warning}>
    {!document ? correction.status === "cancelled" ? "ยกเลิกร่าง / CANCELLED · " : "ร่างเอกสารแก้ไข / CORRECTION DRAFT · " : ""}
    {isCopy ? `ใบแทน ครั้งที่ ${document ? taxText(String(s.copy_sequence)) : "-"} / REPLACEMENT COPY · ${correction.issue_date}`
      : `เป็นการยกเลิกและออกฉบับใหม่แทนฉบับเดิมเลขที่ ${taxText(correction.source_snapshot_json.document_no)} · ดำเนินการแก้ไขวันที่ ${correction.issue_date}`}
    <br />{correction.reason}{isCopy && document ? ` · ผู้ออกใบแทน ${taxText(s.issued_by_name)}` : ""}
    {isCopy ? <><br />ลายมือชื่อผู้ออกใบแทน / Issuer signature ____________________</> : null}
  </p></>;
  if (isCopy || replacement) {
    if (correction.original_combined_document_id) {
      const receipt = taxObject(s.receipt), r = taxObject(receipt.receipt);
      const paired = { id: correction.original_combined_document_id, payment_id: row.payment_id, receipt_id: taxText(r.id), tax_invoice_id: row.id,
        status: "issued" as const, combined_no: row.tax_invoice_no, issue_date: row.issue_date, issued_at: row.issued_at, updated_at: "",
        source_snapshot_json: null, draft_snapshot_json: null, issued_snapshot_json: { schema_version: 1, document_kind: "receipt_tax_invoice",
          combined_document_id: correction.original_combined_document_id, combined_no: row.tax_invoice_no, receipt, tax_invoice: s.tax } };
      return <CombinedReceiptTaxDocument combined={paired} row={row} logoUrl={logoUrl} documentNotice={notice} documentNoOverride={!document && replacement ? "ร่าง / DRAFT" : undefined} />;
    }
    return <TaxInvoiceDocument row={row} logoUrl={logoUrl} documentNotice={notice} documentNoOverride={!document && replacement ? "ร่าง / DRAFT" : undefined} />;
  }
  const title = correction.correction_mode === "credit_note" ? "ใบลดหนี้" : "ใบเพิ่มหนี้";
  const totals = taxObject(s.totals), lines = Array.isArray(s.lines) ? s.lines.map(taxObject) : [];
  return <LegalDocumentLayout className={`${styles.paper} ${theme.taxInvoice}`} languageCode="th">
    <DocumentIdentityHeader identity={d.identity} logoUrl={logoUrl} title={title} subtitle={correction.correction_mode === "credit_note" ? "Credit Note" : "Debit Note"} documentNo={document?.document_no || "ร่าง / DRAFT"} />
    {replacementNotice}
    {!document ? <p className={styles.watermark}>{correction.status === "cancelled" ? "ยกเลิกร่าง / CANCELLED" : "ร่าง / DRAFT"}</p> : null}
    <section className={styles.parties}><div><strong>{taxText(d.customer.name)}</strong><p className={styles.address}>{taxText(d.customer.address)}</p><p>เลขประจำตัวผู้เสียภาษี {taxText(d.customer.tax_id)}</p>
      {d.customer.vat_registered === true ? <p>{d.customer.branch_type === "head_office" ? "สำนักงานใหญ่" : `สาขา ${taxText(d.customer.branch_code)}`}</p> : null}</div>
      <div><p>อ้างอิง {taxText(correction.source_snapshot_json.document_no)}</p><p>วันที่เอกสารเดิม {taxText(correction.source_snapshot_json.document_date)}</p><p>วันที่ออก {correction.issue_date}</p><p>วันที่เกิดเหตุ {taxText(s.adjustment_date)}</p></div></section>
    <p>เหตุผล: {correction.reason}</p>
    <table className={styles.documentTable}><thead><tr><th>รายการต้นทาง</th><th>มูลค่าที่ปรับ</th><th>VAT ที่ปรับ</th></tr></thead><tbody>{lines.map(l => <tr key={taxText(l.item_id)}><td>{taxText(taxObject(l.source).description)}</td><td>{money(l.base_change)}</td><td>{money(l.vat_change)}</td></tr>)}</tbody></table>
    <dl className={styles.documentTotals}>{[["มูลค่าตามเอกสารเดิม", "original_base"], ["VAT ตามเอกสารเดิม", "original_vat"], ["มูลค่าก่อนปรับครั้งนี้", "previous_base"], ["มูลค่าที่ปรับครั้งนี้", "base_change"], ["VAT ที่ปรับครั้งนี้", "vat_change"], ["มูลค่าหลังปรับ", "resulting_base"], ["VAT หลังปรับ", "resulting_vat"]].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{money(totals[key])} THB</dd></div>)}</dl>
    <p>เอกสารปรับปรุงภาษี ไม่ใช่หลักฐานการคืนเงินหรือรับเงินเพิ่ม และไม่เปลี่ยนแปลง WHT</p>
    <p>ผู้ออกเอกสาร {taxText(s.issued_by_name)}</p>
  </LegalDocumentLayout>;
}
