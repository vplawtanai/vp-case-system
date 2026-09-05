import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { invoiceInstallmentContext } from "./shared.ts";
import type { InvoiceCompositionItem, Json } from "./shared";

function draft(): Parameters<typeof invoiceInstallmentContext>[0] {
  return {
    document_status: "draft", source_model: "billable_charge_v2", language_code: "th",
    billing_plan_id: "plan", v2_bridge_id: "bridge", source_snapshot_json: { bridge_id: "bridge" }, issued_snapshot_json: null,
  };
}

function bridge(): Json {
  return {
    id: "bridge", source_snapshot_json: {
      billing_plan: { id: "plan", installment_count: 3 },
      billing_installment: { id: "installment", billing_plan_id: "plan", installment_no: 2, sort_order: 99 },
    },
  };
}

function item(type = "billing_installment_item", sourceState = "active"): InvoiceCompositionItem {
  return { source_state: sourceState, source_snapshot_json: { ready_snapshot: { source: { source_type: type } } } };
}

function issued(items = [item()]) {
  const invoice = draft();
  return {
    ...invoice, document_status: "issued",
    issued_snapshot_json: {
      schema_version: 2, source_model: "billable_charge_v2", invoice: { ...invoice, document_status: "issued" },
      source: invoice.source_snapshot_json,
      bridge: { id: "bridge", source_snapshot: bridge().source_snapshot_json },
      items: items.map((invoiceItem) => ({ invoice_item: invoiceItem })),
    },
  };
}

test("installment-only Draft displays the canonical ordinal and frozen plan count", () => {
  assert.deepEqual(invoiceInstallmentContext(draft(), [item()], bridge()), {
    label: "งวดเรียกเก็บ", value: "งวดที่ 2 จาก 3 งวด",
  });
});

test("mixed Draft qualifies the position as the Billing Plan portion only", () => {
  for (const type of ["ad_hoc_service", "recoverable_cost"]) {
    assert.deepEqual(invoiceInstallmentContext(draft(), [item(type), item()], bridge()), {
      label: "ค่าบริการตามแผน", value: "งวดที่ 2 จาก 3 งวด",
    });
  }
});

test("additional-only and standalone documents never invent an installment", () => {
  assert.equal(invoiceInstallmentContext(draft(), [item("ad_hoc_service")], bridge()), null);
  assert.equal(invoiceInstallmentContext({ ...draft(), v2_bridge_id: null, billing_plan_id: null }, [item("recoverable_cost")]), null);
});

test("released composition history does not make a current installment-only document mixed", () => {
  assert.equal(invoiceInstallmentContext(draft(), [item(), item("ad_hoc_service", "released")], bridge())?.label, "งวดเรียกเก็บ");
  assert.equal(invoiceInstallmentContext(draft(), [item("billing_installment_item", "released"), item("ad_hoc_service")], bridge()), null);
});

test("missing, inconsistent or invalid lineage is omitted instead of inferred", () => {
  assert.equal(invoiceInstallmentContext(draft(), [item()]), null);
  assert.equal(invoiceInstallmentContext(draft(), [], bridge()), null);
  assert.equal(invoiceInstallmentContext(draft(), [item(), item("unknown")], bridge()), null);
  assert.equal(invoiceInstallmentContext({ ...draft(), v2_bridge_id: "different-bridge" }, [item()], bridge()), null);
  assert.equal(invoiceInstallmentContext({ ...draft(), billing_plan_id: "different-plan" }, [item()], bridge()), null);
  for (const count of [null, 0, -1, 1, 2.5, "3"]) {
    const evidence = bridge();
    const lineage = evidence.source_snapshot_json as Json;
    (lineage.billing_plan as Json).installment_count = count;
    assert.equal(invoiceInstallmentContext(draft(), [item()], evidence), null);
  }
  for (const change of [{ installment_no: 0 }, { installment_no: 4 }, { billing_plan_id: "different-plan" }, { id: null }]) {
    const evidence = bridge();
    Object.assign((evidence.source_snapshot_json as Json).billing_installment as Json, change);
    assert.equal(invoiceInstallmentContext(draft(), [item()], evidence), null);
  }
});

