"use client";

import { useI18n } from "../../../lib/i18n/provider";
import { uiMessage, type UiMessage } from "../../../lib/i18n/core";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QuotationGuard } from "../quotations/shared";
import { supabase } from "../../../lib/supabase";
import type { UserPermissions } from "../../../lib/permissions";
import FinanceSubNav from "../FinanceSubNav";
import { invoiceCompositionSourceLabel, invoiceUiLabels, money, type InvoiceCompositionItem } from "./shared";
import { FinanceHeader, FinanceFilterBar, FinanceListFrame, FinanceStatusBadge } from "../ui/primitives";
import styles from "./invoice-workspace.module.css";

type InvoiceListRow = {
  id: string;
  invoice_no: string | null;
  document_status: string;
  source_model: "installment_v1" | "billable_charge_v2";
  finance_invoice_items: InvoiceCompositionItem[];
  customer_name: string | null;
  currency: string;
  total_amount: number | string;
  created_at: string;
};

export default function InvoiceListPage() {
  return <QuotationGuard>{(access) => <InvoiceListWorkspace permissions={access.permissions} />}</QuotationGuard>;
}

function InvoiceListWorkspace({ permissions }: { permissions: UserPermissions }) {
  const { locale, t, text, date } = useI18n();
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiMessage | string>("");
  const { statuses: invoiceStatusLabels } = invoiceUiLabels(locale);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const visibleRows = rows.filter(row => (!status || row.document_status === status) && `${row.invoice_no || ""} ${row.customer_name || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const canCompose = permissions.canEditFinanceQuotation && permissions.canManageFinanceBillableCharges;

  const load = useCallback(async () => {
    setLoading(true);
    const result = await supabase.from("finance_invoices").select("id,invoice_no,document_status,source_model,customer_name,currency,total_amount,created_at,finance_invoice_items(source_state,source_snapshot_json)").order("created_at", { ascending: false });
    if (result.error) {
      console.error("LOAD INVOICE WORKSPACE FAILED", result.error);
      setError(uiMessage("finance.invoice.ui.listLoadFailed"));
    } else {
      setRows((result.data || []) as InvoiceListRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <div className={styles.page}>
    <FinanceSubNav activePage="invoices" permissions={permissions} />
    <FinanceHeader icon="invoice" title={t("finance.invoice.ui.title")} description={t("finance.invoice.ui.listDescription")} actions={canCompose ? <Link className={styles.primaryButton} href="/finance/invoices/compose">{t("finance.invoice.ui.create")}</Link> : null}/>
    <FinanceFilterBar label={t("common.actions.search")}>
      <label>{t("common.actions.search")}<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>{t("finance.taxInvoice.ui.status")}<select value={status} onChange={event => setStatus(event.target.value)}><option value="">{t("finance.taxInvoice.ui.allStatuses")}</option>{Object.entries(invoiceStatusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </FinanceFilterBar>
    {error ? <div className={styles.error}>{text(error)}</div> : null}
    {loading ? <div className={styles.loading} role="status">{t("finance.invoice.ui.loading")}</div> : !visibleRows.length ? <div className={styles.empty}>{t("finance.invoice.ui.empty")}</div> : <FinanceListFrame><table><thead><tr>
      {[t("finance.list.documentNumber"),t("finance.invoice.ui.customer"),t("finance.invoice.ui.source"),t("finance.invoice.ui.total"),t("finance.taxInvoice.ui.status"),t("finance.invoice.ui.open")].map(label => <th key={label} scope="col">{label}</th>)}
    </tr></thead><tbody>{visibleRows.map(invoice => <tr key={invoice.id}>
      <td data-label={t("finance.list.documentNumber")}><strong>{invoice.invoice_no || t("finance.invoice.ui.draftReferenceValue", { reference: invoice.id.slice(0, 8).toUpperCase() })}</strong><div><small>{date(invoice.created_at, true)}</small></div></td>
      <td data-label={t("finance.invoice.ui.customer")}>{invoice.customer_name || "-"}</td>
      <td data-label={t("finance.invoice.ui.source")}>{invoiceCompositionSourceLabel(invoice.source_model, invoice.finance_invoice_items || [], undefined, locale)}</td>
      <td data-label={t("finance.invoice.ui.total")} data-amount>{money(invoice.total_amount, invoice.currency)}</td>
      <td data-label={t("finance.taxInvoice.ui.status")}><FinanceStatusBadge status={invoice.document_status} label={invoiceStatusLabels[invoice.document_status] || t("finance.receipt.invalidStatus")}/></td>
      <td data-label={t("finance.invoice.ui.open")}><Link className={styles.detailButton} href={`/finance/invoices/${invoice.id}`}>{t("finance.invoice.ui.open")}</Link></td>
    </tr>)}</tbody></table></FinanceListFrame>}
  </div>;
}
