"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { UserPermissions } from "../../lib/permissions";

export type FinanceSubNavPage =
  | "quotations"
  | "fee-agreements"
  | "billable-charges"
  | "cash-transactions"
  | "ledger"
  | "claims"
  | "compensation";

export default function FinanceSubNav({
  activePage,
  permissions,
}: {
  activePage: FinanceSubNavPage;
  permissions: UserPermissions;
}) {
  const links = [
    permissions.canViewFinanceQuotations
      ? { href: "/finance/quotations", page: "quotations" as const, label: "Quotations" }
      : null,
    permissions.canViewFinanceQuotations
      ? { href: "/finance/fee-agreements", page: "fee-agreements" as const, label: "Fee Agreements" }
      : null,
    permissions.canViewFinanceBillableCharges
      ? { href: "/finance/billable-charges", page: "billable-charges" as const, label: "รายการรอเรียกเก็บ" }
      : null,
    permissions.canViewFinanceCashTransactions
      ? { href: "/finance/cash-transactions", page: "cash-transactions" as const, label: "รายการเงินรับ–จ่าย" }
      : null,
    permissions.canViewCompanyLedger
      ? { href: "/finance/ledger", page: "ledger" as const, label: "รายการรับ–จ่ายเดิม" }
      : null,
    permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims
      ? { href: "/finance/expense-claims", page: "claims" as const, label: "Expense Claims" }
      : null,
    permissions.canViewLawyerCompensation
      ? { href: "/finance/compensation", page: "compensation" as const, label: "Lawyer Compensation" }
      : null,
  ].filter((link): link is NonNullable<typeof link> => Boolean(link));

  return (
    <nav style={subNavStyle} aria-label="เมนูการเงิน">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          style={activePage === link.page ? activeLinkStyle : linkStyle}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

const subNavStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  overflowX: "auto",
  padding: "4px 0 14px",
  marginBottom: 18,
};

const linkStyle: CSSProperties = {
  flex: "0 0 auto",
  minHeight: 38,
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #d7dde5",
  borderRadius: 7,
  padding: "8px 12px",
  color: "#475569",
  background: "#ffffff",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 700,
};

const activeLinkStyle: CSSProperties = {
  ...linkStyle,
  color: "#ffffff",
  borderColor: "#17324d",
  background: "#17324d",
};
