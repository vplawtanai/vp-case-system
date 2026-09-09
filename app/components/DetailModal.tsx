"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./DetailModal.module.css";
import { useI18n } from "../../lib/i18n/provider";

type DetailModalProps = {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  prominentValue?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const subscribeToClient = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const modalStack: HTMLElement[] = [];
let originalBodyStyle = { overflow: "", paddingRight: "" };
let originalFocus: HTMLElement | null = null;

export default function DetailModal({
  open,
  title,
  subtitle,
  status,
  prominentValue,
  children,
  footer,
  onClose,
  closeLabel,
  closeOnBackdrop = true,
}: DetailModalProps) {
  const { t } = useI18n();
  const resolvedCloseLabel = closeLabel || t("common.actions.closeDetails");
  const mounted = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!mounted || !open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (!panel) return;
    if (!modalStack.length) {
      originalFocus = previousFocusRef.current;
      originalBodyStyle = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight };
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    modalStack.push(panel);

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      // Nested VAT/confirmation dialogs own keyboard navigation until they close.
      if (modalStack.at(-1) !== panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      const wasTop = modalStack.at(-1) === panel;
      const index = modalStack.indexOf(panel);
      if (index >= 0) modalStack.splice(index, 1);
      if (!modalStack.length) {
        document.body.style.overflow = originalBodyStyle.overflow;
        document.body.style.paddingRight = originalBodyStyle.paddingRight;
        if (originalFocus?.isConnected) originalFocus.focus({ preventScroll: true });
        originalFocus = null;
      } else if (wasTop && previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, [mounted, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (closeOnBackdrop && event.target === event.currentTarget) onClose();
    }}>
      <div ref={panelRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <div className={styles.titleGroup}>
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
            </div>
            {status || prominentValue ? <div className={styles.summary}>{status}{prominentValue ? <strong>{prominentValue}</strong> : null}</div> : null}
          </div>
          <button ref={closeButtonRef} className={styles.closeButton} type="button" aria-label={resolvedCloseLabel} title={resolvedCloseLabel} onClick={onClose}>×</button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
