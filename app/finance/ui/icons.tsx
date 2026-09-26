import { Search, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ArrowRight, Building2, CalendarClock, Check, CircleCheck, CircleAlert, Clock3, FileCheck2, FilePenLine, FilePlus2, FileStack, FileText, HandCoins, History, Landmark, Link2, Receipt, ReceiptText, RotateCcw, ShieldCheck, Split, Wallet, X, type LucideIcon } from "lucide-react";

// Presentation vocabulary only; never derive a transaction type from its icon.
export const financeIcons = {
  search: Search, quotation: FilePenLine, agreement: FileCheck2, billingPlan: CalendarClock,
  charge: FilePlus2,
  invoice: FileText, payment: ArrowDownLeft, payout: ArrowUpRight,
  receipt: Receipt, taxInvoice: ReceiptText, combined: FileStack,
  directMoney: Wallet, distribution: Split, purchase: Building2,
  reimbursement: HandCoins, payable: CalendarClock, statement: ReceiptText,
  bank: Landmark, cash: Wallet, transfer: ArrowLeftRight, tax: ShieldCheck,
  vat: ReceiptText, wht: FileCheck2, alert: CircleAlert, history: History,
  source: Link2, edit: FilePenLine, confirm: Check, cancel: X,
  reverse: RotateCcw, detail: FileText, review: ShieldCheck, next: ArrowRight,
  success: CircleCheck, pending: Clock3,
} satisfies Record<string, LucideIcon>;
export type FinanceIconName = keyof typeof financeIcons;
export function FinanceIcon({ name, size = 18 }: { name: FinanceIconName; size?: number }) {
  const Icon = financeIcons[name];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
