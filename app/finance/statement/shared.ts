"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
export type StatementAccount = { kind: "bank" | "cash"; account_id: string; bank_account_id: string | null; cash_location_id: string | null; name_th: string; name_en: string; bank_name: string | null; account_number: string | null; is_active: boolean };
export type StatementAccounts = { accounts: StatementAccount[]; can_transfer: boolean; can_manage_openings: boolean };
export function useStatementAccounts(enabled = true) {
 const [data, setData] = useState<StatementAccounts | null>(null), [failed, setFailed] = useState(false);
 useEffect(() => { if (!enabled) return; let live = true;
  void supabase.rpc("get_finance_statement_accounts").then(r => { if (live) { if (r.error || !Array.isArray(r.data?.accounts)) setFailed(true); else setData(r.data); } }, () => { if (live) setFailed(true); });
  return () => { live = false; };
 }, [enabled]);
 return { data, failed };
}
export const accountHref = (a: StatementAccount) => `/finance/statement/account/${a.kind}/${a.account_id}`;
export const accountName = (a: StatementAccount, locale: string) => locale === "th" ? a.name_th : a.name_en;
export const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const monthRange = () => { const today = bangkokToday(); return { from: `${today.slice(0, 7)}-01`, to: today }; };
