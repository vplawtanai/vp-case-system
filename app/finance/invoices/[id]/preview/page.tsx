"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../../quotations/shared";
import {
  loadCurrentDocumentIdentity,
  loadDocumentLogoUrl,
  normalizeDocumentIdentity,
  resolveDocumentIdentity,
  resolveFrozenDocumentIdentity,
  type DocumentIdentity,
} from "../../../../../lib/documentIdentity";
import { supabase } from "../../../../../lib/supabase";
import { InvoiceDocument } from "../../invoice-document";
import { resolveInvoicePaymentInstructions } from "../../payment-instructions";
import {
  asJson,
  bankAccountPaymentDestination,
  displayText,
  invoiceInstallmentContext,
  snapshotPaymentDestination,
  type FinanceBankAccount,
  type FinanceInvoice,
  type FinanceInvoiceItem,
  type InvoicePaymentDestination,
  type InvoiceInstallmentContext,
  type Json,
} from "../../shared";

type Installment = { installment_no: number; title: string; trigger_description: string | null };

const invoiceSelect = "id,billing_plan_id,primary_billing_installment_id,fee_agreement_id,source_quotation_id,client_id,case_id,advisory_matter_id,source_model,v2_bridge_id,v2_creation_request_id,invoice_no,document_status,issue_date,due_date,currency,language_code,customer_note,payment_terms_text,payment_destination_bank_account_id,payment_destination_snapshot_json,internal_note,amount_before_vat,vat_amount,total_amount,seller_name_th,seller_name_en,seller_tax_id,seller_branch,seller_address,seller_phone,seller_email,seller_website,customer_name,customer_tax_id,customer_branch,customer_billing_address,customer_phone,customer_email,seller_snapshot_json,customer_snapshot_json,matter_snapshot_json,source_snapshot_json,issued_snapshot_json,issued_at,voided_at,void_reason,cancelled_at,cancel_reason,created_at,updated_at";
const itemSelect = "id,source_billable_charge_id,source_state,source_snapshot_json,description,source_quantity,source_unit_price,allocation_percent,vat_applicable,vat_rate,tax_category,price_tax_mode,amount_before_vat,vat_amount,line_total,sort_order";

export default function InvoicePreviewPage() {
  const params = useParams<{ id: string }>();
  return <QuotationGuard>{() => <InvoicePreview id={params.id} />}</QuotationGuard>;
}

