import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { calculateAssistedPaymentAmounts, derivePaymentWhtBase, hasValidCurrencyPrecision, normalizedAmount, paymentAmountsForWhtMode, paymentFingerprint, paymentWhtAssistance, paymentWhtAssistanceCopy } from "./shared.ts";
import type { PaymentForm, PaymentWhtMode } from "./shared";

const vatInclusive = { amountBeforeVat: 4672.90, vatAmount: 327.10, totalAmount: 5000 };
const noVat = { amountBeforeVat: 5000, vatAmount: 0, totalAmount: 5000 };
const mixed = { amountBeforeVat: 11345.79, vatAmount: 654.21, totalAmount: 12000 };
const form: PaymentForm = {
  cashAmount: "4850.00", whtAmount: "150.00", receivedOn: "2026-09-01", paymentMethod: "bank_transfer",
  receivingBankAccountId: "test-bank", receivingAccountReference: "", externalTransactionReference: "", payerName: "", note: "",
};
const pageSource = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
const pageAst = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Exercise the page's actual handlers without loading Supabase or invoking any RPC.
function handler(name: string, context: Record<string, unknown>) {
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(pageAst) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(pageAst);
  assert.ok(initializer, `Missing page handler: ${name}`);
  const code = ts.transpileModule(`(${initializer.getText(pageAst)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(code, context);
}

test("positive saved WHT reloads as manual with exact monetary facts and no preset", () => {
  const baseline = paymentFingerprint(form);
  assert.deepEqual(paymentWhtAssistance(form), { settlementTarget: "5000.00", whtMode: "manual", whtRateOption: "" });
  assert.equal(form.cashAmount, "4850.00");
  assert.equal(form.whtAmount, "150.00");
  assert.equal(paymentFingerprint(form), baseline);
  assert.match(pageSource, /const assistance = paymentWhtAssistance\(nextForm\)/);
  assert.match(pageSource, /setForm\(nextForm\)/);
  assert.doesNotMatch(pageSource, /inferPaymentWhtPreset|savedWhtBase|savedWhtPreset/);
});

test("manual WHT survives target edit even when it matches a preset", () => {
  for (const invoice of [noVat, vatInclusive, mixed]) {
    assert.deepEqual(paymentAmountsForWhtMode("3000", "manual", "150.00", 3, invoice), { cashAmount: "2850.00", whtAmount: "150.00" });
  }
  const saved = { cashAmount: "4859.81", whtAmount: "140.19" };
  const loaded = paymentWhtAssistance(saved);
  assert.equal(loaded.whtMode, "manual");
  assert.equal(loaded.whtRateOption, "");
  assert.deepEqual(paymentAmountsForWhtMode("3000", loaded.whtMode, saved.whtAmount, 0, vatInclusive), { cashAmount: "2859.81", whtAmount: "140.19" });
});

test("manual editing preserves entered strings, including invalid precision for validation", () => {
  for (const value of ["150", "150.0", "150.00", "150.001", "", "-1"]) {
    assert.equal(paymentAmountsForWhtMode("3000", "manual", value, 3, vatInclusive).whtAmount, value);
  }
});

test("unrelated page field edit cannot recalculate WHT", () => {
  let edited = { ...form };
  handler("updateForm", {
    setForm: (update: (current: PaymentForm) => PaymentForm) => { edited = update(edited); },
    setErrors: () => {}, setMessage: () => {},
  })("note", "Updated note");
  assert.deepEqual({ ...edited }, { ...form, note: "Updated note" });
});

test("enabling WHT defaults to manual, never to a rate", () => {
  let mode = "none";
  let rate = "3";
  let custom = "2.5";
  let amountMode = "";
  handler("selectWhtMode", {
    whtMode: "none", settlementTarget: "5000",
    setWhtMode: (value: string) => { mode = value; },
    setWhtRateOption: (value: string) => { rate = value; },
    setCustomWhtRate: (value: string) => { custom = value; },
    setAssistedAmounts: (_target: string, value: string) => { amountMode = value; },
  })(true);
  assert.equal(mode, "manual");
  assert.equal(amountMode, "manual");
  assert.equal(rate, "");
  assert.equal(custom, "");
});

test("opening assistance clears rates and cannot change monetary fields", () => {
  let mode = "manual";
  let rate = "3";
  let custom = "2.5";
  handler("openWhtRateAssistance", {
    setWhtMode: (value: string) => { mode = value; },
    setWhtRateOption: (value: string) => { rate = value; },
    setCustomWhtRate: (value: string) => { custom = value; },
    setErrors: () => {},
    setForm: () => assert.fail("Opening assistance must not change money"),
    setAssistedAmounts: () => assert.fail("Opening assistance must not recalculate"),
  })();
  assert.equal(mode, "calculated");
  assert.equal(rate, "");
  assert.equal(custom, "");
  assert.equal(paymentAmountsForWhtMode("3000", "calculated", "150.00", 0, vatInclusive).whtAmount, "150.00");
});

test("explicit preset and custom selection enables rate assistance in this session", () => {
  let mode = "manual";
  let rate = "";
  let amounts = { ...form };
  handler("selectWhtRate", {
    settlementTarget: "5000", customWhtRate: "2.5",
    setWhtMode: (value: string) => { mode = value; },
    setWhtRateOption: (value: string) => { rate = value; },
    setAssistedAmounts: (target: string, nextMode: PaymentWhtMode, option: string, custom: string) => {
      amounts = { ...amounts, ...paymentAmountsForWhtMode(target, nextMode, amounts.whtAmount, Number(option === "custom" ? custom : option), vatInclusive) };
    },
  })("3");
  assert.equal(mode, "calculated");
  assert.equal(rate, "3");
  assert.equal(amounts.whtAmount, "140.19");
  assert.equal(amounts.cashAmount, "4859.81");
  assert.deepEqual(paymentAmountsForWhtMode("5000", "calculated", "150.00", 2.5, vatInclusive), { cashAmount: "4883.18", whtAmount: "116.82" });
});

test("rate-assisted save reloads as manual, not as reconstructed rate intent", () => {
  const saved = paymentAmountsForWhtMode("5000", "calculated", "150.00", 3, vatInclusive);
  const loaded = paymentWhtAssistance(saved);
  assert.deepEqual(loaded, { settlementTarget: "5000.00", whtMode: "manual", whtRateOption: "" });
  assert.deepEqual(paymentAmountsForWhtMode("3000", loaded.whtMode, saved.whtAmount, 0, vatInclusive), { cashAmount: "2859.81", whtAmount: "140.19" });
});

test("VAT-inclusive proportional assistance reconciles without changing Invoice totals", () => {
  const before = { ...vatInclusive };
  assert.deepEqual(calculateAssistedPaymentAmounts("3000", 3, vatInclusive), {
    settlement: 3000, whtBase: 2803.74, whtAmount: 84.11, cashAmount: 2915.89, reliableBase: true,
  });
  assert.deepEqual(vatInclusive, before);
});

test("mixed Invoice assistance is arithmetic only and explicitly described as estimated", () => {
  const result = calculateAssistedPaymentAmounts(5000, 3, mixed);
  assert.equal(result.whtBase, 4727.41);
  assert.equal(result.whtAmount, 141.82);
  assert.equal(normalizedAmount(result.cashAmount + result.whtAmount), 5000);
  assert.equal(paymentWhtAssistanceCopy.base, "ฐานประมาณการสำหรับช่วยคำนวณ");
  assert.match(paymentWhtAssistanceCopy.helper, /สัดส่วนมูลค่าก่อน VAT/);
  assert.match(paymentWhtAssistanceCopy.helper, /ใช้เพื่อช่วยคำนวณเท่านั้น/);
  assert.match(paymentWhtAssistanceCopy.helper, /ตรวจสอบฐานและอัตรา/);
  const helperUi = pageSource.slice(pageSource.indexOf('{whtMode === "calculated" && !draftAllocationEditingLimited ?'), pageSource.indexOf('{whtMode === "manual" && !draftAllocationEditingLimited ?'));
  assert.match(helperUi, /paymentWhtAssistanceCopy\.base/);
  assert.match(helperUi, /paymentWhtAssistanceCopy\.helper/);
  assert.equal(pageSource.split("paymentWhtAssistanceCopy.base").length - 1, 1);
  assert.doesNotMatch(pageSource, /label="ฐานคำนวณ WHT"|อัตรา WHT ที่อนุมานได้/);
});

test("zero WHT retains none mode and deliberate removal clears WHT", () => {
  assert.deepEqual(paymentWhtAssistance({ cashAmount: "5000.00", whtAmount: "0.00" }), { settlementTarget: "5000.00", whtMode: "none", whtRateOption: "" });
  assert.deepEqual(paymentAmountsForWhtMode("3000", "none", "150.00", 3, vatInclusive), { cashAmount: "3000.00", whtAmount: "0.00" });
});

test("unavailable estimate or invalid rate does not silently erase entered WHT", () => {
  for (const rate of [0, -1, 101, NaN]) {
    assert.equal(paymentAmountsForWhtMode("5000", "calculated", "150.00", rate, vatInclusive).whtAmount, "150.00");
  }
  assert.equal(paymentAmountsForWhtMode("5000", "calculated", "150.00", 3, { ...vatInclusive, totalAmount: 6000 }).whtAmount, "150.00");
});

function validate(amounts: Pick<PaymentForm, "cashAmount" | "whtAmount">, target = "5000", mode: PaymentWhtMode = "manual", rate = 0) {
  const cash = normalizedAmount(amounts.cashAmount);
  const wht = normalizedAmount(amounts.whtAmount);
  let errors: Record<string, string> = {};
  const passed = handler("validate", {
    form: { ...form, ...amounts }, settlementTarget: target, targetSettlement: normalizedAmount(target), cash, wht,
    paymentSettlement: normalizedAmount(cash + wht), outstandingBefore: 5000,
    draftAllocationEditingLimited: false, whtMode: mode, selectedWhtRate: rate,
    currentWhtBase: derivePaymentWhtBase(target, vatInclusive), hasValidCurrencyPrecision, normalizedAmount,
    bangkokToday: () => "2026-09-05", setErrors: (next: Record<string, string>) => { errors = next; },
    requestAnimationFrame: () => {},
  })(true);
  return { passed, errors };
}

test("existing validation accepts complete manual and explicitly calculated amounts", () => {
  assert.equal(validate(form).passed, true);
  assert.equal(validate(paymentAmountsForWhtMode("5000", "calculated", "150.00", 3, vatInclusive), "5000", "calculated", 3).passed, true);
  assert.equal(validate({ cashAmount: "5000.00", whtAmount: "0.00" }, "5000", "none").passed, true);
});

test("existing validation still rejects negative amounts, precision, and inconsistent totals", () => {
  for (const amounts of [
    { cashAmount: "-1", whtAmount: "5001" },
    { cashAmount: "5001", whtAmount: "-1" },
    { cashAmount: "4850", whtAmount: "150.001" },
    { cashAmount: "4850", whtAmount: "100" },
  ]) assert.equal(validate(amounts).passed, false);
});

test("existing validation rejects over-settlement and WHT above target", () => {
  assert.ok(validate({ cashAmount: "5850", whtAmount: "150" }, "6000").errors.allocation);
  const amounts = paymentAmountsForWhtMode("100", "manual", "150.00", 0, vatInclusive);
  assert.equal(amounts.whtAmount, "150.00");
  assert.equal(amounts.cashAmount, "0.00");
  assert.ok(validate(amounts, "100").errors.whtAmount);
});

test("existing validation requires a valid explicit rate when calculator is open", () => {
  for (const rate of [0, -1, 101, NaN]) assert.ok(validate(form, "5000", "calculated", rate).errors.whtRate);
});
