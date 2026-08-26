export type BillingAgreementItem = {
  id: string;
  source_quotation_item_id: string | null;
  description: string;
  amount_before_tax: number | string;
  vat_amount: number | string;
  line_total: number | string;
  sort_order: number;
};

export type BillingPlanDraftItem = {
  fee_agreement_item_id: string;
  amount_before_tax: number;
  vat_amount: number;
  total_amount: number;
  allocation_percent: number | null;
  sort_order: number;
  allocation_snapshot_json: Record<string, unknown>;
};

export type BillingPlanDraftInstallment = {
  installment_no: number;
  sort_order: number;
  title: string;
  trigger_description: string | null;
  trigger_type: "agreement_effective" | "date" | "case_milestone" | "manual" | "recurring_period";
  due_date: string | null;
  milestone_code: string | null;
  recurring_period_start: string | null;
  recurring_period_end: string | null;
  items: BillingPlanDraftItem[];
};

export type BillingPlanDraftPayload = {
  title: string;
  description: string | null;
  billingMethod: string;
  recurringConfig: Record<string, unknown> | null;
  installments: BillingPlanDraftInstallment[];
};

type Json = Record<string, unknown>;

const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
const numberValue = (value: unknown) => Number(value ?? 0);
const satang = (value: unknown) => Math.round(numberValue(value) * 100);

function sourceTrigger(installment: Json, acceptedQuotationBasis: boolean): Pick<BillingPlanDraftInstallment, "trigger_type" | "trigger_description" | "due_date" | "milestone_code" | "recurring_period_start" | "recurring_period_end"> {
  const sourceType = stringValue(installment.trigger_type);
  const sourceDescription = stringValue(installment.trigger_description);
  const dueDays = Number(installment.payment_due_days);
  const clientNote = stringValue(installment.client_note);
  const detailParts = [
    sourceDescription,
    Number.isFinite(dueDays) && dueDays > 0 ? `กำหนดชำระภายใน ${dueDays} วัน` : "",
    clientNote ? `หมายเหตุสำหรับลูกค้า: ${clientNote}` : "",
  ].filter(Boolean);

  if (sourceType === "quotation_acceptance") {
    return {
      trigger_type: "manual",
      trigger_description: ["เมื่อลูกค้าตอบรับใบเสนอราคา", ...detailParts].join(" · "),
      due_date: stringValue(installment.due_date) || null,
      milestone_code: null,
      recurring_period_start: null,
      recurring_period_end: null,
    };
  }

  if (sourceType === "recurring_period") {
    const periodStart = stringValue(installment.recurring_period_start);
    const periodEnd = stringValue(installment.recurring_period_end);
    if (!periodStart || !periodEnd) {
      return {
        trigger_type: "manual",
        trigger_description: [acceptedQuotationBasis ? "ตามรอบระยะเวลาที่กำหนดในการว่าจ้าง" : "ตามรอบระยะเวลาที่กำหนดในข้อตกลง", ...detailParts].join(" · "),
        due_date: stringValue(installment.due_date) || null,
        milestone_code: null,
        recurring_period_start: null,
        recurring_period_end: null,
      };
    }
  }

  const supportedType = ["agreement_effective", "date", "case_milestone", "manual", "recurring_period"].includes(sourceType)
    ? sourceType as BillingPlanDraftInstallment["trigger_type"]
    : "manual";

  return {
    trigger_type: supportedType,
    trigger_description: detailParts.join(" · ") || (supportedType === "manual" ? acceptedQuotationBasis ? "เงื่อนไขตามใบเสนอราคาที่ตอบรับ" : "เงื่อนไขตามข้อตกลงค่าบริการ" : null),
    due_date: stringValue(installment.due_date) || null,
    milestone_code: stringValue(installment.milestone_code) || null,
    recurring_period_start: stringValue(installment.recurring_period_start) || null,
    recurring_period_end: stringValue(installment.recurring_period_end) || null,
  };
}

