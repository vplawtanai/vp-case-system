import type { PayableComponent } from "../payables/shared";
import type { Location } from "../treasury/shared";
import { payoutMath, type Payee, type Payout } from "./shared";

export const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function validPayoutDate(value: string, today = bangkokToday()) {
 const parsed = new Date(`${value}T00:00:00Z`);
 return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= today;
}

// Presentation of the existing 051 guards. Recipient readiness is separate from choice completeness.
export function payoutReviewState(payee: Payee | undefined, account: Location | undefined, picked: PayableComponent[], rates: Record<string, string>, paidOn: string, status?: Payout["status"], today = bangkokToday()) {
 const math = payoutMath(picked, rates);
 const payeeReady = !!payee?.is_active;
 const rightsReady = picked.length > 0 && picked.every(row => row.status === "open" && row.recipient_id === payee?.id);
 const dateReady = validPayoutDate(paidOn, today);
 const accountSelected = !!account?.is_active;
 const bankRequired = account?.kind === "bank";
 const taxRequired = math.valid && math.wht > 0;
 const recipientIssues: string[] = [];
 if (payee && !payeeReady) recipientIssues.push("inactive");
 if (payee && bankRequired && !payee.destination) recipientIssues.push("bankMissing");
 if (payee && taxRequired && !payee.tax_id) recipientIssues.push("taxMissing");
 const openingReady = !!account && account.system_balance != null && !!account.opening_as_of;
 const afterCutoff = dateReady && openingReady && Date.parse(`${paidOn}T23:59:59.999+07:00`) > Date.parse(account!.opening_as_of!);
 const blockers = [
  ...(!payee ? ["choosePayee"] : []), ...(!rightsReady ? ["chooseRights"] : []),
  ...(!math.valid ? ["chooseTreatments"] : []), ...(!accountSelected ? ["chooseAccount"] : []),
  ...(!dateReady ? ["dateInvalid"] : []), ...recipientIssues,
  ...(account && !openingReady ? ["unknown"] : []),
  ...(account && openingReady && dateReady && !afterCutoff ? ["cutoff"] : []),
 ];
 const step1 = payeeReady && rightsReady, step2 = step1 && math.valid && accountSelected && dateReady;
 const confirmed = status === "confirmed";
 return { math, payeeReady, rightsReady, dateReady, accountSelected, bankRequired, taxRequired, recipientIssues, openingReady, afterCutoff, blockers,
  activeStep: confirmed ? 3 : step2 ? 2 : step1 ? 1 : 0,
  completed: [confirmed || step1, confirmed || step2, confirmed, confirmed],
 };
}

export function payoutComponentPreview(row: PayableComponent, rates: Record<string, string>, frozenPayout?: Payout) {
 if (frozenPayout && frozenPayout.status !== "draft") {
  const choice = frozenPayout.choices_json.find(c => c.entitlement_id === row.id);
  const gross = choice?.gross ?? row.gross_amount, wht = choice?.wht;
  return { gross, wht: wht ?? null, net: wht == null ? null : gross - wht };
 }
 const math = payoutMath([row], rates);
 return { gross: math.gross, wht: math.valid ? math.wht : null, net: math.valid ? math.net : null };
}
