"use client";
import { useParams } from "next/navigation";
import { QuotationGuard } from "../../../../quotations/shared";
import { useI18n } from "../../../../../../lib/i18n/provider";
import { Callout } from "../../../../../components/ui/patterns";
import { useStatementAccounts } from "../../../shared";
import { UnifiedStatement } from "../../../workspace";
export default function AccountStatementPage() { return <QuotationGuard canAccess={a => a.permissions.canViewFinanceCashTransactions}>{() => <AccountStatement/>}</QuotationGuard>; }
function AccountStatement() {
 const { kind, id } = useParams<{ kind: string; id: string }>(), { data, failed } = useStatementAccounts(), { t } = useI18n();
 const account = data?.accounts.find(a => a.kind === kind && a.account_id === id);
 if (failed || (data && !account)) return <Callout tone="negative">{t("statement.failure")}</Callout>;
 return account ? <UnifiedStatement key={`${kind}:${id}`} account={account}/> : <p role="status">{t("common.state.loading")}</p>;
}
