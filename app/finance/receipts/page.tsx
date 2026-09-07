"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { ReceiptGuard } from "./access";
import { receiptDate, receiptMoney, receiptPresentation, receiptSearchFilter, receiptSelect, receiptStatusLabels, type FinanceReceipt, type ReceiptStatus } from "./shared";
import styles from "./receipts.module.css";

export default function ReceiptsPage() { return <ReceiptGuard>{() => <ReceiptList />}</ReceiptGuard>; }

function ReceiptList() {
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
      if (request === sequence.current) setError("โหลดรายการใบเสร็จรับเงินไม่สำเร็จ");
    } finally { if (request === sequence.current) setLoading(false); }
  }, [page, search, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  return <>
    <header className={styles.heading}><h1>ใบเสร็จรับเงิน</h1><button type="button" className={styles.button} disabled={loading} onClick={() => void load()}>โหลดข้อมูลล่าสุด</button></header>
    <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setSearch(query); setPage(0); }}>
      <label className={styles.label}>เลขที่ใบเสร็จ / อ้างอิงการรับชำระ / ลูกค้า<input type="search" maxLength={150} className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className={styles.label}>สถานะ<select className={styles.input} value={status} onChange={(event) => { setStatus(event.target.value as ReceiptStatus | ""); setPage(0); }}><option value="">ทั้งหมด</option>{Object.entries(receiptStatusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <button type="submit" className={styles.button}>ค้นหา</button>
    </form>
    {error ? <p role="alert" className={styles.error}>{error}</p> : loading ? <p role="status">กำลังโหลดใบเสร็จรับเงิน...</p> : !rows.length ? <p>ไม่พบใบเสร็จรับเงิน</p> : <table className={styles.table}>
      <thead><tr><th scope="col">ใบเสร็จรับเงิน</th><th scope="col">ลูกค้า / อ้างอิง</th><th scope="col">วันที่รับชำระ</th><th scope="col">สถานะ</th><th scope="col">ยอดชำระ</th></tr></thead>
      <tbody>{rows.map((row) => {
        const presentation = receiptPresentation(row);
        const document = presentation.ok ? presentation.value : null;
        return <tr key={row.id}>
          <td data-label="ใบเสร็จรับเงิน"><Link className={styles.link} href={`/finance/receipts/${row.id}`}>{document?.receipt.number || row.receipt_no || "ร่างใบเสร็จรับเงิน"}</Link></td>
          <td data-label="ลูกค้า / อ้างอิง">{document?.customer.name || "หลักฐานไม่ครบถ้วน"}<p className={styles.small}>{document?.payment.reference || row.payment_id}</p></td>
          <td data-label="วันที่รับชำระ">{document ? receiptDate(document.receipt.date) : "-"}</td>
          <td data-label="สถานะ">{receiptStatusLabels[row.status] || "สถานะไม่ถูกต้อง"}</td>
          <td data-label="ยอดชำระ">{document ? receiptMoney(document.payment.settlement, document.payment.currency) : "-"}</td>
        </tr>;
      })}</tbody>
    </table>}
    <div className={styles.pagination}><button type="button" className={styles.button} disabled={loading || page === 0} onClick={() => setPage((value) => value - 1)}>ก่อนหน้า</button><span>หน้า {page + 1}</span><button type="button" className={styles.button} disabled={loading || Boolean(error) || !hasNext} onClick={() => setPage((value) => value + 1)}>ถัดไป</button></div>
  </>;
}
