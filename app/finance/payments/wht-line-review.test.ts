import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
// @ts-expect-error Node strip-types runner uses explicit extensions.
import { evaluateWhtLines, initialWhtLineChoices, restoreWhtLineChoices, whtLineFingerprint, whtLinePayload, whtLineRpcError, whtLineScope } from "./wht-line-review.ts";
// @ts-expect-error Node strip-types runner uses explicit extensions.
import { invoiceTaxFacts, savedPaymentWht } from "./tax.ts";
// @ts-expect-error Node strip-types runner uses explicit extensions.
import { translate, resolveUiMessage } from "../../../lib/i18n/catalog.ts";
import type { WhtComponent } from "./tax";
import type { WhtLineChoice } from "./wht-line-review";

const snapshot = { schema_version: 2, source_model: "billable_charge_v2", invoice: { id: "invoice", document_status: "issued", currency: "THB", amount_before_vat: 18672.90, vat_amount: 607.10, total_amount: 19280 },
  items: [{ id: "translation", description: "ค่าแปลเอกสาร", beforeVat: 4000, vat: 280 }, { id: "legal", description: "ค่าวิชาชีพทนาย งวดที่ 1", beforeVat: 10000, vat: 0 }, { id: "travel", description: "ค่าเดินทางไปศาล", beforeVat: 4672.90, vat: 327.10 }].map(line => ({ invoice_item: { ...line, invoice_id: "invoice", source_state: "active", amount_before_vat: line.beforeVat, vat_amount: line.vat, line_total: line.beforeVat + line.vat, vat_applicable: line.vat > 0, economic_classification: "not_a_wht_rule" } })) };
const facts = invoiceTaxFacts(snapshot)!;
const selected = (): WhtLineChoice[] => initialWhtLineChoices(facts).map(choice => ({ ...choice, applicability: "applies", rate: "3" }));
function stored(choices: WhtLineChoice[]): WhtComponent[] {
  const review = evaluateWhtLines(facts, choices);
  return choices.map((choice, index) => {
    const line = facts.lines[index];
    return { id: "component-" + line.id, payment_id: "payment", invoice_id: facts.invoiceId, invoice_item_id: line.id,
      calculation_rule: "line_review_full_invoice_v2", base_amount: line.beforeVat, rate_percent: choice.applicability === "applies" ? choice.rate : null,
      calculated_wht_amount: review.amounts[line.id], basis_snapshot_json: { applicability: choice.applicability, basis: { invoice_id: facts.invoiceId, invoice_item_id: line.id, currency: facts.currency,
        amount_before_vat: line.beforeVat, vat_amount: line.vat, total_amount: line.gross, vat_applicable: line.vatApplicable, calculation_rule: "line_review_full_invoice_v2" } } };
  });
}

