/* eslint-disable @next/next/no-img-element -- Document logos use short-lived private Storage URLs. */

import { formatThaiSellerAddress, type DocumentIdentity } from "../../lib/documentIdentity";
import styles from "./DocumentIdentity.module.css";

export function DocumentIdentityHeader({
  identity,
  logoUrl,
  title,
  subtitle,
  documentNo,
  languageCode = "th",
  className = "",
}: {
  identity: DocumentIdentity;
  logoUrl: string;
  title: string;
  subtitle: string;
  documentNo: string;
  languageCode?: string;
  className?: string;
}) {
  const isThaiDocument = languageCode.toLowerCase().startsWith("th");
  const address = isThaiDocument
    ? identity.addressTh || identity.addressEn
    : identity.addressEn || identity.addressTh;
  const addressLines = address === identity.addressTh
    ? formatThaiSellerAddress(address)
    : { body: address, localityLine: "" };
  const branch = isThaiDocument
    ? identity.branchTh || identity.branchEn
    : identity.branchEn || identity.branchTh;
  const contact = [identity.phone, identity.email, identity.website].filter(Boolean).join(" · ");
  return (
    <header className={`${styles.header} ${className}`.trim()}>
      <div className={styles.provider}>
        {logoUrl ? (
          <img className={styles.logo} src={logoUrl} alt={identity.companyNameTh || identity.companyNameEn || "Document logo"} />
        ) : null}
        <div className={styles.providerText}>
          <div className={styles.primaryIdentity}>
            <strong>{identity.companyNameTh || "ยังไม่ได้ตั้งค่าชื่อสำนักงาน"}</strong>
            {identity.companyNameEn ? <span className={styles.englishName}>{identity.companyNameEn}</span> : null}
            {identity.description ? <span className={styles.description}>{identity.description}</span> : null}
          </div>
          <div className={styles.providerMetadata}>
            <span className={styles.address}>
              {addressLines.body || (!addressLines.localityLine ? "ยังไม่ได้ตั้งค่าที่อยู่สำนักงาน" : null)}
              {addressLines.localityLine ? <span className={styles.addressLocality}>{addressLines.localityLine}</span> : null}
            </span>
            <span className={styles.technicalMetadata}>
              เลขประจำตัวผู้เสียภาษี: {identity.taxId || "ยังไม่ได้ตั้งค่า"}
              {branch ? ` · ${branch}` : ""}
            </span>
            {contact ? <span className={styles.technicalMetadata}>{contact}</span> : null}
          </div>
        </div>
      </div>
      <div className={styles.documentIdentity}>
        <h1>{title}</h1>
        {subtitle ? <span>{subtitle}</span> : null}
        <strong>{documentNo}</strong>
      </div>
    </header>
  );
}

export function DocumentIdentityFooter({ identity }: { identity: DocumentIdentity }) {
  const name = identity.companyNameTh || identity.companyNameEn || "ยังไม่ได้ตั้งค่าชื่อสำนักงาน";
  const contact = [identity.phone, identity.email, identity.website].filter(Boolean).join(" · ");
  return (
    <footer className={styles.footer}>
      <strong>{name}</strong>
      <span>{contact || "ยังไม่ได้ตั้งค่าข้อมูลติดต่อใน Document Settings"}</span>
    </footer>
  );
}
