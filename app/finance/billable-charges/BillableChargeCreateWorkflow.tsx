"use client";

import { useI18n } from "../../../lib/i18n/provider";
import { uiMessage, type UiLocale, type UiMessage } from "../../../lib/i18n/core";
import { translate } from "../../../lib/i18n/catalog";
import { VatTreatmentInput } from "../document-decision/vat-input";
import type { VatEvidence } from "../document-decision/shared";

import { useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { calculateFinanceLineAmounts, type FinancePriceTaxMode } from "../finance-line-amounts";
import { billableChargeNatureLabel, clientCostFundingModeLabel, clientCostFundingModeRequired, fundingModeForSource, type ClientCostFundingMode } from "./funding-semantics";
import styles from "./billable-charges.module.css";

export type BillableChargeClientOption = { id: string; name: string | null; client_type: string | null };
export type BillableChargeCaseOption = { id: number; client_id: string | null; file_no: string | null; title: string | null };
export type BillableChargeAdvisoryOption = { id: string; client_id: string | null; matter_no: string | null; title: string | null };
export type BillableChargeContext = {
  clientId: string;
  clientName: string;
  caseId: number | null;
  advisoryMatterId: string | null;
  matterLabel: string;
  entryPointLabel?: string;
};
export type CreatedBillableCharge = {
  id: string;
  status: string;
  client_id: string;
  case_id: number | null;
  advisory_matter_id: string | null;
  client_cost_funding_mode: ClientCostFundingMode | null;
  total_amount: number | string;
};

type EconomicClassification = "professional_fee" | "additional_service" | "reimbursable_expense" | "government_or_court_fee" | "other";
type MatterMode = "unlinked" | "case" | "advisory";
type ChargeForm = {
  vatTreatment?: VatEvidence | null;
  sourceType: "ad_hoc_service" | "recoverable_cost";
  clientCostFundingMode: "" | ClientCostFundingMode;
  clientId: string;
  matterMode: MatterMode;
  caseId: string;
  advisoryMatterId: string;
  serviceDate: string;
  description: string;
  quantity: string;
  unit: string;
  unitRate: string;
  economicClassification: "" | EconomicClassification;
  priceTaxMode: FinancePriceTaxMode;
  vatRate: string;
  sourceReference: string;
  taxCategory: string;
};

type Props = {
  clients?: BillableChargeClientOption[];
  cases?: BillableChargeCaseOption[];
  advisories?: BillableChargeAdvisoryOption[];
  context?: BillableChargeContext;
  canManage: boolean;
  canApprove: boolean;
  onSaved?: (charge: CreatedBillableCharge) => void | Promise<void>;
  onReady?: (charge: CreatedBillableCharge) => void | Promise<void>;
  readyActionLabel?: string;
  onReadyAction?: () => void;
};

export default function BillableChargeCreateWorkflow({
  clients = [],
  cases = [],
  advisories = [],
  context,
  canManage,
  canApprove,
  onSaved,
  onReady,
  readyActionLabel,
  onReadyAction,
}: Props) {
  const { locale, t, text } = useI18n();

  const initialForm = useMemo(() => emptyForm(context), [context]);
  const [form, setForm] = useState<ChargeForm>(initialForm);
  const [baseline, setBaseline] = useState(() => fingerprint(initialForm));
  const [charge, setCharge] = useState<CreatedBillableCharge | null>(null);
  const [errors, setErrors] = useState<Record<string, UiMessage | "">>({});
  const [message, setMessage] = useState<UiMessage | string>("");
  const [error, setError] = useState<UiMessage | string>("");
  const [saving, setSaving] = useState(false);
  const [readyAcknowledged, setReadyAcknowledged] = useState(false);
  const actionLockRef = useRef(false);
  const requestRef = useRef<{ requestId: string; payload: Record<string, unknown> } | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const dirty = fingerprint(form) !== baseline;
  const amounts = useMemo(() => calculateAmounts(form), [form]);
  const clientCases = cases.filter((item) => item.client_id === form.clientId);
  const clientAdvisories = advisories.filter((item) => item.client_id === form.clientId);

  const updateForm = <K extends keyof ChargeForm>(field: K, value: ChargeForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setMessage("");
  };

  const updateSourceType = (sourceType: ChargeForm["sourceType"]) => {
    setForm((current) => ({
      ...current,
      sourceType,
      clientCostFundingMode: sourceType === "recoverable_cost" ? current.clientCostFundingMode : "",
    }));
    setErrors((current) => ({ ...current, sourceType: "", clientCostFundingMode: "" }));
    setMessage("");
  };

  const reloadCharge = async (id: string) => {
    const result = await supabase
      .from("finance_billable_charges")
      .select("id,status,client_id,case_id,advisory_matter_id,client_cost_funding_mode,total_amount")
      .eq("id", id)
      .single();
    if (result.error) throw result.error;
    const authoritative = result.data as CreatedBillableCharge;
    setCharge(authoritative);
    return authoritative;
  };

  const saveDraft = async () => {
    const nextErrors = validateDraft(form);
    setErrors(nextErrors);
    if (actionLockRef.current || Object.keys(nextErrors).length || !canManage) {
      focusFirstError(nextErrors, locale);
      return;
    }
    actionLockRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let chargeId = charge?.id || "";
      if (!chargeId) {
        if (!requestRef.current) {
          const requestId = crypto.randomUUID();
          requestRef.current = {
            requestId,
            payload: {
              p_client_id: form.clientId,
              p_case_id: form.matterMode === "case" ? Number(form.caseId) : null,
              p_advisory_matter_id: form.matterMode === "advisory" ? form.advisoryMatterId : null,
              p_source_type: form.sourceType,
              p_client_cost_funding_mode: fundingModeForSource(form.sourceType, form.clientCostFundingMode),
              p_source_reference: nullable(form.sourceReference),
              p_source_event_key: null,
              p_source_snapshot_json: {},
              p_request_id: requestId,
            },
          };
        }
        const createResult = await supabase.rpc("create_finance_billable_charge_draft", requestRef.current.payload);
        if (createResult.error) throw createResult.error;
        chargeId = String(createResult.data);
      }
      const saveResult = await supabase.rpc("save_finance_billable_charge_draft", {
        p_charge_id: chargeId,
        p_client_id: form.clientId,
        p_case_id: form.matterMode === "case" ? Number(form.caseId) : null,
        p_advisory_matter_id: form.matterMode === "advisory" ? form.advisoryMatterId : null,
        p_client_cost_funding_mode: fundingModeForSource(form.sourceType, form.clientCostFundingMode),
        p_source_reference: nullable(form.sourceReference),
        p_source_snapshot_json: { vat_treatment_json: form.vatTreatment || null },
        p_description: nullable(form.description),
        p_quantity: Number(form.quantity),
        p_unit: nullable(form.unit),
        p_unit_rate: Number(form.unitRate || 0),
        p_currency: "THB",
        p_service_date: form.serviceDate || null,
        p_economic_classification: form.economicClassification || null,
        p_price_tax_mode: form.priceTaxMode,
        p_vat_rate: form.priceTaxMode === "non_vat" ? 0 : Number(form.vatRate),
        p_tax_category: nullable(form.taxCategory),
      });
      if (saveResult.error) throw saveResult.error;
      const authoritative = await reloadCharge(chargeId);
      setBaseline(fingerprint(form));
      setMessage(uiMessage("finance.charge.ui.saved"));
      await onSaved?.(authoritative);
      window.requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (caught) {
      console.error("SAVE BILLABLE CHARGE DRAFT FAILED", caught);
      setError(chargeError(caught, uiMessage("finance.charge.ui.saveFailed")));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  const markReady = async () => {
    const nextErrors = validateReady(form);
    if (dirty) nextErrors.ready = uiMessage("finance.charge.ui.saveBeforeReadyDirty");
    if (!charge) nextErrors.ready = uiMessage("finance.charge.ui.saveBeforeReady");
    if (!readyAcknowledged) nextErrors.acknowledgement = uiMessage("finance.charge.ui.reviewRequired");
    setErrors(nextErrors);
    if (actionLockRef.current || Object.keys(nextErrors).length || !canApprove || !charge) {
      focusFirstError(nextErrors, locale);
      return;
    }
    actionLockRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await supabase.rpc("mark_finance_billable_charge_ready", { p_charge_id: charge.id, p_human_confirmed: true });
      if (result.error) throw result.error;
      const authoritative = await reloadCharge(charge.id);
      setReadyAcknowledged(false);
      setMessage(uiMessage("finance.charge.ui.readySuccess"));
      await onReady?.(authoritative);
    } catch (caught) {
      console.error("MARK BILLABLE CHARGE READY FAILED", caught);
      setError(chargeError(caught, uiMessage("finance.charge.ui.readyFailed")));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  if (charge?.status === "ready_to_invoice") {
    return <section className={styles.reviewZone} aria-live="polite">
      <div><span className={styles.eyebrow}>{t("finance.invoice.ui.readyToInvoice")}</span><h3>{t("finance.charge.ui.confirmed")}</h3><p>{t("finance.charge.ui.confirmedHelp")}</p></div>
      <ReviewGrid form={form} amounts={amounts} clients={clients} cases={cases} advisories={advisories} context={context} />
      {readyActionLabel && onReadyAction ? <button className={styles.primaryButton} type="button" onClick={onReadyAction}>{readyActionLabel}</button> : null}
    </section>;
  }

  return <div>
    {error ? <div className={styles.errorBanner}>{text(error)}</div> : null}
    {message ? <div className={styles.successBanner}>{text(message)}</div> : null}
    {context ? <div className={styles.editorReturn}>
      <div><strong>{context.clientName}</strong><span>{context.matterLabel}</span>{context.entryPointLabel ? <span>{context.entryPointLabel}</span> : null}</div>
      <div className={styles.workflowMeaning}><strong>{t("finance.invoice.ui.additionalCharges")}</strong><span>{t("finance.charge.ui.outsideInstallmentHelp")}</span><span>{t("finance.charge.ui.creationNotInvoice")}</span></div>
    </div> : null}

    <fieldset className={styles.sourceChoices}><legend>{t("finance.charge.ui.nature")}</legend><label className={form.sourceType === "ad_hoc_service" ? styles.choiceActive : ""}><input type="radio" name="newChargeSourceType" disabled={!canManage || Boolean(charge)} checked={form.sourceType === "ad_hoc_service"} onChange={() => updateSourceType("ad_hoc_service")} /><span><strong>{t("finance.charge.ui.additionalNature")}</strong><small>{t("finance.charge.ui.additionalNatureHelp")}</small></span></label><label className={form.sourceType === "recoverable_cost" ? styles.choiceActive : ""}><input type="radio" name="newChargeSourceType" disabled={!canManage || Boolean(charge)} checked={form.sourceType === "recoverable_cost"} onChange={() => updateSourceType("recoverable_cost")} /><span><strong>{t("finance.charge.ui.recoverableNature")}</strong><small>{t("finance.charge.ui.recoverableNatureHelp")}</small></span></label></fieldset>

    {form.sourceType === "recoverable_cost" ? <><fieldset id="billable-charge-funding-mode" className={`${styles.sourceChoices} ${errors.clientCostFundingMode ? styles.invalidChoices : ""}`}><legend>{t("finance.charge.ui.fundingMode")}</legend><label className={form.clientCostFundingMode === "collect_before_disbursement" ? styles.choiceActive : ""}><input type="radio" name="newChargeFundingMode" disabled={!canManage} checked={form.clientCostFundingMode === "collect_before_disbursement"} onChange={() => updateForm("clientCostFundingMode", "collect_before_disbursement")} /><span><strong>{t("finance.charge.ui.collectFunding")}</strong><small>{t("finance.charge.ui.notAdvanced")}</small></span></label><label className={form.clientCostFundingMode === "reimburse_after_advance" ? styles.choiceActive : ""}><input type="radio" name="newChargeFundingMode" disabled={!canManage} checked={form.clientCostFundingMode === "reimburse_after_advance"} onChange={() => updateForm("clientCostFundingMode", "reimburse_after_advance")} /><span><strong>{t("finance.charge.ui.advanceFunding")}</strong><small>{t("finance.charge.ui.alreadyAdvanced")}</small></span></label></fieldset>{errors.clientCostFundingMode ? <p className={styles.fieldError}>{text(errors.clientCostFundingMode)}</p> : null}</> : null}

    {!context ? <><div className={styles.formGrid}><Field label={t("finance.invoice.ui.customer")} error={errors.clientId}><select disabled={!canManage} value={form.clientId} onChange={(event) => { setForm((current) => ({ ...current, clientId: event.target.value, matterMode: "unlinked", caseId: "", advisoryMatterId: "" })); setErrors((current) => ({ ...current, clientId: "", matter: "" })); }}><option value="">{t("finance.invoice.composer.selectClient")}</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || t("finance.invoice.composer.unnamedClient")}</option>)}</select></Field><Field label={t("finance.charge.ui.serviceDate")} error={errors.serviceDate}><input disabled={!canManage} type="date" value={form.serviceDate} onChange={(event) => updateForm("serviceDate", event.target.value)} /></Field></div><div id="billable-charge-matter" className={styles.matterSection}><span className={styles.fieldHeading}>{t("finance.charge.ui.matterLink")}</span><div className={styles.segmented}><button disabled={!canManage} type="button" className={form.matterMode === "unlinked" ? styles.segmentActive : ""} onClick={() => setMatterMode(setForm, setErrors, "unlinked")}>{t("finance.invoice.composer.generalContext")}</button><button disabled={!canManage} type="button" className={form.matterMode === "case" ? styles.segmentActive : ""} onClick={() => setMatterMode(setForm, setErrors, "case")}>{t("finance.charge.ui.case")}</button><button disabled={!canManage} type="button" className={form.matterMode === "advisory" ? styles.segmentActive : ""} onClick={() => setMatterMode(setForm, setErrors, "advisory")}>{t("finance.charge.ui.advisory")}</button></div>{form.matterMode === "case" ? <Field label={t("finance.charge.ui.selectCase")} error={errors.matter}><select disabled={!canManage} value={form.caseId} onChange={(event) => updateForm("caseId", event.target.value)}><option value="">{t("finance.charge.ui.selectClientCase")}</option>{clientCases.map((item) => <option key={item.id} value={item.id}>{caseLabel(item, locale)}</option>)}</select></Field> : null}{form.matterMode === "advisory" ? <Field label={t("finance.charge.ui.selectAdvisory")} error={errors.matter}><select disabled={!canManage} value={form.advisoryMatterId} onChange={(event) => updateForm("advisoryMatterId", event.target.value)}><option value="">{t("finance.charge.ui.selectClientAdvisory")}</option>{clientAdvisories.map((item) => <option key={item.id} value={item.id}>{advisoryLabel(item, locale)}</option>)}</select></Field> : null}</div></> : <div className={styles.formGrid}><Field label={t("finance.charge.ui.serviceDate")} error={errors.serviceDate}><input disabled={!canManage} type="date" value={form.serviceDate} onChange={(event) => updateForm("serviceDate", event.target.value)} /></Field></div>}

    <div className={styles.formGrid}><Field label={t("finance.invoice.ui.item")} error={errors.description} wide><textarea disabled={!canManage} rows={3} value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder={t("finance.charge.ui.descriptionPlaceholder")} /></Field><Field label={t("finance.charge.ui.quantity")} error={errors.quantity}><input disabled={!canManage} inputMode="decimal" value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} /></Field><Field label={t("finance.invoice.ui.unit")} error={errors.unit}><input disabled={!canManage} value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder={t("finance.charge.ui.unitPlaceholder")} /></Field><Field label={t("finance.charge.ui.unitRate")} error={errors.unitRate}><input disabled={!canManage} inputMode="decimal" value={form.unitRate} onChange={(event) => updateForm("unitRate", event.target.value)} placeholder="0.00" /></Field><Field label={t("finance.invoice.ui.classification")} error={errors.economicClassification}><select disabled={!canManage} value={form.economicClassification} onChange={(event) => updateForm("economicClassification", event.target.value as ChargeForm["economicClassification"])}><option value="">{t("finance.charge.ui.selectClassification")}</option><option value="professional_fee">{t("finance.invoice.classification.professional_fee")}</option><option value="additional_service">{t("finance.invoice.classification.additional_service")}</option><option value="reimbursable_expense">{t("finance.invoice.classification.reimbursable_expense")}</option><option value="government_or_court_fee">{t("finance.invoice.classification.government_or_court_fee")}</option><option value="other">{t("finance.invoice.classification.other")}</option></select></Field><Field label={t("finance.charge.ui.vatMode")} error={errors.priceTaxMode}><select disabled={!canManage} value={form.priceTaxMode} onChange={(event) => { const mode = event.target.value as FinancePriceTaxMode; setForm((current) => ({ ...current, vatTreatment: null, priceTaxMode: mode, vatRate: mode === "non_vat" ? "0" : Number(current.vatRate) > 0 ? current.vatRate : "7" })); }}><option value="non_vat">{t("finance.invoice.ui.noVat")}</option><option value="vat_exclusive">{t("finance.charge.ui.vatExclusive")}</option><option value="vat_inclusive">{t("finance.charge.ui.vatInclusive")}</option></select></Field>{form.priceTaxMode !== "non_vat" ? <Field label={t("finance.charge.ui.vatRate")} error={errors.vatRate}><input disabled={!canManage} inputMode="decimal" value={form.vatRate} onChange={(event) => setForm(current => ({ ...current, vatTreatment: null, vatRate: event.target.value }))} /></Field> : null}
              <VatTreatmentInput disabled={!canManage} value={form.vatTreatment} applicable={form.priceTaxMode !== "non_vat"} rate={form.priceTaxMode === "non_vat" ? 0 : Number(form.vatRate)} onChange={vatTreatment => setForm(current => ({ ...current, vatTreatment }))} /></div>
    <section className={styles.additionalSection}><div className={styles.additionalHeading}><h3>{t("finance.charge.ui.additionalInformation")}</h3><p>{t("finance.charge.ui.optionalEvidence")}</p></div><div className={styles.formGrid}><Field label={t("finance.charge.ui.sourceReference")}><input disabled={!canManage} value={form.sourceReference} onChange={(event) => updateForm("sourceReference", event.target.value)} /></Field>
                <Field label={t("finance.charge.ui.taxInformation")}><input disabled={!canManage} value={form.taxCategory} onChange={(event) => updateForm("taxCategory", event.target.value)} /></Field></div></section>
    <AmountReview form={form} amounts={amounts} />
    <div className={styles.saveRow}><span className={dirty ? styles.unsavedState : styles.savedState}>{dirty ? t("finance.charge.ui.unsaved") : charge ? t("finance.charge.ui.draftSaved") : t("finance.charge.ui.notCreated")}</span><button className={styles.secondaryButton} type="button" disabled={saving || !dirty || !canManage} onClick={() => void saveDraft()}>{saving ? t("finance.invoice.ui.saving") : t("finance.charge.ui.saveDraft")}</button></div>
    {charge ? <section ref={reviewRef} className={styles.reviewZone} tabIndex={-1}><div><span className={styles.eyebrow}>{t("finance.charge.ui.review")}</span><h3>{t("finance.charge.ui.reviewBeforeReady")}</h3><p>{t("finance.charge.ui.reviewHelp")}</p></div><ReviewGrid form={form} amounts={amounts} clients={clients} cases={cases} advisories={advisories} context={context} />{errors.ready ? <p className={styles.fieldError}>{text(errors.ready)}</p> : null}<label id="billable-charge-acknowledgement" className={errors.acknowledgement ? styles.invalidCheck : styles.checkLabel}><input type="checkbox" checked={readyAcknowledged} onChange={(event) => { setReadyAcknowledged(event.target.checked); setErrors((current) => ({ ...current, acknowledgement: "" })); }} /><span>{t("finance.charge.ui.readyAcknowledgement")}</span></label>{errors.acknowledgement ? <p className={styles.fieldError}>{text(errors.acknowledgement)}</p> : null}<button className={styles.primaryButton} type="button" disabled={saving || dirty || !canApprove} onClick={() => void markReady()}>{t("finance.invoice.ui.audit.ready")}</button>{!canApprove ? <p className={styles.permissionNote}>{t("finance.charge.ui.approvalPermission")}</p> : null}</section> : null}
  </div>;
}

