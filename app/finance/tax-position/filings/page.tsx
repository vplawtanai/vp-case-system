"use client";
import { QuotationGuard } from "../../quotations/shared";
import FinanceSubNav from "../../FinanceSubNav";
import TaxHome from "../tax-home";
export default function TaxFilingsPage() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinanceTaxInvoices || a.profile?.role === "partner"}>
  {a => <><FinanceSubNav activePage="tax-position" permissions={a.permissions} /><TaxHome permissions={a.permissions} /></>}
 </QuotationGuard>;
}
