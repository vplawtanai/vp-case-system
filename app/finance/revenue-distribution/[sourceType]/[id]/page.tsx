"use client";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../../quotations/shared";
import FinanceSubNav from "../../../FinanceSubNav";
import { RevenueDetail } from "../../detail";
export default function RevenueDistributionDetailPage() {
 const { sourceType, id } = useParams<{ sourceType: string; id: string }>();
 return <QuotationGuard canAccess={a => a.permissions.canViewFinancePayments}>{a => <><FinanceSubNav activePage="revenue-distribution" permissions={a.permissions} /><RevenueDetail key={`${sourceType}:${id}`} sourceType={sourceType} sourceId={id} /></>}</QuotationGuard>;
}
