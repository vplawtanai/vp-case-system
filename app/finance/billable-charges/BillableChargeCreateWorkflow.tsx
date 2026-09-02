"use client";

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
  const initialForm = useMemo(() => emptyForm(context), [context]);
  const [form, setForm] = useState<ChargeForm>(initialForm);
  const [baseline, setBaseline] = useState(() => fingerprint(initialForm));
  const [charge, setCharge] = useState<CreatedBillableCharge | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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
      focusFirstError(nextErrors);
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
        p_source_snapshot_json: {},
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
      setMessage("บันทึกร่างรายการเรียกเก็บแล้ว");
      await onSaved?.(authoritative);
      window.requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (caught) {
      console.error("SAVE BILLABLE CHARGE DRAFT FAILED", caught);
      setError(chargeError(caught, "บันทึกร่างรายการเรียกเก็บไม่สำเร็จ"));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  const markReady = async () => {
    const nextErrors = validateReady(form);
    if (dirty) nextErrors.ready = "มีข้อมูลที่ยังไม่ได้บันทึก กรุณาบันทึกร่างก่อนยืนยัน";
    if (!charge) nextErrors.ready = "กรุณาบันทึกร่างก่อนยืนยัน";
    if (!readyAcknowledged) nextErrors.acknowledgement = "กรุณายืนยันว่าได้ตรวจสอบรายการและยอดเรียกเก็บแล้ว";
    setErrors(nextErrors);
    if (actionLockRef.current || Object.keys(nextErrors).length || !canApprove || !charge) {
      focusFirstError(nextErrors);
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
      setMessage("ยืนยันรายการพร้อมออกใบแจ้งหนี้แล้ว");
      await onReady?.(authoritative);
    } catch (caught) {
      console.error("MARK BILLABLE CHARGE READY FAILED", caught);
      setError(chargeError(caught, "ยืนยันรายการพร้อมออกใบแจ้งหนี้ไม่สำเร็จ"));
    } finally {
      actionLockRef.current = false;
      setSaving(false);
    }
  };

  if (charge?.status === "ready_to_invoice") {
    return <section className={styles.reviewZone} aria-live="polite">
      <div><span className={styles.eyebrow}>พร้อมออกใบแจ้งหนี้</span><h3>รายการได้รับการยืนยันแล้ว</h3><p>รายการนี้เป็นรายการระดับลูกค้าและเรื่อง/งาน และยังไม่ถูกนำไปรวมในใบแจ้งหนี้ ผู้ใช้ต้องเลือกอีกครั้งในขั้นตอนจัดทำใบแจ้งหนี้</p></div>
      <ReviewGrid form={form} amounts={amounts} clients={clients} cases={cases} advisories={advisories} context={context} />
      {readyActionLabel && onReadyAction ? <button className={styles.primaryButton} type="button" onClick={onReadyAction}>{readyActionLabel}</button> : null}
    </section>;
  }

  return <div>
    {error ? <div className={styles.errorBanner}>{error}</div> : null}
    {message ? <div className={styles.successBanner}>{message}</div> : null}
    {context ? <div className={styles.editorReturn}>
      <div><strong>{context.clientName}</strong><span>{context.matterLabel}</span>{context.entryPointLabel ? <span>{context.entryPointLabel}</span> : null}</div>
      <div className={styles.workflowMeaning}><strong>รายการเรียกเก็บเพิ่มเติม</strong><span>รายการนี้จะถูกบันทึกไว้นอกงวดคงที่ของแผน และสามารถเลือกนำไปรวมในใบแจ้งหนี้ภายหลัง</span><span>การเพิ่มรายการในขั้นตอนนี้ยังไม่เป็นการสร้างใบแจ้งหนี้</span></div>
    </div> : null}

    <fieldset className={styles.sourceChoices}><legend>ลักษณะของรายการ</legend><label className={form.sourceType === "ad_hoc_service" ? styles.choiceActive : ""}><input type="radio" name="newChargeSourceType" disabled={!canManage || Boolean(charge)} checked={form.sourceType === "ad_hoc_service"} onChange={() => updateSourceType("ad_hoc_service")} /><span><strong>ค่าบริการ / งานเพิ่มเติม</strong><small>ค่าบริการหรือผลงานเพิ่มเติมที่ VP เรียกเก็บจากลูกค้า</small></span></label><label className={form.sourceType === "recoverable_cost" ? styles.choiceActive : ""}><input type="radio" name="newChargeSourceType" disabled={!canManage || Boolean(charge)} checked={form.sourceType === "recoverable_cost"} onChange={() => updateSourceType("recoverable_cost")} /><span><strong>ค่าธรรมเนียม / ค่าใช้จ่ายแทนลูกค้า</strong><small>เงินที่ต้องนำไปชำระบุคคลหรือหน่วยงานอื่นแทนลูกค้า หรือเงินที่ VP สำรองจ่ายไปก่อน</small></span></label></fieldset>

    {form.sourceType === "recoverable_cost" ? <><fieldset id="billable-charge-funding-mode" className={`${styles.sourceChoices} ${errors.clientCostFundingMode ? styles.invalidChoices : ""}`}><legend>การจ่ายรายการนี้เป็นแบบใด</legend><label className={form.clientCostFundingMode === "collect_before_disbursement" ? styles.choiceActive : ""}><input type="radio" name="newChargeFundingMode" disabled={!canManage} checked={form.clientCostFundingMode === "collect_before_disbursement"} onChange={() => updateForm("clientCostFundingMode", "collect_before_disbursement")} /><span><strong>เรียกเก็บจากลูกค้าก่อน แล้วจึงนำไปชำระ</strong><small>VP ยังไม่ได้สำรองจ่ายรายการนี้</small></span></label><label className={form.clientCostFundingMode === "reimburse_after_advance" ? styles.choiceActive : ""}><input type="radio" name="newChargeFundingMode" disabled={!canManage} checked={form.clientCostFundingMode === "reimburse_after_advance"} onChange={() => updateForm("clientCostFundingMode", "reimburse_after_advance")} /><span><strong>VP สำรองจ่ายแล้ว และเรียกคืนจากลูกค้า</strong><small>VP ได้ชำระค่าใช้จ่ายนี้ไปแล้ว และกำลังเรียกคืนจากลูกค้า</small></span></label></fieldset>{errors.clientCostFundingMode ? <p className={styles.fieldError}>{errors.clientCostFundingMode}</p> : null}</> : null}

    {!context ? <><div className={styles.formGrid}><Field label="ลูกค้า" error={errors.clientId}><select disabled={!canManage} value={form.clientId} onChange={(event) => { setForm((current) => ({ ...current, clientId: event.target.value, matterMode: "unlinked", caseId: "", advisoryMatterId: "" })); setErrors((current) => ({ ...current, clientId: "", matter: "" })); }}><option value="">เลือกลูกค้า</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || "ลูกค้าไม่มีชื่อ"}</option>)}</select></Field><Field label="วันที่เกิดรายการ / วันที่ให้บริการ" error={errors.serviceDate}><input disabled={!canManage} type="date" value={form.serviceDate} onChange={(event) => updateForm("serviceDate", event.target.value)} /></Field></div><div id="billable-charge-matter" className={styles.matterSection}><span className={styles.fieldHeading}>เชื่อมกับเรื่อง/งาน</span><div className={styles.segmented}><button disabled={!canManage} type="button" className={form.matterMode === "unlinked" ? styles.segmentActive : ""} onClick={() => setMatterMode(setForm, setErrors, "unlinked")}>ไม่ผูกกับงานเฉพาะ</button><button disabled={!canManage} type="button" className={form.matterMode === "case" ? styles.segmentActive : ""} onClick={() => setMatterMode(setForm, setErrors, "case")}>คดี</button><button disabled={!canManage} type="button" className={form.matterMode === "advisory" ? styles.segmentActive : ""} onClick={() => setMatterMode(setForm, setErrors, "advisory")}>งานที่ปรึกษา</button></div>{form.matterMode === "case" ? <Field label="เลือกคดี" error={errors.matter}><select disabled={!canManage} value={form.caseId} onChange={(event) => updateForm("caseId", event.target.value)}><option value="">เลือกคดีของลูกค้ารายนี้</option>{clientCases.map((item) => <option key={item.id} value={item.id}>{caseLabel(item)}</option>)}</select></Field> : null}{form.matterMode === "advisory" ? <Field label="เลือกงานที่ปรึกษา" error={errors.matter}><select disabled={!canManage} value={form.advisoryMatterId} onChange={(event) => updateForm("advisoryMatterId", event.target.value)}><option value="">เลือกงานที่ปรึกษาของลูกค้ารายนี้</option>{clientAdvisories.map((item) => <option key={item.id} value={item.id}>{advisoryLabel(item)}</option>)}</select></Field> : null}</div></> : <div className={styles.formGrid}><Field label="วันที่เกิดรายการ / วันที่ให้บริการ" error={errors.serviceDate}><input disabled={!canManage} type="date" value={form.serviceDate} onChange={(event) => updateForm("serviceDate", event.target.value)} /></Field></div>}

    <div className={styles.formGrid}><Field label="รายการ" error={errors.description} wide><textarea disabled={!canManage} rows={3} value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="เช่น ค่าเดินทางไปศาล" /></Field><Field label="จำนวน" error={errors.quantity}><input disabled={!canManage} inputMode="decimal" value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} /></Field><Field label="หน่วย" error={errors.unit}><input disabled={!canManage} value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder="เช่น ครั้ง หน้า วัน" /></Field><Field label="ราคาต่อหน่วย" error={errors.unitRate}><input disabled={!canManage} inputMode="decimal" value={form.unitRate} onChange={(event) => updateForm("unitRate", event.target.value)} placeholder="0.00" /></Field><Field label="ประเภทของยอด" error={errors.economicClassification}><select disabled={!canManage} value={form.economicClassification} onChange={(event) => updateForm("economicClassification", event.target.value as ChargeForm["economicClassification"])}><option value="">เลือกประเภทของยอด</option><option value="professional_fee">ค่าวิชาชีพ</option><option value="additional_service">ค่าบริการเพิ่มเติม</option><option value="reimbursable_expense">ค่าใช้จ่ายเรียกคืน</option><option value="government_or_court_fee">ค่าธรรมเนียมศาล / หน่วยงานรัฐ</option><option value="other">อื่น ๆ</option></select></Field><Field label="การคิด VAT" error={errors.priceTaxMode}><select disabled={!canManage} value={form.priceTaxMode} onChange={(event) => { const mode = event.target.value as FinancePriceTaxMode; setForm((current) => ({ ...current, priceTaxMode: mode, vatRate: mode === "non_vat" ? "0" : Number(current.vatRate) > 0 ? current.vatRate : "7" })); }}><option value="non_vat">ไม่มี VAT</option><option value="vat_exclusive">ราคายังไม่รวม VAT</option><option value="vat_inclusive">ราคารวม VAT แล้ว</option></select></Field>{form.priceTaxMode !== "non_vat" ? <Field label="อัตรา VAT (%)" error={errors.vatRate}><input disabled={!canManage} inputMode="decimal" value={form.vatRate} onChange={(event) => updateForm("vatRate", event.target.value)} /></Field> : null}</div>
    <section className={styles.additionalSection}><div className={styles.additionalHeading}><h3>ข้อมูลเพิ่มเติม</h3><p>ข้อมูลประกอบรายการที่ไม่บังคับ</p></div><div className={styles.formGrid}><Field label="เลขอ้างอิง / หลักฐานประกอบ"><input disabled={!canManage} value={form.sourceReference} onChange={(event) => updateForm("sourceReference", event.target.value)} /></Field><Field label="ข้อมูลภาษีเพิ่มเติม (ถ้ามี)"><input disabled={!canManage} value={form.taxCategory} onChange={(event) => updateForm("taxCategory", event.target.value)} /></Field></div></section>
    <AmountReview form={form} amounts={amounts} />
    <div className={styles.saveRow}><span className={dirty ? styles.unsavedState : styles.savedState}>{dirty ? "มีข้อมูลที่ยังไม่ได้บันทึก" : charge ? "บันทึกร่างแล้ว" : "ยังไม่สร้างข้อมูลในระบบ"}</span><button className={styles.secondaryButton} type="button" disabled={saving || !dirty || !canManage} onClick={() => void saveDraft()}>{saving ? "กำลังบันทึก..." : "บันทึกร่าง"}</button></div>
    {charge ? <section ref={reviewRef} className={styles.reviewZone} tabIndex={-1}><div><span className={styles.eyebrow}>ตรวจสอบรายการ</span><h3>ตรวจสอบก่อนพร้อมออกใบแจ้งหนี้</h3><p>ตรวจสอบลูกค้า เรื่อง วันที่ รายการ ประเภทของยอด การคิด VAT และยอดเงินทั้งหมดก่อนยืนยัน</p></div><ReviewGrid form={form} amounts={amounts} clients={clients} cases={cases} advisories={advisories} context={context} />{errors.ready ? <p className={styles.fieldError}>{errors.ready}</p> : null}<label id="billable-charge-acknowledgement" className={errors.acknowledgement ? styles.invalidCheck : styles.checkLabel}><input type="checkbox" checked={readyAcknowledged} onChange={(event) => { setReadyAcknowledged(event.target.checked); setErrors((current) => ({ ...current, acknowledgement: "" })); }} /><span>ยืนยันว่ารายการและยอดเรียกเก็บนี้ถูกต้อง และพร้อมนำไปออกใบแจ้งหนี้</span></label>{errors.acknowledgement ? <p className={styles.fieldError}>{errors.acknowledgement}</p> : null}<button className={styles.primaryButton} type="button" disabled={saving || dirty || !canApprove} onClick={() => void markReady()}>ยืนยันพร้อมออกใบแจ้งหนี้</button>{!canApprove ? <p className={styles.permissionNote}>คุณบันทึกร่างได้ แต่ไม่มีสิทธิ์ยืนยันรายการพร้อมออกใบแจ้งหนี้</p> : null}</section> : null}
  </div>;
}

