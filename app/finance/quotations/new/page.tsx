"use client";

import { QuotationForm, QuotationGuard } from "../shared";

export default function NewQuotationPage() {
  return (
    <QuotationGuard>
      {(access) => <QuotationForm access={access} />}
    </QuotationGuard>
  );
}
