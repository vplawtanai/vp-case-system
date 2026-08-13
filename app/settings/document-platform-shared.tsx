"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthGuard from "../components/AuthGuard";
import AppTopNav from "../components/AppTopNav";
import { buildPermissions } from "../../lib/permissions";
import { supabase } from "../../lib/supabase";
import styles from "./document-platform.module.css";

export type DocumentPlatformAccess = {
  loading: boolean;
  allowed: boolean;
  role: string;
};

export function useDocumentPlatformAccess(): DocumentPlatformAccess {
  const [access, setAccess] = useState<DocumentPlatformAccess>({
    loading: true,
    allowed: false,
    role: "",
  });

  const loadAccess = useCallback(async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setAccess({ loading: false, allowed: false, role: "" });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    const permissions = buildPermissions(profile || {});
    const allowed = !profileError
      && (permissions.role === "admin" || permissions.role === "partner");

    setAccess({
      loading: false,
      allowed,
      role: permissions.role,
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccess();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccess]);

  return access;
}

export function DocumentPlatformPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <AuthGuard>
      <AppTopNav title={title} subtitle={subtitle} activePage="settings" />
      <main className={styles.page}>
        <DocumentPlatformSubnav />
        {children}
      </main>
    </AuthGuard>
  );
}

export function DocumentPlatformSubnav() {
  const pathname = usePathname();
  const links = [
    { href: "/settings/document-settings", label: "ตั้งค่าเอกสาร" },
    { href: "/settings/document-templates", label: "แม่แบบเอกสาร" },
    { href: "/settings/document-clauses", label: "คลังข้อสัญญา" },
  ];

  return (
    <nav className={styles.subnav} aria-label="การตั้งค่าเอกสาร">
      {links.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.subnavLink} ${active ? styles.subnavLinkActive : ""}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccessState({ access }: { access: DocumentPlatformAccess }) {
  if (access.loading) {
    return <div className={styles.accessState}>กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!access.allowed) {
    return (
      <div className={styles.accessState}>
        <strong>ไม่มีสิทธิ์เข้าถึง</strong>
        <div className={styles.helperText}>
          เฉพาะ Admin และ Partner เท่านั้นที่จัดการแม่แบบเอกสารและคลังข้อสัญญาได้
        </div>
      </div>
    );
  }

  return null;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = String(status || "").toLowerCase();
  const label = statusLabel(normalized);
  const className = normalized === "draft"
    ? styles.badgeDraft
    : normalized === "under_review"
      ? styles.badgeReview
      : normalized === "published" || normalized === "active"
        ? styles.badgePublished
        : normalized === "retired" || normalized === "inactive"
          ? styles.badgeRetired
          : "";

  return <span className={`${styles.badge} ${className}`}>{label}</span>;
}

export function RiskBadge({ risk }: { risk: string | null | undefined }) {
  const normalized = String(risk || "informational").toLowerCase();
  const className = normalized === "critical"
    ? styles.badgeCritical
    : normalized === "high"
      ? styles.badgeHigh
      : normalized === "medium"
        ? styles.badgeMedium
        : normalized === "low"
          ? styles.badgeLow
          : styles.badgeInformational;

  return (
    <span className={`${styles.badge} ${className}`}>
      {riskLabel(normalized)}
    </span>
  );
}

export function statusLabel(status: string) {
  if (status === "draft") return "ร่าง";
  if (status === "under_review") return "ส่งตรวจ";
  if (status === "published") return "เผยแพร่แล้ว";
  if (status === "retired") return "ยกเลิกการใช้งาน";
  if (status === "active") return "ใช้งาน";
  if (status === "inactive") return "ยังไม่ใช้งาน";
  return status || "-";
}

export function riskLabel(risk: string) {
  if (risk === "critical") return "สำคัญมาก";
  if (risk === "high") return "สูง";
  if (risk === "medium") return "ปานกลาง";
  if (risk === "low") return "ต่ำ";
  return "ข้อมูลทั่วไป";
}

export function languageLabel(language: string | null | undefined) {
  if (language === "th") return "ไทย";
  if (language === "en") return "อังกฤษ";
  return language || "-";
}

export function documentTypeLabel(type: string | null | undefined) {
  if (type === "fee_agreement") return "สัญญาค่าบริการ";
  if (type === "quotation") return "ใบเสนอราคา";
  return type || "-";
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function friendlyError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    console.error(fallback, error);
  }
  return fallback;
}
