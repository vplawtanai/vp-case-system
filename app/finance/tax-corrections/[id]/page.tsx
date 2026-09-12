"use client";
import { useParams } from "next/navigation";
import { TaxInvoiceGuard } from "../../tax-invoices/access";
import { TaxCorrectionWorkspace } from "../workspace";
export default function TaxCorrectionPage() {
  const { id } = useParams<{ id: string }>();
  return <TaxInvoiceGuard>{permissions => <TaxCorrectionWorkspace key={id} id={id} permissions={permissions} />}</TaxInvoiceGuard>;
}
