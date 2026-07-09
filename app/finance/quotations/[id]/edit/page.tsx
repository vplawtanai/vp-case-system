"use client";

import { useParams } from "next/navigation";
import { QuotationForm, QuotationGuard } from "../../shared";

export default function EditQuotationPage() {
  const params = useParams();
  const quotationId = Array.isArray(params.id) ? params.id[0] : params.id || "";

  return (
    <QuotationGuard>
      {(access) => <QuotationForm access={access} quotationId={quotationId} />}
    </QuotationGuard>
  );
}
