import { DocumentIdentityHeader } from "../../components/DocumentIdentity";
import { LegalDocumentLayout } from "../../components/LegalDocumentLayout";
import { formatThaiSellerAddress } from "../../../lib/documentIdentity";
import { receiptDate, receiptMethodLabels, receiptMoney, receiptPresentation, type FinanceReceipt } from "./shared";
import styles from "./receipt-document.module.css";
import documentTheme from "../../components/DocumentTheme.module.css";

export function ReceiptDocument({ receipt, logoUrl = "" }: { receipt: FinanceReceipt; logoUrl?: string }) {
  const result = receiptPresentation(receipt);
  if (!result.ok) return <div role="alert" className={styles.invalid}>{result.error}</div>;
  if (result.value.logo && !logoUrl) return <div role="alert" className={styles.invalid}>ไม่สามารถแสดงโลโก้ตามหลักฐานเอกสารได้ กรุณาโหลดข้อมูลใหม่ก่อนตรวจสอบหรือพิมพ์</div>;
  const { identity, customer, payment, invoices, receipt: document } = result.value;
  const customerAddress = formatThaiSellerAddress(customer.address);
  return <LegalDocumentLayout className={`${styles.paper} ${documentTheme.receipt}`} languageCode="th">
    <DocumentIdentityHeader identity={identity} logoUrl={result.value.logo ? logoUrl : ""} title="ใบเสร็จรับเงิน" subtitle="Receipt" documentNo={document.number || "ร่าง / DRAFT"} className={styles.header} />
    {receipt.status !== "issued" ? <div className={styles.status} data-receipt-status={receipt.status}>
      {receipt.status === "draft" ? "ร่าง / DRAFT - ยังไม่ได้ออกใบเสร็จรับเงิน" : receipt.status === "voided" ? "ยกเลิก / VOID" : "ยกเลิกร่าง / CANCELLED DRAFT"}
    </div> : null}
    <section className={styles.parties}>
      <div><h2>ลูกค้า / ผู้ชำระเงิน</h2><strong>{customer.name}</strong>
        {customerAddress.body ? <p className={styles.address}>{customerAddress.body}</p> : null}
        {customerAddress.localityLine ? <p>{customerAddress.localityLine}</p> : null}
        {customer.taxId ? <p>เลขประจำตัวผู้เสียภาษี: {customer.taxId}</p> : null}
        {customer.branch ? <p>{customer.branch}</p> : null}
      </div>
      <dl className={styles.metadata}><div><dt>วันที่รับชำระ</dt><dd>{receiptDate(document.date)}</dd></div><div><dt>อ้างอิงการรับชำระ</dt><dd>{payment.reference}</dd></div><div><dt>วิธีรับชำระ</dt><dd>{receiptMethodLabels[payment.method]}</dd></div></dl>
    </section>
    <table className={styles.allocations}>
      <caption>รายการอ้างอิงใบแจ้งหนี้</caption>
      <thead><tr><th scope="col">ใบแจ้งหนี้ / รายการ</th><th scope="col">ยอดชำระ<br />{payment.currency}</th></tr></thead>
      <tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.number}</strong><p>{invoice.description}</p></td><td>{receiptMoney(invoice.settlement, invoice.currency)}</td></tr>)}</tbody>
    </table>
    <div className={styles.closing}>
    <section className={styles.settlement}>
      {payment.bank || payment.receivingAccountReference ? <div className={styles.bank}><h2>บัญชี / ช่องทางรับเงิน</h2>{payment.bank ? <><p>{payment.bank.bankName}</p><p>{payment.bank.accountName}</p><p>{payment.bank.accountNumber}</p>{!payment.bank.bankName && !payment.bank.accountName && !payment.bank.accountNumber ? <p>อ้างอิงบัญชี: {payment.bank.id}</p> : null}</> : null}{payment.receivingAccountReference ? <p>{payment.receivingAccountReference}</p> : null}</div> : <div />}
      <dl className={styles.totals}>
        <div><dt>ยอดชำระ</dt><dd>{receiptMoney(payment.settlement, payment.currency)}</dd></div>
        <div><dt>ภาษีหัก ณ ที่จ่าย</dt><dd>{receiptMoney(payment.wht, payment.currency)}</dd></div>
        <div className={styles.cash}><dt>เงินที่ได้รับจริง</dt><dd>{receiptMoney(payment.cash, payment.currency)}</dd></div>
      </dl>
    </section>
    {payment.wht > 0 ? <p className={styles.whtNote}>ภาษีหัก ณ ที่จ่ายตามรายการรับชำระ ไม่ใช่เงินที่ได้รับจริง</p> : null}
    <footer className={styles.footer}><strong>{identity.companyNameTh || identity.companyNameEn}</strong><span>{[identity.phone, identity.email, identity.website].filter(Boolean).join(" · ")}</span></footer>
    </div>
  </LegalDocumentLayout>;
}
