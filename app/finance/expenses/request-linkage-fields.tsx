"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { FieldGroup } from "../../components/ui/patterns";
import { SearchableCombobox, type SearchOption } from "./searchable-combobox";
import type { ExpenseLookups } from "./shared";
import css from "./purchase-request.module.css";

export function RequestLinkageFields({ prefix, lookups, clientId, work, disabled, onClientChange, onWorkChange }: { prefix: string; lookups: ExpenseLookups; clientId: string; work: string; disabled: boolean; onClientChange: (value: string) => void; onWorkChange: (value: string) => void }) {
 const { t } = useI18n();
 const none: SearchOption = { value: "", label: { th: "ไม่ระบุ", en: "Not specified" }, alwaysVisible: true };
 const clients: SearchOption[] = [none, ...lookups.clients.map(c => ({ value: c.id, label: { th: c.name, en: c.name } }))];
 const works: SearchOption[] = [none,
  ...lookups.cases.filter(c => c.client_id && (!clientId || c.client_id === clientId)).map(c => ({ value: `case:${c.id}`, label: { th: `${c.file_no} · ${c.title} — คดี`, en: `${c.file_no} · ${c.title} — Case` } })),
  ...lookups.matters.filter(m => m.client_id && (!clientId || m.client_id === clientId)).map(m => ({ value: `advisory:${m.id}`, label: { th: `${m.matter_no} · ${m.title} — ที่ปรึกษา`, en: `${m.matter_no} · ${m.title} — Advisory` } })),
 ];
 return <div id={`${prefix}-context`} className={css.fields}>
  <FieldGroup id={`${prefix}-client`} label={t("expenses.client")}><SearchableCombobox id={`${prefix}-client`} value={clientId} options={clients} disabled={disabled} onChange={onClientChange} label={t("expenses.client")} placeholder={t("expenses.claimCategorySearch")} /></FieldGroup>
  <FieldGroup id={`${prefix}-work`} label={t("expenses.purchaseWork")}><SearchableCombobox id={`${prefix}-work`} value={work} options={works} disabled={disabled} onChange={onWorkChange} label={t("expenses.purchaseWork")} placeholder={t("expenses.claimCategorySearch")} /></FieldGroup>
 </div>;
}
