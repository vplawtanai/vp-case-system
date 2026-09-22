import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { activeFinancePage, financeNavigationItems, financeNavigationLinks } from "./finance-navigation.ts";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildPermissions } from "../../lib/permissions.ts";

const fullPermissions = buildPermissions({ role: "admin" });
const expected = {
  th: ["ใบเสนอราคา", "ข้อตกลงค่าบริการ", "รายการเรียกเก็บนอกใบเสนอราคา", "ใบแจ้งหนี้", "เงินรับ", "เอกสารรับเงิน", "การซื้อ / ค่าใช้จ่ายบริษัท", "เบิกคืนค่าใช้จ่าย", "รายการรอจ่าย", "เงินสดและบัญชี", "ภาษีและเครดิตภาษี", "เดิม"],
  en: ["Quotations", "Fee Agreements", "Non-Quotation Charges", "Invoices", "Payments", "Payment Documents", "Purchases / Company expenses", "Expense claims", "Payables", "Treasury", "Tax Position", "Legacy"],
};

for (const locale of ["th", "en"] as const) test(`${locale}: Finance navigation follows the business workflow with parallel document destinations`, () => {
  const items = financeNavigationItems(fullPermissions, locale);
  assert.deepEqual(items.map(item => item.label), expected[locale]);
  const documents = items.find(item => "group" in item && item.group === "payment-documents");
  assert.ok(documents && "children" in documents);
  assert.deepEqual(documents.children.map(link => link.href), ["/finance/receipts", "/finance/combined-documents", "/finance/tax-invoices"]);
  assert.deepEqual(documents.children.map(link => link.label), locale === "th" ? ["ใบเสร็จรับเงิน", "ใบเสร็จรับเงิน/ใบกำกับภาษี", "ใบกำกับภาษี"] : ["Receipts", "Receipt / Tax Invoice", "Tax Invoices"]);
  const legacy = items.at(-1);
  assert.ok(legacy && "children" in legacy);
  assert.deepEqual(legacy.children.map(link => link.href), ["/finance/expense-claims", "/finance/compensation", "/finance/ledger"]);
});

test("Locale changes preserve destination URLs; Cash is never mislabeled as Payments", () => {
  const links = financeNavigationLinks(fullPermissions);
  assert.deepEqual(links.map(link => link.href), financeNavigationLinks(fullPermissions, "en").map(link => link.href));
  assert.equal(links.find(link => link.page === "payments")?.href, "/finance/payments");
  assert.ok(!links.some(link => link.href === "/finance/cash-transactions"));
  assert.equal(new Set(links.map(link => link.href)).size, links.length);
  for (const link of links) assert.ok(existsSync(`app${link.href}/page.tsx`), `Navigation destination must exist: ${link.href}`);
});

test("Navigation preserves independent permissions and omits empty groups", () => {
  assert.deepEqual(financeNavigationItems({} as never), []);
  assert.deepEqual(financeNavigationLinks({ canViewFinanceReceipts: true } as never).map(link => link.page), ["receipts"]);
  assert.deepEqual(financeNavigationLinks({ canViewFinanceTaxInvoices: true } as never).map(link => link.page), ["tax-invoices"]);
  assert.deepEqual(financeNavigationLinks({ canConfirmFinancePayments: true } as never).map(link => link.page), ["payments"]);
  assert.deepEqual(financeNavigationLinks({ canViewFinanceCashTransactions: true } as never).map(link => link.page), []);
  assert.deepEqual(financeNavigationLinks({ canViewFinanceBillableCharges: true } as never).map(link => link.page), ["billable-charges"]);
});

test("UAT hides exactly the five new menus from every non-Admin, preserving old links and permission objects", () => {
  const hidden = new Set(["expenses", "expense-claims", "payables", "treasury", "tax-position"]);
  for (const locale of ["th", "en"] as const) {
    const adminLinks = financeNavigationLinks(fullPermissions, locale);
    assert.equal(adminLinks.filter(link => hidden.has(link.page)).length, 5);
    for (const role of ["partner", "finance", "lawyer", "staff", "viewer", "unknown"]) {
      // Even with all existing capabilities, a non-Admin only loses these five links.
      const permissions = { ...fullPermissions, role, expenseAccess: { can_view_all: true, can_claim: true, can_record: true, can_view_accounts: true, is_admin: true } };
      const before = structuredClone(permissions);
      assert.deepEqual(financeNavigationLinks(permissions as never, locale), adminLinks.filter(link => !hidden.has(link.page)));
      assert.deepEqual(permissions, before);
    }
  }
});

test("Exact route families activate the correct leaf, including document children and legacy", () => {
  for (const link of financeNavigationLinks(fullPermissions)) {
    assert.equal(activeFinancePage(link.href, "quotations"), link.page);
    assert.equal(activeFinancePage(`${link.href}/example/preview`, "quotations"), link.page);
  }
  assert.equal(activeFinancePage("/finance/billing-plans/example", "quotations"), "fee-agreements");
  assert.equal(activeFinancePage("/finance/invoices-unrelated", "quotations"), "quotations");
  assert.equal(activeFinancePage(null, "ledger"), "ledger");
});
