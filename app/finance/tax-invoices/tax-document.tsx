import { DocumentIdentityHeader } from "../../components/DocumentIdentity";
import { DocumentAuthorization } from "../../components/DocumentAuthorization";
import { LegalDocumentLayout } from "../../components/LegalDocumentLayout";
import { formatThaiSellerAddress } from "../../../lib/documentIdentity";
import { taxDate, taxMoney, taxPresentation, taxText, type TaxInvoice } from "./shared";
import theme from "../../components/DocumentTheme.module.css";
import styles from "./tax-invoices.module.css";

export function TaxInvoiceDocument({ row, logoUrl, documentNotice, documentNoOverride }: { row: TaxInvoice; logoUrl: string; documentNotice?: React.ReactNode; documentNoOverride?: string }) {
  const presentation = taxPresentation(row);
  if (!presentation.ok || !logoUrl) return <p role="alert" className={styles.error}>{presentation.ok ? "ยังโหลดหลักฐานโลโก้ไม่สำเร็จ จึงยังพิมพ์ไม่ได้" : presentation.error}</p>;
  const d = presentation.value, address = formatThaiSellerAddress(taxText(d.customer.address));
  return <LegalDocumentLayout className={`${styles.paper} ${theme.taxInvoice}`} languageCode="th">
    <DocumentIdentityHeader identity={d.identity} logoUrl={logoUrl} title="ใบกำกับภาษี" subtitle="Tax Invoice" documentNo={documentNoOverride || d.number || "ร่าง / DRAFT"} />
    {documentNotice}
    {row.status !== "issued" ? <p className={styles.watermark}>{row.status === "cancelled" ? "ยกเลิกร่าง / CANCELLED DRAFT" : "ร่าง / DRAFT - ยังไม่ได้ออกใบกำกับภาษี"}</p> : null}
    <section className={styles.parties}><div><h2>ผู้รับบริการ</h2><strong>{taxText(d.customer.name)}</strong>
      {address.body ? <p className={styles.address}>{address.body}</p> : <p className={styles.error}>ยังไม่มีที่อยู่ผู้รับบริการ</p>}
      {address.localityLine ? <p>{address.localityLine}</p> : null}
      {taxText(d.customer.tax_id) ? <p>เลขประจำตัวผู้เสียภาษี: {taxText(d.customer.tax_id)}</p> : null}
      {d.customer.vat_registered === true ? <p>{d.customer.branch_type === "head_office" ? "สำนักงานใหญ่" : `สาขา ${taxText(d.customer.branch_code)}`}</p> : null}
    </div><dl className={styles.documentFacts}><div><dt>วันที่ออกใบกำกับภาษี</dt><dd>{taxDate(d.issueDate)}</dd></div><div><dt>วันที่เกิดภาษี</dt><dd>{taxDate(d.taxPointDate)}</dd></div><div><dt>ใบแจ้งหนี้อ้างอิง</dt><dd>{d.invoiceNumber}</dd></div>{d.receiptNumber ? <div><dt>ใบเสร็จอ้างอิง</dt><dd>{d.receiptNumber}</dd></div> : null}</dl></section>
    <table className={styles.documentTable}><thead><tr><th scope="col">รายการ</th><th scope="col">ก่อน VAT</th><th scope="col">VAT</th><th scope="col">รวม THB</th></tr></thead><tbody>{d.lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{taxMoney(Math.round(Number(line.amount_before_vat) * 100))}</td><td>{taxMoney(Math.round(Number(line.vat_amount) * 100))}</td><td>{taxMoney(Math.round(Number(line.line_total) * 100))}</td></tr>)}</tbody></table>
    <dl className={styles.documentTotals}><div><dt>มูลค่าบริการก่อน VAT</dt><dd>{taxMoney(d.beforeVat)}</dd></div><div><dt>ภาษีมูลค่าเพิ่ม</dt><dd>{taxMoney(d.vat)}</dd></div><div><dt>ยอดรวม THB</dt><dd>{taxMoney(d.gross)}</dd></div></dl>
    <p className={styles.settlementNote}>อ้างอิงการรับชำระ {d.paymentReference}: เงินที่ได้รับจริง {taxMoney(d.cash)} THB{d.wht > 0 ? ` และภาษีหัก ณ ที่จ่าย ${taxMoney(d.wht)} THB` : ""}</p>
    <DocumentAuthorization documentKind="tax-invoice" />
  </LegalDocumentLayout>;
}
