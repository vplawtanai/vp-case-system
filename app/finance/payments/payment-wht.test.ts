import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { calculateStructuredWht, invoiceTaxFacts, paymentTaxFingerprint, paymentWhtScope, savedPaymentWht, structuredWhtCopy } from "./tax.ts";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { hasValidCurrencyPrecision, normalizedAmount, paymentFingerprint, paymentForm, safePaymentError } from "./shared.ts";
import type { FinancePayment } from "./shared";
import type { WhtComponent } from "./tax";

function snapshot(vat = true, mixed = false) {
  const line = { id: "line", invoice_id: "invoice", source_state: "active", vat_applicable: vat, amount_before_vat: vat ? 4672.90 : 5000, vat_amount: vat ? 327.10 : 0, line_total: 5000 };
  return { schema_version: 2, source_model: "billable_charge_v2", invoice: { id: "invoice", document_status: "issued", currency: "THB", amount_before_vat: line.amount_before_vat + (mixed ? 2000 : 0), vat_amount: line.vat_amount, total_amount: mixed ? 7000 : 5000 },
    items: [{ invoice_item: line }, ...(mixed ? [{ invoice_item: { ...line, id: "additional", vat_applicable: false, amount_before_vat: 2000, vat_amount: 0, line_total: 2000 } }] : [])] };
}
function component(): WhtComponent {
  return { id: "component", payment_id: "payment", invoice_id: "invoice", invoice_item_id: "line", calculation_rule: "single_line_full_invoice_v1", base_amount: "4672.90", rate_percent: "3.0000", calculated_wht_amount: "140.19", basis_snapshot_json: {} };
}
const pageSource = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const definitions = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) definitions.set(node.name.getText(ast), node.initializer.getText(ast));
  if (ts.isFunctionDeclaration(node) && node.name) definitions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