function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) { return <label id={`billable-charge-field-${fieldId(label)}`} className={`${styles.field} ${wide ? styles.wideField : ""} ${error ? styles.invalidField : ""}`}><span>{label}</span>{children}{error ? <em>{error}</em> : null}</label>; }
function AmountReview({ form, amounts }: { form: ChargeForm; amounts: ReturnType<typeof calculateAmounts> }) { const hasRate = Boolean(form.unitRate.trim()); const show = (value: number) => hasRate ? money(value) : "-"; return <section className={styles.amountReview}><div><span>จำนวน × ราคาต่อหน่วย</span><strong>{number(form.quantity)} {form.unit || "หน่วย"} × {hasRate ? money(form.unitRate) : "ยังไม่ได้ระบุราคา"}</strong></div><dl><div><dt>ยอดก่อน VAT</dt><dd>{show(amounts.amountBeforeVat)}</dd></div><div><dt>VAT</dt><dd>{show(amounts.vatAmount)}</dd></div><div className={styles.totalLine}><dt>ยอดเรียกเก็บ</dt><dd>{show(amounts.totalAmount)}</dd></div></dl><p>ยอดที่แสดงใช้วิธีคำนวณเดียวกับใบเสนอราคา เมื่อบันทึกแล้วระบบจะใช้ยอดที่ฐานข้อมูลคำนวณเป็นข้อมูลหลัก</p></section>; }
function ReviewGrid({ form, amounts, clients, cases, advisories, context }: { form: ChargeForm; amounts: ReturnType<typeof calculateAmounts>; clients: BillableChargeClientOption[]; cases: BillableChargeCaseOption[]; advisories: BillableChargeAdvisoryOption[]; context?: BillableChargeContext }) { const values = [["ลูกค้า", context?.clientName || clients.find((item) => item.id === form.clientId)?.name || "-"], ["คดี / งานที่ปรึกษา", context?.matterLabel || formMatterLabel(form, cases, advisories)], ["ลักษณะรายการ", billableChargeNatureLabel(form.sourceType)], ...(form.sourceType === "recoverable_cost" ? [["การจ่าย", clientCostFundingModeLabel(form.clientCostFundingMode || null)]] : []), ["วันที่เกิดรายการ", thaiDate(form.serviceDate)], ["รายการ", form.description || "-"], ["จำนวน / หน่วย / ราคา", `${number(form.quantity)} ${form.unit || "-"} × ${money(form.unitRate || 0)}`], ["ประเภทของยอด", classificationLabel(form.economicClassification)], ["การคิด VAT", taxLabel(form.priceTaxMode, form.vatRate)], ["ยอดก่อน VAT", money(amounts.amountBeforeVat)], ["VAT", money(amounts.vatAmount)], ["ยอดเรียกเก็บ", money(amounts.totalAmount)]]; return <dl className={styles.reviewGrid}>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function emptyForm(context?: BillableChargeContext): ChargeForm { return { sourceType: "ad_hoc_service", clientCostFundingMode: "", clientId: context?.clientId || "", matterMode: context?.caseId ? "case" : context?.advisoryMatterId ? "advisory" : "unlinked", caseId: context?.caseId ? String(context.caseId) : "", advisoryMatterId: context?.advisoryMatterId || "", serviceDate: bangkokToday(), description: "", quantity: "1", unit: "", unitRate: "", economicClassification: "", priceTaxMode: "non_vat", vatRate: "0", sourceReference: "", taxCategory: "" }; }
function validateDraft(form: ChargeForm) { const errors: Record<string, string> = {}; if (!form.clientId) errors.clientId = "กรุณาเลือกลูกค้า"; if (form.matterMode === "case" && !form.caseId) errors.matter = "กรุณาเลือกคดีของลูกค้ารายนี้"; if (form.matterMode === "advisory" && !form.advisoryMatterId) errors.matter = "กรุณาเลือกงานที่ปรึกษาของลูกค้ารายนี้"; if (!isDecimal(form.quantity, 4, false)) errors.quantity = "กรุณาระบุจำนวนมากกว่า 0 และไม่เกิน 4 ตำแหน่งทศนิยม"; if (!isDecimal(form.unitRate || "0", 2, true)) errors.unitRate = "กรุณาระบุราคาต่อหน่วยไม่ติดลบและไม่เกิน 2 ตำแหน่งทศนิยม"; if (form.priceTaxMode !== "non_vat" && !isDecimal(form.vatRate, 4, true)) errors.vatRate = "กรุณาระบุอัตรา VAT ที่ถูกต้อง"; return errors; }
function validateReady(form: ChargeForm) { const errors = validateDraft(form); if (clientCostFundingModeRequired(form.sourceType, form.clientCostFundingMode)) errors.clientCostFundingMode = "กรุณาระบุรูปแบบการจ่ายของรายการนี้"; if (!form.serviceDate) errors.serviceDate = "กรุณาระบุวันที่เกิดรายการ"; if (!form.description.trim()) errors.description = "กรุณาระบุรายการที่จะเรียกเก็บ"; if (!form.unit.trim()) errors.unit = "กรุณาระบุหน่วย"; if (!form.economicClassification) errors.economicClassification = "กรุณาเลือกประเภทของยอด"; if (calculateAmounts(form).totalAmount <= 0) errors.unitRate = "ยอดเรียกเก็บต้องมากกว่า 0 ก่อนยืนยัน"; return errors; }
function calculateAmounts(form: ChargeForm) { return calculateFinanceLineAmounts(Number(form.quantity || 0), Number(form.unitRate || 0), form.priceTaxMode, form.priceTaxMode === "non_vat" ? 0 : Number(form.vatRate || 0)); }
function setMatterMode(setForm: React.Dispatch<React.SetStateAction<ChargeForm>>, setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>, mode: MatterMode) { setForm((current) => ({ ...current, matterMode: mode, caseId: "", advisoryMatterId: "" })); setErrors((current) => ({ ...current, matter: "" })); }
function focusFirstError(errors: Record<string, string>) { const first = Object.keys(errors)[0]; if (!first) return; window.requestAnimationFrame(() => { const target = first === "acknowledgement" ? document.getElementById("billable-charge-acknowledgement") : first === "matter" ? document.getElementById("billable-charge-matter") : first === "clientCostFundingMode" ? document.getElementById("billable-charge-funding-mode") : document.getElementById(`billable-charge-field-${fieldId(errorLabel(first))}`); target?.scrollIntoView({ behavior: "smooth", block: "center" }); target?.querySelector<HTMLElement>("input,select,textarea")?.focus({ preventScroll: true }); }); }
function chargeError(value: unknown, fallback: string) { const message = typeof value === "object" && value && "message" in value ? String((value as { message?: unknown }).message || "") : String(value || ""); if (message.includes("Case must belong") || message.includes("Advisory matter must belong")) return "คดีหรืองานที่ปรึกษาไม่ได้อยู่ภายใต้ลูกค้าที่เลือก กรุณาตรวจสอบอีกครั้ง"; if (message.includes("funding mode is required")) return "กรุณาระบุรูปแบบการจ่ายของรายการค่าธรรมเนียมหรือค่าใช้จ่ายแทนลูกค้าก่อนยืนยัน"; if (message.includes("funding mode is invalid") || message.includes("funding mode is inconsistent")) return "ลักษณะรายการและรูปแบบการจ่ายไม่สอดคล้องกัน กรุณาตรวจสอบอีกครั้ง"; if (message.includes("Only a Draft") || message.includes("can be saved")) return "รายการนี้ไม่ใช่สถานะร่างแล้ว กรุณารีเฟรชและตรวจสอบสถานะล่าสุด"; if (message.includes("Not allowed")) return "คุณไม่มีสิทธิ์ดำเนินการนี้ กรุณาติดต่อ Admin"; return fallback; }
function formMatterLabel(form: ChargeForm, cases: BillableChargeCaseOption[], advisories: BillableChargeAdvisoryOption[]) { if (form.matterMode === "case") return caseLabel(cases.find((item) => String(item.id) === form.caseId)); if (form.matterMode === "advisory") return advisoryLabel(advisories.find((item) => item.id === form.advisoryMatterId)); return "ไม่ผูกกับงานเฉพาะ"; }
function caseLabel(item?: BillableChargeCaseOption | null) { return item ? [item.file_no, item.title].filter(Boolean).join(" · ") || `คดี ${item.id}` : "-"; }
function advisoryLabel(item?: BillableChargeAdvisoryOption | null) { return item ? [item.matter_no, item.title].filter(Boolean).join(" · ") || "งานที่ปรึกษา" : "-"; }
function classificationLabel(value: string) { return ({ professional_fee: "ค่าวิชาชีพ", additional_service: "ค่าบริการเพิ่มเติม", reimbursable_expense: "ค่าใช้จ่ายเรียกคืน", government_or_court_fee: "ค่าธรรมเนียมศาล / หน่วยงานรัฐ", other: "อื่น ๆ" } as Record<string, string>)[value] || "-"; }
function taxLabel(mode: FinancePriceTaxMode, vatRate: string) { return mode === "non_vat" ? "ไม่มี VAT" : `${mode === "vat_inclusive" ? "ราคารวม VAT แล้ว" : "ราคายังไม่รวม VAT"} · ${number(vatRate)}%`; }
function errorLabel(field: string) { return ({ clientId: "ลูกค้า", clientCostFundingMode: "การจ่ายรายการนี้เป็นแบบใด", serviceDate: "วันที่เกิดรายการ / วันที่ให้บริการ", description: "รายการ", quantity: "จำนวน", unit: "หน่วย", unitRate: "ราคาต่อหน่วย", economicClassification: "ประเภทของยอด", priceTaxMode: "การคิด VAT", vatRate: "อัตรา VAT (%)" } as Record<string, string>)[field] || field; }
function fingerprint(form: ChargeForm) { return JSON.stringify(form); }
function nullable(value: string) { return value.trim() || null; }
function fieldId(value: string) { return value.replace(/[^a-zA-Z0-9ก-๙]+/gu, "-"); }
function isDecimal(value: string, decimals: number, allowZero: boolean) { const normalized = value.trim(); if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(normalized)) return false; const parsed = Number(normalized); return allowZero ? parsed >= 0 : parsed > 0; }
function number(value: number | string) { return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 4 }); }
function money(value: number | string) { return `${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`; }
function thaiDate(value: string) { if (!value) return "-"; return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}T00:00:00+07:00`)); }
function bangkokToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
