"use client";
import { useEffect, useState } from "react";
import DetailModal from "../../components/DetailModal";
import { Callout, ReadOnlyGrid } from "../../components/ui/patterns";
import { useI18n } from "../../../lib/i18n/provider";
import { readExpenses } from "../expenses/data";
import { ExpenseActivity } from "../expenses/audit-view";
import { expensePaymentState, type ExpenseData, type ExpenseObligation } from "../expenses/shared";
import { ExpenseBadge } from "../expenses/workspace";

export function ExpensePayableDetail({ obligation, isAdmin, onClose }: { obligation: ExpenseObligation; isAdmin: boolean; onClose: () => void }) {
 const { t, locale, date } = useI18n();
 const [source, setSource] = useState<ExpenseData | null>(null), [failed, setFailed] = useState(false);
 useEffect(() => {
  let active = true;
  void readExpenses(obligation.expense_id, obligation.source_type === "employee_reimbursement").then(data => {
   if (data.record?.id !== obligation.expense_id) throw new Error("source mismatch");
   if (active) setSource(data);
  }).catch(() => { if (active) setFailed(true); });
  return () => { active = false; };
 }, [obligation.expense_id, obligation.source_type]);
 const row = source?.record, tax = row?.tax_review;
 const money = (value: number | null | undefined) => value == null ? t("expenses.pending") : `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${obligation.currency}`;
 return <DetailModal open title={t("expenses.payableDetails")} size="edit" onClose={onClose}>
  <ReadOnlyGrid items={[
   { key: "payee", label: t("expenses.payee"), value: obligation.payee_name },
   { key: "origin", label: t("expenses.origin"), value: t(`expenses.${obligation.source_type}`) },
   { key: "reference", label: t("expenses.reference"), value: obligation.reference },
   { key: "description", label: t("expenses.description"), value: obligation.description },
   { key: "amount", label: t("expenses.settlementAmount"), value: money(obligation.gross_amount) },
   { key: "status", label: t("expenses.status"), value: <ExpenseBadge state={row ? expensePaymentState(row) : obligation.status === "open" ? "unpaid" : obligation.status === "settled" ? "paid" : "waived"} /> },
   ...(obligation.due_on ? [{ key: "due", label: t("expenses.dueOptional"), value: date(obligation.due_on) }] : []),
   { key: "ready", label: t("expenses.readyToPay"), value: date(obligation.created_at, true) },
  ]} />
  {failed ? <Callout tone="warning">{t("expenses.sourceReadFailed")}</Callout> : !source ? <p role="status">{t("expenses.loading")}</p> : <>
   <h3>{t("expenses.taxReview")}</h3><ReadOnlyGrid items={[
    { key: "vat", label: t("expenses.vat"), value: `${t(`expenses.${tax?.vat_state || "pending"}`)} · ${money(tax?.vat_state === "none" ? 0 : tax?.vat_amount)}` },
    { key: "wht", label: t("expenses.wht"), value: `${t(`expenses.${tax?.wht_state || "pending"}`)} · ${money(tax?.wht_state === "none" ? 0 : tax?.wht_amount)}` },
   ]} />
   {row ? <ExpenseActivity row={row} isAdmin={isAdmin && source.access.is_admin} /> : null}
  </>}
 </DetailModal>;
}
