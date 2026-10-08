"use client";
import type { ReactNode } from "react";
import DetailModal from "../../components/DetailModal";
import styles from "./case-detail.module.css";

export default function CaseEditModal({ title, children, onClose, busy = false, className = '' }: { title: ReactNode; children: ReactNode; onClose: () => void; busy?: boolean; className?: string }) {
  return <DetailModal open title={title} onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy} size="edit" className={`${styles.editor} ${className}`}>
    <div aria-busy={busy}>{children}</div>
  </DetailModal>;
}
