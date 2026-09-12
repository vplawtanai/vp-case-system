import { DocumentIdentityHeader } from "../../components/DocumentIdentity";
import { DocumentAuthorization } from "../../components/DocumentAuthorization";
import { LegalDocumentLayout } from "../../components/LegalDocumentLayout";
import { formatThaiSellerAddress } from "../../../lib/documentIdentity";
import { vatTreatmentLabels } from "../document-decision/shared";
import { taxDate, taxMoney, taxPresentation, taxText, type TaxInvoice } from "../tax-invoices/shared";
import { combinedTaxRow, type CombinedDocument } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";
import theme from "../../components/DocumentTheme.module.css";
import layout from "./document.module.css";

export function CombinedReceiptTaxDocument({ combined, row, logoUrl, documentNotice, documentNoOverride }: { combined: CombinedDocument; row: TaxInvoice; logoUrl: string; documentNotice?: React.ReactNode; documentNoOverride?: string }) {
  const frozen = combinedTaxRow(combined, row), result = frozen && taxPresentation(frozen);
  if (!result?.ok || !logoUrl) return <p role="alert" className={styles.error}>หลักฐานเอกสารรวมหรือโลโก้ยังไม่พร้อม จึงยังแสดงเอกสารไม่ได้</p>;
  const d = result.value, address = formatThaiSellerAddress(taxText(d.customer.address));
  return <LegalDocumentLayout className={`${styles.paper} ${theme.taxInvoice} ${layout.paper}`} languageCode="th">
    <DocumentIdentityHeader identity={d.identity} logoUrl={logoUrl} title="ใบเสร็จรับเงิน/ใบกำกับภาษี" subtitle="Receipt / Tax Invoice" documentNo={documentNoOverride || d.number || "ร่าง / DRAFT"} />
    {documentNotice}
    {combined.status !== "issued" ? <p className={styles.watermark}>{combined.status === "cancelled" ? "ยกเลิกร่าง / CANCELLED" : "ร่าง / DRAFT"}</p> : null}
    <section className={styles.parties}><div><h2>ผู้รับบริการ</h2><strong>{taxText(d.customer.name)}</strong><p className={styles.address}>{address.body}</p><p>{address.localityLine}</p>
      {taxText(d.customer.tax_id) ? <p>เลขประจำตัวผู้เสียภาษี {taxText(d.customer.tax_id)}</p> : null}
      {d.customer.vat_registered === true ? <p>{d.customer.branch_type === "head_office" ? "สำนักงานใหญ่" : `สาขา ${taxText(d.customer.branch_code)}`}</p> : null}
    </div><dl className={styles.documentFacts}><div><dt>วันที่รับชำระ</dt><dd>{taxDate(d.taxPointDate)}</dd></div><div><dt>วันที่เกิดภาษี</dt><dd>{taxDate(d.taxPointDate)}</dd></div><div><dt>วันที่ออกเอกสาร</dt><dd>{taxDate(d.issueDate)}</dd></div><div><dt>ใบแจ้งหนี้อ้างอิง</dt><dd>{d.invoiceNumber}</dd></div></dl></section>
    <table className={`${styles.documentTable} ${layout.lines}`}><colgroup><col /><col /><col /><col /></colgroup><thead><tr><th scope="col">รายการ</th><th scope="col">มูลค่า</th><th scope="col">VAT Treatment</th><th scope="col">VAT</th></tr></thead><tbody>
      {d.documentLines.map(line => <tr key={line.id}><td data-label="รายการ">{line.description}</td><td data-label="มูลค่า">{taxMoney(Math.round(Number(line.amount_before_vat) * 100))}</td><td data-label="VAT Treatment">{line.resolved_vat_treatment.treatment === "standard_rate" ? `VAT ${line.vat_rate}%` : vatTreatmentLabels[line.resolved_vat_treatment.treatment]}</td><td data-label="VAT">{["standard_rate", "zero_rated"].includes(line.resolved_vat_treatment.treatment) ? taxMoney(Math.round(Number(line.vat_amount) * 100)) : "-"}</td></tr>)}
    </tbody></table>
    <dl className={styles.documentTotals}><div><dt>มูลค่าที่เป็นฐาน VAT</dt><dd>{taxMoney(d.beforeVat)}</dd></div><div><dt>VAT</dt><dd>{taxMoney(d.vat)}</dd></div><div><dt>รายการไม่อยู่ในฐาน VAT</dt><dd>{taxMoney(d.nonTax)}</dd></div><div><dt>ยอดชำระรวม THB</dt><dd>{taxMoney(d.settlement)}</dd></div><div><dt>ภาษีหัก ณ ที่จ่าย</dt><dd>{taxMoney(d.wht)}</dd></div><div><dt>เงินที่ได้รับจริง THB</dt><dd>{taxMoney(d.cash)}</dd></div></dl>
    <p className={styles.settlementNote}>อ้างอิงการรับชำระ {d.paymentReference}</p><DocumentAuthorization documentKind="receipt" />
  </LegalDocumentLayout>;
}
