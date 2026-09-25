"use client";
import { QuotationGuard } from "../quotations/shared";
import { StatementOverview } from "./overview";
export default function StatementIndex() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinancePayments || a.permissions.canViewFinanceCashTransactions}>{a => <StatementOverview canCompany={a.permissions.canViewFinancePayments} canCash={a.permissions.canViewFinanceCashTransactions}/>}</QuotationGuard>;
}
