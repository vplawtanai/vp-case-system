"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DetailModal from "../ui/FinanceModal";
import { Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import { readExpenses } from "../expenses/data";
import { ExpenseTaxForm, type ExpenseRun } from "../expenses/forms";
import { CompanyTaxForm } from "../expenses/company-tax";
import { expenseCategoryLabel } from "../expenses/categories";
import { expenseError, expenseHref, type ExpenseData } from "../expenses/shared";
import expenseCss from "../expenses/expenses.module.css";
import type { InputEvidence } from "./period-data";

const ignorePlan = () => {};

// Reuses the source expense's revision/permission contract, never external evidence or payments.
export function ExpenseInputReview({ source, onClose, onSaved }: { source: InputEvidence["expenses"][number]; onClose: () => void; onSaved: () => void }) {
 const { t, locale, date } = useI18n();
 const [data, setData] = useState<ExpenseData | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
 const lock = useRef(false);
 useEffect(() => {
  let active = true; setData(null); setError("");
  readExpenses(source.id, source.origin === "employee_claim").then(next => {
   if (next.record?.id !== source.id) throw new Error("Missing source expense");
   if (active) setData(next);
  }).catch(e => { if (active) setError(expenseError(e)); });
  return () => { active = false; };
 }, [source.id, source.origin, reload]);
 const run: ExpenseRun = async (name, args) => {
  if (lock.current || name !== "review_finance_expense_tax" || !data?.access.can_tax_review) return null;
  lock.current = true; setBusy(true); setError("");
  try {
   const result = await supabase.rpc(name, args);
   if (result.error) throw result.error;
   onSaved(); return result.data;
  } catch (e) { setError(expenseError(e)); return null; }
  finally { lock.current = false; setBusy(false); }
 };
 const row = data?.record;
 return <DetailModal variant="review" open title={t(source.status === "pending" ? "taxHome.reviewInput" : "taxHome.correctInput")} size="edit" closeOnBackdrop={false} onClose={() => { if (!lock.current) onClose(); }}>
  <div className={`${expenseCss.page} ${expenseCss.form}`}>
   <Callout tone="info">{t("taxHome.inputReviewHelp")}</Callout>
   {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)} <button className={ui.secondary} type="button" disabled={busy} onClick={() => setReload(n => n + 1)}>{t("expenses.refresh")}</button></Callout> : null}
   {!data && !error ? <p role="status">{t("expenses.loading")}</p> : null}
   {row ? <>
    <dl className={expenseCss.facts}>
     {[[t("expenses.origin"),t(`expenses.${row.origin}`)],[t("expenses.date"),date(row.expense_date)],[t("expenses.vendor"),row.vendor_name || "—"],[t("expenses.category"),expenseCategoryLabel(row.category,locale)],[t("expenses.amount"),`${row.gross_amount.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})} THB`],[t("expenses.claimant"),row.claimant_name],[t("expenses.description"),row.description]].filter(([,value]) => value).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <Link href={expenseHref(row)}>{t("taxHome.expenseSource")}</Link>
    {data.access.can_tax_review && row.status === "accepted" ? row.tax_review?.request_json?.schema_version === 2 ?
     <CompanyTaxForm key={`${row.id}:${row.tax_review.id}:${reload}`} row={row} inputVatOnly reason="" planning={false} onPlan={ignorePlan} onCalculation={ignorePlan} busy={busy} run={run}/> :
     <ExpenseTaxForm key={`${row.id}:${row.tax_review?.id}:${reload}`} row={row} inputVatOnly busy={busy} run={run}/> : <Callout tone="warning">{t("expenses.denied")}</Callout>}
   </> : null}
  </div>
 </DetailModal>;
}
