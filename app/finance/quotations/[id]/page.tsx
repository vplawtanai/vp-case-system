"use client";

import { useParams } from "next/navigation";
import { QuotationDetail, QuotationGuard } from "../shared";

export default function QuotationDetailPage() {
  const params = useParams();
  const quotationId = Array.isArray(params.id) ? params.id[0] : params.id || "";

  return (
    <QuotationGuard>
      {(access) => <QuotationDetail access={access} quotationId={quotationId} />}
    </QuotationGuard>
  );
}
