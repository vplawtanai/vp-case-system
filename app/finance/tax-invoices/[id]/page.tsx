"use client";
import Link from "next/link";
import { useI18n } from "../../../../lib/i18n/provider";
import { useParams } from "next/navigation";
import type { UserPermissions } from "../../../../lib/permissions";
import { TaxInvoiceGuard } from "../access";
import { useTaxInvoice } from "../use-tax-invoice";
import { taxStatusLabel } from "../shared";
import { TaxInvoiceEditor } from "../editor";
import styles from "../tax-invoices.module.css";

export default function TaxInvoicePage() {
  const { id } = useParams<{ id: string }>();
  return <TaxInvoiceGuard>{permissions => <Workspace key={id} id={id} permissions={permissions} />}</TaxInvoiceGuard>;
}
function Workspace({ id, permissions }: { id: string; permissions: UserPermissions }) {
  const { locale, t } = useI18n();
  const state = useTaxInvoice(id);
  if (state.row?.combined_document_id) return <Link className={styles.primary} href={`/finance/combined-documents/${state.row.combined_document_id}`}>{t("finance.taxInvoice.ui.openCombined")}</Link>;
  return <>
    <header className={`${styles.header} ${styles.noPrint}`}><div><Link className={styles.button} href="/finance/tax-invoices">{t("finance.taxInvoice.ui.back")}</Link><h1>{state.row?.tax_invoice_no || t("finance.taxInvoice.ui.draftTitle", { reference: id.slice(0, 8).toUpperCase() })}</h1>{state.row ? <span className={styles.status}>{taxStatusLabel(state.row.status, locale)}</span> : null}</div></header>
    {state.loading ? <p role="status">{t("common.state.loading")}</p> : state.error ? <p role="alert" className={styles.error}>{state.error} <button className={styles.button} onClick={() => void state.reload()}>{t("finance.taxInvoice.ui.reload")}</button></p> : state.row ? <TaxInvoiceEditor key={state.row.updated_at} row={state.row} permissions={permissions} logoUrl={state.logoUrl} blockers={state.blockers} reload={state.reload} /> : null}
  </>;
}
