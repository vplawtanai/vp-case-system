import type { UserPermissions } from "../../lib/permissions";

export type FinanceSubNavPage =
  | "quotations"
  | "fee-agreements"
  | "invoices"
  | "cash-transactions"
  | "ledger"
  | "claims"
  | "compensation";

export type FinanceNavigationLink = {
  href: string;
  page: FinanceSubNavPage;
  label: string;
};

export function financeNavigationLinks(permissions: UserPermissions): FinanceNavigationLink[] {
  return [
    permissions.canViewFinanceQuotations
      ? { href: "/finance/quotations", page: "quotations" as const, label: "ใบเสนอราคา" }
      : null,
    permissions.canViewFinanceQuotations
      ? { href: "/finance/fee-agreements", page: "fee-agreements" as const, label: "ข้อตกลงค่าบริการ" }
      : null,
    permissions.canViewFinanceQuotations
      ? { href: "/finance/invoices", page: "invoices" as const, label: "ใบแจ้งหนี้" }
      : null,
    permissions.canViewFinanceCashTransactions
      ? { href: "/finance/cash-transactions", page: "cash-transactions" as const, label: "เงินรับ–จ่าย" }
      : null,
    permissions.canViewCompanyLedger
      ? { href: "/finance/ledger", page: "ledger" as const, label: "เงินรับ–จ่ายเดิม" }
      : null,
    permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims
      ? { href: "/finance/expense-claims", page: "claims" as const, label: "เบิกค่าใช้จ่าย" }
      : null,
    permissions.canViewLawyerCompensation
      ? { href: "/finance/compensation", page: "compensation" as const, label: "ค่าตอบแทนทนาย" }
      : null,
  ].filter((link): link is FinanceNavigationLink => Boolean(link));
}
