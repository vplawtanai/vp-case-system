"use client";
import { FieldGroup } from "../components/ui/patterns";
import { useI18n } from "../../lib/i18n/provider";
import { workflowTimestamp, type QueueOrder, type WorkflowTime } from "./workflow-time";
import css from "./expenses/expenses.module.css";

export function WorkflowDate({ value }: { value: WorkflowTime }) {
 const { t, date } = useI18n(), at = workflowTimestamp(value.at);
 return <span data-workflow-event={value.event}><span>{t(`expenses.${value.event}`)}: </span>{at ? <time dateTime={at}>{date(at, true)}</time> : t("expenses.queueTimeUnknown")}</span>;
}

export function QueueSort({ id, value, onChange, newest = "newestQueue" }: { id: string; value: QueueOrder; onChange: (value: QueueOrder) => void; newest?: "newestQueue" | "newestSubmitted" | "newestReady" }) {
 const { t } = useI18n();
 return <FieldGroup id={id} className={css.queueSort} label={t("expenses.queueOrder")}><select value={value} onChange={e => onChange(e.target.value as QueueOrder)}><option value="newest">{t(`expenses.${newest}`)}</option><option value="oldest">{t("expenses.oldestWaiting")}</option></select></FieldGroup>;
}
