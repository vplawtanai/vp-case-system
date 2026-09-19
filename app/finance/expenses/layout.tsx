"use client";
import type { ReactNode } from "react";
import { QuotationGuard } from "../quotations/shared";

export default function ExpenseLayout({ children }: { children: ReactNode }) {
 // Account custodians need the normal authenticated shell without broad Finance grants.
 // The scoped Expense RPCs independently enforce active-user/record/account permissions.
 return <QuotationGuard canAccess={() => true}>{() => children}</QuotationGuard>;
}
