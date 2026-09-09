export type UiLocale = "th" | "en";
export type MessageParameters = Readonly<Record<string, string | number>>;
export type MessageCatalog = Readonly<Record<string, Readonly<Record<UiLocale, string>>>>;
export type UiMessage = { readonly key: string; readonly parameters?: MessageParameters };
export const UI_LOCALE_COOKIE = "vp_ui_locale";
export const UI_LOCALE_STORAGE = "vp.ui.locale";

export function parseUiLocale(value: unknown): UiLocale | null {
  return value === "th" || value === "en" ? value : null;
}

export function resolvePreferredLocale(saved: unknown, browser: unknown): UiLocale {
  return parseUiLocale(saved) || parseUiLocale(browser) || "th";
}

export function uiMessage(key: string, parameters?: MessageParameters): UiMessage {
  return { key, parameters };
}

export function isUiMessage(value: unknown): value is UiMessage {
  return !!value && typeof value === "object" && "key" in value && typeof value.key === "string"
    && (!('parameters' in value) || value.parameters === undefined || (!!value.parameters
      && typeof value.parameters === "object" && !Array.isArray(value.parameters)
      && Object.values(value.parameters).every(item => typeof item === "string" || typeof item === "number")));
}

export function formatMessage(catalog: MessageCatalog, locale: UiLocale, key: string, parameters: MessageParameters = {}): string {
  const entry = catalog[key];
  if (!entry) throw new Error(`Missing UI translation: ${key}`);
  return entry[parseUiLocale(locale) || "th"].replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.hasOwn(parameters, name) ? String(parameters[name]) : placeholder);
}

// A module opts in only after its complete UI coverage has been validated.
export const englishCoverage = {
  finance: true,
  documentSettings: true,
  other: false,
} as const;

export type ModuleCoverage = Readonly<Record<keyof typeof englishCoverage, boolean>>;

export function uiModule(pathname: string): keyof typeof englishCoverage {
  if (/^\/finance(?:\/|$)/.test(pathname)) return "finance";
  if (/^\/settings\/(?:document-settings|document-templates|document-clauses)(?:\/|$)/.test(pathname)) return "documentSettings";
  return "other";
}

export function effectiveUiLocale(preferred: UiLocale, pathname: string, coverage: ModuleCoverage = englishCoverage): UiLocale {
  return preferred === "en" && coverage[uiModule(pathname)] ? "en" : "th";
}

export function localeCookie(locale: UiLocale, secure: boolean): string {
  return `${UI_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function cookieUiLocale(cookie: string): UiLocale | null {
  const value = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${UI_LOCALE_COOKIE}=`))?.split("=")[1];
  return parseUiLocale(value);
}

export function uiDate(value: string | null | undefined, locale: UiLocale, withTime = false): string {
  if (!value) return "-";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+07:00`) : new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  }).format(date);
}
