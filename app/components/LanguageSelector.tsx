"use client";

import { useI18n } from "../../lib/i18n/provider";
import styles from "./LanguageSelector.module.css";

export default function LanguageSelector() {
  const { locale, englishSupported, setLocale, t } = useI18n();
  return <div className={styles.control} role="group" aria-label={t("common.language.label")}>
    <button type="button" lang="th" aria-pressed={locale === "th"} onClick={() => setLocale("th")}>ไทย</button>
    <button type="button" lang="en" aria-pressed={locale === "en"} disabled={!englishSupported}
      title={!englishSupported ? t("common.language.notCovered") : "English"} onClick={() => setLocale("en")}>EN</button>
  </div>;
}
