export type WhtMode = "none" | "rate" | "legacy";
export type WhtComponent = {
  id: string; payment_id: string; invoice_id: string; invoice_item_id: string;
  calculation_rule: string; base_amount: number | string; rate_percent: number | string;
  calculated_wht_amount: number | string; basis_snapshot_json: Record<string, unknown>;
};
export type InvoiceTaxFacts = {
  invoiceId: string; currency: string; beforeVat: number; vat: number; gross: number;
  version: number; vatLabel: string;
  lines: { id: string; beforeVat: number; vat: number; gross: number; vatApplicable: boolean }[];
};
export const structuredWhtCopy = {
  legacy: "ต้องคำนวณ WHT ใหม่ตามฐานและอัตราที่ระบุก่อนยืนยันรับชำระ ระบบจะไม่เดาอัตราจากยอดเดิม",
  mixed: "รายการในใบแจ้งหนี้มีหลายประเภท ระบบยังไม่สามารถกำหนดฐาน WHT อัตโนมัติได้อย่างปลอดภัย",
  partial: "การรับชำระบางส่วนยังไม่มีข้อมูลกำหนดส่วนของฐาน WHT ที่ใช้ในครั้งนี้ จึงยังคำนวณ WHT อัตโนมัติไม่ได้",
  snapshot: "ยังไม่มีหลักฐานใบแจ้งหนี้ที่เพียงพอสำหรับคำนวณ WHT กรุณาให้ผู้ดูแลตรวจสอบ",
  rate: "กรุณาเลือกอัตราหัก ณ ที่จ่ายที่ใช้กับรายการนี้",
  applicability: "การเลือกอัตราเป็นการยืนยันว่าใช้กับมูลค่าก่อน VAT ทั้งบรรทัดนี้ตามหลักฐานของผู้จ่าย ระบบไม่ได้กำหนดอัตราภาษีจากประเภทรายการ",
} as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function cents(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const result = Math.round(Number(value) * 100);
  return Number.isSafeInteger(result) ? result : null;
}

// Read issued evidence only. Totals are validated, never rebuilt from live commercial data.
export function invoiceTaxFacts(snapshot: unknown): InvoiceTaxFacts | null {
  const source = object(snapshot);
  const invoice = object(source.invoice);
  const version = source.schema_version;
  if ((version !== 1 && version !== 2) || invoice.document_status !== "issued"
    || typeof invoice.id !== "string" || typeof invoice.currency !== "string" || !Array.isArray(source.items) || source.items.length === 0) return null;
  if (version === 2 && source.source_model !== "billable_charge_v2") return null;
  const beforeVat = cents(invoice.amount_before_vat), vat = cents(invoice.vat_amount), gross = cents(invoice.total_amount);
  if (beforeVat === null || vat === null || gross === null || gross <= 0 || beforeVat + vat !== gross) return null;
  const lines: InvoiceTaxFacts["lines"] = [];
  for (const entry of source.items) {
    const line = version === 2 ? object(object(entry).invoice_item) : object(entry);
    const base = cents(line.amount_before_vat), tax = cents(line.vat_amount), total = cents(line.line_total);
    if (typeof line.id !== "string" || typeof line.vat_applicable !== "boolean"
      || (version === 2 && (line.source_state !== "active" || line.invoice_id !== invoice.id))
      || base === null || tax === null || total === null || base + tax !== total
      || (!line.vat_applicable && tax !== 0)) return null;
    lines.push({ id: line.id, beforeVat: base / 100, vat: tax / 100, gross: total / 100, vatApplicable: line.vat_applicable });
  }
  if (new Set(lines.map((line) => line.id)).size !== lines.length
    || lines.reduce((sum, line) => sum + cents(line.beforeVat)!, 0) !== beforeVat
    || lines.reduce((sum, line) => sum + cents(line.vat)!, 0) !== vat
    || lines.reduce((sum, line) => sum + cents(line.gross)!, 0) !== gross) return null;
  return { invoiceId: invoice.id, currency: invoice.currency, version, beforeVat: beforeVat / 100, vat: vat / 100, gross: gross / 100, lines,
    vatLabel: vat === 0 ? "ไม่มี VAT" : lines.some((line) => line.vatApplicable) && lines.some((line) => !line.vatApplicable)
      ? "มีทั้งรายการที่มี VAT และไม่มี VAT" : "มี VAT" };
}

export function paymentWhtScope(facts: InvoiceTaxFacts | null, target: string, outstanding: number, allocationCount: number) {
  if (!facts || facts.version !== 2) return { base: null, error: structuredWhtCopy.snapshot };
  if (facts.lines.length !== 1 || allocationCount !== 1) return { base: null, error: structuredWhtCopy.mixed };
  if (cents(target) !== cents(facts.gross) || cents(outstanding) !== cents(facts.gross)) return { base: null, error: structuredWhtCopy.partial };
  if (facts.lines[0].beforeVat <= 0) return { base: null, error: structuredWhtCopy.snapshot };
  return { base: facts.lines[0].beforeVat, error: "" };
}

export function calculateStructuredWht(base: number | null, rate: string, target: string) {
  const baseCents = cents(base), targetCents = cents(target);
  if (baseCents === null || baseCents <= 0 || targetCents === null
    || !/^\d+(?:\.\d{1,4})?$/.test(rate) || Number(rate) <= 0 || Number(rate) > 100) return null;
  const rateTicks = Math.round(Number(rate) * 10000);
  // Exact half-up rounding matches PostgreSQL numeric round(base * rate / 100, 2).
  const whtCents = Number((BigInt(baseCents) * BigInt(rateTicks) + BigInt(500000)) / BigInt(1000000));
  if (whtCents <= 0 || whtCents > targetCents) return null;
  return { whtAmount: (whtCents / 100).toFixed(2), cashAmount: ((targetCents - whtCents) / 100).toFixed(2) };
}

export function savedPaymentWht(payment: { cash_amount: number | string; wht_amount: number | string; wht_calculation_mode?: string | null }, components: WhtComponent[]): { mode: WhtMode; rate: string; base: number | null } {
  if (payment.wht_calculation_mode === "rate" && components.length === 1) {
    const c = components[0];
    const base = Number(c.base_amount), rate = String(c.rate_percent);
    const result = calculateStructuredWht(base, rate, (Number(payment.cash_amount) + Number(payment.wht_amount)).toFixed(2));
    if (c.calculation_rule === "single_line_full_invoice_v1" && result
      && cents(result.whtAmount) === cents(payment.wht_amount) && cents(c.calculated_wht_amount) === cents(payment.wht_amount)) return { mode: "rate", rate: String(Number(rate)), base };
  }
  if (cents(payment.wht_amount) === 0 && payment.wht_calculation_mode !== "rate" && components.length === 0) return { mode: "none", rate: "", base: null };
  return { mode: "legacy", rate: "", base: null };
}

export function paymentTaxFingerprint(monetaryFingerprint: string, mode: WhtMode, rate: string) {
  return JSON.stringify([monetaryFingerprint, mode, mode === "rate" ? rate : ""]);
}