function Field({ label, error, wide, children }: { label: string; error?: UiMessage | ""; wide?: boolean; children: React.ReactNode }) {
  const { text } = useI18n();
 return <label id={`billable-charge-field-${fieldId(label)}`} className={`${styles.field} ${wide ? styles.wideField : ""} ${error ? styles.invalidField : ""}`}><span>{label}</span>{children}{error ? <em>{text(error)}</em> : null}</label>; }
function AmountReview({ form, amounts }: { form: ChargeForm; amounts: ReturnType<typeof calculateAmounts> }) {
  const { t } = useI18n();
 const hasRate = Boolean(form.unitRate.trim()); const show = (value: number) => hasRate ? money(value) : "-"; return <section className={styles.amountReview}><div><span>{t("finance.charge.ui.quantityTimesRate")}</span><strong>{number(form.quantity)} {form.unit || t("finance.invoice.ui.unit")} × {hasRate ? money(form.unitRate) : t("finance.charge.ui.rateMissing")}</strong></div><dl><div><dt>{t("finance.invoice.ui.netAmount")}</dt><dd>{show(amounts.amountBeforeVat)}</dd></div><div><dt>VAT</dt><dd>{show(amounts.vatAmount)}</dd></div><div className={styles.totalLine}><dt>{t("finance.charge.ui.chargeAmount")}</dt><dd>{show(amounts.totalAmount)}</dd></div></dl><p>{t("finance.charge.ui.calculationSource")}</p></section>; }
