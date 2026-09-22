"use client";
import { useI18n } from "../../../lib/i18n/provider";
import type { ClaimCategory } from "./claim-categories";
import { SearchableCombobox } from "./searchable-combobox";
export function ClaimCategoryCombobox({ id = "claim-category", ...props }: { id?: string; value: string; options: ClaimCategory[]; disabled: boolean; onChange: (value: string) => void; "aria-describedby"?: string }) {
 const { t } = useI18n();
 return <SearchableCombobox {...props} id={id} options={props.options.map(c => ({ ...c, group: c.value === "Other" ? undefined : c.group, alwaysVisible: c.value === "Other" }))} label={t("expenses.category")} placeholder={t("expenses.claimCategorySearch")} requiredMessage={t("expenses.claimCategorySelectRequired")} />;
}
