"use client";

import type { ReactNode } from "react";
import AppTopNav from "../../components/AppTopNav";
import { useI18n } from "../../../lib/i18n/provider";

export default function PayrollLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return <>
    <AppTopNav title={t("finance.quotation.guard.title")} activePage="finance" />
    {children}
  </>;
}
