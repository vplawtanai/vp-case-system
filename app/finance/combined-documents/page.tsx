"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { TaxInvoiceGuard } from "../tax-invoices/access";
import { money } from "../invoices/shared";
import { taxObject, taxText } from "../tax-invoices/shared";
import type { CombinedDocument } from "./shared";
import styles from "../finance-record-list.module.css";

type CombinedListRow = Pick<CombinedDocument, "id" | "payment_id" | "status" | "combined_no" | "issue_date" | "draft_snapshot_json" | "issued_snapshot_json">;
const combinedListSelect = "id,payment_id,status,combined_no,issue_date,draft_snapshot_json,issued_snapshot_json";

export default function CombinedDocumentsPage() {
  const { t } = useI18n();
  return <TaxInvoiceGuard>{permissions => permissions.canViewFinanceReceipts ? <CombinedList /> : <p role="alert">{t("finance.combined.viewPermission")}</p>}</TaxInvoiceGuard>;
}

function combinedListFacts(row: CombinedListRow) {
  try {
    // Issued navigation summaries use frozen evidence, never mutable Draft/customer data.
    const snapshot = row.status === "issued" ? taxObject(taxObject(row.issued_snapshot_json).tax_invoice) : taxObject(row.draft_snapshot_json);
    const customer = taxObject(snapshot.customer), payment = taxObject(snapshot.payment);
    const amount = payment.settlement_amount, currency = taxText(payment.currency);
    if (payment.id !== row.payment_id || !currency || !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(String(amount)) || !Number.isFinite(Number(amount))) return null;
    return { customerName: taxText(customer.name), paymentReference: taxText(payment.internal_reference) || row.payment_id.slice(0, 8).toUpperCase(), receivedOn: taxText(payment.received_on), settlement: amount as string | number, currency };
  } catch { return null; }
}

function CombinedList() {
  const { t, date } = useI18n();
  const [rows, setRows] = useState<CombinedListRow[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const statuses = { draft: t("status.draft"), issued: t("status.issued"), cancelled: t("finance.taxInvoice.ui.statusCancelled") };
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setRows([]); setError(false);
    try {
      let query = supabase.from("finance_combined_documents").select(combinedListSelect).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (status) query = query.eq("status", status);
      const result = await query.range(page * 50, page * 50 + 50);
      if (result.error) throw result.error;
      if (request !== sequence.current) return;
      setRows((result.data || []).slice(0, 50) as CombinedListRow[]);
      setHasNext((result.data?.length || 0) > 50);
    } catch { if (request === sequence.current) setError(true); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [page, status]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  const headings = [t("finance.list.documentNumber"), t("finance.payment.ui.client"), t("finance.list.paymentReference"), t("finance.list.documentDate"), t("finance.receipt.settlement"), t("finance.payment.ui.status"), t("finance.list.open")];
  return <section className={styles.workspace}>
    <header className={styles.header}><h1>{t("finance.nav.combined")}</h1><label className={styles.filter}>{t("finance.payment.ui.status")}<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">{t("finance.receipt.all")}</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></header>
    {loading ? <p role="status">{t("common.state.loading")}</p> : error ? <p role="alert" className={styles.error}>{t("finance.combined.list.failed")} <button className={styles.button} type="button" onClick={() => void load()}>{t("common.actions.retry")}</button></p> : !rows.length ? <p className={styles.empty}>{t("finance.combined.list.empty")}</p> :
      <table className={styles.table}><thead><tr>{headings.map((label, index) => <th key={index} scope="col" className={index === 4 ? styles.numeric : undefined}>{label}</th>)}</tr></thead><tbody>{rows.map(row => {
        const facts = combinedListFacts(row);
        return <tr key={row.id}>
          <td data-label={headings[0]}><strong>{row.combined_no || t("finance.taxInvoice.ui.draftReference", { reference: row.id.slice(0, 8).toUpperCase() })}</strong></td>
          <td data-label={headings[1]}>{facts?.customerName || t("finance.receipt.evidenceMissing")}</td>
          <td data-label={headings[2]}>{facts?.paymentReference || row.payment_id.slice(0, 8).toUpperCase()}</td>
          <td data-label={headings[3]}>{date(row.issue_date)}{facts?.receivedOn ? <small>{t("finance.receipt.receivedOn")}: {date(facts.receivedOn)}</small> : null}</td>
          <td data-label={headings[4]} className={styles.numeric}>{facts ? money(facts.settlement, facts.currency) : t("finance.receipt.evidenceMissing")}</td>
          <td data-label={headings[5]}><span className={styles.status}>{statuses[row.status] || t("finance.receipt.invalidStatus")}</span></td>
          <td data-label={headings[6]}><Link className={styles.button} href={`/finance/combined-documents/${row.id}`}>{t("finance.list.open")}</Link></td>
        </tr>;
      })}</tbody></table>}
    <div className={styles.pagination}><button type="button" className={styles.button} disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>{t("finance.receipt.previous")}</button><span>{t("finance.receipt.page", { page: page + 1 })}</span><button type="button" className={styles.button} disabled={loading || error || !hasNext} onClick={() => setPage(value => value + 1)}>{t("finance.receipt.next")}</button></div>
  </section>;
}
