"use client";

import { useEffect, useState, type ReactNode } from "react";
import DetailModal from "../components/DetailModal";
import LanguageSelector from "../components/LanguageSelector";
import { BilingualUiScope, useI18n } from "../../lib/i18n/provider";
import styles from "./client-form.module.css";

type Props = {
  titleKey: string; clientName: string; dirty: boolean; busy: boolean;
  onClose: () => void; children: (requestLeave: (action: () => void) => void) => ReactNode;
};

export default function ClientModal(props: Props) {
  return <BilingualUiScope><ClientModalContent {...props} /></BilingualUiScope>;
}

function ClientModalContent({ titleKey, clientName, dirty, busy, onClose, children }: Props) {
  const { t, locale } = useI18n();
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  function requestLeave(action: () => void) {
    if (busy) return;
    if (dirty) setLeaveAction(() => action);
    else action();
  }
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  return <>
    <DetailModal open title={t(titleKey)} subtitle={clientName} onClose={() => requestLeave(onClose)}>
      <div lang={locale} aria-busy={busy} className={styles.content}>
        <div className={styles.language}><LanguageSelector /></div>
        {children(requestLeave)}
      </div>
    </DetailModal>
    <DetailModal open={!!leaveAction} title={t("client.edit.discardTitle")} onClose={() => setLeaveAction(null)}>
      <p>{t("client.edit.discardDescription")}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => setLeaveAction(null)}>{t("client.edit.keepEditing")}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { if (!busy) { setLeaveAction(null); leaveAction?.(); } }}>{t("client.edit.discard")}</button>
      </div>
    </DetailModal>
  </>;
}
