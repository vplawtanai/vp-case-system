"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCaseDetailText } from "../labels";
import css from "../case-detail.module.css";

type HistoricalItem = {
  id: string;
  description?: string | null;
  amount?: number | string | null;
  status?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};
type FeeItem = HistoricalItem & {
  fee_type?: string | null;
  installment_no?: number | null;
  paid_amount?: number | string | null;
  due_date?: string | null;
  paid_date?: string | null;
};
type ExpenseItem = HistoricalItem & {
  expense_type?: string | null;
  expense_date?: string | null;
  paid_by?: string | null;
  reimbursable?: boolean | null;
  reimbursed_amount?: number | string | null;
};
type LegacyRecords = { fees: FeeItem[]; expenses: ExpenseItem[] };

// Historical Case-local records only. No posting, editing, deletion or restoration.
export default function FeesSection({ caseId, onAvailability }: {
  caseId: string;
  onAvailability: (available: boolean) => void;
}) {
  const { tr, date, locale } = useCaseDetailText();
  const [records, setRecords] = useState<LegacyRecords | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const caseIdNumber = Number(caseId);
      if (!caseIdNumber || !Number.isFinite(caseIdNumber)) return;
      const [fees, expenses] = await Promise.all([
        supabase.from("case_fee_items").select("*").eq("case_id", caseIdNumber)
          .order("installment_no", { ascending: true }).order("due_date", { ascending: true }),
        supabase.from("case_expense_items").select("*").eq("case_id", caseIdNumber)
          .order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (fees.error || expenses.error) throw new Error("legacy-read-failed");
      const next = { fees: (fees.data || []) as FeeItem[], expenses: (expenses.data || []) as ExpenseItem[] };
      setRecords(next);
      setFailed(false);
      onAvailability(next.fees.length + next.expenses.length > 0);
    };
    void load().catch(() => {
      if (active) { setFailed(true); onAvailability(true); } // Keep a read failure visible, not an empty-history claim.
    });
    return () => { active = false; };
  }, [caseId, onAvailability]);

  if (failed) return <p role="alert" className={css.notice}>{tr("Could not load legacy records. Please refresh.")}</p>;
  if (!records || records.fees.length + records.expenses.length === 0) return null;

  const money = (value: number | string | null | undefined) => {
    if (value == null || value === "") return "—";
    const parsed = Number(String(value).replaceAll(",", ""));
    return Number.isFinite(parsed) ? `${parsed.toLocaleString(locale === "th" ? "th-TH" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tr("บาท")}` : String(value);
  };
  const fields = (values: [string, string][]) => <dl className={css.legacyFields}>{values.map(([label, value]) => <div key={label}><dt>{tr(label)}</dt><dd>{value || "—"}</dd></div>)}</dl>;
  const evidence = (item: HistoricalItem) => <>
    {item.description && <p className={css.legacyText}>{item.description}</p>}
    {item.note && <p className={css.legacyText}><strong>{tr("Note")}: </strong>{item.note}</p>}
    {fields([["Recorded on", date(item.created_at, true)], ["Last updated", date(item.updated_at, true)]])}
    {item.deleted_at && <p className={css.legacyDeleted}>{tr("Previously deleted")} · {date(item.deleted_at, true)}</p>}
  </>;

  return <div className={css.legacyHistory}>
    <details>
      <summary className={css.legacySummary}>{tr("Legacy fees & expenses")} <span>{tr("VIEW ONLY")}</span></summary>
      <p className={css.legacyText}>{tr("Historical records only. Current financial transactions are managed in Finance.")}</p>
      {records.fees.length > 0 && <section aria-label={tr("Professional Fees")}>
        <h4>{tr("Professional Fees")} · {records.fees.length}</h4>
        {records.fees.map(item => <article key={item.id} className={css.legacyRecord}>
          <h5>{tr("งวดที่")} {item.installment_no || "—"} · {tr(item.fee_type) || "—"}</h5>
          {fields([["Amount", money(item.amount)], ["Paid", money(item.paid_amount)], ["Due Date", date(item.due_date)], ["Paid Date", date(item.paid_date)], ["Status", tr(item.status) || "—"]])}
          {evidence(item)}
        </article>)}
      </section>}
      {records.expenses.length > 0 && <section aria-label={tr("Expenses")}>
        <h4>{tr("Expenses")} · {records.expenses.length}</h4>
        {records.expenses.map(item => <article key={item.id} className={css.legacyRecord}>
          <h5>{tr(item.expense_type) || tr("Expenses")}</h5>
          {fields([["Amount", money(item.amount)], ["Reimbursed", money(item.reimbursed_amount)], ["Date", date(item.expense_date)], ["Paid By", tr(item.paid_by) || "—"], ["Reimbursable", item.reimbursable == null ? "—" : tr(item.reimbursable ? "Yes" : "No")], ["Status", tr(item.status) || "—"]])}
          {evidence(item)}
        </article>)}
      </section>}
    </details>
  </div>;
}
