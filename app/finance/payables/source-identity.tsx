"use client";
import { Building2, CircleUserRound, UserRound } from "lucide-react";
import { useI18n } from "../../../lib/i18n/provider";
import styles from "./payables.module.css";

export type PayableSourceFamily = "revenue_distribution" | "employee_reimbursement" | "supplier_payable";

export function RecipientAvatar({ kind }: { kind: "person" | "supplier" | "payee" }) {
 const Icon = kind === "person" ? UserRound : kind === "supplier" ? Building2 : CircleUserRound;
 return <span className={styles.avatar} data-recipient-kind={kind} aria-hidden="true"><Icon size={23} strokeWidth={1.7} /></span>;
}

export function PayableSourceBadge({ source }: { source: PayableSourceFamily }) {
 const { t } = useI18n();
 return <span className={styles.sourceBadge} data-payable-source={source}>{t(`expenses.${source}`)}</span>;
}

export function PayableSourceHeading({ source }: { source: PayableSourceFamily }) {
 const { t } = useI18n();
 const help = source === "revenue_distribution" ? "revenuePayablesHelp" : source === "employee_reimbursement" ? "reimbursementPayablesHelp" : "supplierPayablesHelp";
 return <header className={styles.sourceHeading} data-source-family={source}><h2>{t(`expenses.${source}`)}</h2><p>{t(`expenses.${help}`)}</p></header>;
}
