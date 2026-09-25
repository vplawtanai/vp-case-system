"use client";
import { QuotationGuard } from "../quotations/shared";
import { StatementOverview } from "./overview";
export default function StatementIndex() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinanceCashTransactions}>{a => <StatementOverview canCash={a.permissions.canViewFinanceCashTransactions}/>}</QuotationGuard>;
}
