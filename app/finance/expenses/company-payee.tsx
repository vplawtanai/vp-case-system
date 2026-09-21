"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PayeeModal } from "../payouts/payee-modal";
import type { Payee } from "../payouts/shared";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { expenseError, type Expense, type ExpenseLookups } from "./shared";
import css from "./expenses.module.css";

export function CompanyPayeeSetup({ row, mode, lookups, disabled, onSaved }: { row: Expense; mode: string; lookups: ExpenseLookups; disabled: boolean; onSaved: (payees: ExpenseLookups["payees"], selected: string) => void }) {
 const { t } = useI18n();
 const [open, setOpen] = useState(false), [saved, setSaved] = useState<string | null>(null), [error, setError] = useState("");
 const person = mode === "reimburse" ? lookups.people.find(p => p.id === row.claimant_id) : null;
 const blocked = mode === "reimburse" ? !person : !!row.supplier_payee_id;
 const internal: Payee | undefined = person ? { id: person.id, profile_id: person.id, kind: "internal", legal_name: person.name, entity_type: "natural_person", tax_id: null, version: null, is_active: true, destination: null } : undefined;
 async function reload(id: string) {
  setSaved(id); setOpen(false); setError("");
  try {
   const result = await supabase.rpc("get_finance_expense_parties");
   if (result.error || !Array.isArray(result.data?.payees) || !result.data.payees.some((p: { id: string }) => p.id === id)) throw result.error || new Error("Payee read-back incomplete");
   onSaved(result.data.payees, id); setSaved(null);
  } catch (error) { setError(expenseError(error)); }
 }
 return <div className={css.form}>
  <p className={css.muted}>{t(blocked ? "expenses.companyPayeeBlocked" : "expenses.companyPayeeSetupHelp")}</p>
  {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}
  {saved ? <button type="button" className={ui.secondary} disabled={disabled} onClick={() => void reload(saved)}>{t("expenses.refresh")}</button> : !blocked ? <button type="button" className={ui.secondary} disabled={disabled} onClick={() => setOpen(true)}><Plus size={16} />{t(mode === "reimburse" ? "expenses.companySetUpPayer" : "expenses.companyAddSupplier")}</button> : null}
  {open ? <PayeeModal payee={internal} onClose={() => setOpen(false)} onSaved={id => void reload(id)} /> : null}
 </div>;
}
