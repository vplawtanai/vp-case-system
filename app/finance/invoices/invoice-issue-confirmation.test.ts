import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { invoiceCompositionSourceLabel, invoiceInstallmentContext } from "./shared.ts";
import type { InvoiceCompositionItem, Json } from "./shared";

const pageSource = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
const pageAst = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, string>();
let confirmationField = "";
function visit(node: ts.Node, inConfirmation = false) {
  const inside = inConfirmation || (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(pageAst) === "id"
    && attribute.initializer?.getText(pageAst) === '"invoice-issue-confirmation"'));
  if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(pageAst), node.initializer.getText(pageAst));
  if (ts.isFunctionDeclaration(node) && node.name?.text === "Field") declarations.set("Field", node.getText(pageAst));
  if (inside && ts.isJsxSelfClosingElement(node) && node.tagName.getText(pageAst) === "Field"
    && node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
      && attribute.name.getText(pageAst) === "label" && attribute.initializer?.getText(pageAst).includes('"ที่มาของยอด"'))) {
    confirmationField = node.getText(pageAst);
  }
  ts.forEachChild(node, (child) => visit(child, inside));
}
visit(pageAst);
assert.ok(confirmationField, "Missing source field inside the final Issue confirmation");
const source = ["fieldLabel", "fieldValue", "issueInstallmentNote", "invoiceSourceLabel", "issueInstallmentContext"].map((name) => {
  assert.ok(declarations.has(name), `Missing page declaration: ${name}`);
  return `const ${name} = ${declarations.get(name)};`;
}).join("\n");
assert.ok(declarations.has("Field"));
// Render the page's actual source field without mounting its loader or any RPC.
const compiled = ts.transpileModule(`${declarations.get("Field")}\n${source}\n(${confirmationField})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

function draft(): Parameters<typeof invoiceInstallmentContext>[0] {
  return { document_status: "draft", source_model: "billable_charge_v2", language_code: "th", billing_plan_id: "plan", v2_bridge_id: "bridge", source_snapshot_json: { bridge_id: "bridge" }, issued_snapshot_json: null };
}
function bridge(): Json {
  return { id: "bridge", source_snapshot_json: {
    billing_plan: { id: "plan", installment_count: 3 },
    billing_installment: { id: "installment", billing_plan_id: "plan", installment_no: 2 },
  } };
}
function item(type = "billing_installment_item", state = "active"): InvoiceCompositionItem {
  return { source_state: state, source_snapshot_json: { ready_snapshot: { source: { source_type: type } } } };
}
function render(items: InvoiceCompositionItem[], v2Bridge: Json | null = bridge(), invoice = draft()) {
  const before = JSON.stringify({ invoice, items, v2Bridge });
  const markup = renderToStaticMarkup(runInNewContext(compiled, {
    React, invoice, items, v2Bridge,
    isDraft: invoice.document_status === "draft", isV2: invoice.source_model === "billable_charge_v2",
    installmentLabel: "งวดที่ 1 · เดิม", engagementReference: "ข้อตกลงเดิม",
    invoiceCompositionSourceLabel, invoiceInstallmentContext,
  }));
  assert.equal(JSON.stringify({ invoice, items, v2Bridge }), before);
  return markup;
}

test("final Issue confirmation shows installment-only position beneath its source label", () => {
  const markup = render([item()]);
  assert.match(markup, /ยอดตามแผนเรียกเก็บเงิน<small[^>]*>งวดที่ 2 จาก 3 งวด<\/small>/);
  assert.match(markup, /display:block;[^\"]*color:#64748b;font-size:13px/);
});

test("mixed confirmation uses the same short position without the customer-facing prefix", () => {
  for (const type of ["ad_hoc_service", "recoverable_cost"]) {
    const markup = render([item(), item(type)]);
    assert.match(markup, /ยอดตามแผน \+ รายการเรียกเก็บเพิ่มเติม<small[^>]*>งวดที่ 2 จาก 3 งวด<\/small>/);
    assert.doesNotMatch(markup, /ค่าบริการตามแผน/);
  }
});

test("additional-only confirmation has no installment line, including released installment history", () => {
  for (const items of [[item("ad_hoc_service")], [item("recoverable_cost"), item("billing_installment_item", "released")]]) {
    const markup = render(items);
    assert.match(markup, /รายการเรียกเก็บเพิ่มเติม/);
    assert.doesNotMatch(markup, /งวดที่|จาก 3 งวด/);
  }
});

test("missing, incomplete or inconsistent lineage cannot fabricate confirmation context", () => {
  const incomplete = bridge();
  delete ((incomplete.source_snapshot_json as Json).billing_plan as Json).installment_count;
  for (const evidence of [null, {}, incomplete, { ...bridge(), id: "wrong-bridge" }]) {
    const markup = render([item()], evidence);
    assert.match(markup, /ยอดตามแผนเรียกเก็บเงิน/);
    assert.doesNotMatch(markup, /งวดที่|จาก 3 งวด/);
  }
});

test("internal confirmation remains Thai even when the customer document is English", () => {
  assert.match(render([item()], bridge(), { ...draft(), language_code: "en" }), /งวดที่ 2 จาก 3 งวด/);
});

test("historical V1 confirmation keeps its existing ordinal/title without inventing a total", () => {
  const markup = render([], null, { ...draft(), source_model: "installment_v1", v2_bridge_id: null });
  assert.match(markup, /งวดที่ 1 · เดิม/);
  assert.doesNotMatch(markup, /จาก 3 งวด/);
});

test("detail loads the same immutable bridge evidence used by Preview", () => {
  assert.match(pageSource, /from\("finance_billing_installment_charge_bridges"\)\.select\("id,billing_installment_id,billing_plan_id,fee_agreement_id,source_snapshot_json"\)/);
  assert.match(declarations.get("issueInstallmentContext") || "", /invoiceInstallmentContext\(/);
  assert.doesNotMatch(declarations.get("issueInstallmentContext") || "", /installment_no|installment_count/);
});
