"use client";

import type { ReactNode } from "react";
import styles from "./LegalDocumentLayout.module.css";

export function LegalDocumentLayout({
  children,
  className = "",
  languageCode,
}: {
  children: ReactNode;
  className?: string;
  languageCode?: string;
}) {
  return (
    <div className={`${styles.printRoot} legal-document-print-root`}>
      <div className={styles.previewViewport}>
        <article className={`${styles.paper} ${className}`.trim()} lang={languageCode}>
          {children}
        </article>
      </div>
      <style jsx global>{`
        @media print {
          html,
          body {
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .legal-document-print-root,
          .legal-document-print-root * {
            visibility: visible !important;
          }

          .legal-document-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