export function buildBillingPlanDraftFromFeeAgreement(input: {
  agreementNo: string | null;
  agreementTitle: string;
  billingMethod: string;
  engagementBasis?: "formal_agreement" | "accepted_quotation" | null;
  sourceDocumentSnapshot: Json | null;
  agreementItems: BillingAgreementItem[];
}): { ok: true; payload: BillingPlanDraftPayload } | { ok: false; message: string } {
  const acceptedQuotationBasis = input.engagementBasis === "accepted_quotation";
  const paymentTerms = object(object(input.sourceDocumentSnapshot).payment_terms);
  const sourceInstallments = rows(paymentTerms.installments).map(object);
  if (!sourceInstallments.length) {
    return { ok: false, message: "ไม่พบงวดการชำระเงินจากใบเสนอราคาต้นทาง กรุณาตรวจสอบข้อมูลข้อตกลงก่อนสร้างแผนเรียกเก็บเงิน" };
  }

  const agreementItemBySourceId = new Map(
    input.agreementItems
      .filter((item) => item.source_quotation_item_id)
      .map((item) => [item.source_quotation_item_id as string, item]),
  );
  if (agreementItemBySourceId.size !== input.agreementItems.length) {
    return { ok: false, message: "รายการค่าบริการบางรายการไม่เชื่อมกับใบเสนอราคาต้นทาง จึงยังสร้างแผนเรียกเก็บเงินอย่างปลอดภัยไม่ได้" };
  }

  const installments: BillingPlanDraftInstallment[] = [];
  for (const [installmentIndex, installment] of sourceInstallments.entries()) {
    const installmentNo = Number(installment.installment_no || installmentIndex + 1);
    const sourceItems = rows(installment.items).map(object);
    if (!sourceItems.length) {
      return { ok: false, message: `งวดที่ ${installmentNo} ไม่มีรายการค่าบริการที่ตรวจสอบได้` };
    }

    const mappedItems: BillingPlanDraftItem[] = [];
    for (const [itemIndex, sourceItem] of sourceItems.entries()) {
      const sourceItemId = stringValue(sourceItem.quotation_item_id);
      const agreementItem = agreementItemBySourceId.get(sourceItemId);
      if (!agreementItem) {
        return { ok: false, message: `ไม่สามารถเชื่อมรายการค่าบริการในงวดที่ ${installmentNo} กับข้อตกลงฉบับนี้ได้` };
      }
      const beforeTax = numberValue(sourceItem.allocated_amount_before_tax);
      const vat = numberValue(sourceItem.allocated_vat_amount);
      const total = numberValue(sourceItem.allocated_total);
      if (![beforeTax, vat, total].every(Number.isFinite) || beforeTax < 0 || vat < 0 || total < 0 || satang(total) !== satang(beforeTax + vat)) {
        return { ok: false, message: `ยอดจัดสรรในงวดที่ ${installmentNo} ไม่ถูกต้อง กรุณาตรวจสอบใบเสนอราคาต้นทาง` };
      }
      mappedItems.push({
        fee_agreement_item_id: agreementItem.id,
        amount_before_tax: beforeTax,
        vat_amount: vat,
        total_amount: total,
        allocation_percent: null,
        sort_order: Number.isFinite(Number(agreementItem.sort_order)) ? Number(agreementItem.sort_order) : itemIndex,
        allocation_snapshot_json: {
          source_type: "frozen_quotation_payment_terms",
          source_quotation_item_id: sourceItemId,
          source_installment_no: installmentNo,
          source_payment_terms_version: paymentTerms.version ?? null,
        },
      });
    }

    installments.push({
      installment_no: installmentNo,
      sort_order: installmentIndex,
      title: stringValue(installment.title) || `งวดที่ ${installmentNo}`,
      ...sourceTrigger(installment, acceptedQuotationBasis),
      items: mappedItems,
    });
  }

  for (const agreementItem of input.agreementItems) {
    const allocations = installments.flatMap((installment) => installment.items).filter((item) => item.fee_agreement_item_id === agreementItem.id);
    if (!allocations.length
      || allocations.reduce((sum, item) => sum + satang(item.amount_before_tax), 0) !== satang(agreementItem.amount_before_tax)
      || allocations.reduce((sum, item) => sum + satang(item.vat_amount), 0) !== satang(agreementItem.vat_amount)
      || allocations.reduce((sum, item) => sum + satang(item.total_amount), 0) !== satang(agreementItem.line_total)) {
      return { ok: false, message: `การจัดสรรรายการ “${agreementItem.description}” ไม่ตรงกับยอดตามข้อตกลง จึงยังสร้างแผนเรียกเก็บเงินไม่ได้` };
    }
  }

  return {
    ok: true,
    payload: {
      title: input.agreementNo ? `แผนเรียกเก็บเงิน ${input.agreementNo}` : input.agreementTitle,
      description: null,
      billingMethod: input.billingMethod,
      recurringConfig: null,
      installments,
    },
  };
}
