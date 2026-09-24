import { taxHomeMessages } from "./messages/tax-home";
import { revenueDistributionMessages } from "./messages/revenue-distribution";
import { commonMessages } from "./messages/common";
import { expenseMessages } from "./messages/expenses";
import { payoutMessages } from "./messages/payouts";
import { incomingMoneyMessages } from "./messages/incoming-money";
import { directMoneyMessages } from "./messages/direct-money";
import { payableMessages } from "./messages/payables";
import { treasuryMessages } from "./messages/treasury";
import { taxPositionMessages } from "./messages/tax-position";
import { taxFilingMessages } from "./messages/tax-filings";
import { moneyAllocationMessages } from "./messages/money-allocation";
import { vpDistributionMessages } from "./messages/vp-distribution";
import { taxCorrectionMessages } from "./messages/tax-corrections";
import { customerTaxMessages } from "./messages/customer-tax";
import { documentDecisionMessages } from "./messages/document-decision";
import { taxInvoiceMessages } from "./messages/tax-invoices";
import { combinedDocumentMessages } from "./messages/combined-documents";
import { receiptMessages } from "./messages/receipts";
import { paymentMessages } from "./messages/payments";
import { invoiceMessages } from "./messages/invoices";
import { billableChargeMessages } from "./messages/billable-charges";
import { feeAgreementMessages } from "./messages/fee-agreements";
import { billingPlanMessages } from "./messages/billing-plans";
import { quotationsMessages } from "./messages/quotations";
import { cashTransactionsMessages } from "./messages/cash-transactions";
import { legacyFinanceMessages } from "./messages/legacy-finance";
import { compensationMessages } from "./messages/compensation";
import { documentSettingsMessages } from "./messages/document-settings";
import { formatMessage, type MessageCatalog, type MessageParameters, type UiLocale, type UiMessage } from "./core";

export const messages: MessageCatalog = { ...taxHomeMessages, ...taxFilingMessages, ...payoutMessages, ...taxPositionMessages, ...treasuryMessages, ...payableMessages, ...incomingMoneyMessages, ...directMoneyMessages, ...vpDistributionMessages, ...moneyAllocationMessages, ...taxCorrectionMessages, ...commonMessages, ...customerTaxMessages, ...documentDecisionMessages, ...taxInvoiceMessages, ...combinedDocumentMessages, ...receiptMessages, ...paymentMessages, ...invoiceMessages, ...billableChargeMessages, ...feeAgreementMessages, ...billingPlanMessages, ...quotationsMessages, ...cashTransactionsMessages, ...legacyFinanceMessages, ...compensationMessages, ...documentSettingsMessages };

Object.assign(messages, expenseMessages);
Object.assign(messages, revenueDistributionMessages);

export function translate(locale: UiLocale, key: string, parameters?: MessageParameters): string {
  return formatMessage(messages, locale, key, parameters);
}

export function resolveUiMessage(locale: UiLocale, message: UiMessage | string | null | undefined): string {
  return message == null ? "" : typeof message === "string" ? message : translate(locale, message.key, message.parameters);
}
