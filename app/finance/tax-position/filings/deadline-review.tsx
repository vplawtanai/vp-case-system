"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useI18n } from "../../../../lib/i18n/provider";
import { Callout, Disclosure, FieldGroup, ReadOnlyGrid } from "../../../components/ui/patterns";
import type { FilingType } from "./shared";
import styles from "./filings.module.css";
export type DeadlineEvidence = { schema_version: 1; period_month: string; filing_type: FilingType; channel: "online" | "paper"; status: "calculated" | "review_required" | "admin_override"; due_date: string | null; rule: unknown };
export type DeadlineSelection = { channel: "online" | "paper"; expected: DeadlineEvidence; override: { due_date: string; reason: string; reference: string } | null };
export function DeadlineReview({ month, type, isAdmin, onChange }: { month: string; type: FilingType; isAdmin: boolean; onChange: (value: DeadlineSelection | null) => void }) {
 const { t, date } = useI18n(), tr = (k: string) => t(`taxFiling.${k}`);
 const [channel, setChannel] = useState<"online" | "paper">("online"), [result, setResult] = useState<DeadlineEvidence | null>(null);
 const [override, setOverride] = useState(false), [due, setDue] = useState(""), [reason, setReason] = useState(""), [reference, setReference] = useState("");
 useEffect(() => {
  let active = true;
  async function load() {
   try {
    const { data, error } = await supabase.rpc("get_finance_tax_deadline", { p_month: month, p_type: type, p_channel: channel });
    if (active) setResult(!error && data?.schema_version === 1 && data?.filing_type === type && data?.channel === channel && data?.period_month === month ? data : null);
   } catch { if (active) setResult(null); }
  }
  void load();
  return () => { active = false; };
 }, [month, type, channel]);
 useEffect(() => {
  onChange(result && result.channel === channel ? { channel, expected: result, override: isAdmin && override ? { due_date: due, reason, reference } : null } : null);
 }, [result, channel, due, reason, reference, override, isAdmin, onChange]);
 const current = result?.channel === channel ? result : null;
 return <div className={styles.deadlineReview} onInvalidCapture={e => (e.target as HTMLElement).closest("details")?.setAttribute("open", "")}>
  <FieldGroup id="filing-channel" label={tr("channel")}><select value={channel} onChange={e => { setChannel(e.target.value as "online" | "paper"); onChange(null); }}>{["online", "paper"].map(c => <option key={c} value={c}>{tr(c)}</option>)}</select></FieldGroup>
  <ReadOnlyGrid items={[{ key: "due", label: tr("due"), value: current?.due_date ? date(current.due_date) : tr("ruleReviewRequired") }]} />
  {current?.status === "calculated" ? <p className={styles.muted}>{tr("calculatedDue")}</p> : null}<p className={styles.muted}>{tr("deadlineIndependent")}</p>
  {isAdmin ? <Disclosure title={tr("override")}><label className={styles.check}><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} /><span>{tr("override")}</span></label>
   {override ? <><Callout tone="warning">{tr("deadlineIndependent")}</Callout><FieldGroup id="deadline-override-date" label={tr("due")}><input type="date" required value={due} onChange={e => setDue(e.target.value)} /></FieldGroup>
    <FieldGroup id="deadline-override-reason" label={tr("overrideReason")}><input required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></FieldGroup>
    <FieldGroup id="deadline-override-reference" label={tr("overrideReference")}><input required maxLength={1000} value={reference} onChange={e => setReference(e.target.value)} /></FieldGroup></> : null}
  </Disclosure> : null}
 </div>;
}
