"use client";

import { QuotationDetail, QuotationGuard } from "../shared";

export default function QuotationDetailPage({ params }: { params: { id: string } }) {
  return (
    <QuotationGuard>
      {(access) => <QuotationDetail access={access} quotationId={params.id} />}
    </QuotationGuard>
  );
}
