"use client";
import Link from "next/link";
import { useI18n } from "../../../lib/i18n/provider";
import { accountHref, accountName, useStatementAccounts } from "./shared";
export function StatementAccountNavigation({ enabled, pathname, onNavigate }: { enabled: boolean; pathname: string; onNavigate: ()=>void }) {
 const {t,locale}=useI18n(),{data,failed}=useStatementAccounts(enabled);
 if (!enabled) return null;
 return <>{data?.accounts.filter(a=>a.is_active).map(a=><Link key={`${a.kind}:${a.account_id}`} href={accountHref(a)} onClick={onNavigate} aria-current={pathname===accountHref(a)?"page":undefined}>{accountName(a,locale)}</Link>)}
  {failed||data?.accounts.some(a=>!a.is_active)?<Link href="/finance/statement" onClick={onNavigate}>{t("statement.accounts")}</Link>:null}
  {data?.can_transfer?<Link href="/finance/statement/transfers" onClick={onNavigate} aria-current={pathname==="/finance/statement/transfers"?"page":undefined}>{t("statement.transfer")}</Link>:null}
 </>;
}
