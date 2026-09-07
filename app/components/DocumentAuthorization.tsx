import styles from "./DocumentAuthorization.module.css";

// A manual signing space is not evidence that the system issuer signed the document.
// Invoice/Receipt snapshots do not yet freeze an authorized signer or signature asset.
export function DocumentAuthorization({ documentKind, languageCode = "th" }: {
  documentKind: "invoice" | "receipt";
  languageCode?: string | null;
}) {
  const english = languageCode === "en";
  const capacity = documentKind === "receipt"
    ? (english ? "Received by / Authorized signatory" : "ผู้รับเงิน / ผู้มีอำนาจลงนาม")
    : (english ? "Prepared by / Authorized signatory" : "ผู้จัดทำ / ผู้มีอำนาจลงนาม");

  return <section className={styles.authorization} aria-label={capacity} data-document-authorization={documentKind}>
    <div className={styles.handwritingSpace} aria-hidden="true" />
    <div className={styles.signingLine}><span>{english ? "Signed" : "ลงชื่อ"}</span><span className={styles.line} aria-hidden="true" /></div>
    <div className={styles.name}>{english ? "(Signatory name)" : "(ชื่อผู้ลงนาม)"}</div>
    <div className={styles.capacity}>{capacity}</div>
  </section>;
}
