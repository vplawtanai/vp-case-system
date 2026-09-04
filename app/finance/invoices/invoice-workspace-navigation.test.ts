import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { invoiceWorkspaceNavigationLinks } from "./invoice-workspace-navigation.ts";

test("Invoice secondary navigation keeps distinct child labels and existing routes", () => {
  assert.deepEqual(invoiceWorkspaceNavigationLinks(), [
    { href: "/finance/invoices", page: "invoices", label: "รายการใบแจ้งหนี้" },
    { href: "/finance/billable-charges", page: "billable-charges", label: "รายการเรียกเก็บเพิ่มเติม" },
  ]);
});

test("Invoice secondary navigation preserves additional-charge permission filtering", () => {
  assert.deepEqual(invoiceWorkspaceNavigationLinks(false), [
    { href: "/finance/invoices", page: "invoices", label: "รายการใบแจ้งหนี้" },
  ]);
});
