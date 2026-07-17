"use client";

/* eslint-disable @next/next/no-img-element -- Private signed document assets must render eagerly and reliably in Browser Print. */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  AUTHORIZED_SIGNERS,
  type AuthorizedSigner,
  type CompanyProfile,
  type DbAuthorizedSigner,
  type DbCompanyProfile,
  formatSignerPosition,
  getSignerByKey,
  normalizeAuthorizedSigner,
  normalizeCompanyProfile,
} from "../../../../../lib/companyProfile";
import { supabase } from "../../../../../lib/supabase";
import { getQuotationClientDisplayName } from "../../../../../lib/quotationClientDisplay";
import { QuotationGuard } from "../../shared";

type QuotationRow = {
  id: string;
  quotation_no: string | null;
  client_id: string | null;
  case_id: number | null;
  advisory_matter_id: string | null;
  issue_date: string | null;
  valid_until: string | null;
  status: string | null;
  subtotal_vatable: number | string | null;
  subtotal_non_vatable: number | string | null;
  vat_amount: number | string | null;
  grand_total: number | string | null;
  scope_of_legal_services: string | null;
  included_services: string | null;
  excluded_services: string | null;
  authorized_signer_key: string | null;
  authorized_signer_name: string | null;
  authorized_signer_position: string | null;
  authorized_signer_email: string | null;
  note: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
  client_snapshot_json?: Record<string, unknown> | null;
  matter_snapshot_json?: Record<string, unknown> | null;
  document_data_snapshot_json?: Record<string, unknown> | null;
};

