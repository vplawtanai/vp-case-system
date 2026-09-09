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
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>{t("finance.invoice.ui.finance")}</span><h1>{t("finance.invoice.ui.title")}</h1><p>{t("finance.invoice.ui.listDescription")}</p></div>
      {canCompose ? <Link className={styles.primaryButton} href="/finance/invoices/compose">{t("finance.invoice.ui.create")}</Link> : null}
    </header>
    {error ? <div className={styles.error}>{text(error)}</div> : null}
    <section className={styles.surface}>
      {loading ? <div className={styles.loading}>{t("finance.invoice.ui.loading")}</div> : null}
      {!loading && !rows.length ? <div className={styles.empty}>{t("finance.invoice.ui.empty")}</div> : null}
      {!loading && rows.length ? <div className={styles.invoiceList}>{rows.map((invoice) => <article key={invoice.id} className={styles.invoiceRow}>
        <div className={styles.invoiceIdentity}><strong>{invoice.invoice_no || t("finance.invoice.ui.draftReferenceValue", { reference: invoice.id.slice(0, 8).toUpperCase() })}</strong><small>{date(invoice.created_at, true)}</small></div>
        <div className={styles.invoiceCell}><span>{t("finance.invoice.ui.customer")}</span><strong>{invoice.customer_name || "-"}</strong></div>
        <div className={styles.invoiceCell}><span>{t("finance.invoice.ui.source")}</span><strong>{invoiceCompositionSourceLabel(invoice.source_model, invoice.finance_invoice_items || [], undefined, locale)}</strong></div>
        <div className={styles.invoiceCell}><span>{t("finance.invoice.ui.total")}</span><strong>{money(invoice.total_amount, invoice.currency)}</strong><span className={styles.status}>{invoiceStatusLabels[invoice.document_status] || invoice.document_status}</span></div>
        <Link className={styles.detailButton} href={`/finance/invoices/${invoice.id}`}>{t("finance.invoice.ui.open")}</Link>
      </article>)}</div> : null}
    </section>
  </div>;
}
