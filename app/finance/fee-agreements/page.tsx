"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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

    <header style={headerStyle}>
      <h1 style={pageTitle}>สัญญาว่าจ้าง</h1>
      <p style={pageSubtitle}>ข้อตกลงค่าบริการจากใบเสนอราคาที่ได้รับการตอบรับแล้ว</p>
    </header>

    <section className="fee-agreement-filter-toolbar" style={filterStyle} aria-label="ค้นหาและกรองสัญญาว่าจ้าง">
      <label style={filterField}>
        <span style={filterLabel}>ค้นหา</span>
        <span style={searchControl}>
          <ListIcon name="search" />
          <input className="fee-agreement-filter-control" aria-label="ค้นหาสัญญาว่าจ้าง" style={inputStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาเลขที่ข้อตกลง ลูกค้า หรือใบเสนอราคา" />
        </span>
      </label>
      <label style={filterField}>
        <span style={filterLabel}>สถานะ</span>
        <select className="fee-agreement-filter-control" style={selectStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">ทุกสถานะ</option>{["draft", "under_review", "sent", "signed", "completed", "cancelled", "active"].map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}
        </select>
      </label>
    </section>

    {!loading && !error ? <div style={listMeta} aria-live="polite">แสดง {filtered.length} จาก {agreements.length} รายการ</div> : null}

    {loading ? <div style={loadingStyle}>กำลังโหลดสัญญาว่าจ้าง...</div> : error ? <div style={warning}>{error}</div> : filtered.length === 0 ? <div style={emptyStyle}>ยังไม่มีสัญญาว่าจ้างที่ตรงกับเงื่อนไข</div> : <div className="fee-agreement-list-table-wrap" style={tableWrap}><table className="fee-agreement-list-table" style={tableStyle}>
      <colgroup>
        <col style={{ width: 190 }} /><col style={{ width: 220 }} /><col style={{ width: 155 }} /><col style={{ width: 150 }} />
        <col style={{ width: 78 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 86 }} />
      </colgroup>
      <thead><tr><th>เลขที่สัญญา</th><th>ลูกค้า / เรื่องหรือคดี</th><th>ใบเสนอราคาต้นทาง</th><th>สถานะ</th><th>ภาษา</th><th>วันที่มีผล</th><th>แก้ไขล่าสุด</th><th>ดำเนินการ</th></tr></thead>
      <tbody>{filtered.map((agreement) => {
        const source = agreement.source_document_snapshot_json || {};
        const quotationNo = value(source.quotation_no, agreement.source_reference || "-");
        const title = /^Fee Agreement\s*-\s*/i.test(agreement.title || "") ? "สัญญาว่าจ้างให้บริการทางกฎหมาย" : agreement.title;
        const client = snapshotText(agreement.client_snapshot_json, "name", "display_name");
        const matter = snapshotText(agreement.matter_snapshot_json, "title", "file_no", "matter_no");
        return <tr key={agreement.id}>
          <td><div style={cellStack}><strong style={agreementNumber}>{agreement.agreement_no || "ยังไม่มีเลขที่สัญญา"}</strong><span style={secondaryText}>{title}</span></div></td>
          <td><div style={cellStack}><strong style={primaryText}>{client}</strong><span style={secondaryText}>{matter}</span></div></td>
          <td>{agreement.source_quotation_id ? <Link className="fee-agreement-source-link" style={sourceLink} href={`/finance/quotations/${agreement.source_quotation_id}`}>{quotationNo}</Link> : <span style={primaryText}>{quotationNo}</span>}</td>
          <td><StatusBadge status={agreement.status} /></td>
          <td style={conciseCell}>{agreement.language_code === "en" ? "English" : "ไทย"}</td>
          <td style={dateCell}>{date(agreement.effective_date)}</td>
          <td style={dateCell}>{date(agreement.updated_at)}</td>
          <td><Link className="fee-agreement-open-link" style={openLink} href={`/finance/fee-agreements/${agreement.id}`}>เปิด<ListIcon name="open" /></Link></td>
        </tr>;
      })}</tbody>
    </table></div>}

    <style jsx global>{`
      .fee-agreement-list-table th,
      .fee-agreement-list-table td {
        box-sizing: border-box;
        padding: 14px 12px;
        border-bottom: 1px solid #e8edf3;
        text-align: left;
        vertical-align: middle;
      }
      .fee-agreement-list-table th {
        background: #f8fafc;
        color: #475569;
        font-size: 12px;
        font-weight: 750;
        white-space: nowrap;
      }
      .fee-agreement-list-table tbody tr { transition: background-color 150ms ease; }
      .fee-agreement-list-table tbody tr:hover { background: #f8fafc; }
      .fee-agreement-list-table tbody tr:last-child td { border-bottom: 0; }
      .fee-agreement-list-table th:last-child,
      .fee-agreement-list-table td:last-child {
        position: sticky;
        right: 0;
        z-index: 1;
        background: #ffffff;
        box-shadow: -8px 0 12px -12px rgba(15, 23, 42, .45);
      }
      .fee-agreement-list-table th:last-child { z-index: 2; background: #f8fafc; }
      .fee-agreement-list-table tbody tr:hover td:last-child { background: #f8fafc; }
      .fee-agreement-source-link:hover { color: #312e81 !important; text-decoration: underline !important; }
      .fee-agreement-open-link:hover { background: #eef2ff !important; border-color: #a5b4fc !important; color: #312e81 !important; }
      .fee-agreement-source-link:focus-visible,
      .fee-agreement-open-link:focus-visible,
      .fee-agreement-filter-control:focus-visible { outline: 3px solid rgba(79, 70, 229, .22); outline-offset: 2px; }
      @media (max-width: 720px) {
        .fee-agreement-filter-toolbar { grid-template-columns: minmax(0, 1fr) !important; }
      }
    `}</style>
  </main>;
}

function StatusBadge({ status }: { status: string }) { return <span style={{ ...badgeStyle, ...(badgeColors[status] || {}) }}>{statusLabel[status] || status}</span>; }
function ListIcon({ name }: { name: "search" | "open" }) { const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }; if (name === "search") return <svg {...common} style={searchIcon}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>; return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>; }

