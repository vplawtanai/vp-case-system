"use client";

import { useState, type ComponentProps } from "react";
import DetailModal from "../../components/DetailModal";
import { Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { ExpenseFactsForm } from "./forms";
import css from "./expenses.module.css";

type Props = Omit<ComponentProps<typeof ExpenseFactsForm>, "row" | "onDirty" | "actionContainer"> & {
 onClose: () => void;
 onSaved: (id: string) => void;
 error: string;
};

// A fresh form session per open, shared by Company Expenses and Employee Claims.
export function ExpenseCreateModal({ onClose, error, ...form }: Props) {
 const { t } = useI18n();
 const [dirty, setDirty] = useState(false), [confirmClose, setConfirmClose] = useState(false);
 const [actionContainer, setActionContainer] = useState<HTMLDivElement | null>(null);
 const requestClose = () => {
  if (form.busy) return;
  if (dirty) setConfirmClose(true);
  else onClose();
 };
 return <>
  <DetailModal open size="workflow" title={t(form.claim ? "expenses.newClaim" : "expenses.new")} subtitle={t(form.claim ? "expenses.claimHelp" : "expenses.subtitle")}
   onClose={requestClose} closeOnBackdrop={false} closeLabel={t("common.actions.close")}
   footer={<div className={css.createFooter}><button type="button" className={ui.secondary} disabled={form.busy} onClick={requestClose}>{t("common.actions.close")}</button><div ref={setActionContainer} /></div>}>
   <div className={css.page}>
    {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}
    {form.busy ? <p className={css.muted} role="status">{t("expenses.working")}</p> : null}
    <ExpenseFactsForm {...form} onDirty={setDirty} actionContainer={actionContainer} />
   </div>
  </DetailModal>
  {confirmClose ? <DetailModal open size="edit" title={t("common.state.unsaved")} onClose={() => setConfirmClose(false)} closeOnBackdrop={false}
   footer={<div className={css.createFooter}><button type="button" className={ui.secondary} onClick={() => setConfirmClose(false)}>{t("expenses.keepEditing")}</button><button type="button" className={ui.secondary} onClick={onClose}>{t("expenses.discardCreate")}</button></div>}>
   <p>{t("expenses.discardCreateHelp")}</p>
  </DetailModal> : null}
 </>;
}
