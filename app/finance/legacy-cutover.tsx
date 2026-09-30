"use client";
import { useI18n } from "../../lib/i18n/provider";
import { Callout } from "../components/ui/patterns";

// Release only AFTER Human Apply + verification of Migration 080.
// Presentation only; the existing 079 triggers enforce the activated DB freeze.
export function useLegacyReadOnly() {
 return true;
}

export function LegacyCutoverNotice({ readOnly }: { readOnly: boolean }) {
 const { locale } = useI18n();
 if (!readOnly) return null;
 return <Callout tone="info" role="status">{locale === "th"
  ? "ระบบเดิม — อ่านอย่างเดียว ใช้ดูประวัติ บันทึกรายการใหม่ในระบบการเงินใหม่"
  : "Legacy — Read only. History remains available. Record all new transactions in New Finance."}</Callout>;
}
