"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DetailModal from "../../components/DetailModal";
import { supabase } from "../../../lib/supabase";
import { money, safeInvoiceError, type FinanceInvoice } from "./shared";
import styles from "./invoice-workspace.module.css";

type Charge = {
  id: string; client_id: string; case_id: number | null; advisory_matter_id: string | null;
  source_type: string; description: string | null; quantity: number | string; unit: string | null;
  currency: string; service_date: string | null; economic_classification: string | null;
  price_tax_mode: string; vat_rate: number | string; amount_before_vat: number | string;
  vat_amount: number | string; total_amount: number | string; status: string; source_reference: string | null;
};
type Allocation = { billable_charge_id: string; status: string };
type AuditEvent = { id: string; event_type: string; actor_name: string | null; actor_email: string | null; created_at: string };
type ReplaceAttempt = { fingerprint: string; requestId: string };

export default function InvoiceCompositionEditor({ invoice, canManage, onChanged }: { invoice: FinanceInvoice; canManage: boolean; onChanged: () => Promise<void> }) {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [baseline, setBaseline] = useState("");
  const [detailId, setDetailId] = useState("");
  const [detailAudits, setDetailAudits] = useState<AuditEvent[]>([]);
  const [detailAuditLoading, setDetailAuditLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const attemptRef = useRef<ReplaceAttempt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [chargeResult, allocationResult] = await Promise.all([
      supabase.from("finance_billable_charges").select("id,client_id,case_id,advisory_matter_id,source_type,description,quantity,unit,currency,service_date,economic_classification,price_tax_mode,vat_rate,amount_before_vat,vat_amount,total_amount,status,source_reference").eq("client_id", invoice.client_id).order("service_date"),
      supabase.from("finance_invoice_charge_allocations").select("billable_charge_id,status").eq("invoice_id", invoice.id),
    ]);
    if (chargeResult.error || allocationResult.error) {
      console.error("LOAD INVOICE COMPOSITION EDITOR FAILED", { charge: chargeResult.error, allocation: allocationResult.error });
      setError("โหลดรายการสำหรับแก้ไขร่างไม่สำเร็จ");
    } else {
      const nextCharges = (chargeResult.data || []) as Charge[];
      const nextAllocations = (allocationResult.data || []) as Allocation[];
      const chargeMap = new Map(nextCharges.map((row) => [row.id, row]));
      const nextSelected = nextAllocations.filter((row) => row.status === "reserved" && chargeMap.get(row.billable_charge_id)?.source_type !== "billing_installment_item").map((row) => row.billable_charge_id).sort();
      setCharges(nextCharges); setAllocations(nextAllocations); setSelectedIds(nextSelected); setBaseline(JSON.stringify(nextSelected));
    }
    setLoading(false);
  }, [invoice.client_id, invoice.id]);

  useEffect(() => { void load(); }, [load]);

  const allocationIds = useMemo(() => new Set(allocations.filter((row) => row.status === "reserved").map((row) => row.billable_charge_id)), [allocations]);
  const fixedCharges = charges.filter((row) => allocationIds.has(row.id) && row.source_type === "billing_installment_item");
  const availableCharges = charges.filter((row) => row.source_type !== "billing_installment_item" && (row.status === "ready_to_invoice" || allocationIds.has(row.id)) && exactContext(row, invoice));
  const selectedCharges = availableCharges.filter((row) => selectedIds.includes(row.id));
  const detail = charges.find((row) => row.id === detailId) || null;
  const currentFingerprint = JSON.stringify([...selectedIds].sort());
  const dirty = currentFingerprint !== baseline;
  const totals = [...fixedCharges, ...selectedCharges].reduce((sum, row) => ({ before: sum.before + Number(row.amount_before_vat), vat: sum.vat + Number(row.vat_amount), total: sum.total + Number(row.total_amount) }), { before: 0, vat: 0, total: 0 });

  const toggle = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    setConfirmed(false); setMessage(""); setError(""); attemptRef.current = null;
  };
  const openDetail = async (id: string) => {
    setDetailId(id); setDetailAudits([]); setDetailAuditLoading(true);
    const result = await supabase.from("finance_billable_charge_audit_events").select("id,event_type,actor_name,actor_email,created_at").eq("charge_id", id).order("created_at");
    if (result.error) console.error("LOAD INVOICE COMPOSITION CHARGE AUDIT FAILED", result.error);
    setDetailAudits((result.data || []) as AuditEvent[]); setDetailAuditLoading(false);
  };
  const closeDetail = () => { setDetailId(""); setDetailAudits([]); setDetailAuditLoading(false); };

  const save = async () => {
    if (!canManage || !dirty || !confirmed || saving || lock.current) return;
    if (!invoice.v2_bridge_id && selectedIds.length === 0) { setError("ใบแจ้งหนี้จากรายการเรียกเก็บต้องมีอย่างน้อยหนึ่งรายการ"); return; }
    if (!attemptRef.current || attemptRef.current.fingerprint !== currentFingerprint) attemptRef.current = { fingerprint: currentFingerprint, requestId: crypto.randomUUID() };
    lock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("replace_finance_invoice_v2_draft_charges", { p_invoice_id: invoice.id, p_request_id: attemptRef.current.requestId, p_charge_ids: selectedIds, p_human_confirmed: true });
      if (result.error) throw result.error;
      await onChanged(); await load();
      setConfirmed(false); setMessage("บันทึกรายการในใบแจ้งหนี้แล้ว");
    } catch (replaceError) {
      console.error("REPLACE INVOICE COMPOSITION FAILED", replaceError);
      setError(safeInvoiceError(replaceError, "แก้ไขรายการในใบแจ้งหนี้ไม่สำเร็จ"));
      await load();
    } finally { lock.current = false; setSaving(false); }
  };

  return <section className={styles.surface}>
    <div className={styles.sectionHeader}><div><h2>แก้ไขรายการในใบแจ้งหนี้</h2><p>เพิ่มหรือนำรายการพร้อมเรียกเก็บออกได้ทั้งรายการ ยอดเงินของแต่ละรายการแก้ไขจากหน้านี้ไม่ได้</p></div></div>
    {error ? <div className={styles.error}>{error}</div> : null}{message ? <div className={styles.notice}>{message}</div> : null}
    {loading ? <div className={styles.loading}>กำลังโหลดรายการ...</div> : <>
      {fixedCharges.length ? <div className={styles.notice}><strong>ค่าวิชาชีพจากงวดตามแผน</strong><div>รายการกลุ่มนี้เป็นยอดต้นทางแบบคงที่และไม่สามารถนำออกบางส่วนได้</div>{fixedCharges.map((row) => <div key={row.id} className={styles.summaryLine}><span>{row.description}</span><strong>{money(row.total_amount, row.currency)}</strong></div>)}</div> : null}
      <div className={styles.choiceList}>{availableCharges.map((charge) => <div key={charge.id} className={`${styles.chargeChoice} ${selectedIds.includes(charge.id) ? styles.choiceSelected : ""}`}><input type="checkbox" disabled={!canManage} checked={selectedIds.includes(charge.id)} onChange={() => toggle(charge.id)} /><div className={styles.choiceBody}><strong>{charge.description || "รายการรอเรียกเก็บ"}</strong><div className={styles.chargeMeta}><span>{charge.service_date || "ไม่ระบุวันที่"}</span><span>{classificationLabel(charge.economic_classification)}</span><span>{taxLabel(charge)}</span><span className={styles.readyText}>{selectedIds.includes(charge.id) ? "อยู่ในร่างนี้" : "พร้อมออกใบแจ้งหนี้"}</span></div><div className={styles.chargeMeta}><span>ก่อน VAT {money(charge.amount_before_vat, charge.currency)}</span><span>VAT {money(charge.vat_amount, charge.currency)}</span></div><button className={styles.detailButton} type="button" onClick={() => void openDetail(charge.id)}>ดูรายละเอียด</button></div><strong className={styles.choiceAmount}>{money(charge.total_amount, charge.currency)}</strong></div>)}</div>
      {!availableCharges.length ? <div className={styles.empty}>ไม่มีรายการอื่นที่เข้ากับลูกค้า สกุลเงิน และคดี/งานของใบแจ้งหนี้นี้</div> : null}
      <dl className={styles.summaryTotals}><div><dt>ยอดก่อน VAT</dt><dd>{money(totals.before, invoice.currency)}</dd></div><div><dt>VAT</dt><dd>{money(totals.vat, invoice.currency)}</dd></div><div className={styles.grandTotal}><dt>ยอดรวมหลังแก้ไข</dt><dd>{money(totals.total, invoice.currency)}</dd></div></dl>
      {dirty ? <><label className={styles.checkRow}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>ยืนยันว่าต้องการเปลี่ยนรายการในร่างใบแจ้งหนี้ตามที่เลือก</span></label><div className={styles.reviewActions}><button className={styles.primaryButton} type="button" disabled={!confirmed || saving || !canManage} onClick={() => void save()}>{saving ? "กำลังบันทึก..." : "บันทึกรายการในใบแจ้งหนี้"}</button></div></> : <div className={styles.notice}>รายการในร่างตรงกับข้อมูลที่บันทึกแล้ว</div>}
      {!canManage ? <p className={styles.fieldError}>คุณไม่มีสิทธิ์แก้ไของค์ประกอบของใบแจ้งหนี้นี้</p> : null}
    </>}
    {detail ? <DetailModal open title={detail.description || "รายการรอเรียกเก็บ"} subtitle={detail.source_reference || undefined} prominentValue={money(detail.total_amount, detail.currency)} onClose={closeDetail}><div className={styles.modalContent}><dl className={styles.modalGrid}><Detail label="สถานะ" value={selectedIds.includes(detail.id) ? "อยู่ในร่างนี้" : "พร้อมออกใบแจ้งหนี้"} /><Detail label="วันที่" value={detail.service_date || "ไม่ระบุวันที่"} /><Detail label="ยอดก่อน VAT" value={money(detail.amount_before_vat, detail.currency)} /><Detail label="VAT" value={money(detail.vat_amount, detail.currency)} /><Detail label="ยอดรวม" value={money(detail.total_amount, detail.currency)} /><Detail label="จำนวน/หน่วย" value={`${detail.quantity} ${detail.unit || "หน่วย"}`} /><Detail label="ประเภทของยอด" value={classificationLabel(detail.economic_classification)} /></dl><ChargeAuditHistory audits={detailAudits} loading={detailAuditLoading} /></div></DetailModal> : null}
  </section>;
}