test("three frozen lines start unresolved regardless of VAT, classification or descriptions", () => {
  assert.deepEqual(facts.lines.map(line => line.beforeVat), [4000, 10000, 4672.9]);
  const choices = initialWhtLineChoices(facts);
  assert.ok(choices.every(choice => choice.applicability === "unknown" && choice.rate === ""));
  const review = evaluateWhtLines(facts, choices);
  assert.equal(review.totals, null);
  assert.deepEqual(review.issues.map(issue => issue.message.parameters?.line), snapshot.items.map(item => item.invoice_item.description));
});
test("all applicable uses before-VAT bases and exact per-line rounding", () => {
  const source = JSON.stringify(snapshot), review = evaluateWhtLines(facts, selected());
  assert.deepEqual(review.amounts, { translation: "120.00", legal: "300.00", travel: "140.19" });
  assert.deepEqual(review.totals, { whtAmount: "560.19", cashAmount: "18719.81" });
  assert.equal(Number(review.totals!.cashAmount) + Number(review.totals!.whtAmount), 19280);
  assert.equal(facts.vat, 607.10); assert.equal(JSON.stringify(snapshot), source);
});
test("mixed and all non-applicable lines calculate zero only for explicit decisions", () => {
  const choices = selected(); choices[1] = { ...choices[1], applicability: "does_not_apply" };
  assert.deepEqual(evaluateWhtLines(facts, choices).totals, { whtAmount: "260.19", cashAmount: "19019.81" });
  assert.equal(evaluateWhtLines(facts, choices).amounts.legal, "0.00");
  assert.equal(whtLinePayload(choices)[1].rate_percent, null);
  const none = choices.map(choice => ({ ...choice, applicability: "does_not_apply" as const }));
  assert.deepEqual(evaluateWhtLines(facts, none).totals, { whtAmount: "0.00", cashAmount: "19280.00" });
});
test("rates are explicit, independently calculated, and limited to 041 precision", () => {
  for (const rate of ["", "0", "101", "-1", "3.00001", "NaN"]) {
    const choices = selected(); choices[2].rate = rate;
    const result = evaluateWhtLines(facts, choices);
    assert.equal(result.totals, null); assert.equal(result.issues[0].invoiceItemId, "travel");
  }
  const custom = selected(); custom[0] = { ...custom[0], rate: "2.1234", customRate: true };
  assert.equal(evaluateWhtLines(facts, custom).amounts.translation, "84.94");
  assert.equal(custom[1].rate, "3");
});
test("missing, duplicated and unknown source lines fail closed", () => {
  assert.equal(evaluateWhtLines(facts, selected().slice(1)).issues[0].invoiceItemId, "translation");
  assert.equal(evaluateWhtLines(facts, [...selected(), selected()[0]]).totals, null);
  assert.equal(evaluateWhtLines(facts, [...selected(), { ...selected()[0], invoiceItemId: "other" }]).totals, null);
  assert.ok(whtLineScope(facts, "19280", 19280, 2, 19280));
  assert.ok(whtLineScope(facts, "19280", 10000, 1, 10000));
  assert.ok(whtLineScope(facts, "10000", 19280, 1, 19280));
  assert.equal(whtLineScope(facts, "19280", 19280, 1, 19280), null);
});
test("save/reload restores explicit decisions, custom rates and persisted evidence", () => {
  const choices = selected(); choices[0] = { ...choices[0], rate: "2.1234", customRate: true }; choices[1] = { ...choices[1], applicability: "does_not_apply", rate: "" };
  const restored = restoreWhtLineChoices(facts, stored(choices), "payment");
  assert.equal(restored.valid, true); assert.deepEqual(restored.choices, choices);
  assert.equal(whtLineFingerprint(choices), whtLineFingerprint(restored.choices));
  assert.deepEqual(evaluateWhtLines(facts, restored.choices).totals, evaluateWhtLines(facts, choices).totals);
});
test("empty/corrupt evidence is not inferred from monetary WHT and cannot confirm cleanly", () => {
  const components = stored(selected());
  for (const corrupt of [[], [...components, components[0]], components.map((c, index) => index === 0 ? { ...c, base_amount: 100 } : c), components.map(c => ({ ...c, payment_id: "wrong" }))]) {
    assert.equal(restoreWhtLineChoices(facts, corrupt, "payment").valid, false);
  }
  assert.equal(savedPaymentWht({ cash_amount: 19280, wht_amount: 0, wht_calculation_mode: "line_review" }, []).mode, "line_review");
  assert.equal(savedPaymentWht({ cash_amount: 18719.81, wht_amount: 560.19 }, []).mode, "legacy");
});
test("all non-applicable stored evidence is preserved rather than recast as legacy none", () => {
  const choices = selected().map(choice => ({ ...choice, applicability: "does_not_apply" as const, rate: "" }));
  assert.equal(restoreWhtLineChoices(facts, stored(choices), "payment").valid, true);
  assert.equal(savedPaymentWht({ cash_amount: 19280, wht_amount: 0, wht_calculation_mode: "line_review" }, stored(choices)).mode, "line_review");
});
test("TH/EN errors identify the line; retranslating does not change choices or dirty fingerprint", () => {
  const choices = selected(); choices[2].rate = "";
  const before = JSON.stringify(choices), fingerprint = whtLineFingerprint(choices);
  const issue = evaluateWhtLines(facts, choices).issues[0];
  assert.match(resolveUiMessage("th", issue.message), /ค่าเดินทางไปศาล/);
  assert.match(resolveUiMessage("en", issue.message), /Select a rate/);
  assert.equal(JSON.stringify(choices), before); assert.equal(whtLineFingerprint(choices), fingerprint);
  assert.equal(translate("en", "finance.payment.wht.lines.unknown"), "Not Yet Determined");
});
test("server line errors consume only known IDs and never reveal raw database detail", () => {
  const message = whtLineRpcError({ message: "WHT_LINE_APPLICABILITY_REQUIRED", details: '{"invoice_item_id":"travel","secret":"hidden"}', hint: "hidden" }, facts);
  assert.match(resolveUiMessage("th", message), /ค่าเดินทางไปศาล/);
  assert.doesNotMatch(JSON.stringify(message), /hidden|travel/);
});

const pageSource = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map<string, string>();
function visit(node: ts.Node) { if (ts.isVariableDeclaration(node) && node.initializer) functions.set(node.name.getText(ast), node.initializer.getText(ast)); ts.forEachChild(node, visit); }
visit(ast);
test("actual save handler uses only 041 choice payload and never submits calculated financial values", async () => {
  const calls: { name: string; payload: Record<string, unknown> }[] = []; let loads = 0;
  const run = runInNewContext(ts.transpileModule(`(${functions.get("saveDraft")})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    payment: { id: "payment" }, allocation: {}, isDraft: true, access: { canManage: true }, dirty: true, saving: false, actionLock: { current: false }, validate: () => true,
    setSaving() {}, setError() {}, setMessage() {}, whtMode: "line_review", whtLineChoices: selected(), whtLinePayload,
    form: { receivedOn: "2026-09-09", paymentMethod: "bank_transfer", receivingBankAccountId: "bank", receivingAccountReference: "", externalTransactionReference: "", payerName: "", note: "" },
    supabase: { rpc: async (name: string, payload: Record<string, unknown>) => { calls.push({ name, payload }); return { data: "payment", error: null }; } },
    load: async () => { loads++; }, uiMessage: (key: string) => ({ key }), console,
  });
  await run(); assert.equal(loads, 1); assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "save_finance_payment_wht_lines_draft");
  assert.deepEqual(calls[0].payload.p_line_choices_json, whtLinePayload(selected()));
  for (const key of ["p_cash_amount", "p_wht_amount", "p_allocations_json", "p_wht_rate_percent"]) assert.equal(key in calls[0].payload, false);
});
test("workspace preserves 036 save and confirm routes; locale cannot trigger a reload", () => {
  assert.match(pageSource, /rpc\("save_finance_payment_tax_draft"/);
  assert.match(pageSource, /rpc\("confirm_finance_payment"/);
  assert.match(pageSource, /whtMode === "line_review" && !storedLineEvidenceValid/);
  assert.match(pageSource, /whtLineFingerprint\(whtLineChoices\)/);
  assert.match(pageSource, /}, \[id\]\);/);
});
