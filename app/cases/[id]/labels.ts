"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { caseTerm } from "../labels";
import labels from "./detail-labels.json";
import type { UiLocale } from "../../../lib/i18n/core";

const catalog: Record<string, { th: string; en: string }> = labels;
// Presentation only. Stored enums, free-text facts and mutation payloads stay unchanged.
export function detailText(value: string | null | undefined, locale: UiLocale): string {
  if (!value) return value || "";
  const entry = catalog[value] || catalog[value.trim()];
  if (entry) return entry[locale];
  const errorPrefix = Object.keys(catalog).find(key => key.endsWith(":\n") && value.startsWith(key));
  if (errorPrefix) return catalog[errorPrefix][locale] + value.slice(errorPrefix.length);
  const ordinal = value.match(/^(โจทก์|จำเลย|ผู้ร้อง|ผู้คัดค้าน)ที่ (\d+)$/);
  if (ordinal) return locale === "th" ? value : `${detailText(ordinal[1], locale)} ${ordinal[2]}`;
  if (locale === "en") {
    if (/^[\d,.]+ บาท(?: \d+ สตางค์)?$/.test(value)) return value.replace("บาท", "baht").replace("สตางค์", "satang");
    if (/^(?:\d+ ชม\. ?)?(?:\d+ นาที)?$/.test(value)) return value.replace("ชม.", "hr").replace("นาที", "min");
  }
  return caseTerm(value, locale);
}
export function useCaseDetailText() {
  const { locale, date } = useI18n();
  return { locale, date, tr: (value: string | null | undefined) => detailText(value, locale) };
}
