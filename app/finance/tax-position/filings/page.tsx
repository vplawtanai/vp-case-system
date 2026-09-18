"use client";
import { QuotationGuard } from "../../quotations/shared";
import FinanceSubNav from "../../FinanceSubNav";
import TaxModuleNav from "../module-nav";
import { TaxFilingWorkspace } from "./workspace";
export default function TaxFilingsPage() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinanceTaxInvoices || a.profile?.role === "partner"}>
  {a => <><FinanceSubNav activePage="tax-position" permissions={a.permissions} /><TaxModuleNav active="filings" /><TaxFilingWorkspace /></>}
 </QuotationGuard>;
}
