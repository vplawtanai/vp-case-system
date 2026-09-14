"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { money } from "../invoices/shared";
import { directMoneyError, type DirectRecord } from "./shared";
import styles from "../finance-record-list.module.css";

export function DirectMoneyList({ unclassified = false }: { unclassified?: boolean }) {
  const { t, locale, date } = useI18n();
  const [rows, setRows] = useState<DirectRecord[]>([]), [status, setStatus] = useState("");
  const [page, setPage] = useState(0), [next, setNext] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState<unknown>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        let q = supabase.from("finance_direct_money_receipts").select("id,payer_name,received_on,cash_amount,wht_amount,gross_amount,currency,status,unclassified,reference_no").order("created_at", { ascending: false }).order("id", { ascending: false });
        if (status) q = q.eq("status", status);
        if (unclassified) q = q.eq("unclassified", true).neq("status", "reversed");
        const result = await q.range(page * 50, page * 50 + 50);
        if (result.error) throw result.error;
        if (!cancelled) { setRows((result.data || []).slice(0, 50) as DirectRecord[]); setNext((result.data || []).length > 50); }
      } catch (e) { if (!cancelled) setError(e); } finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [page, status, unclassified, retry]);
  const headings = [t("finance.payment.ui.reference"), t("directMoney.payer"), t("directMoney.date"), t("directMoney.actualCash"), "WHT", t("directMoney.gross"), t("finance.payment.ui.status"), t("finance.list.open")];
  return <div>
    <label className={styles.filter}>{t("finance.payment.ui.status")}<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">{t("finance.receipt.all")}</option>{["draft", "confirmed", ...(unclassified ? [] : ["reversed"])].map(s => <option value={s} key={s}>{t(`directMoney.${s}`)}</option>)}</select></label>
    {loading ? <p role="status">{t("common.state.loading")}</p> : error ? <p className={styles.error} role="alert">{directMoneyError(error, locale)} <button className={styles.button} onClick={() => setRetry(n => n + 1)}>{t("common.actions.retry")}</button></p> : !rows.length ? <p className={styles.empty}>{t("directMoney.empty")}</p> : <table className={styles.table}><thead><tr>{headings.map((heading, i) => <th scope="col" key={i}>{heading}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>
      <td data-label={headings[0]}><strong>{row.id.slice(0, 8).toUpperCase()}</strong><p>{t(row.unclassified ? "directMoney.unclassified" : "directMoney.title")}</p></td>
      <td data-label={headings[1]}>{row.payer_name}</td><td data-label={headings[2]}>{date(row.received_on)}</td>
      <td data-label={headings[3]} className={styles.numeric}>{money(row.cash_amount, row.currency)}</td><td data-label={headings[4]} className={styles.numeric}>{money(row.wht_amount, row.currency)}</td><td data-label={headings[5]} className={styles.numeric}>{money(row.gross_amount, row.currency)}</td>
      <td data-label={headings[6]}><span className={styles.status}>{t(`directMoney.${row.status}`)}</span></td><td data-label={headings[7]}><Link className={styles.button} href={`/finance/direct-money/${row.id}`}>{t("finance.list.open")}</Link></td>
    </tr>)}</tbody></table>}
    <div className={styles.pagination}><button className={styles.button} disabled={loading || !page} onClick={() => setPage(p => p - 1)}>{t("finance.receipt.previous")}</button><span>{t("finance.receipt.page", { page: page + 1 })}</span><button className={styles.button} disabled={loading || !!error || !next} onClick={() => setPage(p => p + 1)}>{t("finance.receipt.next")}</button></div>
  </div>;
}
