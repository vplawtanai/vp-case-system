"use client";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import { RevenueWorkspace } from "./workspace";
export default function RevenueDistributionPage() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinancePayments}>{a => <><FinanceSubNav activePage="revenue-distribution" permissions={a.permissions} /><RevenueWorkspace /></>}</QuotationGuard>;
}
