"use client";
import { QuotationGuard } from "../../quotations/shared";
import { StatementMaintenance } from "../../treasury/maintenance";
export default function OpeningBalancesPage() {
 return <QuotationGuard canAccess={a => a.permissions.canManageFinanceCashTransactions}>{() => <StatementMaintenance/>}</QuotationGuard>;
}