const pageStyle: CSSProperties = { width: "100%", minWidth: 0 };
const headerStyle: CSSProperties = { margin: "24px 0 18px" };
const pageTitle: CSSProperties = { margin: 0, color: "#172033", fontSize: 28, lineHeight: 1.25 };
const pageSubtitle: CSSProperties = { margin: "7px 0 0", color: "#64748b", fontSize: 14, lineHeight: 1.5 };
const filterStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(190px,220px)", gap: 12, alignItems: "end", padding: 14, marginBottom: 12, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", boxShadow: "0 1px 2px rgba(15,23,42,.04)" };
const filterField: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const filterLabel: CSSProperties = { color: "#475569", fontSize: 12, fontWeight: 700 };
const searchControl: CSSProperties = { position: "relative", display: "block", minWidth: 0 };
const searchIcon: CSSProperties = { position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#64748b", pointerEvents: "none" };
const inputStyle: CSSProperties = { width: "100%", height: 42, minWidth: 0, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 12px 9px 38px", background: "#fff", color: "#172033", font: "inherit" };
const selectStyle: CSSProperties = { width: "100%", height: 42, minWidth: 0, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px", background: "#fff", color: "#172033", font: "inherit" };
const listMeta: CSSProperties = { margin: "0 2px 8px", color: "#64748b", fontSize: 12, textAlign: "right" };
const tableWrap: CSSProperties = { width: "100%", minWidth: 0, overflowX: "auto", border: "1px solid #dfe5ec", borderRadius: 8, background: "#fff", boxShadow: "0 1px 3px rgba(15,23,42,.05)" };
const tableStyle: CSSProperties = { width: "100%", minWidth: 1099, borderCollapse: "separate", borderSpacing: 0, color: "#334155", fontSize: 13 };
const cellStack: CSSProperties = { display: "grid", gap: 4, minWidth: 0 };
const primaryText: CSSProperties = { color: "#1e293b", fontWeight: 650 };
const agreementNumber: CSSProperties = { color: "#172033", fontSize: 14, fontWeight: 750 };
const secondaryText: CSSProperties = { color: "#64748b", fontSize: 12, lineHeight: 1.4, overflowWrap: "anywhere" };
const sourceLink: CSSProperties = { color: "#4338ca", fontWeight: 700, textDecoration: "none" };
const conciseCell: CSSProperties = { whiteSpace: "nowrap", color: "#475569" };
const dateCell: CSSProperties = { whiteSpace: "nowrap", color: "#475569", fontVariantNumeric: "tabular-nums" };
const openLink: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 34, boxSizing: "border-box", padding: "7px 10px", border: "1px solid #c7d2fe", borderRadius: 6, background: "#fff", color: "#4338ca", fontWeight: 700, textDecoration: "none", transition: "background-color 150ms ease,border-color 150ms ease,color 150ms ease" };
const loadingStyle: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, background: "#fff", color: "#64748b" };
const warning: CSSProperties = { background: "#fff7ed", color: "#9a3412", padding: 12, borderRadius: 6 };
const emptyStyle: CSSProperties = { border: "1px dashed #cbd5e1", borderRadius: 8, padding: 28, background: "#f8fafc", color: "#64748b", textAlign: "center" };
const badgeStyle: CSSProperties = { display: "inline-block", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap" };
const badgeColors: Record<string, CSSProperties> = { draft: { background: "#e5e7eb", color: "#374151" }, under_review: { background: "#e0e7ff", color: "#3730a3" }, sent: { background: "#fef3c7", color: "#92400e" }, signed: { background: "#dcfce7", color: "#166534" }, completed: { background: "#dcfce7", color: "#166534" }, cancelled: { background: "#fee2e2", color: "#b91c1c" }, active: { background: "#dcfce7", color: "#166534" } };
