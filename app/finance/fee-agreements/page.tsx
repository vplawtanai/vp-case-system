"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FinanceSubNav, QuotationGuard } from "../quotations/shared";
import { supabase } from "../../../lib/supabase";

type Json = Record<string, unknown>;
type Agreement = {
  id: string; agreement_no: string | null; title: string; status: string; language_code: string | null;
  effective_date: string | null; updated_at: string; source_quotation_id: string | null; source_reference: string | null;
  client_snapshot_json: Json | null; matter_snapshot_json: Json | null; source_document_snapshot_json: Json | null;
};

const statusLabel: Record<string, string> = {
  draft: "Draft / ร่าง", under_review: "Under Review / ตรวจทาน", sent: "Sent / ส่งแล้ว",
  signed: "Signed / ลงนามแล้ว", completed: "Completed / เสร็จสมบูรณ์",
  cancelled: "Cancelled / ยกเลิก", active: "Active / Legacy",
};
const value = (input: unknown, fallback = "-") => typeof input === "string" && input.trim() ? input : fallback;
const date = (input: string | null) => input ? input.slice(0, 10) : "-";
const snapshotText = (snapshot: Json | null, ...keys: string[]) => keys.map((key) => value(snapshot?.[key], "")).find(Boolean) || "-";

export default function FeeAgreementsPage() {
  return <QuotationGuard>{(access) => <FeeAgreementList permissions={access.permissions} />}</QuotationGuard>;
}

function FeeAgreementList({ permissions }: { permissions: Parameters<typeof FinanceSubNav>[0]["permissions"] }) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const result = await supabase.from("finance_fee_agreements")
      .select("id,agreement_no,title,status,language_code,effective_date,updated_at,source_quotation_id,source_reference,client_snapshot_json,matter_snapshot_json,source_document_snapshot_json")
      .order("updated_at", { ascending: false });
    if (result.error) setError("ไม่สามารถโหลดรายการข้อตกลงค่าบริการได้");
    else setAgreements((result.data || []) as Agreement[]);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const filtered = useMemo(() => agreements.filter((agreement) => {
    const source = agreement.source_document_snapshot_json || {};
    const haystack = [agreement.agreement_no, agreement.title, agreement.status, snapshotText(agreement.client_snapshot_json, "name", "display_name"), snapshotText(agreement.matter_snapshot_json, "title", "file_no", "matter_no"), value(source.quotation_no, ""), agreement.source_reference]
      .join(" ").toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && (status === "all" || agreement.status === status);
  }), [agreements, search, status]);

  return <main style={pageStyle}>
    <FinanceSubNav activePage="fee-agreements" permissions={permissions} />
    <div style={headerStyle}><div><h1 style={{ margin: 0 }}>สัญญาว่าจ้าง</h1><p style={muted}>ข้อตกลงค่าบริการจากใบเสนอราคาที่ได้รับการตอบรับแล้ว</p></div></div>
    <div style={filterStyle}>
      <input style={inputStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาเลขที่ข้อตกลง ลูกค้า หรือใบเสนอราคา" />
      <select style={selectStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="all">ทุกสถานะ</option>{["draft", "under_review", "sent", "signed", "completed", "cancelled", "active"].map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}
      </select>
    </div>
    {loading ? <p>กำลังโหลดสัญญาว่าจ้าง...</p> : error ? <div style={warning}>{error}</div> : filtered.length === 0 ? <div style={emptyStyle}>ยังไม่มีสัญญาว่าจ้างที่ตรงกับเงื่อนไข</div> : <div style={tableWrap}><table style={tableStyle}><thead><tr><th>เลขที่สัญญา</th><th>ลูกค้า / เรื่องหรือคดี</th><th>ใบเสนอราคาต้นทาง</th><th>สถานะ</th><th>ภาษา</th><th>วันที่มีผล</th><th>แก้ไขล่าสุด</th><th>การดำเนินการ</th></tr></thead><tbody>{filtered.map((agreement) => {
      const source = agreement.source_document_snapshot_json || {};
      const quotationNo = value(source.quotation_no, agreement.source_reference || "-");
      const title = /^Fee Agreement\s*-\s*/i.test(agreement.title || "") ? "สัญญาว่าจ้างให้บริการทางกฎหมาย" : agreement.title;
      return <tr key={agreement.id}><td><strong>{agreement.agreement_no || "ยังไม่มีเลขที่สัญญา"}</strong><br /><span style={muted}>{title}</span></td><td>{snapshotText(agreement.client_snapshot_json, "name", "display_name")}<br /><span style={muted}>{snapshotText(agreement.matter_snapshot_json, "title", "file_no", "matter_no")}</span></td><td>{quotationNo}</td><td><StatusBadge status={agreement.status} /></td><td>{agreement.language_code === "en" ? "English" : "ไทย"}</td><td>{date(agreement.effective_date)}</td><td>{date(agreement.updated_at)}</td><td><Link href={`/finance/fee-agreements/${agreement.id}`}>เปิด</Link></td></tr>;
    })}</tbody></table></div>}
  </main>;
}

function StatusBadge({ status }: { status: string }) { return <span style={{ ...badgeStyle, ...(badgeColors[status] || {}) }}>{statusLabel[status] || status}</span>; }
const pageStyle = { maxWidth: 1180, margin: "0 auto", padding: 24 };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", margin: "18px 0" };
const filterStyle = { display: "flex", gap: 10, flexWrap: "wrap" as const, marginBottom: 16 };
const inputStyle = { flex: "1 1 300px", minWidth: 0, boxSizing: "border-box" as const, border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px" };
const selectStyle = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px", background: "#fff" };
const tableWrap = { overflowX: "auto" as const, border: "1px solid #e5e7eb", borderRadius: 8 };
const tableStyle = { width: "100%", minWidth: 980, borderCollapse: "collapse" as const };
const muted = { color: "#64748b", fontSize: 13 };
const warning = { background: "#fff7ed", color: "#9a3412", padding: 12, borderRadius: 6 };
const emptyStyle = { border: "1px dashed #cbd5e1", borderRadius: 8, padding: 24, color: "#64748b" };
const badgeStyle = { display: "inline-block", padding: "3px 8px", borderRadius: 999, fontSize: 12, whiteSpace: "nowrap" as const };
const badgeColors: Record<string, Record<string, string>> = { draft: { background: "#e5e7eb", color: "#374151" }, under_review: { background: "#fef3c7", color: "#92400e" }, sent: { background: "#dbeafe", color: "#1d4ed8" }, signed: { background: "#dcfce7", color: "#166534" }, completed: { background: "#e0e7ff", color: "#3730a3" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, active: { background: "#f3f4f6", color: "#4b5563" } };
