"use client";
import { useI18n } from "../../../lib/i18n/provider";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { ReceiptGuard } from "./access";
import { receiptMoney, receiptPresentation, receiptSearchFilter, receiptSelect, receiptStatusLabels, receiptStatusLabel, type FinanceReceipt, type ReceiptStatus } from "./shared";
import styles from "./receipts.module.css";

export default function ReceiptsPage() { return <ReceiptGuard>{() => <ReceiptList />}</ReceiptGuard>; }

function ReceiptList() {
  const { locale, t, date } = useI18n();
  const [rows, setRows] = useState<FinanceReceipt[]>([]);
  const [status, setStatus] = useState<ReceiptStatus | "">("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setRows([]); setError("");
    try {
      let requestQuery = supabase.from("finance_receipts").select(receiptSelect).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (status) requestQuery = requestQuery.eq("status", status);
      const filter = receiptSearchFilter(search);
      if (filter) requestQuery = requestQuery.or(filter);
      const result = await requestQuery.range(page * 50, page * 50 + 50);
      if (result.error) throw result.error;
      if (request !== sequence.current) return;
      setRows((result.data || []).slice(0, 50) as FinanceReceipt[]);
      setHasNext((result.data?.length || 0) > 50);
    } catch {
      if (request === sequence.current) setError("finance.receipt.listFailed");
    } finally { if (request === sequence.current) setLoading(false); }
  }, [page, search, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  return <>
    <header className={styles.heading}><h1>{t("finance.document.receipt")}</h1><button type="button" className={styles.button} disabled={loading} onClick={() => void load()}>{t("finance.receipt.reload")}</button></header>
    <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setSearch(query); setPage(0); }}>
      <label className={styles.label}>{t("finance.receipt.search")}<input type="search" maxLength={150} className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className={styles.label}>{t("finance.taxInvoice.ui.status")}<select className={styles.input} value={status} onChange={(event) => { setStatus(event.target.value as ReceiptStatus | ""); setPage(0); }}><option value="">{t("finance.receipt.all")}</option>{Object.keys(receiptStatusLabels).map(key => <option value={key} key={key}>{receiptStatusLabel(key as ReceiptStatus, locale)}</option>)}</select></label>
      <button type="submit" className={styles.button}>{t("common.actions.search")}</button>
    </form>
    {error ? <p role="alert" className={styles.error}>{t(error)}</p> : loading ? <p role="status">{t("finance.receipt.loading")}</p> : !rows.length ? <p>{t("finance.receipt.empty")}</p> : <table className={styles.table}>
      <thead><tr><th scope="col">{t("finance.document.receipt")}</th><th scope="col">{t("finance.receipt.clientReference")}</th><th scope="col">{t("finance.receipt.receivedOn")}</th><th scope="col">{t("finance.taxInvoice.ui.status")}</th><th scope="col">{t("finance.receipt.settlement")}</th></tr></thead>
      <tbody>{rows.map((row) => {
        const presentation = receiptPresentation(row);
        const document = presentation.ok ? presentation.value : null;
        return <tr key={row.id}>
          <td data-label={t("finance.document.receipt")}><Link className={styles.link} href={`/finance/receipts/${row.id}`}>{document?.receipt.number || row.receipt_no || t("finance.receipt.draft")}</Link></td>
          <td data-label={t("finance.receipt.clientReference")}>{document?.customer.name || t("finance.receipt.evidenceMissing")}<p className={styles.small}>{document?.payment.reference || row.payment_id}</p></td>
          <td data-label={t("finance.receipt.receivedOn")}>{document ? date(document.receipt.date) : "-"}</td>
          <td data-label={t("finance.taxInvoice.ui.status")}>{receiptStatusLabel(row.status, locale) || t("finance.receipt.invalidStatus")}</td>
          <td data-label={t("finance.receipt.settlement")}>{document ? receiptMoney(document.payment.settlement, document.payment.currency) : "-"}</td>
        </tr>;
      })}</tbody>
    </table>}
    <div className={styles.pagination}><button type="button" className={styles.button} disabled={loading || page === 0} onClick={() => setPage((value) => value - 1)}>{t("finance.receipt.previous")}</button><span>{t("finance.receipt.page", { page: page + 1 })}</span><button type="button" className={styles.button} disabled={loading || Boolean(error) || !hasNext} onClick={() => setPage((value) => value + 1)}>{t("finance.receipt.next")}</button></div>
  </>;
}
