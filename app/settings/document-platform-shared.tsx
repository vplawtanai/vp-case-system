"use client";
import { useI18n } from "../../lib/i18n/provider";
import { translate } from "../../lib/i18n/catalog";
import { uiDate, type UiLocale, type UiMessage } from "../../lib/i18n/core";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthGuard from "../components/AuthGuard";
import AppTopNav from "../components/AppTopNav";
import { buildPermissions, normalizeRole } from "../../lib/permissions";
import { supabase } from "../../lib/supabase";
import styles from "./document-platform.module.css";

export type DocumentPlatformAccess = {
  loading: boolean;
  allowed: boolean;
  role: string;
};

export function canApproveDocumentPlatform(role?: string | null) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "admin" || normalizedRole === "partner";
}

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
  const { t } = useI18n();
  const pathname = usePathname();
  const links = [
    { href: "/settings/document-settings", label: t("settings.documents.nav.settings") },
    { href: "/settings/document-templates", label: t("settings.documents.nav.templates") },
    { href: "/settings/document-clauses", label: t("settings.documents.nav.clauses") },
  ];

  return (
    <nav className={styles.subnav} aria-label={t("settings.documents.nav.label")}>
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
  const { t } = useI18n();
  if (access.loading) {
    return <div className={styles.accessState}>{t("settings.documents.access.loading")}</div>;
  }

  if (!access.allowed) {
    return (
      <div className={styles.accessState}>
        <strong>{t("settings.documents.access.denied")}</strong>
        <div className={styles.helperText}>
          {t("settings.documents.access.help")}
        </div>
      </div>
    );
  }

  return null;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const { locale } = useI18n();
  const normalized = String(status || "").toLowerCase();
  const label = statusLabel(normalized, locale);
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
  const { locale } = useI18n();
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
      {riskLabel(normalized, locale)}
    </span>
  );
}

export function statusLabel(status: string, locale: UiLocale = "th") {
  return ["draft", "under_review", "published", "retired", "active", "inactive"].includes(status)
    ? translate(locale, `settings.documents.status.${status}`) : status || "-";
}

export function riskLabel(risk: string, locale: UiLocale = "th") {
  const key = ["critical", "high", "medium", "low"].includes(risk) ? risk : "informational";
  return translate(locale, `settings.documents.risk.${key}`);
}

export function languageLabel(language: string | null | undefined, locale: UiLocale = "th") {
  return language === "th" || language === "en" ? translate(locale, `settings.documents.language.${language}`) : language || "-";
}

export function documentTypeLabel(type: string | null | undefined, locale: UiLocale = "th") {
  return type === "fee_agreement" || type === "quotation" ? translate(locale, `settings.documents.document.${type}`) : type || "-";
}

export function formatDateTime(value: string | null | undefined, locale: UiLocale = "th") {
  return uiDate(value, locale, true);
}

export function friendlyError<T extends UiMessage | string>(error: unknown, fallback: T): T {
  if (error && typeof error === "object" && "message" in error) {
    console.error(fallback, error);
  }
  return fallback;
}