function handler(name: string, context: Record<string, unknown>) {
  return runInNewContext(ts.transpileModule(`(${definitions.get(name)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}
function taxMarkup(facts: ReturnType<typeof invoiceTaxFacts>) {
  const code = ["fieldLabel", "fieldValue", "taxSummary", "reviewGroupTitle", "contextGrid", "sectionDescription"].map((name) => `const ${name}=${definitions.get(name)};`).join("\n")
    + definitions.get("Field") + definitions.get("InvoiceTaxSummary") + "\n(<InvoiceTaxSummary facts={facts} />)";
  return renderToStaticMarkup(runInNewContext(ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText,
    { React, facts, money: (amount: number, currency: string) => `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` }));
}

test("frozen VAT summary shows gross, before VAT, tax and VAT status", () => {
  const facts = invoiceTaxFacts(snapshot());
  assert.equal(facts?.beforeVat, 4672.90);
  const markup = taxMarkup(facts);
  for (const text of ["5,000.00", "4,672.90", "327.10", "มูลค่าก่อน VAT", "มี VAT"]) assert.ok(markup.includes(text));
  assert.doesNotMatch(markup, /รายได้ก่อน VAT/);
});
test("no-VAT and mixed VAT snapshots remain distinguishable", () => {
  assert.match(taxMarkup(invoiceTaxFacts(snapshot(false))), />0.00 THB</);
  assert.match(taxMarkup(invoiceTaxFacts(snapshot(false))), /ไม่มี VAT/);
  assert.match(taxMarkup(invoiceTaxFacts(snapshot(true, true))), /มีทั้งรายการที่มี VAT และไม่มี VAT/);
});
test("missing or inconsistent issued evidence does not fall back to mutable totals", () => {
  assert.equal(invoiceTaxFacts(null), null);
  const evidence = snapshot(); evidence.invoice.total_amount = 5001;
  assert.equal(invoiceTaxFacts(evidence), null);
  assert.equal(invoiceTaxFacts({ ...snapshot(), schema_version: 99 }), null);
  assert.equal(invoiceTaxFacts({ ...snapshot(), items: [] }), null);
});
test("legacy V1 VAT evidence is readable without inventing a WHT component rule", () => {
  const evidence = snapshot();
  const facts = invoiceTaxFacts({ ...evidence, schema_version: 1, items: evidence.items.map((row) => row.invoice_item) });
  assert.equal(facts?.vat, 327.10);
  assert.equal(paymentWhtScope(facts, "5000", 5000, 1).base, null);
});
test("explicit 3% on the full single frozen line calculates exact amounts", () => {
  const scope = paymentWhtScope(invoiceTaxFacts(snapshot()), "5000.00", 5000, 1);
  assert.equal(scope.base, 4672.90);
  assert.deepEqual(calculateStructuredWht(scope.base, "3", "5000"), { whtAmount: "140.19", cashAmount: "4859.81" });
  assert.equal(4859.81 + 140.19, 5000);
});
test("invalid rates, precision and zero rounded WHT are rejected", () => {
  for (const rate of ["", "0", "101", "NaN", "-3", "3.00001"]) assert.equal(calculateStructuredWht(4672.90, rate, "5000"), null);
  assert.equal(calculateStructuredWht(0.01, "1", "1"), null);
  assert.deepEqual(calculateStructuredWht(1.50, "3", "2"), { whtAmount: "0.05", cashAmount: "1.95" });
});
test("mixed/multi-Invoice and partial scopes cannot use proportional or full-base shortcuts", () => {
  assert.equal(paymentWhtScope(invoiceTaxFacts(snapshot(true, true)), "7000", 7000, 1).base, null);
  assert.equal(paymentWhtScope(invoiceTaxFacts(snapshot()), "5000", 5000, 2).base, null);
  for (const [target, outstanding] of [["2500", 5000], ["2500", 2500], ["5000", 2500]] as const) {
    assert.equal(paymentWhtScope(invoiceTaxFacts(snapshot()), target, outstanding, 1).error, structuredWhtCopy.partial);
  }
});
test("rate/base reload from persisted evidence, never a monetary match", () => {
  assert.deepEqual(savedPaymentWht({ cash_amount: 4859.81, wht_amount: 140.19, wht_calculation_mode: "rate" }, [component()]), { mode: "rate", rate: "3", base: 4672.90 });
  for (const wht of [150, 140.19]) assert.deepEqual(savedPaymentWht({ cash_amount: 5000 - wht, wht_amount: wht }, []), { mode: "legacy", rate: "", base: null });
  assert.equal(savedPaymentWht({ cash_amount: 4859.81, wht_amount: 140.19, wht_calculation_mode: "rate" }, []).mode, "legacy");
});
test("legacy/manual Draft loads clean and rate intent participates in dirty-state", () => {
  const payment = { cash_amount: 4850, wht_amount: 150 } as FinancePayment;
  const form = paymentForm(payment), state = savedPaymentWht(payment, []);
  assert.equal(form.whtAmount, "150.00"); assert.equal(form.cashAmount, "4850.00");
  assert.equal(paymentTaxFingerprint(paymentFingerprint(form), state.mode, state.rate), paymentTaxFingerprint(paymentFingerprint(paymentForm(payment)), "legacy", ""));
  assert.notEqual(paymentTaxFingerprint("same", "rate", "3"), paymentTaxFingerprint("same", "rate", "2"));
});
test("turning WHT off zeroes credit without arbitrary monetary entry", () => {
  let mode = "legacy", args: unknown[] = [];
  handler("selectWhtMode", { whtMode: "rate", settlementTarget: "5000", setWhtRateOption() {}, setCustomWhtRate() {}, setWhtMode(value: string) { mode = value; }, setStructuredAmounts(...values: unknown[]) { args = values; } })(false);
  assert.equal(mode, "none"); assert.deepEqual(args, ["5000", "none"]);
  let form = { cashAmount: "4850.00", whtAmount: "150.00" };
  handler("setStructuredAmounts", { whtRateOption: "", customWhtRate: "", taxFacts: invoiceTaxFacts(snapshot()), outstandingBefore: 5000, allocations: [{}], paymentWhtScope, calculateStructuredWht, normalizedAmount, setForm(update: (old: typeof form) => typeof form) { form = update(form); }, setErrors() {}, setMessage() {} })("5000", "none");
  assert.deepEqual({ ...form }, { cashAmount: "5000.00", whtAmount: "0.00" });
});
test("validation rejects legacy and partial WHT before save or confirmation", () => {
  for (const mode of ["legacy", "rate"]) {
    let errors: Record<string, unknown> = {};
    const validate = handler("validate", { whtMode: mode, structuredWhtCopy, currentWhtBase: { error: structuredWhtCopy.partial }, whtCalculation: null,
      hasValidCurrencyPrecision, normalizedAmount, settlementTarget: "5000", targetSettlement: 5000, draftAllocationEditingLimited: false, outstandingBefore: 5000,
      form: { cashAmount: "4850.00", whtAmount: "150.00", receivedOn: "2026-09-01", paymentMethod: "bank_transfer", receivingBankAccountId: "bank" },
      cash: 4850, wht: 150, paymentSettlement: 5000, bangkokToday: () => "2026-09-05", setErrors(value: Record<string, unknown>) { errors = value; }, setError() {}, requestAnimationFrame() {},
    });
    assert.equal(validate(false), false); assert.equal(validate(true), false); assert.ok(errors.whtRate);
  }
});
test("edit/review share frozen tax summary, and confirmation retains the dedicated RPC", () => {
  assert.ok((pageSource.match(/<InvoiceTaxSummary/g) || []).length >= 3);
  assert.match(pageSource, /<Field label="ฐาน WHT"/);
  assert.match(pageSource, /<Field label="อัตราหัก ณ ที่จ่าย"/);
  assert.match(pageSource, /p_wht_rate_percent: whtMode === "rate" \? selectedWhtRate : null/);
  assert.match(pageSource, /rpc\("save_finance_payment_tax_draft"/);
  assert.match(pageSource, /rpc\("confirm_finance_payment"/);
  assert.doesNotMatch(pageSource, /ระบุยอด WHT เอง|updateManualWhtAmount|inferPaymentWhtPreset|value=\{form.whtAmount\}/);
});
test("business errors are actionable Thai", () => {
  assert.match(safePaymentError({ message: "WHT_LEGACY_RECALCULATION_REQUIRED" }, "fallback"), /คำนวณ WHT ใหม่/);
  assert.match(safePaymentError({ message: "WHT_PARTIAL_SCOPE_UNSUPPORTED" }, "fallback"), /บางส่วน/);
});
test("migration guards actual confirmation, preserves history and does not replace Cash/lifecycle RPCs", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/202607180036_add_structured_payment_wht.sql", import.meta.url), "utf8");
  assert.match(sql, /old.status='draft' and new.status='confirmed'/);
  assert.match(sql, /assert_finance_payment_structured_wht\(old.id\)/);
  assert.match(sql, /guard_finance_payment_child_mutation\(\)/);
  assert.doesNotMatch(sql, /create (?:or replace )?function public\.(?:confirm_finance_payment|post_confirmed_payment_to_finance_cash_transaction|reverse_finance_payment|cancel_finance_payment_draft)\(/i);
  const cash = readFileSync(new URL("../../../supabase/migrations/202607180027_integrate_payment_with_finance_cash_transactions.sql", import.meta.url), "utf8");
  assert.match(cash, /'wht_excluded_from_cash_posting', true/);
});
