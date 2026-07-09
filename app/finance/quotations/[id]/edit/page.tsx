"use client";

import { QuotationForm, QuotationGuard } from "../../shared";

export default function EditQuotationPage({ params }: { params: { id: string } }) {
  return (
    <QuotationGuard>
      {(access) => <QuotationForm access={access} quotationId={params.id} />}
    </QuotationGuard>
  );
}
