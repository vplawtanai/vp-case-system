"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { translate, resolveUiMessage } from "./catalog";
import { effectiveUiLocale, englishCoverage, localeCookie, parseUiLocale, uiDate, uiModule, UI_LOCALE_STORAGE, type MessageParameters, type ModuleCoverage, type UiLocale, type UiMessage } from "./core";

type UiLanguageContext = {
  locale: UiLocale;
  preferredLocale: UiLocale;
  englishSupported: boolean;
  setLocale: (locale: UiLocale) => void;
  t: (key: string, parameters?: MessageParameters) => string;
  text: (message: UiMessage | string | null | undefined) => string;
  date: (value: string | null | undefined, withTime?: boolean) => string;
};

const defaultContext: UiLanguageContext = {
  locale: "th", preferredLocale: "th", englishSupported: false, setLocale: () => undefined,
  t: (key, parameters) => translate("th", key, parameters),
  text: message => resolveUiMessage("th", message),
  date: (value, withTime) => uiDate(value, "th", withTime),
};
const UiLanguage = createContext(defaultContext);

export function UiLocaleProvider({ initialLocale, pathname, children, coverage = englishCoverage }: { initialLocale: UiLocale; pathname: string; children: ReactNode; coverage?: ModuleCoverage }) {
  const [preferredLocale, setPreferredLocale] = useState(initialLocale);
  const locale = effectiveUiLocale(preferredLocale, pathname, coverage);
  const setLocale = useCallback((next: UiLocale) => {
    if (!parseUiLocale(next)) return;
    setPreferredLocale(next);
    document.cookie = localeCookie(next, window.location.protocol === "https:");
    try { localStorage.setItem(UI_LOCALE_STORAGE, next); } catch { /* Cookie persistence remains available. */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const next = parseUiLocale(event.newValue);
      if (event.key === UI_LOCALE_STORAGE && next) setLocale(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setLocale]);

  const value = useMemo<UiLanguageContext>(() => ({
    locale, preferredLocale, englishSupported: coverage[uiModule(pathname)], setLocale,
    t: (key, parameters) => translate(locale, key, parameters),
    text: message => resolveUiMessage(locale, message),
    date: (value, withTime) => uiDate(value, locale, withTime),
  }), [locale, preferredLocale, pathname, coverage, setLocale]);
  return <UiLanguage.Provider value={value}>{children}</UiLanguage.Provider>;
}

export function AppLocaleProvider({ initialLocale, children }: { initialLocale: UiLocale; children: ReactNode }) {
  const pathname = usePathname();
  return <UiLocaleProvider initialLocale={initialLocale} pathname={pathname}>{children}</UiLocaleProvider>;
}

export function useI18n() { return useContext(UiLanguage); }

// Localize existing alert-based workflows without making data-loading effects
// depend on locale or resetting an unsaved form when the language changes.
export function useUiAlert() {
  const { locale } = useI18n();
  const currentLocale = useRef(locale);
  useEffect(() => { currentLocale.current = locale; }, [locale]);
  return useCallback((message: UiMessage | string) => {
    window.alert(resolveUiMessage(currentLocale.current, message));
  }, []);
}
