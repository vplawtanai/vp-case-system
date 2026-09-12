"use client";
import { useEffect, useRef } from "react";
import { useI18n } from "../../lib/i18n/provider";
import ClientFormFields, { type ClientFormValues } from "./ClientFormFields";
import styles from "./client-form.module.css";

export default function ClientEditForm({ value, onChange, onSave, onCancel, busy, dirty, error }: {
  value: ClientFormValues; onChange: (value: ClientFormValues) => void; onSave: () => void;
  onCancel: () => void; busy: boolean; dirty: boolean; error: string;
}) {
  const { t } = useI18n();
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <form noValidate onSubmit={e => { e.preventDefault(); if (!busy) onSave(); }}>
    {error ? <p ref={errorRef} tabIndex={-1} className={styles.error} role="alert">{t(error)}</p> : null}
    <ClientFormFields value={value} onChange={onChange} localized disabled={busy} />
    <div className={styles.actions}>
      <span className={styles.state} role="status">{t(dirty ? "common.state.unsaved" : "client.edit.unchanged")}</span>
      <button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>{t("common.actions.cancel")}</button>
      <button type="submit" className={styles.primary} disabled={busy || !dirty}>{t(busy ? "client.edit.saving" : "common.actions.saveChanges")}</button>
    </div>
  </form>;
}
