"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { UserPermissions } from "../../../../lib/permissions";
import { TaxInvoiceGuard } from "../access";
import { useTaxInvoice } from "../use-tax-invoice";
import { taxStatusLabels } from "../shared";
import { TaxInvoiceEditor } from "../editor";
import styles from "../tax-invoices.module.css";

export default function TaxInvoicePage() {
  const { id } = useParams<{ id: string }>();
  return <TaxInvoiceGuard>{permissions => <Workspace key={id} id={id} permissions={permissions} />}</TaxInvoiceGuard>;
}
function Workspace({ id, permissions }: { id: string; permissions: UserPermissions }) {
  const state = useTaxInvoice(id);
  if (state.row?.combined_document_id) return <Link className={styles.primary} href={`/finance/combined-documents/${state.row.combined_document_id}`}>เปิดใบเสร็จรับเงิน/ใบกำกับภาษี</Link>;
  return <>
    <header className={`${styles.header} ${styles.noPrint}`}><div><Link className={styles.button} href="/finance/tax-invoices">กลับไปใบกำกับภาษี</Link><h1>{state.row?.tax_invoice_no || `ร่างใบกำกับภาษี ${id.slice(0, 8).toUpperCase()}`}</h1>{state.row ? <span className={styles.status}>{taxStatusLabels[state.row.status]}</span> : null}</div></header>
    {state.loading ? <p role="status">กำลังโหลด...</p> : state.error ? <p role="alert" className={styles.error}>{state.error} <button className={styles.button} onClick={() => void state.reload()}>โหลดใหม่</button></p> : state.row ? <TaxInvoiceEditor key={state.row.updated_at} row={state.row} permissions={permissions} logoUrl={state.logoUrl} blockers={state.blockers} reload={state.reload} /> : null}
  </>;
}
