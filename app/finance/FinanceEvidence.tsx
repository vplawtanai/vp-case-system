"use client";
import type { ReactNode } from "react";
import { Disclosure } from "../components/ui/patterns";
import { useI18n } from "../../lib/i18n/provider";

// Presentation boundary only. Never broadens server/RLS access to the payload.
export function FinanceEvidence({ title, children, raw, isAdmin = false }: { title: ReactNode; children: ReactNode; raw: unknown; isAdmin?: boolean }) {
 const { t } = useI18n();
 return <Disclosure title={title}>{children}{isAdmin ? <Disclosure title={t("taxFiling.rawJson")}><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(raw, null, 2)}</pre></Disclosure> : null}</Disclosure>;
}
