"use client";
import { useEffect, useState } from "react";
import { useI18n } from "../../lib/i18n/provider";
import { Callout } from "../components/ui/patterns";

export const legacyCutoverAt = Date.parse("2026-10-01T00:00:00+07:00");
export const legacyIsReadOnly = (now = Date.now()) => now >= legacyCutoverAt;

// Presentation only. Migration 079 is the authoritative database write guard.
export function useLegacyReadOnly() {
 const [readOnly, setReadOnly] = useState(true);
 useEffect(() => {
  let timer: ReturnType<typeof setTimeout>;
  const refresh = () => {
   setReadOnly(legacyIsReadOnly());
   timer = setTimeout(refresh, Math.max(1, Math.min(30_000, legacyCutoverAt - Date.now())));
   if (legacyIsReadOnly()) clearTimeout(timer);
  };
  refresh();
  return () => clearTimeout(timer);
 }, []);
 return readOnly;
}

export function LegacyCutoverNotice({ readOnly }: { readOnly: boolean }) {
 const { locale } = useI18n();
 return <Callout tone="info" role="status">{locale === "th"
  ? readOnly ? "ระบบเดิม — อ่านอย่างเดียว ใช้ดูประวัติ เงินที่รับหรือจ่ายตั้งแต่ 1 ต.ค. 2569 ให้บันทึกในระบบการเงินใหม่" : "ระบบเดิมจะอ่านอย่างเดียวตั้งแต่ 1 ต.ค. 2569 เวลา 00:00 น. ตามเวลาประเทศไทย ประวัติยังเปิดดูได้ตามสิทธิ์เดิม"
  : readOnly ? "Legacy — Read only. History remains available. Record actual cash received or paid from 1 October 2026 in New Finance." : "Legacy becomes read only on 1 October 2026 at 00:00 Asia/Bangkok. Existing history permissions remain unchanged."}</Callout>;
}