type QuotationItemRow = {
  id?: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  amount_before_tax: number | string | null;
  vat_applicable?: boolean | null;
  price_tax_mode?: "non_vat" | "vat_exclusive" | "vat_inclusive" | null;
  vat_amount: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type ClientRow = {
  id: string;
  client_type?: string | null;
  name: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type CaseRow = {
  id: number;
  file_no: string | null;
  title: string | null;
  client_name: string | null;
};

type MatterRow = {
  id: string;
  matter_no: string | null;
  title: string | null;
};

type PaymentTermsHeaderRow = { id: string; payment_method_type: string; client_summary: string | null; allocation_mode?: "proportional_all_items" | "per_item" | null };
type PaymentInstallmentRow = {
  id: string;
  installment_no: number;
  title: string;
  calculation_type: string;
  percentage: number | string | null;
  trigger_type: string;
  trigger_description: string | null;
  due_date: string | null;
  payment_due_days: number | string | null;
  client_note: string | null;
  amount_before_tax: number | string | null;
  vat_amount: number | string | null;
  total_amount: number | string | null;
};
type PaymentAllocationRow = {
  payment_installment_id: string;
  quotation_item_id: string;
  allocated_amount_before_tax: number | string;
  allocated_vat_amount: number | string;
  allocated_total: number | string;
  allocation_percentage: number | string | null;
  sort_order: number | null;
};

export default function QuotationPreviewPage() {
  const params = useParams();
  const quotationId = Array.isArray(params.id) ? params.id[0] : params.id || "";

  return (
    <QuotationGuard>
      {() => <QuotationPreview quotationId={quotationId} />}
    </QuotationGuard>
  );
}

function QuotationPreview({ quotationId }: { quotationId: string }) {
  const searchParams = useSearchParams();
  const hasOpenedPrintDialog = useRef(false);
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [items, setItems] = useState<QuotationItemRow[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermsHeaderRow | null>(null);
  const [paymentInstallments, setPaymentInstallments] = useState<PaymentInstallmentRow[]>([]);
  const [paymentAllocations, setPaymentAllocations] = useState<PaymentAllocationRow[]>([]);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [caseItem, setCaseItem] = useState<CaseRow | null>(null);
  const [matter, setMatter] = useState<MatterRow | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(normalizeCompanyProfile(null));
  const [signers, setSigners] = useState<AuthorizedSigner[]>(AUTHORIZED_SIGNERS);
  const [logoUrl, setLogoUrl] = useState("");
  const [signerSignatureUrl, setSignerSignatureUrl] = useState("");
  const [showSignerSignature, setShowSignerSignature] = useState(() => searchParams.get("signature") !== "0");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const signerSignatureImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const loadPreview = async () => {
      setLoading(true);
      setErrorText("");

      if (!quotationId) {
        setErrorText("Quotation not found.");
        setLoading(false);
        return;
      }

      const quotationRes = await supabase
        .from("finance_quotations")
        .select("*")
        .eq("id", quotationId)
        .maybeSingle();

      if (quotationRes.error || !quotationRes.data) {
        console.error("Failed to load quotation preview", { quotationId, error: quotationRes.error });
        setErrorText("Quotation not found.");
        setLoading(false);
        return;
      }

      const loadedQuotation = quotationRes.data as QuotationRow;
      setQuotation(loadedQuotation);

      const [itemsRes, clientRes, caseRes, matterRes, companyRes, signersRes, paymentTermsRes] = await Promise.all([
        supabase
          .from("finance_quotation_items")
          .select("*")
          .eq("quotation_id", quotationId)
          .order("sort_order", { ascending: true }),
        loadedQuotation.client_id
          ? supabase.from("clients").select("id, client_type, name, tax_id, email, phone, address").eq("id", loadedQuotation.client_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        loadedQuotation.case_id
          ? supabase.from("cases").select("id, file_no, title, client_name").eq("id", loadedQuotation.case_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        loadedQuotation.advisory_matter_id
          ? supabase.from("advisory_matters").select("id, matter_no, title").eq("id", loadedQuotation.advisory_matter_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("finance_company_profiles").select("*").eq("id", "default").maybeSingle(),
        supabase.from("finance_authorized_signers").select("*").order("sort_order", { ascending: true }),
        supabase.from("finance_quotation_payment_terms").select("id, payment_method_type, client_summary, allocation_mode").eq("quotation_id", quotationId).maybeSingle(),
      ]);

      if (itemsRes.error) console.warn("Failed to load quotation preview items", itemsRes.error);
      if (clientRes.error) console.warn("Failed to load quotation preview client", clientRes.error);
      if (caseRes.error) console.warn("Failed to load quotation preview case", caseRes.error);
      if (matterRes.error) console.warn("Failed to load quotation preview advisory matter", matterRes.error);
      if (companyRes.error) console.warn("Failed to load quotation preview company profile", companyRes.error);
      if (signersRes.error) console.warn("Failed to load quotation preview signers", signersRes.error);
      if (paymentTermsRes.error) console.warn("Failed to load quotation preview payment terms", paymentTermsRes.error);

      const paymentInstallmentsRes = paymentTermsRes.data
        ? await supabase
          .from("finance_quotation_payment_installments")
          .select("id, installment_no, title, calculation_type, percentage, trigger_type, trigger_description, due_date, payment_due_days, client_note, amount_before_tax, vat_amount, total_amount")
          .eq("payment_terms_id", paymentTermsRes.data.id)
          .order("installment_no", { ascending: true })
        : { data: [] as PaymentInstallmentRow[], error: null };
      if (paymentInstallmentsRes.error) console.warn("Failed to load quotation preview payment installments", paymentInstallmentsRes.error);
      const paymentAllocationsRes = paymentInstallmentsRes.data?.length
        ? await supabase
          .from("finance_quotation_payment_installment_items")
          .select("payment_installment_id, quotation_item_id, allocated_amount_before_tax, allocated_vat_amount, allocated_total, allocation_percentage, sort_order")
          .in("payment_installment_id", paymentInstallmentsRes.data.map((installment) => installment.id))
          .order("sort_order", { ascending: true })
        : { data: [] as PaymentAllocationRow[], error: null };
      if (paymentAllocationsRes.error) console.warn("Failed to load quotation preview payment allocations", paymentAllocationsRes.error);

      const documentSnapshot = getSnapshotObject(loadedQuotation.document_data_snapshot_json);
      const companySnapshot = (getSnapshotObjectOrNull(documentSnapshot.company) || getSnapshotObjectOrNull(documentSnapshot.company_profile)) as DbCompanyProfile | null;
      const signerSnapshot = getSnapshotObject(documentSnapshot.commercial).authorized_signer
        ? getSnapshotObject(getSnapshotObject(documentSnapshot.commercial).authorized_signer)
        : getSnapshotObject(documentSnapshot.authorized_signer);
      const currentCompany = normalizeCompanyProfile((companyRes.data || null) as DbCompanyProfile | null);
      const normalizedCompany = resolveCompanyProfile(companySnapshot, currentCompany);
      const normalizedSigners = signersRes.error
        ? AUTHORIZED_SIGNERS
        : ((signersRes.data || []) as DbAuthorizedSigner[]).map(normalizeAuthorizedSigner).filter((signer) => signer.key);
      const activeSigners = normalizedSigners.length > 0 ? normalizedSigners : AUTHORIZED_SIGNERS;
      const signerForAssets = getSignerByKey(activeSigners, loadedQuotation.authorized_signer_key);
      const logoStoragePath = getSnapshotText(companySnapshot, "logo_storage_path") || currentCompany.logoStoragePath || "";
      const signatureStoragePath = getSnapshotText(signerSnapshot, "signature_storage_path") || signerForAssets.signatureStoragePath || "";

      setCompanyProfile(normalizedCompany);
      setSigners(activeSigners);

      if (logoStoragePath) {
        const logoRes = await supabase.storage.from("vp-document-assets").createSignedUrl(logoStoragePath, 60 * 10);
        setLogoUrl(logoRes.data?.signedUrl || "");
      } else {
        setLogoUrl("");
      }

      if (signatureStoragePath) {
        const signatureRes = await supabase.storage.from("vp-document-assets").createSignedUrl(signatureStoragePath, 60 * 10);
        setSignerSignatureUrl(signatureRes.data?.signedUrl || "");
      } else {
        setSignerSignatureUrl("");
      }

      setItems((itemsRes.data || []) as QuotationItemRow[]);
      setPaymentTerms((paymentTermsRes.data || null) as PaymentTermsHeaderRow | null);
      setPaymentInstallments((paymentInstallmentsRes.data || []) as PaymentInstallmentRow[]);
      setPaymentAllocations((paymentAllocationsRes.data || []) as PaymentAllocationRow[]);
      setClient((clientRes.data || null) as ClientRow | null);
      setCaseItem((caseRes.data || null) as CaseRow | null);
      setMatter((matterRes.data || null) as MatterRow | null);
      setLoading(false);
    };

    loadPreview();
  }, [quotationId]);

  const clientAddress = getClientDisplayValue(quotation, client, "address");
  const clientPhone = getClientDisplayValue(quotation, client, "phone");
  const clientEmail = getClientDisplayValue(quotation, client, "email");
  const matterLabel = getMatterLabel(quotation, caseItem, matter);
  const documentSnapshot = getSnapshotObject(quotation?.document_data_snapshot_json);
  const frozenDocument = isFrozenQuotation(quotation) && Boolean(getSnapshotText(documentSnapshot, "frozen_at"));
  const frozenClient = getSnapshotObject(documentSnapshot.client);
  const frozenMatter = getSnapshotObject(documentSnapshot.matter);
  const commercialSnapshot = getSnapshotObject(documentSnapshot.commercial);
  const frozenItems = getFrozenQuotationItems(documentSnapshot);
  const frozenPayment = getFrozenPaymentTerms(documentSnapshot);
  const frozenQuotation = getSnapshotObject(documentSnapshot.quotation);
  const frozenTotals = getSnapshotObject(documentSnapshot.totals);
  const displayItems = frozenDocument ? frozenItems : items;
  const displayPaymentTerms = frozenDocument ? frozenPayment.terms : paymentTerms;
  const displayInstallments = frozenDocument ? frozenPayment.installments : paymentInstallments;
  const displayAllocations = frozenDocument ? frozenPayment.allocations : paymentAllocations;
  const displayClientName = frozenDocument ? getSnapshotText(frozenClient, "client_display_name") || getQuotationClientDisplayName(getSnapshotText(frozenClient, "name"), getSnapshotText(frozenClient, "client_type")) || quotation?.client_id || "-" : getQuotationClientDisplayName(client?.name, client?.client_type);
  const displayClientAddress = frozenDocument ? getSnapshotText(frozenClient, "address") || "-" : clientAddress;
  const displayClientPhone = frozenDocument ? getSnapshotText(frozenClient, "phone") || "-" : clientPhone;
  const displayClientEmail = frozenDocument ? getSnapshotText(frozenClient, "email") || "-" : clientEmail;
  const displayMatterLabel = frozenDocument ? getFrozenMatterLabel(frozenMatter) : matterLabel;
  const displayQuotationNo = frozenDocument ? getSnapshotText(frozenQuotation, "quotation_no") || quotation?.quotation_no || "-" : quotation?.quotation_no || "-";
  const displayIssueDate = frozenDocument ? getSnapshotText(frozenQuotation, "issue_date") || quotation?.issue_date : quotation?.issue_date;
  const displayValidUntil = frozenDocument ? getSnapshotText(frozenQuotation, "valid_until") || quotation?.valid_until : quotation?.valid_until;
  const displaySubtotalVatable = frozenDocument ? (getSnapshotText(frozenTotals, "subtotal_vatable") || quotation?.subtotal_vatable) ?? null : quotation?.subtotal_vatable ?? null;
  const displaySubtotalNonVatable = frozenDocument ? (getSnapshotText(frozenTotals, "subtotal_non_vatable") || quotation?.subtotal_non_vatable) ?? null : quotation?.subtotal_non_vatable ?? null;
  const displayVatAmount = frozenDocument ? (getSnapshotText(frozenTotals, "vat_amount") || quotation?.vat_amount) ?? null : quotation?.vat_amount ?? null;
  const displayGrandTotal = frozenDocument ? (getSnapshotText(frozenTotals, "grand_total") || quotation?.grand_total) ?? null : quotation?.grand_total ?? null;
  const scopeText = frozenDocument ? getSnapshotText(commercialSnapshot, "scope_of_legal_services") : getSnapshotText(documentSnapshot, "scope_of_legal_services") || quotation?.scope_of_legal_services?.trim() || getMatterDescription(quotation, caseItem, matter);
  const includedText = frozenDocument ? getSnapshotText(commercialSnapshot, "included_services") : getSnapshotText(documentSnapshot, "included_services") || quotation?.included_services?.trim() || "";
  const excludedText = frozenDocument ? getSnapshotText(commercialSnapshot, "excluded_services") : getSnapshotText(documentSnapshot, "excluded_services") || quotation?.excluded_services?.trim() || "";
  const signer = resolveQuotationSigner(quotation, signers);
  const engagementSections = [
    { title: "ขอบเขตงาน / Scope of Legal Services", value: scopeText },
    { title: "งานที่รวมอยู่ในค่าบริการ / Included Services", value: includedText },
    { title: "งานหรือค่าใช้จ่ายที่ไม่รวม / Excluded Services", value: excludedText },
  ].filter((section) => Boolean(section.value));

  const printWhenReady = useCallback(async () => {
    await waitForPrintReadiness([logoImageRef.current, showSignerSignature ? signerSignatureImageRef.current : null]);
    window.requestAnimationFrame(() => window.print());
  }, [showSignerSignature]);

  useEffect(() => {
    if (searchParams.get("print") !== "1" || loading || !quotation || hasOpenedPrintDialog.current) return;
    hasOpenedPrintDialog.current = true;
    const timer = window.setTimeout(() => { void printWhenReady(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, quotation, searchParams, printWhenReady]);

  const updateSignatureOption = (nextValue: boolean) => {
    setShowSignerSignature(nextValue);
    const url = new URL(window.location.href);
    url.searchParams.set("signature", nextValue ? "1" : "0");
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="quotation-preview-shell">
      <style>{printCss}</style>
      <div className="print-hidden" style={toolbarStyle}>
        <span style={printHintStyle}>เพื่อผลลัพธ์ที่ดีที่สุด กรุณาใช้ Print → Save as PDF และปิด Headers &amp; Footers</span>
        <label style={signatureToggleStyle}>
          <input type="checkbox" checked={showSignerSignature} onChange={(event) => updateSignatureOption(event.target.checked)} />
          แสดงลายเซ็นผู้เสนอราคา / Show authorized signer signature
        </label>
        <Link href={quotationId ? `/finance/quotations/${quotationId}` : "/finance/quotations"} style={secondaryButtonStyle}>
          Back to Quotation
        </Link>
        <button type="button" onClick={() => { void printWhenReady(); }} style={primaryButtonStyle}>
          Print
        </button>
      </div>

      {loading ? <div style={messageStyle}>Loading quotation preview...</div> : null}
      {!loading && errorText ? <div style={errorStyle}>{errorText}</div> : null}
      {!loading && quotation && isFrozenQuotation(quotation) && !frozenDocument ? <div className="print-hidden" style={errorStyle}>เอกสารที่ส่งแล้วไม่มี snapshot ที่สมบูรณ์ กรุณาตรวจสอบความถูกต้องของเอกสารก่อนใช้งาน</div> : null}

      {!loading && quotation ? (
        <article className="quotation-print-document" style={documentStyle}>
          <header style={documentHeaderStyle}>
            <div style={providerHeaderStyle}>
              <LogoMark
                logoUrl={logoUrl}
                imageRef={logoImageRef}
                onError={() => setLogoUrl("")}
              />
              <div>
                <div style={companyNameThaiStyle}>{companyProfile.companyNameTh}</div>
                <div style={companyNameStyle}>{companyProfile.companyNameEn}</div>
                <div style={companyMetaStyle}>{companyProfile.description}</div>
              </div>
            </div>
            <div style={documentTitleBlockStyle}>
              <h1 style={documentTitleStyle}>ใบเสนอราคา</h1>
              <div style={documentSubtitleStyle}>Quotation</div>
              <div style={{ ...statusStyle, ...getPreviewStatusStyle(quotation.status) }}>{quotation.status || "draft"}</div>
            </div>
          </header>

          <section className="quotation-compact-block" style={topGridStyle}>
            <div style={panelStyle}>
              <h2 style={panelTitleStyle}>ผู้ให้บริการ / Service Provider</h2>
              <BilingualInfoLine label="Company" thaiValue={companyProfile.companyNameTh} englishValue={companyProfile.companyNameEn} strong />
              <InfoLine label="Tax ID" value={companyProfile.taxId} />
              {companyProfile.branchTh || companyProfile.branchEn ? <BilingualInfoLine label="Branch" thaiValue={companyProfile.branchTh} englishValue={companyProfile.branchEn} /> : null}
              <BilingualInfoLine label="Address" thaiValue={companyProfile.addressTh} englishValue={companyProfile.addressEn} />
              <InfoLine label="Phone" value={companyProfile.phone} />
              <InfoLine label="Email" value={companyProfile.email} />
              <InfoLine label="Website" value={companyProfile.website} />
            </div>
            <div style={panelStyle}>
              <h2 style={panelTitleStyle}>ข้อมูลเอกสาร / Document Information</h2>
              <InfoLine label="Quotation No." value={displayQuotationNo} strong />
              <InfoLine label="Status" value={quotation.status || "draft"} />
              <InfoLine label="Issue Date" value={formatDate(displayIssueDate || null)} />
              <InfoLine label="Valid Until" value={formatDate(displayValidUntil || null)} />
              <InfoLine label="Reference / Linked Matter" value={displayMatterLabel} />
            </div>
          </section>

          <section className="quotation-compact-block" style={{ ...panelStyle, marginBottom: 24 }}>
            <h2 style={panelTitleStyle}>ลูกค้า / Client</h2>
            <div style={clientGridStyle}>
              <InfoLine label="Client Name" value={displayClientName} strong />
              <InfoLine label="Address" value={displayClientAddress} wide />
              <InfoLine label="Phone" value={displayClientPhone} />
              <InfoLine label="Email" value={displayClientEmail} />
            </div>
          </section>

          {engagementSections.length > 0 ? (
            <section className="quotation-compact-block" style={{ ...panelStyle, marginBottom: 24 }}>
              <h2 style={panelTitleStyle}>รายละเอียดการให้บริการ / Engagement Scope</h2>
              <div style={engagementScopeListStyle}>
                {engagementSections.map((section, index) => <EngagementScopeSubsection key={section.title} title={section.title} value={section.value} withDivider={index > 0} />)}
              </div>
            </section>
          ) : null}

          <section className="quotation-compact-block" style={{ ...panelStyle, marginBottom: 24 }}>
            <h2 style={panelTitleStyle}>รายการค่าบริการ / Fee Items</h2>
            <div style={feeTableWrapStyle}>
              <table style={tableStyle}>
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "38%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "13.5%" }} />
                <col style={{ width: "13.5%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={numberThStyle}>No.</th>
                  <th style={thStyle}>Description</th>
                  <th style={quantityThStyle}><span className="quotation-screen-heading">Quantity</span><span className="quotation-print-heading">Qty</span></th>
                  <th style={rightThStyle}>Unit Price</th>
                  <th style={rightThStyle}>VAT</th>
                  <th style={rightThStyle}><span className="quotation-screen-heading">Amount Before Tax</span><span className="quotation-print-heading">Before Tax</span></th>
                  <th style={rightThStyle}><span className="quotation-screen-heading">Line Total</span><span className="quotation-print-heading">Total</span></th>
                </tr>
              </thead>
              <tbody>
                {displayItems.length === 0 ? (
                  <tr><td style={tdStyle} colSpan={7}>No line items.</td></tr>
                ) : displayItems.map((item, index) => (
                  <tr key={item.id || index}>
                    <td style={numberTdStyle}>{index + 1}</td>
                    <td style={descriptionTdStyle}>{item.description || "-"}</td>
                    <td style={quantityTdStyle}>{formatQuantity(item.quantity)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.unit_price)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.vat_amount)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.amount_before_tax)}</td>
                    <td style={rightTdStyle}>{formatMoney(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </section>

          <section className="quotation-final-section" style={finalSectionStyle}>
            <div className="quotation-keep-together" style={totalsSectionStyle}>
              <div style={termsBoxStyle}>
                <h2 style={sectionTitleStyle}>หมายเหตุและเงื่อนไข / Notes and Conditions</h2>
                {quotation.note ? <p className="quotation-thai-text" style={noteParagraphStyle}>{quotation.note}</p> : null}
                <div className="quotation-thai-text" style={standardConditionsStyle}>
                  <p style={standardConditionStyle}>ใบเสนอราคานี้ไม่ใช่ใบแจ้งหนี้หรือใบเสร็จรับเงิน</p>
                  <p style={standardConditionStyle}>ค่าธรรมเนียมศาล ค่าธรรมเนียมราชการ ค่าเดินทาง ค่าที่พัก ค่าถ่ายเอกสาร ค่าจัดส่ง ค่าแปลเอกสาร และค่าใช้จ่ายอื่นที่สำนักงานสำรองจ่ายแทนลูกค้า ไม่รวมอยู่ในใบเสนอราคานี้ เว้นแต่จะระบุไว้โดยชัดแจ้ง</p>
                  <p style={standardConditionStyle}>การเริ่มงานขึ้นอยู่กับการยืนยันจากลูกความและ/หรือเงื่อนไขการชำระเงินที่คู่สัญญาตกลงกัน</p>
                  <p style={standardConditionStyle}>ใบเสนอราคานี้มีผลถึงวันที่ Valid Until ที่ระบุไว้ข้างต้น</p>
                </div>
              </div>
              <div style={totalsBoxStyle}>
                <TotalLine label="รวมรายการที่มี VAT / Vatable Subtotal" value={displaySubtotalVatable} />
                <TotalLine label="รวมรายการที่ไม่มี VAT / Non-Vatable Subtotal" value={displaySubtotalNonVatable} />
                <TotalLine label="ภาษีมูลค่าเพิ่ม / VAT" value={displayVatAmount} />
                <TotalLine label="จำนวนเงินตามใบเสนอราคา / Quotation Total" value={displayGrandTotal} strong />
              </div>
            </div>

            <PaymentTermsPreview terms={displayPaymentTerms} installments={displayInstallments} allocations={displayAllocations} quotationItems={displayItems} quotationTotal={displayGrandTotal} status={quotation.status} />

            <section className="quotation-signature-group" style={signatureGroupStyle}>
              <h2 className="quotation-signatures-heading" style={signatureSectionTitleStyle}>การลงนาม / Signatures</h2>
              <div className="signature-section" style={signatureGridStyle}>
                <SignatureBlock
                  title="ผู้เสนอราคา / Service Provider"
                  name={signer.name}
                  position={signer.position}
                  email={signer.email}
                  signatureUrl={showSignerSignature ? signerSignatureUrl : ""}
                  signatureImageRef={signerSignatureImageRef}
                  onSignatureError={() => setSignerSignatureUrl("")}
                />
                <SignatureBlock
                  title="ผู้ยอมรับใบเสนอราคา / Client Acceptance"
                  name="____________________"
                  position="____________________"
                  email=""
                  signatureUrl=""
                  signatureImageRef={null}
                  onSignatureError={undefined}
                />
              </div>
            </section>
          </section>
        </article>
      ) : null}
    </div>
  );
}

function PaymentTermsPreview({ terms, installments, allocations, quotationItems, quotationTotal, status }: { terms: PaymentTermsHeaderRow | null; installments: PaymentInstallmentRow[]; allocations: PaymentAllocationRow[]; quotationItems: QuotationItemRow[]; quotationTotal: number | string | null; status: string | null }) {
  if (!terms || installments.length === 0) return <section className="quotation-keep-together" style={{ ...panelStyle, marginTop: 16 }}><h2 style={panelTitleStyle}>เงื่อนไขการชำระเงิน / Payment Terms</h2><p style={noteParagraphStyle}>ไม่ได้บันทึกเงื่อนไขการชำระเงิน / Payment terms not recorded</p></section>;
  const sourceItems = quotationItems.filter((item) => item.id);
  const allocationsFor = (installmentId: string) => allocations.filter((item) => item.payment_installment_id === installmentId);
  const isPerItem = terms.allocation_mode === "per_item";
  const useCompactSummary = !isPerItem && sourceItems.length === 1 && installments.every((installment) => {
    const rows = allocationsFor(installment.id);
    return rows.length === 1 && rows[0].quotation_item_id === sourceItems[0].id;
  });
  const isPercentagePlan = installments.every((installment) => installment.calculation_type === "percentage");
  const heading = installments.length === 1 ? "ชำระเต็มจำนวน 1 งวด" : `แบ่งชำระจำนวน ${installments.length} งวด`;
  const incomplete = String(status || "").toLowerCase() === "draft" && (isPerItem
    ? sourceItems.some((item) => {
      const itemPercentage = allocations
        .filter((allocation) => allocation.quotation_item_id === item.id)
        .reduce((sum, allocation) => sum + Number(allocation.allocation_percentage || 0), 0);
      return Math.abs(itemPercentage - 100) > 0.000001;
    })
    : isPercentagePlan
      ? installments.reduce((sum, installment) => sum + Number(installment.percentage || 0), 0) < 100
      : allocations.reduce((sum, item) => sum + Number(item.allocated_total || 0), 0) < Number(quotationTotal || 0));
  const reconciliationWarnings = installments.flatMap((installment) => {
    const rows = allocationsFor(installment.id);
    const allocationTotals = rows.reduce((sum, row) => ({ beforeVat: roundCurrency(sum.beforeVat + Number(row.allocated_amount_before_tax || 0)), vat: roundCurrency(sum.vat + Number(row.allocated_vat_amount || 0)), total: roundCurrency(sum.total + Number(row.allocated_total || 0)) }), { beforeVat: 0, vat: 0, total: 0 });
    const missingSource = rows.some((row) => !sourceItems.some((item) => item.id === row.quotation_item_id));
    const mismatch = allocationTotals.beforeVat !== roundCurrency(Number(installment.amount_before_tax || 0)) || allocationTotals.vat !== roundCurrency(Number(installment.vat_amount || 0)) || allocationTotals.total !== roundCurrency(Number(installment.total_amount || 0));
    return missingSource || mismatch ? [installment.installment_no] : [];
  });
  return <section className="quotation-payment-terms-section" style={{ ...panelStyle, marginTop: 16 }}>
    {incomplete ? <p className="print-hidden" style={{ ...noteParagraphStyle, color: "#b45309" }}>เงื่อนไขการชำระเงินยังไม่ครบถ้วน</p> : null}
    {String(status || "").toLowerCase() === "draft" && reconciliationWarnings.length > 0 ? <p className="print-hidden" style={{ ...noteParagraphStyle, color: "#b45309" }}>ตรวจพบข้อมูลการจัดสรรงวดที่ {reconciliationWarnings.join(", ")} ไม่สอดคล้องกับยอดที่บันทึกไว้ กรุณาตรวจสอบร่างใบเสนอราคา</p> : null}
    <h2 style={panelTitleStyle}>เงื่อนไขการชำระเงิน / Payment Terms</h2>
    <p className="quotation-thai-text" style={noteParagraphStyle}>{heading} | ยอดรวมตามใบเสนอราคา {formatMoney(quotationTotal)}<br />การเรียกเก็บเป็นไปตามความคืบหน้าของงานและเงื่อนไขที่ระบุในแต่ละงวด</p>
    {terms.client_summary ? <p className="quotation-thai-text" style={noteParagraphStyle}>{terms.client_summary}</p> : null}
    {useCompactSummary ? <>
      <div style={feeTableWrapStyle}><table style={tableStyle}><thead><tr><th style={thStyle}>งวด / Installment</th><th style={thStyle}>เงื่อนไขการเรียกเก็บ / Billing Trigger</th><th style={rightThStyle}>สัดส่วน / Percentage</th><th style={thStyle}>กำหนดชำระ / Payment Due</th><th style={rightThStyle}>ยอดชำระ / Amount</th></tr></thead><tbody>
        {installments.map((installment) => <tr key={installment.id}><td style={tdStyle}>งวดที่ {installment.installment_no}</td><td style={tdStyle}>{paymentTriggerText(installment)}</td><td style={rightTdStyle}>{formatPercentage(installment.percentage)}</td><td style={tdStyle}>{paymentDueText(installment.payment_due_days)}</td><td style={rightTdStyle}>{formatMoney(installment.total_amount)}</td></tr>)}
        <tr><td colSpan={4} style={{ ...tdStyle, fontWeight: 700 }}>ยอดรวมตามใบเสนอราคา / Quotation Total</td><td style={{ ...rightTdStyle, fontWeight: 700 }}>{formatMoney(quotationTotal)}</td></tr>
      </tbody></table></div>
      <p style={noteParagraphStyle}>แต่ละงวดคำนวณจากรายการค่าบริการรายการเดียวตามสัดส่วนที่กำหนด</p>
    </> : installments.map((installment) => {
      const rows = allocationsFor(installment.id);
      return <div key={installment.id} className="quotation-payment-installment" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>งวดที่ {installment.installment_no}{isRedundantTitle(installment.title, installment.installment_no) ? "" : ` - ${installment.title}`}</strong>{isPerItem ? <span>สัดส่วนคำนวณจากรายการที่รวมในงวดนี้</span> : installment.calculation_type === "percentage" ? <span>{formatPercentage(installment.percentage)}</span> : null}</div>
        <p className="quotation-thai-text" style={noteParagraphStyle}><strong>เงื่อนไขการเรียกเก็บ / Billing Trigger:</strong> {paymentTriggerText(installment)}<br /><strong>กำหนดชำระ / Payment Due:</strong> {paymentDueText(installment.payment_due_days)}{installment.client_note ? <><br /><strong>หมายเหตุ / Note:</strong> {installment.client_note}</> : null}</p>
        <div style={feeTableWrapStyle}><table style={tableStyle}><thead><tr><th style={thStyle}>รายการ / Description</th><th style={rightThStyle}>จำนวนเงินก่อน VAT / Before VAT</th><th style={rightThStyle}>VAT</th><th style={rightThStyle}>ยอดรวม / Total</th></tr></thead><tbody>
          {rows.map((row) => { const source = sourceItems.find((item) => item.id === row.quotation_item_id); const noVat = source?.vat_applicable === false; return <tr key={`${installment.id}-${row.quotation_item_id}`} className="quotation-item-row"><td style={descriptionTdStyle}>{source?.description || (String(status).toLowerCase() === "draft" ? "ไม่พบรายการค่าบริการที่เชื่อมโยง" : "-")}</td><td style={rightTdStyle}>{formatMoney(row.allocated_amount_before_tax)}</td><td style={rightTdStyle}>{noVat ? "0.00 (No VAT)" : formatMoney(row.allocated_vat_amount)}</td><td style={rightTdStyle}>{formatMoney(row.allocated_total)}</td></tr>; })}
          <tr className="quotation-installment-total"><td style={{ ...tdStyle, fontWeight: 700 }}>รวมงวดที่ {installment.installment_no} / Installment {installment.installment_no} Total</td><td style={{ ...rightTdStyle, fontWeight: 700 }}>{formatMoney(installment.amount_before_tax)}</td><td style={{ ...rightTdStyle, fontWeight: 700 }}>{formatMoney(installment.vat_amount)}</td><td style={{ ...rightTdStyle, fontWeight: 700 }}>{formatMoney(installment.total_amount)}</td></tr>
        </tbody></table></div>
      </div>;
    })}
  </section>;
}

function paymentTriggerText(installment: PaymentInstallmentRow) {
  if (installment.trigger_type === "quotation_acceptance") return "เมื่อผู้ว่าจ้างตอบรับใบเสนอราคานี้";
  if (installment.trigger_type === "agreement_effective") return "เมื่อข้อตกลงค่าบริการมีผลใช้บังคับ";
  if (installment.trigger_type === "date") return installment.due_date ? `ถึงกำหนดชำระวันที่ ${formatDate(installment.due_date)}` : "ตามวันที่ระบุ";
  return installment.trigger_description || "ตามเงื่อนไขที่ตกลงกัน";
}
function paymentDueText(value: number | string | null) { const days = Number(value || 0); return days > 0 ? `ชำระภายใน ${days} วันนับแต่ได้รับใบแจ้งหนี้` : "ชำระทันทีเมื่อได้รับใบแจ้งหนี้"; }
function formatPercentage(value: number | string | null) { const amount = Number(value || 0); return Number.isFinite(amount) ? `${amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}%` : "-"; }
function roundCurrency(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function isRedundantTitle(title: string, installmentNo: number) { return title.trim().toLowerCase() === `installment ${installmentNo}` || title.trim() === `งวดที่ ${installmentNo}`; }

function InfoLine({ label, value, strong = false, wide = false }: { label: string; value: string; strong?: boolean; wide?: boolean }) {
  return (
    <div style={wide ? wideInfoLineStyle : infoLineStyle}>
      <span style={infoLineLabelStyle}>{label}</span>
      <span style={strong ? strongInfoLineValueStyle : infoLineValueStyle}>{value || "-"}</span>
    </div>
  );
}

function BilingualInfoLine({ label, thaiValue, englishValue, strong = false }: { label: string; thaiValue: string; englishValue: string; strong?: boolean }) {
  const hasThai = Boolean(thaiValue?.trim());
  const hasEnglish = Boolean(englishValue?.trim());
  return (
    <div style={infoLineStyle}>
      <span style={infoLineLabelStyle}>{label}</span>
      <div style={bilingualInfoValueBlockStyle}>
        {hasThai ? <span style={strong ? strongBilingualInfoLineValueStyle : bilingualInfoLineValueStyle}>{thaiValue}</span> : null}
        {hasEnglish ? <span style={englishInfoLineValueStyle}>{englishValue}</span> : null}
        {!hasThai && !hasEnglish ? <span style={infoLineValueStyle}>-</span> : null}
      </div>
    </div>
  );
}

function TotalLine({ label, value, strong = false }: { label: string; value: number | string | null; strong?: boolean }) {
  return (
    <div style={strong ? totalStrongLineStyle : totalLineStyle}>
      <span style={totalLabelStyle}>{label}</span>
      <strong style={strong ? totalStrongValueStyle : totalValueStyle}>{formatMoney(value)}</strong>
    </div>
  );
}

function EngagementScopeSubsection({ title, value, withDivider }: { title: string; value: string; withDivider: boolean }) {
  return (
    <div style={withDivider ? engagementScopeSubsectionDividerStyle : engagementScopeSubsectionStyle}>
      <h3 style={engagementScopeTitleStyle}>{title}</h3>
      <div className="quotation-thai-text" style={documentTextStyle}>{value}</div>
    </div>
  );
}

function LogoMark({ logoUrl, imageRef, onError }: { logoUrl: string; imageRef: React.RefObject<HTMLImageElement | null>; onError: () => void }) {
  if (!logoUrl) return <div className="quotation-logo" style={companyMarkStyle}>VP</div>;
  return <img ref={imageRef} className="quotation-logo quotation-logo-image" src={logoUrl} alt="VP Partners" loading="eager" onError={onError} style={companyLogoStyle} />;
}

function SignatureBlock({ title, name, position, email, signatureUrl, signatureImageRef, onSignatureError }: { title: string; name: string; position: string; email: string; signatureUrl: string; signatureImageRef: React.RefObject<HTMLImageElement | null> | null; onSignatureError?: () => void }) {
  return (
    <div className="quotation-signature-card" style={signatureBlockStyle}>
      <div className="quotation-signature-title" style={signatureTitleStyle}>{title}</div>
      {signatureUrl ? (
        <div className="quotation-signature-viewport" style={signatureViewportStyle}>
          <img ref={signatureImageRef} className="quotation-signature-image" src={signatureUrl} alt="Authorized signer signature" loading="eager" onError={onSignatureError} style={signatureImageStyle} />
        </div>
      ) : <div className="quotation-signature-blank" style={signatureBlankSpaceStyle} />}
      <div style={signatureLineStyle} />
      <div aria-hidden="true" style={signaturePostLineSpacerStyle} />
      <div style={signatureFieldStyle}>Name: {name}</div>
      <div style={signatureFieldStyle}>Position: {position}</div>
      <div className="quotation-signature-email-row" aria-hidden={!email} style={{ ...signatureFieldStyle, visibility: email ? "visible" : "hidden" }}>
        Email: {email || "-"}
      </div>
      <div style={signatureFieldStyle}>Date: ____________________</div>
    </div>
  );
}

function resolveQuotationSigner(quotation: QuotationRow | null, signers: AuthorizedSigner[]) {
  const documentSnapshot = getSnapshotObject(quotation?.document_data_snapshot_json);
  const signerSnapshot = getSnapshotObject(getSnapshotObject(documentSnapshot.commercial).authorized_signer || documentSnapshot.authorized_signer);
  const fallbackSigner = getSignerByKey(signers, quotation?.authorized_signer_key);
  const preferFrozen = isFrozenQuotation(quotation) && Boolean(getSnapshotText(documentSnapshot, "frozen_at"));
  return {
    name: (preferFrozen ? getSnapshotText(signerSnapshot, "name") : quotation?.authorized_signer_name) || getSnapshotText(signerSnapshot, "name") || fallbackSigner.displayName,
    position: (preferFrozen ? getSnapshotText(signerSnapshot, "position") : quotation?.authorized_signer_position) || getSnapshotText(signerSnapshot, "position") || formatSignerPosition(fallbackSigner),
    email: (preferFrozen ? getSnapshotText(signerSnapshot, "email") : quotation?.authorized_signer_email) || getSnapshotText(signerSnapshot, "email") || fallbackSigner.email,
  };
}

async function waitForPrintReadiness(images: Array<HTMLImageElement | null>) {
  const fontsReady = document.fonts?.ready?.catch(() => undefined) || Promise.resolve();
  await Promise.race([
    Promise.all([fontsReady, ...images.map(waitForImage)]),
    new Promise<void>((resolve) => window.setTimeout(resolve, 3_500)),
  ]);
}

async function waitForImage(image: HTMLImageElement | null) {
  if (!image) return;

  if (!image.complete) {
    await new Promise<void>((resolve) => {
      const settle = () => {
        image.removeEventListener("load", settle);
        image.removeEventListener("error", settle);
        resolve();
      };
      image.addEventListener("load", settle, { once: true });
      image.addEventListener("error", settle, { once: true });
    });
  }

  try {
    await image.decode?.();
  } catch {
    // The error handler switches to a safe visual fallback; printing must not wait indefinitely.
  }
}

function getPreviewStatusStyle(status: string | null): React.CSSProperties {
  const normalized = String(status || "draft").toLowerCase();
  if (normalized === "sent") return { color: "#1e40af", background: "#dbeafe", borderColor: "#93c5fd" };
  if (normalized === "accepted") return { color: "#166534", background: "#dcfce7", borderColor: "#86efac" };
  if (normalized === "cancelled") return { color: "#991b1b", background: "#fee2e2", borderColor: "#fca5a5" };
  return { color: "#374151", background: "#f3f4f6", borderColor: "#d1d5db" };
}

function getClientDisplayValue(quotation: QuotationRow | null, client: ClientRow | null, key: keyof ClientRow) {
  const snapshotValue = getSnapshotText(quotation?.client_snapshot_json, key);
  const clientValue = client?.[key];
  if (snapshotValue) return snapshotValue;
  return typeof clientValue === "string" && clientValue.trim() ? clientValue : "-";
}

function getMatterLabel(quotation: QuotationRow | null, caseItem: CaseRow | null, matter: MatterRow | null) {
  if (!quotation) return "-";
  const snapshotType = getSnapshotText(quotation.matter_snapshot_json, "type");
  if (snapshotType === "case") {
    const fileNo = getSnapshotText(quotation.matter_snapshot_json, "file_no");
    const title = getSnapshotText(quotation.matter_snapshot_json, "title");
    return [fileNo, title].filter(Boolean).join(" - ") || String(quotation.case_id || "Case");
  }
  if (snapshotType === "advisory") {
    const matterNo = getSnapshotText(quotation.matter_snapshot_json, "matter_no");
    const title = getSnapshotText(quotation.matter_snapshot_json, "title");
    return [matterNo, title].filter(Boolean).join(" - ") || String(quotation.advisory_matter_id || "Advisory");
  }
  if (caseItem) return [caseItem.file_no, caseItem.title || caseItem.client_name].filter(Boolean).join(" - ") || String(caseItem.id);
  if (matter) return [matter.matter_no, matter.title].filter(Boolean).join(" - ") || matter.id;
  if (quotation.case_id) return `Case: ${quotation.case_id}`;
  if (quotation.advisory_matter_id) return `Advisory: ${quotation.advisory_matter_id}`;
  return "-";
}

function getMatterDescription(quotation: QuotationRow | null, caseItem: CaseRow | null, matter: MatterRow | null) {
  if (!quotation) return "";
  return (
    getSnapshotText(quotation.matter_snapshot_json, "description") ||
    getSnapshotText(quotation.matter_snapshot_json, "title") ||
    caseItem?.title ||
    matter?.title ||
    ""
  );
}

function getSnapshotText(snapshot: Record<string, unknown> | null | undefined, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function getSnapshotObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getSnapshotObjectOrNull(value: unknown): Record<string, unknown> | null {
  const snapshot = getSnapshotObject(value);
  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

function isFrozenQuotation(quotation: QuotationRow | null) {
  return ["sent", "accepted", "cancelled"].includes(String(quotation?.status || "").toLowerCase());
}

function getFrozenMatterLabel(snapshot: Record<string, unknown>) {
  const reference = getSnapshotText(snapshot, "file_no") || getSnapshotText(snapshot, "matter_no");
  return [reference, getSnapshotText(snapshot, "title")].filter(Boolean).join(" - ") || "-";
}

function getFrozenQuotationItems(snapshot: Record<string, unknown>): QuotationItemRow[] {
  const rows = Array.isArray(snapshot.items) ? snapshot.items : [];
  return rows.map((item, index) => {
    const value = getSnapshotObject(item);
    return {
      id: getSnapshotText(value, "quotation_item_id") || `snapshot-item-${index}`,
      description: getSnapshotText(value, "description"), quantity: getSnapshotText(value, "quantity"),
      unit_price: getSnapshotText(value, "unit_price"), amount_before_tax: getSnapshotText(value, "amount_before_tax"),
      vat_applicable: value.vat_applicable === true, price_tax_mode: getSnapshotText(value, "price_tax_mode") as QuotationItemRow["price_tax_mode"], vat_amount: getSnapshotText(value, "vat_amount"),
      line_total: getSnapshotText(value, "line_total"), sort_order: Number(getSnapshotText(value, "sort_order") || index),
    };
  });
}

function getFrozenPaymentTerms(snapshot: Record<string, unknown>) {
  const payment = getSnapshotObject(snapshot.payment_terms);
  if (!Object.keys(payment).length) return { terms: null as PaymentTermsHeaderRow | null, installments: [] as PaymentInstallmentRow[], allocations: [] as PaymentAllocationRow[] };
  const installments = (Array.isArray(payment.installments) ? payment.installments : []).map((row, index) => {
    const item = getSnapshotObject(row);
    return {
      id: `snapshot-installment-${index}`, installment_no: Number(getSnapshotText(item, "installment_no") || index + 1), title: getSnapshotText(item, "title"),
      calculation_type: getSnapshotText(item, "calculation_type"), percentage: getSnapshotText(item, "percentage") || null,
      trigger_type: getSnapshotText(item, "trigger_type"), trigger_description: getSnapshotText(item, "trigger_description") || null,
      due_date: getSnapshotText(item, "due_date") || null, payment_due_days: getSnapshotText(item, "payment_due_days") || 0,
      client_note: getSnapshotText(item, "client_note") || null, amount_before_tax: getSnapshotText(item, "amount_before_tax"),
      vat_amount: getSnapshotText(item, "vat_amount"), total_amount: getSnapshotText(item, "total_amount"),
    } as PaymentInstallmentRow;
  });
  const allocations = installments.flatMap((installment, installmentIndex) => {
    const source = getSnapshotObject((Array.isArray(payment.installments) ? payment.installments : [])[installmentIndex]);
    const items = Array.isArray(source.items) ? source.items : [];
    return items.map((row, index) => {
      const item = getSnapshotObject(row);
      return { payment_installment_id: installment.id, quotation_item_id: getSnapshotText(item, "quotation_item_id"), allocated_amount_before_tax: getSnapshotText(item, "allocated_amount_before_tax"), allocated_vat_amount: getSnapshotText(item, "allocated_vat_amount"), allocated_total: getSnapshotText(item, "allocated_total"), allocation_percentage: getSnapshotText(item, "allocation_percentage") || null, sort_order: index };
    });
  });
  return { terms: { id: "snapshot-payment-terms", payment_method_type: getSnapshotText(payment, "payment_method_type"), allocation_mode: (getSnapshotText(payment, "allocation_mode") === "per_item" ? "per_item" : "proportional_all_items") as PaymentTermsHeaderRow["allocation_mode"], client_summary: getSnapshotText(payment, "client_summary") || null }, installments, allocations };
}

function resolveCompanyProfile(snapshot: Record<string, unknown> | null, currentCompany: CompanyProfile): CompanyProfile {
  if (!snapshot) return currentCompany;
  const companyNameTh = getSnapshotText(snapshot, "company_name_th") || currentCompany.companyNameTh;
  const companyNameEn = getSnapshotText(snapshot, "company_name_en") || currentCompany.companyNameEn;
  const addressTh = getSnapshotText(snapshot, "address_th") || currentCompany.addressTh;
  const branchTh = getSnapshotText(snapshot, "branch_th") || getSnapshotText(snapshot, "branch_label") || currentCompany.branchTh;

  return {
    nameTh: companyNameTh,
    nameEn: companyNameEn,
    companyNameTh,
    companyNameEn,
    taxId: getSnapshotText(snapshot, "tax_id") || currentCompany.taxId,
    branchLabel: branchTh,
    branchTh,
    branchEn: getSnapshotText(snapshot, "branch_en") || currentCompany.branchEn,
    address: addressTh,
    addressTh,
    addressEn: getSnapshotText(snapshot, "address_en") || currentCompany.addressEn,
    phone: getSnapshotText(snapshot, "phone") || currentCompany.phone,
    email: getSnapshotText(snapshot, "email") || currentCompany.email,
    website: getSnapshotText(snapshot, "website") || currentCompany.website,
    description: getSnapshotText(snapshot, "description") || currentCompany.description,
    quotationPrefix: getSnapshotText(snapshot, "quotation_prefix") || currentCompany.quotationPrefix,
    logoStoragePath: getSnapshotText(snapshot, "logo_storage_path") || currentCompany.logoStoragePath || null,
    logoPath: currentCompany.logoPath,
  };
}

function formatDate(value: string | null) {
  return value ? String(value).slice(0, 10) : "-";
}

function formatQuantity(value: number | string | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatMoney(value: number | string | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
}

const printCss = `
  .quotation-print-heading {
    display: none;
  }
  .quotation-thai-text {
    word-break: normal;
    overflow-wrap: normal;
    hyphens: none;
    line-break: auto;
    text-wrap: pretty;
  }
  @media print {
    @page {
      size: A4;
      margin: 10mm;
    }
    html,
    body {
      background: #ffffff !important;
      padding-left: 0 !important;
    }
    body:has(.quotation-preview-shell) > *:not(main),
    main:has(.quotation-preview-shell) > *:not(.quotation-preview-shell),
    .quotation-preview-shell > :not(.quotation-print-document) {
      display: none !important;
    }
    main:has(.quotation-preview-shell) {
      max-width: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .quotation-print-document {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      min-height: auto !important;
      margin: 0 auto !important;
      box-shadow: none !important;
      border: none !important;
      padding: 0 !important;
      page-break-after: avoid;
      color: #111827 !important;
      font-size: 10.5pt !important;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .quotation-print-document header {
      margin-bottom: 10px !important;
      padding-bottom: 10px !important;
    }
    .quotation-print-document table {
      page-break-inside: auto;
    }
    .quotation-print-document tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .quotation-print-document th,
    .quotation-print-document td {
      padding: 5px 7px !important;
    }
    .quotation-screen-heading {
      display: none;
    }
    .quotation-print-heading {
      display: inline;
    }
    .quotation-compact-block {
      margin-bottom: 9px !important;
    }
    .quotation-keep-together {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-top: 0 !important;
    }
    .quotation-payment-installment > :first-child,
    .quotation-payment-installment > p {
      break-after: avoid;
      page-break-after: avoid;
    }
    .quotation-installment-total {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .quotation-final-section {
      gap: 5.5mm !important;
    }
    .quotation-signature-group {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-top: 0 !important;
      margin-bottom: 4mm !important;
    }
    .quotation-signatures-heading {
      margin-bottom: 3mm !important;
    }
    .signature-section {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-top: 0 !important;
      gap: 4.5mm !important;
    }
    .signature-section > div {
      height: auto !important;
      min-height: 0 !important;
      align-self: start !important;
      grid-template-rows: 6mm 22mm 0.3mm 3mm 5mm 5mm 5mm 5mm !important;
      padding: 4mm !important;
    }
    .quotation-signature-title {
      margin-bottom: 0 !important;
    }
    .quotation-logo-image,
    .quotation-signature-image {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      object-fit: contain !important;
    }
    .quotation-logo-image {
      width: 28mm !important;
      height: 28mm !important;
    }
    .quotation-signature-image {
      width: auto !important;
      height: auto !important;
      max-width: 100% !important;
      max-height: 100% !important;
      margin-left: 6mm !important;
      object-position: left bottom !important;
    }
    .quotation-signature-viewport,
    .quotation-signature-blank {
      width: 62mm !important;
      height: 22mm !important;
      margin-bottom: 0 !important;
      overflow: visible !important;
    }
  }
`;

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 16,
};
const printHintStyle: React.CSSProperties = { color: "#6B7280", fontSize: 12, fontWeight: 700, marginRight: "auto" };
const signatureToggleStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#374151" };

const documentStyle: React.CSSProperties = {
  maxWidth: 920,
  margin: "0 auto",
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  boxShadow: "none",
  padding: "40px 42px",
};

const documentHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  borderBottom: "2px solid #16A344",
  paddingBottom: 16,
  marginBottom: 24,
};

const providerHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
};

const companyMarkStyle: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 8,
  background: "#111827",
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontSize: 21,
  fontWeight: 900,
  flex: "0 0 auto",
};
const companyLogoStyle: React.CSSProperties = {
  width: 88,
  height: 88,
  display: "block",
  objectFit: "contain",
  background: "transparent",
  flex: "0 0 auto",
};

const companyNameThaiStyle: React.CSSProperties = { fontSize: 17, fontWeight: 800, lineHeight: 1.4, color: "#1f2937" };
const companyNameStyle: React.CSSProperties = { marginTop: 1, fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: "#374151" };
const companyMetaStyle: React.CSSProperties = { marginTop: 4, fontSize: 12, color: "#6b7280", fontWeight: 400 };
const documentTitleBlockStyle: React.CSSProperties = { textAlign: "right", minWidth: 220 };
const documentTitleStyle: React.CSSProperties = { margin: 0, fontSize: 29, fontWeight: 800, letterSpacing: 0, color: "#15803D" };
const documentSubtitleStyle: React.CSSProperties = { marginTop: 2, fontSize: 14, color: "#6B7280", fontWeight: 500 };
const statusStyle: React.CSSProperties = {
  marginTop: 8,
  display: "inline-block",
  textTransform: "capitalize",
  fontWeight: 700,
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 11.5,
};

const topGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginBottom: 18,
};

const panelStyle: React.CSSProperties = {
  border: "1px solid #e1e7e3",
  borderRadius: 6,
  padding: 16,
  minWidth: 0,
  marginBottom: 0,
};

const panelTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  fontWeight: 800,
  color: "#15803D",
};

const clientGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 24,
};

const infoLineStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "132px minmax(0, 1fr)",
  gap: 10,
  padding: "6px 0",
  borderBottom: "1px solid #f1f5f2",
  fontSize: 12,
};

const wideInfoLineStyle: React.CSSProperties = { ...infoLineStyle, gridColumn: "span 2" };
const infoLineLabelStyle: React.CSSProperties = { color: "#6b7280", fontWeight: 600 };
const infoLineValueStyle: React.CSSProperties = { color: "#1f2937", fontWeight: 400, lineHeight: 1.55, overflowWrap: "anywhere" };
const strongInfoLineValueStyle: React.CSSProperties = { ...infoLineValueStyle, fontWeight: 700 };
const bilingualInfoValueBlockStyle: React.CSSProperties = { display: "grid", gap: 3, minWidth: 0 };
const bilingualInfoLineValueStyle: React.CSSProperties = { ...infoLineValueStyle, whiteSpace: "pre-line" };
const strongBilingualInfoLineValueStyle: React.CSSProperties = { ...strongInfoLineValueStyle, whiteSpace: "pre-line" };
const englishInfoLineValueStyle: React.CSSProperties = { ...bilingualInfoLineValueStyle, color: "#6b7280", fontSize: 11.5 };

const sectionTitleStyle: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 800, color: "#1f2937" };
const documentTextStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.72,
  whiteSpace: "pre-wrap",
  color: "#1F2937",
  fontWeight: 400,
};
const engagementScopeListStyle: React.CSSProperties = { display: "grid", gap: 0 };
const engagementScopeSubsectionStyle: React.CSSProperties = { breakInside: "avoid" };
const engagementScopeSubsectionDividerStyle: React.CSSProperties = { ...engagementScopeSubsectionStyle, borderTop: "1px solid #edf0ee", paddingTop: 12, marginTop: 12 };
const engagementScopeTitleStyle: React.CSSProperties = { margin: "0 0 8px", fontSize: 13, fontWeight: 700, lineHeight: 1.45, color: "#374151" };
const feeTableWrapStyle: React.CSSProperties = { marginTop: 2, minWidth: 0 };

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #bbf7d0",
  background: "#F0FDF4",
  fontSize: 10.5,
  color: "#1f2937",
  fontWeight: 800,
};
const numberThStyle: React.CSSProperties = { ...thStyle, textAlign: "center", whiteSpace: "nowrap" };
const quantityThStyle: React.CSSProperties = { ...thStyle, textAlign: "center", whiteSpace: "nowrap" };
const rightThStyle: React.CSSProperties = { ...thStyle, textAlign: "right", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "11px 8px", borderBottom: "1px solid #edf0ee", fontSize: 11.5, verticalAlign: "top", fontWeight: 400 };
const numberTdStyle: React.CSSProperties = { ...tdStyle, textAlign: "center", whiteSpace: "nowrap" };
const quantityTdStyle: React.CSSProperties = { ...tdStyle, textAlign: "center", whiteSpace: "nowrap" };
const descriptionTdStyle: React.CSSProperties = { ...tdStyle, wordBreak: "normal", overflowWrap: "normal", hyphens: "none", lineHeight: 1.55 };
const rightTdStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", whiteSpace: "nowrap" };

const totalsSectionStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 58fr) minmax(0, 42fr)",
  gap: 18,
  alignItems: "start",
};
const finalSectionStyle: React.CSSProperties = { display: "grid", gap: 24, marginTop: 18 };

const termsBoxStyle: React.CSSProperties = {
  border: "1px solid #e1e7e3",
  borderRadius: 6,
  padding: 14,
};
const noteParagraphStyle: React.CSSProperties = { margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.65, whiteSpace: "pre-wrap", fontWeight: 400 };
const standardConditionsStyle: React.CSSProperties = { display: "grid", gap: 10, margin: 0 };
const standardConditionStyle: React.CSSProperties = { margin: 0, fontSize: 12.2, lineHeight: 1.6, fontWeight: 400 };
const totalsBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  border: "1px solid #cce8d5",
  borderRadius: 6,
  padding: 12,
  background: "#F0FDF4",
};
const totalLineStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 14, fontSize: 12.5, lineHeight: 1.5, color: "#374151" };
const totalStrongLineStyle: React.CSSProperties = { ...totalLineStyle, borderTop: "1px solid #16A344", paddingTop: 9, marginTop: 2, fontSize: 15, color: "#15803D" };
const totalLabelStyle: React.CSSProperties = { flex: "1 1 0", minWidth: 0, wordBreak: "normal", overflowWrap: "normal", hyphens: "none" };
const totalValueStyle: React.CSSProperties = { flex: "0 0 auto", whiteSpace: "nowrap", textAlign: "right" };
const totalStrongValueStyle: React.CSSProperties = { ...totalValueStyle, color: "#15803D" };

const signatureGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 0,
  alignItems: "start",
};

const signatureGroupStyle: React.CSSProperties = { breakInside: "avoid", margin: 0, marginBottom: 16 };
const signatureSectionTitleStyle: React.CSSProperties = { ...panelTitleStyle, marginBottom: 12 };

const signatureBlockStyle: React.CSSProperties = {
  border: "1px solid #d9e1dc",
  borderRadius: 6,
  minHeight: 0,
  boxSizing: "border-box",
  display: "grid",
  gridTemplateRows: "22px 92px 1px 10px 22px 22px 22px 22px",
  padding: 16,
};
const signatureTitleStyle: React.CSSProperties = { alignSelf: "start", fontSize: 13, fontWeight: 800, lineHeight: "22px", margin: 0, color: "#15803D" };
const signatureViewportStyle: React.CSSProperties = { width: 252, height: 92, display: "flex", alignItems: "flex-end", overflow: "visible" };
const signatureImageStyle: React.CSSProperties = { display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", marginLeft: 24, objectFit: "contain", objectPosition: "left bottom", background: "transparent" };
const signatureBlankSpaceStyle: React.CSSProperties = { width: 252, height: 92 };
const signatureLineStyle: React.CSSProperties = { borderBottom: "1px solid #111827" };
const signaturePostLineSpacerStyle: React.CSSProperties = { height: 10 };
const signatureFieldStyle: React.CSSProperties = { display: "flex", alignItems: "center", fontSize: 12, lineHeight: "22px", color: "#374151" };

const primaryButtonStyle: React.CSSProperties = { border: "1px solid #111827", background: "#111827", color: "#ffffff", borderRadius: 6, padding: "9px 12px", fontWeight: 800, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid #d1d5db", background: "#ffffff", color: "#111827", borderRadius: 6, padding: "9px 12px", fontWeight: 800, textDecoration: "none" };
const messageStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: 18, fontWeight: 800 };
const errorStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: 18, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontWeight: 800 };
