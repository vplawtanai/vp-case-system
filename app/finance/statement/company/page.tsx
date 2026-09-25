"use client";
import { QuotationGuard } from "../../quotations/shared";
import { UnifiedStatement } from "../workspace";
export default function CompanyStatementPage() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinancePayments}>{() => <UnifiedStatement />}</QuotationGuard>;
}
