/* eslint-disable @next/next/no-img-element -- Document logos use short-lived private Storage URLs. */

import type { DocumentIdentity } from "../../lib/documentIdentity";
import styles from "./DocumentIdentity.module.css";

export function DocumentIdentityHeader({
  identity,
  logoUrl,
  title,
  subtitle,
  documentNo,
  className = "",
}: {
  identity: DocumentIdentity;
  logoUrl: string;
  title: string;
  subtitle: string;
  documentNo: string;
  className?: string;
}) {
  const branch = [identity.branchTh, identity.branchEn].filter(Boolean).join(" / ");
  const contact = [identity.phone, identity.email, identity.website].filter(Boolean).join(" · ");
  return (
    <header className={`${styles.header} ${className}`.trim()}>
      <div className={styles.provider}>
        {logoUrl ? (
          <img className={styles.logo} src={logoUrl} alt={identity.companyNameTh || identity.companyNameEn || "Document logo"} />
        ) : (
          <div className={styles.logoMissing}>ยังไม่ได้ตั้งค่าโลโก้</div>
        )}
        <div className={styles.providerText}>
          <strong>{identity.companyNameTh || "ยังไม่ได้ตั้งค่าชื่อสำนักงาน"}</strong>
          {identity.companyNameEn ? <span>{identity.companyNameEn}</span> : null}
          {identity.description ? <span>{identity.description}</span> : null}
          <span>{identity.addressTh || "ยังไม่ได้ตั้งค่าที่อยู่สำนักงาน"}</span>
          {identity.addressEn ? <span>{identity.addressEn}</span> : null}
          <span>เลขประจำตัวผู้เสียภาษี: {identity.taxId || "ยังไม่ได้ตั้งค่า"}</span>
          {branch ? <span>สาขา: {branch}</span> : null}
          {contact ? <span>{contact}</span> : null}
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
