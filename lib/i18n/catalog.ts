import { commonMessages } from "./messages/common";
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

export const messages: MessageCatalog = { ...commonMessages, ...customerTaxMessages, ...documentDecisionMessages, ...taxInvoiceMessages, ...combinedDocumentMessages, ...receiptMessages, ...paymentMessages, ...invoiceMessages, ...billableChargeMessages, ...feeAgreementMessages, ...billingPlanMessages, ...quotationsMessages, ...cashTransactionsMessages, ...legacyFinanceMessages, ...compensationMessages, ...documentSettingsMessages };

export function translate(locale: UiLocale, key: string, parameters?: MessageParameters): string {
  return formatMessage(messages, locale, key, parameters);
}

export function resolveUiMessage(locale: UiLocale, message: UiMessage | string | null | undefined): string {
  return message == null ? "" : typeof message === "string" ? message : translate(locale, message.key, message.parameters);
}
