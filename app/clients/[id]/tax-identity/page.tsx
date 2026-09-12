"use client";
import { useParams } from "next/navigation";
import AuthGuard from "../../../components/AuthGuard";
import AppTopNav from "../../../components/AppTopNav";
import { useI18n } from "../../../../lib/i18n/provider";
import { CustomerTaxIdentityEditor } from "../../CustomerTaxIdentityEditor";

export default function CustomerTaxIdentityPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  return <AuthGuard><AppTopNav title={t("client.tax.title")} activePage="clients" /><main><CustomerTaxIdentityEditor key={id} clientId={id} /></main></AuthGuard>;
}
