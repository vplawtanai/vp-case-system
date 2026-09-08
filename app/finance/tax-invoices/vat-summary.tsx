import type { TaxEligibility } from "./shared";
import { unknownTaxDecision, unknownVatExplanation, vatConfirmationBlocker, vatEligibilityBlockerMessage, vatTreatmentPresentation, type InvoiceVatLine } from "./vat-treatment";
import styles from "./tax-invoices.module.css";

const amount = (value: number, currency: string) => `${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function TaxInvoiceVatSummary({ lines, error, eligibility }: { lines: InvoiceVatLine[] | null; error: string; eligibility: TaxEligibility | null }) {
  const unresolved = lines?.some(line => line.treatment === "unknown");
  const multipleInvoices = new Set(lines?.map(line => line.invoiceId)).size > 1;
  const issued = eligibility?.existing_status === "issued";
  const awaitingTreatmentConfirmation = eligibility?.blockers.includes(vatConfirmationBlocker);
  const blocked = Boolean(error || !lines?.length || unresolved || eligibility?.blockers.length || (!eligibility?.existing_id && !eligibility?.can_prepare));
  return <div className={styles.vatSummary}>
    <h3>สถานะ VAT และใบกำกับภาษี</h3>
    {error ? <p className={styles.warning} role="alert">{error}</p> : lines ? <>
      <table className={styles.vatTable} aria-label="สถานะ VAT ของรายการต้นทาง">
        <thead><tr><th scope="col">รายการ</th><th scope="col">มูลค่าก่อน VAT</th><th scope="col">ข้อมูล VAT จากใบแจ้งหนี้</th><th scope="col">VAT</th><th scope="col">สถานะใบกำกับภาษี</th></tr></thead>
        <tbody>{lines.map(line => {
          const display = vatTreatmentPresentation(line.treatment, line.rate);
          return <tr key={`${line.invoiceId}:${line.id}`}>
            <th scope="row" data-label="รายการ">{line.description}{multipleInvoices ? <small>{line.invoiceNumber}</small> : null}</th>
            <td data-label="มูลค่าก่อน VAT" className={styles.vatAmount}>{amount(line.beforeVat, line.currency)}</td>
            <td data-label="ข้อมูล VAT จากใบแจ้งหนี้"><span className={display.workflow === "unresolved" ? styles.vatUnknown : styles.vatKnown}>{display.label}</span>
              {line.treatment === "standard_rate" && awaitingTreatmentConfirmation ? <small>VAT Treatment สำหรับใบกำกับภาษี<br /><strong>รอการยืนยัน</strong></small> : null}
            </td>
            <td data-label="VAT" className={styles.vatAmount}>{amount(line.vat, line.currency)}</td>
            <td data-label="สถานะใบกำกับภาษี">{display.status}{display.workflow !== "unresolved" ? <small>{display.explanation}</small> : null}</td>
          </tr>;
        })}</tbody>
      </table>
      {unresolved ? <p className={styles.warning}>{unknownVatExplanation}<br />{unknownTaxDecision}</p> : null}
    </> : <p className={styles.small} role="status">กำลังอ่านหลักฐาน VAT จากใบแจ้งหนี้...</p>}
    {eligibility ? <div className={styles.vatReadiness}>
      <strong>{issued ? "ออกใบกำกับภาษีแล้ว" : blocked ? "ยังไม่พร้อมออกใบกำกับภาษี" : "ตรวจสอบและยืนยันการออกใบกำกับภาษีในร่าง"}</strong>
      {eligibility.blockers.length ? <ul>{eligibility.blockers.map(code => <li key={code}>{vatEligibilityBlockerMessage(code, lines)}</li>)}</ul> : null}
    </div> : null}
  </div>;
}
