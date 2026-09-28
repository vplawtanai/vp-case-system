"use client";
import { useCallback, useEffect, useState } from "react";
import { QuotationGuard } from "../../quotations/shared";
import { ExpenseAdminTools } from "../admin-tools";
import { emptyLookups, type ExpenseAccess, type ExpenseAccount, type ExpenseLookups } from "../shared";
import { supabase } from "../../../../lib/supabase";
import { useI18n } from "../../../../lib/i18n/provider";
import { PageShell, Callout } from "../../../components/ui/patterns";

function Accounts() {
 const { locale } = useI18n(), th = locale === "th";
 const [access, setAccess] = useState<ExpenseAccess | null>(null), [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
 const [lookups, setLookups] = useState<ExpenseLookups>(emptyLookups), [busy, setBusy] = useState(false), [error, setError] = useState(false);
 const load = useCallback(async () => {
  const [a, b, p, users] = await Promise.all([supabase.rpc("get_finance_expense_access"), supabase.rpc("get_finance_expense_accounts"), supabase.rpc("get_finance_expense_parties"), supabase.from("user_profiles").select("id").eq("active", true).eq("finance_operator", true).in("role", ["lawyer", "assistant_lawyer", "staff"])]);
  if (a.error || b.error || p.error || users.error || !a.data?.is_admin || !Array.isArray(b.data) || !Array.isArray(p.data?.people)) { setError(true); return; }
  setAccess(a.data); setAccounts(b.data); setLookups({ ...emptyLookups, ...p.data, people: p.data.people.filter((person: { id: string }) => users.data?.some(user => user.id === person.id)) });
 }, []);
 useEffect(() => { void load(); }, [load]);
 return <PageShell><h1>{th ? "สิทธิ์บัญชีรับผิดชอบ" : "Account custody"}</h1>
  <p>{th ? "เลือกผู้ปฏิบัติงานการเงิน แล้วกำหนดสิทธิ์แต่ละบัญชีแยกกัน" : "Choose a Finance Operator and assign each account right separately."}</p>
  {error && <Callout tone="negative">{th ? "ไม่สามารถดำเนินการได้ กรุณาตรวจสิทธิ์และโหลดใหม่" : "Unable to proceed. Check authority and reload."}</Callout>}
  {access && <ExpenseAdminTools access={access} accounts={accounts} lookups={lookups} busy={busy} fixture={false} showBridge={false} onBridge={() => {}} run={async (name, args) => {
   setBusy(true); setError(false); try { const r = await supabase.rpc(name, args); if (r.error) throw r.error; return r.data; } catch { setError(true); return null; } finally { setBusy(false); }
  }} />}
 </PageShell>;
}
export default function AccountAuthorityPage() {
 return <QuotationGuard canAccess={a => a.permissions.role === "admin"}>{() => <Accounts />}</QuotationGuard>;
}
