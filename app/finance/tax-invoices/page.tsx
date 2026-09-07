"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { TaxInvoiceGuard } from "./access";
import { taxDate, taxError, taxStatusLabels, type TaxInvoice } from "./shared";
import styles from "./tax-invoices.module.css";

export default function TaxInvoicesPage() { return <TaxInvoiceGuard>{() => <TaxList />}</TaxInvoiceGuard>; }
function TaxList() {
  const [rows, setRows] = useState<TaxInvoice[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    const query = supabase.from("finance_tax_invoices").select("id,status,tax_invoice_no,issue_date,created_at").order("created_at", { ascending: false }).limit(200);
    void (status ? query.eq("status", status) : query).then(result => {
      if (!active) return;
      setError(result.error ? taxError(result.error) : ""); setRows((result.data || []) as TaxInvoice[]); setLoading(false);
    });
    return () => { active = false; };
  }, [status]);
  return <><header className={styles.header}><h1>ใบกำกับภาษี</h1><label className={styles.field}>สถานะ<select className={styles.input} value={status} onChange={event => { setLoading(true); setStatus(event.target.value); }}><option value="">ทุกสถานะ</option>{Object.entries(taxStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></header>
    {loading ? <p role="status">กำลังโหลด...</p> : error ? <p role="alert" className={styles.error}>{error}</p> : rows.length ? <table className={styles.list}><thead><tr><th>ใบกำกับภาษี</th><th>วันที่ออก</th><th>สถานะ</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><Link href={`/finance/tax-invoices/${row.id}`}>{row.tax_invoice_no || `ร่าง ${row.id.slice(0, 8).toUpperCase()}`}</Link></td><td>{taxDate(row.issue_date)}</td><td>{taxStatusLabels[row.status]}</td></tr>)}</tbody></table> : <p>ยังไม่มีใบกำกับภาษี</p>}
  </>;
}
