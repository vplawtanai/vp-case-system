"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useReceiptAccess } from "./use-receipt-access";
import { paymentReceiptAction, receiptRpc, receiptStatusLabels, safeReceiptError, type FinanceReceipt } from "./shared";
import styles from "./receipts.module.css";

export function PaymentReceiptNextAction({ paymentId, paymentStatus }: { paymentId: string; paymentStatus: string }) {
  const access = useReceiptAccess();
  const router = useRouter();
  const [receipts, setReceipts] = useState<Pick<FinanceReceipt, "id" | "status" | "receipt_no">[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const lock = useRef(false);
  const canView = access.permissions?.canViewFinanceReceipts === true;
  const canManage = access.permissions?.canManageFinanceReceipts === true;
  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true); setReceipts(null); setError(""); setOpen(false); setChecked(false);
    try {
      const result = await supabase.from("finance_receipts").select("id,status,receipt_no").eq("payment_id", paymentId).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      setReceipts(result.data as Pick<FinanceReceipt, "id" | "status" | "receipt_no">[]);
    } catch { setError("โหลดสถานะใบเสร็จไม่สำเร็จ จึงยังจัดทำใบเสร็จใหม่ไม่ได้"); }
    finally { setLoading(false); }
  }, [canView, paymentId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const action = paymentReceiptAction(paymentStatus, receipts, canView, canManage);
  async function create() {
    if (lock.current || !checked || action.kind !== "create") return;
    lock.current = true; setBusy(true); setError("");
    try {
      const rpc = receiptRpc({ kind: "create", paymentId, externalReceiptChecked: checked });
      const result = await supabase.rpc(rpc.name, rpc.args);
      if (result.error || typeof result.data !== "string" || !result.data) throw result.error || new Error("Missing receipt ID");
      router.push(`/finance/receipts/${encodeURIComponent(result.data)}`);
      await load();
    } catch (cause) {
      await load();
      setError(safeReceiptError(cause));
    } finally { lock.current = false; setBusy(false); }
  }
  if (access.loading) return <p role="status">กำลังตรวจสอบสิทธิ์ใบเสร็จ...</p>;
  if (access.error) return <div role="alert" className={styles.error}>{access.error} <button type="button" className={styles.button} onClick={() => void access.reload()}>ลองอีกครั้ง</button></div>;
  if (!canView) return null;
  return <section className={styles.nextAction} aria-label="ขั้นตอนถัดไป: ใบเสร็จรับเงิน">
    <h2>ใบเสร็จรับเงิน</h2>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {loading ? <p role="status">กำลังโหลดสถานะใบเสร็จ...</p> : action.kind === "open" ? <Link className={styles.primary} href={`/finance/receipts/${action.id}`}>{action.label}</Link> : action.kind === "create" ? <button className={styles.primary} type="button" disabled={busy} onClick={() => setOpen(true)}>{action.label}</button> : action.kind === "conflict" ? <p role="alert">พบใบเสร็จที่ใช้งานอยู่มากกว่าหนึ่งฉบับ กรุณาติดต่อผู้ดูแล</p> : action.kind === "unavailable" ? <button type="button" className={styles.button} disabled={busy} onClick={() => void load()}>โหลดข้อมูลล่าสุด</button> : <p>ยังไม่มีใบเสร็จรับเงิน</p>}
    {open && action.kind === "create" ? <div className={styles.confirmation}>
      <label className={styles.check}><input type="checkbox" checked={checked} disabled={busy} onChange={(event) => setChecked(event.target.checked)} />ตรวจสอบแล้วว่าไม่มีใบเสร็จภายนอกหรือใบเสร็จที่ออกด้วยมือซ้ำสำหรับรายการรับชำระนี้</label>
      <div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={() => { setOpen(false); setChecked(false); }}>ปิด</button><button type="button" className={styles.primary} disabled={!checked || busy} onClick={() => void create()}>{busy ? "กำลังจัดทำ..." : "ยืนยันจัดทำร่าง"}</button></div>
    </div> : null}
    {receipts?.some((row) => row.status === "voided" || row.status === "cancelled") ? <div className={styles.section}><h3>ประวัติใบเสร็จรับเงิน</h3>{receipts.filter((row) => row.status === "voided" || row.status === "cancelled").map((row) => <p key={row.id}><Link className={styles.link} href={`/finance/receipts/${row.id}`}>{row.receipt_no || "ร่างใบเสร็จรับเงิน"}</Link> <span className={styles.small}>{receiptStatusLabels[row.status]}</span></p>)}</div> : null}
  </section>;
}
