"use client";

import { QuotationGuard, QuotationList } from "./shared";

export default function FinanceQuotationsPage() {
  return (
    <QuotationGuard>
      {(access) => <QuotationList access={access} />}
    </QuotationGuard>
  );
}
