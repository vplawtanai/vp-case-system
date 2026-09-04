import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { financeNavigationLinks } from "./finance-navigation.ts";

const fullPermissions = {
  canViewFinanceQuotations: true,
  canViewFinanceCashTransactions: true,
  canViewCompanyLedger: true,
  canSubmitExpenseClaim: true,
  canViewOwnExpenseClaims: false,
  canViewAllExpenseClaims: false,
  canViewLawyerCompensation: true,
};

test("Finance navigation keeps approved Thai labels and existing routes", () => {
  assert.deepEqual(financeNavigationLinks(fullPermissions as never), [
    { href: "/finance/quotations", page: "quotations", label: "ใบเสนอราคา" },
    { href: "/finance/fee-agreements", page: "fee-agreements", label: "ข้อตกลงค่าบริการ" },
    { href: "/finance/invoices", page: "invoices", label: "ใบแจ้งหนี้" },
    { href: "/finance/cash-transactions", page: "cash-transactions", label: "เงินรับ–จ่าย" },
    { href: "/finance/ledger", page: "ledger", label: "เงินรับ–จ่ายเดิม" },
    { href: "/finance/expense-claims", page: "claims", label: "เบิกค่าใช้จ่าย" },
    { href: "/finance/compensation", page: "compensation", label: "ค่าตอบแทนทนาย" },
  ]);
});

test("Finance navigation preserves permission filtering", () => {
  const links = financeNavigationLinks({
    ...fullPermissions,
    canViewFinanceQuotations: false,
    canViewFinanceCashTransactions: false,
    canViewCompanyLedger: false,
    canSubmitExpenseClaim: false,
    canViewOwnExpenseClaims: false,
    canViewAllExpenseClaims: true,
    canViewLawyerCompensation: false,
  } as never);

  assert.deepEqual(links, [
    { href: "/finance/expense-claims", page: "claims", label: "เบิกค่าใช้จ่าย" },
  ]);
});
