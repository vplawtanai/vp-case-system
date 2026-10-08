import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { activeFinancePage, financeNavigationItems, financeNavigationLinks } from "./finance-navigation.ts";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildPermissions } from "../../lib/permissions.ts";

const fullPermissions = buildPermissions({ role: "admin" });
const expected = {
  th: ["เงินเดือนและค่าตอบแทน", "ภาพรวมการเงิน", "ใบเสนอราคา", "ค่าบริการ", "ใบแจ้งหนี้", "เงินรับ", "การจัดสรรรายได้", "เอกสารรับเงิน", "การซื้อ / ค่าใช้จ่ายบริษัท", "เบิกคืนค่าใช้จ่าย", "ภาษีและการนำส่ง", "เดิม", "จ่ายส่วนแบ่ง", "ภาพรวมเงิน"],
  en: ["Payroll & Compensation", "Finance Overview", "Quotations", "Service Fees", "Invoices", "Payments", "Revenue Distribution", "Payment Documents", "Purchases / Company expenses", "Expense claims", "Tax filing & remittance", "Legacy", "Participant payments", "Statement Overview"],
};

for (const locale of ["th", "en"] as const) test(`${locale}: Finance navigation follows the business workflow with parallel document destinations`, () => {
  const items = financeNavigationItems(fullPermissions, locale);
  assert.deepEqual(items.map(item => item.label), expected[locale]);
  const documents = items.find(item => "group" in item && item.group === "payment-documents");
  assert.ok(documents && "children" in documents);
  assert.deepEqual(documents.children.map(link => link.href), ["/finance/receipts", "/finance/combined-documents", "/finance/tax-invoices"]);
  assert.deepEqual(documents.children.map(link => link.label), locale === "th" ? ["ใบเสร็จรับเงิน", "ใบเสร็จรับเงิน/ใบกำกับภาษี", "ใบกำกับภาษี"] : ["Receipts", "Receipt / Tax Invoice", "Tax Invoices"]);
  const legacy = items.find(item => "group" in item && item.group === "legacy");
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
  assert.deepEqual(financeNavigationLinks({ canViewFinanceTaxInvoices: true } as never).map(link => link.page), ["tax-invoices", "tax-position"]);
  assert.deepEqual(financeNavigationLinks({ canConfirmFinancePayments: true } as never).map(link => link.page), ["payments"]);
  assert.deepEqual(financeNavigationLinks({ canViewFinanceCashTransactions: true } as never).map(link => link.page), []);
  assert.deepEqual(financeNavigationLinks({ canViewFinanceBillableCharges: true } as never).map(link => link.page), ["billable-charges"]);
});

test("Retired Payables never appears; source destinations keep existing role capabilities", () => {
  for (const locale of ["th", "en"] as const) for (const role of ["admin", "partner", "lawyer", "staff", "viewer"]) {
    for (const finance_operator of [false, true]) {
      const permissions = buildPermissions({ role, active: true, finance_operator });
      const before = structuredClone(permissions);
      const links = financeNavigationLinks(permissions, locale);
      assert.ok(!links.some(link => link.page === "payables"));
      assert.equal(links.some(link => link.page === "expenses"), permissions.canViewFinancePayables);
      assert.equal(links.some(link => link.page === "expense-claims"), permissions.canUseNewFinanceExpenses);
      assert.equal(links.some(link => link.page === "revenue-distribution"), permissions.canViewFinanceDistribution);
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
