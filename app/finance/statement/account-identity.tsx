import Image from "next/image";
import { Landmark, Wallet } from "lucide-react";
import type { StatementAccount } from "./shared";
import css from "./overview.module.css";
export function bankIdentity(a: StatementAccount): "bay" | "kbank" | "ktb" | null {
 if (a.kind !== "bank") return null;
 const name = [a.name_th, a.name_en, a.bank_name].join(" ");
 if (/\bBAY\b|ayudhya|krungsri|กรุงศรี/i.test(name)) return "bay";
 if (/\bKBANK\b|kasikorn|กสิกร/i.test(name)) return "kbank";
 if (/\bKTB\b|krung\s*thai|กรุงไทย/i.test(name)) return "ktb";
 return null;
}
export function AccountIdentity({ account }: { account: StatementAccount }) {
 const bank = bankIdentity(account);
 return <span className={css.accountIcon} data-bank={bank || account.kind} aria-hidden="true">{bank ? <Image src={`/banks/${bank}.svg`} width={30} height={30} alt=""/> : account.kind === "cash" ? <Wallet size={25}/> : <Landmark size={25}/>}</span>;
}
export function maskedAccount(a: StatementAccount) {
 const digits = a.account_number?.replace(/\D/g, "");
 return digits ? `•••• ${digits.slice(-4)}` : a.bank_name;
}
