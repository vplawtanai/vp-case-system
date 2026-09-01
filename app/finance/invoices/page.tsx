"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QuotationGuard } from "../quotations/shared";
import { supabase } from "../../../lib/supabase";
import type { UserPermissions } from "../../../lib/permissions";
import FinanceSubNav from "../FinanceSubNav";
import { formatBangkokDateTime, invoiceStatusLabels, money } from "./shared";
import styles from "./invoice-workspace.module.css";

type InvoiceListRow = {
  id: string;
  invoice_no: string | null;
  document_status: string;
  source_model: "installment_v1" | "billable_charge_v2";
  v2_bridge_id: string | null;
  customer_name: string | null;
  currency: string;
  total_amount: number | string;
  created_at: string;
};

export default function InvoiceListPage() {
  return <QuotationGuard>{(access) => <InvoiceListWorkspace permissions={access.permissions} />}</QuotationGuard>;
}

function InvoiceListWorkspace({ permissions }: { permissions: UserPermissions }) {
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canCompose = permissions.canEditFinanceQuotation && permissions.canManageFinanceBillableCharges;

  const load = useCallback(async () => {
    setLoading(true);
    const result = await supabase.from("finance_invoices").select("id,invoice_no,document_status,source_model,v2_bridge_id,customer_name,currency,total_amount,created_at").order("created_at", { ascending: false });
    if (result.error) {
      console.error("LOAD INVOICE WORKSPACE FAILED", result.error);
      setError("โหลดรายการใบแจ้งหนี้ไม่สำเร็จ");
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
      <div><span className={styles.eyebrow}>FINANCE</span><h1>ใบแจ้งหนี้</h1><p>ตรวจสอบร่าง เอกสารที่ออกแล้ว สถานะการรับชำระ และใบแจ้งหนี้ที่เก็บไว้เป็นประวัติ</p></div>
      {canCompose ? <Link className={styles.primaryButton} href="/finance/invoices/compose">สร้างใบแจ้งหนี้</Link> : null}
    </header>
    {error ? <div className={styles.error}>{error}</div> : null}
    <section className={styles.surface}>
      {loading ? <div className={styles.loading}>กำลังโหลดใบแจ้งหนี้...</div> : null}
      {!loading && !rows.length ? <div className={styles.empty}>ยังไม่มีใบแจ้งหนี้</div> : null}
      {!loading && rows.length ? <div className={styles.invoiceList}>{rows.map((invoice) => <article key={invoice.id} className={styles.invoiceRow}>
        <div className={styles.invoiceIdentity}><strong>{invoice.invoice_no || `ร่าง ${invoice.id.slice(0, 8).toUpperCase()}`}</strong><small>{formatBangkokDateTime(invoice.created_at)}</small></div>
        <div className={styles.invoiceCell}><span>ลูกค้า</span><strong>{invoice.customer_name || "-"}</strong></div>
        <div className={styles.invoiceCell}><span>ที่มา</span><strong>{sourceLabel(invoice)}</strong></div>
        <div className={styles.invoiceCell}><span>ยอดรวม</span><strong>{money(invoice.total_amount, invoice.currency)}</strong><span className={styles.status}>{invoiceStatusLabels[invoice.document_status] || invoice.document_status}</span></div>
        <Link className={styles.detailButton} href={`/finance/invoices/${invoice.id}`}>เปิดใบแจ้งหนี้</Link>
      </article>)}</div> : null}
    </section>
  </div>;
}

function sourceLabel(invoice: InvoiceListRow) {
  if (invoice.source_model !== "billable_charge_v2") return "ตามแผนเรียกเก็บ";
  return invoice.v2_bridge_id ? "แบบรวมรายการ" : "จากรายการเรียกเก็บ";
}
