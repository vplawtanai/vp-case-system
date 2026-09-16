"use client";
import { useParams, useSearchParams } from "next/navigation";
import { QuotationGuard } from "../../quotations/shared";
import { PayoutWorkspace } from "../workspace";
export default function PayoutPage() {
 const params = useParams<{ id: string }>(), search = useSearchParams();
 return <QuotationGuard canAccess={a => a.permissions.canViewFinancePayments}>{() => <PayoutWorkspace key={`${params.id}:${search.get("payee")}`} id={params.id} payeeId={search.get("payee") || ""} />}</QuotationGuard>;
}
