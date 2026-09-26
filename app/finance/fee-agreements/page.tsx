"use client";
import { FinanceHeader, FinanceFilterBar, FinanceListFrame, FinanceStatusBadge } from "../ui/primitives";
import { FinanceIcon } from "../ui/icons";
import { uiMessage, type UiMessage } from "../../../lib/i18n/core";
import { useI18n } from "../../../lib/i18n/provider";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { FinanceSubNav, QuotationGuard } from "../quotations/shared";
import { supabase } from "../../../lib/supabase";
import { feeAgreementStatusLabel } from "./lifecycle";

type Json = Record<string, unknown>;
type Agreement = {
  id: string; agreement_no: string | null; title: string; status: string; language_code: string | null;
  effective_date: string | null; updated_at: string; source_quotation_id: string | null; source_reference: string | null;
  engagement_basis: "formal_agreement" | "accepted_quotation" | null;
  client_snapshot_json: Json | null; matter_snapshot_json: Json | null; source_document_snapshot_json: Json | null;
};

const value = (input: unknown, fallback = "-") => typeof input === "string" && input.trim() ? input : fallback;
const snapshotText = (snapshot: Json | null, ...keys: string[]) => keys.map((key) => value(snapshot?.[key], "")).find(Boolean) || "-";

export default function FeeAgreementsPage() {
  return <QuotationGuard>{(access) => <FeeAgreementList permissions={access.permissions} />}</QuotationGuard>;
}

