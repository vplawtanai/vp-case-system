"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import { displayText, money } from "../invoices/shared";
import { paymentUiLabels, type FinancePayment } from "./shared";
import styles from "../finance-record-list.module.css";

type PaymentListRow = Pick<FinancePayment, "id" | "internal_reference" | "client_id" | "received_on" | "cash_amount" | "wht_amount" | "settlement_amount" | "currency" | "status"> & { clientName: string | null };
const paymentListSelect = "id,internal_reference,client_id,received_on,cash_amount,wht_amount,settlement_amount,currency,status";

export default function PaymentsPage() {
  return <QuotationGuard canAccess={access => access.permissions.canManageFinancePayments || access.permissions.canConfirmFinancePayments || access.permissions.canReverseFinancePayments || access.permissions.canReallocateFinancePayments}>
    {access => <><FinanceSubNav activePage="payments" permissions={access.permissions} /><PaymentList /></>}
  </QuotationGuard>;
}

function PaymentList() {
  const { locale, t, date } = useI18n();
  const [rows, setRows] = useState<PaymentListRow[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const { statuses } = paymentUiLabels(locale);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setRows([]); setError(false);
    try {
      let query = supabase.from("finance_payments").select(paymentListSelect).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (status) query = query.eq("status", status);
      const result = await query.range(page * 50, page * 50 + 50);
      if (result.error) throw result.error;
      const payments = (result.data || []).slice(0, 50) as Omit<PaymentListRow, "clientName">[];
      const clientIds = [...new Set(payments.map(row => row.client_id))];
      const clients = clientIds.length ? await supabase.from("clients").select("id,name").in("id", clientIds) : { data: [], error: null };
      if (clients.error) throw clients.error;
      if (request !== sequence.current) return;
      const names = new Map((clients.data || []).map(client => [client.id, client.name]));
      setRows(payments.map(row => ({ ...row, clientName: names.get(row.client_id) || null })));
      setHasNext((result.data?.length || 0) > 50);
    } catch { if (request === sequence.current) setError(true); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [page, status]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  const headings = [t("finance.payment.ui.reference"), t("finance.payment.ui.client"), t("finance.receipt.receivedOn"), t("finance.payment.settlement.receivedCompact"), "WHT", t("finance.receipt.settlement"), t("finance.payment.ui.status"), t("finance.list.open")];
  return <section className={styles.workspace}>
    <header className={styles.header}><h1>{t("finance.nav.payments")}</h1><label className={styles.filter}>{t("finance.payment.ui.status")}<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">{t("finance.receipt.all")}</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></header>
    {loading ? <p role="status">{t("common.state.loading")}</p> : error ? <p role="alert" className={styles.error}>{t("finance.payment.list.failed")} <button className={styles.button} type="button" onClick={() => void load()}>{t("common.actions.retry")}</button></p> : !rows.length ? <p className={styles.empty}>{t("finance.payment.list.empty")}</p> :
      <table className={styles.table}><thead><tr>{headings.map((label, index) => <th key={index} scope="col" className={index >= 3 && index <= 5 ? styles.numeric : undefined}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>
        <td data-label={headings[0]}><strong>{displayText(row.internal_reference, row.id.slice(0, 8).toUpperCase())}</strong></td>
        <td data-label={headings[1]}>{row.clientName || t("finance.list.customerUnavailable")}</td>
        <td data-label={headings[2]}>{date(row.received_on)}</td>
        <td data-label={headings[3]} className={styles.numeric}>{money(row.cash_amount, row.currency)}</td>
        <td data-label={headings[4]} className={styles.numeric}>{money(row.wht_amount, row.currency)}</td>
        <td data-label={headings[5]} className={styles.numeric}>{money(row.settlement_amount, row.currency)}</td>
        <td data-label={headings[6]}><span className={styles.status}>{statuses[row.status] || t("finance.receipt.invalidStatus")}</span></td>
        <td data-label={headings[7]}><Link className={styles.button} href={`/finance/payments/${row.id}`}>{t("finance.list.open")}</Link></td>
      </tr>)}</tbody></table>}
    <div className={styles.pagination}><button type="button" className={styles.button} disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>{t("finance.receipt.previous")}</button><span>{t("finance.receipt.page", { page: page + 1 })}</span><button type="button" className={styles.button} disabled={loading || error || !hasNext} onClick={() => setPage(value => value + 1)}>{t("finance.receipt.next")}</button></div>
  </section>;
}
