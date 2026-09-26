"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import { TaxInvoiceGuard } from "./access";
import { taxError, taxStatusLabels, taxStatusLabel, type TaxInvoice } from "./shared";
import { FinanceHeader, FinanceFilterBar, FinanceListFrame, FinanceStatusBadge } from "../ui/primitives";
import styles from "./tax-invoices.module.css";

export default function TaxInvoicesPage() { return <TaxInvoiceGuard>{() => <TaxList />}</TaxInvoiceGuard>; }
function TaxList() {
  const { locale, t, date } = useI18n();
  const [rows, setRows] = useState<TaxInvoice[]>([]), [error, setError] = useState<unknown>(null), [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    const query = supabase.from("finance_tax_invoices").select("id,status,tax_invoice_no,issue_date,created_at").order("created_at", { ascending: false }).limit(200);
    void (status ? query.eq("status", status) : query).then(result => {
      if (!active) return;
      setError(result.error); setRows((result.data || []) as TaxInvoice[]); setLoading(false);
    });
    return () => { active = false; };
  }, [status]);
  return <><FinanceHeader icon="taxInvoice" title={t("finance.document.taxInvoice")}/><FinanceFilterBar label={t("finance.taxInvoice.ui.status")}><label className={styles.field}>{t("finance.taxInvoice.ui.status")}<select className={styles.input} value={status} onChange={event => { setLoading(true); setStatus(event.target.value); }}><option value="">{t("finance.taxInvoice.ui.allStatuses")}</option>{Object.keys(taxStatusLabels).map(key => <option key={key} value={key}>{taxStatusLabel(key as TaxInvoice["status"], locale)}</option>)}</select></label></FinanceFilterBar>
    {loading ? <p role="status">{t("common.state.loading")}</p> : error ? <p role="alert" className={styles.error}>{taxError(error, locale)}</p> : rows.length ? <FinanceListFrame><table className={styles.list}><thead><tr><th>{t("finance.document.taxInvoice")}</th><th>{t("finance.taxInvoice.ui.issueDate")}</th><th>{t("finance.taxInvoice.ui.status")}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td data-label={t("finance.document.taxInvoice")}><Link href={`/finance/tax-invoices/${row.id}`}>{row.tax_invoice_no || t("finance.taxInvoice.ui.draftReference", { reference: row.id.slice(0, 8).toUpperCase() })}</Link></td><td data-label={t("finance.taxInvoice.ui.issueDate")}>{date(row.issue_date)}</td><td data-label={t("finance.taxInvoice.ui.status")}><FinanceStatusBadge status={row.status} label={taxStatusLabel(row.status, locale)}/></td></tr>)}</tbody></table></FinanceListFrame> : <p>{t("finance.taxInvoice.ui.empty")}</p>}
  </>;
}