test("Issued and Voided use only frozen X/Y, language and composition despite different live data", () => {
  for (const status of ["issued", "voided"]) {
    const invoice = { ...issued(), document_status: status, billing_plan_id: "changed", v2_bridge_id: null, language_code: "en", source_snapshot_json: {} };
    assert.deepEqual(invoiceInstallmentContext(invoice, [item("ad_hoc_service")], { id: "changed" }), {
      label: "งวดเรียกเก็บ", value: "งวดที่ 2 จาก 3 งวด",
    });
    assert.deepEqual(invoiceInstallmentContext({ ...issued([item(), item("ad_hoc_service")]), document_status: status }, [], null), {
      label: "ค่าบริการตามแผน", value: "งวดที่ 2 จาก 3 งวด",
    });
  }
});

test("missing issued evidence cannot be repaired by a live bridge or Draft item list", () => {
  for (const missing of ["bridge", "items"]) {
    const invoice = issued();
    delete (invoice.issued_snapshot_json as Json)[missing];
    assert.equal(invoiceInstallmentContext(invoice, [item()], bridge()), null);
  }
  const invoice = issued();
  delete (((invoice.issued_snapshot_json.bridge.source_snapshot as Json).billing_plan) as Json).installment_count;
  assert.equal(invoiceInstallmentContext(invoice, [item()], bridge()), null);
  assert.equal(invoiceInstallmentContext({ ...draft(), document_status: "issued" }, [item()], bridge()), null);
});

test("historical V1 preserves frozen ordinal/title without inventing the missing plan count", () => {
  const source = { invoice_source_model: "installment_v1", billing_plan: { id: "legacy-plan" }, billing_installment: { id: "legacy-installment", installment_no: 1, title: "ค่าบริการเดิม" } };
  const invoice = { ...draft(), source_model: "installment_v1" as const, source_snapshot_json: source };
  const expected = { label: "งวดเรียกเก็บเงิน", value: "งวดที่ 1 · ค่าบริการเดิม" };
  assert.deepEqual(invoiceInstallmentContext(invoice, [], bridge()), expected);
  assert.deepEqual(invoiceInstallmentContext({ ...invoice, document_status: "issued", source_snapshot_json: {}, issued_snapshot_json: { schema_version: 1, invoice: { language_code: "th" }, source } }, [], bridge()), expected);
  assert.equal(invoiceInstallmentContext({ ...invoice, source_snapshot_json: {} }, []), null);
});

test("English documents use the same authoritative context and no source data is mutated", () => {
  const invoice = { ...draft(), language_code: "en" };
  const evidence = bridge();
  const items = [item()];
  const before = JSON.stringify({ invoice, evidence, items });
  assert.deepEqual(invoiceInstallmentContext(invoice, items, evidence), { label: "Billing installment", value: "Installment 2 of 3" });
  assert.equal(JSON.stringify({ invoice, evidence, items }), before);
});

test("Preview uses one shared context resolver and does not query live installment lineage for Issued", () => {
  const preview = readFileSync(new URL("./[id]/preview/page.tsx", import.meta.url), "utf8");
  const document = readFileSync(new URL("./invoice-document.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./invoice-document.module.css", import.meta.url), "utf8");
  assert.match(preview, /const bridgeResult = currentInvoice.document_status === "draft" && currentInvoice.v2_bridge_id/);
  assert.match(preview, /const sourceInstallmentId = currentInvoice.document_status === "draft"/);
  assert.match(preview, /setInstallmentContext\(invoiceInstallmentContext\(currentInvoice/);
  assert.match(preview, /installmentContext=\{installmentContext\}/);
  assert.match(document, /<p className=\{styles.installmentContext\}><span>\{installmentContext.label\}:<\/span> \{installmentContext.value\}<\/p>/);
  assert.doesNotMatch(document, /source_model !== "billable_charge_v2" && Boolean\(installment/);
  assert.match(css, /\.installmentContext\s*\{[^}]*font-size: 8pt;[^}]*overflow-wrap: anywhere;/);
});
