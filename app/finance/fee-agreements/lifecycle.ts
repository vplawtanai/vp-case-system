import { translate } from "../../../lib/i18n/catalog";
import { type UiLocale } from "../../../lib/i18n/core";

export type FeeAgreementLifecycleTarget = "under_review" | "sent" | "signed" | "completed" | "cancelled";

const statusLabels: Record<string, string> = {
  draft: "finance.feeAgreement.status.draft",
  under_review: "finance.feeAgreement.status.under_review",
  sent: "finance.feeAgreement.status.sent",
  signed: "finance.feeAgreement.status.signed",
  completed: "finance.feeAgreement.status.completed",
  engagement_confirmed: "finance.feeAgreement.status.engagement_confirmed",
  cancelled: "finance.feeAgreement.status.cancelled",
  active: "finance.feeAgreement.status.active",
};

const statusDescriptions: Record<string, string> = {
  draft: "finance.feeAgreement.description.draft",
  under_review: "finance.feeAgreement.description.under_review",
  sent: "finance.feeAgreement.description.sent",
  signed: "finance.feeAgreement.description.signed",
  completed: "finance.feeAgreement.description.completed",
  engagement_confirmed: "finance.feeAgreement.description.engagement_confirmed",
  cancelled: "finance.feeAgreement.description.cancelled",
  active: "finance.feeAgreement.description.active",
};

const actionDescriptions: Record<string, string> = {
  under_review: "finance.feeAgreement.actionDescription.under_review",
  sent: "finance.feeAgreement.actionDescription.sent",
  signed: "finance.feeAgreement.actionDescription.signed",
  completed: "finance.feeAgreement.actionDescription.completed",
  cancelled: "finance.feeAgreement.actionDescription.cancelled",
};

const actionLabels: Record<string, string> = {
  under_review: "finance.feeAgreement.action.under_review",
  sent: "finance.feeAgreement.action.sent",
  signed: "finance.feeAgreement.action.signed",
  completed: "finance.feeAgreement.action.completed",
  cancelled: "finance.feeAgreement.action.cancelled",
};

const confirmations: Record<string, string> = {
  under_review: "finance.feeAgreement.confirmation.under_review",
  sent: "finance.feeAgreement.confirmation.sent",
  signed: "finance.feeAgreement.confirmation.signed",
  completed: "finance.feeAgreement.confirmation.completed",
  cancelled: "finance.feeAgreement.confirmation.cancelled",
};

const versionEventLabels: Record<string, string> = {
  created: "finance.feeAgreement.event.created",
  draft_saved: "finance.feeAgreement.event.draft_saved",
  under_review_saved: "finance.feeAgreement.event.under_review_saved",
  draft_metadata_saved: "finance.feeAgreement.event.draft_metadata_saved",
  under_review_metadata_saved: "finance.feeAgreement.event.under_review_metadata_saved",
  draft_legal_terms_saved: "finance.feeAgreement.event.draft_legal_terms_saved",
  under_review_legal_terms_saved: "finance.feeAgreement.event.under_review_legal_terms_saved",
  under_review: "finance.feeAgreement.event.under_review",
  sent: "finance.feeAgreement.event.sent",
  signed: "finance.feeAgreement.event.signed",
  completed: "finance.feeAgreement.event.completed",
  cancelled: "finance.feeAgreement.event.cancelled",
};

export function feeAgreementStatusLabel(status: string, locale: UiLocale = "th") {
  return statusLabels[status] ? translate(locale, statusLabels[status]) : status;
}

export function feeAgreementStatusDescription(status: string, locale: UiLocale = "th") {
  return translate(locale, statusDescriptions[status] || "finance.feeAgreement.description.unknown");
}

export function feeAgreementActionDescription(status: FeeAgreementLifecycleTarget, locale: UiLocale = "th") {
  return translate(locale, actionDescriptions[status]);
}

export function feeAgreementLifecycleActionLabel(status: FeeAgreementLifecycleTarget, locale: UiLocale = "th") {
  return translate(locale, actionLabels[status]);
}

export function feeAgreementLifecycleConfirmation(status: FeeAgreementLifecycleTarget, locale: UiLocale = "th") {
  return translate(locale, confirmations[status]);
}

export function feeAgreementLifecycleSuccess(status: FeeAgreementLifecycleTarget, locale: UiLocale = "th") {
  if (status === "sent") return translate(locale, "finance.feeAgreement.success.sent");
  if (status === "signed") return translate(locale, "finance.feeAgreement.success.signed");
  if (status === "completed") return translate(locale, "finance.feeAgreement.success.completed");
  return translate(locale, "finance.feeAgreement.success.updated", { status: feeAgreementStatusLabel(status, locale) });
}

export function feeAgreementVersionEventLabel(event: string, locale: UiLocale = "th") {
  return versionEventLabels[event] ? translate(locale, versionEventLabels[event]) : event.replaceAll("_", " ");
}
