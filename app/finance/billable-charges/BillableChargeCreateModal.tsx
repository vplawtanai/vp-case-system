"use client";

import { useRef, useState, type ComponentProps } from "react";
import DetailModal from "../../components/DetailModal";
import LanguageSelector from "../../components/LanguageSelector";
import { useI18n } from "../../../lib/i18n/provider";
import BillableChargeCreateWorkflow, { type BillableChargeWorkflowHandle } from "./BillableChargeCreateWorkflow";
import styles from "./charge-create-modal.module.css";

type Props = Omit<ComponentProps<typeof BillableChargeCreateWorkflow>, "ref" | "actionContainer"> & {
  onClose: () => void;
  continueToReady?: boolean;
};

// Mount one session per open. Locale changes never replace the existing workflow state.
export default function BillableChargeCreateModal({ onClose, onSaved, onReady, continueToReady = false, ...workflow }: Props) {
  const { t } = useI18n();
  const workflowRef = useRef<BillableChargeWorkflowHandle>(null);
  const [actionContainer, setActionContainer] = useState<HTMLDivElement | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = () => {
    if (workflowRef.current?.isBusy()) return;
    if (workflowRef.current?.isDirty()) setConfirmClose(true);
    else onClose();
  };

  return <>
    <DetailModal open title={t("finance.charge.ui.create")} status={<LanguageSelector />} onClose={requestClose} closeOnBackdrop={false} closeLabel={t("common.actions.close")}
      footer={<div className={styles.footer}><button type="button" className={styles.close} onClick={requestClose}>{t("common.actions.close")}</button><div className={styles.actions} ref={setActionContainer} /></div>}>
      <div className={styles.createBody}>
        <BillableChargeCreateWorkflow {...workflow} ref={workflowRef} actionContainer={actionContainer}
          onSaved={async charge => { await onSaved?.(charge); if (!continueToReady) onClose(); }}
          onReady={async charge => { await onReady?.(charge); onClose(); }} />
      </div>
    </DetailModal>
    {confirmClose ? <DetailModal open title={t("common.state.unsaved")} onClose={() => setConfirmClose(false)} closeOnBackdrop={false}
      footer={<div className={styles.confirmActions}><button className={styles.close} type="button" onClick={() => setConfirmClose(false)}>{t("finance.charge.modal.keepEditing")}</button><button className={styles.discard} type="button" onClick={onClose}>{t("finance.charge.modal.discard")}</button></div>}>
      <p>{t("finance.charge.modal.discardHelp")}</p>
    </DetailModal> : null}
  </>;
}
