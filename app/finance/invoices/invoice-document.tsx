import { DocumentIdentityFooter, DocumentIdentityHeader } from "../../components/DocumentIdentity";
import { LegalDocumentLayout } from "../../components/LegalDocumentLayout";
import type { DocumentIdentity } from "../../../lib/documentIdentity";
import {
  displayText,
  formatBangkokDateTime,
  formatDocumentDate,
  money,
  numberValue,
  type FinanceInvoice,
  type FinanceInvoiceItem,
  type InvoicePaymentDestination,
} from "./shared";
import styles from "./invoice-document.module.css";

export function InvoiceDocument({
  invoice,
  items,
  identity,
  logoUrl,
  matter,
  installmentLabel,
  paymentDestination,
}: {
  invoice: FinanceInvoice;
  items: FinanceInvoiceItem[];
  identity: DocumentIdentity;
  logoUrl: string;
  matter: string;
  installmentLabel: string;
  paymentDestination: InvoicePaymentDestination | null;
}) {
  const thai = invoice.language_code !== "en";
  const labels = thai ? thaiLabels : englishLabels;
  const isDraft = invoice.document_status === "draft";
  const isVoided = invoice.document_status === "voided";
  const documentNo = isDraft
    ? labels.draftReference
    : displayText(invoice.invoice_no, labels.noNumber);

  return (
    <LegalDocumentLayout className={styles.document} languageCode={invoice.language_code}>
      <DocumentIdentityHeader
        identity={identity}
        logoUrl={logoUrl}
        title={labels.title}
        subtitle={labels.subtitle}
        documentNo={documentNo}
        languageCode={invoice.language_code}
      />

      {isDraft ? <div className={styles.draftBanner}>{labels.draftWarning}</div> : null}
      {isVoided ? <div className={styles.voidBanner}><strong>{labels.voidStatus}</strong><span>VOID</span>{invoice.voided_at ? <small>{labels.voidDate} {formatBangkokDateTime(invoice.voided_at)}</small> : null}</div> : null}

      <section className={styles.documentMeta}>
        <DocumentField label={labels.invoiceNo} value={documentNo} />
        <DocumentField label={labels.issueDate} value={formatDocumentDate(invoice.issue_date, invoice.language_code)} />
        <DocumentField label={labels.dueDate} value={formatDocumentDate(invoice.due_date, invoice.language_code)} />
      </section>

      <section className={styles.customerPanel}>
        <div className={styles.customerBlock}>
          <DocumentField label={labels.customer} value={displayText(invoice.customer_name)} />
          <div className={styles.contact}>
            {invoice.customer_tax_id ? <div>{labels.taxId}: {invoice.customer_tax_id}{invoice.customer_branch ? ` · ${invoice.customer_branch}` : ""}</div> : null}
            {invoice.customer_billing_address ? <div>{invoice.customer_billing_address}</div> : null}
            {[invoice.customer_phone, invoice.customer_email].filter(Boolean).length ? <div>{[invoice.customer_phone, invoice.customer_email].filter(Boolean).join(" · ")}</div> : null}
          </div>
        </div>
        <div className={styles.matterBlock}>
          <DocumentField label={labels.reference} value={matter} />
          <div style={{ marginTop: "3mm" }}><DocumentField label={labels.installment} value={installmentLabel} /></div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>{labels.items}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup>
              <col style={{ width: "42%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>
            <thead><tr><th>{labels.description}</th><th>{labels.vat}</th><th>{labels.beforeVat}</th><th>{labels.vatAmount}</th><th>{labels.total}</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}{item.allocation_percent !== null ? <span className={styles.vatMeta}>{labels.allocation} {numberValue(item.allocation_percent).toLocaleString("en-US", { maximumFractionDigits: 4 })}%</span> : null}</td>
                  <td>{item.vat_applicable ? `${numberValue(item.vat_rate)}%` : labels.nonVat}</td>
                  <td>{money(item.amount_before_vat, invoice.currency)}</td>
                  <td>{money(item.vat_amount, invoice.currency)}</td>
                  <td><strong>{money(item.line_total, invoice.currency)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.summary}>
          <SummaryRow label={labels.beforeVatTotal} value={money(invoice.amount_before_vat, invoice.currency)} />
          <SummaryRow label={labels.vatTotal} value={money(invoice.vat_amount, invoice.currency)} />
          <SummaryRow label={labels.amountPayable} value={money(invoice.total_amount, invoice.currency)} prominent />
        </div>
      </section>

      {paymentDestination || invoice.payment_terms_text || invoice.customer_note ? (
        <section className={styles.section}>
          <h2>{labels.terms}</h2>
          <div className={styles.notes}>
            {paymentDestination ? <div className={styles.paymentDestination}>
              <strong>{labels.paymentAccount}</strong>
              <span className={styles.bankName}>{displayText(paymentDestination.bankName, displayText(paymentDestination.shortName))}</span>
              <span>{labels.accountName} {displayText(paymentDestination.accountName)}</span>
              <span>{labels.accountNumber} {displayText(paymentDestination.accountNumber)}</span>
            </div> : null}
            {invoice.payment_terms_text ? <DocumentNote label={labels.paymentInstructions} value={invoice.payment_terms_text} /> : null}
            {invoice.customer_note ? <DocumentNote label={labels.customerNote} value={invoice.customer_note} /> : null}
          </div>
        </section>
      ) : null}

      <DocumentIdentityFooter identity={identity} />
    </LegalDocumentLayout>
  );
}

function DocumentField({ label, value }: { label: string; value: string }) {
  return <div><span className={styles.label}>{label}</span><strong className={styles.value}>{value}</strong></div>;
}

function DocumentNote({ label, value }: { label: string; value: string }) {
  return <div className={styles.note}><strong>{label}</strong><p>{value}</p></div>;
}

function SummaryRow({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return <div className={`${styles.summaryRow} ${prominent ? styles.grandTotal : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

const thaiLabels = {
  title: "ใบแจ้งหนี้",
  subtitle: "Invoice",
  draftReference: "ร่าง - ยังไม่มีเลขที่เอกสาร",
  noNumber: "ยังไม่มีเลขที่เอกสาร",
  draftWarning: "ร่างสำหรับตรวจสอบภายใน - ยังไม่ใช่ใบแจ้งหนี้ที่ออกอย่างเป็นทางการ",
  voidStatus: "ยกเลิกแล้ว",
  voidDate: "ยกเลิกเมื่อ",
  invoiceNo: "เลขที่ใบแจ้งหนี้",
  issueDate: "วันที่ออกเอกสาร",
  dueDate: "วันที่ครบกำหนด",
  customer: "ลูกค้า",
  taxId: "เลขประจำตัวผู้เสียภาษี",
  reference: "เรื่อง/งานอ้างอิง",
  installment: "งวดเรียกเก็บเงิน",
  items: "รายการค่าบริการ",
  description: "รายการ",
  vat: "VAT",
  beforeVat: "มูลค่าก่อน VAT",
  vatAmount: "VAT",
  total: "ยอดรวม",
  allocation: "สัดส่วนจากรายการต้นทาง",
  nonVat: "ไม่มี VAT",
  beforeVatTotal: "มูลค่าก่อน VAT",
  vatTotal: "ภาษีมูลค่าเพิ่ม",
  amountPayable: "ยอดรวมที่ต้องชำระ",
  terms: "เงื่อนไขและข้อมูลการชำระเงิน",
  paymentInstructions: "ข้อมูลการชำระเงิน",
  paymentAccount: "บัญชีสำหรับรับชำระ",
  accountName: "ชื่อบัญชี",
  accountNumber: "เลขที่บัญชี",
  customerNote: "หมายเหตุถึงลูกค้า",
};

const englishLabels = {
  title: "Invoice",
  subtitle: "ใบแจ้งหนี้",
  draftReference: "Draft - no official number",
  noNumber: "No document number",
  draftWarning: "INTERNAL REVIEW DRAFT - not an officially issued Invoice",
  voidStatus: "VOIDED",
  voidDate: "Voided on",
  invoiceNo: "Invoice No.",
  issueDate: "Issue Date",
  dueDate: "Due Date",
  customer: "Customer",
  taxId: "Tax ID",
  reference: "Matter / Reference",
  installment: "Billing Installment",
  items: "Service Items",
  description: "Description",
  vat: "VAT",
  beforeVat: "Before VAT",
  vatAmount: "VAT",
  total: "Total",
  allocation: "Source allocation",
  nonVat: "Non-VAT",
  beforeVatTotal: "Value Before VAT",
  vatTotal: "VAT",
  amountPayable: "Amount Payable",
  terms: "Payment Terms and Notes",
  paymentInstructions: "Payment Instructions",
  paymentAccount: "Payment Account",
  accountName: "Account Name",
  accountNumber: "Account Number",
  customerNote: "Customer Note",
};