function InvoicePreview({ id }: { id: string }) {
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [installmentContext, setInstallmentContext] = useState<InvoiceInstallmentContext | null>(null);
  const [paymentDestination, setPaymentDestination] = useState<InvoicePaymentDestination | null>(null);
  const [identity, setIdentity] = useState<DocumentIdentity>(() => normalizeDocumentIdentity(null));
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const printed = useRef(false);

  const load = useCallback(async () => {
    const result = await supabase.from("finance_invoices").select(invoiceSelect).eq("id", id).maybeSingle();
    if (result.error || !result.data) {
      console.error("Failed to load Invoice preview", result.error);
      setError("ไม่สามารถโหลดตัวอย่างใบแจ้งหนี้ได้"); setLoading(false); return;
    }
    const currentInvoice = result.data as FinanceInvoice;
    if (isFrozenInvoiceStatus(currentInvoice.document_status) && !currentInvoice.issued_snapshot_json) {
      console.error("Frozen Invoice preview is missing its issued snapshot", { invoiceId: currentInvoice.id, status: currentInvoice.document_status });
      setError("ไม่พบข้อมูลเอกสารฉบับที่ออกแล้ว จึงไม่สามารถแสดง Preview ได้อย่างปลอดภัย"); setLoading(false); return;
    }
    const bankAccountPromise = currentInvoice.document_status === "draft" && currentInvoice.payment_destination_bank_account_id
      ? supabase.from("finance_bank_accounts").select("id,short_name,bank_name,account_name,account_number,is_active").eq("id", currentInvoice.payment_destination_bank_account_id).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const bridgeResult = currentInvoice.document_status === "draft" && currentInvoice.v2_bridge_id
      ? await supabase.from("finance_billing_installment_charge_bridges").select("id,billing_installment_id,source_snapshot_json").eq("id", currentInvoice.v2_bridge_id).maybeSingle()
      : { data: null, error: null };
    const sourceInstallmentId = currentInvoice.document_status === "draft"
      ? currentInvoice.primary_billing_installment_id || (bridgeResult.data as { billing_installment_id?: string } | null)?.billing_installment_id || null
      : null;
    const [itemsResult, installmentResult, currentIdentityResult, bankAccountResult] = await Promise.all([
      supabase.from("finance_invoice_items").select(itemSelect).eq("invoice_id", id).order("sort_order").order("id"),
      sourceInstallmentId ? supabase.from("finance_billing_installments").select("installment_no,title,trigger_description").eq("id", sourceInstallmentId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      loadCurrentDocumentIdentity(supabase),
      bankAccountPromise,
    ]);
    if (bridgeResult.error || itemsResult.error || installmentResult.error || bankAccountResult.error) {
      console.error("Failed to load Invoice preview context", { items: itemsResult.error, installment: installmentResult.error, bankAccount: bankAccountResult.error });
      setError("โหลดรายการหรือข้อมูลงวดสำหรับตัวอย่างไม่สำเร็จ");
    }

    const sourceInstallment = (installmentResult.data || null) as Installment | null;
    const paymentInstructionState = resolveInvoicePaymentInstructions({
      documentStatus: currentInvoice.document_status,
      sourceModel: currentInvoice.source_model,
      v2BridgeId: currentInvoice.v2_bridge_id,
      createdAt: currentInvoice.created_at,
      paymentInstructions: currentInvoice.payment_terms_text,
      billingTrigger: sourceInstallment?.trigger_description,
    });
    const presentation = invoicePresentation(
      paymentInstructionState.isLegacyAutoInheritedBillingTrigger
        ? { ...currentInvoice, payment_terms_text: null }
        : currentInvoice,
      (itemsResult.data || []) as FinanceInvoiceItem[],
      (bankAccountResult.data || null) as FinanceBankAccount | null,
    );
    const sellerSnapshot = presentation.seller;
    const resolvedIdentity = isFrozenInvoiceStatus(presentation.invoice.document_status)
      ? resolveFrozenDocumentIdentity(sellerSnapshot, currentIdentityResult.identity)
      : resolveDocumentIdentity(sellerSnapshot, currentIdentityResult.identity);
    const resolvedLogoUrl = resolvedIdentity.logoStoragePath === currentIdentityResult.identity.logoStoragePath
      ? currentIdentityResult.logoUrl
      : await loadDocumentLogoUrl(supabase, resolvedIdentity.logoStoragePath);

    setInvoice(presentation.invoice);
    setItems(presentation.items);
    setPaymentDestination(presentation.paymentDestination);
    setInstallmentContext(invoiceInstallmentContext(currentInvoice, (itemsResult.data || []) as FinanceInvoiceItem[], bridgeResult.data));
    setIdentity(resolvedIdentity);
    setLogoUrl(resolvedLogoUrl);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (loading || !invoice || printed.current || new URLSearchParams(window.location.search).get("print") !== "1") return;
    printed.current = true;
    const timer = window.setTimeout(async () => {
      await window.document.fonts?.ready;
      window.print();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [invoice, loading]);

  if (loading) return <main style={shell}>กำลังโหลดตัวอย่างใบแจ้งหนี้...</main>;
  if (!invoice) return <main style={shell}>{error || "ไม่พบใบแจ้งหนี้"}</main>;

  const matterText = displayText(invoice.matter_snapshot_json?.title, displayText(invoice.matter_snapshot_json?.file_no, ""));
  const matter = matterText || null;

  return <main style={shell}>
    <div className="invoice-preview-controls" style={controls}>
      <div><strong style={controlTitle}>{invoice.document_status === "draft" ? "ตัวอย่างร่างใบแจ้งหนี้" : invoice.document_status === "voided" ? `ใบแจ้งหนี้ที่ยกเลิกแล้ว ${invoice.invoice_no || ""}` : `ใบแจ้งหนี้ ${invoice.invoice_no || ""}`}</strong><span style={controlText}>{invoice.document_status === "draft" ? "การดูตัวอย่างและการพิมพ์ไม่ออกเลขที่เอกสารและไม่เปลี่ยนสถานะ" : invoice.document_status === "voided" ? "เอกสารประวัตินี้แสดงจากข้อมูลที่ถูกล็อกเมื่อออกใบแจ้งหนี้ พร้อมเครื่องหมาย VOID" : "เอกสารนี้แสดงจากข้อมูลที่ถูกล็อกเมื่อออกใบแจ้งหนี้"}</span></div>
      <div style={controlActions}><Link style={backButton} href={`/finance/invoices/${invoice.id}`}>กลับไปใบแจ้งหนี้</Link><button type="button" style={printButton} onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button></div>
    </div>
    {error ? <div style={errorNotice}>{error}</div> : null}
    <InvoiceDocument invoice={invoice} items={items} identity={identity} logoUrl={logoUrl} matter={matter} installmentContext={installmentContext} paymentDestination={paymentDestination} />
    <style jsx global>{`
      @media print {
        .invoice-preview-controls { display: none !important; }
      }
      @media (max-width: 680px) {
        .invoice-preview-controls { grid-template-columns: minmax(0,1fr) !important; }
      }
    `}</style>
  </main>;
}

function invoicePresentation(invoice: FinanceInvoice, liveItems: FinanceInvoiceItem[], liveBankAccount: FinanceBankAccount | null) {
  if (!isFrozenInvoiceStatus(invoice.document_status) || !invoice.issued_snapshot_json) {
    return { invoice, items: liveItems.filter((item) => item.source_state === "active"), seller: liveSeller(invoice), paymentDestination: bankAccountPaymentDestination(liveBankAccount) };
  }
  const strictSnapshot = invoice.document_status === "voided";
  const snapshot = asJson(invoice.issued_snapshot_json);
  const frozenInvoice = asJson(snapshot.invoice);
  const frozenSeller = asJson(snapshot.seller);
  const frozenCustomer = asJson(snapshot.customer);
  const frozenPaymentDestination = snapshotPaymentDestination(snapshot.payment_destination || frozenInvoice.payment_destination_snapshot_json);
  const frozenItems = Array.isArray(snapshot.items) ? snapshot.items.map((value, index) => frozenInvoiceItem(value, index)) : [];
  return {
    invoice: {
      ...invoice,
      invoice_no: stringOrNull(frozenInvoice.invoice_no) || invoice.invoice_no,
      document_status: invoice.document_status,
      issue_date: stringOrNull(frozenInvoice.issue_date) || invoice.issue_date,
      due_date: stringOrNull(frozenInvoice.due_date),
      currency: stringOrNull(frozenInvoice.currency) || invoice.currency,
      language_code: stringOrNull(frozenInvoice.language_code) || invoice.language_code,
      customer_note: stringOrNull(frozenInvoice.customer_note),
      payment_terms_text: stringOrNull(frozenInvoice.payment_terms_text),
      payment_destination_bank_account_id: frozenPaymentDestination?.bankAccountId || null,
      payment_destination_snapshot_json: frozenPaymentDestination ? asJson(snapshot.payment_destination) : null,
      amount_before_vat: valueOrFallback(frozenInvoice.amount_before_vat, invoice.amount_before_vat),
      vat_amount: valueOrFallback(frozenInvoice.vat_amount, invoice.vat_amount),
      total_amount: valueOrFallback(frozenInvoice.total_amount, invoice.total_amount),
      customer_name: stringOrNull(frozenCustomer.name) || (strictSnapshot ? null : invoice.customer_name),
      customer_tax_id: stringOrNull(frozenCustomer.tax_id) || (strictSnapshot ? null : invoice.customer_tax_id),
      customer_branch: stringOrNull(frozenCustomer.branch) || stringOrNull(frozenCustomer.branch_label) || (strictSnapshot ? null : invoice.customer_branch),
      customer_billing_address: stringOrNull(frozenCustomer.billing_address) || stringOrNull(frozenCustomer.address) || (strictSnapshot ? null : invoice.customer_billing_address),
      customer_phone: stringOrNull(frozenCustomer.phone) || (strictSnapshot ? null : invoice.customer_phone),
      customer_email: stringOrNull(frozenCustomer.email) || (strictSnapshot ? null : invoice.customer_email),
      matter_snapshot_json: asJson(snapshot.matter),
      source_snapshot_json: asJson(snapshot.source),
    },
    items: strictSnapshot ? frozenItems : frozenItems.length ? frozenItems : liveItems,
    seller: strictSnapshot ? frozenSellerIdentitySource(frozenSeller) : sellerIdentitySource(frozenSeller, invoice),
    paymentDestination: frozenPaymentDestination,
  };
}

function isFrozenInvoiceStatus(status: string) {
  return status === "issued" || status === "voided";
}

function liveSeller(invoice: FinanceInvoice): Json {
  return sellerIdentitySource({ snapshot: invoice.seller_snapshot_json }, invoice);
}

function sellerIdentitySource(seller: Json, invoice: FinanceInvoice): Json {
  return {
    ...asJson(seller.snapshot),
    company_name_th: stringOrNull(seller.company_name_th) || stringOrNull(seller.name_th) || invoice.seller_name_th,
    company_name_en: stringOrNull(seller.company_name_en) || stringOrNull(seller.name_en) || invoice.seller_name_en,
    tax_id: stringOrNull(seller.tax_id) || invoice.seller_tax_id,
    branch_th: stringOrNull(seller.branch_th) || stringOrNull(seller.branch_label) || stringOrNull(seller.branch) || invoice.seller_branch,
    address_th: stringOrNull(seller.address_th) || stringOrNull(seller.address) || invoice.seller_address,
    phone: stringOrNull(seller.phone) || invoice.seller_phone,
    email: stringOrNull(seller.email) || invoice.seller_email,
    website: stringOrNull(seller.website) || invoice.seller_website,
  };
}

function frozenSellerIdentitySource(seller: Json): Json {
  return {
    ...asJson(seller.snapshot),
    company_name_th: stringOrNull(seller.company_name_th) || stringOrNull(seller.name_th),
    company_name_en: stringOrNull(seller.company_name_en) || stringOrNull(seller.name_en),
    tax_id: stringOrNull(seller.tax_id),
    branch_th: stringOrNull(seller.branch_th) || stringOrNull(seller.branch_label) || stringOrNull(seller.branch),
    address_th: stringOrNull(seller.address_th) || stringOrNull(seller.address),
    phone: stringOrNull(seller.phone),
    email: stringOrNull(seller.email),
    website: stringOrNull(seller.website),
  };
}

function frozenInvoiceItem(value: unknown, index: number): FinanceInvoiceItem {
  const snapshotItem = asJson(value);
  const item = Object.keys(asJson(snapshotItem.invoice_item)).length ? asJson(snapshotItem.invoice_item) : snapshotItem;
  return {
    id: String(item.id || `snapshot-item-${index}`),
    source_billable_charge_id: stringOrNull(item.source_billable_charge_id),
    source_state: stringOrNull(item.source_state) || "active",
    source_snapshot_json: asJson(item.source_snapshot_json),
    description: displayText(item.description),
    source_quantity: scalar(item.source_quantity),
    source_unit_price: scalar(item.source_unit_price),
    allocation_percent: scalar(item.allocation_percent),
    vat_applicable: item.vat_applicable === true,
    vat_rate: scalar(item.vat_rate) || 0,
    tax_category: stringOrNull(item.tax_category),
    price_tax_mode: stringOrNull(item.price_tax_mode),
    amount_before_vat: scalar(item.amount_before_vat) || 0,
    vat_amount: scalar(item.vat_amount) || 0,
    line_total: scalar(item.line_total) || 0,
    sort_order: Number(item.sort_order || index),
  };
}

function scalar(value: unknown): number | string | null {
  return typeof value === "number" || typeof value === "string" ? value : null;
}
function stringOrNull(value: unknown) { return typeof value === "string" && value ? value : null; }
function valueOrFallback(value: unknown, fallback: number | string) { return typeof value === "number" || typeof value === "string" ? value : fallback; }

const shell: CSSProperties = { width: "100%", maxWidth: 1180, margin: "0 auto", padding: 24 };
const controls: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 16, maxWidth: 820, margin: "0 auto 16px", padding: "13px 14px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", color: "#334155" };
const controlTitle: CSSProperties = { display: "block", marginBottom: 3, color: "#172033", fontSize: 14 };
const controlText: CSSProperties = { display: "block", color: "#64748b", fontSize: 12, lineHeight: 1.5 };
const controlActions: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 };
const controlButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 38, boxSizing: "border-box", padding: "8px 11px", border: "1px solid", borderRadius: 6, font: "inherit", fontSize: 13, fontWeight: 700, textDecoration: "none", cursor: "pointer" };
const backButton: CSSProperties = { ...controlButton, borderColor: "#cbd5e1", background: "#fff", color: "#475569" };
const printButton: CSSProperties = { ...controlButton, borderColor: "#172033", background: "#172033", color: "#fff" };
const errorNotice: CSSProperties = { maxWidth: 820, margin: "0 auto 14px", padding: 12, border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2", color: "#b91c1c" };