function ReviewGrid({ form, amounts, clients, cases, advisories, context }: { form: ChargeForm; amounts: ReturnType<typeof calculateAmounts>; clients: BillableChargeClientOption[]; cases: BillableChargeCaseOption[]; advisories: BillableChargeAdvisoryOption[]; context?: BillableChargeContext }) {
  const { locale, t, date } = useI18n();
 const values = [[t("finance.invoice.ui.customer"), context?.clientName || clients.find((item) => item.id === form.clientId)?.name || "-"], [t("finance.charge.ui.caseAdvisory"), context?.matterLabel || formMatterLabel(form, cases, advisories, locale)], [t("finance.invoice.ui.chargeNature"), billableChargeNatureLabel(form.sourceType, locale)], ...(form.sourceType === "recoverable_cost" ? [[t("finance.invoice.ui.funding"), clientCostFundingModeLabel(form.clientCostFundingMode || null, locale)]] : []), [t("finance.charge.ui.transactionDate"), date(form.serviceDate)], [t("finance.invoice.ui.item"), form.description || "-"], [t("finance.charge.ui.quantityUnitRate"), `${number(form.quantity)} ${form.unit || "-"} × ${money(form.unitRate || 0)}`], [t("finance.invoice.ui.classification"), classificationLabel(form.economicClassification, locale)], [t("finance.charge.ui.vatMode"), taxLabel(form.priceTaxMode, form.vatRate, locale)], [t("finance.invoice.ui.netAmount"), money(amounts.amountBeforeVat)], ["VAT", money(amounts.vatAmount)], [t("finance.charge.ui.chargeAmount"), money(amounts.totalAmount)]]; return <dl className={styles.reviewGrid}>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function emptyForm(context?: BillableChargeContext): ChargeForm { return { sourceType: "ad_hoc_service", clientCostFundingMode: "", clientId: context?.clientId || "", matterMode: context?.caseId ? "case" : context?.advisoryMatterId ? "advisory" : "unlinked", caseId: context?.caseId ? String(context.caseId) : "", advisoryMatterId: context?.advisoryMatterId || "", serviceDate: bangkokToday(), description: "", quantity: "1", unit: "", unitRate: "", economicClassification: "", priceTaxMode: "non_vat", vatRate: "0", sourceReference: "", taxCategory: "" }; }
function validateDraft(form: ChargeForm) { const errors: Record<string, UiMessage | ""> = {}; if (!form.clientId) errors.clientId = uiMessage("finance.invoice.composer.clientRequired"); if (form.matterMode === "case" && !form.caseId) errors.matter = uiMessage("finance.charge.ui.error.case"); if (form.matterMode === "advisory" && !form.advisoryMatterId) errors.matter = uiMessage("finance.charge.ui.error.advisory"); if (!isDecimal(form.quantity, 4, false)) errors.quantity = uiMessage("finance.charge.ui.error.quantity"); if (!isDecimal(form.unitRate || "0", 2, true)) errors.unitRate = uiMessage("finance.charge.ui.error.unitRate"); if (form.priceTaxMode !== "non_vat" && !isDecimal(form.vatRate, 4, true)) errors.vatRate = uiMessage("finance.charge.ui.error.vatRate"); return errors; }
function validateReady(form: ChargeForm) { const errors = validateDraft(form); if (clientCostFundingModeRequired(form.sourceType, form.clientCostFundingMode)) errors.clientCostFundingMode = uiMessage("finance.charge.ui.error.funding"); if (!form.serviceDate) errors.serviceDate = uiMessage("finance.charge.ui.error.date"); if (!form.description.trim()) errors.description = uiMessage("finance.charge.ui.error.description"); if (!form.unit.trim()) errors.unit = uiMessage("finance.charge.ui.error.unit"); if (!form.economicClassification) errors.economicClassification = uiMessage("finance.charge.ui.error.classification"); if (calculateAmounts(form).totalAmount <= 0) errors.unitRate = uiMessage("finance.charge.ui.error.positiveTotal"); return errors; }
function calculateAmounts(form: ChargeForm) { return calculateFinanceLineAmounts(Number(form.quantity || 0), Number(form.unitRate || 0), form.priceTaxMode, form.priceTaxMode === "non_vat" ? 0 : Number(form.vatRate || 0)); }
function setMatterMode(setForm: React.Dispatch<React.SetStateAction<ChargeForm>>, setErrors: React.Dispatch<React.SetStateAction<Record<string, UiMessage | "">>>, mode: MatterMode) { setForm((current) => ({ ...current, matterMode: mode, caseId: "", advisoryMatterId: "" })); setErrors((current) => ({ ...current, matter: "" })); }
function focusFirstError(errors: Record<string, UiMessage | "">, locale: UiLocale = "th") { const first = Object.keys(errors)[0]; if (!first) return; window.requestAnimationFrame(() => { const target = first === "acknowledgement" ? document.getElementById("billable-charge-acknowledgement") : first === "matter" ? document.getElementById("billable-charge-matter") : first === "clientCostFundingMode" ? document.getElementById("billable-charge-funding-mode") : document.getElementById(`billable-charge-field-${fieldId(errorLabel(first, locale))}`); target?.scrollIntoView({ behavior: "smooth", block: "center" }); target?.querySelector<HTMLElement>("input,select,textarea")?.focus({ preventScroll: true }); }); }
function chargeError(value: unknown, fallback: UiMessage | string) { const message = typeof value === "object" && value && "message" in value ? String((value as { message?: unknown }).message || "") : String(value || ""); if (message.includes("Case must belong") || message.includes("Advisory matter must belong")) return uiMessage("finance.charge.ui.error.context"); if (message.includes("funding mode is required")) return uiMessage("finance.charge.ui.error.fundingReady"); if (message.includes("funding mode is invalid") || message.includes("funding mode is inconsistent")) return uiMessage("finance.charge.ui.error.fundingConflict"); if (message.includes("Only a Draft") || message.includes("can be saved")) return uiMessage("finance.charge.ui.error.notDraft"); if (message.includes("Not allowed")) return uiMessage("finance.charge.ui.error.permission"); return fallback; }
function formMatterLabel(form: ChargeForm, cases: BillableChargeCaseOption[], advisories: BillableChargeAdvisoryOption[], locale: UiLocale = "th") { const t = (key: string) => translate(locale, key); if (form.matterMode === "case") return caseLabel(cases.find((item) => String(item.id) === form.caseId), locale); if (form.matterMode === "advisory") return advisoryLabel(advisories.find((item) => item.id === form.advisoryMatterId), locale); return t("finance.invoice.composer.generalContext"); }
function caseLabel(item?: BillableChargeCaseOption | null, locale: UiLocale = "th") { return item ? [item.file_no, item.title].filter(Boolean).join(" · ") || translate(locale, "finance.charge.ui.caseReference", { id: item.id }) : "-"; }
function advisoryLabel(item?: BillableChargeAdvisoryOption | null, locale: UiLocale = "th") { const t = (key: string) => translate(locale, key); return item ? [item.matter_no, item.title].filter(Boolean).join(" · ") || t("finance.charge.ui.advisory") : "-"; }
function classificationLabel(value: string, locale: UiLocale = "th") { const t = (key: string) => translate(locale, key); return ({ professional_fee: t("finance.invoice.classification.professional_fee"), additional_service: t("finance.invoice.classification.additional_service"), reimbursable_expense: t("finance.invoice.classification.reimbursable_expense"), government_or_court_fee: t("finance.invoice.classification.government_or_court_fee"), other: t("finance.invoice.classification.other") } as Record<string, string>)[value] || "-"; }
function taxLabel(mode: FinancePriceTaxMode, vatRate: string, locale: UiLocale = "th") { const t = (key: string) => translate(locale, key); return mode === "non_vat" ? t("finance.invoice.ui.noVat") : `${mode === "vat_inclusive" ? t("finance.charge.ui.vatInclusive") : t("finance.charge.ui.vatExclusive")} · ${number(vatRate)}%`; }
function errorLabel(field: string, locale: UiLocale = "th") { const t = (key: string) => translate(locale, key); return ({ clientId: t("finance.invoice.ui.customer"), clientCostFundingMode: t("finance.charge.ui.fundingMode"), serviceDate: t("finance.charge.ui.serviceDate"), description: t("finance.invoice.ui.item"), quantity: t("finance.charge.ui.quantity"), unit: t("finance.invoice.ui.unit"), unitRate: t("finance.charge.ui.unitRate"), economicClassification: t("finance.invoice.ui.classification"), priceTaxMode: t("finance.charge.ui.vatMode"), vatRate: t("finance.charge.ui.vatRate") } as Record<string, string>)[field] || field; }
function fingerprint(form: ChargeForm) { return JSON.stringify(form); }
function nullable(value: string) { return value.trim() || null; }
function fieldId(value: string) { return value.replace(/[^a-zA-Z0-9ก-๙]+/gu, "-"); }
function isDecimal(value: string, decimals: number, allowZero: boolean) { const normalized = value.trim(); if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(normalized)) return false; const parsed = Number(normalized); return allowZero ? parsed >= 0 : parsed > 0; }
function number(value: number | string) { return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 4 }); }
function money(value: number | string) { return `${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`; }
function bangkokToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
