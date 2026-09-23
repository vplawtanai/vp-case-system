"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../lib/i18n/provider";
import type { Expense } from "./shared";
import { expenseCategoryLabel } from "./categories";
import { expenseStatusTone } from "./presentation";
import { itemDecided, nextUndecided, reviewItemLabel, reviewProgress } from "./review-progress";
import badges from "./expenses.module.css";
import css from "./item-navigator.module.css";

export function useReviewSelection(items: Expense[], busy: boolean, error: string) {
 const initial = items.find(i => i.status === "submitted") || items[0];
 const [selection, setSelection] = useState(() => ({ id: initial?.id, pending: initial?.status === "submitted" }));
 const selected = items.find(i => i.id === selection.id) || items[0];
 // Advance only from an undecided selection after authoritative read-back, never on failure.
 if (!busy && !error && selected?.status === "submitted" && !selection.pending) {
  setSelection({ id: selected.id, pending: true });
 }
 if (!busy && !error && selected && selection.pending && itemDecided(selected)) {
  const next = items.find(i => i.id === nextUndecided(items, selected.id)) || selected;
  setSelection({ id: next.id, pending: next.status === "submitted" });
 }
 return { selected, select: (item: Expense) => setSelection({ id: item.id, pending: item.status === "submitted" }) };
}
export function RequestItemProgress({ items, claim = false }: { items: Expense[]; claim?: boolean }) {
 const { t } = useI18n(), p = reviewProgress(items);
 const counts = [[claim ? "reviewClaimApproved" : "reviewApproved", p.approved], ["requestRejected", p.rejected], ["claimPending", p.pending], ["draft", p.draft]] as const;
 return <div className={css.progress} data-review-progress>
  <span>{t(p.total > 0 && p.reviewed === p.total ? "expenses.reviewAllDone" : "expenses.reviewCount", { count: p.reviewed, total: p.total })}</span>
  <span>{counts.filter(([, count]) => count > 0).map(([key, count]) => `${t(`expenses.${key}`)} ${count}`).join(" · ")}</span>
  {p.paid + p.unpaid > 0 ? <span data-payment-progress>{[[claim ? "claimRefunded" : "paid", p.paid], [claim ? "claimAwaitingRefund" : "unpaid", p.unpaid]].filter(([, count]) => Number(count) > 0).map(([key, count]) => `${t(`expenses.${key}`)} ${count}`).join(" · ")}</span> : null}
 </div>;
}

export function ItemNavigator({ items, selected, claim = false, busy, onSelect }: { items: Expense[]; selected?: string; claim?: boolean; busy: boolean; onSelect: (item: Expense) => void }) {
 const { t, locale } = useI18n(), panel = useRef<HTMLDivElement>(null), previous = useRef(selected);
 useEffect(() => { if (previous.current !== selected) panel.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus({ preventScroll: true }); previous.current = selected; }, [selected]);
 return <nav className={css.navigator} aria-label={t("expenses.reviewItemsTitle", { count: items.length })} data-item-navigator>
  <strong>{t("expenses.reviewItemsTitle", { count: items.length })}</strong>
  <div role="status"><RequestItemProgress items={items} claim={claim}/></div>
  <div className={css.items} ref={panel}>{items.map((item, index) => {
   const current = selected === item.id, state = current && item.status === "submitted" ? "reviewCurrent" : reviewItemLabel(item, claim);
   return <button type="button" key={item.id} data-review-item={item.id} aria-current={current ? "true" : undefined} disabled={busy} onClick={() => onSelect(item)}>
    <span aria-hidden="true">{item.status === "rejected" ? "✕" : itemDecided(item) ? "✓" : current ? "●" : "○"}</span>
    <span className={css.title}>{index + 1}. {item.description || expenseCategoryLabel(item.category, locale)}</span>
    <span className={badges.badge} data-tone={state === "reviewCurrent" ? "warn" : expenseStatusTone(state === "requestRejected" ? "rejected" : state === "reviewCompanyApproved" || state === "reviewClaimApproved" ? "accepted" : state)}>{t(`expenses.${state}`)}</span>
   </button>;
  })}</div>
 </nav>;
}
