"use client";
import { useEffect, useRef, useState } from "react";
import { Link2, ShieldCheck } from "lucide-react";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import type { ExpenseAccess, ExpenseAccount, ExpenseLookups } from "./shared";
import type { ExpenseRun } from "./forms";
import css from "./expenses.module.css";
type Authority = { id: string; user_id: string; bank_account_id: string | null; cash_location_id: string | null; version: number; view_balance: boolean; view_movements: boolean; record_outflow: boolean; confirm_outflow: boolean };
const rightKeys = ["view_balance", "view_movements", "record_outflow", "confirm_outflow"] as const;
type Rights = Pick<Authority, typeof rightKeys[number]>;
const emptyRights: Rights = { view_balance: false, view_movements: false, record_outflow: false, confirm_outflow: false };
const rightsOf = (row?: Authority): Rights => Object.fromEntries(rightKeys.map(key => [key, row?.[key] ?? false])) as Rights;
const sameRights = (a: Rights, b: Rights) => rightKeys.every(key => a[key] === b[key]);
const authorityFor = (rows: Authority[], user: string, account: string) => rows.find(row => row.user_id === user && (row.bank_account_id || row.cash_location_id) === account);
async function readAuthorities(): Promise<Authority[]> {
 const { data, error } = await supabase.rpc("get_finance_treasury_authorities");
 if (error) throw error;
 if (!Array.isArray(data) || !data.every(row => row && typeof row.id === "string" && typeof row.user_id === "string" && Number.isInteger(row.version) && row.version > 0 && rightKeys.every(key => typeof row[key] === "boolean"))) throw new Error("AUTHORITY_READ_INVALID");
 return data;
}
export function ExpenseAdminTools({ access, accounts, lookups, run, busy, fixture, onBridge, showAuthorities = true, showBridge = true }: { access: ExpenseAccess; accounts: ExpenseAccount[]; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean; fixture: boolean; onBridge: (id: string) => void; showAuthorities?: boolean; showBridge?: boolean }) {
 const { t } = useI18n(), [legacy, setLegacy] = useState(""), [reason, setReason] = useState(""), [ack, setAck] = useState(false), [id] = useState(() => crypto.randomUUID());
 const [user, setUser] = useState(""), [account, setAccount] = useState(""), [grantReason, setGrantReason] = useState(""), [authorities, setAuthorities] = useState<Authority[] | null>(null);
 const [rights, setRights] = useState<Rights>(emptyRights), [pending, setPending] = useState(false), [ready, setReady] = useState(false);
 const [feedback, setFeedback] = useState<{ key: string; tone: "success" | "warning" | "negative" | "info" } | null>(null);
 // The lock covers BOTH mutation and readback; React's busy render alone cannot serialize submits.
 const lock = useRef(false), latest = useRef<Authority[] | null>(null);
 const selectionKey = `vp.account-authority.selection.${access.user_id}`;
 function accept(rows: Authority[], selectedUser = user, selectedAccount = account) {
  latest.current = rows; setAuthorities(rows); setReady(true);
  setRights(rightsOf(authorityFor(rows, selectedUser, selectedAccount)));
 }
 useEffect(() => {
  if (fixture || !access.is_admin || !showAuthorities) return;
  let live = true;
  void readAuthorities().then(rows => {
   if (!live) return;
   latest.current = rows; setAuthorities(rows); setReady(true);
   // Remember only the selection per Admin/tab. Rights and version always come from the RPC.
   try {
    const saved = JSON.parse(sessionStorage.getItem(selectionKey) || "null");
    if (saved && lookups.people.some(p => p.id === saved.user) && accounts.some(a => a.id === saved.account)) {
     setUser(saved.user); setAccount(saved.account); setRights(rightsOf(authorityFor(rows, saved.user, saved.account)));
    }
   } catch { /* Storage is optional; unavailable storage never blocks the form. */ }
  }).catch(() => { if (live) { setReady(false); setFeedback({ key: "authorityReadFailed", tone: "warning" }); } });
  return () => { live = false; };
 }, [access.is_admin, fixture, showAuthorities, selectionKey, accounts, lookups.people]);
 function choose(nextUser: string, nextAccount: string) {
  if (lock.current || busy) return;
  setUser(nextUser); setAccount(nextAccount); setFeedback(null);
  setRights(rightsOf(authorityFor(latest.current || [], nextUser, nextAccount)));
  try { sessionStorage.setItem(selectionKey, JSON.stringify({ user: nextUser, account: nextAccount })); } catch { /* Optional selection memory. */ }
 }
 async function reload() {
  if (lock.current || busy || fixture || !access.is_admin) return;
  lock.current = true; setPending(true);
  try { accept(await readAuthorities()); setFeedback({ key: "authorityLoaded", tone: "info" }); }
  catch { setReady(false); setFeedback({ key: "authorityReadFailed", tone: "warning" }); }
  finally { lock.current = false; setPending(false); }
 }
 async function saveAuthority(e: React.FormEvent) {
  e.preventDefault();
  if (lock.current || busy || fixture || !access.is_admin || !ready || !latest.current) return;
  const selected = accounts.find(a => a.id === account), existing = authorityFor(latest.current, user, account);
  if (!selected || !lookups.people.some(p => p.id === user) || !grantReason.trim()) { setFeedback({ key: "required", tone: "negative" }); return; }
  if (sameRights(rights, rightsOf(existing))) { setFeedback({ key: "authorityNoChanges", tone: "info" }); return; }
  lock.current = true; setPending(true); setFeedback(null);
  let saved = false;
  try {
   const value = await run("set_finance_treasury_authority", { p_user: user, p_bank: selected.bank_account_id || null, p_cash: selected.cash_location_id || null, p_rights: rights, p_version: existing?.version ?? null, p_reason: grantReason });
   if (typeof value !== "string" || !value) throw new Error("AUTHORITY_RESULT_UNKNOWN");
   saved = true; setFeedback({ key: "authoritySaved", tone: "success" });
   const rows = await readAuthorities(), current = authorityFor(rows, user, account);
   if (!current || current.id !== value || current.version < (existing?.version ?? 0) + 1) throw new Error("AUTHORITY_READ_INVALID");
   accept(rows); setGrantReason("");
   setFeedback(sameRights(rights, rightsOf(current)) ? { key: "authoritySaved", tone: "success" } : { key: "authorityChanged", tone: "warning" });
  } catch (error) {
   // A readback/network failure must never turn a committed write into a claimed save failure.
   setReady(false);
   const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
   setFeedback(saved ? { key: "authoritySavedReadFailed", tone: "warning" }
    : /EXPENSE_STALE/.test(message) ? { key: "stale", tone: "warning" }
    : /EXPENSE_ADMIN_REQUIRED|permission denied/.test(message) ? { key: "denied", tone: "negative" }
    : /EXPENSE_AUTHORITY_INVALID/.test(message) ? { key: "authorityInvalid", tone: "negative" }
    : { key: "failed", tone: "warning" });
  } finally { lock.current = false; setPending(false); }
 }
 const blocked = busy || pending || !ready;
 const selectedAuthority = authorityFor(authorities || [], user, account);
 const unchanged = sameRights(rights, rightsOf(selectedAuthority));
 if (!access.is_admin) return null;
 return <details className={`${css.disclosure} ${css.adminTools}`}><summary>{t("expenses.adminTools")}</summary>
  {showBridge ? <details className={css.disclosure}><summary><Link2 size={16} aria-hidden="true" /> {t("expenses.bridge")}</summary><form className={css.form} onSubmit={async e => { e.preventDefault(); const value = await run("bridge_finance_legacy_expense", { p_legacy_id: legacy.trim(), p_id: id, p_reason: reason, p_acknowledged: ack }); if (value) onBridge(value); }}><div className={css.formGrid}><FieldGroup id="legacy-id" label={t("expenses.legacyId")}><input required value={legacy} disabled={busy} onChange={e => setLegacy(e.target.value)} /></FieldGroup><FieldGroup id="legacy-reason" label={t("expenses.reason")}><input required maxLength={2000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></FieldGroup></div><label className={css.check}><input type="checkbox" required checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} /><span>{t("expenses.bridgeAck")}</span></label><div className={css.footer}><button type="submit" className={ui.secondary} disabled={busy || !ack}>{t("expenses.bridge")}</button></div></form></details> : null}
  {showAuthorities ? <details className={css.disclosure}><summary><ShieldCheck size={16} aria-hidden="true" /> {t("expenses.authorities")}</summary><p className={css.muted}>{t("expenses.authorityHelp")}</p>
   {feedback && <Callout tone={feedback.tone} role={feedback.tone === "negative" ? "alert" : "status"}>{t(`expenses.${feedback.key}`)}</Callout>}
   {!ready && feedback && <button type="button" className={ui.secondary} disabled={busy || pending} onClick={() => void reload()}>{t("expenses.authorityReload")}</button>}
   {ready && <p className={css.muted}>{t(!user || !account ? "expenses.authorityChoose" : !unchanged ? "expenses.authorityEditing" : selectedAuthority ? "expenses.authorityLoaded" : "expenses.authorityNotAssigned")}</p>}<form className={css.form} onSubmit={saveAuthority} aria-busy={pending}>
   <div className={css.formGrid}><FieldGroup id="authority-person" label={t("expenses.claimant")}><select required value={user} disabled={blocked} onChange={e => choose(e.target.value, account)}><option value="">{t("expenses.choose")}</option>{lookups.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FieldGroup><FieldGroup id="authority-account" label={t("expenses.account")}><select required value={account} disabled={blocked} onChange={e => choose(user, e.target.value)}><option value="">{t("expenses.choose")}</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></FieldGroup></div>
   <div className={css.checks}>{(Object.keys(rights) as (keyof typeof rights)[]).map(key => <label className={css.check} key={key}><input type="checkbox" checked={rights[key]} disabled={blocked || !user || !account} onChange={e => { setFeedback(null); setRights(r => ({ ...r, [key]: e.target.checked, ...(key === "confirm_outflow" && e.target.checked ? { record_outflow: true } : key === "record_outflow" && !e.target.checked ? { confirm_outflow: false } : {}) })); }} /><span>{t(`expenses.${key}`)}</span></label>)}</div>
   <FieldGroup id="authority-reason" label={t("expenses.reason")}><input required maxLength={2000} value={grantReason} disabled={blocked || !user || !account} onChange={e => setGrantReason(e.target.value)} /></FieldGroup><div className={css.footer}><button type="submit" className={ui.secondary} disabled={blocked || !user || !account || unchanged || !grantReason.trim()}>{t(pending ? "expenses.authoritySaving" : "expenses.grant")}</button></div>
  </form></details> : null}
 </details>;
}
