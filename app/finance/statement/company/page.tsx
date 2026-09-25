"use client";
import { QuotationGuard } from "../../quotations/shared";
import { CompanyStatement } from "./workspace";
export default function CompanyStatementPage() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinancePayments}>{() => <CompanyStatement />}</QuotationGuard>;
}