function FeeAgreementList({ permissions }: { permissions: Parameters<typeof FinanceSubNav>[0]["permissions"] }) {
  const { t, locale, date, text } = useI18n();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiMessage | string>("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const result = await supabase.from("finance_fee_agreements")
      .select("id,agreement_no,title,status,language_code,effective_date,updated_at,source_quotation_id,source_reference,engagement_basis,client_snapshot_json,matter_snapshot_json,source_document_snapshot_json")
      .order("updated_at", { ascending: false });
    if (result.error) setError(uiMessage("finance.feeAgreement.list.loadFailed"));
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

    <FinanceHeader icon="agreement" title={t("finance.feeAgreement.list.title")} description={t("finance.feeAgreement.list.help")} />

    <FinanceFilterBar label={t("finance.feeAgreement.list.filter")}>
      <label style={filterField}>
        <span style={filterLabel}>{t("common.actions.search")}</span>
        <span style={searchControl}>
          <ListIcon name="search" />
          <input className="fee-agreement-filter-control" aria-label={t("finance.feeAgreement.list.search")} style={inputStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("finance.feeAgreement.list.searchPlaceholder")} />
        </span>
      </label>
      <label style={filterField}>
        <span style={filterLabel}>{t("finance.taxInvoice.ui.status")}</span>
        <select className="fee-agreement-filter-control" style={selectStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">{t("finance.taxInvoice.ui.allStatuses")}</option>{["draft", "under_review", "sent", "signed", "completed", "engagement_confirmed", "cancelled", "active"].map((item) => <option key={item} value={item}>{feeAgreementStatusLabel(item, locale)}</option>)}
        </select>
      </label>
    </FinanceFilterBar>

    {!loading && !error ? <div style={listMeta} aria-live="polite">{t("finance.feeAgreement.list.count", { count: filtered.length, total: agreements.length })}</div> : null}

    {loading ? <div style={loadingStyle}>{t("finance.feeAgreement.list.loading")}</div> : error ? <div style={warning}>{text(error)}</div> : filtered.length === 0 ? <div style={emptyStyle}>{t("finance.feeAgreement.list.empty")}</div> : <FinanceListFrame><table className="fee-agreement-list-table" style={tableStyle}>
      <thead><tr><th>{t("finance.feeAgreement.list.engagement")}</th><th>{t("finance.feeAgreement.list.clientMatter")}</th><th>{t("finance.invoice.sourceQuotation")}</th><th>{t("finance.taxInvoice.ui.status")}</th><th>{t("finance.invoice.ui.language")}</th><th>{t("finance.feeAgreement.effectiveDate")}</th><th>{t("finance.payment.ui.updated")}</th><th>{t("finance.feeAgreement.actions")}</th></tr></thead>
      <tbody>{filtered.map((agreement) => {
        const source = agreement.source_document_snapshot_json || {};
        const quotationNo = value(source.quotation_no, agreement.source_reference || "-");
        const title = /^Fee Agreement\s*-\s*/i.test(agreement.title || "") ? "สัญญาว่าจ้างให้บริการทางกฎหมาย" : agreement.title;
        const client = snapshotText(agreement.client_snapshot_json, "name", "display_name");
        const matter = snapshotText(agreement.matter_snapshot_json, "title", "file_no", "matter_no");
        const acceptedQuotationBasis = agreement.engagement_basis === "accepted_quotation";
        return <tr key={agreement.id}>
          <td data-label={t("finance.feeAgreement.list.engagement")}><div style={cellStack}><span style={{ ...basisBadge, ...(acceptedQuotationBasis ? acceptedBasisBadge : formalBasisBadge) }}>{acceptedQuotationBasis ? t("finance.feeAgreement.acceptedQuotationBasis") : t("finance.feeAgreement.formalAgreement")}</span><strong style={agreementNumber}>{acceptedQuotationBasis ? quotationNo : agreement.agreement_no || t("finance.feeAgreement.unnumbered")}</strong><span style={secondaryText}>{title}</span></div></td>
          <td data-label={t("finance.feeAgreement.list.clientMatter")}><div style={cellStack}><strong style={primaryText}>{client}</strong><span style={secondaryText}>{matter}</span></div></td>
          <td data-label={t("finance.invoice.sourceQuotation")}>{agreement.source_quotation_id ? <Link className="fee-agreement-source-link" style={sourceLink} href={`/finance/quotations/${agreement.source_quotation_id}`}>{quotationNo}</Link> : <span style={primaryText}>{quotationNo}</span>}</td>
          <td data-label={t("finance.taxInvoice.ui.status")}><StatusBadge status={agreement.status} /></td>
          <td data-label={t("finance.invoice.ui.language")} style={conciseCell}>{acceptedQuotationBasis ? "-" : agreement.language_code === "en" ? t("finance.feeAgreement.language.en") : t("finance.feeAgreement.language.th")}</td>
          <td data-label={t("finance.feeAgreement.effectiveDate")} style={dateCell}>{acceptedQuotationBasis ? "-" : date(agreement.effective_date)}</td>
          <td data-label={t("finance.payment.ui.updated")} style={dateCell}>{date(agreement.updated_at)}</td>
          <td data-label={t("finance.feeAgreement.actions")}><Link className="fee-agreement-open-link" style={openLink} href={`/finance/fee-agreements/${agreement.id}`}>{t("finance.feeAgreement.open")}<ListIcon name="open" /></Link></td>
        </tr>;
      })}</tbody>
    </table></FinanceListFrame>}

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

function StatusBadge({ status }: { status: string }) {
  const { locale } = useI18n(); return <FinanceStatusBadge status={status} label={feeAgreementStatusLabel(status, locale)}/>; }
function ListIcon({ name }: { name: "search" | "open" }) { if (name === "search") return <span style={searchIcon}><FinanceIcon name="search" size={17}/></span>; return <FinanceIcon name="next" size={17}/>; }

const pageStyle: CSSProperties = { width: "100%", minWidth: 0 };
const filterField: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const filterLabel: CSSProperties = { color: "#475569", fontSize: 12, fontWeight: 700 };
const searchControl: CSSProperties = { position: "relative", display: "block", minWidth: 0 };
const searchIcon: CSSProperties = { position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#64748b", pointerEvents: "none" };
const inputStyle: CSSProperties = { width: "100%", height: 42, minWidth: 0, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 12px 9px 38px", background: "#fff", color: "#172033", font: "inherit" };
const selectStyle: CSSProperties = { width: "100%", height: 42, minWidth: 0, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 10px", background: "#fff", color: "#172033", font: "inherit" };
const listMeta: CSSProperties = { margin: "0 2px 8px", color: "#64748b", fontSize: 12, textAlign: "right" };
const tableStyle: CSSProperties = { width: "100%", minWidth: 0, borderCollapse: "separate", borderSpacing: 0, color: "#334155", fontSize: 13 };
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
const basisBadge: CSSProperties = { width: "fit-content", padding: "3px 7px", borderRadius: 4, fontSize: 10, fontWeight: 800, lineHeight: 1.3 };
const formalBasisBadge: CSSProperties = { background: "#f1f5f9", color: "#475569" };
const acceptedBasisBadge: CSSProperties = { background: "#ecfdf5", color: "#047857" };