function exactContext(charge: Charge, invoice: FinanceInvoice) { return charge.currency === invoice.currency && charge.case_id === invoice.case_id && charge.advisory_matter_id === invoice.advisory_matter_id; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function ChargeAuditHistory({ audits, loading }: { audits: AuditEvent[]; loading: boolean }) { return <details className={styles.auditDetails}><summary>ประวัติรายการ</summary>{loading ? <p>กำลังโหลดประวัติรายการ...</p> : audits.length ? <ol>{audits.map((event) => <li key={event.id}><div><strong>{auditLabel(event.event_type)}</strong><span>{event.actor_name || event.actor_email || "ผู้ใช้งานระบบ"}</span></div><time>{thaiDateTime(event.created_at)}</time></li>)}</ol> : <p>ยังไม่พบประวัติรายการ</p>}</details>; }
function classificationLabel(value: string | null) { const labels: Record<string, string> = { professional_fee: "ค่าวิชาชีพ", additional_service: "ค่าบริการเพิ่มเติม", reimbursable_expense: "ค่าใช้จ่ายเรียกคืน", government_or_court_fee: "ค่าธรรมเนียมศาล / หน่วยงานรัฐ", other: "อื่น ๆ" }; return value ? labels[value] || value : "ยังไม่ระบุ"; }
function taxLabel(charge: Charge) { return charge.price_tax_mode === "non_vat" ? "ไม่มี VAT" : charge.price_tax_mode === "vat_inclusive" ? `รวม VAT ${Number(charge.vat_rate)}% แล้ว` : `VAT ${Number(charge.vat_rate)}%`; }
function thaiDateTime(value: string) { return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)); }
function auditLabel(value: string) { return value === "created" ? "สร้างร่างรายการ" : value === "draft_saved" ? "บันทึกร่าง" : value === "marked_ready" ? "ยืนยันพร้อมออกใบแจ้งหนี้" : value === "cancelled" ? "ยกเลิกรายการ" : value; }
