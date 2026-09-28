"use client";
import { useCallback, useEffect, useState } from "react";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import { ParticipantPayment } from "../revenue-distribution/participant-payment";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { PageShell, Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";

type Row = { id: string; distribution_id: string; recipient_name: string; gross_amount: number; currency: string; status: string; paid_on: string | null };
type Legacy = { id: string; recipient_name: string; amount: number; payment_status: string; paid_at: string | null };
type Data = { access: { can_read: boolean; can_execute: boolean }; rows: Row[] };
function Payments() {
 const { locale } = useI18n(), th = locale === "th";
 const [data, setData] = useState<Data | null>(null), [legacy, setLegacy] = useState<Legacy[]>([]);
 const [offset, setOffset] = useState(0), [error, setError] = useState(false), [selected, setSelected] = useState<Row | null>(null);
 const load = useCallback(async () => {
  const [result, historical] = await Promise.all([supabase.rpc("get_finance_participant_payments", { p_offset: offset }), supabase.rpc("get_finance_own_legacy_compensation")]);
  if (result.error || historical.error || !Array.isArray(result.data?.rows) || !Array.isArray(historical.data)) { setData(null); setLegacy([]); setError(true); return; }
  setError(false); setData(result.data); setLegacy(historical.data);
 }, [offset]);
 useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
 const money = (amount: number, currency = "THB") => `${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 return <PageShell>
  <h1>{data?.access.can_execute ? (th ? "จ่ายส่วนแบ่ง" : "Participant payments") : (th ? "ส่วนแบ่งของฉัน" : "My compensation")}</h1>
  {error ? <Callout tone="negative">{th ? "ไม่สามารถอ่านข้อมูลตามสิทธิ์ กรุณาลองใหม่" : "Unable to load authorized records. Please retry."}</Callout> : !data ? <p role="status">{th ? "กำลังโหลด" : "Loading"}</p> : <>
   {!data.rows.length ? <p>{th ? "ไม่มีรายการ" : "No records"}</p> : <div style={{ overflowX: "auto", maxWidth: "100%" }}><table className={ui.table}>
    <thead><tr><th>{th ? "ผู้รับ" : "Recipient"}</th><th>{th ? "จำนวนเงิน" : "Amount"}</th><th>{th ? "สถานะ" : "Status"}</th><th>{th ? "การดำเนินการ" : "Action"}</th></tr></thead>
    <tbody>{data.rows.map(row => <tr key={row.id}><td>{row.recipient_name}</td><td>{money(row.gross_amount, row.currency)}</td><td>{row.status === "paid" ? (th ? "จ่ายแล้ว" : "Paid") : (th ? "รอจ่าย" : "Unpaid")}</td>
     <td>{data.access.can_execute && row.status === "open" ? <button className={ui.secondary} onClick={() => setSelected(row)}>{th ? "จ่ายส่วนแบ่ง" : "Pay participant"}</button> : row.paid_on || "—"}</td></tr>)}</tbody>
   </table></div>}
   <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}><button className={ui.secondary} disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>{th ? "ก่อนหน้า" : "Previous"}</button><button className={ui.secondary} disabled={data.rows.length < 50} onClick={() => setOffset(n => n + 50)}>{th ? "ถัดไป" : "Next"}</button></div>
   {legacy.length > 0 && <section><h2>{th ? "ส่วนแบ่งของฉันจากระบบเดิม" : "My historical compensation"}</h2><ul>{legacy.map(row => <li key={row.id}>{row.recipient_name} · {money(row.amount)} · {row.payment_status === "paid" ? (th ? "จ่ายแล้ว" : "Paid") : (th ? "รอจ่าย" : "Unpaid")}</li>)}</ul></section>}
  </>}
  {selected && <ParticipantPayment distributionId={selected.distribution_id} entitlementId={selected.id} onClose={() => setSelected(null)} onPaid={async () => { setSelected(null); await load(); }} />}
 </PageShell>;
}
export default function ParticipantPaymentsPage() {
 return <QuotationGuard canAccess={a => a.permissions.canViewOwnCompensation}>{a => <><FinanceSubNav activePage="participant-payments" permissions={a.permissions} /><Payments /></>}</QuotationGuard>;
}
